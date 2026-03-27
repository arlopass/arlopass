import type { AuditEvent } from "../event-schema.js";

/** Severity mapping for OTLP log records. */
export type OtlpSeverity = "INFO" | "WARN" | "ERROR";

/**
 * OTLP-compatible log record shape (simplified subset of the OpenTelemetry
 * Log Data Model).  Consumers forward this to an OTLP-capable collector.
 */
export interface OtlpLogRecord {
  timeUnixNano: string;
  severityText: OtlpSeverity;
  body: string;
  attributes: Record<string, string>;
}

/** Options for the OTLP exporter. */
export interface OtlpExporterOptions {
  /**
   * Emit function called with each converted log record.
   * In production this would forward to an OTLP collector endpoint.
   * Defaults to a no-op if not provided (useful in tests).
   */
  emit?: (record: OtlpLogRecord) => void;
  /** Override severity mapping; defaults to deny → WARN, allow → INFO. */
  severityResolver?: (event: AuditEvent) => OtlpSeverity;
}

/** Result returned by {@link OtlpExporter.export}. */
export interface OtlpExportResult {
  emitted: boolean;
  record: OtlpLogRecord;
  error?: unknown;
}

function defaultSeverity(event: AuditEvent): OtlpSeverity {
  return event.decision === "deny" ? "WARN" : "INFO";
}

/**
 * Converts {@link AuditEvent} records into OTLP log record format and
 * forwards them to a configurable emit function.
 *
 * All event fields are mapped to OTLP `attributes` to preserve structured
 * metadata for downstream analysis — no raw prompt or response content is
 * included.
 */
export class OtlpExporter {
  private readonly emit: (record: OtlpLogRecord) => void;
  private readonly severityResolver: (event: AuditEvent) => OtlpSeverity;

  constructor(options: OtlpExporterOptions = {}) {
    this.emit = options.emit ?? (() => undefined);
    this.severityResolver = options.severityResolver ?? defaultSeverity;
  }

  /** Convert an {@link AuditEvent} to an {@link OtlpLogRecord}. */
  toLogRecord(event: AuditEvent): OtlpLogRecord {
    const timestampMs = new Date(event.timestamp).getTime();
    const timeUnixNano = (BigInt(timestampMs) * 1_000_000n).toString();

    const attributes: Record<string, string> = {
      "arlopass.origin": event.origin,
      "arlopass.provider_id": event.providerId,
      "arlopass.model_id": event.modelId,
      "arlopass.capability": event.capability,
      "arlopass.decision": event.decision,
      "arlopass.reason_code": event.reasonCode,
      "arlopass.correlation_id": event.correlationId,
      "arlopass.policy_version": event.policyVersion,
    };

    if (event.metadata) {
      for (const [key, value] of Object.entries(event.metadata)) {
        attributes[`arlopass.meta.${key}`] = String(value);
      }
    }

    return {
      timeUnixNano,
      severityText: this.severityResolver(event),
      body: `audit:${event.decision}:${event.reasonCode}`,
      attributes,
    };
  }

  export(event: AuditEvent): OtlpExportResult {
    const record = this.toLogRecord(event);
    try {
      this.emit(record);
      return { emitted: true, record };
    } catch (error) {
      return { emitted: false, record, error };
    }
  }
}
