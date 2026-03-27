// apps/bridge/src/vault/vault-compaction.ts
import type { VaultUsage, UsageTotals } from "./vault-types.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function makeKey(origin: string, providerId: string, modelId: string): string {
    return `${origin}\0${providerId}\0${modelId}`;
}

export function compactUsage(usage: VaultUsage, now: Date): VaultUsage {
    const cutoff = now.getTime() - THIRTY_DAYS_MS;
    const kept = [];
    const totals: Record<string, UsageTotals> = { ...usage.totals };
    const nowIso = now.toISOString();

    for (const entry of usage.recentEntries) {
        if (new Date(entry.timestamp).getTime() >= cutoff) {
            kept.push(entry);
            continue;
        }
        const key = makeKey(entry.origin, entry.providerId, entry.modelId);
        const existing = totals[key];
        if (existing !== undefined) {
            totals[key] = {
                inputTokens: existing.inputTokens + entry.inputTokens,
                outputTokens: existing.outputTokens + entry.outputTokens,
                requestCount: existing.requestCount + 1,
                lastUpdated: nowIso,
            };
        } else {
            totals[key] = {
                inputTokens: entry.inputTokens,
                outputTokens: entry.outputTokens,
                requestCount: 1,
                lastUpdated: nowIso,
            };
        }
    }

    return { recentEntries: kept, totals };
}
