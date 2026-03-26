import { useCallback, useEffect, useState } from "react";
import { TokenUsageService } from "../../usage/token-usage-service.js";
import type { OriginUsageSummary } from "../../usage/token-usage-types.js";
import { TOKEN_USAGE_STORAGE_KEY } from "../../usage/token-usage-types.js";

function createStorageAdapter() {
    return {
        async get(keys: readonly string[]): Promise<Record<string, unknown>> {
            return chrome.storage.local.get([...keys]) as Promise<Record<string, unknown>>;
        },
        async set(items: Record<string, unknown>): Promise<void> {
            await chrome.storage.local.set(items);
        },
    };
}

export function useTokenUsage() {
    const [summaries, setSummaries] = useState<OriginUsageSummary[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const service = new TokenUsageService(createStorageAdapter());
            const all = await service.getAllUsage();
            setSummaries(all);
        } catch (error) {
            console.error("Failed to load token usage", error);
        } finally {
            setLoading(false);
        }
    }, []);

    const resetAll = useCallback(async () => {
        const service = new TokenUsageService(createStorageAdapter());
        await service.resetUsage();
        await load();
    }, [load]);

    const resetOrigin = useCallback(async (origin: string) => {
        const service = new TokenUsageService(createStorageAdapter());
        await service.resetUsage({ origin });
        await load();
    }, [load]);

    useEffect(() => {
        void load();
        const listener = (
            changes: Record<string, chrome.storage.StorageChange>,
            area: string,
        ) => {
            if (area === "local" && TOKEN_USAGE_STORAGE_KEY in changes) {
                void load();
            }
        };
        chrome.storage.onChanged.addListener(listener);
        return () => chrome.storage.onChanged.removeListener(listener);
    }, [load]);

    return { summaries, loading, reload: load, resetAll, resetOrigin };
}
