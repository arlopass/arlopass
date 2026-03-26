import { describe, expect, it, vi } from "vitest";

import {
  CloudChatExecutor,
  CloudChatExecutionError,
  EXECUTOR_POLICY_DEFAULTS,
  buildBreakerScopeKey,
} from "../cloud/cloud-chat-executor.js";
import { CloudObservability } from "../telemetry/cloud-observability.js";
import { TOKEN_LEASE_REFRESH_POLICY_DEFAULTS } from "../cloud/token-lease-manager.js";

function makeRequest() {
  return {
    correlationId: "corr.cloud.001",
    tenantId: "tenant-a",
    origin: "https://app-a.example.com",
    extensionId: "ext.runtime.transport",
    providerId: "provider.claude",
    methodId: "anthropic.api_key",
    modelId: "claude-sonnet-4-5",
    policyVersion: "pol.v2",
    endpointProfileHash: "sha256:endpoint-profile",
    region: "us-east-1",
    connectionHandle:
      "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
    messages: [{ role: "user", content: "hello" }] as const,
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("CloudChatExecutor policies", () => {
  it("enforces breaker and backpressure defaults from spec", () => {
    expect(EXECUTOR_POLICY_DEFAULTS.breaker.openAfterConsecutiveFailures).toBe(5);
    expect(EXECUTOR_POLICY_DEFAULTS.breaker.failureWindowMs).toBe(60_000);
    expect(EXECUTOR_POLICY_DEFAULTS.breaker.halfOpenAfterMs).toBe(30_000);
    expect(EXECUTOR_POLICY_DEFAULTS.breaker.closeAfterConsecutiveSuccesses).toBe(3);
    expect(EXECUTOR_POLICY_DEFAULTS.backpressure.perOriginInFlightCap).toBe(3);
    expect(EXECUTOR_POLICY_DEFAULTS.backpressure.perProviderStreamCap).toBe(5);
    expect(EXECUTOR_POLICY_DEFAULTS.backpressure.perOriginQueueCap).toBe(6);
    expect(EXECUTOR_POLICY_DEFAULTS.backpressure.perProviderQueueCap).toBe(10);
  });

  it("enforces retry backoff defaults from spec", () => {
    expect(EXECUTOR_POLICY_DEFAULTS.retryBackoff.baseDelayMs).toBe(250);
    expect(EXECUTOR_POLICY_DEFAULTS.retryBackoff.multiplier).toBe(2);
    expect(EXECUTOR_POLICY_DEFAULTS.retryBackoff.maxDelayMs).toBe(8_000);
    expect(EXECUTOR_POLICY_DEFAULTS.retryBackoff.jitterRatio).toBe(0.2);
    expect(EXECUTOR_POLICY_DEFAULTS.retryBackoff.maxRetryBudgetMs).toBe(10_000);
    expect(EXECUTOR_POLICY_DEFAULTS.retryBackoff.maxAttempts.controlPlaneValidation).toBe(2);
    expect(EXECUTOR_POLICY_DEFAULTS.retryBackoff.maxAttempts.dataPlaneSend).toBe(3);
    expect(EXECUTOR_POLICY_DEFAULTS.retryBackoff.maxAttempts.streamSetup).toBe(2);
  });

  it("exports token lease refresh policy defaults from spec", () => {
    expect(TOKEN_LEASE_REFRESH_POLICY_DEFAULTS.thresholdRatio).toBe(0.8);
    expect(TOKEN_LEASE_REFRESH_POLICY_DEFAULTS.jitterRatio).toBe(0.1);
    expect(TOKEN_LEASE_REFRESH_POLICY_DEFAULTS.maxAttempts).toBe(3);
    expect(TOKEN_LEASE_REFRESH_POLICY_DEFAULTS.cooldownMs).toBe(300_000);
  });

  it("scopes circuit breaker key by tenant+origin+provider+method+region", () => {
    const keyA = buildBreakerScopeKey({
      tenantId: "tenant-a",
      origin: "https://app-a.example.com",
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      region: "us-east-1",
    });
    const keyB = buildBreakerScopeKey({
      tenantId: "tenant-b",
      origin: "https://app-a.example.com",
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      region: "us-east-1",
    });
    expect(keyA).not.toBe(keyB);
  });
});

describe("CloudChatExecutor revocation guards", () => {
  it("fails closed when required binding metadata is missing", async () => {
    const epochLookup = {
      getCredentialEpoch: vi.fn(async () => 1),
    };
    const dataPlaneSend = vi.fn(async () => ({
      content: "ok",
    }));
    const executor = new CloudChatExecutor({
      tokenLeaseManager: {
        withRefreshLease: vi.fn(async (_scope, run) => run()),
      },
      epochLookup,
      dataPlaneSend,
    });

    const missingPolicyVersion = { ...makeRequest() } as Record<string, unknown>;
    delete missingPolicyVersion["policyVersion"];
    await expect(
      executor.execute(
        missingPolicyVersion as unknown as ReturnType<typeof makeRequest>,
      ),
    ).rejects.toMatchObject({
      reasonCode: "request.invalid",
    });

    const missingEndpointProfileHash = { ...makeRequest() } as Record<string, unknown>;
    delete missingEndpointProfileHash["endpointProfileHash"];
    await expect(
      executor.execute(
        missingEndpointProfileHash as unknown as ReturnType<typeof makeRequest>,
      ),
    ).rejects.toMatchObject({
      reasonCode: "request.invalid",
    });

    expect(epochLookup.getCredentialEpoch).not.toHaveBeenCalled();
    expect(dataPlaneSend).not.toHaveBeenCalled();
  });

  it("fails closed with auth.expired when epoch changes while waiting on refresh lock", async () => {
    let epoch = 7;
    const reconnectRequiredEvents: unknown[] = [];
    const dataPlaneSend = vi.fn(async () => ({
      correlationId: "corr.cloud.001",
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      modelId: "claude-sonnet-4-5",
      region: "us-east-1",
      content: "unused",
    }));
    const executor = new CloudChatExecutor({
      tokenLeaseManager: {
        withRefreshLease: vi.fn(async (_scope, run) => {
          // Simulate revocation/rerotation while waiting for refresh lock.
          epoch += 1;
          return run();
        }),
      },
      epochLookup: {
        getCredentialEpoch: vi.fn(async () => epoch),
      },
      dataPlaneSend,
      onReconnectRequired: (event) => {
        reconnectRequiredEvents.push(event);
      },
    });

    await expect(executor.execute(makeRequest())).rejects.toMatchObject({
      reasonCode: "auth.expired",
    });
    expect(dataPlaneSend).not.toHaveBeenCalled();
    expect(reconnectRequiredEvents).toContainEqual(
      expect.objectContaining({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        reasonCode: "auth.expired",
      }),
    );
  });

  it("fails closed and emits audit marker when revocation occurs after refresh lock and before completion", async () => {
    let epoch = 9;
    const auditEvents: unknown[] = [];
    const reconnectRequiredEvents: unknown[] = [];
    const executor = new CloudChatExecutor({
      tokenLeaseManager: {
        withRefreshLease: vi.fn(async (_scope, run) => run()),
      },
      epochLookup: {
        getCredentialEpoch: vi.fn(async () => epoch),
      },
      dataPlaneSend: vi.fn(async () => {
        // Simulate revocation just before completion commit.
        epoch += 1;
        return {
          correlationId: "corr.cloud.001",
          providerId: "provider.claude",
          methodId: "anthropic.api_key",
          modelId: "claude-sonnet-4-5",
          region: "us-east-1",
          content: "unused",
        };
      }),
      emitAuditMarker: (event) => {
        auditEvents.push(event);
      },
      onReconnectRequired: (event) => {
        reconnectRequiredEvents.push(event);
      },
    });

    await expect(executor.execute(makeRequest())).rejects.toMatchObject({
      reasonCode: "auth.expired",
    });
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        correlationId: "corr.cloud.001",
        revocation_race_terminated: true,
      }),
    );
    expect(reconnectRequiredEvents).toContainEqual(
      expect.objectContaining({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        reasonCode: "auth.expired",
      }),
    );
  });

  it("propagates timeout budget and abort signal to data-plane send and times out deterministically", async () => {
    const dataPlaneSend = vi.fn(async (request: unknown) => {
      void request;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return {
        content: "late",
      };
    });

    const executor = new CloudChatExecutor({
      tokenLeaseManager: {
        withRefreshLease: vi.fn(async (_scope, run) => run()),
      },
      epochLookup: {
        getCredentialEpoch: vi.fn(async () => 1),
      },
      dataPlaneSend,
      sleep: vi.fn(async () => {}),
    });

    await expect(
      executor.execute({
        ...makeRequest(),
        timeoutMs: 15,
      }),
    ).rejects.toMatchObject({
      reasonCode: "transport.timeout",
    });

    expect(dataPlaneSend).toHaveBeenCalledTimes(1);
    const firstCall = dataPlaneSend.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(typeof firstCall?.["timeoutMs"]).toBe("number");
    expect(firstCall?.["timeoutMs"]).toBeLessThanOrEqual(15);
    expect(firstCall?.["signal"]).toBeInstanceOf(AbortSignal);
  });

  it("classifies upstream abort as transport.cancelled", async () => {
    const upstreamAbort = new AbortController();
    const dataPlaneSend = vi.fn(async (request: unknown) => {
      void request;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        content: "late",
      };
    });

    const executor = new CloudChatExecutor({
      tokenLeaseManager: {
        withRefreshLease: vi.fn(async (_scope, run) => run()),
      },
      epochLookup: {
        getCredentialEpoch: vi.fn(async () => 1),
      },
      dataPlaneSend,
      sleep: vi.fn(async () => {}),
    });

    const execution = executor.execute({
      ...makeRequest(),
      timeoutMs: 5_000,
      signal: upstreamAbort.signal,
    } as typeof makeRequest extends () => infer T ? T & { signal: AbortSignal; timeoutMs: number } : never);

    upstreamAbort.abort(new Error("client disconnected"));

    await expect(execution).rejects.toMatchObject({
      reasonCode: "transport.cancelled",
    });
  });

  it("classifies refresh-lease wait timeout as transport.timeout", async () => {
    const dataPlaneSend = vi.fn(async () => ({
      content: "unused",
    }));
    const executor = new CloudChatExecutor({
      tokenLeaseManager: {
        withRefreshLease: vi.fn(async () => new Promise<never>(() => {})),
      },
      epochLookup: {
        getCredentialEpoch: vi.fn(async () => 1),
      },
      dataPlaneSend,
      sleep: vi.fn(async () => {}),
    });

    await expect(
      executor.execute({
        ...makeRequest(),
        timeoutMs: 15,
      }),
    ).rejects.toMatchObject({
      reasonCode: "transport.timeout",
    });
    expect(dataPlaneSend).not.toHaveBeenCalled();
  });

  it("classifies refresh-lease wait cancellation as transport.cancelled", async () => {
    const upstreamAbort = new AbortController();
    const dataPlaneSend = vi.fn(async () => ({
      content: "unused",
    }));
    const executor = new CloudChatExecutor({
      tokenLeaseManager: {
        withRefreshLease: vi.fn(async () => new Promise<never>(() => {})),
      },
      epochLookup: {
        getCredentialEpoch: vi.fn(async () => 1),
      },
      dataPlaneSend,
      sleep: vi.fn(async () => {}),
    });

    const execution = executor.execute({
      ...makeRequest(),
      timeoutMs: 5_000,
      signal: upstreamAbort.signal,
    } as typeof makeRequest extends () => infer T
      ? T & { signal: AbortSignal; timeoutMs: number }
      : never);

    await flushMicrotasks();
    upstreamAbort.abort(new Error("upstream cancelled"));

    await expect(execution).rejects.toMatchObject({
      reasonCode: "transport.cancelled",
    });
    expect(dataPlaneSend).not.toHaveBeenCalled();
  });
});

describe("CloudChatExecutor retry budgets and backpressure admission", () => {
  it("adds retry jitter when retrying transient send failures", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(1);
    try {
      let attempts = 0;
      const sleep = vi.fn(async () => {});
      const executor = new CloudChatExecutor({
        tokenLeaseManager: {
          withRefreshLease: vi.fn(async (_scope, run) => run()),
        },
        epochLookup: {
          getCredentialEpoch: vi.fn(async () => 1),
        },
        dataPlaneSend: vi.fn(async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new CloudChatExecutionError("Transient send failure", {
              reasonCode: "transport.transient_failure",
            });
          }
          return { content: "ok" };
        }),
        policy: {
          ...EXECUTOR_POLICY_DEFAULTS,
          retryBackoff: {
            ...EXECUTOR_POLICY_DEFAULTS.retryBackoff,
            baseDelayMs: 100,
            multiplier: 1,
            maxDelayMs: 100,
            jitterRatio: 0.5,
            maxRetryBudgetMs: 1_000,
            maxAttempts: {
              ...EXECUTOR_POLICY_DEFAULTS.retryBackoff.maxAttempts,
              dataPlaneSend: 3,
            },
          },
        },
        sleep,
      });

      await expect(executor.execute(makeRequest())).resolves.toMatchObject({
        content: "ok",
      });
      expect(attempts).toBe(2);
      expect(sleep).toHaveBeenCalledTimes(1);
      expect(sleep).toHaveBeenCalledWith(150, expect.any(AbortSignal));
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("enforces retry budget cap to avoid retry storms", async () => {
    const sleep = vi.fn(async () => {});
    const dataPlaneSend = vi.fn(async () => {
      throw new CloudChatExecutionError("Provider flake", {
        reasonCode: "transport.transient_failure",
      });
    });
    const executor = new CloudChatExecutor({
      tokenLeaseManager: {
        withRefreshLease: vi.fn(async (_scope, run) => run()),
      },
      epochLookup: {
        getCredentialEpoch: vi.fn(async () => 1),
      },
      dataPlaneSend,
      policy: {
        ...EXECUTOR_POLICY_DEFAULTS,
        retryBackoff: {
          ...EXECUTOR_POLICY_DEFAULTS.retryBackoff,
          baseDelayMs: 100,
          multiplier: 1,
          maxDelayMs: 100,
          jitterRatio: 0,
          maxRetryBudgetMs: 30,
          maxAttempts: {
            ...EXECUTOR_POLICY_DEFAULTS.retryBackoff.maxAttempts,
            dataPlaneSend: 8,
          },
        },
      },
      sleep,
    });

    await expect(executor.execute(makeRequest())).rejects.toMatchObject({
      reasonCode: "transport.transient_failure",
    });
    expect(dataPlaneSend).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(30, expect.any(AbortSignal));
  });

  it("caps retry attempts even when configured attempts are excessive", async () => {
    const sleep = vi.fn(async () => {});
    const dataPlaneSend = vi.fn(async () => {
      throw new CloudChatExecutionError("Retry me", {
        reasonCode: "transport.transient_failure",
      });
    });
    const executor = new CloudChatExecutor({
      tokenLeaseManager: {
        withRefreshLease: vi.fn(async (_scope, run) => run()),
      },
      epochLookup: {
        getCredentialEpoch: vi.fn(async () => 1),
      },
      dataPlaneSend,
      policy: {
        ...EXECUTOR_POLICY_DEFAULTS,
        retryBackoff: {
          ...EXECUTOR_POLICY_DEFAULTS.retryBackoff,
          maxAttempts: {
            ...EXECUTOR_POLICY_DEFAULTS.retryBackoff.maxAttempts,
            dataPlaneSend: 50,
          },
        },
      },
      sleep,
    });

    await expect(executor.execute(makeRequest())).rejects.toMatchObject({
      reasonCode: "transport.transient_failure",
    });
    expect(dataPlaneSend).toHaveBeenCalledTimes(5);
  });

  it("admits a queued request once in-flight capacity is released", async () => {
    const firstStarted = createDeferred<void>();
    const releaseFirst = createDeferred<void>();
    const dataPlaneSend = vi.fn(async (request: unknown) => {
      const correlationId =
        typeof (request as { correlationId?: unknown })["correlationId"] === "string"
          ? ((request as { correlationId: string }).correlationId as string)
          : "";
      if (correlationId === "corr.cloud.001") {
        firstStarted.resolve();
        await releaseFirst.promise;
        return { content: "first" };
      }
      return { content: "second" };
    });
    const executor = new CloudChatExecutor({
      tokenLeaseManager: {
        withRefreshLease: vi.fn(async (_scope, run) => run()),
      },
      epochLookup: {
        getCredentialEpoch: vi.fn(async () => 1),
      },
      dataPlaneSend,
      sleep: vi.fn(async () => {}),
      policy: {
        ...EXECUTOR_POLICY_DEFAULTS,
        backpressure: {
          ...EXECUTOR_POLICY_DEFAULTS.backpressure,
          perOriginInFlightCap: 1,
          perProviderStreamCap: 1,
          perOriginQueueCap: 1,
          perProviderQueueCap: 1,
        },
      },
    });

    const firstExecution = executor.execute({
      ...makeRequest(),
      correlationId: "corr.cloud.001",
      timeoutMs: 5_000,
    });
    await firstStarted.promise;

    const secondExecution = executor.execute({
      ...makeRequest(),
      correlationId: "corr.cloud.002",
      timeoutMs: 5_000,
    });

    await flushMicrotasks();
    expect(dataPlaneSend).toHaveBeenCalledTimes(1);

    releaseFirst.resolve();
    await expect(firstExecution).resolves.toMatchObject({
      correlationId: "corr.cloud.001",
      content: "first",
    });
    await expect(secondExecution).resolves.toMatchObject({
      correlationId: "corr.cloud.002",
      content: "second",
    });
    expect(dataPlaneSend).toHaveBeenCalledTimes(2);
  });

  it("fails closed when backpressure admission queue is saturated", async () => {
    const firstStarted = createDeferred<void>();
    const releaseFirst = createDeferred<void>();
    const dataPlaneSend = vi.fn(async (request: unknown) => {
      const correlationId =
        typeof (request as { correlationId?: unknown })["correlationId"] === "string"
          ? ((request as { correlationId: string }).correlationId as string)
          : "";
      if (correlationId === "corr.cloud.001") {
        firstStarted.resolve();
        await releaseFirst.promise;
        return { content: "first" };
      }
      return { content: "queued" };
    });
    const executor = new CloudChatExecutor({
      tokenLeaseManager: {
        withRefreshLease: vi.fn(async (_scope, run) => run()),
      },
      epochLookup: {
        getCredentialEpoch: vi.fn(async () => 1),
      },
      dataPlaneSend,
      sleep: vi.fn(async () => {}),
      policy: {
        ...EXECUTOR_POLICY_DEFAULTS,
        backpressure: {
          ...EXECUTOR_POLICY_DEFAULTS.backpressure,
          perOriginInFlightCap: 1,
          perProviderStreamCap: 1,
          perOriginQueueCap: 1,
          perProviderQueueCap: 1,
        },
      },
    });

    const firstExecution = executor.execute({
      ...makeRequest(),
      correlationId: "corr.cloud.001",
      timeoutMs: 5_000,
    });
    await firstStarted.promise;

    const secondExecution = executor.execute({
      ...makeRequest(),
      correlationId: "corr.cloud.002",
      timeoutMs: 5_000,
    });
    await flushMicrotasks();

    await expect(
      executor.execute({
        ...makeRequest(),
        correlationId: "corr.cloud.003",
        timeoutMs: 5_000,
      }),
    ).rejects.toMatchObject({
      reasonCode: "transport.transient_failure",
    });

    releaseFirst.resolve();
    await expect(firstExecution).resolves.toMatchObject({
      correlationId: "corr.cloud.001",
    });
    await expect(secondExecution).resolves.toMatchObject({
      correlationId: "corr.cloud.002",
    });
  });

  it("classifies timeout while waiting in backpressure queue as transport.timeout", async () => {
    const firstStarted = createDeferred<void>();
    const releaseFirst = createDeferred<void>();
    const dataPlaneSend = vi.fn(async (request: unknown) => {
      const correlationId =
        typeof (request as { correlationId?: unknown })["correlationId"] === "string"
          ? ((request as { correlationId: string }).correlationId as string)
          : "";
      if (correlationId === "corr.cloud.001") {
        firstStarted.resolve();
        await releaseFirst.promise;
      }
      return { content: "ok" };
    });
    const executor = new CloudChatExecutor({
      tokenLeaseManager: {
        withRefreshLease: vi.fn(async (_scope, run) => run()),
      },
      epochLookup: {
        getCredentialEpoch: vi.fn(async () => 1),
      },
      dataPlaneSend,
      sleep: vi.fn(async () => {}),
      policy: {
        ...EXECUTOR_POLICY_DEFAULTS,
        backpressure: {
          ...EXECUTOR_POLICY_DEFAULTS.backpressure,
          perOriginInFlightCap: 1,
          perProviderStreamCap: 1,
          perOriginQueueCap: 1,
          perProviderQueueCap: 1,
        },
      },
    });

    const firstExecution = executor.execute({
      ...makeRequest(),
      correlationId: "corr.cloud.001",
      timeoutMs: 5_000,
    });
    await firstStarted.promise;

    await expect(
      executor.execute({
        ...makeRequest(),
        correlationId: "corr.cloud.002",
        timeoutMs: 20,
      }),
    ).rejects.toMatchObject({
      reasonCode: "transport.timeout",
    });

    releaseFirst.resolve();
    await expect(firstExecution).resolves.toMatchObject({
      correlationId: "corr.cloud.001",
    });
  });

  it("classifies cancellation while queued in backpressure admission as transport.cancelled", async () => {
    const firstStarted = createDeferred<void>();
    const releaseFirst = createDeferred<void>();
    const dataPlaneSend = vi.fn(async (request: unknown) => {
      const correlationId =
        typeof (request as { correlationId?: unknown })["correlationId"] === "string"
          ? ((request as { correlationId: string }).correlationId as string)
          : "";
      if (correlationId === "corr.cloud.001") {
        firstStarted.resolve();
        await releaseFirst.promise;
      }
      return { content: "ok" };
    });
    const executor = new CloudChatExecutor({
      tokenLeaseManager: {
        withRefreshLease: vi.fn(async (_scope, run) => run()),
      },
      epochLookup: {
        getCredentialEpoch: vi.fn(async () => 1),
      },
      dataPlaneSend,
      sleep: vi.fn(async () => {}),
      policy: {
        ...EXECUTOR_POLICY_DEFAULTS,
        backpressure: {
          ...EXECUTOR_POLICY_DEFAULTS.backpressure,
          perOriginInFlightCap: 1,
          perProviderStreamCap: 1,
          perOriginQueueCap: 1,
          perProviderQueueCap: 1,
        },
      },
    });

    const firstExecution = executor.execute({
      ...makeRequest(),
      correlationId: "corr.cloud.001",
      timeoutMs: 5_000,
    });
    await firstStarted.promise;

    const abortController = new AbortController();
    const queuedExecution = executor.execute({
      ...makeRequest(),
      correlationId: "corr.cloud.002",
      timeoutMs: 5_000,
      signal: abortController.signal,
    } as typeof makeRequest extends () => infer T
      ? T & { signal: AbortSignal; timeoutMs: number }
      : never);

    await flushMicrotasks();
    abortController.abort(new Error("client disconnected"));

    await expect(queuedExecution).rejects.toMatchObject({
      reasonCode: "transport.cancelled",
    });

    releaseFirst.resolve();
    await expect(firstExecution).resolves.toMatchObject({
      correlationId: "corr.cloud.001",
    });
  });

  it("records queue wait, send-stage, and first-result latency proxy with safe tags", async () => {
    const observability = new CloudObservability();
    let nowMs = 1_000;
    const firstStarted = createDeferred<void>();
    const releaseFirst = createDeferred<void>();

    const dataPlaneSend = vi.fn(async (request: unknown) => {
      const correlationId =
        typeof (request as { correlationId?: unknown })["correlationId"] === "string"
          ? ((request as { correlationId: string }).correlationId as string)
          : "";
      if (correlationId === "corr.cloud.001") {
        firstStarted.resolve();
        await releaseFirst.promise;
        nowMs += 20;
        return { content: "first" };
      }
      nowMs += 30;
      return { content: "second" };
    });

    const executor = new CloudChatExecutor({
      tokenLeaseManager: {
        withRefreshLease: vi.fn(async (_scope, run) => run()),
      },
      epochLookup: {
        getCredentialEpoch: vi.fn(async () => 1),
      },
      dataPlaneSend,
      sleep: vi.fn(async () => {}),
      now: () => nowMs,
      policy: {
        ...EXECUTOR_POLICY_DEFAULTS,
        backpressure: {
          ...EXECUTOR_POLICY_DEFAULTS.backpressure,
          perOriginInFlightCap: 1,
          perProviderStreamCap: 1,
          perOriginQueueCap: 1,
          perProviderQueueCap: 1,
        },
      },
      observability,
    });

    const firstExecution = executor.execute({
      ...makeRequest(),
      correlationId: "corr.cloud.001",
      timeoutMs: 5_000,
    });
    await firstStarted.promise;

    const secondExecution = executor.execute({
      ...makeRequest(),
      correlationId: "corr.cloud.002",
      timeoutMs: 5_000,
    });
    await flushMicrotasks();
    nowMs += 45;
    releaseFirst.resolve();

    await expect(firstExecution).resolves.toMatchObject({
      correlationId: "corr.cloud.001",
    });
    await expect(secondExecution).resolves.toMatchObject({
      correlationId: "corr.cloud.002",
      content: "second",
    });

    const snapshot = observability.snapshot();
    const queueWait = snapshot.stageLatencyHistogram.find(
      (sample) =>
        sample.stage === "cloud.queue.wait" &&
        sample.tags.correlationId === "corr.cloud.002",
    );
    expect(queueWait?.durationMs).toBe(65);

    const sendStage = snapshot.stageLatencyHistogram.find(
      (sample) =>
        sample.stage === "cloud.send" &&
        sample.tags.correlationId === "corr.cloud.002",
    );
    expect(sendStage).toMatchObject({
      durationMs: 30,
      tags: expect.objectContaining({
        attempt: 1,
        streamRequested: false,
      }),
    });
    expect((sendStage?.tags as Record<string, unknown>)["origin"]).toBeUndefined();
    expect((sendStage?.tags as Record<string, unknown>)["content"]).toBeUndefined();

    const firstResultProxy = snapshot.stageLatencyHistogram.find(
      (sample) =>
        sample.stage === "cloud.send.first_result_proxy" &&
        sample.tags.correlationId === "corr.cloud.002",
    );
    expect(firstResultProxy?.durationMs).toBe(95);
  });
});

