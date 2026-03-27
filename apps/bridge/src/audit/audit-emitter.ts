import {
  createAuditEvent,
  type AuditEvent,
  type AuditEventFields,
} from "@arlopass/audit";

export type { AuditEvent, AuditEventFields };

export type AuditExportResult = Readonly<{
  exporterIndex: number;
  success: boolean;
  error?: unknown;
}>;

export interface AuditExporter {
  export(event: AuditEvent): void | Promise<void>;
}

export type AuditEmitterMetricName =
  | "audit.export.queued"
  | "audit.export.retried"
  | "audit.export.failed"
  | "audit.export.dropped"
  | "audit.export.succeeded";

export type AuditEmitterMetric = Readonly<{
  name: AuditEmitterMetricName;
  value: number;
  timestamp: string;
  metadata: Readonly<{
    exporterIndex: number;
    attempt: number;
    queueDepth: number;
    correlationId: string;
    origin: string;
    providerId: string;
    modelId: string;
    capability: string;
    decision: AuditEvent["decision"];
    reasonCode: string;
  }>;
}>;

export type AuditEmitterLogLevel = "warn" | "error";

export type AuditEmitterLogReason =
  | "queue_full"
  | "retry_scheduled"
  | "retry_exhausted"
  | "callback_failed";

export type AuditEmitterLogEntry = Readonly<{
  level: AuditEmitterLogLevel;
  reason: AuditEmitterLogReason;
  message: string;
  exporterIndex: number;
  attempt: number;
  queueDepth: number;
  correlationId: string;
  providerId: string;
  reasonCode: string;
  error?: unknown;
}>;

export type AuditEmitterDiagnostics = Readonly<{
  queued: number;
  retried: number;
  failed: number;
  dropped: number;
  succeeded: number;
  queueDepth: number;
  inFlight: number;
  maxQueueDepth: number;
}>;

export class AuditQueueCapacityError extends Error {
  readonly capacity: number;

  constructor(capacity: number) {
    super(`Audit export queue capacity reached (${capacity}).`);
    this.name = "AuditQueueCapacityError";
    this.capacity = capacity;
  }
}

type MutableDiagnostics = {
  queued: number;
  retried: number;
  failed: number;
  dropped: number;
  succeeded: number;
  maxQueueDepth: number;
};

type QueueEntry = Readonly<{
  event: AuditEvent;
  exporterIndex: number;
  attempt: number;
  readyAtMs: number;
}>;

const DEFAULT_MAX_QUEUE_SIZE = 1024;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 50;
const DEFAULT_MAX_RETRY_DELAY_MS = 5000;

function normalizePositiveInt(
  value: number | undefined,
  fallback: number,
  fieldName: string,
): number {
  const candidate = value ?? fallback;
  if (!Number.isInteger(candidate) || candidate <= 0) {
    throw new TypeError(`"${fieldName}" must be a positive integer.`);
  }
  return candidate;
}

function normalizeNonNegativeInt(
  value: number | undefined,
  fallback: number,
  fieldName: string,
): number {
  const candidate = value ?? fallback;
  if (!Number.isInteger(candidate) || candidate < 0) {
    throw new TypeError(`"${fieldName}" must be a non-negative integer.`);
  }
  return candidate;
}

function defaultLogEntrySink(entry: AuditEmitterLogEntry): void {
  const errorMessage =
    entry.error instanceof Error
      ? `${entry.error.name}: ${entry.error.message}`
      : entry.error === undefined
        ? undefined
        : String(entry.error);
  process.stderr.write(
    `[arlopass-bridge][audit-emitter] ${entry.message} ` +
    JSON.stringify({
      reason: entry.reason,
      exporterIndex: entry.exporterIndex,
      attempt: entry.attempt,
      queueDepth: entry.queueDepth,
      correlationId: entry.correlationId,
      providerId: entry.providerId,
      reasonCode: entry.reasonCode,
      ...(errorMessage !== undefined ? { error: errorMessage } : {}),
    }) +
    "\n",
  );
}

/**
 * Audit event emitter for the bridge process.
 *
 * Durably forwards structured audit events to registered exporters using
 * bounded buffering and deterministic retry backoff. Export failures are
 * surfaced through callbacks, metrics, and logging without blocking the
 * caller's request path indefinitely.
 */
export class AuditEmitter {
  readonly #exporters: AuditExporter[] = [];
  readonly #onExportError: ((error: unknown, exporterIndex: number) => void) | undefined;
  readonly #onMetric:
    | ((metric: AuditEmitterMetric) => void)
    | undefined;
  readonly #onLog:
    | ((entry: AuditEmitterLogEntry) => void)
    | undefined;
  readonly #now: () => Date;
  readonly #maxQueueSize: number;
  readonly #maxAttempts: number;
  readonly #retryBaseDelayMs: number;
  readonly #maxRetryDelayMs: number;
  readonly #queue: QueueEntry[] = [];
  readonly #diagnostics: MutableDiagnostics = {
    queued: 0,
    retried: 0,
    failed: 0,
    dropped: 0,
    succeeded: 0,
    maxQueueDepth: 0,
  };
  readonly #idleWaiters: Array<() => void> = [];
  readonly #busyExporterIndices = new Set<number>();
  #bufferedEntries = 0;
  #inFlight = 0;
  #draining = false;
  #drainScheduled = false;
  #wakeTimer: ReturnType<typeof setTimeout> | undefined;
  #nextWakeAtMs: number | undefined;

  constructor(options: {
    onExportError?: (error: unknown, exporterIndex: number) => void;
    onMetric?: (metric: AuditEmitterMetric) => void;
    onLog?: (entry: AuditEmitterLogEntry) => void;
    now?: () => Date;
    maxQueueSize?: number;
    maxAttempts?: number;
    retryBaseDelayMs?: number;
    maxRetryDelayMs?: number;
  } = {}) {
    this.#onExportError = options.onExportError;
    this.#onMetric = options.onMetric;
    this.#onLog = options.onLog ?? defaultLogEntrySink;
    this.#now = options.now ?? (() => new Date());
    this.#maxQueueSize = normalizePositiveInt(
      options.maxQueueSize,
      DEFAULT_MAX_QUEUE_SIZE,
      "maxQueueSize",
    );
    this.#maxAttempts = normalizePositiveInt(
      options.maxAttempts,
      DEFAULT_MAX_ATTEMPTS,
      "maxAttempts",
    );
    this.#retryBaseDelayMs = normalizeNonNegativeInt(
      options.retryBaseDelayMs,
      DEFAULT_RETRY_BASE_DELAY_MS,
      "retryBaseDelayMs",
    );
    this.#maxRetryDelayMs = normalizeNonNegativeInt(
      options.maxRetryDelayMs,
      DEFAULT_MAX_RETRY_DELAY_MS,
      "maxRetryDelayMs",
    );
    if (this.#maxRetryDelayMs < this.#retryBaseDelayMs) {
      throw new TypeError(
        `"maxRetryDelayMs" must be greater than or equal to "retryBaseDelayMs".`,
      );
    }
  }

  /** Register an exporter. Exporters receive every emitted event. */
  addExporter(exporter: AuditExporter): void {
    this.#exporters.push(exporter);
  }

  /**
   * Create and queue an audit event for asynchronous export.
   *
   * Throws AuditSchemaError if the supplied fields are incomplete.
   */
  emit(fields: AuditEventFields & { metadata?: Record<string, unknown> }): void {
    const event = createAuditEvent(fields);
    for (let i = 0; i < this.#exporters.length; i++) {
      this.#enqueue(event, i);
    }
    this.#scheduleDrain();
  }

  /**
   * Async variant that awaits all exporters and returns a per-exporter
   * result array while applying the same deterministic retry policy.
   *
   * Throws AuditSchemaError if the supplied fields are incomplete.
   */
  async emitAsync(
    fields: AuditEventFields & { metadata?: Record<string, unknown> },
  ): Promise<readonly AuditExportResult[]> {
    const event = createAuditEvent(fields);
    const results: AuditExportResult[] = [];

    for (let i = 0; i < this.#exporters.length; i++) {
      results.push(await this.#exportWithRetries(event, i));
    }

    return Object.freeze(results);
  }

  /** Number of registered exporters. */
  get exporterCount(): number {
    return this.#exporters.length;
  }

  getDiagnostics(): AuditEmitterDiagnostics {
    return {
      queued: this.#diagnostics.queued,
      retried: this.#diagnostics.retried,
      failed: this.#diagnostics.failed,
      dropped: this.#diagnostics.dropped,
      succeeded: this.#diagnostics.succeeded,
      queueDepth: this.#bufferedEntries,
      inFlight: this.#inFlight,
      maxQueueDepth: this.#diagnostics.maxQueueDepth,
    };
  }

  async waitForIdle(): Promise<void> {
    if (this.#isIdle()) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.#idleWaiters.push(resolve);
    });
  }

  #enqueue(event: AuditEvent, exporterIndex: number): void {
    if (this.#bufferedEntries >= this.#maxQueueSize) {
      const error = new AuditQueueCapacityError(this.#maxQueueSize);
      this.#diagnostics.dropped += 1;
      this.#recordMetric("audit.export.dropped", event, exporterIndex, 1);
      this.#recordLog({
        level: "warn",
        reason: "queue_full",
        message: "Audit event dropped because queue capacity was reached.",
        event,
        exporterIndex,
        attempt: 1,
        error,
      });
      this.#notifyExportError(error, exporterIndex);
      return;
    }

    const entry: QueueEntry = {
      event,
      exporterIndex,
      attempt: 1,
      readyAtMs: this.#nowMs(),
    };
    this.#queue.push(entry);
    this.#bufferedEntries += 1;
    this.#diagnostics.queued += 1;
    this.#diagnostics.maxQueueDepth = Math.max(
      this.#diagnostics.maxQueueDepth,
      this.#bufferedEntries,
    );
    this.#recordMetric("audit.export.queued", event, exporterIndex, 1);
  }

  #scheduleDrain(): void {
    if (this.#drainScheduled) {
      return;
    }
    this.#drainScheduled = true;
    queueMicrotask(() => {
      this.#drainScheduled = false;
      void this.#drainQueue();
    });
  }

  async #drainQueue(): Promise<void> {
    if (this.#draining) {
      return;
    }

    this.#draining = true;
    this.#clearWakeTimer();
    try {
      let entry = this.#dequeueReadyEntry();
      while (entry !== undefined) {
        this.#dispatchEntry(entry);
        entry = this.#dequeueReadyEntry();
      }
    } finally {
      this.#draining = false;
      if (this.#hasDispatchableReadyEntry()) {
        this.#scheduleDrain();
      } else {
        this.#armWakeTimer();
      }
      this.#resolveIdleWaitersIfIdle();
    }
  }

  #dequeueReadyEntry(): QueueEntry | undefined {
    const nowMs = this.#nowMs();
    for (let i = 0; i < this.#queue.length; i++) {
      const candidate = this.#queue[i]!;
      if (
        candidate.readyAtMs <= nowMs &&
        !this.#busyExporterIndices.has(candidate.exporterIndex)
      ) {
        const [entry] = this.#queue.splice(i, 1);
        return entry;
      }
    }
    return undefined;
  }

  #dispatchEntry(entry: QueueEntry): void {
    this.#busyExporterIndices.add(entry.exporterIndex);
    this.#inFlight += 1;
    void (async () => {
      try {
        await this.#exporters[entry.exporterIndex]!.export(entry.event);
        this.#markEntrySucceeded(entry);
      } catch (error) {
        this.#markEntryFailed(entry, error);
      } finally {
        this.#inFlight -= 1;
        this.#busyExporterIndices.delete(entry.exporterIndex);
        this.#scheduleDrain();
        this.#resolveIdleWaitersIfIdle();
      }
    })();
  }

  #hasDispatchableReadyEntry(): boolean {
    const nowMs = this.#nowMs();
    return this.#queue.some(
      (entry) =>
        entry.readyAtMs <= nowMs && !this.#busyExporterIndices.has(entry.exporterIndex),
    );
  }

  #armWakeTimer(): void {
    const earliestReadyAt = this.#nextDispatchableReadyAtMs();
    if (earliestReadyAt === undefined) {
      this.#clearWakeTimer();
      return;
    }

    if (
      this.#nextWakeAtMs !== undefined &&
      this.#nextWakeAtMs <= earliestReadyAt &&
      this.#wakeTimer !== undefined
    ) {
      return;
    }

    this.#clearWakeTimer();
    this.#nextWakeAtMs = earliestReadyAt;
    const delayMs = Math.max(0, earliestReadyAt - this.#nowMs());
    this.#wakeTimer = setTimeout(() => {
      this.#wakeTimer = undefined;
      this.#nextWakeAtMs = undefined;
      this.#scheduleDrain();
    }, delayMs);
    this.#wakeTimer.unref?.();
  }

  #nextDispatchableReadyAtMs(): number | undefined {
    let earliestReadyAtMs: number | undefined;
    for (const entry of this.#queue) {
      if (this.#busyExporterIndices.has(entry.exporterIndex)) {
        continue;
      }
      earliestReadyAtMs =
        earliestReadyAtMs === undefined
          ? entry.readyAtMs
          : Math.min(earliestReadyAtMs, entry.readyAtMs);
    }
    return earliestReadyAtMs;
  }

  #clearWakeTimer(): void {
    if (this.#wakeTimer === undefined) {
      return;
    }
    clearTimeout(this.#wakeTimer);
    this.#wakeTimer = undefined;
    this.#nextWakeAtMs = undefined;
  }

  #markEntrySucceeded(entry: QueueEntry): void {
    this.#bufferedEntries = Math.max(0, this.#bufferedEntries - 1);
    this.#diagnostics.succeeded += 1;
    this.#recordMetric(
      "audit.export.succeeded",
      entry.event,
      entry.exporterIndex,
      entry.attempt,
    );
  }

  #markEntryFailed(entry: QueueEntry, error: unknown): void {
    this.#notifyExportError(error, entry.exporterIndex);

    if (entry.attempt < this.#maxAttempts) {
      const nextAttempt = entry.attempt + 1;
      const retryDelayMs = this.#retryDelayMs(entry.attempt);
      const retryEntry: QueueEntry = {
        ...entry,
        attempt: nextAttempt,
        readyAtMs: this.#nowMs() + retryDelayMs,
      };
      this.#queue.push(retryEntry);
      this.#diagnostics.retried += 1;
      this.#recordMetric(
        "audit.export.retried",
        entry.event,
        entry.exporterIndex,
        nextAttempt,
      );
      this.#recordLog({
        level: "warn",
        reason: "retry_scheduled",
        message: `Audit export failed; scheduling retry in ${retryDelayMs}ms.`,
        event: entry.event,
        exporterIndex: entry.exporterIndex,
        attempt: nextAttempt,
        error,
      });
      return;
    }

    this.#bufferedEntries = Math.max(0, this.#bufferedEntries - 1);
    this.#diagnostics.failed += 1;
    this.#recordMetric(
      "audit.export.failed",
      entry.event,
      entry.exporterIndex,
      entry.attempt,
    );
    this.#recordLog({
      level: "error",
      reason: "retry_exhausted",
      message: "Audit export retries exhausted; event marked as failed.",
      event: entry.event,
      exporterIndex: entry.exporterIndex,
      attempt: entry.attempt,
      error,
    });
  }

  async #exportWithRetries(
    event: AuditEvent,
    exporterIndex: number,
  ): Promise<AuditExportResult> {
    let attempt = 1;
    while (attempt <= this.#maxAttempts) {
      try {
        await this.#exporters[exporterIndex]!.export(event);
        this.#diagnostics.succeeded += 1;
        this.#recordMetric("audit.export.succeeded", event, exporterIndex, attempt);
        return { exporterIndex, success: true };
      } catch (error) {
        this.#notifyExportError(error, exporterIndex);
        if (attempt >= this.#maxAttempts) {
          this.#diagnostics.failed += 1;
          this.#recordMetric("audit.export.failed", event, exporterIndex, attempt);
          this.#recordLog({
            level: "error",
            reason: "retry_exhausted",
            message: "Audit export retries exhausted in emitAsync.",
            event,
            exporterIndex,
            attempt,
            error,
          });
          return { exporterIndex, success: false, error };
        }
        const retryDelayMs = this.#retryDelayMs(attempt);
        attempt += 1;
        this.#diagnostics.retried += 1;
        this.#recordMetric("audit.export.retried", event, exporterIndex, attempt);
        this.#recordLog({
          level: "warn",
          reason: "retry_scheduled",
          message: `Audit export failed in emitAsync; retrying in ${retryDelayMs}ms.`,
          event,
          exporterIndex,
          attempt,
          error,
        });
        if (retryDelayMs > 0) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, retryDelayMs);
          });
        }
      }
    }
    return { exporterIndex, success: false };
  }

  #notifyExportError(error: unknown, exporterIndex: number): void {
    if (this.#onExportError === undefined) {
      return;
    }
    try {
      this.#onExportError(error, exporterIndex);
    } catch (callbackError) {
      this.#recordLog({
        level: "error",
        reason: "callback_failed",
        message: "Audit onExportError callback threw unexpectedly.",
        event: {
          timestamp: this.#now().toISOString(),
          origin: "arlopass.bridge",
          providerId: "bridge",
          modelId: "audit-emitter",
          capability: "audit.export",
          decision: "deny",
          reasonCode: "audit.callback.failed",
          correlationId: "audit.callback.error",
          policyVersion: "unknown",
        },
        exporterIndex,
        attempt: 1,
        error: callbackError,
      });
    }
  }

  #recordMetric(
    name: AuditEmitterMetricName,
    event: AuditEvent,
    exporterIndex: number,
    attempt: number,
  ): void {
    if (this.#onMetric === undefined) {
      return;
    }
    const metric: AuditEmitterMetric = {
      name,
      value: 1,
      timestamp: this.#now().toISOString(),
      metadata: {
        exporterIndex,
        attempt,
        queueDepth: this.#bufferedEntries,
        correlationId: event.correlationId,
        origin: event.origin,
        providerId: event.providerId,
        modelId: event.modelId,
        capability: event.capability,
        decision: event.decision,
        reasonCode: event.reasonCode,
      },
    };

    try {
      this.#onMetric(metric);
    } catch (callbackError) {
      this.#recordLog({
        level: "error",
        reason: "callback_failed",
        message: "Audit onMetric callback threw unexpectedly.",
        event,
        exporterIndex,
        attempt,
        error: callbackError,
      });
    }
  }

  #recordLog(input: Readonly<{
    level: AuditEmitterLogLevel;
    reason: AuditEmitterLogReason;
    message: string;
    event: AuditEvent;
    exporterIndex: number;
    attempt: number;
    error?: unknown;
  }>): void {
    if (this.#onLog === undefined) {
      return;
    }
    const entry: AuditEmitterLogEntry = {
      level: input.level,
      reason: input.reason,
      message: input.message,
      exporterIndex: input.exporterIndex,
      attempt: input.attempt,
      queueDepth: this.#bufferedEntries,
      correlationId: input.event.correlationId,
      providerId: input.event.providerId,
      reasonCode: input.event.reasonCode,
      ...(input.error !== undefined ? { error: input.error } : {}),
    };
    try {
      this.#onLog(entry);
    } catch {
      defaultLogEntrySink({
        ...entry,
        level: "error",
        reason: "callback_failed",
        message: "Audit onLog callback threw unexpectedly.",
      });
    }
  }

  #retryDelayMs(attempt: number): number {
    const exponentialDelay = this.#retryBaseDelayMs * 2 ** (attempt - 1);
    return Math.min(this.#maxRetryDelayMs, exponentialDelay);
  }

  #nowMs(): number {
    return this.#now().getTime();
  }

  #isIdle(): boolean {
    return (
      this.#bufferedEntries === 0 &&
      this.#inFlight === 0 &&
      this.#queue.length === 0 &&
      !this.#draining &&
      this.#wakeTimer === undefined
    );
  }

  #resolveIdleWaitersIfIdle(): void {
    if (!this.#isIdle()) {
      return;
    }
    const waiters = this.#idleWaiters.splice(0);
    for (const resolve of waiters) {
      resolve();
    }
  }
}
