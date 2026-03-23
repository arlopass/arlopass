import {
  REQUIRED_SIGNAL_METADATA_FIELDS,
  type NormalizeSignalMetadataOptions,
  normalizeSignalMetadata,
  redactTelemetryValue,
} from "./redaction.js";

export const TELEMETRY_SPAN_NAMES = {
  REQUEST: "byom.request",
  POLICY_DECISION: "byom.policy.decision",
  PROVIDER_DISPATCH: "byom.provider.dispatch",
  STREAM: "byom.stream",
  ADAPTER_HEALTH: "byom.adapter.health",
} as const;

export type TelemetrySpanName = (typeof TELEMETRY_SPAN_NAMES)[keyof typeof TELEMETRY_SPAN_NAMES];

export type TelemetrySpanStatus = "ok" | "error";

export type TraceSignalMetadata = Readonly<Record<string, unknown>>;
export type TraceAttributes = Readonly<Record<string, unknown>>;

export type SpanEvent = Readonly<{
  name: string;
  timestamp: string;
  attributes: TraceAttributes;
}>;

export type SpanRecord = Readonly<{
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: TelemetrySpanName;
  startedAt: string;
  endedAt: string;
  status: TelemetrySpanStatus;
  metadata: TraceSignalMetadata;
  attributes: TraceAttributes;
  events: readonly SpanEvent[];
}>;

export type TraceExporter = (span: SpanRecord) => void;

export type TraceSpanOptions = Readonly<{
  parentSpanId?: string;
  attributes?: TraceAttributes;
  metadata: TraceSignalMetadata;
  startedAt?: Date;
}>;

export type TelemetryTracingOptions = Readonly<{
  now?: () => Date;
  randomId?: () => string;
  exportSpan?: TraceExporter;
  metadata?: NormalizeSignalMetadataOptions;
  requiredMetadataFields?: readonly string[];
}>;

const DEFAULT_REQUIRED_TRACE_METADATA_FIELDS = REQUIRED_SIGNAL_METADATA_FIELDS;

function defaultTraceExporter(): TraceExporter {
  return () => {};
}

function createRandomHex(size: number): string {
  const alphabet = "0123456789abcdef";
  let output = "";
  for (let index = 0; index < size; index += 1) {
    const randomIndex = Math.floor(Math.random() * alphabet.length);
    output += alphabet[randomIndex] ?? "0";
  }
  return output;
}

function defaultRandomId(): string {
  return createRandomHex(16);
}

export class TelemetrySpan {
  readonly #traceId: string;
  readonly #spanId: string;
  readonly #parentSpanId: string | undefined;
  readonly #name: TelemetrySpanName;
  readonly #startedAt: Date;
  readonly #metadata: TraceSignalMetadata;
  readonly #initialAttributes: TraceAttributes;
  readonly #now: () => Date;
  readonly #exportSpan: TraceExporter;
  readonly #events: SpanEvent[] = [];
  #status: TelemetrySpanStatus = "ok";
  #ended = false;

  constructor(options: {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    name: TelemetrySpanName;
    startedAt: Date;
    metadata: TraceSignalMetadata;
    attributes: TraceAttributes;
    now: () => Date;
    exportSpan: TraceExporter;
  }) {
    this.#traceId = options.traceId;
    this.#spanId = options.spanId;
    this.#parentSpanId = options.parentSpanId;
    this.#name = options.name;
    this.#startedAt = options.startedAt;
    this.#metadata = options.metadata;
    this.#initialAttributes = options.attributes;
    this.#now = options.now;
    this.#exportSpan = options.exportSpan;
  }

  get traceId(): string {
    return this.#traceId;
  }

  get spanId(): string {
    return this.#spanId;
  }

  addEvent(name: string, attributes: TraceAttributes = {}): void {
    if (this.#ended) {
      return;
    }

    this.#events.push({
      name,
      timestamp: this.#now().toISOString(),
      attributes: redactTelemetryValue(attributes) as TraceAttributes,
    });
  }

  setStatus(status: TelemetrySpanStatus): void {
    if (this.#ended) {
      return;
    }

    this.#status = status;
  }

  end(attributes: TraceAttributes = {}): SpanRecord {
    if (this.#ended) {
      throw new Error("Span already ended.");
    }

    this.#ended = true;
    const endedAt = this.#now();
    const mergedAttributes = {
      ...this.#initialAttributes,
      ...attributes,
    };

    const spanRecord: SpanRecord = {
      traceId: this.#traceId,
      spanId: this.#spanId,
      ...(this.#parentSpanId !== undefined ? { parentSpanId: this.#parentSpanId } : {}),
      name: this.#name,
      startedAt: this.#startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      status: this.#status,
      metadata: this.#metadata,
      attributes: redactTelemetryValue(mergedAttributes) as TraceAttributes,
      events: [...this.#events],
    };

    this.#exportSpan(spanRecord);
    return spanRecord;
  }
}

export class TelemetryTracing {
  readonly #now: () => Date;
  readonly #randomId: () => string;
  readonly #exportSpan: TraceExporter;
  readonly #metadataOptions: NormalizeSignalMetadataOptions;
  readonly #requiredMetadataFields: readonly string[];
  readonly #records: SpanRecord[] = [];

  constructor(options: TelemetryTracingOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#randomId = options.randomId ?? defaultRandomId;
    this.#exportSpan = options.exportSpan ?? defaultTraceExporter();
    this.#metadataOptions = options.metadata ?? {};
    this.#requiredMetadataFields =
      options.requiredMetadataFields ?? DEFAULT_REQUIRED_TRACE_METADATA_FIELDS;
  }

  startSpan(name: TelemetrySpanName, options: TraceSpanOptions): TelemetrySpan {
    const metadata = normalizeSignalMetadata(options.metadata, {
      ...this.#metadataOptions,
      requiredFields: this.#requiredMetadataFields,
    });

    const startedAt = options.startedAt ?? this.#now();
    const span = new TelemetrySpan({
      traceId: this.#randomId(),
      spanId: this.#randomId(),
      ...(options.parentSpanId !== undefined
        ? { parentSpanId: options.parentSpanId }
        : {}),
      name,
      startedAt,
      metadata,
      attributes: redactTelemetryValue(options.attributes ?? {}) as TraceAttributes,
      now: this.#now,
      exportSpan: (record) => {
        this.#records.push(record);
        this.#exportSpan(record);
      },
    });

    return span;
  }

  async withSpan<T>(
    name: TelemetrySpanName,
    options: TraceSpanOptions,
    callback: (span: TelemetrySpan) => Promise<T> | T,
  ): Promise<T> {
    const span = this.startSpan(name, options);
    try {
      const result = await callback(span);
      span.setStatus("ok");
      span.end();
      return result;
    } catch (error) {
      span.setStatus("error");
      span.addEvent("error", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      span.end();
      throw error;
    }
  }

  getRecordedSpans(): readonly SpanRecord[] {
    return [...this.#records];
  }

  reset(): void {
    this.#records.length = 0;
  }
}
