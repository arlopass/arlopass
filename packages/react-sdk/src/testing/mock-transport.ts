"use client";

import type { BYOMTransport } from "@byom-ai/web-sdk";

type MockTransportOptions = {
    /** Capabilities returned on session.create */
    capabilities?: readonly string[];
    /** Providers returned on provider.list */
    providers?: readonly { providerId: string; providerName: string; models: readonly string[] }[];
    /** Chat response for chat.completions — string or function returning string */
    chatResponse?: string | (() => string);
    /** Error to throw for a specific capability */
    failOn?: string;
    /** Error to throw specifically on chat.completions */
    chatError?: Error;
    /** Latency in ms to simulate before responding */
    latency?: number;
    /** Chunks for chat.stream (strings become chunk payloads) */
    streamChunks?: readonly string[];
    /** Full stream response — overrides streamChunks */
    streamResponse?: string;
};

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeEnvelope(capability: string, payload: unknown) {
    return {
        protocolVersion: "1.0.0",
        requestId: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
        origin: "mock",
        sessionId: "mock-session",
        capability,
        providerId: "",
        modelId: "",
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        nonce: "mock-nonce",
        payload,
    };
}

export function createMockTransport(options: MockTransportOptions = {}): BYOMTransport {
    const {
        capabilities = ["session.create", "provider.list", "chat.completions", "chat.stream"],
        providers = [{ providerId: "mock", providerName: "Mock Provider", models: ["mock-model"] }],
        chatResponse = "Hello from mock!",
        failOn,
        chatError,
        latency = 0,
        streamChunks,
        streamResponse,
    } = options;

    const transport: BYOMTransport = {
        async request(request) {
            if (latency > 0) await delay(latency);

            const envelope = request.envelope as { capability?: string };
            const capability = envelope.capability ?? "";

            if (failOn !== undefined && capability === failOn) {
                throw new Error(`Mock transport: failing on ${failOn}`);
            }

            if (capability === "session.create") {
                // Session established
                return {
                    envelope: makeEnvelope("session.create", { capabilities }),
                } as never;
            }

            if (capability === "provider.list") {
                return {
                    envelope: makeEnvelope("provider.list", { providers }),
                } as never;
            }

            if (capability === "chat.completions") {
                if (chatError !== undefined) throw chatError;
                const content = typeof chatResponse === "function" ? chatResponse() : chatResponse;
                return {
                    envelope: makeEnvelope("chat.completions", {
                        message: { role: "assistant", content },
                    }),
                } as never;
            }

            throw new Error(`Mock transport: unhandled capability "${capability}"`);
        },

        async stream(request) {
            if (latency > 0) await delay(latency);

            const envelope = request.envelope as { capability?: string };
            const capability = envelope.capability ?? "";

            if (failOn !== undefined && capability === failOn) {
                throw new Error(`Mock transport: failing on ${failOn}`);
            }

            const chunks = streamChunks ??
                (streamResponse !== undefined ? [streamResponse] : ["Hello", " from", " mock!"]);

            async function* generate() {
                let index = 0;
                for (const chunk of chunks) {
                    yield {
                        envelope: makeEnvelope("chat.stream", {
                            type: "chunk" as const,
                            delta: chunk,
                            index: index++,
                        }),
                    } as never;
                }
                yield {
                    envelope: makeEnvelope("chat.stream", { type: "done" as const }),
                } as never;
            }

            return generate();
        },

        async disconnect() {
            // No-op for mock
        },
    };

    return transport;
}
