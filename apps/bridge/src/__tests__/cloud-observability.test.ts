import { describe, expect, it } from "vitest";

import {
  CloudObservability,
  REQUIRED_CLOUD_SLI_NAMES,
} from "../telemetry/cloud-observability.js";

describe("CloudObservability", () => {
  it("records stage latency and error tags with reason/retry metadata", () => {
    const observability = new CloudObservability();

    observability.recordStageLatency("cloud.send", 187, {
      correlationId: "corr.test.001",
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      modelId: "claude-sonnet-4-5",
      reasonCode: "transport.transient_failure",
      retryable: true,
      attempt: 2,
    });
    observability.recordError({
      stage: "cloud.send",
      reasonCode: "transport.transient_failure",
      retryable: true,
      correlationId: "corr.test.001",
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      modelId: "claude-sonnet-4-5",
    });

    const snapshot = observability.snapshot();
    expect(snapshot.stageLatencyHistogram).toContainEqual(
      expect.objectContaining({
        stage: "cloud.send",
        durationMs: 187,
        tags: expect.objectContaining({
          correlationId: "corr.test.001",
          reasonCode: "transport.transient_failure",
          retryable: true,
        }),
      }),
    );
    expect(snapshot.errorTags).toContainEqual(
      expect.objectContaining({
        stage: "cloud.send",
        reasonCode: "transport.transient_failure",
        retryable: true,
      }),
    );
  });

  it("emits required SLI coverage for connect/send/stream/refresh/recovery", () => {
    const observability = new CloudObservability();
    observability.recordSli({
      name: "cloud.connect.success_rate",
      value: 1,
      providerId: "provider.claude",
    });
    observability.recordSli({
      name: "cloud.chat.send.success_rate",
      value: 1,
      providerId: "provider.claude",
    });
    observability.recordSli({
      name: "cloud.stream.interruption_rate",
      value: 0,
      providerId: "provider.claude",
    });
    observability.recordSli({
      name: "cloud.token.refresh.success_rate",
      value: 1,
      providerId: "provider.claude",
    });
    observability.recordSli({
      name: "cloud.recovery.mttr",
      value: 3200,
      providerId: "provider.claude",
    });

    const snapshot = observability.snapshot();
    expect(snapshot.sli.map((entry) => entry.name)).toEqual(
      expect.arrayContaining(REQUIRED_CLOUD_SLI_NAMES),
    );
  });

  it("sanitizes telemetry tags to a safe allowlist", () => {
    const observability = new CloudObservability();

    observability.recordStageLatency("cloud.send.first_result_proxy", 321, {
      correlationId: "corr.test.002",
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      modelId: "claude-sonnet-4-5",
      attempt: 1,
      streamRequested: true,
      ...({
        content: "do not log prompt text",
        requestProof: "do not log proof",
      } as Record<string, unknown>),
    } as Parameters<CloudObservability["recordStageLatency"]>[2]);

    const snapshot = observability.snapshot();
    const stageSample = snapshot.stageLatencyHistogram[0];
    expect(stageSample).toMatchObject({
      stage: "cloud.send.first_result_proxy",
      durationMs: 321,
      tags: {
        correlationId: "corr.test.002",
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        modelId: "claude-sonnet-4-5",
        attempt: 1,
        streamRequested: true,
      },
    });
    expect((stageSample?.tags as Record<string, unknown>)["content"]).toBeUndefined();
    expect((stageSample?.tags as Record<string, unknown>)["requestProof"]).toBeUndefined();
  });
});

