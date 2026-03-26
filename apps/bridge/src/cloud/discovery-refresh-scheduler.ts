export const DEFAULT_DISCOVERY_REFRESH_INTERVAL_MS = 300_000;

export type DiscoveryRefreshTrigger =
  | "connection.completed"
  | "connection.reconnected"
  | "scheduled";

export type DiscoveryRefreshSchedulerOptions = Readonly<{
  onRefresh: (providerId: string, trigger: DiscoveryRefreshTrigger) => Promise<void>;
  now?: () => Date;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}>;

export type DiscoveryRefreshStartOptions = Readonly<{
  intervalMs?: number;
}>;

type SchedulerMetricStats = Readonly<{
  sampleCount: number;
  lastMs: number;
  maxMs: number;
  totalMs: number;
}>;

export type DiscoveryRefreshSchedulerDiagnostics = Readonly<{
  refresh: Readonly<{
    outcomes: Readonly<{
      success: number;
      failure: number;
      skippedDuplicate: number;
    }>;
    latency: SchedulerMetricStats;
    lag: SchedulerMetricStats;
  }>;
}>;

type MutableSchedulerMetricStats = {
  sampleCount: number;
  lastMs: number;
  maxMs: number;
  totalMs: number;
};

type MutableDiscoveryRefreshSchedulerDiagnostics = {
  refresh: {
    outcomes: {
      success: number;
      failure: number;
      skippedDuplicate: number;
    };
    latency: MutableSchedulerMetricStats;
    lag: MutableSchedulerMetricStats;
  };
};

function recordMetric(stats: MutableSchedulerMetricStats, valueMs: number): void {
  const normalizedValueMs = Math.max(0, Math.floor(valueMs));
  stats.sampleCount += 1;
  stats.lastMs = normalizedValueMs;
  stats.totalMs += normalizedValueMs;
  if (normalizedValueMs > stats.maxMs) {
    stats.maxMs = normalizedValueMs;
  }
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`Discovery refresh scheduler requires non-empty "${field}".`);
  }
  return normalized;
}

function normalizeIntervalMs(value: number | undefined): number {
  const candidate = value ?? DEFAULT_DISCOVERY_REFRESH_INTERVAL_MS;
  if (!Number.isFinite(candidate) || candidate <= 0) {
    throw new TypeError("Discovery refresh interval must be a positive finite number.");
  }
  return Math.floor(candidate);
}

export class DiscoveryRefreshScheduler {
  readonly #onRefresh: (providerId: string, trigger: DiscoveryRefreshTrigger) => Promise<void>;
  readonly #now: () => Date;
  readonly #setIntervalFn: typeof setInterval;
  readonly #clearIntervalFn: typeof clearInterval;

  #intervalMs = DEFAULT_DISCOVERY_REFRESH_INTERVAL_MS;
  #timer: ReturnType<typeof setInterval> | undefined;
  readonly #providers = new Set<string>();
  readonly #nextRunByProvider = new Map<string, number>();
  readonly #inFlightRefreshByProvider = new Map<string, Promise<void>>();
  readonly #diagnostics: MutableDiscoveryRefreshSchedulerDiagnostics = {
    refresh: {
      outcomes: {
        success: 0,
        failure: 0,
        skippedDuplicate: 0,
      },
      latency: {
        sampleCount: 0,
        lastMs: 0,
        maxMs: 0,
        totalMs: 0,
      },
      lag: {
        sampleCount: 0,
        lastMs: 0,
        maxMs: 0,
        totalMs: 0,
      },
    },
  };

  constructor(options: DiscoveryRefreshSchedulerOptions) {
    this.#onRefresh = options.onRefresh;
    this.#now = options.now ?? (() => new Date());
    this.#setIntervalFn = options.setIntervalFn ?? setInterval;
    this.#clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  }

  start(options: DiscoveryRefreshStartOptions = {}): void {
    this.stop();
    this.#intervalMs = normalizeIntervalMs(options.intervalMs);
    this.#timer = this.#setIntervalFn(() => {
      this.#runDue("scheduled").catch(() => {});
    }, this.#intervalMs);
  }

  stop(): void {
    if (this.#timer !== undefined) {
      this.#clearIntervalFn(this.#timer);
      this.#timer = undefined;
    }
  }

  registerProvider(providerId: string): void {
    const normalizedProviderId = requireNonEmpty(providerId, "providerId");
    this.#providers.add(normalizedProviderId);
    if (!this.#nextRunByProvider.has(normalizedProviderId)) {
      this.#nextRunByProvider.set(
        normalizedProviderId,
        this.#now().getTime() + this.#intervalMs,
      );
    }
  }

  nextRunAt(providerId: string): string | undefined {
    const normalizedProviderId = requireNonEmpty(providerId, "providerId");
    const timestampMs = this.#nextRunByProvider.get(normalizedProviderId);
    return timestampMs === undefined ? undefined : new Date(timestampMs).toISOString();
  }

  async triggerConnectionCompleted(providerId: string): Promise<void> {
    await this.#triggerImmediate(providerId, "connection.completed");
  }

  async triggerReconnected(providerId: string): Promise<void> {
    await this.#triggerImmediate(providerId, "connection.reconnected");
  }

  async #triggerImmediate(
    providerId: string,
    trigger: "connection.completed" | "connection.reconnected",
  ): Promise<void> {
    const normalizedProviderId = requireNonEmpty(providerId, "providerId");
    this.registerProvider(normalizedProviderId);
    await this.#runRefresh(normalizedProviderId, trigger);
  }

  async #runDue(trigger: "scheduled"): Promise<void> {
    const nowMs = this.#now().getTime();
    for (const providerId of this.#providers) {
      const dueAt = this.#nextRunByProvider.get(providerId);
      if (dueAt === undefined || dueAt > nowMs) {
        continue;
      }
      await this.#runRefresh(providerId, trigger, dueAt);
    }
  }

  async #runRefresh(
    providerId: string,
    trigger: DiscoveryRefreshTrigger,
    dueAtMs?: number,
  ): Promise<void> {
    const inFlight = this.#inFlightRefreshByProvider.get(providerId);
    if (inFlight !== undefined) {
      this.#diagnostics.refresh.outcomes.skippedDuplicate += 1;
      await inFlight;
      return;
    }

    const startedAtMs = this.#now().getTime();
    if (trigger === "scheduled" && dueAtMs !== undefined) {
      recordMetric(this.#diagnostics.refresh.lag, startedAtMs - dueAtMs);
    }

    const refreshPromise = (async () => {
      try {
        await this.#onRefresh(providerId, trigger);
        this.#diagnostics.refresh.outcomes.success += 1;
      } catch (error) {
        this.#diagnostics.refresh.outcomes.failure += 1;
        throw error;
      } finally {
        const finishedAtMs = this.#now().getTime();
        recordMetric(this.#diagnostics.refresh.latency, finishedAtMs - startedAtMs);
        this.#nextRunByProvider.set(providerId, finishedAtMs + this.#intervalMs);
        this.#inFlightRefreshByProvider.delete(providerId);
      }
    })();

    this.#inFlightRefreshByProvider.set(providerId, refreshPromise);
    await refreshPromise;
  }

  getDiagnostics(): DiscoveryRefreshSchedulerDiagnostics {
    return {
      refresh: {
        outcomes: {
          success: this.#diagnostics.refresh.outcomes.success,
          failure: this.#diagnostics.refresh.outcomes.failure,
          skippedDuplicate: this.#diagnostics.refresh.outcomes.skippedDuplicate,
        },
        latency: {
          sampleCount: this.#diagnostics.refresh.latency.sampleCount,
          lastMs: this.#diagnostics.refresh.latency.lastMs,
          maxMs: this.#diagnostics.refresh.latency.maxMs,
          totalMs: this.#diagnostics.refresh.latency.totalMs,
        },
        lag: {
          sampleCount: this.#diagnostics.refresh.lag.sampleCount,
          lastMs: this.#diagnostics.refresh.lag.lastMs,
          maxMs: this.#diagnostics.refresh.lag.maxMs,
          totalMs: this.#diagnostics.refresh.lag.totalMs,
        },
      },
    };
  }
}
