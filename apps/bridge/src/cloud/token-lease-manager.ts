export type TokenLeaseRefreshPolicy = Readonly<{
  thresholdRatio: number;
  jitterRatio: number;
  maxAttempts: number;
  cooldownMs: number;
}>;

export type LeaseScopeInput = Readonly<{
  providerId: string;
  methodId: string;
  region?: string;
}>;

export type LeaseScope = Readonly<{
  providerId: string;
  methodId: string;
  region: string;
}>;

export interface TokenLeaseManager {
  withRefreshLease<T>(scope: LeaseScopeInput, runner: () => Promise<T>): Promise<T>;
}

export const TOKEN_LEASE_REFRESH_POLICY_DEFAULTS: TokenLeaseRefreshPolicy =
  Object.freeze({
    thresholdRatio: 0.8,
    jitterRatio: 0.1,
    maxAttempts: 3,
    cooldownMs: 300_000,
  });

function normalizeScope(scope: LeaseScopeInput): LeaseScope {
  const providerId = scope.providerId.trim();
  const methodId = scope.methodId.trim();
  const region =
    typeof scope.region === "string" && scope.region.trim().length > 0
      ? scope.region.trim()
      : "global";

  if (providerId.length === 0 || methodId.length === 0) {
    throw new Error("Token lease scope requires non-empty providerId and methodId.");
  }

  return { providerId, methodId, region };
}

function scopeKey(scope: LeaseScope): string {
  return [scope.providerId, scope.methodId, scope.region].join("::");
}

export class InMemoryTokenLeaseManager implements TokenLeaseManager {
  readonly #policy: TokenLeaseRefreshPolicy;
  readonly #inFlightByScope = new Map<string, Promise<unknown>>();

  constructor(options: Readonly<{ refreshPolicy?: TokenLeaseRefreshPolicy }> = {}) {
    this.#policy = options.refreshPolicy ?? TOKEN_LEASE_REFRESH_POLICY_DEFAULTS;
  }

  get refreshPolicy(): TokenLeaseRefreshPolicy {
    return this.#policy;
  }

  async withRefreshLease<T>(scope: LeaseScopeInput, runner: () => Promise<T>): Promise<T> {
    const normalizedScope = normalizeScope(scope);
    const key = scopeKey(normalizedScope);
    const existing = this.#inFlightByScope.get(key);
    if (existing !== undefined) {
      return existing as Promise<T>;
    }

    const active = (async () => runner())();
    this.#inFlightByScope.set(key, active);
    try {
      return await active;
    } finally {
      const stillActive = this.#inFlightByScope.get(key);
      if (stillActive === active) {
        this.#inFlightByScope.delete(key);
      }
    }
  }
}

