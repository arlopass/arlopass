import { describe, expect, it } from "vitest";
import { checkModelAvailability } from "../model-availability.js";
import type { ProviderDescriptor } from "../types.js";

const providers: readonly ProviderDescriptor[] = [
    { providerId: "openai", providerName: "OpenAI", models: ["gpt-4o", "gpt-4o-mini"] },
    { providerId: "ollama", providerName: "Ollama", models: ["llama3.2", "mistral"] },
];

describe("checkModelAvailability", () => {
    it("returns satisfied when no requirements specified", () => {
        const result = checkModelAvailability(providers, {});
        expect(result.satisfied).toBe(true);
        expect(result.hasSupportedModel).toBe(true);
        expect(result.hasAllRequired).toBe(true);
    });

    it("returns satisfied when at least one supported model is available", () => {
        const result = checkModelAvailability(providers, {
            supported: ["gpt-4o", "claude-sonnet-4"],
        });
        expect(result.satisfied).toBe(true);
        expect(result.hasSupportedModel).toBe(true);
        expect(result.availableSupported).toEqual(["gpt-4o"]);
        expect(result.missingSupported).toEqual(["claude-sonnet-4"]);
    });

    it("returns unsatisfied when no supported models are available", () => {
        const result = checkModelAvailability(providers, {
            supported: ["claude-sonnet-4", "claude-opus-4"],
        });
        expect(result.satisfied).toBe(false);
        expect(result.hasSupportedModel).toBe(false);
        expect(result.availableSupported).toEqual([]);
        expect(result.missingSupported).toEqual(["claude-sonnet-4", "claude-opus-4"]);
    });

    it("returns satisfied when all required models are available", () => {
        const result = checkModelAvailability(providers, {
            required: ["gpt-4o", "llama3.2"],
        });
        expect(result.satisfied).toBe(true);
        expect(result.hasAllRequired).toBe(true);
        expect(result.availableRequired).toEqual(["gpt-4o", "llama3.2"]);
        expect(result.missingRequired).toEqual([]);
    });

    it("returns unsatisfied when some required models are missing", () => {
        const result = checkModelAvailability(providers, {
            required: ["gpt-4o", "claude-sonnet-4"],
        });
        expect(result.satisfied).toBe(false);
        expect(result.hasAllRequired).toBe(false);
        expect(result.availableRequired).toEqual(["gpt-4o"]);
        expect(result.missingRequired).toEqual(["claude-sonnet-4"]);
    });

    it("requires both supported and required to be satisfied", () => {
        const result = checkModelAvailability(providers, {
            supported: ["gpt-4o"],
            required: ["claude-sonnet-4"],
        });
        expect(result.satisfied).toBe(false);
        expect(result.hasSupportedModel).toBe(true);
        expect(result.hasAllRequired).toBe(false);
    });

    it("handles empty provider list", () => {
        const result = checkModelAvailability([], {
            supported: ["gpt-4o"],
            required: ["gpt-4o"],
        });
        expect(result.satisfied).toBe(false);
        expect(result.hasSupportedModel).toBe(false);
        expect(result.hasAllRequired).toBe(false);
    });

    it("handles empty supported and required arrays", () => {
        const result = checkModelAvailability(providers, {
            supported: [],
            required: [],
        });
        expect(result.satisfied).toBe(true);
    });
});
