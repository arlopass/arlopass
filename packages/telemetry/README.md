# @arlopass/telemetry

Collect metrics, propagate traces, and redact sensitive data across all Arlopass components. Zero dependencies.

```ts
import { TelemetryMetrics, TelemetryTracing } from "@arlopass/telemetry";

const metrics = new TelemetryMetrics();
const counter = metrics.createCounter("arlopass.request.total", { correlationId: "req-1", origin: "https://app.acme.com", providerId: "ollama" });
counter.add();

const tracing = new TelemetryTracing();
const result = await tracing.withSpan("arlopass.request", { correlationId: "req-1", origin: "https://app.acme.com", providerId: "ollama" }, async (span) => {
  span.addEvent("provider.dispatch", { modelId: "llama3.2" });
  const res = await doWork();
  span.setStatus("ok");
  return res;
});
```

---

## API Reference

### `TelemetryMetrics`

Collects metric data points.

```ts
const metrics = new TelemetryMetrics(options?: TelemetryMetricsOptions);
```

| Method | Returns | Description |
|--------|---------|-------------|
| `emit(input: EmitMetricInput)` | `MetricPoint` | Emit a single metric point |
| `createCounter(name, metadata)` | `{ add(value?: number): MetricPoint }` | Create a counter instrument |
| `createHistogram(name, metadata)` | `{ record(value: number): MetricPoint }` | Create a histogram instrument |
| `getRecordedMetrics()` | `readonly MetricPoint[]` | Retrieve all emitted metrics |
| `reset()` | `void` | Clear recorded metrics |

```ts
type MetricPoint = {
  name: TelemetryMetricName;
  value: number;
  unit: TelemetryMetricUnit;
  timestamp: string;
  metadata: MetricSignalMetadata;
}
```

#### Metric Names (`TELEMETRY_METRIC_NAMES`)

| Name | Unit |
|------|------|
| `arlopass.request.total` | count |
| `arlopass.request.duration_ms` | milliseconds |
| `arlopass.request.failure.total` | count |
| `arlopass.stream.chunk.total` | count |
| `arlopass.stream.interruption.total` | count |
| `arlopass.retry.total` | count |
| `arlopass.adapter.health` | ratio |

---

### `TelemetryTracing`

Trace spans across trust boundaries.

```ts
const tracing = new TelemetryTracing(options?: TelemetryTracingOptions);
```

| Method | Returns | Description |
|--------|---------|-------------|
| `startSpan(name, options)` | `TelemetrySpan` | Start a new span |
| `withSpan(name, options, callback)` | `Promise<T>` | Execute callback within a span (auto-ends on completion) |
| `getRecordedSpans()` | `readonly SpanRecord[]` | Retrieve all recorded spans |
| `reset()` | `void` | Clear recorded spans |

### `TelemetrySpan`

Single trace span with events and status.

| Property/Method | Type | Description |
|----------------|------|-------------|
| `traceId` | `string` | Trace ID |
| `spanId` | `string` | Span ID |
| `addEvent(name, attributes?)` | `void` | Add a timestamped event to the span |
| `setStatus(status)` | `void` | Set span status: `"ok"` or `"error"` |
| `end(attributes?)` | `SpanRecord` | End the span and return the record |

```ts
type SpanRecord = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: TelemetrySpanName;
  startedAt: string;
  endedAt: string;
  status: "ok" | "error";
  metadata: TraceSignalMetadata;
  attributes: TraceAttributes;
  events: readonly SpanEvent[];
}

type SpanEvent = { name: string; timestamp: string; attributes: TraceAttributes }
```

#### Span Names (`TELEMETRY_SPAN_NAMES`)

`arlopass.request` | `arlopass.policy.decision` | `arlopass.provider.dispatch` | `arlopass.stream` | `arlopass.adapter.health`

---

### Redaction

Strip sensitive data from logs and telemetry signals.

| Function | Description |
|----------|-------------|
| `redactTelemetryValue(value: unknown, options?: TelemetryRedactionOptions): unknown` | Redact a single value |
| `redactTelemetryRecord(record: Record<string, unknown>, options?: TelemetryRedactionOptions): Record<string, unknown>` | Redact all sensitive fields in a record |
| `assertRequiredMetadataFields(metadata, requiredFields?)` | Throws if required metadata is missing |
| `normalizeSignalMetadata(metadata?, options?)` | Normalize and whitelist metadata fields |

```ts
const REDACTED_VALUE = "[REDACTED]";
const REQUIRED_SIGNAL_METADATA_FIELDS = ["correlationId", "origin", "providerId"];
const SAFE_SIGNAL_METADATA_FIELDS = ["correlationId", "origin", "providerId", "modelId", "capability", "reasonCode", "outcome", "requestId", "sessionId", "status", "errorName", "errorType"];
```

---

### Dependencies

None.
