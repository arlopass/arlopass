import { describe, expect, it } from "vitest";

import { DiscoveryCache } from "../cloud/discovery-cache.js";

describe("DiscoveryCache", () => {
  it("distinguishes miss, refreshed, hot, and stale cache states", () => {
    let nowMs = 1_000;
    const cache = new DiscoveryCache<{ value: string }>({
      hotTtlMs: 300_000,
      negativeTtlMs: 60_000,
      now: () => new Date(nowMs),
    });

    expect(cache.read("provider.claude").cacheStatus).toBe("miss");

    const refreshed = cache.storeSuccess("provider.claude", { value: "ok" });
    expect(refreshed.cacheStatus).toBe("refreshed");

    expect(cache.read("provider.claude")).toMatchObject({
      cacheStatus: "hot",
      isNegative: false,
      value: { value: "ok" },
    });

    nowMs += 300_001;
    expect(cache.read("provider.claude").cacheStatus).toBe("stale");
  });

  it("uses negative-cache TTL of 60 seconds", () => {
    let nowMs = 5_000;
    const cache = new DiscoveryCache<{ value: string }>({
      hotTtlMs: 300_000,
      negativeTtlMs: 60_000,
      now: () => new Date(nowMs),
    });

    cache.storeNegative("provider.claude", "provider.unavailable");
    expect(cache.read("provider.claude")).toMatchObject({
      cacheStatus: "hot",
      isNegative: true,
      reasonCode: "provider.unavailable",
    });

    nowMs += 60_001;
    expect(cache.read("provider.claude")).toMatchObject({
      cacheStatus: "stale",
      isNegative: true,
    });
  });

  it("tracks cache-state and refresh diagnostics counters", () => {
    let nowMs = 1_000;
    const cache = new DiscoveryCache<{ value: string }>({
      hotTtlMs: 10,
      negativeTtlMs: 5,
      now: () => new Date(nowMs),
    });

    cache.read("provider.claude");
    cache.storeSuccess("provider.claude", { value: "ok" });
    cache.read("provider.claude");

    nowMs += 11;
    cache.read("provider.claude");

    cache.storeNegative("provider.claude", "provider.unavailable");
    cache.read("provider.claude");

    expect(cache.getDiagnostics()).toMatchObject({
      reads: {
        total: 4,
        hit: 2,
        miss: 1,
        stale: 1,
      },
      refresh: {
        success: 1,
        negative: 1,
      },
    });
  });

  it("marks entries stale on explicit invalidation", () => {
    const cache = new DiscoveryCache<{ value: string }>();
    cache.storeSuccess("provider.claude", { value: "ok" });
    expect(cache.read("provider.claude").cacheStatus).toBe("hot");

    cache.markStale("provider.claude", {
      signal: "policy.version.changed",
    });
    expect(cache.read("provider.claude").cacheStatus).toBe("stale");
    expect(cache.state("provider.claude")).toBe("stale");
    expect(cache.read("provider.claude").invalidationSignal).toBe(
      "policy.version.changed",
    );
  });

  it("flags stale/partial region discovery snapshots as degraded", () => {
    const cache = new DiscoveryCache<{
      regions: Array<{ id: string; status: "healthy" | "stale" | "partial" | "unavailable" }>;
    }>();
    cache.storeSuccess("provider.claude", {
      regions: [
        { id: "us-east-1", status: "stale" },
        { id: "us-west-2", status: "healthy" },
      ],
    });

    expect(cache.read("provider.claude")).toMatchObject({
      cacheStatus: "hot",
      degraded: true,
      degradedReason: "stale",
    });
  });

  it("tracks provider-unavailable threshold invalidation signal", () => {
    const cache = new DiscoveryCache<{ value: string }>();
    cache.storeSuccess("provider.claude", { value: "ok" });
    cache.markStale("provider.claude", {
      signal: "provider.unavailable.threshold",
      detail: "failures=3",
    });

    expect(cache.read("provider.claude")).toMatchObject({
      cacheStatus: "stale",
      invalidationSignal: "provider.unavailable.threshold",
      invalidationDetail: "failures=3",
    });
  });
});
