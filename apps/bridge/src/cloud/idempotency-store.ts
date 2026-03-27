import process from "node:process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const IDEMPOTENCY_DEFAULT_TTL_MS = 10 * 60_000;
export const IDEMPOTENCY_DEFAULT_MAX_ENTRIES = 4_096;

export type IdempotencyScope = "cloud.chat.execute" | "cloud.connection.complete";

export type IdempotencyReservation = Readonly<{
  scope: IdempotencyScope;
  identityKey: string;
  fingerprint: string;
}>;

export type IdempotencyReserveDecision =
  | Readonly<{ kind: "new"; reservation: IdempotencyReservation }>
  | Readonly<{ kind: "replay"; response: Readonly<Record<string, unknown>> }>
  | Readonly<{ kind: "conflict"; message: string }>;

export type RequestIdempotencyStoreContract = Readonly<{
  reserve(input: IdempotencyReservation): IdempotencyReserveDecision;
  complete(
    reservation: IdempotencyReservation,
    response: Readonly<Record<string, unknown>>,
  ): void;
  abort(reservation: IdempotencyReservation): void;
}>;

export type RequestIdempotencyStoreOptions = Readonly<{
  now?: () => Date;
  ttlMs?: number;
  maxEntries?: number;
  stateFilePath?: string;
  onPersistenceFailure?: (failure: IdempotencyPersistenceFailure) => void;
}>;

export type IdempotencyPersistenceFailure = Readonly<{
  stateFilePath: string;
  message: string;
  code?: string;
  occurredAt: string;
}>;

type InFlightEntry = Readonly<{
  fingerprint: string;
}>;

type CompletedEntry = Readonly<{
  fingerprint: string;
  response: Readonly<Record<string, unknown>>;
  completedAtMs: number;
}>;

type PersistedEntry = Readonly<{
  scope: IdempotencyScope;
  identityKey: string;
  fingerprint: string;
  completedAtMs: number;
  response: Readonly<Record<string, unknown>>;
}>;

type PersistedIdempotencyState = Readonly<{
  version: 1;
  entries: readonly PersistedEntry[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isScope(value: unknown): value is IdempotencyScope {
  return value === "cloud.chat.execute" || value === "cloud.connection.complete";
}

function normalizeNonEmpty(input: string, field: string): string {
  const normalized = input.trim();
  if (normalized.length === 0) {
    throw new TypeError(`Idempotency field "${field}" must be non-empty.`);
  }
  return normalized;
}

function clonePlainValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => clonePlainValue(entry));
  }
  if (isRecord(value)) {
    const cloned: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      cloned[key] = clonePlainValue(entry);
    }
    return cloned;
  }
  return null;
}

function deepFreezeValue<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreezeValue(entry);
    }
    return Object.freeze(value) as T;
  }
  if (isRecord(value)) {
    for (const entry of Object.values(value)) {
      deepFreezeValue(entry);
    }
    return Object.freeze(value) as T;
  }
  return value;
}

function toFrozenResponsePayload(
  payload: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const cloned = clonePlainValue(payload);
  if (!isRecord(cloned)) {
    return Object.freeze({});
  }
  return deepFreezeValue(cloned);
}

function isPersistedEntry(value: unknown): value is PersistedEntry {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isScope(value["scope"]) &&
    typeof value["identityKey"] === "string" &&
    value["identityKey"].trim().length > 0 &&
    typeof value["fingerprint"] === "string" &&
    value["fingerprint"].trim().length > 0 &&
    isFiniteNumber(value["completedAtMs"]) &&
    isRecord(value["response"])
  );
}

export class IdempotencyStoreError extends Error {
  readonly reasonCode: "request.replay_prone" | "transport.transient_failure";

  constructor(
    message: string,
    reasonCode: "request.replay_prone" | "transport.transient_failure",
    options: Readonly<{ cause?: Error }> = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "IdempotencyStoreError";
    this.reasonCode = reasonCode;
  }
}

export class InMemoryRequestIdempotencyStore
  implements RequestIdempotencyStoreContract {
  readonly #now: () => Date;
  readonly #ttlMs: number;
  readonly #maxEntries: number;
  readonly #stateFilePath: string | undefined;
  readonly #onPersistenceFailure:
    | ((failure: IdempotencyPersistenceFailure) => void)
    | undefined;
  #persistWriteCounter = 0;
  readonly #inFlightByScope = new Map<IdempotencyScope, Map<string, InFlightEntry>>();
  readonly #completedByScope = new Map<IdempotencyScope, Map<string, CompletedEntry>>();

  constructor(options: RequestIdempotencyStoreOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#ttlMs = options.ttlMs ?? IDEMPOTENCY_DEFAULT_TTL_MS;
    this.#maxEntries = options.maxEntries ?? IDEMPOTENCY_DEFAULT_MAX_ENTRIES;
    this.#stateFilePath =
      typeof options.stateFilePath === "string" && options.stateFilePath.trim().length > 0
        ? options.stateFilePath.trim()
        : undefined;
    this.#onPersistenceFailure = options.onPersistenceFailure;

    if (!Number.isFinite(this.#ttlMs) || this.#ttlMs <= 0) {
      throw new RangeError("Idempotency ttlMs must be a positive finite number.");
    }
    if (!Number.isFinite(this.#maxEntries) || this.#maxEntries <= 0) {
      throw new RangeError("Idempotency maxEntries must be a positive finite number.");
    }

    this.#inFlightByScope.set("cloud.chat.execute", new Map());
    this.#inFlightByScope.set("cloud.connection.complete", new Map());
    this.#completedByScope.set("cloud.chat.execute", new Map());
    this.#completedByScope.set("cloud.connection.complete", new Map());

    this.#loadStateFromDisk();
    this.#cleanupExpired(this.#now().getTime(), false);
  }

  reserve(input: IdempotencyReservation): IdempotencyReserveDecision {
    const scope = input.scope;
    const identityKey = normalizeNonEmpty(input.identityKey, "identityKey");
    const fingerprint = normalizeNonEmpty(input.fingerprint, "fingerprint");
    const nowMs = this.#now().getTime();
    this.#cleanupExpired(nowMs, true);

    const inFlightByIdentity = this.#inFlightByScope.get(scope);
    const completedByIdentity = this.#completedByScope.get(scope);
    if (inFlightByIdentity === undefined || completedByIdentity === undefined) {
      throw new IdempotencyStoreError(
        `Unsupported idempotency scope "${scope}".`,
        "transport.transient_failure",
      );
    }

    const inFlight = inFlightByIdentity.get(identityKey);
    if (inFlight !== undefined) {
      if (inFlight.fingerprint === fingerprint) {
        return {
          kind: "conflict",
          message:
            "Duplicate request is already in flight and cannot be safely reissued.",
        };
      }
      return {
        kind: "conflict",
        message:
          "Duplicate request identity was reused with a mismatched payload or binding.",
      };
    }

    const completed = completedByIdentity.get(identityKey);
    if (completed !== undefined) {
      if (completed.fingerprint === fingerprint) {
        return {
          kind: "replay",
          response: completed.response,
        };
      }
      return {
        kind: "conflict",
        message:
          "Duplicate request identity was reused with a mismatched payload or binding.",
      };
    }

    if (this.#totalReservationCount() >= this.#maxEntries) {
      throw new IdempotencyStoreError(
        "Idempotency retention capacity exceeded; cannot safely enforce duplicate detection.",
        "request.replay_prone",
      );
    }

    const reservation = Object.freeze({
      scope,
      identityKey,
      fingerprint,
    });
    inFlightByIdentity.set(identityKey, {
      fingerprint,
    });
    return {
      kind: "new",
      reservation,
    };
  }

  complete(
    reservation: IdempotencyReservation,
    response: Readonly<Record<string, unknown>>,
  ): void {
    const scope = reservation.scope;
    const identityKey = normalizeNonEmpty(reservation.identityKey, "identityKey");
    const fingerprint = normalizeNonEmpty(reservation.fingerprint, "fingerprint");
    if (!isRecord(response)) {
      throw new IdempotencyStoreError(
        "Idempotency completion requires an object response payload.",
        "transport.transient_failure",
      );
    }

    const inFlightByIdentity = this.#inFlightByScope.get(scope);
    const completedByIdentity = this.#completedByScope.get(scope);
    if (inFlightByIdentity === undefined || completedByIdentity === undefined) {
      throw new IdempotencyStoreError(
        `Unsupported idempotency scope "${scope}".`,
        "transport.transient_failure",
      );
    }

    const active = inFlightByIdentity.get(identityKey);
    if (active === undefined) {
      throw new IdempotencyStoreError(
        "Idempotency reservation is missing or expired.",
        "transport.transient_failure",
      );
    }
    if (active.fingerprint !== fingerprint) {
      throw new IdempotencyStoreError(
        "Idempotency reservation fingerprint mismatch.",
        "request.replay_prone",
      );
    }
    inFlightByIdentity.delete(identityKey);

    completedByIdentity.set(identityKey, {
      fingerprint,
      response: toFrozenResponsePayload(response),
      completedAtMs: this.#now().getTime(),
    });

    this.#persistState();
  }

  abort(reservation: IdempotencyReservation): void {
    const scope = reservation.scope;
    const identityKey = normalizeNonEmpty(reservation.identityKey, "identityKey");
    const fingerprint = normalizeNonEmpty(reservation.fingerprint, "fingerprint");
    const inFlightByIdentity = this.#inFlightByScope.get(scope);
    if (inFlightByIdentity === undefined) {
      return;
    }
    const active = inFlightByIdentity.get(identityKey);
    if (active !== undefined && active.fingerprint === fingerprint) {
      inFlightByIdentity.delete(identityKey);
    }
  }

  #cleanupExpired(nowMs: number, persistIfChanged: boolean): void {
    const cutoffMs = nowMs - this.#ttlMs;
    let changed = false;
    for (const completedByIdentity of this.#completedByScope.values()) {
      for (const [identityKey, entry] of completedByIdentity.entries()) {
        if (entry.completedAtMs <= cutoffMs) {
          completedByIdentity.delete(identityKey);
          changed = true;
        }
      }
    }
    if (changed && persistIfChanged) {
      this.#persistState();
    }
  }

  #totalCompletedCount(): number {
    let total = 0;
    for (const completedByIdentity of this.#completedByScope.values()) {
      total += completedByIdentity.size;
    }
    return total;
  }

  #totalReservationCount(): number {
    let total = 0;
    for (const inFlightByIdentity of this.#inFlightByScope.values()) {
      total += inFlightByIdentity.size;
    }
    for (const completedByIdentity of this.#completedByScope.values()) {
      total += completedByIdentity.size;
    }
    return total;
  }

  #loadStateFromDisk(): void {
    if (this.#stateFilePath === undefined || !existsSync(this.#stateFilePath)) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.#stateFilePath, "utf8")) as unknown;
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      throw new IdempotencyStoreError(
        "Failed to read persisted idempotency state.",
        "transport.transient_failure",
        { ...(cause !== undefined ? { cause } : {}) },
      );
    }

    if (!isRecord(parsed) || parsed["version"] !== 1 || !Array.isArray(parsed["entries"])) {
      throw new IdempotencyStoreError(
        "Persisted idempotency state is invalid.",
        "transport.transient_failure",
      );
    }

    for (const entry of parsed["entries"]) {
      if (!isPersistedEntry(entry)) {
        continue;
      }
      const byScope = this.#completedByScope.get(entry.scope);
      if (byScope === undefined) {
        continue;
      }
      const existing = byScope.get(entry.identityKey);
      if (
        existing === undefined ||
        existing.completedAtMs <= entry.completedAtMs
      ) {
        byScope.set(entry.identityKey, {
          fingerprint: entry.fingerprint,
          response: toFrozenResponsePayload(entry.response),
          completedAtMs: entry.completedAtMs,
        });
      }
    }

    if (this.#totalCompletedCount() > this.#maxEntries) {
      throw new IdempotencyStoreError(
        "Persisted idempotency state exceeds configured retention capacity.",
        "request.replay_prone",
      );
    }
  }

  #persistState(): void {
    if (this.#stateFilePath === undefined) {
      return;
    }

    const entries: PersistedEntry[] = [];
    for (const [scope, completedByIdentity] of this.#completedByScope.entries()) {
      for (const [identityKey, entry] of completedByIdentity.entries()) {
        entries.push({
          scope,
          identityKey,
          fingerprint: entry.fingerprint,
          completedAtMs: entry.completedAtMs,
          response: entry.response,
        });
      }
    }

    const state: PersistedIdempotencyState = {
      version: 1,
      entries,
    };

    try {
      mkdirSync(dirname(this.#stateFilePath), { recursive: true });
      const tempPath = `${this.#stateFilePath}.tmp.${process.pid}.${this.#persistWriteCounter.toString(36)}`;
      this.#persistWriteCounter += 1;
      writeFileSync(tempPath, JSON.stringify(state), { encoding: "utf8" });
      renameSync(tempPath, this.#stateFilePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `[arlopass-bridge] warning: failed to persist idempotency state to "${this.#stateFilePath}": ${message}\n`,
      );
      const failure: IdempotencyPersistenceFailure = {
        stateFilePath: this.#stateFilePath,
        message,
        ...(isRecord(error) && typeof error["code"] === "string"
          ? { code: error["code"] }
          : {}),
        occurredAt: this.#now().toISOString(),
      };
      try {
        this.#onPersistenceFailure?.(failure);
      } catch {
        process.stderr.write(
          `[arlopass-bridge] warning: idempotency persistence failure callback threw unexpectedly\n`,
        );
      }
    }
  }
}
