import {
  HANDSHAKE_SESSION_TOKEN_BYTE_LENGTH,
  isFixedLengthHex,
} from "./handshake.js";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export type SessionKeyIssueInput = Readonly<{
  extensionId: string;
  sessionToken: string;
  establishedAt: string;
  expiresAt: string;
}>;

export type SessionKeyRegistryOptions = Readonly<{
  now?: () => Date;
  stateFilePath?: string;
}>;

export type ResolvedSessionKeyRecord = Readonly<{
  extensionId: string;
  sessionKey: Buffer;
}>;

type SessionKeyRecord = Readonly<{
  extensionId: string;
  sessionKey: Buffer;
  establishedAtMs: number;
  expiresAtMs: number;
}>;

type PersistedSessionKeyRecord = Readonly<{
  sessionToken: string;
  extensionId: string;
  establishedAtMs: number;
  expiresAtMs: number;
}>;

type PersistedSessionKeyState = Readonly<{
  version: 1;
  records: readonly PersistedSessionKeyRecord[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`Session key registry requires non-empty "${field}".`);
  }
  return normalized;
}

function parseIsoDate(value: string, field: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new TypeError(`Session key registry "${field}" must be a valid ISO-8601 date.`);
  }
  return timestamp;
}

function normalizeSessionToken(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!isFixedLengthHex(normalized, HANDSHAKE_SESSION_TOKEN_BYTE_LENGTH)) {
    throw new TypeError(
      `Session key registry requires "sessionToken" to be ${String(HANDSHAKE_SESSION_TOKEN_BYTE_LENGTH * 2)} hex characters.`,
    );
  }
  return normalized;
}

function isFiniteInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number.isFinite(value);
}

function isPersistedSessionKeyRecord(
  value: unknown,
): value is PersistedSessionKeyRecord {
  if (!isRecord(value)) {
    return false;
  }
  if (
    typeof value["sessionToken"] !== "string" ||
    !isFixedLengthHex(value["sessionToken"], HANDSHAKE_SESSION_TOKEN_BYTE_LENGTH) ||
    typeof value["extensionId"] !== "string" ||
    value["extensionId"].trim().length === 0 ||
    !isFiniteInteger(value["establishedAtMs"]) ||
    !isFiniteInteger(value["expiresAtMs"])
  ) {
    return false;
  }
  return (value["expiresAtMs"] as number) > (value["establishedAtMs"] as number);
}

/**
 * In-memory registry for bridge-issued handshake session keys.
 *
 * The session token itself is used as the symmetric proof key material.
 * When stateFilePath is configured, active tokens are persisted to survive
 * native-host process restarts between handshake and cloud execution calls.
 */
export class SessionKeyRegistry {
  readonly #recordsByToken = new Map<string, SessionKeyRecord>();
  readonly #now: () => Date;
  readonly #stateFilePath: string | undefined;
  #persistWriteCounter = 0;

  constructor(options: SessionKeyRegistryOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#stateFilePath =
      typeof options.stateFilePath === "string" &&
      options.stateFilePath.trim().length > 0
        ? options.stateFilePath.trim()
        : undefined;
    this.#loadStateFromDisk();
    if (this.#cleanupExpired()) {
      this.#persistState();
    }
  }

  issue(input: SessionKeyIssueInput): void {
    this.#cleanupExpired();

    const extensionId = requireNonEmpty(input.extensionId, "extensionId");
    const sessionToken = normalizeSessionToken(input.sessionToken);
    const establishedAtMs = parseIsoDate(input.establishedAt, "establishedAt");
    const expiresAtMs = parseIsoDate(input.expiresAt, "expiresAt");
    if (expiresAtMs <= establishedAtMs) {
      throw new TypeError('Session key registry requires "expiresAt" > "establishedAt".');
    }

    this.#recordsByToken.set(sessionToken, {
      extensionId,
      sessionKey: Buffer.from(sessionToken, "hex"),
      establishedAtMs,
      expiresAtMs,
    });
    this.#persistState();
  }

  resolve(sessionToken: string): Buffer | undefined {
    const resolved = this.resolveRecord(sessionToken);
    return resolved === undefined ? undefined : Buffer.from(resolved.sessionKey);
  }

  resolveRecord(sessionToken: string): ResolvedSessionKeyRecord | undefined {
    if (this.#cleanupExpired()) {
      this.#persistState();
    }

    let normalizedToken: string;
    try {
      normalizedToken = normalizeSessionToken(sessionToken);
    } catch {
      return undefined;
    }

    const record = this.#recordsByToken.get(normalizedToken);
    if (record === undefined) {
      return undefined;
    }

    const nowMs = this.#now().getTime();
    if (record.expiresAtMs <= nowMs) {
      this.#recordsByToken.delete(normalizedToken);
      this.#persistState();
      return undefined;
    }

    return {
      extensionId: record.extensionId,
      sessionKey: Buffer.from(record.sessionKey),
    };
  }

  #cleanupExpired(): boolean {
    const nowMs = this.#now().getTime();
    let changed = false;
    for (const [sessionToken, record] of this.#recordsByToken) {
      if (record.expiresAtMs <= nowMs) {
        this.#recordsByToken.delete(sessionToken);
        changed = true;
      }
    }
    return changed;
  }

  #loadStateFromDisk(): void {
    if (this.#stateFilePath === undefined || !existsSync(this.#stateFilePath)) {
      return;
    }

    try {
      const raw = readFileSync(this.#stateFilePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!isRecord(parsed) || parsed["version"] !== 1) {
        return;
      }
      const records = Array.isArray(parsed["records"]) ? parsed["records"] : [];
      const nowMs = this.#now().getTime();
      for (const entry of records) {
        if (!isPersistedSessionKeyRecord(entry)) {
          continue;
        }
        if (entry.expiresAtMs <= nowMs) {
          continue;
        }
        const sessionToken = normalizeSessionToken(entry.sessionToken);
        this.#recordsByToken.set(sessionToken, {
          extensionId: entry.extensionId.trim(),
          sessionKey: Buffer.from(sessionToken, "hex"),
          establishedAtMs: entry.establishedAtMs,
          expiresAtMs: entry.expiresAtMs,
        });
      }
    } catch {
      // Fail closed to in-memory session state when persisted state is unreadable.
    }
  }

  #persistState(): void {
    if (this.#stateFilePath === undefined) {
      return;
    }

    const state: PersistedSessionKeyState = {
      version: 1,
      records: [...this.#recordsByToken.entries()].map(([sessionToken, record]) => ({
        sessionToken,
        extensionId: record.extensionId,
        establishedAtMs: record.establishedAtMs,
        expiresAtMs: record.expiresAtMs,
      })),
    };

    const directoryPath = dirname(this.#stateFilePath);
    const tempPath = this.#nextTempStatePath();
    let tempWritten = false;
    try {
      mkdirSync(directoryPath, { recursive: true });
      writeFileSync(tempPath, JSON.stringify(state), { encoding: "utf8" });
      tempWritten = true;
      renameSync(tempPath, this.#stateFilePath);
      tempWritten = false;
    } catch {
      // Fail closed to in-memory session state on persistence errors.
    } finally {
      if (tempWritten) {
        try {
          unlinkSync(tempPath);
        } catch {
          // Best-effort temp cleanup after persistence failures.
        }
      }
    }
  }

  #nextTempStatePath(): string {
    this.#persistWriteCounter += 1;
    return `${this.#stateFilePath}.tmp.${process.pid}.${Date.now().toString(36)}.${this.#persistWriteCounter.toString(36)}`;
  }
}
