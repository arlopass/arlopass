import type { ProtocolCapability } from "@byom-ai/protocol";

import {
  type ExtensionEventEmitter,
  type ExtensionEventMap,
} from "../events.js";
import {
  GRANT_SCOPE_WILDCARD,
  type Grant,
  type GrantKey,
  type GrantLookup,
  type GrantRevocationReason,
  type GrantScope,
  type GrantType,
  DEFAULT_ONE_TIME_GRANT_TTL_MS,
  DEFAULT_SESSION_GRANT_TTL_MS,
  canonicalizeGrantTarget,
  cloneGrant,
  createCapabilityIndexKey,
  isGrantType,
  normalizeCapabilities,
  normalizeOrigin,
  normalizeGrantScopeValue,
  sameCapabilities,
} from "./grant-types.js";

export class GrantStoreError extends Error {
  readonly code:
    | "grant-not-found"
    | "grant-expired"
    | "grant-consumed"
    | "grant-invalid"
    | "store-invalid-input";

  constructor(
    message: string,
    code:
      | "grant-not-found"
      | "grant-expired"
      | "grant-consumed"
      | "grant-invalid"
      | "store-invalid-input",
    options: Readonly<{ cause?: Error }> = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "GrantStoreError";
    this.code = code;
  }
}

export type GrantPermissionInput = Readonly<{
  origin: string;
  providerId: string;
  modelId: string;
  capabilities: readonly ProtocolCapability[];
  grantType: GrantType;
}>;

export type GrantStoreOptions = Readonly<{
  now?: () => number;
  randomId?: () => string;
  sessionGrantTtlMs?: number;
  oneTimeGrantTtlMs?: number;
  events?: ExtensionEventEmitter<ExtensionEventMap>;
}>;

export type GrantPermissionMatch = Readonly<{
  allowed: boolean;
  grant?: Grant;
  reason:
    | "allow"
    | "grant-not-found"
    | "grant-expired"
    | "grant-consumed"
    | "invalid-input";
}>;

const DEFAULT_RANDOM_ID = () =>
  `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 11)}`;

function toGrantStoreError(error: unknown): GrantStoreError {
  if (error instanceof GrantStoreError) {
    return error;
  }

  if (error instanceof Error) {
    return new GrantStoreError(error.message, "grant-invalid", { cause: error });
  }

  return new GrantStoreError(
    `Unknown grant-store failure: ${String(error)}`,
    "grant-invalid",
  );
}

function assertPositiveInteger(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new GrantStoreError(
      `${fieldName} must be a positive integer value in milliseconds.`,
      "store-invalid-input",
    );
  }

  return value;
}

function sortGrantCandidates(
  left: Grant,
  right: Grant,
): number {
  if (left.updatedAt !== right.updatedAt) {
    return right.updatedAt - left.updatedAt;
  }

  if (left.createdAt !== right.createdAt) {
    return right.createdAt - left.createdAt;
  }

  return left.id.localeCompare(right.id);
}

export class GrantStore {
  readonly #grantsById = new Map<string, Grant>();
  readonly #capabilityIndex = new Map<string, Set<string>>();
  readonly #events: ExtensionEventEmitter<ExtensionEventMap> | undefined;
  readonly #now: () => number;
  readonly #randomId: () => string;
  readonly #sessionGrantTtlMs: number;
  readonly #oneTimeGrantTtlMs: number;

  constructor(options: GrantStoreOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#randomId = options.randomId ?? DEFAULT_RANDOM_ID;
    this.#sessionGrantTtlMs = assertPositiveInteger(
      options.sessionGrantTtlMs ?? DEFAULT_SESSION_GRANT_TTL_MS,
      "sessionGrantTtlMs",
    );
    this.#oneTimeGrantTtlMs = assertPositiveInteger(
      options.oneTimeGrantTtlMs ?? DEFAULT_ONE_TIME_GRANT_TTL_MS,
      "oneTimeGrantTtlMs",
    );
    this.#events = options.events;
  }

  get size(): number {
    return this.#grantsById.size;
  }

  listGrants(): readonly Grant[] {
    return [...this.#grantsById.values()]
      .sort(sortGrantCandidates)
      .map((grant) => cloneGrant(grant));
  }

  listPersistentGrants(): readonly Grant[] {
    return [...this.#grantsById.values()]
      .filter((grant) => grant.grantType === "persistent")
      .sort(sortGrantCandidates)
      .map((grant) => cloneGrant(grant));
  }

  getGrant(grantId: string): Grant | undefined {
    const grant = this.#grantsById.get(grantId);
    return grant ? cloneGrant(grant) : undefined;
  }

  replacePersistentGrants(grants: readonly Grant[]): void {
    const persistentGrantIds = [...this.#grantsById.values()]
      .filter((grant) => grant.grantType === "persistent")
      .map((grant) => grant.id);

    for (const grantId of persistentGrantIds) {
      this.#removeGrant(grantId);
    }

    for (const grant of grants) {
      this.#addHydratedPersistentGrant(grant);
    }
  }

  grantPermission(input: GrantPermissionInput): Grant {
    if (!isGrantType(input.grantType)) {
      throw new GrantStoreError(
        `Unsupported grant type "${String(input.grantType)}".`,
        "store-invalid-input",
      );
    }

    const now = this.#now();
    const normalized = canonicalizeGrantTarget({
      origin: input.origin,
      providerId: input.providerId,
      modelId: input.modelId,
      capabilities: input.capabilities,
    });

    const supersededGrantIds = this.#findSupersededGrantIds(
      normalized.origin,
      normalized.providerId,
      normalized.modelId,
      normalized.capabilities,
    );
    for (const supersededGrantId of supersededGrantIds) {
      this.#revokeGrantById(supersededGrantId, "superseded", now);
    }

    const grant: Grant = {
      id: this.#createGrantId(),
      origin: normalized.origin,
      providerId: normalized.providerId,
      modelId: normalized.modelId,
      capabilities: normalized.capabilities,
      grantType: input.grantType,
      createdAt: now,
      updatedAt: now,
      ...(input.grantType === "one-time"
        ? { expiresAt: now + this.#oneTimeGrantTtlMs }
        : {}),
      ...(input.grantType === "session"
        ? { expiresAt: now + this.#sessionGrantTtlMs }
        : {}),
    };

    this.#insertGrant(grant);
    this.#events?.emit("grant-created", { grant: cloneGrant(grant) });
    this.#events?.emit("bridge-grant-synchronization", {
      grantId: grant.id,
      origin: grant.origin,
      providerId: grant.providerId,
      modelId: grant.modelId,
      capabilities: [...grant.capabilities],
      grantType: grant.grantType,
      createdAt: grant.createdAt,
      ...(grant.expiresAt !== undefined ? { expiresAt: grant.expiresAt } : {}),
    });

    return cloneGrant(grant);
  }

  hasPermission(input: GrantLookup): boolean {
    const check = this.checkPermission(input);
    return check.allowed;
  }

  checkPermission(input: GrantLookup): GrantPermissionMatch {
    const normalizedInput = this.#normalizeLookup(input);
    const candidateKeys = this.#createLookupKeys(normalizedInput);

    for (const candidate of candidateKeys) {
      const grant = this.#resolveCandidateGrant(candidate, normalizedInput.capability);
      if (grant === undefined) {
        continue;
      }

      this.#events?.emit("permission-checked", {
        origin: normalizedInput.origin,
        providerId: normalizedInput.providerId,
        modelId: normalizedInput.modelId,
        capability: normalizedInput.capability,
        allowed: true,
        matchedGrantId: grant.id,
        checkedAt: this.#now(),
      });

      return {
        allowed: true,
        grant: cloneGrant(grant),
        reason: "allow",
      };
    }

    this.#events?.emit("permission-checked", {
      origin: normalizedInput.origin,
      providerId: normalizedInput.providerId,
      modelId: normalizedInput.modelId,
      capability: normalizedInput.capability,
      allowed: false,
      checkedAt: this.#now(),
    });

    return {
      allowed: false,
      reason: "grant-not-found",
    };
  }

  consumeOneTimeGrant(grantId: string, requestId?: string): Grant {
    const grant = this.#grantsById.get(grantId);
    if (grant === undefined) {
      throw new GrantStoreError(`Unknown grant "${grantId}".`, "grant-not-found");
    }

    if (grant.grantType !== "one-time") {
      throw new GrantStoreError(
        `Grant "${grantId}" cannot be consumed because it is ${grant.grantType}.`,
        "grant-invalid",
      );
    }

    const now = this.#now();
    if (this.#isGrantExpired(grant, now)) {
      this.#revokeGrantById(grant.id, "expired", now);
      throw new GrantStoreError(
        `Grant "${grantId}" is expired and cannot be consumed.`,
        "grant-expired",
      );
    }

    const consumedGrant: Grant = {
      ...grant,
      consumedAt: now,
      updatedAt: now,
    };
    this.#removeGrant(grant.id);
    this.#events?.emit("grant-consumed", {
      grant: cloneGrant(consumedGrant),
      ...(requestId !== undefined ? { requestId } : {}),
      consumedAt: now,
    });
    this.#events?.emit("bridge-grant-revocation", {
      grantId: consumedGrant.id,
      origin: consumedGrant.origin,
      providerId: consumedGrant.providerId,
      modelId: consumedGrant.modelId,
      capabilities: [...consumedGrant.capabilities],
      revokedAt: now,
      reason: "expired",
    });

    return cloneGrant(consumedGrant);
  }

  revokeGrant(grantId: string, reason: GrantRevocationReason = "user"): Grant {
    return this.#revokeGrantById(grantId, reason, this.#now());
  }

  expireSessionGrants(reason: "expired" | "session-ended" = "expired"): readonly Grant[] {
    const now = this.#now();
    const revoked: Grant[] = [];

    for (const grant of this.#grantsById.values()) {
      if (grant.grantType !== "session") {
        continue;
      }

      if (reason === "expired" && !this.#isGrantExpired(grant, now)) {
        continue;
      }

      revoked.push(this.#revokeGrantById(grant.id, reason, now));
    }

    return revoked;
  }

  expireStaleGrants(): readonly Grant[] {
    const now = this.#now();
    const revoked: Grant[] = [];

    for (const grant of this.#grantsById.values()) {
      if (!this.#isGrantExpired(grant, now)) {
        continue;
      }

      revoked.push(this.#revokeGrantById(grant.id, "expired", now));
    }

    return revoked;
  }

  #createGrantId(): string {
    const candidate = `grant.${this.#randomId()}`.trim();
    if (candidate.length < 6) {
      throw new GrantStoreError(
        "Generated grant identifier is invalid.",
        "grant-invalid",
      );
    }

    if (this.#grantsById.has(candidate)) {
      return this.#createGrantId();
    }

    return candidate;
  }

  #normalizeLookup(input: GrantLookup): GrantLookup {
    try {
      return {
        origin: normalizeOrigin(input.origin),
        providerId: normalizeGrantScopeValue(input.providerId, "providerId"),
        modelId: normalizeGrantScopeValue(input.modelId, "modelId"),
        capability: input.capability,
      };
    } catch (error) {
      throw toGrantStoreError(error);
    }
  }

  #createLookupKeys(input: GrantLookup): readonly GrantKey[] {
    const origin = input.origin;
    const providerId = input.providerId;
    const modelId = input.modelId;

    return [
      {
        origin,
        providerId,
        modelId,
        capability: input.capability,
      },
      {
        origin,
        providerId: GRANT_SCOPE_WILDCARD,
        modelId,
        capability: input.capability,
      },
      {
        origin,
        providerId,
        modelId: GRANT_SCOPE_WILDCARD,
        capability: input.capability,
      },
      {
        origin,
        providerId: GRANT_SCOPE_WILDCARD,
        modelId: GRANT_SCOPE_WILDCARD,
        capability: input.capability,
      },
    ];
  }

  #resolveCandidateGrant(candidate: GrantKey, capability: ProtocolCapability): Grant | undefined {
    const indexKey = createCapabilityIndexKey(candidate);
    const grantIds = this.#capabilityIndex.get(indexKey);
    if (grantIds === undefined || grantIds.size === 0) {
      return undefined;
    }

    const now = this.#now();
    const sortedCandidates = [...grantIds]
      .map((grantId) => this.#grantsById.get(grantId))
      .filter((grant): grant is Grant => grant !== undefined)
      .sort(sortGrantCandidates);

    for (const grant of sortedCandidates) {
      if (!grant.capabilities.includes(capability)) {
        continue;
      }

      if (this.#isGrantExpired(grant, now)) {
        this.#revokeGrantById(grant.id, "expired", now);
        continue;
      }

      if (grant.consumedAt !== undefined) {
        this.#removeGrant(grant.id);
        continue;
      }

      return grant;
    }

    return undefined;
  }

  #findSupersededGrantIds(
    origin: string,
    providerId: GrantScope,
    modelId: GrantScope,
    capabilities: readonly ProtocolCapability[],
  ): readonly string[] {
    const superseded = new Set<string>();
    const capabilitySet = new Set(capabilities);

    for (const grant of this.#grantsById.values()) {
      if (
        grant.origin !== origin ||
        grant.providerId !== providerId ||
        grant.modelId !== modelId
      ) {
        continue;
      }

      if (grant.capabilities.some((capability) => capabilitySet.has(capability))) {
        superseded.add(grant.id);
      }
    }

    return [...superseded];
  }

  #isGrantExpired(grant: Grant, now: number): boolean {
    if (grant.expiresAt === undefined) {
      return false;
    }

    return grant.expiresAt <= now;
  }

  #insertGrant(grant: Grant): void {
    this.#grantsById.set(grant.id, grant);

    for (const capability of grant.capabilities) {
      const indexKey = createCapabilityIndexKey({
        origin: grant.origin,
        providerId: grant.providerId,
        modelId: grant.modelId,
        capability,
      });
      const existingSet = this.#capabilityIndex.get(indexKey) ?? new Set<string>();
      existingSet.add(grant.id);
      this.#capabilityIndex.set(indexKey, existingSet);
    }
  }

  #removeGrant(grantId: string): Grant | undefined {
    const grant = this.#grantsById.get(grantId);
    if (grant === undefined) {
      return undefined;
    }

    this.#grantsById.delete(grantId);
    for (const capability of grant.capabilities) {
      const indexKey = createCapabilityIndexKey({
        origin: grant.origin,
        providerId: grant.providerId,
        modelId: grant.modelId,
        capability,
      });
      const grantSet = this.#capabilityIndex.get(indexKey);
      if (grantSet === undefined) {
        continue;
      }

      grantSet.delete(grantId);
      if (grantSet.size === 0) {
        this.#capabilityIndex.delete(indexKey);
      }
    }

    return grant;
  }

  #revokeGrantById(
    grantId: string,
    reason: GrantRevocationReason,
    now: number,
  ): Grant {
    const grant = this.#removeGrant(grantId);
    if (grant === undefined) {
      throw new GrantStoreError(`Unknown grant "${grantId}".`, "grant-not-found");
    }

    const revokedGrant: Grant = {
      ...grant,
      updatedAt: now,
    };
    this.#events?.emit("grant-revoked", {
      grant: cloneGrant(revokedGrant),
      reason,
      revokedAt: now,
    });
    this.#events?.emit("bridge-grant-revocation", {
      grantId: revokedGrant.id,
      origin: revokedGrant.origin,
      providerId: revokedGrant.providerId,
      modelId: revokedGrant.modelId,
      capabilities: [...revokedGrant.capabilities],
      revokedAt: now,
      reason,
    });

    return cloneGrant(revokedGrant);
  }

  #addHydratedPersistentGrant(grant: Grant): void {
    if (grant.grantType !== "persistent") {
      throw new GrantStoreError(
        `Hydrated grant "${grant.id}" is not persistent.`,
        "grant-invalid",
      );
    }

    if (grant.id.trim().length === 0) {
      throw new GrantStoreError("Hydrated grant id must be non-empty.", "grant-invalid");
    }

    let normalizedTarget:
      | Readonly<{
          origin: string;
          providerId: GrantScope;
          modelId: GrantScope;
          capabilities: readonly ProtocolCapability[];
        }>
      | undefined;
    try {
      normalizedTarget = canonicalizeGrantTarget({
        origin: grant.origin,
        providerId: grant.providerId,
        modelId: grant.modelId,
        capabilities: normalizeCapabilities(grant.capabilities),
      });
    } catch (error) {
      throw toGrantStoreError(error);
    }

    if (
      normalizedTarget.origin !== grant.origin ||
      normalizedTarget.providerId !== grant.providerId ||
      normalizedTarget.modelId !== grant.modelId ||
      !sameCapabilities(normalizedTarget.capabilities, grant.capabilities)
    ) {
      throw new GrantStoreError(
        `Hydrated grant "${grant.id}" is not normalized.`,
        "grant-invalid",
      );
    }

    if (grant.expiresAt !== undefined || grant.consumedAt !== undefined) {
      throw new GrantStoreError(
        `Persistent grant "${grant.id}" must not include expiresAt or consumedAt.`,
        "grant-invalid",
      );
    }

    this.#insertGrant(cloneGrant(grant));
  }
}
