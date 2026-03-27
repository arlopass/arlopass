import { describe, expect, it } from "vitest";

import { ArlopassClient } from "../client.js";
import {
  ArlopassStateError,
  ArlopassTimeoutError,
  SDK_MACHINE_CODES,
} from "../errors.js";
import type {
  ChatSendPayload,
  ChatSendResponsePayload,
  ChatStreamPayload,
  ChatStreamResponsePayload,
  TransportRequest,
  TransportResponse,
} from "../types.js";
import {
  MockTransport,
  connectAndSelectProvider,
  consumeStream,
  createDefaultRequestHandler,
  createDefaultStreamHandler,
  createDeterministicClock,
  createDeterministicIdGenerator,
  createResponseEnvelope,
  delay,
  setupConnectedClient,
} from "./test-helpers.js";

describe("ArlopassClient", () => {
  it("supports connect -> listProviders -> selectProvider -> chat -> disconnect flow", async () => {
    const transport = new MockTransport();
    transport.requestHandler = createDefaultRequestHandler();
    transport.streamHandler = createDefaultStreamHandler();

    const client = setupConnectedClient(transport);

    const connectResult = await client.connect({ appId: "acme.app" });
    expect(client.state).toBe("connected");
    expect(connectResult.sessionId).toMatch(/^session\./);
    expect(connectResult.correlationId).toMatch(/^corr\./);

    const providersResult = await client.listProviders();
    expect(providersResult.providers).toHaveLength(1);
    expect(providersResult.correlationId).toMatch(/^corr\./);

    const selected = await client.selectProvider({
      providerId: "provider.ollama",
      modelId: "model.llama3",
    });
    expect(selected).toMatchObject({
      providerId: "provider.ollama",
      modelId: "model.llama3",
    });
    expect(selected.correlationId).toMatch(/^corr\./);

    const sendResult = await client.chat.send({
      messages: [{ role: "user", content: "hello" }],
    });
    expect(sendResult.message.content).toBe("Hello from Arlopass.");
    expect(sendResult.correlationId).toMatch(/^corr\./);

    const streamEvents = await consumeStream(
      client.chat.stream({
        messages: [{ role: "user", content: "stream hello" }],
      }),
    );
    expect(streamEvents).toEqual([
      {
        type: "chunk",
        delta: "Hello",
        index: 0,
        correlationId: streamEvents[0]?.correlationId,
      },
      {
        type: "done",
        correlationId: streamEvents[0]?.correlationId,
      },
    ]);

    await client.disconnect();
    expect(client.state).toBe("disconnected");
    expect(client.sessionId).toBeUndefined();
    expect(client.selectedProvider).toBeUndefined();
    expect(transport.disconnectCalls).toEqual([connectResult.sessionId]);

    const connectCall = transport.calls.find(
      (entry) =>
        entry.kind === "request" &&
        entry.request.envelope.capability === "session.create" &&
        "appId" in (entry.request.envelope.payload as Record<string, unknown>),
    );
    const sendCall = transport.calls.find(
      (entry) =>
        entry.kind === "request" &&
        entry.request.envelope.capability === "chat.completions",
    );
    const streamCall = transport.calls.find(
      (entry) =>
        entry.kind === "stream" &&
        entry.request.envelope.capability === "chat.stream",
    );

    expect(connectCall).toBeDefined();
    expect(sendCall).toBeDefined();
    expect(streamCall).toBeDefined();

    const sendRequestCorrelation = sendCall?.request.envelope.correlationId;
    const streamRequestCorrelation = streamCall?.request.envelope.correlationId;

    expect(sendResult.correlationId).toBe(sendRequestCorrelation);
    expect(streamEvents.every((event) => event.correlationId === streamRequestCorrelation)).toBe(
      true,
    );
  });

  it("rejects chat operations when provider is not selected", async () => {
    const transport = new MockTransport();
    transport.requestHandler = createDefaultRequestHandler();
    transport.streamHandler = createDefaultStreamHandler();
    const client = setupConnectedClient(transport);

    await client.connect({ appId: "acme.app" });

    await expect(
      client.chat.send({
        messages: [{ role: "user", content: "blocked" }],
      }),
    ).rejects.toMatchObject({
      machineCode: SDK_MACHINE_CODES.MISSING_PROVIDER_SELECTION,
      reasonCode: "request.invalid",
    });
  });

  it("rejects connect if state is not disconnected", async () => {
    const transport = new MockTransport();
    transport.requestHandler = createDefaultRequestHandler();
    transport.streamHandler = createDefaultStreamHandler();
    const client = setupConnectedClient(transport);

    await client.connect({ appId: "acme.app" });
    await expect(client.connect({ appId: "acme.again" })).rejects.toBeInstanceOf(
      ArlopassStateError,
    );
  });

  it("normalizes chat.send timeout failures into typed timeout errors", async () => {
    const transport = new MockTransport();
    transport.streamHandler = createDefaultStreamHandler();
    transport.requestHandler = async (request) => {
      if (request.envelope.capability === "chat.completions") {
        await delay(25);
        const envelope = createResponseEnvelope<
          ChatSendPayload,
          ChatSendResponsePayload
        >(
          request as TransportRequest<ChatSendPayload>,
          {
            message: {
              role: "assistant",
              content: "late response",
            },
          },
        );
        return { envelope } as TransportResponse<unknown>;
      }

      return createDefaultRequestHandler()(request);
    };

    const client = new ArlopassClient({
      transport,
      timeoutMs: 10,
      now: createDeterministicClock(),
      randomId: createDeterministicIdGenerator(),
      origin: "https://example.app",
    });

    await connectAndSelectProvider(client);

    await expect(
      client.chat.send({
        messages: [{ role: "user", content: "slow request" }],
      }),
    ).rejects.toBeInstanceOf(ArlopassTimeoutError);
  });

  it("normalizes chat.stream timeout failures into typed timeout errors", async () => {
    const transport = new MockTransport();
    transport.requestHandler = createDefaultRequestHandler();
    transport.streamHandler = async (request) => {
      async function* streamGenerator(): AsyncIterable<TransportResponse<unknown>> {
        await delay(25);
        const envelope = createResponseEnvelope<
          ChatStreamPayload,
          ChatStreamResponsePayload
        >(request as TransportRequest<ChatStreamPayload>, {
          type: "chunk",
          delta: "late",
          index: 0,
        });
        yield { envelope };
      }

      return streamGenerator();
    };

    const client = new ArlopassClient({
      transport,
      timeoutMs: 10,
      now: createDeterministicClock(),
      randomId: createDeterministicIdGenerator(),
      origin: "https://example.app",
    });

    await connectAndSelectProvider(client);

    await expect(
      consumeStream(
        client.chat.stream({
          messages: [{ role: "user", content: "slow stream" }],
        }),
      ),
    ).rejects.toBeInstanceOf(ArlopassTimeoutError);
  });

  it("propagates abort signal to chat.send and classifies cancellation", async () => {
    const transport = new MockTransport();
    transport.streamHandler = createDefaultStreamHandler();
    transport.requestHandler = async (request) => {
      if (request.envelope.capability !== "chat.completions") {
        return createDefaultRequestHandler()(request);
      }

      const signal = (request as TransportRequest<unknown> & {
        signal?: AbortSignal;
      }).signal;

      return await new Promise<TransportResponse<unknown>>((_resolve, reject) => {
        if (signal?.aborted === true) {
          reject({
            message: "chat request cancelled",
            reasonCode: "transport.cancelled",
            retryable: true,
          });
          return;
        }
        signal?.addEventListener(
          "abort",
          () => {
            reject({
              message: "chat request cancelled",
              reasonCode: "transport.cancelled",
              retryable: true,
            });
          },
          { once: true },
        );
      });
    };

    const client = new ArlopassClient({
      transport,
      timeoutMs: 5_000,
      now: createDeterministicClock(),
      randomId: createDeterministicIdGenerator(),
      origin: "https://example.app",
    });
    await connectAndSelectProvider(client);

    const abortController = new AbortController();
    const execution = client.chat.send(
      { messages: [{ role: "user", content: "cancel me" }] },
      { signal: abortController.signal },
    );
    abortController.abort();

    await expect(execution).rejects.toMatchObject({
      reasonCode: "transport.cancelled",
    });

    const sendCall = transport.calls.find(
      (entry) =>
        entry.kind === "request" &&
        entry.request.envelope.capability === "chat.completions",
    );
    expect((sendCall?.request as { signal?: AbortSignal }).signal).toBe(
      abortController.signal,
    );
  });
});

describe("ArlopassClient — context window", () => {
  it("returns default context window size before provider selection", () => {
    const transport = new MockTransport();
    transport.requestHandler = createDefaultRequestHandler();
    const client = setupConnectedClient(transport);
    // No provider selected yet — falls back to DEFAULT_CONTEXT_WINDOW (4096)
    expect(client.contextWindowSize).toBe(4_096);
  });

  it("returns model-specific context window size after selection", async () => {
    const transport = new MockTransport();
    transport.requestHandler = createDefaultRequestHandler();
    const client = setupConnectedClient(transport);
    await connectAndSelectProvider(client);
    // selectProvider uses "test-model" which is unknown, so default
    expect(client.contextWindowSize).toBe(4_096);
  });

  it("returns context info for a set of messages", async () => {
    const transport = new MockTransport();
    transport.requestHandler = createDefaultRequestHandler();
    const client = setupConnectedClient(transport);
    await connectAndSelectProvider(client);

    const messages = [
      { role: "user" as const, content: "a".repeat(400) },  // ~100 tokens
      { role: "assistant" as const, content: "b".repeat(800) }, // ~200 tokens
    ];
    const info = client.getContextInfo(messages, 500);
    expect(info.maxTokens).toBe(4_096);
    expect(info.usedTokens).toBe(300);
    expect(info.reservedOutputTokens).toBe(500);
    expect(info.remainingTokens).toBe(4_096 - 500 - 300);
    expect(info.usageRatio).toBeCloseTo(300 / (4_096 - 500), 5);
  });

  it("returns zero remaining when messages exceed budget", async () => {
    const transport = new MockTransport();
    transport.requestHandler = createDefaultRequestHandler();
    const client = setupConnectedClient(transport);
    await connectAndSelectProvider(client);

    const messages = [
      { role: "user" as const, content: "x".repeat(100_000) }, // ~25000 tokens
    ];
    const info = client.getContextInfo(messages);
    expect(info.remainingTokens).toBe(0);
    expect(info.usageRatio).toBe(1);
  });
});
