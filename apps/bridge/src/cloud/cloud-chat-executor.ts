import { TIMEOUT_BUDGETS } from "./timeout-budgets.js";
import {
  InMemoryTokenLeaseManager,
  type LeaseScopeInput,
  type TokenLeaseManager,
} from "./token-lease-manager.js";
import { CloudObservability } from "../telemetry/cloud-observability.js";

type CloudChatRole = "system" | "user" | "assistant";

export type CloudChatMessage = Readonly<{
  role: CloudChatRole;
  content: string;
}>;

export type CloudChatExecuteRequest = Readonly<{
  correlationId: string;
  tenantId: string;
  origin: string;
  extensionId: string;
  providerId: string;
  methodId: string;
  modelId: string;
  connectionHandle: string;
  messages: readonly CloudChatMessage[];
  policyVersion: string;
  endpointProfileHash: string;
  streamRequested?: boolean;
  onChunk?: (chunk: string) => void;
  region?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}>;

export type CloudChatExecuteResult = Readonly<{
  correlationId: string;
  providerId: string;
  methodId: string;
  modelId: string;
  region: string;
  content: string;
}>;

export type CloudReconnectRequiredEvent = Readonly<{
  providerId: string;
  methodId: string;
  reasonCode: "auth.expired";
  correlationId: string;
}>;

export type CloudRevocationAuditMarker = Readonly<{
  correlationId: string;
  providerId: string;
  methodId: string;
  region: string;
  revocation_race_terminated: true;
}>;

export type BreakerScopeInput = Readonly<{
  tenantId: string;
  origin: string;
  providerId: string;
  methodId: string;
  region?: string;
}>;

export type BreakerPolicy = Readonly<{
  openAfterConsecutiveFailures: number;
  failureWindowMs: number;
  halfOpenAfterMs: number;
  closeAfterConsecutiveSuccesses: number;
}>;

export type BackpressurePolicy = Readonly<{
  perOriginInFlightCap: number;
  perProviderStreamCap: number;
  perOriginQueueCap: number;
  perProviderQueueCap: number;
}>;

export type RetryBackoffPolicy = Readonly<{
  baseDelayMs: number;
  multiplier: number;
  maxDelayMs: number;
  jitterRatio: number;
  maxRetryBudgetMs: number;
  maxAttempts: Readonly<{
    controlPlaneValidation: number;
    dataPlaneSend: number;
    streamSetup: number;
  }>;
}>;

export type CloudExecutorPolicy = Readonly<{
  breaker: BreakerPolicy;
  backpressure: BackpressurePolicy;
  retryBackoff: RetryBackoffPolicy;
}>;

export const EXECUTOR_POLICY_DEFAULTS: CloudExecutorPolicy = Object.freeze({
  breaker: Object.freeze({
    openAfterConsecutiveFailures: 5,
    failureWindowMs: 60_000,
    halfOpenAfterMs: 30_000,
    closeAfterConsecutiveSuccesses: 3,
  }),
  backpressure: Object.freeze({
    perOriginInFlightCap: 3,
    perProviderStreamCap: 5,
    perOriginQueueCap: 6,
    perProviderQueueCap: 10,
  }),
  retryBackoff: Object.freeze({
    baseDelayMs: 250,
    multiplier: 2,
    maxDelayMs: 8_000,
    jitterRatio: 0.2,
    maxRetryBudgetMs: 10_000,
    maxAttempts: Object.freeze({
      controlPlaneValidation: 2,
      dataPlaneSend: 3,
      streamSetup: 2,
    }),
  }),
});

export const executorPolicy = EXECUTOR_POLICY_DEFAULTS;

export type CloudChatExecutionReasonCode =
  | "request.invalid"
  | "auth.invalid"
  | "auth.expired"
  | "policy.denied"
  | "provider.unavailable"
  | "transport.timeout"
  | "transport.cancelled"
  | "transport.transient_failure";

type CloudChatErrorDetails = Readonly<Record<string, string | number | boolean | null>>;

type NormalizedExecutionRequest = Readonly<{
  correlationId: string;
  tenantId: string;
  origin: string;
  extensionId: string;
  providerId: string;
  methodId: string;
  modelId: string;
  connectionHandle: string;
  messages: readonly CloudChatMessage[];
  policyVersion: string;
  endpointProfileHash: string;
  streamRequested: boolean;
  onChunk?: (chunk: string) => void;
  region: string;
  timeoutMs: number;
  signal?: AbortSignal;
}>;

type ExecutionTimingState = {
  readonly executionStartedAtMs: number;
  queueWaitRecorded: boolean;
  firstResultRecorded: boolean;
};

type ExecutionCancellationContext = Readonly<{
  signal: AbortSignal;
  timeoutMs: number;
  deadlineAtMs: number;
  isTimedOut: () => boolean;
  dispose: () => void;
}>;

type BreakerState = {
  mode: "closed" | "open" | "half-open";
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  windowStartedAtMs: number;
  openUntilMs: number;
};

type BackpressureWaiter = {
  request: NormalizedExecutionRequest;
  cancellation: ExecutionCancellationContext;
  resolve: () => void;
  reject: (error: unknown) => void;
  onAbort: () => void;
  settled: boolean;
};

type RetryableReasonCode =
  | "provider.unavailable"
  | "transport.timeout"
  | "transport.transient_failure";

const RETRYABLE_REASON_CODES = new Set<RetryableReasonCode>([
  "provider.unavailable",
  "transport.timeout",
  "transport.transient_failure",
]);

const MAX_DATA_PLANE_SEND_ATTEMPTS_CAP = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new CloudChatExecutionError(
      `cloud.chat.execute requires non-empty ${field}.`,
      {
        reasonCode: "request.invalid",
      },
    );
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new CloudChatExecutionError(
      `cloud.chat.execute requires non-empty ${field}.`,
      {
        reasonCode: "request.invalid",
      },
    );
  }
  return normalized;
}

function parseReasonCode(value: string): CloudChatExecutionReasonCode | undefined {
  switch (value) {
    case "request.invalid":
    case "auth.invalid":
    case "auth.expired":
    case "policy.denied":
    case "provider.unavailable":
    case "transport.timeout":
    case "transport.cancelled":
    case "transport.transient_failure":
      return value;
    default:
      return undefined;
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toSafeDetails(
  details: unknown,
): CloudChatErrorDetails | undefined {
  if (!isRecord(details)) {
    return undefined;
  }
  const normalized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(details)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      normalized[key] = value;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeRegion(value: string | undefined): string {
  if (typeof value !== "string") {
    return "global";
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : "global";
}

export function buildBreakerScopeKey(input: BreakerScopeInput): string {
  const tenantId = normalizeNonEmpty(input.tenantId, "tenantId");
  const origin = normalizeNonEmpty(input.origin, "origin");
  const providerId = normalizeNonEmpty(input.providerId, "providerId");
  const methodId = normalizeNonEmpty(input.methodId, "methodId");
  const region = normalizeRegion(input.region);
  return [tenantId, origin, providerId, methodId, region].join("::");
}

export class CloudChatExecutionError extends Error {
  readonly reasonCode: CloudChatExecutionReasonCode;
  readonly details: CloudChatErrorDetails | undefined;

  constructor(
    message: string,
    options: Readonly<{
      reasonCode: CloudChatExecutionReasonCode;
      details?: CloudChatErrorDetails;
      cause?: Error;
    }>,
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "CloudChatExecutionError";
    this.reasonCode = options.reasonCode;
    this.details = options.details;
  }
}

export type CredentialEpochLookup = Readonly<{
  getCredentialEpoch(input: Readonly<{
    providerId: string;
    methodId: string;
    connectionHandle: string;
    region: string;
    extensionId: string;
    origin: string;
    policyVersion: string;
    endpointProfileHash: string;
  }>): Promise<number>;
}>;

export type CloudDataPlaneSend = (
  request: NormalizedExecutionRequest,
) => Promise<Readonly<{ content: string }>>;

export type CloudChatExecutorContract = Readonly<{
  execute(request: CloudChatExecuteRequest): Promise<CloudChatExecuteResult>;
}>;

type CloudChatExecutorOptions = Readonly<{
  tokenLeaseManager?: TokenLeaseManager;
  epochLookup: CredentialEpochLookup;
  dataPlaneSend: CloudDataPlaneSend;
  observability?: CloudObservability;
  policy?: CloudExecutorPolicy;
  onReconnectRequired?: (event: CloudReconnectRequiredEvent) => void;
  emitAuditMarker?: (marker: CloudRevocationAuditMarker) => void;
  now?: () => number;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}>;

export class CloudChatExecutor implements CloudChatExecutorContract {
  readonly #tokenLeaseManager: TokenLeaseManager;
  readonly #epochLookup: CredentialEpochLookup;
  readonly #dataPlaneSend: CloudDataPlaneSend;
  readonly #observability: CloudObservability | undefined;
  readonly #policy: CloudExecutorPolicy;
  readonly #onReconnectRequired:
    | ((event: CloudReconnectRequiredEvent) => void)
    | undefined;
  readonly #emitAuditMarker:
    | ((marker: CloudRevocationAuditMarker) => void)
    | undefined;
  readonly #now: () => number;
  readonly #sleep: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  readonly #originInFlight = new Map<string, number>();
  readonly #providerInFlight = new Map<string, number>();
  readonly #originQueued = new Map<string, number>();
  readonly #providerQueued = new Map<string, number>();
  readonly #admissionQueue: BackpressureWaiter[] = [];
  readonly #breakerByScope = new Map<string, BreakerState>();

  constructor(options: CloudChatExecutorOptions) {
    this.#tokenLeaseManager =
      options.tokenLeaseManager ?? new InMemoryTokenLeaseManager();
    this.#epochLookup = options.epochLookup;
    this.#dataPlaneSend = options.dataPlaneSend;
    this.#observability = options.observability;
    this.#policy = options.policy ?? EXECUTOR_POLICY_DEFAULTS;
    this.#onReconnectRequired = options.onReconnectRequired;
    this.#emitAuditMarker = options.emitAuditMarker;
    this.#now = options.now ?? (() => Date.now());
    this.#sleep =
      options.sleep ??
      (async (delayMs: number, signal?: AbortSignal) =>
        new Promise<void>((resolve, reject) => {
          const boundedDelay = Math.max(0, Math.floor(delayMs));
          if (signal?.aborted === true) {
            reject(this.#normalizeAbortReason(signal.reason));
            return;
          }
          if (signal === undefined) {
            setTimeout(() => {
              resolve();
            }, boundedDelay);
            return;
          }

          const onAbort = () => {
            clearTimeout(timeoutHandle);
            reject(this.#normalizeAbortReason(signal.reason));
          };

          const timeoutHandle = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
          }, boundedDelay);
          signal.addEventListener("abort", onAbort, { once: true });
        }));
  }

  async execute(request: CloudChatExecuteRequest): Promise<CloudChatExecuteResult> {
    const normalized = this.#normalizeRequest(request);
    const cancellation = this.#createCancellationContext(normalized);
    const timingState: ExecutionTimingState = {
      executionStartedAtMs: this.#now(),
      queueWaitRecorded: false,
      firstResultRecorded: false,
    };
    let backpressureAcquired = false;
    const breakerKey = buildBreakerScopeKey({
      tenantId: normalized.tenantId,
      origin: normalized.origin,
      providerId: normalized.providerId,
      methodId: normalized.methodId,
      region: normalized.region,
    });
    this.#assertBreakerAllowsExecution(breakerKey);

    try {
      await this.#acquireBackpressureSlots(normalized, cancellation, timingState);
      backpressureAcquired = true;
      const result = await this.#executeWithGuards(
        normalized,
        cancellation,
        timingState,
      );
      this.#recordBreakerSuccess(breakerKey);
      return result;
    } catch (error) {
      const executionError = this.#toExecutionError(
        this.#mapCancellationError(error, normalized, cancellation),
      );
      if (executionError.reasonCode === "auth.expired") {
        this.#emitReconnectRequiredSignal(normalized);
      }
      this.#recordBreakerFailure(breakerKey, executionError.reasonCode);
      throw executionError;
    } finally {
      cancellation.dispose();
      if (backpressureAcquired) {
        this.#releaseBackpressureSlots(normalized);
      }
    }
  }

  #normalizeRequest(request: CloudChatExecuteRequest): NormalizedExecutionRequest {
    const correlationId = normalizeNonEmpty(request.correlationId, "correlationId");
    const tenantId = normalizeNonEmpty(request.tenantId, "tenantId");
    const origin = normalizeNonEmpty(request.origin, "origin");
    const extensionId = normalizeNonEmpty(request.extensionId, "extensionId");
    const providerId = normalizeNonEmpty(request.providerId, "providerId");
    const methodId = normalizeNonEmpty(request.methodId, "methodId");
    const modelId = normalizeNonEmpty(request.modelId, "modelId");
    const policyVersion = normalizeNonEmpty(
      request.policyVersion,
      "policyVersion",
    );
    const endpointProfileHash = normalizeNonEmpty(
      request.endpointProfileHash,
      "endpointProfileHash",
    );
    const connectionHandle = normalizeNonEmpty(
      request.connectionHandle,
      "connectionHandle",
    );
    const region = normalizeRegion(request.region);

    if (!Array.isArray(request.messages) || request.messages.length === 0) {
      throw new CloudChatExecutionError(
        "cloud.chat.execute requires a non-empty messages array.",
        {
          reasonCode: "request.invalid",
          details: { correlationId },
        },
      );
    }

    const messages: CloudChatMessage[] = [];
    for (const entry of request.messages) {
      if (
        !isRecord(entry) ||
        (entry["role"] !== "system" &&
          entry["role"] !== "user" &&
          entry["role"] !== "assistant") ||
        typeof entry["content"] !== "string" ||
        entry["content"].trim().length === 0
      ) {
        throw new CloudChatExecutionError(
          "cloud.chat.execute contains an invalid message.",
          {
            reasonCode: "request.invalid",
            details: { correlationId },
          },
        );
      }
      messages.push({
        role: entry["role"],
        content: entry["content"],
      });
    }

    const timeoutMs =
      typeof request.timeoutMs === "number" && Number.isFinite(request.timeoutMs)
        ? Math.max(1, Math.floor(request.timeoutMs))
        : TIMEOUT_BUDGETS.chatSendMs;
    const streamRequested = request.streamRequested === true;

    return {
      correlationId,
      tenantId,
      origin,
      extensionId,
      providerId,
      methodId,
      modelId,
      connectionHandle,
      messages,
      policyVersion,
      endpointProfileHash,
      streamRequested,
      region,
      timeoutMs,
      ...(typeof request.onChunk === "function" ? { onChunk: request.onChunk } : {}),
      ...(request.signal instanceof AbortSignal ? { signal: request.signal } : {}),
    };
  }

  async #executeWithGuards(
    request: NormalizedExecutionRequest,
    cancellation: ExecutionCancellationContext,
    timingState: ExecutionTimingState,
  ): Promise<CloudChatExecuteResult> {
    this.#throwIfCancelled(request, cancellation);
    const admissionEpoch = await this.#readCredentialEpoch(request, cancellation);
    const admissionEpochAfterLock = await this.#withCancellation(
      this.#tokenLeaseManager.withRefreshLease(this.#leaseScopeFor(request), async () => {
        this.#throwIfCancelled(request, cancellation);
        const currentEpoch = await this.#readCredentialEpoch(request, cancellation);
        if (currentEpoch !== admissionEpoch) {
          throw new CloudChatExecutionError(
            "Credential was revoked during refresh wait.",
            {
              reasonCode: "auth.expired",
              details: {
                correlationId: request.correlationId,
              },
            },
          );
        }
        return currentEpoch;
      }),
      request,
      cancellation,
    );

    const sendResult = await this.#sendWithRetries(
      request,
      cancellation,
      timingState,
    );
    const completionEpoch = await this.#readCredentialEpoch(request, cancellation);
    if (completionEpoch !== admissionEpochAfterLock) {
      this.#emitCompletionRevocationAuditMarker(request);
      throw new CloudChatExecutionError(
        "Credential was revoked before completion commit.",
        {
          reasonCode: "auth.expired",
          details: {
            correlationId: request.correlationId,
          },
        },
      );
    }

    const content = sendResult.content.trim();
    if (content.length === 0) {
      throw new CloudChatExecutionError(
        "Cloud provider returned an empty chat completion.",
        {
          reasonCode: "provider.unavailable",
          details: {
            correlationId: request.correlationId,
          },
        },
      );
    }

    return {
      correlationId: request.correlationId,
      providerId: request.providerId,
      methodId: request.methodId,
      modelId: request.modelId,
      region: request.region,
      content,
    };
  }

  #leaseScopeFor(request: NormalizedExecutionRequest): LeaseScopeInput {
    return {
      providerId: request.providerId,
      methodId: request.methodId,
      region: request.region,
    };
  }

  async #readCredentialEpoch(
    request: NormalizedExecutionRequest,
    cancellation: ExecutionCancellationContext,
  ): Promise<number> {
    const epoch = await this.#withCancellation(
      this.#epochLookup.getCredentialEpoch({
        providerId: request.providerId,
        methodId: request.methodId,
        connectionHandle: request.connectionHandle,
        region: request.region,
        extensionId: request.extensionId,
        origin: request.origin,
        policyVersion: request.policyVersion,
        endpointProfileHash: request.endpointProfileHash,
      }),
      request,
      cancellation,
    );
    if (!Number.isInteger(epoch) || epoch < 0) {
      throw new CloudChatExecutionError(
        "Credential epoch lookup returned an invalid value.",
        {
          reasonCode: "auth.invalid",
          details: {
            correlationId: request.correlationId,
          },
        },
      );
    }
    return epoch;
  }

  async #sendWithRetries(
    request: NormalizedExecutionRequest,
    cancellation: ExecutionCancellationContext,
    timingState: ExecutionTimingState,
  ): Promise<Readonly<{ content: string }>> {
    const retryBackoff = this.#policy.retryBackoff;
    const configuredAttempts = Math.floor(retryBackoff.maxAttempts.dataPlaneSend);
    const maxAttempts = Math.max(
      1,
      Math.min(MAX_DATA_PLANE_SEND_ATTEMPTS_CAP, configuredAttempts),
    );
    let retryBudgetRemainingMs = Math.max(
      0,
      Math.floor(retryBackoff.maxRetryBudgetMs),
    );
    let attempt = 1;
    while (attempt <= maxAttempts) {
      this.#throwIfCancelled(request, cancellation);
      const sendStartedAtMs = this.#now();
      try {
        const remainingTimeoutMs = this.#remainingTimeoutMs(cancellation);
        const sendResult = await this.#withCancellation(
          this.#dataPlaneSend({
            ...request,
            timeoutMs: remainingTimeoutMs,
            signal: cancellation.signal,
          }),
          request,
          cancellation,
        );
        this.#recordSendStageLatency({
          request,
          durationMs: this.#now() - sendStartedAtMs,
          attempt,
        });
        this.#recordFirstResultLatencyProxy(request, timingState);
        return sendResult;
      } catch (error) {
        const executionError = this.#toExecutionError(
          this.#mapCancellationError(error, request, cancellation),
        );
        this.#recordSendStageLatency({
          request,
          durationMs: this.#now() - sendStartedAtMs,
          attempt,
          reasonCode: executionError.reasonCode,
          retryable: this.#isRetryableReasonCode(executionError.reasonCode),
        });
        if (
          !this.#isRetryableReasonCode(executionError.reasonCode) ||
          attempt >= maxAttempts
        ) {
          throw executionError;
        }

        const retryDelayByPolicyMs = this.#retryDelayMs(attempt);
        const retryDelayByDeadlineMs = Math.min(
          retryDelayByPolicyMs,
          this.#remainingTimeoutMs(cancellation),
        );
        const retryDelayMs = Math.min(
          retryDelayByDeadlineMs,
          retryBudgetRemainingMs,
        );
        if (retryDelayMs <= 0) {
          throw executionError;
        }
        await this.#sleep(retryDelayMs, cancellation.signal);
        retryBudgetRemainingMs = Math.max(0, retryBudgetRemainingMs - retryDelayMs);
        attempt += 1;
      }
    }

    throw new CloudChatExecutionError(
      "Cloud chat retries exhausted.",
      { reasonCode: "transport.transient_failure" },
    );
  }

  #createCancellationContext(
    request: NormalizedExecutionRequest,
  ): ExecutionCancellationContext {
    const combinedController = new AbortController();
    const timeoutController = new AbortController();
    const deadlineAtMs = this.#now() + request.timeoutMs;
    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      timeoutController.abort(
        new CloudChatExecutionError(
          `Cloud chat execution timed out after ${String(request.timeoutMs)}ms.`,
          {
            reasonCode: "transport.timeout",
            details: {
              correlationId: request.correlationId,
              timeoutMs: request.timeoutMs,
            },
          },
        ),
      );
    }, request.timeoutMs);

    const abortFromTimeout = () => {
      if (combinedController.signal.aborted) {
        return;
      }
      timedOut = true;
      combinedController.abort(timeoutController.signal.reason);
    };
    timeoutController.signal.addEventListener("abort", abortFromTimeout, {
      once: true,
    });

    const upstreamSignal = request.signal;
    const abortFromUpstream = () => {
      if (combinedController.signal.aborted) {
        return;
      }
      combinedController.abort(upstreamSignal?.reason);
    };
    if (upstreamSignal !== undefined) {
      if (upstreamSignal.aborted) {
        abortFromUpstream();
      } else {
        upstreamSignal.addEventListener("abort", abortFromUpstream, { once: true });
      }
    }

    return {
      signal: combinedController.signal,
      timeoutMs: request.timeoutMs,
      deadlineAtMs,
      isTimedOut: () => timedOut || this.#now() >= deadlineAtMs,
      dispose: () => {
        clearTimeout(timeoutHandle);
        timeoutController.signal.removeEventListener("abort", abortFromTimeout);
        if (upstreamSignal !== undefined) {
          upstreamSignal.removeEventListener("abort", abortFromUpstream);
        }
      },
    };
  }

  #normalizeAbortReason(reason: unknown): Error {
    if (reason instanceof Error) {
      return reason;
    }
    if (typeof reason === "string") {
      return new Error(reason);
    }
    return new Error("Cloud execution aborted.");
  }

  #mapCancellationError(
    error: unknown,
    request: NormalizedExecutionRequest,
    cancellation: ExecutionCancellationContext,
  ): unknown {
    if (error instanceof CloudChatExecutionError) {
      return error;
    }

    if (cancellation.isTimedOut()) {
      return new CloudChatExecutionError(
        `Cloud chat execution timed out after ${String(request.timeoutMs)}ms.`,
        {
          reasonCode: "transport.timeout",
          details: {
            correlationId: request.correlationId,
            timeoutMs: request.timeoutMs,
          },
          ...(error instanceof Error ? { cause: error } : {}),
        },
      );
    }

    const cancellationReason = cancellation.signal.reason;
    if (cancellation.signal.aborted || this.#isAbortLikeError(error)) {
      if (cancellationReason instanceof CloudChatExecutionError) {
        return cancellationReason;
      }
      return new CloudChatExecutionError("Cloud chat execution cancelled.", {
        reasonCode: "transport.cancelled",
        details: {
          correlationId: request.correlationId,
        },
        ...(error instanceof Error
          ? { cause: error }
          : cancellationReason instanceof Error
            ? { cause: cancellationReason }
            : {}),
      });
    }

    return error;
  }

  #throwIfCancelled(
    request: NormalizedExecutionRequest,
    cancellation: ExecutionCancellationContext,
  ): void {
    if (!cancellation.signal.aborted && !cancellation.isTimedOut()) {
      return;
    }
    throw this.#mapCancellationError(undefined, request, cancellation);
  }

  #remainingTimeoutMs(cancellation: ExecutionCancellationContext): number {
    const remaining = Math.floor(cancellation.deadlineAtMs - this.#now());
    return Math.max(1, remaining);
  }

  async #withCancellation<T>(
    operation: Promise<T>,
    request: NormalizedExecutionRequest,
    cancellation: ExecutionCancellationContext,
  ): Promise<T> {
    this.#throwIfCancelled(request, cancellation);
    if (cancellation.signal.aborted) {
      throw this.#mapCancellationError(undefined, request, cancellation);
    }

    let abortHandler: (() => void) | undefined;
    const abortPromise = new Promise<never>((_resolve, reject) => {
      abortHandler = () => {
        reject(this.#mapCancellationError(undefined, request, cancellation));
      };
      cancellation.signal.addEventListener("abort", abortHandler, { once: true });
    });

    try {
      return await Promise.race([operation, abortPromise]);
    } finally {
      if (abortHandler !== undefined) {
        cancellation.signal.removeEventListener("abort", abortHandler);
      }
    }
  }

  #isAbortLikeError(error: unknown): boolean {
    if (error instanceof Error && error.name === "AbortError") {
      return true;
    }
    return (
      isRecord(error) &&
      typeof error["name"] === "string" &&
      error["name"] === "AbortError"
    );
  }

  #retryDelayMs(failedAttempt: number): number {
    const retryBackoff = this.#policy.retryBackoff;
    const exponent = Math.max(0, failedAttempt - 1);
    const computed = retryBackoff.baseDelayMs * retryBackoff.multiplier ** exponent;
    const bounded = Math.max(0, Math.min(retryBackoff.maxDelayMs, computed));
    const jitterRatio = Math.max(0, Math.min(1, retryBackoff.jitterRatio));
    const jitterRange = bounded * jitterRatio;
    const jittered =
      bounded + jitterRange * (Math.random() * 2 - 1);
    return Math.max(1, Math.floor(jittered));
  }

  #isRetryableReasonCode(reasonCode: CloudChatExecutionReasonCode): boolean {
    return RETRYABLE_REASON_CODES.has(reasonCode as RetryableReasonCode);
  }

  #toExecutionError(error: unknown): CloudChatExecutionError {
    if (error instanceof CloudChatExecutionError) {
      return error;
    }
    if (isRecord(error)) {
      const normalizedReasonCode =
        typeof error["reasonCode"] === "string"
          ? parseReasonCode(error["reasonCode"])
          : undefined;
      const details = toSafeDetails(error["details"]);
      if (normalizedReasonCode !== undefined) {
        return new CloudChatExecutionError(toErrorMessage(error), {
          reasonCode: normalizedReasonCode,
          ...(details !== undefined ? { details } : {}),
          ...(error instanceof Error ? { cause: error } : {}),
        });
      }
    }

    return new CloudChatExecutionError(toErrorMessage(error), {
      reasonCode: "transport.transient_failure",
      ...(error instanceof Error ? { cause: error } : {}),
    });
  }

  #assertBreakerAllowsExecution(scopeKey: string): void {
    const state = this.#breakerByScope.get(scopeKey);
    if (state === undefined) {
      return;
    }

    const nowMs = this.#now();
    if (state.mode === "open" && nowMs < state.openUntilMs) {
      throw new CloudChatExecutionError(
        "Cloud chat circuit breaker is open for this tenant/provider scope.",
        {
          reasonCode: "provider.unavailable",
        },
      );
    }

    if (state.mode === "open" && nowMs >= state.openUntilMs) {
      state.mode = "half-open";
      state.consecutiveFailures = 0;
      state.consecutiveSuccesses = 0;
      state.windowStartedAtMs = nowMs;
      state.openUntilMs = 0;
    }
  }

  #recordBreakerSuccess(scopeKey: string): void {
    const state = this.#breakerByScope.get(scopeKey);
    if (state === undefined) {
      return;
    }

    if (state.mode === "half-open") {
      state.consecutiveSuccesses += 1;
      if (
        state.consecutiveSuccesses >=
        this.#policy.breaker.closeAfterConsecutiveSuccesses
      ) {
        this.#breakerByScope.delete(scopeKey);
      }
      return;
    }

    if (state.mode === "closed") {
      state.consecutiveFailures = 0;
      state.windowStartedAtMs = this.#now();
    }
  }

  #recordBreakerFailure(
    scopeKey: string,
    reasonCode: CloudChatExecutionReasonCode,
  ): void {
    if (
      reasonCode === "request.invalid" ||
      reasonCode === "auth.invalid" ||
      reasonCode === "policy.denied"
    ) {
      return;
    }

    const breakerPolicy = this.#policy.breaker;
    const nowMs = this.#now();
    const state =
      this.#breakerByScope.get(scopeKey) ?? {
        mode: "closed",
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        windowStartedAtMs: nowMs,
        openUntilMs: 0,
      };

    if (state.mode === "half-open") {
      state.mode = "open";
      state.consecutiveFailures = breakerPolicy.openAfterConsecutiveFailures;
      state.consecutiveSuccesses = 0;
      state.windowStartedAtMs = nowMs;
      state.openUntilMs = nowMs + breakerPolicy.halfOpenAfterMs;
      this.#breakerByScope.set(scopeKey, state);
      return;
    }

    if (nowMs - state.windowStartedAtMs > breakerPolicy.failureWindowMs) {
      state.consecutiveFailures = 0;
      state.windowStartedAtMs = nowMs;
    }

    state.consecutiveFailures += 1;
    state.consecutiveSuccesses = 0;
    if (state.consecutiveFailures >= breakerPolicy.openAfterConsecutiveFailures) {
      state.mode = "open";
      state.openUntilMs = nowMs + breakerPolicy.halfOpenAfterMs;
    } else {
      state.mode = "closed";
    }

    this.#breakerByScope.set(scopeKey, state);
  }

  #recordQueueWaitLatency(
    request: NormalizedExecutionRequest,
    durationMs: number,
    timingState: ExecutionTimingState,
  ): void {
    if (timingState.queueWaitRecorded) {
      return;
    }
    timingState.queueWaitRecorded = true;
    this.#observability?.recordStageLatency(
      "cloud.queue.wait",
      Math.max(0, Math.floor(durationMs)),
      this.#commonTagsFor(request),
    );
  }

  #recordSendStageLatency(input: Readonly<{
    request: NormalizedExecutionRequest;
    durationMs: number;
    attempt: number;
    reasonCode?: CloudChatExecutionReasonCode;
    retryable?: boolean;
  }>): void {
    this.#observability?.recordStageLatency(
      "cloud.send",
      Math.max(0, Math.floor(input.durationMs)),
      {
        ...this.#commonTagsFor(input.request),
        attempt: input.attempt,
        ...(input.reasonCode !== undefined ? { reasonCode: input.reasonCode } : {}),
        ...(input.retryable !== undefined ? { retryable: input.retryable } : {}),
      },
    );
  }

  #recordFirstResultLatencyProxy(
    request: NormalizedExecutionRequest,
    timingState: ExecutionTimingState,
  ): void {
    if (timingState.firstResultRecorded) {
      return;
    }
    timingState.firstResultRecorded = true;
    this.#observability?.recordStageLatency(
      "cloud.send.first_result_proxy",
      Math.max(0, Math.floor(this.#now() - timingState.executionStartedAtMs)),
      this.#commonTagsFor(request),
    );
  }

  #commonTagsFor(
    request: NormalizedExecutionRequest,
  ): Readonly<{
    correlationId: string;
    providerId: string;
    methodId: string;
    modelId: string;
    streamRequested: boolean;
  }> {
    return {
      correlationId: request.correlationId,
      providerId: request.providerId,
      methodId: request.methodId,
      modelId: request.modelId,
      streamRequested: request.streamRequested,
    };
  }

  async #acquireBackpressureSlots(
    request: NormalizedExecutionRequest,
    cancellation: ExecutionCancellationContext,
    timingState: ExecutionTimingState,
  ): Promise<void> {
    if (this.#tryAcquireBackpressureSlots(request)) {
      this.#recordQueueWaitLatency(request, 0, timingState);
      return;
    }

    const originQueuedCount = this.#originQueued.get(request.origin) ?? 0;
    if (originQueuedCount >= this.#policy.backpressure.perOriginQueueCap) {
      throw new CloudChatExecutionError(
        "Per-origin backpressure queue cap exceeded.",
        {
          reasonCode: "transport.transient_failure",
          details: {
            cap: this.#policy.backpressure.perOriginQueueCap,
            queued: originQueuedCount,
          },
        },
      );
    }

    const providerQueuedCount = this.#providerQueued.get(request.providerId) ?? 0;
    if (providerQueuedCount >= this.#policy.backpressure.perProviderQueueCap) {
      throw new CloudChatExecutionError(
        "Per-provider backpressure queue cap exceeded.",
        {
          reasonCode: "transport.transient_failure",
          details: {
            cap: this.#policy.backpressure.perProviderQueueCap,
            queued: providerQueuedCount,
          },
        },
      );
    }

    const queuedAtMs = this.#now();
    await new Promise<void>((resolve, reject) => {
      const waiter: BackpressureWaiter = {
        request,
        cancellation,
        resolve: () => {
          if (waiter.settled) {
            return;
          }
          waiter.settled = true;
          this.#recordQueueWaitLatency(
            request,
            this.#now() - queuedAtMs,
            timingState,
          );
          cancellation.signal.removeEventListener("abort", waiter.onAbort);
          this.#decrementCounter(this.#originQueued, request.origin);
          this.#decrementCounter(this.#providerQueued, request.providerId);
          resolve();
        },
        reject: (error: unknown) => {
          if (waiter.settled) {
            return;
          }
          waiter.settled = true;
          this.#recordQueueWaitLatency(
            request,
            this.#now() - queuedAtMs,
            timingState,
          );
          cancellation.signal.removeEventListener("abort", waiter.onAbort);
          this.#decrementCounter(this.#originQueued, request.origin);
          this.#decrementCounter(this.#providerQueued, request.providerId);
          reject(error);
        },
        onAbort: () => {
          this.#removeBackpressureWaiter(waiter);
          waiter.reject(
            this.#mapCancellationError(undefined, request, cancellation),
          );
        },
        settled: false,
      };

      if (cancellation.signal.aborted || cancellation.isTimedOut()) {
        waiter.reject(this.#mapCancellationError(undefined, request, cancellation));
        return;
      }

      this.#incrementCounter(this.#originQueued, request.origin);
      this.#incrementCounter(this.#providerQueued, request.providerId);
      cancellation.signal.addEventListener("abort", waiter.onAbort, {
        once: true,
      });
      this.#admissionQueue.push(waiter);
    });
  }

  #tryAcquireBackpressureSlots(request: NormalizedExecutionRequest): boolean {
    const originCount = this.#originInFlight.get(request.origin) ?? 0;
    if (originCount >= this.#policy.backpressure.perOriginInFlightCap) {
      return false;
    }
    const providerCount = this.#providerInFlight.get(request.providerId) ?? 0;
    if (providerCount >= this.#policy.backpressure.perProviderStreamCap) {
      return false;
    }
    this.#originInFlight.set(request.origin, originCount + 1);
    this.#providerInFlight.set(request.providerId, providerCount + 1);
    return true;
  }

  #releaseBackpressureSlots(request: NormalizedExecutionRequest): void {
    this.#decrementCounter(this.#originInFlight, request.origin);
    this.#decrementCounter(this.#providerInFlight, request.providerId);
    this.#drainBackpressureQueue();
  }

  #drainBackpressureQueue(): void {
    while (this.#admissionQueue.length > 0) {
      const next = this.#admissionQueue[0];
      if (next === undefined) {
        return;
      }
      if (next.settled) {
        this.#admissionQueue.shift();
        continue;
      }
      if (next.cancellation.signal.aborted || next.cancellation.isTimedOut()) {
        this.#admissionQueue.shift();
        next.reject(
          this.#mapCancellationError(
            undefined,
            next.request,
            next.cancellation,
          ),
        );
        continue;
      }
      if (!this.#tryAcquireBackpressureSlots(next.request)) {
        return;
      }
      this.#admissionQueue.shift();
      next.resolve();
    }
  }

  #removeBackpressureWaiter(waiter: BackpressureWaiter): void {
    const queueIndex = this.#admissionQueue.indexOf(waiter);
    if (queueIndex >= 0) {
      this.#admissionQueue.splice(queueIndex, 1);
    }
  }

  #incrementCounter(counterMap: Map<string, number>, key: string): void {
    const current = counterMap.get(key) ?? 0;
    counterMap.set(key, current + 1);
  }

  #decrementCounter(counterMap: Map<string, number>, key: string): void {
    const current = counterMap.get(key);
    if (current === undefined || current <= 1) {
      counterMap.delete(key);
      return;
    }
    counterMap.set(key, current - 1);
  }

  #emitReconnectRequiredSignal(request: NormalizedExecutionRequest): void {
    if (this.#onReconnectRequired === undefined) {
      return;
    }
    try {
      this.#onReconnectRequired({
        providerId: request.providerId,
        methodId: request.methodId,
        reasonCode: "auth.expired",
        correlationId: request.correlationId,
      });
    } catch {
      // no-op: this is a side-channel signal and should not mask the primary failure.
    }
  }

  #emitCompletionRevocationAuditMarker(request: NormalizedExecutionRequest): void {
    if (this.#emitAuditMarker === undefined) {
      return;
    }
    try {
      this.#emitAuditMarker({
        correlationId: request.correlationId,
        providerId: request.providerId,
        methodId: request.methodId,
        region: request.region,
        revocation_race_terminated: true,
      });
    } catch {
      // no-op: audit side effect must not mask request failure.
    }
  }
}

