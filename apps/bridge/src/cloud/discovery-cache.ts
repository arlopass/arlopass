export const DEFAULT_DISCOVERY_HOT_TTL_MS = 300_000;
export const DEFAULT_DISCOVERY_NEGATIVE_TTL_MS = 60_000;

export type DiscoveryCacheState = "hot" | "stale" | "miss";
export type DiscoveryCacheStatus = DiscoveryCacheState | "refreshed";

export type DiscoveryInvalidationSignal =
  | "credential.rotate"
  | "credential.revoke"
  | "policy.version.changed"
  | "provider.unavailable.threshold";

type DiscoveryCacheEntry<TValue> = Readonly<{
  value?: TValue;
  isNegative: boolean;
  reasonCode?: string;
  cachedAtMs: number;
  expiresAtMs: number;
  stale: boolean;
  invalidationSignal?: DiscoveryInvalidationSignal;
  invalidationDetail?: string;
}>;

export type DiscoveryCacheReadResult<TValue> = Readonly<{
  cacheStatus: DiscoveryCacheState;
  isNegative: boolean;
  value?: TValue;
  reasonCode?: string;
  degraded: boolean;
  degradedReason?: "stale" | "partial" | "unavailable";
  invalidationSignal?: DiscoveryInvalidationSignal;
  invalidationDetail?: string;
  cachedAt?: string;
  expiresAt?: string;
}>;

export type DiscoveryCacheWriteResult<TValue> = Readonly<{
  cacheStatus: "refreshed";
  isNegative: boolean;
  value?: TValue;
  reasonCode?: string;
  cachedAt: string;
  expiresAt: string;
}>;

export type DiscoveryCacheOptions = Readonly<{
  hotTtlMs?: number;
  negativeTtlMs?: number;
  now?: () => Date;
}>;

export type DiscoveryCacheDiagnostics = Readonly<{
  reads: Readonly<{
    total: number;
    hit: number;
    miss: number;
    stale: number;
  }>;
  refresh: Readonly<{
    success: number;
    negative: number;
  }>;
}>;

type MutableDiscoveryCacheDiagnostics = {
  reads: {
    total: number;
    hit: number;
    miss: number;
    stale: number;
  };
  refresh: {
    success: number;
    negative: number;
  };
};

export type DiscoveryCacheInvalidation = Readonly<{
  signal: DiscoveryInvalidationSignal;
  detail?: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deriveDegradedState(
  value: unknown,
  isStale: boolean,
): Readonly<{ degraded: boolean; degradedReason?: "stale" | "partial" | "unavailable" }> {
  if (isStale) {
    return { degraded: true, degradedReason: "stale" };
  }

  if (!isRecord(value) || !Array.isArray(value["regions"])) {
    return { degraded: false };
  }

  const regionStates = (value["regions"] as unknown[])
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => {
      const status = entry["status"];
      return typeof status === "string" ? status : "";
    });

  if (regionStates.some((status) => status === "unavailable")) {
    return { degraded: true, degradedReason: "unavailable" };
  }
  if (regionStates.some((status) => status === "partial")) {
    return { degraded: true, degradedReason: "partial" };
  }
  if (regionStates.some((status) => status === "stale")) {
    return { degraded: true, degradedReason: "stale" };
  }

  return { degraded: false };
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`Discovery cache requires non-empty "${field}".`);
  }
  return normalized;
}

function normalizeTtlMs(
  value: number | undefined,
  fallback: number,
  field: string,
): number {
  const candidate = value ?? fallback;
  if (!Number.isFinite(candidate) || candidate <= 0) {
    throw new TypeError(`Discovery cache "${field}" must be a positive finite number.`);
  }
  return Math.floor(candidate);
}

export class DiscoveryCache<TValue> {
  readonly #entriesByProvider = new Map<string, DiscoveryCacheEntry<TValue>>();
  readonly #hotTtlMs: number;
  readonly #negativeTtlMs: number;
  readonly #now: () => Date;
  readonly #diagnostics: MutableDiscoveryCacheDiagnostics = {
    reads: {
      total: 0,
      hit: 0,
      miss: 0,
      stale: 0,
    },
    refresh: {
      success: 0,
      negative: 0,
    },
  };

  constructor(options: DiscoveryCacheOptions = {}) {
    this.#hotTtlMs = normalizeTtlMs(
      options.hotTtlMs,
      DEFAULT_DISCOVERY_HOT_TTL_MS,
      "hotTtlMs",
    );
    this.#negativeTtlMs = normalizeTtlMs(
      options.negativeTtlMs,
      DEFAULT_DISCOVERY_NEGATIVE_TTL_MS,
      "negativeTtlMs",
    );
    this.#now = options.now ?? (() => new Date());
  }

  read(providerId: string): DiscoveryCacheReadResult<TValue> {
    const normalizedProviderId = requireNonEmpty(providerId, "providerId");
    const entry = this.#entriesByProvider.get(normalizedProviderId);
    this.#diagnostics.reads.total += 1;
    if (entry === undefined) {
      this.#diagnostics.reads.miss += 1;
      return {
        cacheStatus: "miss",
        isNegative: false,
        degraded: false,
      };
    }

    const nowMs = this.#now().getTime();
    const isStale = entry.stale || entry.expiresAtMs <= nowMs;
    if (isStale) {
      this.#diagnostics.reads.stale += 1;
    } else {
      this.#diagnostics.reads.hit += 1;
    }
    const degraded = deriveDegradedState(entry.value, isStale);
    return {
      cacheStatus: isStale ? "stale" : "hot",
      isNegative: entry.isNegative,
      ...(entry.value !== undefined ? { value: entry.value } : {}),
      ...(entry.reasonCode !== undefined ? { reasonCode: entry.reasonCode } : {}),
      degraded: degraded.degraded,
      ...(degraded.degradedReason !== undefined
        ? { degradedReason: degraded.degradedReason }
        : {}),
      ...(entry.invalidationSignal !== undefined
        ? { invalidationSignal: entry.invalidationSignal }
        : {}),
      ...(entry.invalidationDetail !== undefined
        ? { invalidationDetail: entry.invalidationDetail }
        : {}),
      cachedAt: new Date(entry.cachedAtMs).toISOString(),
      expiresAt: new Date(entry.expiresAtMs).toISOString(),
    };
  }

  state(providerId: string): DiscoveryCacheState {
    return this.read(providerId).cacheStatus;
  }

  storeSuccess(
    providerId: string,
    value: TValue,
  ): DiscoveryCacheWriteResult<TValue> {
    const normalizedProviderId = requireNonEmpty(providerId, "providerId");
    const nowMs = this.#now().getTime();
    const entry: DiscoveryCacheEntry<TValue> = {
      value,
      isNegative: false,
      cachedAtMs: nowMs,
      expiresAtMs: nowMs + this.#hotTtlMs,
      stale: false,
    };
    this.#entriesByProvider.set(normalizedProviderId, entry);
    this.#diagnostics.refresh.success += 1;

    return {
      cacheStatus: "refreshed",
      isNegative: false,
      value,
      cachedAt: new Date(entry.cachedAtMs).toISOString(),
      expiresAt: new Date(entry.expiresAtMs).toISOString(),
    };
  }

  storeNegative(
    providerId: string,
    reasonCode: string,
  ): DiscoveryCacheWriteResult<TValue> {
    const normalizedProviderId = requireNonEmpty(providerId, "providerId");
    const normalizedReasonCode = requireNonEmpty(reasonCode, "reasonCode");
    const nowMs = this.#now().getTime();
    const entry: DiscoveryCacheEntry<TValue> = {
      isNegative: true,
      reasonCode: normalizedReasonCode,
      cachedAtMs: nowMs,
      expiresAtMs: nowMs + this.#negativeTtlMs,
      stale: false,
    };
    this.#entriesByProvider.set(normalizedProviderId, entry);
    this.#diagnostics.refresh.negative += 1;

    return {
      cacheStatus: "refreshed",
      isNegative: true,
      reasonCode: normalizedReasonCode,
      cachedAt: new Date(entry.cachedAtMs).toISOString(),
      expiresAt: new Date(entry.expiresAtMs).toISOString(),
    };
  }

  markStale(providerId: string, invalidation?: DiscoveryCacheInvalidation): void {
    const normalizedProviderId = requireNonEmpty(providerId, "providerId");
    const existing = this.#entriesByProvider.get(normalizedProviderId);
    if (existing === undefined) {
      return;
    }
    this.#entriesByProvider.set(normalizedProviderId, {
      ...existing,
      stale: true,
      ...(invalidation !== undefined
        ? {
            invalidationSignal: invalidation.signal,
            ...(invalidation.detail !== undefined
              ? { invalidationDetail: invalidation.detail }
              : {}),
          }
        : {}),
    });
  }

  markAllStale(invalidation?: DiscoveryCacheInvalidation): void {
    for (const providerId of this.#entriesByProvider.keys()) {
      this.markStale(providerId, invalidation);
    }
  }

  clear(providerId: string): void {
    const normalizedProviderId = requireNonEmpty(providerId, "providerId");
    this.#entriesByProvider.delete(normalizedProviderId);
  }

  clearAll(): void {
    this.#entriesByProvider.clear();
  }

  getDiagnostics(): DiscoveryCacheDiagnostics {
    return {
      reads: {
        total: this.#diagnostics.reads.total,
        hit: this.#diagnostics.reads.hit,
        miss: this.#diagnostics.reads.miss,
        stale: this.#diagnostics.reads.stale,
      },
      refresh: {
        success: this.#diagnostics.refresh.success,
        negative: this.#diagnostics.refresh.negative,
      },
    };
  }
}
