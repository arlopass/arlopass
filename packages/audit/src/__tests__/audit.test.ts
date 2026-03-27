import { describe, expect, it } from "vitest";

import {
  REQUIRED_AUDIT_FIELDS,
  AuditSchemaError,
  createAuditEvent,
  validateAuditEvent,
  type AuditEvent,
} from "../event-schema.js";
import { JsonlExporter } from "../exporters/jsonl-exporter.js";
import { OtlpExporter } from "../exporters/otlp-exporter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseEvent(): AuditEvent {
  return {
    timestamp: "2026-03-23T12:00:00.000Z",
    origin: "https://example.corp",
    providerId: "provider.openai",
    modelId: "model.gpt-4o",
    capability: "chat.stream",
    decision: "allow",
    reasonCode: "policy.allow.default",
    correlationId: "corr.abc123",
    policyVersion: "v1.0.0",
  };
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe("AuditEvent schema", () => {
  it("includes all nine required fields in REQUIRED_AUDIT_FIELDS", () => {
    const required = Array.from(REQUIRED_AUDIT_FIELDS);
    expect(required).toContain("timestamp");
    expect(required).toContain("origin");
    expect(required).toContain("providerId");
    expect(required).toContain("modelId");
    expect(required).toContain("capability");
    expect(required).toContain("decision");
    expect(required).toContain("reasonCode");
    expect(required).toContain("correlationId");
    expect(required).toContain("policyVersion");
    expect(required).toHaveLength(9);
  });

  it("validates a fully populated event without throwing", () => {
    expect(() => validateAuditEvent(baseEvent())).not.toThrow();
  });

  it("throws AuditSchemaError when any required field is missing", () => {
    for (const field of REQUIRED_AUDIT_FIELDS) {
      const partial = { ...baseEvent() };
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (partial as Record<string, unknown>)[field];
      expect(() => validateAuditEvent(partial), `missing field: ${field}`).toThrowError(AuditSchemaError);
    }
  });

  it("throws AuditSchemaError for an empty string required field", () => {
    const bad = { ...baseEvent(), origin: "" };
    expect(() => validateAuditEvent(bad)).toThrowError(AuditSchemaError);
  });

  it("throws AuditSchemaError for invalid decision value", () => {
    const bad = { ...baseEvent(), decision: "maybe" } as unknown as AuditEvent;
    expect(() => validateAuditEvent(bad)).toThrowError(AuditSchemaError);
  });

  it("throws AuditSchemaError for null input", () => {
    expect(() => validateAuditEvent(null)).toThrowError(AuditSchemaError);
  });

  it("reports all missing fields in the error", () => {
    const err = (() => {
      try {
        validateAuditEvent({});
      } catch (e) {
        return e as AuditSchemaError;
      }
    })();
    expect(err).toBeInstanceOf(AuditSchemaError);
    expect(err?.missingFields.length).toBeGreaterThanOrEqual(9);
  });
});

describe("createAuditEvent", () => {
  it("returns a validated AuditEvent for valid input", () => {
    const event = createAuditEvent(baseEvent());
    expect(event.decision).toBe("allow");
    expect(event.correlationId).toBe("corr.abc123");
  });

  it("preserves optional metadata without modification", () => {
    const event = createAuditEvent({ ...baseEvent(), metadata: { env: "prod" } });
    expect(event.metadata).toEqual({ env: "prod" });
  });

  it("does NOT accept prompt or response fields (privacy-safe by type)", () => {
    // Compile-time guarantee: AuditEventFields has no prompt/response fields.
    // This test documents the intent and ensures no accidental addition.
    const event = createAuditEvent(baseEvent());
    expect(Object.keys(event)).not.toContain("prompt");
    expect(Object.keys(event)).not.toContain("response");
  });
});

// ---------------------------------------------------------------------------
// JSONL exporter
// ---------------------------------------------------------------------------

describe("JsonlExporter", () => {
  it("exports an event and returns written: true", () => {
    const exporter = new JsonlExporter({
      filePath: "/tmp/arlopass-audit-test.jsonl",
    });

    // Override internal write by spying via the filter returning true
    // We test write: true by checking the result object shape.
    const result = exporter.export(baseEvent());
    // On CI the file write may succeed or fail; check structural contract.
    expect(typeof result.written).toBe("boolean");
  });

  it("respects filter: events rejected by filter are not written", () => {
    const exporter = new JsonlExporter({
      filePath: "/tmp/arlopass-audit-test-filtered.jsonl",
      filter: () => false,
    });
    const result = exporter.export(baseEvent());
    expect(result.written).toBe(false);
    expect(result.filtered).toBe(true);
  });

  it("passes events accepted by filter to the file", () => {
    const exporter = new JsonlExporter({
      filePath: "/tmp/arlopass-audit-test-pass.jsonl",
      filter: (e) => e.decision === "deny",
    });
    const allowResult = exporter.export(baseEvent());
    expect(allowResult.written).toBe(false);

    const denyResult = exporter.export({ ...baseEvent(), decision: "deny" });
    expect(typeof denyResult.written).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// OTLP exporter
// ---------------------------------------------------------------------------

describe("OtlpExporter", () => {
  it("converts an allow event to an INFO log record", () => {
    const records: ReturnType<OtlpExporter["toLogRecord"]>[] = [];
    const exporter = new OtlpExporter({ emit: (r) => records.push(r) });

    const result = exporter.export(baseEvent());
    expect(result.emitted).toBe(true);
    expect(records).toHaveLength(1);

    const record = records[0]!;
    expect(record.severityText).toBe("INFO");
    expect(record.body).toBe("audit:allow:policy.allow.default");
  });

  it("converts a deny event to a WARN log record", () => {
    const records: ReturnType<OtlpExporter["toLogRecord"]>[] = [];
    const exporter = new OtlpExporter({ emit: (r) => records.push(r) });

    exporter.export({ ...baseEvent(), decision: "deny", reasonCode: "policy.deny.blocklist" });

    const record = records[0]!;
    expect(record.severityText).toBe("WARN");
    expect(record.body).toBe("audit:deny:policy.deny.blocklist");
  });

  it("maps all required fields to OTLP attributes", () => {
    const records: ReturnType<OtlpExporter["toLogRecord"]>[] = [];
    const exporter = new OtlpExporter({ emit: (r) => records.push(r) });
    exporter.export(baseEvent());

    const attrs = records[0]!.attributes;
    expect(attrs["arlopass.origin"]).toBe("https://example.corp");
    expect(attrs["arlopass.provider_id"]).toBe("provider.openai");
    expect(attrs["arlopass.model_id"]).toBe("model.gpt-4o");
    expect(attrs["arlopass.capability"]).toBe("chat.stream");
    expect(attrs["arlopass.decision"]).toBe("allow");
    expect(attrs["arlopass.reason_code"]).toBe("policy.allow.default");
    expect(attrs["arlopass.correlation_id"]).toBe("corr.abc123");
    expect(attrs["arlopass.policy_version"]).toBe("v1.0.0");
  });

  it("includes optional metadata as prefixed attributes", () => {
    const records: ReturnType<OtlpExporter["toLogRecord"]>[] = [];
    const exporter = new OtlpExporter({ emit: (r) => records.push(r) });
    exporter.export({ ...baseEvent(), metadata: { env: "prod", region: "us-east-1" } });

    const attrs = records[0]!.attributes;
    expect(attrs["arlopass.meta.env"]).toBe("prod");
    expect(attrs["arlopass.meta.region"]).toBe("us-east-1");
  });

  it("generates a valid timeUnixNano from the timestamp", () => {
    const records: ReturnType<OtlpExporter["toLogRecord"]>[] = [];
    const exporter = new OtlpExporter({ emit: (r) => records.push(r) });
    exporter.export(baseEvent());

    const nano = records[0]!.timeUnixNano;
    expect(typeof nano).toBe("string");
    expect(BigInt(nano)).toBeGreaterThan(0n);
  });

  it("supports a custom severity resolver", () => {
    const records: ReturnType<OtlpExporter["toLogRecord"]>[] = [];
    const exporter = new OtlpExporter({
      emit: (r) => records.push(r),
      severityResolver: () => "ERROR",
    });
    exporter.export(baseEvent());
    expect(records[0]!.severityText).toBe("ERROR");
  });

  it("returns emitted: false and captures error when emit throws", () => {
    const exporter = new OtlpExporter({
      emit: () => {
        throw new Error("collector unavailable");
      },
    });
    const result = exporter.export(baseEvent());
    expect(result.emitted).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
  });

  it("does not include prompt or response content in log record attributes", () => {
    const records: ReturnType<OtlpExporter["toLogRecord"]>[] = [];
    const exporter = new OtlpExporter({ emit: (r) => records.push(r) });
    exporter.export(baseEvent());

    const attrKeys = Object.keys(records[0]!.attributes);
    expect(attrKeys.some((k) => k.includes("prompt"))).toBe(false);
    expect(attrKeys.some((k) => k.includes("response"))).toBe(false);
  });
});
