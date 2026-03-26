import { describe, expect, it } from "vitest";
import { estimateTokenCount } from "../token-estimation.js";

describe("estimateTokenCount", () => {
    it("returns 0 for empty string", () => {
        expect(estimateTokenCount("")).toBe(0);
    });

    it("returns 1 for short text", () => {
        expect(estimateTokenCount("hi")).toBe(1);
    });

    it("estimates based on character length / 4", () => {
        expect(estimateTokenCount("a".repeat(100))).toBe(25);
    });

    it("rounds up for non-divisible lengths", () => {
        expect(estimateTokenCount("hello")).toBe(2);
    });
});
