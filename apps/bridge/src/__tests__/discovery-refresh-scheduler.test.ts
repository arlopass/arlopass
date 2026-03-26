import { describe, expect, it, vi } from "vitest";

import { DiscoveryRefreshScheduler } from "../cloud/discovery-refresh-scheduler.js";

describe("DiscoveryRefreshScheduler", () => {
  it("uses default interval (300000ms) and schedules on connection.completed", async () => {
    const nowMs = 0;
    const onRefresh = vi.fn(async () => {});
    const scheduler = new DiscoveryRefreshScheduler({
      now: () => new Date(nowMs),
      onRefresh,
    });

    scheduler.start();
    await scheduler.triggerConnectionCompleted("provider.claude");

    expect(onRefresh).toHaveBeenCalledWith("provider.claude", "connection.completed");
    expect(scheduler.nextRunAt("provider.claude")).toBe(
      new Date(300_000).toISOString(),
    );

    scheduler.stop();
  });

  it("supports reconnect triggers and exposes nextRunAt(providerId)", async () => {
    const nowMs = 1_000;
    const scheduler = new DiscoveryRefreshScheduler({
      now: () => new Date(nowMs),
      onRefresh: async () => {},
    });

    scheduler.start({ intervalMs: 300_000 });
    await scheduler.triggerReconnected("provider.claude");

    expect(scheduler.nextRunAt("provider.claude")).toBe(
      new Date(nowMs + 300_000).toISOString(),
    );

    scheduler.stop();
  });

  it("coalesces duplicate immediate refresh requests and records refresh latency", async () => {
    let nowMs = 0;
    let release: (() => void) | undefined;
    const onRefresh = vi.fn(
      async () =>
        await new Promise<void>((resolve) => {
          release = () => {
            nowMs += 12;
            resolve();
          };
        }),
    );

    const scheduler = new DiscoveryRefreshScheduler({
      now: () => new Date(nowMs),
      onRefresh,
    });

    scheduler.start({ intervalMs: 300_000 });
    const first = scheduler.triggerConnectionCompleted("provider.claude");
    const second = scheduler.triggerReconnected("provider.claude");
    expect(onRefresh).toHaveBeenCalledTimes(1);

    release?.();
    await Promise.all([first, second]);

    const diagnostics = scheduler.getDiagnostics();
    expect(diagnostics.refresh.outcomes.success).toBe(1);
    expect(diagnostics.refresh.outcomes.skippedDuplicate).toBe(1);
    expect(diagnostics.refresh.latency.sampleCount).toBe(1);
    expect(diagnostics.refresh.latency.lastMs).toBe(12);

    scheduler.stop();
  });

  it("records scheduled refresh lag when runs occur after due time", async () => {
    let nowMs = 0;
    let intervalCallback: (() => void) | undefined;
    const scheduler = new DiscoveryRefreshScheduler({
      now: () => new Date(nowMs),
      onRefresh: async () => {
        nowMs += 8;
      },
      setIntervalFn: ((callback: () => void) => {
        intervalCallback = callback;
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as typeof setInterval,
      clearIntervalFn: (() => {}) as typeof clearInterval,
    });

    scheduler.start({ intervalMs: 100 });
    scheduler.registerProvider("provider.claude");
    nowMs = 160;

    intervalCallback?.();
    await Promise.resolve();
    await Promise.resolve();

    const diagnostics = scheduler.getDiagnostics();
    expect(diagnostics.refresh.outcomes.success).toBe(1);
    expect(diagnostics.refresh.lag.sampleCount).toBe(1);
    expect(diagnostics.refresh.lag.lastMs).toBe(60);

    scheduler.stop();
  });
});
