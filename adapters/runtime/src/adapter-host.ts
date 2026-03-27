import {
  TELEMETRY_METRIC_NAMES,
  TELEMETRY_METRIC_UNITS,
  type TelemetryMetrics,
} from "@arlopass/telemetry";

import { AdapterHostError, RUNTIME_ERROR_CODES } from "./errors.js";
import { type AdapterManifest } from "./manifest-schema.js";
import { type LoadedAdapter } from "./adapter-loader.js";
import { buildSandboxPolicy, SandboxContext } from "./sandbox.js";

export const ADAPTER_STATE = {
  PENDING: "pending",
  STARTING: "starting",
  RUNNING: "running",
  DEGRADED: "degraded",
  STOPPED: "stopped",
  FAILED: "failed",
} as const;

export type AdapterState = (typeof ADAPTER_STATE)[keyof typeof ADAPTER_STATE];

export type AdapterHealthStatus = Readonly<{
  state: AdapterState;
  providerId: string;
  lastHealthCheck?: string;
  restartCount: number;
  error?: string;
}>;

export type AdapterHostOptions = Readonly<{
  healthCheckIntervalMs?: number;
  healthCheckTimeoutMs?: number;
  maxRestarts?: number;
  requireSignatureVerification?: boolean;
  metrics?: TelemetryMetrics;
}>;

const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 30_000;
const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RESTARTS = 3;

type ManagedAdapter = {
  loaded: LoadedAdapter;
  sandbox: SandboxContext;
  state: AdapterState;
  restartCount: number;
  lastHealthCheck?: string;
  lastError?: string;
  healthTimer?: ReturnType<typeof setInterval>;
};

function hostError(
  message: string,
  code: (typeof RUNTIME_ERROR_CODES)[keyof typeof RUNTIME_ERROR_CODES],
  details?: Readonly<Record<string, string | number | boolean | null>>,
  cause?: Error,
): AdapterHostError {
  return new AdapterHostError(message, {
    code,
    ...(details !== undefined ? { details } : {}),
    ...(cause !== undefined ? { cause } : {}),
  });
}

export class AdapterHost {
  readonly #adapters = new Map<string, ManagedAdapter>();
  readonly #options: Required<Omit<AdapterHostOptions, "metrics">>;
  readonly #metrics: TelemetryMetrics | undefined;
  #started = false;
  #shutdown = false;

  constructor(options: AdapterHostOptions = {}) {
    this.#options = {
      healthCheckIntervalMs: options.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL_MS,
      healthCheckTimeoutMs: options.healthCheckTimeoutMs ?? DEFAULT_HEALTH_CHECK_TIMEOUT_MS,
      maxRestarts: options.maxRestarts ?? DEFAULT_MAX_RESTARTS,
      requireSignatureVerification: options.requireSignatureVerification ?? true,
    };
    this.#metrics = options.metrics;
  }

  get isStarted(): boolean {
    return this.#started && !this.#shutdown;
  }

  async start(): Promise<void> {
    if (this.#shutdown) {
      throw hostError(
        "AdapterHost has been shut down and cannot be restarted.",
        RUNTIME_ERROR_CODES.HOST_SHUTDOWN,
      );
    }
    if (this.#started) {
      throw hostError("AdapterHost is already started.", RUNTIME_ERROR_CODES.HOST_ALREADY_STARTED);
    }
    this.#started = true;
  }

  async registerAdapter(loaded: LoadedAdapter): Promise<void> {
    this.#assertRunning();
    const { providerId } = loaded;
    if (this.#adapters.has(providerId)) {
      const existing = this.#adapters.get(providerId)!;
      if (existing.state !== ADAPTER_STATE.STOPPED && existing.state !== ADAPTER_STATE.FAILED) {
        throw hostError(
          `Adapter "${providerId}" is already registered and active.`,
          RUNTIME_ERROR_CODES.HOST_ALREADY_STARTED,
          { providerId },
        );
      }
    }

    const policy = buildSandboxPolicy(loaded.manifest);
    const sandbox = new SandboxContext(providerId, policy);

    const managed: ManagedAdapter = {
      loaded,
      sandbox,
      state: ADAPTER_STATE.PENDING,
      restartCount: 0,
    };
    this.#adapters.set(providerId, managed);
    await this.#activateAdapter(providerId);
  }

  async deregisterAdapter(providerId: string): Promise<void> {
    this.#assertRunning();
    const managed = this.#requireAdapter(providerId);
    await this.#shutdownAdapter(providerId, managed);
    this.#adapters.delete(providerId);
  }

  getAdapterHealth(providerId: string): AdapterHealthStatus {
    const managed = this.#requireAdapter(providerId);
    return this.#buildHealthStatus(providerId, managed);
  }

  listAdapterHealth(): readonly AdapterHealthStatus[] {
    return Object.freeze(
      Array.from(this.#adapters.entries()).map(([id, managed]) =>
        this.#buildHealthStatus(id, managed),
      ),
    );
  }

  getManifest(providerId: string): AdapterManifest {
    const managed = this.#requireAdapter(providerId);
    return managed.loaded.manifest;
  }

  getSandboxContext(providerId: string): SandboxContext {
    const managed = this.#requireAdapter(providerId);
    return managed.sandbox;
  }

  async callAdapter<T>(
    providerId: string,
    fn: (loaded: LoadedAdapter, sandbox: SandboxContext) => Promise<T>,
  ): Promise<T> {
    this.#assertRunning();
    const managed = this.#requireAdapter(providerId);
    if (managed.state !== ADAPTER_STATE.RUNNING && managed.state !== ADAPTER_STATE.DEGRADED) {
      throw hostError(
        `Adapter "${providerId}" is not available (state: ${managed.state}).`,
        RUNTIME_ERROR_CODES.HOST_NOT_STARTED,
        { providerId, state: managed.state },
      );
    }
    try {
      return await fn(managed.loaded, managed.sandbox);
    } catch (error) {
      managed.lastError = error instanceof Error ? error.message : String(error);
      managed.state = ADAPTER_STATE.DEGRADED;
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.#shutdown) return;
    this.#shutdown = true;
    this.#started = false;

    const shutdownPromises: Promise<void>[] = [];
    for (const [id, managed] of this.#adapters.entries()) {
      shutdownPromises.push(this.#shutdownAdapter(id, managed).catch(() => undefined));
    }
    await Promise.all(shutdownPromises);
    this.#adapters.clear();
  }

  async #activateAdapter(providerId: string): Promise<void> {
    const managed = this.#adapters.get(providerId);
    if (managed === undefined) return;

    managed.state = ADAPTER_STATE.STARTING;
    try {
      const healthy = await this.#runHealthCheckWithTimeout(managed);
      managed.state = healthy ? ADAPTER_STATE.RUNNING : ADAPTER_STATE.DEGRADED;
      managed.lastHealthCheck = new Date().toISOString();

      this.#emitHealthGauge(providerId, healthy);

      if (this.#options.healthCheckIntervalMs > 0) {
        managed.healthTimer = setInterval(
          () => void this.#periodicHealthCheck(providerId),
          this.#options.healthCheckIntervalMs,
        );
        managed.healthTimer.unref?.();
      }
    } catch (error) {
      managed.state = ADAPTER_STATE.FAILED;
      managed.lastError = error instanceof Error ? error.message : String(error);
      this.#emitHealthGauge(providerId, false);
    }
  }

  async #runHealthCheckWithTimeout(managed: ManagedAdapter): Promise<boolean> {
    const timeoutMs = this.#options.healthCheckTimeoutMs;
    return await Promise.race([
      managed.loaded.contract.healthCheck(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              hostError(
                `Health check timed out after ${timeoutMs}ms.`,
                RUNTIME_ERROR_CODES.HOST_HEALTH_TIMEOUT,
                { timeoutMs },
              ),
            ),
          timeoutMs,
        ),
      ),
    ]);
  }

  async #periodicHealthCheck(providerId: string): Promise<void> {
    const managed = this.#adapters.get(providerId);
    if (managed === undefined || this.#shutdown) return;
    if (managed.state === ADAPTER_STATE.STOPPED || managed.state === ADAPTER_STATE.FAILED) return;

    try {
      const healthy = await this.#runHealthCheckWithTimeout(managed);
      managed.lastHealthCheck = new Date().toISOString();
      this.#emitHealthGauge(providerId, healthy);
      if (healthy) {
        if (managed.state === ADAPTER_STATE.DEGRADED) {
          managed.state = ADAPTER_STATE.RUNNING;
        }
      } else {
        managed.state = ADAPTER_STATE.DEGRADED;
        await this.#attemptRestart(providerId, managed);
      }
    } catch {
      managed.state = ADAPTER_STATE.DEGRADED;
      this.#emitHealthGauge(providerId, false);
      await this.#attemptRestart(providerId, managed);
    }
  }

  async #attemptRestart(providerId: string, managed: ManagedAdapter): Promise<void> {
    if (managed.restartCount >= this.#options.maxRestarts) {
      managed.state = ADAPTER_STATE.FAILED;
      managed.lastError = `Restart limit of ${this.#options.maxRestarts} exceeded.`;
      if (managed.healthTimer !== undefined) {
        clearInterval(managed.healthTimer);
        delete managed.healthTimer;
      }
      return;
    }
    managed.restartCount += 1;
    this.#emitRetry(providerId, managed.restartCount);
    managed.state = ADAPTER_STATE.STARTING;
    try {
      const healthy = await this.#runHealthCheckWithTimeout(managed);
      managed.state = healthy ? ADAPTER_STATE.RUNNING : ADAPTER_STATE.DEGRADED;
      managed.lastHealthCheck = new Date().toISOString();
      this.#emitHealthGauge(providerId, healthy);
    } catch {
      managed.state = ADAPTER_STATE.FAILED;
      managed.lastError = `Restart attempt ${managed.restartCount} failed.`;
      this.#emitHealthGauge(providerId, false);
    }
  }

  async #shutdownAdapter(providerId: string, managed: ManagedAdapter): Promise<void> {
    if (managed.healthTimer !== undefined) {
      clearInterval(managed.healthTimer);
      delete managed.healthTimer;
    }
    if (managed.state === ADAPTER_STATE.STOPPED) return;
    managed.state = ADAPTER_STATE.STOPPED;
    try {
      await managed.loaded.contract.shutdown();
    } catch (error) {
      managed.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  #requireAdapter(providerId: string): ManagedAdapter {
    const managed = this.#adapters.get(providerId);
    if (managed === undefined) {
      throw hostError(
        `No adapter registered with provider ID "${providerId}".`,
        RUNTIME_ERROR_CODES.HOST_NOT_STARTED,
        { providerId },
      );
    }
    return managed;
  }

  #assertRunning(): void {
    if (this.#shutdown) {
      throw hostError(
        "AdapterHost has been shut down.",
        RUNTIME_ERROR_CODES.HOST_SHUTDOWN,
      );
    }
    if (!this.#started) {
      throw hostError(
        "AdapterHost has not been started. Call start() first.",
        RUNTIME_ERROR_CODES.HOST_NOT_STARTED,
      );
    }
  }

  #buildHealthStatus(providerId: string, managed: ManagedAdapter): AdapterHealthStatus {
    return Object.freeze({
      state: managed.state,
      providerId,
      restartCount: managed.restartCount,
      ...(managed.lastHealthCheck !== undefined
        ? { lastHealthCheck: managed.lastHealthCheck }
        : {}),
      ...(managed.lastError !== undefined ? { error: managed.lastError } : {}),
    });
  }

  #emitHealthGauge(providerId: string, healthy: boolean): void {
    this.#metrics?.emit({
      name: TELEMETRY_METRIC_NAMES.ADAPTER_HEALTH_GAUGE,
      value: healthy ? 1 : 0,
      unit: TELEMETRY_METRIC_UNITS.ratio,
      metadata: {
        correlationId: `health.${providerId}`,
        origin: "arlopass.adapter-host",
        providerId,
      },
    });
  }

  #emitRetry(providerId: string, attempt: number): void {
    this.#metrics?.emit({
      name: TELEMETRY_METRIC_NAMES.RETRY_TOTAL,
      value: 1,
      metadata: {
        correlationId: `restart.${providerId}`,
        origin: "arlopass.adapter-host",
        providerId,
        attempt,
      },
    });
  }
}
