export type UsageReport = Readonly<{
    inputTokens: number;
    outputTokens: number;
    source: "reported" | "estimated";
}>;

export type TokenUsageEntry = Readonly<{
    timestamp: number;
    inputTokens: number;
    outputTokens: number;
    source: "reported" | "estimated";
}>;

export type TokenUsageRecord = {
    entries: TokenUsageEntry[];
    allTimeTotals: {
        inputTokens: number;
        outputTokens: number;
        requestCount: number;
    };
};

export type TokenUsageStore = {
    version: 1;
    /** Key format: `${origin}\0${providerId}\0${modelId}` */
    records: Record<string, TokenUsageRecord>;
};

export type OriginUsageSummary = {
    origin: string;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalRequestCount: number;
    byProvider: Array<{
        providerId: string;
        modelId: string;
        inputTokens: number;
        outputTokens: number;
        requestCount: number;
    }>;
};

export const TOKEN_USAGE_STORAGE_KEY = "arlopass.token-usage.v1";
export const MAX_USAGE_RECORD_KEYS = 500;

export function makeUsageRecordKey(
    origin: string,
    providerId: string,
    modelId: string,
): string {
    return `${origin}\0${providerId}\0${modelId}`;
}

export function parseUsageRecordKey(
    key: string,
): { origin: string; providerId: string; modelId: string } | undefined {
    const parts = key.split("\0");
    if (parts.length !== 3) return undefined;
    return { origin: parts[0]!, providerId: parts[1]!, modelId: parts[2]! };
}
