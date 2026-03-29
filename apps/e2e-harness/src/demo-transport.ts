import type {
  ArlopassTransport,
  ChatMessage,
  ChatSendPayload,
  ChatSendResponsePayload,
  ChatStreamPayload,
  ChatStreamResponsePayload,
  ConnectPayload,
  ConnectResponsePayload,
  ProtocolEnvelopePayload,
  ProviderDescriptor,
  ProviderListPayload,
  ProviderListResponsePayload,
  SelectProviderInput,
  SelectProviderResponsePayload,
  TransportRequest,
  TransportResponse,
  TransportStream,
} from "@arlopass/web-sdk";

export type DemoTransportMode = "mock" | "slow" | "failure";

const DEFAULT_CAPABILITIES = [
  "provider.list",
  "session.create",
  "chat.completions",
  "chat.stream",
] as const;

const DEMO_PROVIDERS: readonly ProviderDescriptor[] = [
  {
    providerId: "provider.ollama",
    providerName: "Ollama Local",
    models: ["model.llama3.2", "model.mistral", "model.qwen2.5"],
  },
  {
    providerId: "provider.claude",
    providerName: "Claude Subscription",
    models: ["model.claude-sonnet-4-5", "model.claude-haiku-4-5"],
  },
  {
    providerId: "provider.local-cli",
    providerName: "Local CLI Bridge",
    models: [
      "gpt-5.3-codex",
      "gpt-5.2",
      "claude-sonnet-4-5",
      "claude-opus-4-5",
    ],
  },
];

const STREAM_CHUNK_SIZE = 14;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasOwnKey<K extends string>(
  value: unknown,
  key: K,
): value is Record<K, unknown> {
  return typeof value === "object" && value !== null && key in value;
}

function extractLatestUserMessage(messages: readonly ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate !== undefined && candidate.role === "user") {
      return candidate.content;
    }
  }
  return "No user prompt provided.";
}

function createResponseEnvelope<TRequestPayload, TResponsePayload>(
  request: TransportRequest<TRequestPayload>,
  payload: TResponsePayload,
): ProtocolEnvelopePayload<TResponsePayload> {
  const issuedAtDate = new Date();
  const expiresAtDate = new Date(issuedAtDate.getTime() + 60_000);

  return {
    ...request.envelope,
    issuedAt: issuedAtDate.toISOString(),
    expiresAt: expiresAtDate.toISOString(),
    payload,
  } as ProtocolEnvelopePayload<TResponsePayload>;
}

function toChunks(value: string): readonly string[] {
  const normalized = value.trim();
  if (normalized.length <= STREAM_CHUNK_SIZE) {
    return [normalized];
  }

  const chunks: string[] = [];
  for (
    let cursor = 0;
    cursor < normalized.length;
    cursor += STREAM_CHUNK_SIZE
  ) {
    chunks.push(normalized.slice(cursor, cursor + STREAM_CHUNK_SIZE));
  }
  return chunks;
}

function buildCompletion(
  prompt: string,
  providerId: string,
  modelId: string,
): string {
  return `Arlopass demo response from ${providerId}/${modelId}: ${prompt}`;
}

export function createDemoTransport(
  mode: DemoTransportMode,
): ArlopassTransport {
  return {
    async request<TRequestPayload, TResponsePayload>(
      request: TransportRequest<TRequestPayload>,
    ): Promise<TransportResponse<TResponsePayload>> {
      const capability = request.envelope.capability;

      if (mode === "slow") {
        await sleep(2_200);
      } else {
        await sleep(140);
      }

      if (mode === "failure") {
        throw {
          message: "Demo policy denied this request.",
          machineCode: "ARLOPASS_POLICY_VIOLATION",
          reasonCode: "policy.denied",
          retryable: false,
          details: {
            capability,
          },
        };
      }

      if (capability === "session.create") {
        if (hasOwnKey(request.envelope.payload, "appId")) {
          const connectPayload: ConnectResponsePayload = {
            capabilities: [...DEFAULT_CAPABILITIES],
          };
          return {
            envelope: createResponseEnvelope<
              ConnectPayload,
              ConnectResponsePayload
            >(
              request as TransportRequest<ConnectPayload>,
              connectPayload,
            ) as ProtocolEnvelopePayload<TResponsePayload>,
          };
        }

        const payload = request.envelope.payload as SelectProviderInput;
        const selectedPayload: SelectProviderResponsePayload = {
          providerId: payload.providerId,
          modelId: payload.modelId,
        };
        return {
          envelope: createResponseEnvelope<
            SelectProviderInput,
            SelectProviderResponsePayload
          >(
            request as TransportRequest<SelectProviderInput>,
            selectedPayload,
          ) as ProtocolEnvelopePayload<TResponsePayload>,
        };
      }

      if (capability === "provider.list") {
        const listPayload: ProviderListResponsePayload = {
          providers: DEMO_PROVIDERS,
        };
        return {
          envelope: createResponseEnvelope<
            ProviderListPayload,
            ProviderListResponsePayload
          >(
            request as TransportRequest<ProviderListPayload>,
            listPayload,
          ) as ProtocolEnvelopePayload<TResponsePayload>,
        };
      }

      if (capability === "chat.completions") {
        const payload = request.envelope.payload as ChatSendPayload;
        const prompt = extractLatestUserMessage(payload.messages);
        const content = buildCompletion(
          prompt,
          request.envelope.providerId,
          request.envelope.modelId,
        );
        const chatPayload: ChatSendResponsePayload = {
          message: {
            role: "assistant",
            content,
          },
        };
        return {
          envelope: createResponseEnvelope<
            ChatSendPayload,
            ChatSendResponsePayload
          >(
            request as TransportRequest<ChatSendPayload>,
            chatPayload,
          ) as ProtocolEnvelopePayload<TResponsePayload>,
        };
      }

      throw new Error(`Unhandled demo request capability: ${capability}`);
    },

    async stream<TRequestPayload, TResponsePayload>(
      request: TransportRequest<TRequestPayload>,
    ): Promise<TransportStream<TResponsePayload>> {
      if (request.envelope.capability !== "chat.stream") {
        throw new Error(
          `Unhandled demo stream capability: ${request.envelope.capability}`,
        );
      }

      if (mode === "failure") {
        throw {
          message: "Demo stream failed due to transient bridge outage.",
          machineCode: "ARLOPASS_TRANSIENT_NETWORK",
          reasonCode: "transport.transient_failure",
          retryable: true,
        };
      }

      const payload = request.envelope.payload as ChatStreamPayload;
      const prompt = extractLatestUserMessage(payload.messages);
      const completion = buildCompletion(
        prompt,
        request.envelope.providerId,
        request.envelope.modelId,
      );
      const chunks = toChunks(completion);

      const streamDelayMs = mode === "slow" ? 600 : 90;

      async function* streamGenerator(): AsyncIterable<
        TransportResponse<TResponsePayload>
      > {
        for (let index = 0; index < chunks.length; index += 1) {
          await sleep(streamDelayMs);
          const chunkPayload: ChatStreamResponsePayload = {
            type: "chunk",
            delta: chunks[index] ?? "",
            index,
          };
          yield {
            envelope: createResponseEnvelope<
              ChatStreamPayload,
              ChatStreamResponsePayload
            >(
              request as TransportRequest<ChatStreamPayload>,
              chunkPayload,
            ) as ProtocolEnvelopePayload<TResponsePayload>,
          };
        }

        await sleep(streamDelayMs);
        const donePayload: ChatStreamResponsePayload = {
          type: "done",
        };
        yield {
          envelope: createResponseEnvelope<
            ChatStreamPayload,
            ChatStreamResponsePayload
          >(
            request as TransportRequest<ChatStreamPayload>,
            donePayload,
          ) as ProtocolEnvelopePayload<TResponsePayload>,
        };
      }

      return streamGenerator();
    },

    async disconnect(): Promise<void> {
      if (mode === "slow") {
        await sleep(200);
      }
    },
  };
}

type WindowWithArlopass = Window &
  Partial<{
    arlopass: ArlopassTransport;
  }>;

export function getInjectedTransport(): ArlopassTransport | null {
  const runtimeWindow = window as WindowWithArlopass;
  return runtimeWindow.arlopass ?? null;
}
