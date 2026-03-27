import { useCallback, useEffect, useState } from "react";
import { useVaultContext } from "./VaultContext.js";

export type ProviderUsageEntry = {
    providerId: string;
    modelId: string;
    inputTokens: number;
    outputTokens: number;
};

export type OriginUsageSummary = {
    origin: string;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalRequestCount: number;
    byProvider: ProviderUsageEntry[];
};

export function useTokenUsage() {
    const { sendVaultMessage } = useVaultContext();
    const [summaries, setSummaries] = useState<OriginUsageSummary[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await sendVaultMessage({ type: "vault.usage.read" });
            const totals = (res.totals ?? {}) as Record<
                string,
                { inputTokens: number; outputTokens: number; requestCount: number; lastUpdated: string }
            >;
            const recentEntries = (res.recentEntries ?? []) as Array<{
                origin: string;
                providerId?: string;
                modelId?: string;
                inputTokens: number;
                outputTokens: number;
            }>;

            const byOrigin = new Map<string, OriginUsageSummary>();

            const getOrCreate = (origin: string): OriginUsageSummary => {
                let entry = byOrigin.get(origin);
                if (!entry) {
                    entry = { origin, totalInputTokens: 0, totalOutputTokens: 0, totalRequestCount: 0, byProvider: [] };
                    byOrigin.set(origin, entry);
                }
                return entry;
            };

            for (const [key, val] of Object.entries(totals)) {
                const parts = key.split("\0");
                const origin = parts[0] ?? "unknown";
                const providerId = parts[1] ?? "unknown";
                const modelId = parts[2] ?? "unknown";
                const entry = getOrCreate(origin);
                entry.totalInputTokens += val.inputTokens;
                entry.totalOutputTokens += val.outputTokens;
                entry.totalRequestCount += val.requestCount;
                entry.byProvider.push({ providerId, modelId, inputTokens: val.inputTokens, outputTokens: val.outputTokens });
            }

            for (const re of recentEntries) {
                const entry = getOrCreate(re.origin);
                entry.totalInputTokens += re.inputTokens;
                entry.totalOutputTokens += re.outputTokens;
                entry.totalRequestCount += 1;
                if (re.providerId || re.modelId) {
                    entry.byProvider.push({
                        providerId: re.providerId ?? "unknown",
                        modelId: re.modelId ?? "unknown",
                        inputTokens: re.inputTokens,
                        outputTokens: re.outputTokens,
                    });
                }
            }

            setSummaries([...byOrigin.values()]);
        } catch (error) {
            console.error("Failed to load token usage", error);
        } finally {
            setLoading(false);
        }
    }, [sendVaultMessage]);

    const resetAll = useCallback(async () => {
        // vault doesn't support reset — no-op
    }, []);

    const resetOrigin = useCallback(async (_origin: string) => {
        // vault doesn't support per-origin reset — no-op
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return { summaries, loading, reload: load, resetAll, resetOrigin };
}
