import type {
  ChatStreamResponsePayload,
  ProtocolEnvelopePayload,
  TransportRequest,
  TransportResponse,
  TransportStream,
} from "@arlopass/web-sdk";
import type { ArlopassTransport } from "@arlopass/web-sdk";

const PAGE_TO_CONTENT_CHANNEL = "arlopass.transport.page-to-content.v1";
const CONTENT_TO_PAGE_CHANNEL = "arlopass.transport.content-to-page.v1";
const REQUEST_TIMEOUT_MS = 15_000;
const CHAT_REQUEST_TIMEOUT_MS = 90_000;
const REQUEST_TIMEOUT_GRACE_MS = 5_000;
const MAX_REQUEST_TIMEOUT_MS = 10 * 60_000;
const MAX_BUFFERED_STREAM_ENTRIES = 512;
const INJECTED_PROVIDER_TAG = Symbol.for("arlopass.extension.injected-provider");

type RuntimeWindow = Window &
  Readonly<{
    arlopass?: unknown;
  }>;

type PageToContentMessage = Readonly<{
  channel: typeof PAGE_TO_CONTENT_CHANNEL;
  source: "arlopass-inpage-provider";
  requestId: string;
  action: "request" | "request-stream" | "cancel-stream" | "disconnect";
  payload: unknown;
}>;

type BridgeErrorPayload = Readonly<{
  message: string;
  machineCode?: string;
  reasonCode?: string;
  retryable?: boolean;
  correlationId?: string;
  details?: Readonly<Record<string, unknown>>;
}>;

type ContentToPageResponseMessage = Readonly<{
  channel: typeof CONTENT_TO_PAGE_CHANNEL;
  source: "arlopass-content-script";
  requestId: string;
  ok: boolean;
  envelope?: ProtocolEnvelopePayload<unknown>;
  envelopes?: readonly ProtocolEnvelopePayload<unknown>[];
  error?: BridgeErrorPayload;
}>;

type ContentToPageStreamMessage = Readonly<{
  channel: typeof CONTENT_TO_PAGE_CHANNEL;
  source: "arlopass-content-script";
  requestId: string;
  stream: true;
  event: "start" | "chunk" | "done" | "error" | "cancelled";
  envelope?: ProtocolEnvelopePayload<unknown>;
  error?: BridgeErrorPayload;
}>;

type PendingRequest = Readonly<{
  resolve: (response: ContentToPageResponseMessage) => void;
  reject: (error: Error) => void;
  timeoutHandle: number;
  abortSignal?: AbortSignal;
  abortHandler?: () => void;
}>;

type StreamEntry =
  | Readonly<{
    type: "value";
    value: TransportResponse<ChatStreamResponsePayload>;
  }>
  | Readonly<{
    type: "done";
  }>
  | Readonly<{
    type: "error";
    error: Error;
  }>;

type PendingStreamRequest = Readonly<{
  requestId: string;
  queue: StreamEntry[];
  waiters: Array<(entry: StreamEntry) => void>;
  timeoutHandle: number;
  abortSignal?: AbortSignal;
  abortHandler?: () => void;
  sendCancel: () => void;
  isComplete: { value: boolean };
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
  error: BridgeErrorPayload | undefined,
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

function createCancelledError(): Error & {
  reasonCode: "transport.cancelled";
  retryable: true;
} {
  return Object.assign(new Error("Transport request cancelled."), {
    reasonCode: "transport.cancelled" as const,
    retryable: true as const,
  });
}

function normalizeTransportResponse(
  response: ContentToPageResponseMessage,
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

function normalizeTransportStreamResponses(
  response: ContentToPageResponseMessage,
): readonly TransportResponse<ChatStreamResponsePayload>[] {
  if (!response.ok) {
    throw asErrorPayload(response.error, "Transport stream request failed.");
  }

  if (!Array.isArray(response.envelopes)) {
    throw new Error("Transport stream response is missing envelopes.");
  }

  return response.envelopes.map((envelope) => ({
    envelope,
  })) as readonly TransportResponse<ChatStreamResponsePayload>[];
}

function parseRequestedTimeoutMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.floor(value);
  if (normalized <= 0) {
    return undefined;
  }

  return normalized;
}

function resolveTimeoutFromPayload(payload: unknown): number | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const directTimeout = parseRequestedTimeoutMs(payload["timeoutMs"]);
  if (directTimeout !== undefined) {
    return directTimeout;
  }

  const nestedRequest = payload["request"];
  if (!isRecord(nestedRequest)) {
    return undefined;
  }
  return parseRequestedTimeoutMs(nestedRequest["timeoutMs"]);
}

function resolveCapabilityFromPayload(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const directEnvelope = payload["envelope"];
  if (isRecord(directEnvelope) && typeof directEnvelope["capability"] === "string") {
    return directEnvelope["capability"];
  }

  const nestedRequest = payload["request"];
  if (!isRecord(nestedRequest)) {
    return undefined;
  }

  const nestedEnvelope = nestedRequest["envelope"];
  if (isRecord(nestedEnvelope) && typeof nestedEnvelope["capability"] === "string") {
    return nestedEnvelope["capability"];
  }

  return undefined;
}

function resolveBridgeRequestTimeoutMs(
  action: PageToContentMessage["action"],
  payload: unknown,
): number {
  if (action === "disconnect") {
    return REQUEST_TIMEOUT_MS;
  }

  const requestedTimeoutMs = resolveTimeoutFromPayload(payload);
  if (requestedTimeoutMs !== undefined) {
    return Math.max(
      REQUEST_TIMEOUT_MS,
      Math.min(MAX_REQUEST_TIMEOUT_MS, requestedTimeoutMs + REQUEST_TIMEOUT_GRACE_MS),
    );
  }

  const capability = resolveCapabilityFromPayload(payload);
  if (capability === "chat.completions" || capability === "chat.stream") {
    return Math.min(MAX_REQUEST_TIMEOUT_MS, CHAT_REQUEST_TIMEOUT_MS);
  }

  return REQUEST_TIMEOUT_MS;
}

function stripTransportSignal(payload: unknown): unknown {
  if (!isRecord(payload) || !("signal" in payload)) {
    return payload;
  }

  const sanitized: Record<string, unknown> = { ...payload };
  delete sanitized["signal"];
  return sanitized;
}

function normalizeStreamEnvelope(
  envelope: unknown,
): TransportResponse<ChatStreamResponsePayload> {
  if (!isRecord(envelope) || !isRecord(envelope["payload"])) {
    throw new Error("Stream event is missing a valid envelope payload.");
  }

  const payload = envelope["payload"];
  if (payload["type"] === "chunk") {
    if (typeof payload["delta"] !== "string" || typeof payload["index"] !== "number") {
      throw new Error("Stream chunk event is malformed.");
    }
  } else if (payload["type"] !== "done") {
    throw new Error("Stream event payload.type must be chunk or done.");
  }

  return {
    envelope: envelope as ProtocolEnvelopePayload<ChatStreamResponsePayload>,
  };
}

function createStreamOverflowError(): Error & {
  reasonCode: "transport.transient_failure";
  retryable: true;
} {
  return Object.assign(new Error("Transport stream buffer exceeded safety limit."), {
    reasonCode: "transport.transient_failure" as const,
    retryable: true as const,
  });
}

function createBridgeDispatcher() {
  const pendingRequests = new Map<string, PendingRequest>();
  const pendingStreams = new Map<string, PendingStreamRequest>();

  const removePendingRequest = (requestId: string): PendingRequest | undefined => {
    const request = pendingRequests.get(requestId);
    if (request === undefined) {
      return undefined;
    }
    pendingRequests.delete(requestId);
    clearTimeout(request.timeoutHandle);
    if (request.abortSignal !== undefined && request.abortHandler !== undefined) {
      request.abortSignal.removeEventListener("abort", request.abortHandler);
    }
    return request;
  };

  const detachPendingStream = (requestId: string): PendingStreamRequest | undefined => {
    const stream = pendingStreams.get(requestId);
    if (stream === undefined) {
      return undefined;
    }
    pendingStreams.delete(requestId);
    clearTimeout(stream.timeoutHandle);
    if (stream.abortSignal !== undefined && stream.abortHandler !== undefined) {
      stream.abortSignal.removeEventListener("abort", stream.abortHandler);
    }
    return stream;
  };

  const enqueueStreamEntry = (stream: PendingStreamRequest, entry: StreamEntry): void => {
    if (stream.isComplete.value && entry.type === "value") {
      return;
    }

    if (entry.type === "value" && stream.queue.length >= MAX_BUFFERED_STREAM_ENTRIES) {
      stream.isComplete.value = true;
      try {
        stream.sendCancel();
      } catch {
        // Best effort cancellation only.
      }
      const overflowEntry: StreamEntry = {
        type: "error",
        error: createStreamOverflowError(),
      };
      const waiter = stream.waiters.shift();
      if (waiter !== undefined) {
        waiter(overflowEntry);
      } else {
        stream.queue.push(overflowEntry);
      }
      return;
    }

    if (entry.type !== "value") {
      stream.isComplete.value = true;
    }

    const waiter = stream.waiters.shift();
    if (waiter !== undefined) {
      waiter(entry);
      return;
    }
    stream.queue.push(entry);
  };

  const consumeBufferedStreamResponse = (
    requestId: string,
    response: ContentToPageResponseMessage,
  ): void => {
    const stream = detachPendingStream(requestId);
    if (stream === undefined) {
      return;
    }

    if (!response.ok) {
      enqueueStreamEntry(stream, {
        type: "error",
        error: asErrorPayload(response.error, "Transport stream request failed."),
      });
      return;
    }

    try {
      const normalized = normalizeTransportStreamResponses(response);
      for (const entry of normalized) {
        enqueueStreamEntry(stream, { type: "value", value: entry });
      }
      enqueueStreamEntry(stream, { type: "done" });
    } catch (error) {
      enqueueStreamEntry(stream, {
        type: "error",
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  };

  const consumeLiveStreamEvent = (
    requestId: string,
    eventMessage: ContentToPageStreamMessage,
  ): void => {
    const stream = pendingStreams.get(requestId);
    if (stream === undefined || stream.isComplete.value) {
      return;
    }

    if (eventMessage.event === "start") {
      return;
    }

    if (eventMessage.event === "chunk") {
      try {
        enqueueStreamEntry(stream, {
          type: "value",
          value: normalizeStreamEnvelope(eventMessage.envelope),
        });
      } catch (error) {
        const terminal = detachPendingStream(requestId);
        if (terminal === undefined) {
          return;
        }
        enqueueStreamEntry(terminal, {
          type: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
      return;
    }

    if (eventMessage.event === "done") {
      const terminal = detachPendingStream(requestId);
      if (terminal === undefined) {
        return;
      }
      try {
        enqueueStreamEntry(terminal, {
          type: "value",
          value: normalizeStreamEnvelope(eventMessage.envelope),
        });
        enqueueStreamEntry(terminal, { type: "done" });
      } catch (error) {
        enqueueStreamEntry(terminal, {
          type: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
      return;
    }

    if (eventMessage.event === "cancelled") {
      const terminal = detachPendingStream(requestId);
      if (terminal === undefined) {
        return;
      }
      enqueueStreamEntry(terminal, {
        type: "error",
        error: createCancelledError(),
      });
      return;
    }

    const terminal = detachPendingStream(requestId);
    if (terminal === undefined) {
      return;
    }
    enqueueStreamEntry(terminal, {
      type: "error",
      error: asErrorPayload(eventMessage.error, "Transport stream request failed."),
    });
  };

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

    if (data["stream"] === true) {
      consumeLiveStreamEvent(requestId, data as ContentToPageStreamMessage);
      return;
    }

    const response = data as ContentToPageResponseMessage;
    const pendingRequest = removePendingRequest(requestId);
    if (pendingRequest !== undefined) {
      pendingRequest.resolve(response);
      return;
    }

    consumeBufferedStreamResponse(requestId, response);
  });

  const send = async (
    action: "request" | "disconnect",
    payload: unknown,
    options: Readonly<{ signal?: AbortSignal }> = {},
  ): Promise<ContentToPageResponseMessage> => {
    if (options.signal?.aborted === true) {
      throw createCancelledError();
    }

    const payloadForBridge = action === "request" ? stripTransportSignal(payload) : payload;
    const requestId = createRequestId();
    const timeoutMs = resolveBridgeRequestTimeoutMs(action, payloadForBridge);

    const message: PageToContentMessage = {
      channel: PAGE_TO_CONTENT_CHANNEL,
      source: "arlopass-inpage-provider",
      requestId,
      action,
      payload: payloadForBridge,
    };

    const response = await new Promise<ContentToPageResponseMessage>((resolve, reject) => {
      const signal = options.signal;
      let abortHandler: (() => void) | undefined;

      const cleanupAbort = () => {
        if (abortHandler !== undefined && signal !== undefined) {
          signal.removeEventListener("abort", abortHandler);
        }
      };

      const timeoutHandle = window.setTimeout(() => {
        pendingRequests.delete(requestId);
        cleanupAbort();
        reject(
          new Error(
            `Timed out waiting for extension bridge response (${String(
              timeoutMs,
            )}ms).`,
          ),
        );
      }, timeoutMs);

      if (signal !== undefined) {
        abortHandler = () => {
          pendingRequests.delete(requestId);
          clearTimeout(timeoutHandle);
          cleanupAbort();
          reject(createCancelledError());
        };
        signal.addEventListener("abort", abortHandler, { once: true });
      }

      pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutHandle,
        ...(signal !== undefined ? { abortSignal: signal } : {}),
        ...(abortHandler !== undefined ? { abortHandler } : {}),
      });

      try {
        window.postMessage(message, "*");
      } catch (error) {
        pendingRequests.delete(requestId);
        clearTimeout(timeoutHandle);
        cleanupAbort();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });

    return response;
  };

  const stream = async (
    payload: unknown,
    options: Readonly<{ signal?: AbortSignal }> = {},
  ): Promise<TransportStream<ChatStreamResponsePayload>> => {
    if (options.signal?.aborted === true) {
      throw createCancelledError();
    }

    const payloadForBridge = stripTransportSignal(payload);
    const requestId = createRequestId();
    const timeoutMs = resolveBridgeRequestTimeoutMs("request-stream", payloadForBridge);
    const sendCancel = (): void => {
      const cancelMessage: PageToContentMessage = {
        channel: PAGE_TO_CONTENT_CHANNEL,
        source: "arlopass-inpage-provider",
        requestId,
        action: "cancel-stream",
        payload: {},
      };
      window.postMessage(cancelMessage, "*");
    };

    const queue: StreamEntry[] = [];
    const waiters: Array<(entry: StreamEntry) => void> = [];
    const isComplete = { value: false };

    const signal = options.signal;
    let abortHandler: (() => void) | undefined;
    const timeoutHandle = window.setTimeout(() => {
      const terminal = detachPendingStream(requestId);
      if (terminal === undefined) {
        return;
      }
      terminal.isComplete.value = true;
      enqueueStreamEntry(terminal, {
        type: "error",
        error: new Error(
          `Timed out waiting for extension stream bridge (${String(timeoutMs)}ms).`,
        ),
      });
      try {
        terminal.sendCancel();
      } catch {
        // Best effort only.
      }
    }, timeoutMs);

    if (signal !== undefined) {
      abortHandler = () => {
        const terminal = detachPendingStream(requestId);
        if (terminal === undefined) {
          return;
        }
        terminal.isComplete.value = true;
        enqueueStreamEntry(terminal, {
          type: "error",
          error: createCancelledError(),
        });
        try {
          terminal.sendCancel();
        } catch {
          // Best effort only.
        }
      };
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    const pendingStream: PendingStreamRequest = {
      requestId,
      queue,
      waiters,
      timeoutHandle,
      sendCancel,
      isComplete,
      ...(signal !== undefined ? { abortSignal: signal } : {}),
      ...(abortHandler !== undefined ? { abortHandler } : {}),
    };

    pendingStreams.set(requestId, pendingStream);

    const startMessage: PageToContentMessage = {
      channel: PAGE_TO_CONTENT_CHANNEL,
      source: "arlopass-inpage-provider",
      requestId,
      action: "request-stream",
      payload: payloadForBridge,
    };

    try {
      window.postMessage(startMessage, "*");
    } catch (error) {
      const terminal = detachPendingStream(requestId);
      if (terminal !== undefined) {
        terminal.isComplete.value = true;
        enqueueStreamEntry(terminal, {
          type: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    const nextEntry = async (): Promise<StreamEntry> => {
      const active = pendingStreams.get(requestId) ?? pendingStream;
      if (active.queue.length > 0) {
        return active.queue.shift() as StreamEntry;
      }
      return new Promise<StreamEntry>((resolve) => {
        active.waiters.push(resolve);
      });
    };

    const streamIterable = (async function* (): AsyncIterable<
      TransportResponse<ChatStreamResponsePayload>
    > {
      try {
        while (true) {
          const entry = await nextEntry();
          if (entry.type === "value") {
            yield entry.value;
            continue;
          }

          if (entry.type === "done") {
            return;
          }

          throw entry.error;
        }
      } finally {
        const active = detachPendingStream(requestId);
        if (active !== undefined && !active.isComplete.value) {
          active.isComplete.value = true;
          try {
            active.sendCancel();
          } catch {
            // Best effort only.
          }
        }
      }
    })();

    return streamIterable;
  };

  return {
    send,
    stream,
  };
}

function createInjectedTransport(): ArlopassTransport {
  const bridge = createBridgeDispatcher();

  const VAULT_LOCKED_RETRY_DELAY_MS = 2000;
  const VAULT_LOCKED_MAX_RETRIES = 30; // 30 * 2s = 60s max wait

  async function requestWithVaultRetry<TRequestPayload, TResponsePayload>(
    request: TransportRequest<TRequestPayload>,
  ): Promise<TransportResponse<TResponsePayload>> {
    for (let attempt = 0; attempt <= VAULT_LOCKED_MAX_RETRIES; attempt++) {
      const response = await bridge.send("request", request, {
        ...(request.signal !== undefined ? { signal: request.signal } : {}),
      });
      // If vault is locked and retryable, wait for user to unlock then retry
      if (
        !response.ok &&
        response.error?.reasonCode === "vault.locked" &&
        response.error?.retryable === true &&
        attempt < VAULT_LOCKED_MAX_RETRIES
      ) {
        await new Promise((resolve) => setTimeout(resolve, VAULT_LOCKED_RETRY_DELAY_MS));
        if (request.signal?.aborted === true) break;
        continue;
      }
      return normalizeTransportResponse(response) as TransportResponse<TResponsePayload>;
    }
    // Exhausted retries
    const finalResponse = await bridge.send("request", request, {
      ...(request.signal !== undefined ? { signal: request.signal } : {}),
    });
    return normalizeTransportResponse(finalResponse) as TransportResponse<TResponsePayload>;
  }

  return {
    async request<TRequestPayload, TResponsePayload>(
      request: TransportRequest<TRequestPayload>,
    ): Promise<TransportResponse<TResponsePayload>> {
      return requestWithVaultRetry<TRequestPayload, TResponsePayload>(request);
    },

    async stream<TRequestPayload, TResponsePayload>(
      request: TransportRequest<TRequestPayload>,
    ): Promise<TransportStream<TResponsePayload>> {
      if (request.envelope.capability !== "chat.stream") {
        throw new Error(
          `Injected provider stream only supports chat.stream. Received: ${request.envelope.capability}`,
        );
      }

      const streamResponse = await bridge.stream(request, {
        ...(request.signal !== undefined ? { signal: request.signal } : {}),
      });
      return (async function* (): AsyncIterable<
        TransportResponse<TResponsePayload>
      > {
        for await (const entry of streamResponse) {
          yield entry as TransportResponse<TResponsePayload>;
        }
      })();
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
  const existing = runtimeWindow.arlopass;
  if (existing !== undefined) {
    return;
  }

  const transport = createInjectedTransport() as ArlopassTransport &
    Record<string | symbol, unknown>;
  Object.defineProperty(transport, INJECTED_PROVIDER_TAG, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  });

  Object.defineProperty(runtimeWindow, "arlopass", {
    configurable: true,
    enumerable: false,
    writable: false,
    value: transport,
  });

  window.dispatchEvent(
    new CustomEvent("arlopass:injected", {
      detail: {
        source: "arlopass-extension",
      },
    }),
  );
}

injectProvider();
