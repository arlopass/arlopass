import {
    TOKEN_USAGE_STORAGE_KEY,
    MAX_USAGE_RECORD_KEYS,
    makeUsageRecordKey,
    parseUsageRecordKey,
    type TokenUsageStore,
    type TokenUsageRecord,
    type TokenUsageEntry,
    type UsageReport,
    type OriginUsageSummary,
} from "./token-usage-types.js";

export type TokenUsageStorageAdapter = Readonly<{
    get(keys: readonly string[]): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
}>;

function createEmptyRecord(): TokenUsageRecord {
    return {
        entries: [],
        allTimeTotals: { inputTokens: 0, outputTokens: 0, requestCount: 0 },
    };
}

function createEmptyStore(): TokenUsageStore {
    return { version: 1, records: {} };
}

function isTokenUsageStore(value: unknown): value is TokenUsageStore {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return record["version"] === 1 && typeof record["records"] === "object";
}

function getCompactionCutoff(): number {
    const now = new Date();
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return firstOfLastMonth.getTime();
}

function compactRecord(record: TokenUsageRecord): void {
    const cutoff = getCompactionCutoff();
    const kept: TokenUsageEntry[] = [];
    for (const entry of record.entries) {
        if (entry.timestamp < cutoff) {
            record.allTimeTotals.inputTokens += entry.inputTokens;
            record.allTimeTotals.outputTokens += entry.outputTokens;
            record.allTimeTotals.requestCount += 1;
        } else {
            kept.push(entry);
        }
    }
    record.entries = kept;
}

function recordTotals(record: TokenUsageRecord): {
    inputTokens: number;
    outputTokens: number;
    requestCount: number;
} {
    let inputTokens = record.allTimeTotals.inputTokens;
    let outputTokens = record.allTimeTotals.outputTokens;
    let requestCount = record.allTimeTotals.requestCount;
    for (const entry of record.entries) {
        inputTokens += entry.inputTokens;
        outputTokens += entry.outputTokens;
        requestCount += 1;
    }
    return { inputTokens, outputTokens, requestCount };
}

export class TokenUsageService {
    readonly #storage: TokenUsageStorageAdapter;

    constructor(storage: TokenUsageStorageAdapter) {
        this.#storage = storage;
    }

    async #loadStore(): Promise<TokenUsageStore> {
        const raw = await this.#storage.get([TOKEN_USAGE_STORAGE_KEY]);
        const value = raw[TOKEN_USAGE_STORAGE_KEY];
        if (isTokenUsageStore(value)) {
            return value;
        }
        return createEmptyStore();
    }

    async #saveStore(store: TokenUsageStore): Promise<void> {
        await this.#storage.set({ [TOKEN_USAGE_STORAGE_KEY]: store });
    }

    async recordUsage(options: {
        origin: string;
        providerId: string;
        modelId: string;
        report: UsageReport;
        timestamp?: number;
    }): Promise<void> {
        const store = await this.#loadStore();
        const key = makeUsageRecordKey(
            options.origin,
            options.providerId,
            options.modelId,
        );

        if (store.records[key] === undefined) {
            const keys = Object.keys(store.records);
            if (keys.length >= MAX_USAGE_RECORD_KEYS) {
                let oldestKey: string | undefined;
                let oldestTimestamp = Infinity;
                for (const k of keys) {
                    const rec = store.records[k]!;
                    const lastEntry = rec.entries[rec.entries.length - 1];
                    const ts = lastEntry?.timestamp ?? 0;
                    if (ts < oldestTimestamp) {
                        oldestTimestamp = ts;
                        oldestKey = k;
                    }
                }
                if (oldestKey !== undefined) {
                    delete store.records[oldestKey];
                }
            }
            store.records[key] = createEmptyRecord();
        }

        const record = store.records[key]!;
        record.entries.push({
            timestamp: options.timestamp ?? Date.now(),
            inputTokens: options.report.inputTokens,
            outputTokens: options.report.outputTokens,
            source: options.report.source,
        });

        compactRecord(record);
        await this.#saveStore(store);
    }

    async getUsageByOrigin(origin: string): Promise<OriginUsageSummary> {
        const store = await this.#loadStore();
        const byProvider: OriginUsageSummary["byProvider"] = [];
        let totalInput = 0;
        let totalOutput = 0;
        let totalCount = 0;

        for (const [key, record] of Object.entries(store.records)) {
            const parsed = parseUsageRecordKey(key);
            if (parsed === undefined || parsed.origin !== origin) continue;
            const totals = recordTotals(record);
            totalInput += totals.inputTokens;
            totalOutput += totals.outputTokens;
            totalCount += totals.requestCount;
            byProvider.push({
                providerId: parsed.providerId,
                modelId: parsed.modelId,
                inputTokens: totals.inputTokens,
                outputTokens: totals.outputTokens,
                requestCount: totals.requestCount,
            });
        }

        return {
            origin,
            totalInputTokens: totalInput,
            totalOutputTokens: totalOutput,
            totalRequestCount: totalCount,
            byProvider,
        };
    }

    async getAllUsage(): Promise<OriginUsageSummary[]> {
        const store = await this.#loadStore();
        const byOrigin = new Map<string, OriginUsageSummary>();

        for (const [key, record] of Object.entries(store.records)) {
            const parsed = parseUsageRecordKey(key);
            if (parsed === undefined) continue;
            const totals = recordTotals(record);
            let summary = byOrigin.get(parsed.origin);
            if (summary === undefined) {
                summary = {
                    origin: parsed.origin,
                    totalInputTokens: 0,
                    totalOutputTokens: 0,
                    totalRequestCount: 0,
                    byProvider: [],
                };
                byOrigin.set(parsed.origin, summary);
            }
            summary.totalInputTokens += totals.inputTokens;
            summary.totalOutputTokens += totals.outputTokens;
            summary.totalRequestCount += totals.requestCount;
            summary.byProvider.push({
                providerId: parsed.providerId,
                modelId: parsed.modelId,
                inputTokens: totals.inputTokens,
                outputTokens: totals.outputTokens,
                requestCount: totals.requestCount,
            });
        }

        return [...byOrigin.values()];
    }

    async resetUsage(filter?: { origin?: string }): Promise<void> {
        if (filter?.origin !== undefined) {
            const store = await this.#loadStore();
            const prefix = filter.origin + "\0";
            for (const key of Object.keys(store.records)) {
                if (key.startsWith(prefix)) {
                    delete store.records[key];
                }
            }
            await this.#saveStore(store);
            return;
        }
        await this.#saveStore(createEmptyStore());
    }
}
