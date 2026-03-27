import { describe, expect, it } from "vitest";
import {
    TokenUsageService,
    type TokenUsageStorageAdapter,
} from "../usage/token-usage-service.js";

function makeTestStorage(): TokenUsageStorageAdapter & {
    snapshot: () => Record<string, unknown>;
} {
    const state: Record<string, unknown> = {};
    return {
        async get(keys) {
            return Object.fromEntries(keys.map((key) => [key, state[key]]));
        },
        async set(items) {
            Object.assign(state, items);
        },
        snapshot() {
            return { ...state };
        },
    };
}

describe("TokenUsageService", () => {
    it("records usage and retrieves it by origin", async () => {
        const storage = makeTestStorage();
        const service = new TokenUsageService(storage);

        await service.recordUsage({
            origin: "https://example.com",
            providerId: "provider.ollama",
            modelId: "llama3.2",
            report: { inputTokens: 100, outputTokens: 50, source: "reported" },
        });

        const summary = await service.getUsageByOrigin("https://example.com");
        expect(summary.totalInputTokens).toBe(100);
        expect(summary.totalOutputTokens).toBe(50);
        expect(summary.totalRequestCount).toBe(1);
        expect(summary.byProvider).toHaveLength(1);
        expect(summary.byProvider[0]?.providerId).toBe("provider.ollama");
        expect(summary.byProvider[0]?.modelId).toBe("llama3.2");
    });

    it("accumulates multiple requests", async () => {
        const storage = makeTestStorage();
        const service = new TokenUsageService(storage);

        await service.recordUsage({
            origin: "https://example.com",
            providerId: "provider.ollama",
            modelId: "llama3.2",
            report: { inputTokens: 100, outputTokens: 50, source: "reported" },
        });
        await service.recordUsage({
            origin: "https://example.com",
            providerId: "provider.ollama",
            modelId: "llama3.2",
            report: { inputTokens: 200, outputTokens: 100, source: "estimated" },
        });

        const summary = await service.getUsageByOrigin("https://example.com");
        expect(summary.totalInputTokens).toBe(300);
        expect(summary.totalOutputTokens).toBe(150);
        expect(summary.totalRequestCount).toBe(2);
    });

    it("tracks separate providers and models independently", async () => {
        const storage = makeTestStorage();
        const service = new TokenUsageService(storage);

        await service.recordUsage({
            origin: "https://example.com",
            providerId: "provider.ollama",
            modelId: "llama3.2",
            report: { inputTokens: 100, outputTokens: 50, source: "reported" },
        });
        await service.recordUsage({
            origin: "https://example.com",
            providerId: "provider.claude",
            modelId: "sonnet-4",
            report: { inputTokens: 200, outputTokens: 100, source: "reported" },
        });

        const summary = await service.getUsageByOrigin("https://example.com");
        expect(summary.totalInputTokens).toBe(300);
        expect(summary.totalOutputTokens).toBe(150);
        expect(summary.byProvider).toHaveLength(2);
    });

    it("getAllUsage returns summaries for all origins", async () => {
        const storage = makeTestStorage();
        const service = new TokenUsageService(storage);

        await service.recordUsage({
            origin: "https://app-a.com",
            providerId: "provider.ollama",
            modelId: "llama3.2",
            report: { inputTokens: 100, outputTokens: 50, source: "reported" },
        });
        await service.recordUsage({
            origin: "https://app-b.com",
            providerId: "provider.claude",
            modelId: "sonnet-4",
            report: { inputTokens: 200, outputTokens: 100, source: "reported" },
        });

        const all = await service.getAllUsage();
        expect(all).toHaveLength(2);
    });

    it("resetUsage clears all data", async () => {
        const storage = makeTestStorage();
        const service = new TokenUsageService(storage);

        await service.recordUsage({
            origin: "https://example.com",
            providerId: "provider.ollama",
            modelId: "llama3.2",
            report: { inputTokens: 100, outputTokens: 50, source: "reported" },
        });
        await service.resetUsage();

        const all = await service.getAllUsage();
        expect(all).toHaveLength(0);
    });

    it("resetUsage with origin filter clears only that origin", async () => {
        const storage = makeTestStorage();
        const service = new TokenUsageService(storage);

        await service.recordUsage({
            origin: "https://keep.com",
            providerId: "p",
            modelId: "m",
            report: { inputTokens: 10, outputTokens: 5, source: "estimated" },
        });
        await service.recordUsage({
            origin: "https://remove.com",
            providerId: "p",
            modelId: "m",
            report: { inputTokens: 20, outputTokens: 10, source: "estimated" },
        });

        await service.resetUsage({ origin: "https://remove.com" });

        const all = await service.getAllUsage();
        expect(all).toHaveLength(1);
        expect(all[0]?.origin).toBe("https://keep.com");
    });

    it("compacts entries older than the 1st of last month", async () => {
        const storage = makeTestStorage();
        const service = new TokenUsageService(storage);

        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        await service.recordUsage({
            origin: "https://example.com",
            providerId: "p",
            modelId: "m",
            report: { inputTokens: 100, outputTokens: 50, source: "reported" },
            timestamp: threeMonthsAgo.getTime(),
        });

        await service.recordUsage({
            origin: "https://example.com",
            providerId: "p",
            modelId: "m",
            report: { inputTokens: 10, outputTokens: 5, source: "reported" },
        });

        const summary = await service.getUsageByOrigin("https://example.com");
        expect(summary.totalInputTokens).toBe(110);
        expect(summary.totalOutputTokens).toBe(55);

        // Verify the old entry was actually compacted: only the recent entry
        // should remain in entries[], with the old one folded into allTimeTotals.
        const raw = storage.snapshot();
        const store = raw["byom.token-usage.v1"] as {
            records: Record<string, { entries: unknown[]; allTimeTotals: { inputTokens: number; outputTokens: number; requestCount: number } }>;
        };
        const record = store.records["https://example.com\0p\0m"]!;
        expect(record.entries).toHaveLength(1);
        expect(record.allTimeTotals.inputTokens).toBe(100);
        expect(record.allTimeTotals.outputTokens).toBe(50);
        expect(record.allTimeTotals.requestCount).toBe(1);
    });

    it("evicts oldest record when cap is reached", async () => {
        const storage = makeTestStorage();
        const service = new TokenUsageService(storage);

        // Fill up to the 500 cap
        for (let i = 0; i < 500; i++) {
            await service.recordUsage({
                origin: `https://app-${String(i).padStart(3, "0")}.com`,
                providerId: "p",
                modelId: "m",
                report: { inputTokens: 1, outputTokens: 1, source: "estimated" },
                timestamp: Date.now() + i, // ensure different timestamps
            });
        }

        // Add 501st record
        await service.recordUsage({
            origin: "https://new-app.com",
            providerId: "p",
            modelId: "m",
            report: { inputTokens: 99, outputTokens: 99, source: "estimated" },
        });

        const all = await service.getAllUsage();
        // Should still be 500 (one evicted)
        expect(all.length).toBeLessThanOrEqual(500);
        // The new record should exist
        const newApp = all.find((s) => s.origin === "https://new-app.com");
        expect(newApp).toBeDefined();
        expect(newApp!.totalInputTokens).toBe(99);
    });
});
