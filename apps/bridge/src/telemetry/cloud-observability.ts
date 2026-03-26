export type CloudStageName =
  | "cloud.connect.begin"
  | "cloud.connect.complete"
  | "cloud.connect.validate"
  | "cloud.connect.revoke"
  | "cloud.discovery.refresh"
  | "cloud.models.discover"
  | "cloud.capabilities.discover"
  | "cloud.queue.wait"
  | "cloud.send"
  | "cloud.send.first_result_proxy"
  | "cloud.stream"
  | "cloud.token.refresh"
  | "cloud.recovery";

export type CloudSliName =
  | "cloud.connect.success_rate"
  | "cloud.chat.send.success_rate"
  | "cloud.stream.interruption_rate"
  | "cloud.token.refresh.success_rate"
  | "cloud.recovery.mttr";

export const REQUIRED_CLOUD_SLI_NAMES: CloudSliName[] = [
  "cloud.connect.success_rate",
  "cloud.chat.send.success_rate",
  "cloud.stream.interruption_rate",
  "cloud.token.refresh.success_rate",
  "cloud.recovery.mttr",
];

type CommonTags = Readonly<{
  correlationId: string;
  providerId: string;
  methodId?: string;
  modelId?: string;
  reasonCode?: string;
  retryable?: boolean;
  attempt?: number;
  streamRequested?: boolean;
}>;

function normalizeOptionalNonEmptyTag(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function sanitizeCommonTags(input: CommonTags): CommonTags {
  const correlationId =
    normalizeOptionalNonEmptyTag(input.correlationId) ?? "unknown";
  const providerId = normalizeOptionalNonEmptyTag(input.providerId) ?? "unknown";
  const methodId = normalizeOptionalNonEmptyTag(input.methodId);
  const modelId = normalizeOptionalNonEmptyTag(input.modelId);
  const reasonCode = normalizeOptionalNonEmptyTag(input.reasonCode);
  const retryable =
    typeof input.retryable === "boolean" ? input.retryable : undefined;
  const attempt =
    typeof input.attempt === "number" && Number.isFinite(input.attempt)
      ? input.attempt
      : undefined;
  const streamRequested =
    typeof input.streamRequested === "boolean"
      ? input.streamRequested
      : undefined;

  return {
    correlationId,
    providerId,
    ...(methodId !== undefined ? { methodId } : {}),
    ...(modelId !== undefined ? { modelId } : {}),
    ...(reasonCode !== undefined ? { reasonCode } : {}),
    ...(retryable !== undefined ? { retryable } : {}),
    ...(attempt !== undefined ? { attempt } : {}),
    ...(streamRequested !== undefined ? { streamRequested } : {}),
  };
}

export type StageLatencySample = Readonly<{
  stage: CloudStageName;
  durationMs: number;
  tags: CommonTags;
}>;

export type ErrorTagSample = Readonly<{
  stage: CloudStageName;
  reasonCode: string;
  retryable: boolean;
  tags: CommonTags;
}>;

export type SliSample = Readonly<{
  name: CloudSliName;
  value: number;
  providerId: string;
}>;

export class CloudObservability {
  readonly #stageLatencyHistogram: StageLatencySample[] = [];
  readonly #errorTags: ErrorTagSample[] = [];
  readonly #sli: SliSample[] = [];

  recordStageLatency(
    stage: CloudStageName,
    durationMs: number,
    tags: CommonTags,
  ): void {
    this.#stageLatencyHistogram.push({
      stage,
      durationMs,
      tags: sanitizeCommonTags(tags),
    });
  }

  recordError(input: Readonly<{
    stage: CloudStageName;
    reasonCode: string;
    retryable: boolean;
    correlationId: string;
    providerId: string;
    methodId?: string;
    modelId?: string;
  }>): void {
    this.#errorTags.push({
      stage: input.stage,
      reasonCode: input.reasonCode,
      retryable: input.retryable,
      tags: sanitizeCommonTags({
        correlationId: input.correlationId,
        providerId: input.providerId,
        ...(input.methodId !== undefined ? { methodId: input.methodId } : {}),
        ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
        reasonCode: input.reasonCode,
        retryable: input.retryable,
      }),
    });
  }

  recordSli(sample: SliSample): void {
    this.#sli.push(sample);
  }

  snapshot(): Readonly<{
    stageLatencyHistogram: readonly StageLatencySample[];
    errorTags: readonly ErrorTagSample[];
    sli: readonly SliSample[];
  }> {
    return {
      stageLatencyHistogram: [...this.#stageLatencyHistogram],
      errorTags: [...this.#errorTags],
      sli: [...this.#sli],
    };
  }
}

