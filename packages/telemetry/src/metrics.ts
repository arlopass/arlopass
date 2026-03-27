import {
  REQUIRED_SIGNAL_METADATA_FIELDS,
  type NormalizeSignalMetadataOptions,
  normalizeSignalMetadata,
} from "./redaction.js";

export const TELEMETRY_METRIC_NAMES = {
  REQUEST_TOTAL: "arlopass.request.total",
  REQUEST_DURATION_MS: "arlopass.request.duration_ms",
  REQUEST_FAILURE_TOTAL: "arlopass.request.failure.total",
  STREAM_CHUNK_TOTAL: "arlopass.stream.chunk.total",
  STREAM_INTERRUPTION_TOTAL: "arlopass.stream.interruption.total",
  RETRY_TOTAL: "arlopass.retry.total",
  ADAPTER_HEALTH_GAUGE: "arlopass.adapter.health",
} as const;

export type TelemetryMetricName =
  (typeof TELEMETRY_METRIC_NAMES)[keyof typeof TELEMETRY_METRIC_NAMES];

export const TELEMETRY_METRIC_UNITS = {
  count: "count",
  milliseconds: "ms",
  ratio: "ratio",
} as const;

export type TelemetryMetricUnit =
  (typeof TELEMETRY_METRIC_UNITS)[keyof typeof TELEMETRY_METRIC_UNITS];

export type MetricSignalMetadata = Readonly<Record<string, unknown>>;

export type MetricPoint = Readonly<{
  name: TelemetryMetricName;
  value: number;
  unit: TelemetryMetricUnit;
  timestamp: string;
  metadata: MetricSignalMetadata;
}>;

export type EmitMetricInput = Readonly<{
  name: TelemetryMetricName;
  value: number;
  unit?: TelemetryMetricUnit;
  timestamp?: Date;
  metadata: MetricSignalMetadata;
}>;

export type MetricsEmitter = (metric: MetricPoint) => void;

export type TelemetryMetricsOptions = Readonly<{
  emit?: MetricsEmitter;
  now?: () => Date;
  metadata?: NormalizeSignalMetadataOptions;
  requiredMetadataFields?: readonly string[];
}>;

function isFiniteMetricValue(value: number): boolean {
  return Number.isFinite(value) && !Number.isNaN(value);
}

function defaultMetricsEmitter(): MetricsEmitter {
  return () => { };
}

const DEFAULT_REQUIRED_METRIC_METADATA_FIELDS = REQUIRED_SIGNAL_METADATA_FIELDS;

export class TelemetryMetrics {
  readonly #emit: MetricsEmitter;
  readonly #now: () => Date;
  readonly #metadataOptions: NormalizeSignalMetadataOptions;
  readonly #requiredMetadataFields: readonly string[];
  readonly #metricPoints: MetricPoint[] = [];

  constructor(options: TelemetryMetricsOptions = {}) {
    this.#emit = options.emit ?? defaultMetricsEmitter();
    this.#now = options.now ?? (() => new Date());
    this.#metadataOptions = options.metadata ?? {};
    this.#requiredMetadataFields =
      options.requiredMetadataFields ?? DEFAULT_REQUIRED_METRIC_METADATA_FIELDS;
  }

  emit(input: EmitMetricInput): MetricPoint {
    if (!isFiniteMetricValue(input.value)) {
      throw new TypeError("Metric value must be a finite number.");
    }

    const timestamp = input.timestamp ?? this.#now();
    const metadata = normalizeSignalMetadata(input.metadata, {
      ...this.#metadataOptions,
      requiredFields: this.#requiredMetadataFields,
    });

    const metricPoint: MetricPoint = {
      name: input.name,
      value: input.value,
      unit: input.unit ?? TELEMETRY_METRIC_UNITS.count,
      timestamp: timestamp.toISOString(),
      metadata,
    };

    this.#metricPoints.push(metricPoint);
    this.#emit(metricPoint);
    return metricPoint;
  }

  createCounter(name: TelemetryMetricName, metadata: MetricSignalMetadata) {
    return {
      add: (value = 1): MetricPoint =>
        this.emit({
          name,
          value,
          unit: TELEMETRY_METRIC_UNITS.count,
          metadata,
        }),
    } as const;
  }

  createHistogram(name: TelemetryMetricName, metadata: MetricSignalMetadata) {
    return {
      record: (value: number): MetricPoint =>
        this.emit({
          name,
          value,
          unit: TELEMETRY_METRIC_UNITS.milliseconds,
          metadata,
        }),
    } as const;
  }

  getRecordedMetrics(): readonly MetricPoint[] {
    return [...this.#metricPoints];
  }

  reset(): void {
    this.#metricPoints.length = 0;
  }
}
