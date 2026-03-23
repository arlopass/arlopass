import { describe, expect, it } from "vitest";

import { REDACTED_VALUE, SignalContractError } from "../redaction.js";
import {
  TELEMETRY_SPAN_NAMES,
  TelemetryTracing,
  type SpanRecord,
} from "../tracing.js";

function createMetadata() {
  return {
    correlationId: "corr.trace.1",
    origin: "https://example.app",
    providerId: "provider.ollama",
    modelId: "model.llama3",
    capability: "chat.stream",
  };
}

function createDeterministicClock(values: readonly string[]): () => Date {
  let index = 0;
  const lastValue = values[values.length - 1] ?? new Date().toISOString();

  return () => {
    const value = values[index] ?? lastValue;
    index += 1;
    return new Date(value);
  };
}

describe("TelemetryTracing", () => {
  it("records spans with required metadata conventions", () => {
    const exportedSpans: SpanRecord[] = [];
    const tracing = new TelemetryTracing({
      now: createDeterministicClock([
        "2026-03-23T12:00:00.000Z",
        "2026-03-23T12:00:01.000Z",
      ]),
      randomId: (() => {
        const ids = ["trace-id-1", "span-id-1"];
        return () => ids.shift() ?? "fallback-id";
      })(),
      exportSpan: (span) => {
        exportedSpans.push(span);
      },
    });

    const span = tracing.startSpan(TELEMETRY_SPAN_NAMES.REQUEST, {
      metadata: createMetadata(),
      attributes: {
        outcome: "started",
      },
    });
    const record = span.end({
      status: "ok",
    });

    expect(record).toMatchObject({
      traceId: "trace-id-1",
      spanId: "span-id-1",
      name: TELEMETRY_SPAN_NAMES.REQUEST,
      status: "ok",
      startedAt: "2026-03-23T12:00:00.000Z",
      endedAt: "2026-03-23T12:00:01.000Z",
      metadata: createMetadata(),
      attributes: {
        outcome: "started",
        status: "ok",
      },
    });
    expect(exportedSpans).toHaveLength(1);
  });

  it("requires correlationId, origin, and providerId metadata", () => {
    const tracing = new TelemetryTracing();

    expect(() =>
      tracing.startSpan(TELEMETRY_SPAN_NAMES.REQUEST, {
        metadata: {
          correlationId: "corr.trace.1",
          origin: "https://example.app",
        },
      }),
    ).toThrowError(SignalContractError);
  });

  it("applies redaction-safe defaults to attributes and events", () => {
    const tracing = new TelemetryTracing({
      now: createDeterministicClock([
        "2026-03-23T12:00:00.000Z",
        "2026-03-23T12:00:00.500Z",
        "2026-03-23T12:00:01.000Z",
      ]),
      randomId: (() => {
        const ids = ["trace-id-2", "span-id-2"];
        return () => ids.shift() ?? "fallback-id";
      })(),
      metadata: {
        includeUnknownFields: true,
      },
    });

    const span = tracing.startSpan(TELEMETRY_SPAN_NAMES.PROVIDER_DISPATCH, {
      metadata: {
        ...createMetadata(),
        accessToken: "token-abcdef",
      },
      attributes: {
        authorization: "Bearer top-secret",
      },
    });
    span.addEvent("dispatch.request", {
      apiKey: "key-123",
      details: "token=abc123",
    });
    const record = span.end({
      password: "p@ssword",
    });

    const dispatchEvent = record.events[0];
    const eventAttributes = dispatchEvent?.attributes as Record<string, unknown>;

    expect(record.metadata.accessToken).toBe(REDACTED_VALUE);
    expect(record.attributes.authorization).toBe(REDACTED_VALUE);
    expect(record.attributes.password).toBe(REDACTED_VALUE);
    expect(eventAttributes.apiKey).toBe(REDACTED_VALUE);
    expect(eventAttributes.details).toBe(`token=${REDACTED_VALUE}`);
  });

  it("marks spans as error when withSpan callback throws", async () => {
    const tracing = new TelemetryTracing({
      now: createDeterministicClock([
        "2026-03-23T12:00:00.000Z",
        "2026-03-23T12:00:00.100Z",
        "2026-03-23T12:00:00.200Z",
      ]),
      randomId: (() => {
        const ids = ["trace-id-3", "span-id-3"];
        return () => ids.shift() ?? "fallback-id";
      })(),
    });

    await expect(
      tracing.withSpan(
        TELEMETRY_SPAN_NAMES.STREAM,
        {
          metadata: createMetadata(),
        },
        async () => {
          throw new Error("token=unsafe-value");
        },
      ),
    ).rejects.toThrow("token=unsafe-value");

    const [record] = tracing.getRecordedSpans();
    const errorEvent = record?.events.find((event) => event.name === "error");
    const errorAttributes = errorEvent?.attributes as Record<string, unknown>;

    expect(record?.status).toBe("error");
    expect(errorAttributes.errorName).toBe("Error");
    expect(errorAttributes.errorMessage).toBe(`token=${REDACTED_VALUE}`);
  });
});
