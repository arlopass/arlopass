export type UsageReport = Readonly<{
    inputTokens: number;
    outputTokens: number;
    source: "reported" | "estimated";
}>;
