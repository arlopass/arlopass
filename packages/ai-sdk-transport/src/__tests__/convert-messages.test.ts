import { describe, expect, it } from "vitest";
import { convertMessages } from "../convert-messages.js";

describe("convertMessages", () => {
    it("converts a simple user text message", () => {
        const result = convertMessages([
            { id: "1", role: "user", parts: [{ type: "text", text: "Hello" }] },
        ]);
        expect(result).toEqual([{ role: "user", content: "Hello" }]);
    });

    it("converts a system message", () => {
        const result = convertMessages([
            { id: "0", role: "system", parts: [{ type: "text", text: "You are helpful." }] },
        ]);
        expect(result).toEqual([{ role: "system", content: "You are helpful." }]);
    });

    it("converts an assistant message with text", () => {
        const result = convertMessages([
            { id: "2", role: "assistant", parts: [{ type: "text", text: "Hi there!" }] },
        ]);
        expect(result).toEqual([{ role: "assistant", content: "Hi there!" }]);
    });

    it("joins multiple text parts with newlines", () => {
        const result = convertMessages([
            {
                id: "1",
                role: "user",
                parts: [
                    { type: "text", text: "Part one" },
                    { type: "text", text: "Part two" },
                ],
            },
        ]);
        expect(result).toEqual([{ role: "user", content: "Part one\nPart two" }]);
    });

    it("ignores non-text parts", () => {
        const result = convertMessages([
            {
                id: "2",
                role: "assistant",
                parts: [
                    { type: "text", text: "Here is the answer" },
                    { type: "file", url: "data:image/png;base64,abc", mediaType: "image/png" } as any,
                    { type: "reasoning", text: "thinking..." } as any,
                ],
            },
        ]);
        expect(result).toEqual([{ role: "assistant", content: "Here is the answer" }]);
    });

    it("skips messages with no text content", () => {
        const result = convertMessages([
            { id: "1", role: "user", parts: [{ type: "text", text: "Hello" }] },
            { id: "2", role: "assistant", parts: [{ type: "file", url: "data:image/png;abc", mediaType: "image/png" }] } as any,
        ]);
        expect(result).toEqual([{ role: "user", content: "Hello" }]);
    });

    it("handles a full conversation", () => {
        const result = convertMessages([
            { id: "0", role: "system", parts: [{ type: "text", text: "Be concise." }] },
            { id: "1", role: "user", parts: [{ type: "text", text: "What is 2+2?" }] },
            { id: "2", role: "assistant", parts: [{ type: "text", text: "4" }] },
            { id: "3", role: "user", parts: [{ type: "text", text: "Thanks" }] },
        ]);
        expect(result).toEqual([
            { role: "system", content: "Be concise." },
            { role: "user", content: "What is 2+2?" },
            { role: "assistant", content: "4" },
            { role: "user", content: "Thanks" },
        ]);
    });

    it("returns empty array for empty input", () => {
        expect(convertMessages([])).toEqual([]);
    });
});
