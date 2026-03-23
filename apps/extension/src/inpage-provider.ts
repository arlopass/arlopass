import type {
  ChatSendPayload,
  ChatSendResponsePayload,
  ChatStreamResponsePayload,
  ProtocolEnvelopePayload,
  TransportRequest,
  TransportResponse,
  TransportStream,
} from "@byom-ai/web-sdk";
import type { BYOMTransport } from "@byom-ai/web-sdk";

const PAGE_TO_CONTENT_CHANNEL = "byom.transport.page-to-content.v1";
const CONTENT_TO_PAGE_CHANNEL = "byom.transport.content-to-page.v1";
const REQUEST_TIMEOUT_MS = 15_000;
const STREAM_CHUNK_SIZE = 96;
const INJECTED_PROVIDER_TAG = Symbol.for("byom.extension.injected-provider");

type RuntimeWindow = Window &
  Readonly<{
    byom?: unknown;
  }>;

type PageToContentMessage = Readonly<{
  channel: typeof PAGE_TO_CONTENT_CHANNEL;
  source: "byom-inpage-provider";
  requestId: string;
  action: "request" | "disconnect";
  payload: unknown;
}>;

type ContentToPageMessage = Readonly<{
  channel: typeof CONTENT_TO_PAGE_CHANNEL;
  source: "byom-content-script";
  requestId: string;
  ok: boolean;
  envelope?: ProtocolEnvelopePayload<unknown>;
  error?: Readonly<{
    message: string;
    machineCode?: string;
    reasonCode?: string;
    retryable?: boolean;
    correlationId?: string;
    details?: Readonly<Record<string, unknown>>;
  }>;
}>;

type PendingRequest = Readonly<{
  resolve: (response: ContentToPageMessage) => void;
  reject: (error: Error) => void;
  timeoutHandle: number;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `req.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;
}

function asErrorPayload(
  error: ContentToPageMessage["error"],
  fallbackMessage: string,
): Error & {
  machineCode?: string;
  reasonCode?: string;
  retryable?: boolean;
  correlationId?: string;
  details?: Readonly<Record<string, unknown>>;
} {
  const message = error?.message ?? fallbackMessage;
  const typedError = new Error(message) as Error & {
    machineCode?: string;
    reasonCode?: string;
    retryable?: boolean;
    correlationId?: string;
    details?: Readonly<Record<string, unknown>>;
  };

  if (error?.machineCode !== undefined) {
    typedError.machineCode = error.machineCode;
  }
  if (error?.reasonCode !== undefined) {
    typedError.reasonCode = error.reasonCode;
  }
  if (error?.retryable !== undefined) {
    typedError.retryable = error.retryable;
  }
  if (error?.correlationId !== undefined) {
    typedError.correlationId = error.correlationId;
  }
  if (error?.details !== undefined) {
    typedError.details = error.details;
  }

  return typedError;
}

function normalizeTransportResponse(
  response: ContentToPageMessage,
): TransportResponse<unknown> {
  if (!response.ok) {
    throw asErrorPayload(response.error, "Transport request failed.");
  }

  if (response.envelope === undefined) {
    throw new Error("Transport response is missing an envelope.");
  }

  return {
    envelope: response.envelope,
  };
}

function chunkText(value: string, chunkSize: number): readonly string[] {
  const normalized = value.trim();
  if (normalized.length <= chunkSize) {
    return [normalized];
  }

  const chunks: string[] = [];
  for (let cursor = 0; cursor < normalized.length; cursor += chunkSize) {
    chunks.push(normalized.slice(cursor, cursor + chunkSize));
  }
  return chunks;
}

function createBridgeDispatcher() {
  const pending = new Map<string, PendingRequest>();

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    const data = event.data;
    if (!isRecord(data) || data["channel"] !== CONTENT_TO_PAGE_CHANNEL) {
      return;
    }

    const requestId = data["requestId"];
    if (typeof requestId !== "string") {
      return;
    }

    const request = pending.get(requestId);
    if (request === undefined) {
      return;
    }

    pending.delete(requestId);
    clearTimeout(request.timeoutHandle);

    request.resolve(data as ContentToPageMessage);
  });

  const send = async (
    action: "request" | "disconnect",
    payload: unknown,
  ): Promise<ContentToPageMessage> => {
    const requestId = createRequestId();

    const message: PageToContentMessage = {
      channel: PAGE_TO_CONTENT_CHANNEL,
      source: "byom-inpage-provider",
      requestId,
      action,
      payload,
    };

    const response = await new Promise<ContentToPageMessage>((resolve, reject) => {
      const timeoutHandle = window.setTimeout(() => {
        pending.delete(requestId);
        reject(
          new Error(
            `Timed out waiting for extension bridge response (${String(
              REQUEST_TIMEOUT_MS,
            )}ms).`,
          ),
        );
      }, REQUEST_TIMEOUT_MS);

      pending.set(requestId, {
        resolve,
        reject,
        timeoutHandle,
      });

      window.postMessage(message, "*");
    });

    return response;
  };

  return {
    send,
  };
}

function createInjectedTransport(): BYOMTransport {
  const bridge = createBridgeDispatcher();

  return {
    async request<TRequestPayload, TResponsePayload>(
      request: TransportRequest<TRequestPayload>,
    ): Promise<TransportResponse<TResponsePayload>> {
      const response = await bridge.send("request", request);
      return normalizeTransportResponse(response) as TransportResponse<TResponsePayload>;
    },

    async stream<TRequestPayload, TResponsePayload>(
      request: TransportRequest<TRequestPayload>,
    ): Promise<TransportStream<TResponsePayload>> {
      if (request.envelope.capability !== "chat.stream") {
        throw new Error(
          `Injected provider stream only supports chat.stream. Received: ${request.envelope.capability}`,
        );
      }

      const completionRequest: TransportRequest<ChatSendPayload> = {
        envelope: {
          ...request.envelope,
          capability: "chat.completions",
          payload: request.envelope.payload as ChatSendPayload,
        },
        ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
      };
      const completionResponse = await bridge.send("request", completionRequest);
      const normalized = normalizeTransportResponse(
        completionResponse,
      ) as TransportResponse<ChatSendResponsePayload>;

      const message = normalized.envelope.payload.message;
      const content = typeof message?.content === "string" ? message.content : "";
      const chunks = chunkText(content, STREAM_CHUNK_SIZE);

      const correlationId = request.envelope.correlationId;
      const nowIso = new Date().toISOString();
      const expiresIso = new Date(Date.now() + 60_000).toISOString();

      const streamIterable = async function* (): AsyncIterable<
        TransportResponse<TResponsePayload>
      > {
        for (let index = 0; index < chunks.length; index += 1) {
          const payload: ChatStreamResponsePayload = {
            type: "chunk",
            delta: chunks[index] ?? "",
            index,
          };

          yield {
            envelope: {
              ...request.envelope,
              capability: "chat.stream",
              correlationId,
              issuedAt: nowIso,
              expiresAt: expiresIso,
              payload,
            } as ProtocolEnvelopePayload<TResponsePayload>,
          };
        }

        const donePayload: ChatStreamResponsePayload = {
          type: "done",
        };
        yield {
          envelope: {
            ...request.envelope,
            capability: "chat.stream",
            correlationId,
            issuedAt: nowIso,
            expiresAt: expiresIso,
            payload: donePayload,
          } as ProtocolEnvelopePayload<TResponsePayload>,
        };
      };

      return streamIterable();
    },

    async disconnect(sessionId: string): Promise<void> {
      const response = await bridge.send("disconnect", { sessionId });
      if (!response.ok) {
        throw asErrorPayload(response.error, "Failed to disconnect.");
      }
    },
  };
}

function injectProvider(): void {
  const runtimeWindow = window as unknown as RuntimeWindow;
  const existing = runtimeWindow.byom;
  if (existing !== undefined) {
    return;
  }

  const transport = createInjectedTransport() as BYOMTransport &
    Record<string | symbol, unknown>;
  Object.defineProperty(transport, INJECTED_PROVIDER_TAG, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  });

  Object.defineProperty(runtimeWindow, "byom", {
    configurable: true,
    enumerable: false,
    writable: false,
    value: transport,
  });

  window.dispatchEvent(
    new CustomEvent("byom:injected", {
      detail: {
        source: "byom-extension",
      },
    }),
  );
}

injectProvider();
