import { describe, expect, it } from "vitest";
import { resolveModelContextWindow, DEFAULT_CONTEXT_WINDOW } from "../model-context-windows.js";

describe("resolveModelContextWindow", () => {
    it("returns exact match for known model", () => {
        expect(resolveModelContextWindow("gpt-4o")).toBe(128_000);
    });

    it("returns prefix match for versioned model", () => {
        expect(resolveModelContextWindow("claude-sonnet-4-20250514")).toBe(200_000);
    });

    it("returns prefix match for Ollama tagged model", () => {
        expect(resolveModelContextWindow("llama3.2:latest")).toBe(131_072);
    });

    it("returns default for unknown model", () => {
        expect(resolveModelContextWindow("totally-unknown-model")).toBe(DEFAULT_CONTEXT_WINDOW);
    });

    it("picks longest prefix match when multiple match", () => {
        expect(resolveModelContextWindow("llama3.2:7b")).toBe(131_072);
    });

    // New model coverage
    it("resolves GPT-5.4 series", () => {
        expect(resolveModelContextWindow("gpt-5.4")).toBe(1_000_000);
        expect(resolveModelContextWindow("gpt-5.4-mini")).toBe(400_000);
        expect(resolveModelContextWindow("gpt-5.4-nano")).toBe(400_000);
    });

    it("resolves GPT-4.1 series", () => {
        expect(resolveModelContextWindow("gpt-4.1")).toBe(1_000_000);
        expect(resolveModelContextWindow("gpt-4.1-mini")).toBe(1_000_000);
    });

    it("resolves o-series reasoning models", () => {
        expect(resolveModelContextWindow("o3")).toBe(200_000);
        expect(resolveModelContextWindow("o3-mini")).toBe(200_000);
        expect(resolveModelContextWindow("o4-mini")).toBe(200_000);
    });

    it("resolves Claude 4.6 (1M)", () => {
        expect(resolveModelContextWindow("claude-opus-4-6")).toBe(1_000_000);
        expect(resolveModelContextWindow("claude-sonnet-4-6")).toBe(1_000_000);
        expect(resolveModelContextWindow("claude-opus-4.6")).toBe(1_000_000);
    });

    it("resolves Claude 4.5 (200K)", () => {
        expect(resolveModelContextWindow("claude-haiku-4-5")).toBe(200_000);
        expect(resolveModelContextWindow("claude-haiku-4.5")).toBe(200_000);
    });

    it("resolves Gemini 2.5 series", () => {
        expect(resolveModelContextWindow("gemini-2.5-pro")).toBe(1_048_576);
        expect(resolveModelContextWindow("gemini-2.5-flash")).toBe(1_048_576);
    });

    it("resolves Deepseek models", () => {
        expect(resolveModelContextWindow("deepseek-r1")).toBe(128_000);
        expect(resolveModelContextWindow("deepseek-v3")).toBe(128_000);
    });

    it("resolves Grok models", () => {
        expect(resolveModelContextWindow("grok-3")).toBe(131_072);
    });
});
