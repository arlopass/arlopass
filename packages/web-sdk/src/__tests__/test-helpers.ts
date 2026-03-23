import { parseEnvelope, type ProtocolCapability } from "@byom-ai/protocol";

import { BYOMClient } from "../client.js";
import type {
  ChatSendPayload,
  ChatStreamPayload,
  ChatSendResponsePayload,
  ChatStreamResponsePayload,
  ConnectPayload,
  ConnectResponsePayload,
  ProviderListPayload,
  ProviderListResponsePayload,
  ProtocolEnvelopePayload,
  SelectProviderInput,
  SelectProviderResponsePayload,
  TransportRequest,
  TransportResponse,
  TransportStream,
} from "../types.js";
import type { BYOMTransport } from "../transport.js";

type RequestOrStream =
  | Readonly<{ kind: "request"; request: TransportRequest<unknown> }>
  | Readonly<{ kind: "stream"; request: TransportRequest<unknown> }>;

export class MockTransport implements BYOMTransport {
  readonly calls: RequestOrStream[] = [];
  readonly disconnectCalls: string[] = [];

  requestHandler:
    | ((
        request: TransportRequest<unknown>,
      ) => Promise<TransportResponse<unknown>>)
    | undefined;
  streamHandler:
    | ((
        request: TransportRequest<unknown>,
      ) => Promise<TransportStream<unknown>>)
    | undefined;

  async request<TReq, TRes>(
    request: TransportRequest<TReq>,
  ): Promise<TransportResponse<TRes>> {
    this.calls.push({
      kind: "request",
      request: request as TransportRequest<unknown>,
    });

    if (this.requestHandler === undefined) {
      throw new Error("Mock requestHandler was not configured.");
    }

    return this.requestHandler(
      request as TransportRequest<unknown>,
    ) as Promise<TransportResponse<TRes>>;
  }

  async stream<TReq, TRes>(
    request: TransportRequest<TReq>,
  ): Promise<TransportStream<TRes>> {
    this.calls.push({
      kind: "stream",
      request: request as TransportRequest<unknown>,
    });

    if (this.streamHandler === undefined) {
      throw new Error("Mock streamHandler was not configured.");
    }

    return this.streamHandler(
      request as TransportRequest<unknown>,
    ) as Promise<TransportStream<TRes>>;
  }

  async disconnect(sessionId: string): Promise<void> {
    this.disconnectCalls.push(sessionId);
  }
}

export function createDeterministicClock(
  start: string = "2026-03-23T12:00:00.000Z",
  stepMs: number = 1_000,
): () => Date {
  let cursor = new Date(start).getTime();

  return () => {
    const current = new Date(cursor);
    cursor += stepMs;
    return current;
  };
}

export function createDeterministicIdGenerator(prefix = "id"): () => string {
  let index = 0;
  return () => `${prefix}${String(index++).padStart(6, "0")}`;
}

export function createResponseEnvelope<TReqPayload, TRespPayload>(
  request: TransportRequest<TReqPayload>,
  payload: TRespPayload,
  overrides: Partial<ProtocolEnvelopePayload<TRespPayload>> = {},
): ProtocolEnvelopePayload<TRespPayload> {
  const issuedAt = new Date(request.envelope.issuedAt);
  const expiresAt = new Date(issuedAt.getTime() + 30_000).toISOString();

  return parseEnvelope<TRespPayload>(
    {
      ...request.envelope,
      payload,
      issuedAt: issuedAt.toISOString(),
      expiresAt,
      ...overrides,
    },
    {
      now: issuedAt,
      supportedProtocolVersion: request.envelope.protocolVersion,
    },
  );
}

export function setupConnectedClient(
  transport: MockTransport,
  capabilities: readonly ProtocolCapability[] = [
    "provider.list",
    "session.create",
    "chat.completions",
    "chat.stream",
  ],
): BYOMClient {
  return new BYOMClient({
    transport,
    now: createDeterministicClock(),
    randomId: createDeterministicIdGenerator(),
    defaultCapabilities: capabilities,
    origin: "https://example.app",
  });
}

export async function connectAndSelectProvider(
  client: BYOMClient,
  providerId = "provider.ollama",
  modelId = "model.llama3",
): Promise<void> {
  await client.connect({ appId: "app.test" });
  await client.selectProvider({ providerId, modelId });
}

export function createDefaultRequestHandler() {
  return async (
    request: TransportRequest<unknown>,
  ): Promise<TransportResponse<unknown>> => {
    if (request.envelope.capability === "session.create") {
      const payload = request.envelope.payload as Record<string, unknown>;
      if ("appId" in payload) {
        const envelope = createResponseEnvelope<ConnectPayload, ConnectResponsePayload>(
          request as TransportRequest<ConnectPayload>,
          {
            capabilities: [
              "provider.list",
              "session.create",
              "chat.completions",
              "chat.stream",
            ],
          },
        );
        return { envelope };
      }

      const envelope = createResponseEnvelope<SelectProviderInput, SelectProviderResponsePayload>(
        request as TransportRequest<SelectProviderInput>,
        {
          providerId: String(payload.providerId),
          modelId: String(payload.modelId),
        },
      );
      return { envelope };
    }

    if (request.envelope.capability === "provider.list") {
      const envelope = createResponseEnvelope<ProviderListPayload, ProviderListResponsePayload>(
        request as TransportRequest<ProviderListPayload>,
        {
          providers: [
            {
              providerId: "provider.ollama",
              providerName: "Ollama",
              models: ["model.llama3"],
            },
          ],
        },
      );
      return { envelope };
    }

    if (request.envelope.capability === "chat.completions") {
      const envelope = createResponseEnvelope<ChatSendPayload, ChatSendResponsePayload>(
        request as TransportRequest<ChatSendPayload>,
        {
          message: {
            role: "assistant",
            content: "Hello from BYOM.",
          },
        },
      );
      return { envelope };
    }

    throw new Error(`Unhandled mock request capability: ${request.envelope.capability}`);
  };
}

export function createDefaultStreamHandler() {
  return async (
    request: TransportRequest<unknown>,
  ): Promise<TransportStream<unknown>> => {
    if (request.envelope.capability !== "chat.stream") {
      throw new Error(`Unhandled mock stream capability: ${request.envelope.capability}`);
    }

    const first = createResponseEnvelope<ChatStreamPayload, ChatStreamResponsePayload>(
      request as TransportRequest<ChatStreamPayload>,
      {
        type: "chunk",
        delta: "Hello",
        index: 0,
      },
    );
    const second = createResponseEnvelope<ChatStreamPayload, ChatStreamResponsePayload>(
      request as TransportRequest<ChatStreamPayload>,
      {
        type: "done",
      },
    );

    async function* streamGenerator(): AsyncIterable<TransportResponse<unknown>> {
      yield { envelope: first };
      yield { envelope: second };
    }

    return streamGenerator();
  };
}

export async function consumeStream<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of stream) {
    items.push(item);
  }
  return items;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
