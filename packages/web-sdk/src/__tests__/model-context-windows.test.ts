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
});
