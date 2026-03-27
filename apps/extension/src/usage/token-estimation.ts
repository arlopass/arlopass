import type { ChatMessage } from "@arlopass/web-sdk";
import type { UsageReport } from "./token-usage-types.js";

const CHARS_PER_TOKEN = 4;

export function estimateTokenCount(text: string): number {
    if (text.length === 0) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateInputTokens(messages: readonly ChatMessage[]): number {
    let total = 0;
    for (const message of messages) {
        total += estimateTokenCount(message.content);
    }
    return total;
}

export function estimateUsageReport(
    messages: readonly ChatMessage[],
    outputText: string,
): UsageReport {
    return {
        inputTokens: estimateInputTokens(messages),
        outputTokens: estimateTokenCount(outputText),
        source: "estimated",
    };
}
