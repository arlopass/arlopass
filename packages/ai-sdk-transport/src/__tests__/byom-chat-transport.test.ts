import { describe, expect, it, vi } from "vitest";
import { BYOMChatTransport } from "../byom-chat-transport.js";

function createMockClient(overrides: Record<string, any> = {}) {
    return {
        state: "connected",
        selectedProvider: { providerId: "openai", modelId: "gpt-4o" },
        connect: vi.fn().mockResolvedValue({
            sessionId: "s1",
            capabilities: [],
            protocolVersion: "1.0.0",
            correlationId: "c1",
        }),
        chat: {
            stream: vi.fn().mockReturnValue(
                (async function* () {
                    yield { type: "chunk", delta: "Hi", index: 0, correlationId: "c1" };
                    yield { type: "done", correlationId: "c1" };
                })(),
            ),
        },
        ...overrides,
    } as any;
}

const trivialMessages = [
    {
        id: "1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Hello" }],
    },
];

describe("BYOMChatTransport", () => {
    it("uses the provided client in BYOB mode", async () => {
        const client = createMockClient();
        const transport = new BYOMChatTransport({ client });

        const stream = await transport.sendMessages({
            trigger: "submit-message",
            chatId: "chat1",
            messageId: undefined,
            messages: trivialMessages,
            abortSignal: undefined,
        } as any);

        expect(client.connect).not.toHaveBeenCalled();
        expect(client.chat.stream).toHaveBeenCalled();
        expect(stream).toBeInstanceOf(ReadableStream);
    });

    it("throws when extension is not installed (auto-connect, no window.byom)", async () => {
        const transport = new BYOMChatTransport({ appId: "test" });

        await expect(
            transport.sendMessages({
                trigger: "submit-message",
                chatId: "chat1",
                messageId: undefined,
                messages: trivialMessages,
                abortSignal: undefined,
            } as any),
        ).rejects.toThrow(/BYOM extension not detected/);
    });

    it("throws when no provider is selected", async () => {
        const client = createMockClient({ selectedProvider: undefined });
        const transport = new BYOMChatTransport({ client });

        await expect(
            transport.sendMessages({
                trigger: "submit-message",
                chatId: "chat1",
                messageId: undefined,
                messages: trivialMessages,
                abortSignal: undefined,
            } as any),
        ).rejects.toThrow(/No provider selected/);
    });

    it("reuses the client across multiple calls (BYOB mode)", async () => {
        const client = createMockClient();
        const transport = new BYOMChatTransport({ client });

        await transport.sendMessages({
            trigger: "submit-message",
            chatId: "chat1",
            messageId: undefined,
            messages: trivialMessages,
            abortSignal: undefined,
        } as any);

        client.chat.stream.mockReturnValue(
            (async function* () {
                yield { type: "chunk", delta: "Again", index: 0, correlationId: "c2" };
                yield { type: "done", correlationId: "c2" };
            })(),
        );

        await transport.sendMessages({
            trigger: "submit-message",
            chatId: "chat1",
            messageId: undefined,
            messages: trivialMessages,
            abortSignal: undefined,
        } as any);

        expect(client.chat.stream).toHaveBeenCalledTimes(2);
        expect(client.connect).not.toHaveBeenCalled();
    });

    it("passes abort signal to the stream", async () => {
        const controller = new AbortController();
        const client = createMockClient();
        const transport = new BYOMChatTransport({ client });

        const stream = await transport.sendMessages({
            trigger: "submit-message",
            chatId: "chat1",
            messageId: undefined,
            messages: trivialMessages,
            abortSignal: controller.signal,
        } as any);

        expect(stream).toBeInstanceOf(ReadableStream);
        const callArgs = client.chat.stream.mock.calls[0];
        expect(callArgs[1]?.signal).toBe(controller.signal);
    });

    it("reconnectToStream returns null", async () => {
        const transport = new BYOMChatTransport({ client: createMockClient() });
        const result = await transport.reconnectToStream({
            chatId: "chat1",
        } as any);
        expect(result).toBeNull();
    });

    it("converts UIMessages to ChatMessages before streaming", async () => {
        const client = createMockClient();
        const transport = new BYOMChatTransport({ client });

        await transport.sendMessages({
            trigger: "submit-message",
            chatId: "chat1",
            messageId: undefined,
            messages: [
                {
                    id: "0",
                    role: "system",
                    parts: [{ type: "text", text: "Be brief." }],
                },
                { id: "1", role: "user", parts: [{ type: "text", text: "Hi" }] },
            ],
            abortSignal: undefined,
        } as any);

        const chatInput = client.chat.stream.mock.calls[0][0];
        expect(chatInput.messages).toEqual([
            { role: "system", content: "Be brief." },
            { role: "user", content: "Hi" },
        ]);
    });
});
