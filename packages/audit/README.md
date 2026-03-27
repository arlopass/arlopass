# @arlopass/audit

Record every Arlopass decision — allow, deny, route, fail — as a structured event for compliance and investigation. Prompts and responses are excluded by default.

```ts
import { createAuditEvent, JsonlExporter } from "@arlopass/audit";

const event = createAuditEvent({
  timestamp: new Date().toISOString(),
  origin: "https://app.acme.com",
  providerId: "ollama",
  modelId: "llama3.2",
  capability: "chat.completions",
  decision: "allow",
  reasonCode: "allow",
  correlationId: "req-abc-123",
  policyVersion: "org.acme.v3",
});

const exporter = new JsonlExporter({ filePath: "./audit.jsonl" });
exporter.export(event);
```

---

## API Reference

### `createAuditEvent(fields: AuditEventFields & { metadata?: Record<string, unknown> }): AuditEvent`

Create and validate an audit event. Throws `AuditSchemaError` if required fields are missing.

### `validateAuditEvent(candidate: unknown): asserts candidate is AuditEvent`

Assert that a value satisfies the audit event schema.

---

### Audit Event

```ts
type AuditEventFields = {
  timestamp: string;
  origin: string;
  providerId: string;
  modelId: string;
  capability: string;
  decision: "allow" | "deny";
  reasonCode: string;
  correlationId: string;
  policyVersion: string;
}

type AuditEvent = AuditEventFields & { metadata?: Record<string, unknown> }
```

**Required fields** (`REQUIRED_AUDIT_FIELDS`): `timestamp`, `origin`, `providerId`, `modelId`, `capability`, `decision`, `reasonCode`, `correlationId`, `policyVersion`

---

### `JsonlExporter`

Write audit events as newline-delimited JSON.

```ts
const exporter = new JsonlExporter({
  filePath: "./audit.jsonl",
  filter: (event) => event.decision === "deny",
});

const result: JsonlExportResult = exporter.export(event);
// { written: true } or { written: false, filtered: true }
```

| Constructor Option | Type | Description |
|-------------------|------|-------------|
| `filePath` | `string` | Output file path |
| `filter` | `(event: AuditEvent) => boolean` | Optional event filter |

---

### `OtlpExporter`

Convert audit events to OpenTelemetry log records.

```ts
const exporter = new OtlpExporter({
  emit: (record) => sendToCollector(record),
  severityResolver: (event) => event.decision === "deny" ? "WARN" : "INFO",
});

const result: OtlpExportResult = exporter.export(event);
const record: OtlpLogRecord = exporter.toLogRecord(event);
```

```ts
type OtlpLogRecord = {
  timeUnixNano: string;
  severityText: "INFO" | "WARN" | "ERROR";
  body: string;
  attributes: Record<string, string>;
}
```

| Constructor Option | Type | Description |
|-------------------|------|-------------|
| `emit` | `(record: OtlpLogRecord) => void` | Callback for emitted records |
| `severityResolver` | `(event: AuditEvent) => OtlpSeverity` | Override default severity mapping |

---

### Error Classes

**`AuditSchemaError`** — Thrown when required fields are missing.

```ts
class AuditSchemaError extends Error {
  missingFields: string[];
}
```

---

### Dependencies

None.
