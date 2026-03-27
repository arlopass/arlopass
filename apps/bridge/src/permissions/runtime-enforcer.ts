import type { ProtocolCapability } from "@arlopass/protocol";

export const WILDCARD = "*" as const;
export type WildcardResource = typeof WILDCARD;
export type GrantResource = string | WildcardResource;

/**
 * A grant record as mirrored from the extension into the bridge runtime cache.
 * This mirrors the extension's GrantRecord shape but lives independently so
 * that the bridge remains authoritative even when the extension is reloading.
 */
export type RuntimeGrant = Readonly<{
  id: string;
  origin: string;
  capability: ProtocolCapability;
  providerId: GrantResource;
  modelId: GrantResource;
  grantType: "one-time" | "session" | "persistent";
  sessionId?: string;
  /** ISO 8601 — when absent the grant does not expire by time alone. */
  expiresAt?: string;
}>;

export type RuntimeAccessRequest = Readonly<{
  origin: string;
  capability: ProtocolCapability;
  providerId: string;
  modelId: string;
  sessionId?: string;
}>;

export type RuntimeEnforceResult =
  | Readonly<{ allowed: true; consumed: boolean; grantId: string }>
  | Readonly<{ allowed: false; reasonCode: "permission.denied" }>;

export type RuntimeRevokeSelector = Readonly<{
  origin?: string;
  sessionId?: string;
  grantType?: "one-time" | "session" | "persistent";
}>;

const DENIED: RuntimeEnforceResult = {
  allowed: false,
  reasonCode: "permission.denied",
};

/**
 * Authoritative runtime permission enforcer for the bridge process.
 *
 * Grants are pushed in from the extension via syncGrant/revokeGrant.  The
 * enforcer is authoritative: if a grant is not present here, the request is
 * denied regardless of what the extension claims.
 *
 * Enforcement rules:
 *  - Expired grants are removed lazily on each evaluate() call.
 *  - One-time grants are consumed on the first successful evaluation.
 *  - Session grants require a matching sessionId in the request.
 *  - Wildcard providerId/modelId matches any concrete value in a request.
 *  - When multiple grants match, the most specific (non-wildcard) is preferred;
 *    ties are broken by insertion order (oldest grant wins).
 */
export class RuntimeEnforcer {
  readonly #grants = new Map<string, RuntimeGrant>();
  readonly #now: () => Date;

  constructor(options: { now?: () => Date } = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  /** Adds or replaces a grant in the runtime cache. */
  syncGrant(grant: RuntimeGrant): void {
    this.#grants.set(grant.id, grant);
  }

  /** Removes a single grant by ID.  No-op if the ID is unknown. */
  revokeGrant(grantId: string): void {
    this.#grants.delete(grantId);
  }

  /**
   * Revokes all grants that satisfy every non-undefined field in the selector.
   * Returns the IDs of every revoked grant sorted ascending for determinism.
   */
  revokeBySelector(selector: RuntimeRevokeSelector): readonly string[] {
    const revoked: string[] = [];

    for (const [id, grant] of this.#grants) {
      if (
        selector.origin !== undefined &&
        grant.origin !== selector.origin
      ) {
        continue;
      }

      if (
        selector.sessionId !== undefined &&
        grant.sessionId !== selector.sessionId
      ) {
        continue;
      }

      if (
        selector.grantType !== undefined &&
        grant.grantType !== selector.grantType
      ) {
        continue;
      }

      this.#grants.delete(id);
      revoked.push(id);
    }

    return revoked.sort();
  }

  /**
   * Evaluates a runtime access request against the current grant cache.
   * This is the single authoritative gate; callers must not bypass it.
   */
  evaluate(request: RuntimeAccessRequest): RuntimeEnforceResult {
    this.#cleanupExpired();

    const candidates = [...this.#grants.values()].filter((g) =>
      this.#matchesRequest(g, request),
    );

    if (candidates.length === 0) {
      return DENIED;
    }

    // Sort by descending specificity (non-wildcard > wildcard), then by
    // insertion order (Map iteration is insertion-ordered in JS).
    candidates.sort((a, b) => this.#specificityScore(b) - this.#specificityScore(a));

    const selected = candidates[0];
    if (selected === undefined) {
      return DENIED;
    }

    let consumed = false;
    if (selected.grantType === "one-time") {
      this.#grants.delete(selected.id);
      consumed = true;
    }

    return { allowed: true, consumed, grantId: selected.id };
  }

  /** Removes all grants from the runtime cache. */
  clear(): void {
    this.#grants.clear();
  }

  #cleanupExpired(): void {
    const nowMs = this.#now().getTime();
    for (const [id, grant] of this.#grants) {
      if (grant.expiresAt !== undefined && Date.parse(grant.expiresAt) <= nowMs) {
        this.#grants.delete(id);
      }
    }
  }

  #specificityScore(grant: RuntimeGrant): number {
    return (grant.providerId === WILDCARD ? 0 : 1) +
      (grant.modelId === WILDCARD ? 0 : 1);
  }

  #matchesRequest(grant: RuntimeGrant, request: RuntimeAccessRequest): boolean {
    if (grant.origin !== request.origin) return false;
    if (grant.capability !== request.capability) return false;

    if (!this.#matchesResource(grant.providerId, request.providerId)) {
      return false;
    }

    if (!this.#matchesResource(grant.modelId, request.modelId)) {
      return false;
    }

    if (grant.grantType === "session") {
      return (
        request.sessionId !== undefined &&
        request.sessionId === grant.sessionId
      );
    }

    return true;
  }

  #matchesResource(grantValue: GrantResource, requestValue: string): boolean {
    return grantValue === WILDCARD || grantValue === requestValue;
  }
}
