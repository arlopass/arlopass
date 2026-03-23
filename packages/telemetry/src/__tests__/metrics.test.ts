import { describe, expect, it } from "vitest";

import {
  type MetricPoint,
  TELEMETRY_METRIC_NAMES,
  TELEMETRY_METRIC_UNITS,
  TelemetryMetrics,
} from "../metrics.js";
import { REDACTED_VALUE, SignalContractError } from "../redaction.js";

function createBaseMetadata() {
  return {
    correlationId: "corr.1234",
    origin: "https://example.app",
    providerId: "provider.ollama",
    modelId: "model.llama3",
    capability: "chat.stream",
  };
}

describe("TelemetryMetrics", () => {
  it("emits canonical metrics with metadata-first defaults", () => {
    const emittedMetrics: MetricPoint[] = [];
    const metrics = new TelemetryMetrics({
      now: () => new Date("2026-03-23T12:00:00.000Z"),
      emit: (metric) => {
        emittedMetrics.push(metric);
      },
    });

    const counter = metrics.createCounter(
      TELEMETRY_METRIC_NAMES.REQUEST_TOTAL,
      createBaseMetadata(),
    );
    const histogram = metrics.createHistogram(
      TELEMETRY_METRIC_NAMES.REQUEST_DURATION_MS,
      createBaseMetadata(),
    );

    const counterPoint = counter.add();
    const histogramPoint = histogram.record(42);

    expect(counterPoint).toMatchObject({
      name: TELEMETRY_METRIC_NAMES.REQUEST_TOTAL,
      unit: TELEMETRY_METRIC_UNITS.count,
      value: 1,
      timestamp: "2026-03-23T12:00:00.000Z",
      metadata: createBaseMetadata(),
    });
    expect(histogramPoint).toMatchObject({
      name: TELEMETRY_METRIC_NAMES.REQUEST_DURATION_MS,
      unit: TELEMETRY_METRIC_UNITS.milliseconds,
      value: 42,
      timestamp: "2026-03-23T12:00:00.000Z",
      metadata: createBaseMetadata(),
    });
    expect(emittedMetrics).toHaveLength(2);
  });

  it("enforces required correlation metadata fields", () => {
    const metrics = new TelemetryMetrics();

    expect(() =>
      metrics.emit({
        name: TELEMETRY_METRIC_NAMES.REQUEST_TOTAL,
        value: 1,
        metadata: {
          origin: "https://example.app",
          providerId: "provider.ollama",
        },
      }),
    ).toThrowError(SignalContractError);
  });

  it("redacts sensitive metadata values while preserving shared labels", () => {
    const metrics = new TelemetryMetrics({
      metadata: {
        includeUnknownFields: true,
      },
    });

    const metric = metrics.emit({
      name: TELEMETRY_METRIC_NAMES.REQUEST_FAILURE_TOTAL,
      value: 1,
      metadata: {
        ...createBaseMetadata(),
        accessToken: "token-12345",
        authorization: "Bearer very-sensitive.jwt.value",
        details: {
          apiKey: "api-key-secret",
          nestedNote: "token=local-secret",
        },
      },
    });

    const details = metric.metadata.details as Record<string, unknown>;

    expect(metric.metadata).toMatchObject({
      correlationId: "corr.1234",
      origin: "https://example.app",
      providerId: "provider.ollama",
      modelId: "model.llama3",
      capability: "chat.stream",
      accessToken: REDACTED_VALUE,
      authorization: REDACTED_VALUE,
    });
    expect(details.apiKey).toBe(REDACTED_VALUE);
    expect(details.nestedNote).toBe(`token=${REDACTED_VALUE}`);
  });
});
