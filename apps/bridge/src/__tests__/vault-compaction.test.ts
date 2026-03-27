// apps/bridge/src/__tests__/vault-compaction.test.ts
import { describe, expect, it } from "vitest";
import { compactUsage } from "../vault/vault-compaction.js";
import type { VaultUsage } from "../vault/vault-types.js";

const NOW = "2026-03-27T00:00:00Z";
const OLD = "2026-02-01T00:00:00Z"; // >30 days ago
const RECENT = "2026-03-20T00:00:00Z"; // <30 days ago

describe("compactUsage", () => {
  it("moves entries older than 30 days into totals", () => {
    const usage: VaultUsage = {
      recentEntries: [
        { origin: "https://app.test", providerId: "p1", modelId: "m1", inputTokens: 100, outputTokens: 50, timestamp: OLD },
        { origin: "https://app.test", providerId: "p1", modelId: "m1", inputTokens: 200, outputTokens: 100, timestamp: RECENT },
      ],
      totals: {},
    };
    const result = compactUsage(usage, new Date(NOW));
    expect(result.recentEntries).toHaveLength(1);
    expect(result.recentEntries[0]!.timestamp).toBe(RECENT);

    const key = "https://app.test\0p1\0m1";
    expect(result.totals[key]).toBeDefined();
    expect(result.totals[key]!.inputTokens).toBe(100);
    expect(result.totals[key]!.outputTokens).toBe(50);
    expect(result.totals[key]!.requestCount).toBe(1);
  });

  it("merges into existing totals additively", () => {
    const key = "https://app.test\0p1\0m1";
    const usage: VaultUsage = {
      recentEntries: [
        { origin: "https://app.test", providerId: "p1", modelId: "m1", inputTokens: 100, outputTokens: 50, timestamp: OLD },
      ],
      totals: {
        [key]: { inputTokens: 500, outputTokens: 250, requestCount: 10, lastUpdated: OLD },
      },
    };
    const result = compactUsage(usage, new Date(NOW));
    expect(result.recentEntries).toHaveLength(0);
    expect(result.totals[key]!.inputTokens).toBe(600);
    expect(result.totals[key]!.outputTokens).toBe(300);
    expect(result.totals[key]!.requestCount).toBe(11);
  });

  it("does nothing when all entries are recent", () => {
    const usage: VaultUsage = {
      recentEntries: [
        { origin: "https://a.test", providerId: "p", modelId: "m", inputTokens: 10, outputTokens: 5, timestamp: RECENT },
      ],
      totals: {},
    };
    const result = compactUsage(usage, new Date(NOW));
    expect(result.recentEntries).toHaveLength(1);
    expect(Object.keys(result.totals)).toHaveLength(0);
  });

  it("handles empty usage", () => {
    const usage: VaultUsage = { recentEntries: [], totals: {} };
    const result = compactUsage(usage, new Date(NOW));
    expect(result.recentEntries).toHaveLength(0);
    expect(Object.keys(result.totals)).toHaveLength(0);
  });
});
