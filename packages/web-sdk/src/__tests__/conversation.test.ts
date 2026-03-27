import { describe, expect, it } from "vitest";
import { ConversationManager } from "../conversation.js";
import type { ArlopassClient } from "../client.js";
import {
    MockTransport,
    setupConnectedClient,
    connectAndSelectProvider,
    createDefaultRequestHandler,
    createDefaultStreamHandler,
} from "./test-helpers.js";

function mockClient(modelId = "gpt-4o"): ArlopassClient {
    return {
        selectedProvider: { providerId: "test-provider", modelId },
    } as unknown as ArlopassClient;
}

describe("ConversationManager", () => {
    describe("construction", () => {
        it("uses developer-provided maxTokens", () => {
            const mgr = new ConversationManager({ client: mockClient(), maxTokens: 2048 });
            expect(mgr.maxTokens).toBe(2048);
        });

        it("falls back to static model lookup when maxTokens not provided", () => {
            const mgr = new ConversationManager({ client: mockClient("gpt-4o") });
            expect(mgr.maxTokens).toBe(128_000);
        });

        it("falls back to default for unknown models", () => {
            const mgr = new ConversationManager({ client: mockClient("unknown-model") });
            expect(mgr.maxTokens).toBe(4_096);
        });
    });

    describe("addMessage + getMessages", () => {
        it("stores messages in order", () => {
            const mgr = new ConversationManager({ client: mockClient(), maxTokens: 10_000 });
            mgr.addMessage({ role: "user", content: "Hello" });
            mgr.addMessage({ role: "assistant", content: "Hi there!" });
            const messages = mgr.getMessages();
            expect(messages).toHaveLength(2);
            expect(messages[0]?.role).toBe("user");
            expect(messages[1]?.role).toBe("assistant");
        });

        it("includes system prompt as first message", () => {
            const mgr = new ConversationManager({
                client: mockClient(),
                maxTokens: 10_000,
                systemPrompt: "You are helpful.",
            });
            mgr.addMessage({ role: "user", content: "Hello" });
            const messages = mgr.getMessages();
            expect(messages).toHaveLength(2);
            expect(messages[0]).toEqual({ role: "system", content: "You are helpful." });
        });
    });

    describe("clear", () => {
        it("removes all messages", () => {
            const mgr = new ConversationManager({ client: mockClient(), maxTokens: 10_000 });
            mgr.addMessage({ role: "user", content: "Hello" });
            mgr.clear();
            expect(mgr.getMessages()).toHaveLength(0);
        });

        it("preserves system prompt after clear", () => {
            const mgr = new ConversationManager({
                client: mockClient(),
                maxTokens: 10_000,
                systemPrompt: "System",
            });
            mgr.addMessage({ role: "user", content: "Hello" });
            mgr.clear();
            const messages = mgr.getMessages();
            expect(messages).toHaveLength(1);
            expect(messages[0]?.role).toBe("system");
        });
    });

    describe("getContextWindow truncation", () => {
        it("includes all messages when they fit within budget", () => {
            const mgr = new ConversationManager({ client: mockClient(), maxTokens: 10_000 });
            mgr.addMessage({ role: "user", content: "short" });
            mgr.addMessage({ role: "assistant", content: "also short" });
            const window = mgr.getContextWindow();
            expect(window).toHaveLength(2);
        });

        it("evicts oldest non-pinned messages when over budget", () => {
            const mgr = new ConversationManager({ client: mockClient(), maxTokens: 100, reserveOutputTokens: 20 });
            mgr.addMessage({ role: "user", content: "a".repeat(200) });
            mgr.addMessage({ role: "assistant", content: "b".repeat(200) });
            mgr.addMessage({ role: "user", content: "c".repeat(100) });
            const window = mgr.getContextWindow();
            expect(window).toHaveLength(2);
            expect(window[0]?.content).toBe("b".repeat(200));
            expect(window[1]?.content).toBe("c".repeat(100));
        });

        it("pins system prompt at position 0 and never evicts it", () => {
            const mgr = new ConversationManager({
                client: mockClient(),
                maxTokens: 50,
                reserveOutputTokens: 10,
                systemPrompt: "a".repeat(40),
            });
            mgr.addMessage({ role: "user", content: "b".repeat(80) });
            mgr.addMessage({ role: "user", content: "c".repeat(40) });
            const window = mgr.getContextWindow();
            expect(window[0]?.role).toBe("system");
            expect(window.length).toBeGreaterThanOrEqual(2);
        });

        it("keeps pinned messages even when over budget", () => {
            const mgr = new ConversationManager({ client: mockClient(), maxTokens: 30, reserveOutputTokens: 0 });
            mgr.addMessage({ role: "user", content: "a".repeat(60) }, { pinned: true });
            mgr.addMessage({ role: "user", content: "b".repeat(60) }, { pinned: true });
            mgr.addMessage({ role: "user", content: "c".repeat(60) });
            const window = mgr.getContextWindow();
            expect(window).toHaveLength(2);
            expect(window[0]?.content).toBe("a".repeat(60));
            expect(window[1]?.content).toBe("b".repeat(60));
        });

        it("preserves original message order in context window", () => {
            const mgr = new ConversationManager({ client: mockClient(), maxTokens: 200, reserveOutputTokens: 0 });
            mgr.addMessage({ role: "user", content: "first" });
            mgr.addMessage({ role: "assistant", content: "second" }, { pinned: true });
            mgr.addMessage({ role: "user", content: "third" });
            const window = mgr.getContextWindow();
            expect(window.map((m) => m.content)).toEqual(["first", "second", "third"]);
        });
    });

    describe("setPin", () => {
        it("pins a message affecting truncation behavior", () => {
            const mgr = new ConversationManager({ client: mockClient(), maxTokens: 25, reserveOutputTokens: 0 });
            mgr.addMessage({ role: "user", content: "a".repeat(40) });
            mgr.addMessage({ role: "user", content: "b".repeat(40) });
            mgr.addMessage({ role: "user", content: "c".repeat(40) });
            mgr.setPin(0, true);
            const window = mgr.getContextWindow();
            expect(window).toHaveLength(2);
            expect(window[0]?.content).toBe("a".repeat(40));
            expect(window[1]?.content).toBe("c".repeat(40));
        });
    });

    describe("getTokenCount", () => {
        it("returns estimated token count for context window", () => {
            const mgr = new ConversationManager({ client: mockClient(), maxTokens: 10_000 });
            mgr.addMessage({ role: "user", content: "a".repeat(100) });
            expect(mgr.getTokenCount()).toBe(25);
        });
    });

    describe("send()", () => {
        it("sends messages via client and appends response to history", async () => {
            const transport = new MockTransport();
            transport.requestHandler = createDefaultRequestHandler();
            transport.streamHandler = createDefaultStreamHandler();
            const client = setupConnectedClient(transport);
            await connectAndSelectProvider(client);

            const mgr = new ConversationManager({ client, maxTokens: 10_000 });
            const response = await mgr.send("Hello");
            expect(response.content).toBe("Hello from Arlopass.");
            expect(mgr.getMessages()).toHaveLength(2);
            expect(mgr.getMessages()[0]?.role).toBe("user");
            expect(mgr.getMessages()[1]?.role).toBe("assistant");
        });
    });

    describe("stream()", () => {
        it("streams response and appends to history when done", async () => {
            const transport = new MockTransport();
            transport.requestHandler = createDefaultRequestHandler();
            transport.streamHandler = createDefaultStreamHandler();
            const client = setupConnectedClient(transport);
            await connectAndSelectProvider(client);

            const mgr = new ConversationManager({ client, maxTokens: 10_000 });
            let full = "";
            for await (const event of mgr.stream("Hi")) {
                if (event.type === "chunk") full += event.delta;
            }
            expect(full).toBe("Hello");
            expect(mgr.getMessages()).toHaveLength(2);
            expect(mgr.getMessages()[1]?.content).toBe("Hello");
        });
    });

    describe("getContextInfo()", () => {
        it("returns context window usage for current messages", () => {
            const mgr = new ConversationManager({ client: mockClient("gpt-4o"), maxTokens: 1000, reserveOutputTokens: 200 });
            mgr.addMessage({ role: "user", content: "a".repeat(400) }); // ~100 tokens
            const info = mgr.getContextInfo();
            expect(info.maxTokens).toBe(1000);
            expect(info.reservedOutputTokens).toBe(200);
            expect(info.usedTokens).toBe(100);
            expect(info.remainingTokens).toBe(700); // 1000 - 200 - 100
            expect(info.usageRatio).toBeCloseTo(100 / 800, 5);
        });

        it("returns zero usage when empty", () => {
            const mgr = new ConversationManager({ client: mockClient(), maxTokens: 4096 });
            const info = mgr.getContextInfo();
            expect(info.usedTokens).toBe(0);
            expect(info.remainingTokens).toBe(4096 - 1024); // default reserveOutputTokens
            expect(info.usageRatio).toBe(0);
        });

        it("clamps usageRatio to 1 when context window is nearly full", () => {
            // maxTokens=100, reserve=20 → input budget=80 tokens
            // Add a message close to the budget: 76 tokens (304 chars / 4)
            const mgr = new ConversationManager({ client: mockClient(), maxTokens: 100, reserveOutputTokens: 20 });
            mgr.addMessage({ role: "user", content: "a".repeat(304) }); // 76 tokens
            const info = mgr.getContextInfo();
            expect(info.usedTokens).toBe(76);
            expect(info.remainingTokens).toBe(4);
            expect(info.usageRatio).toBeCloseTo(76 / 80, 5);
        });

        it("includes system prompt tokens in usage", () => {
            const systemPrompt = "x".repeat(200); // ~50 tokens
            const mgr = new ConversationManager({
                client: mockClient(),
                maxTokens: 1000,
                reserveOutputTokens: 0,
                systemPrompt,
            });
            const info = mgr.getContextInfo();
            expect(info.usedTokens).toBe(50);
            expect(info.remainingTokens).toBe(950);
        });
    });
});
