import { describe, expect, it } from "vitest";
import {
    estimateTokenCount,
    estimateInputTokens,
} from "../usage/token-estimation.js";
import type { ChatMessage } from "@arlopass/web-sdk";

describe("estimateTokenCount", () => {
    it("returns 1 for very short text", () => {
        expect(estimateTokenCount("hi")).toBe(1);
    });

    it("estimates based on character length / 4", () => {
        const text = "a".repeat(100);
        expect(estimateTokenCount(text)).toBe(25);
    });

    it("rounds up for non-divisible lengths", () => {
        expect(estimateTokenCount("hello")).toBe(2);
    });

    it("returns 0 for empty string", () => {
        expect(estimateTokenCount("")).toBe(0);
    });
});

describe("estimateInputTokens", () => {
    it("sums token estimates across all messages", () => {
        const messages: ChatMessage[] = [
            { role: "system", content: "a".repeat(40) },
            { role: "user", content: "a".repeat(80) },
        ];
        expect(estimateInputTokens(messages)).toBe(30);
    });

    it("returns 0 for empty array", () => {
        expect(estimateInputTokens([])).toBe(0);
    });
});
