import {
  CAPABILITY_CATALOG,
  DEFAULT_PROTOCOL_VERSION,
  normalizeReasonCode,
  parseEnvelope,
  type ProtocolCapability,
} from "@byom-ai/protocol";

import {
  TELEMETRY_SPAN_NAMES,
  type TelemetryTracing,
} from "@byom-ai/telemetry";

import { resolveAppId, validateAppIconUrl } from "./app-id.js";
import {
  BYOMProtocolBoundaryError,
  BYOMSDKError,
  BYOMStateError,
  SDK_MACHINE_CODES,
  normalizeSDKError,
} from "./errors.js";
import { BYOMStateMachine } from "./state-machine.js";
import { withStreamTimeout, withTimeout, type BYOMTransport } from "./transport.js";
import {
  DEFAULT_ENVELOPE_TTL_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  SDK_ENVELOPE_NONCE,
  SDK_PROTOCOL_VERSION,
  type ChatInput,
  type ChatMessage,
  type ChatOperationOptions,
  type ChatSendPayload,
  type ChatSendResponsePayload,
  type ChatSendResult,
  type ChatStreamEvent,
  type ChatStreamPayload,
  type ChatStreamResponsePayload,
  type ClientState,
  type ConnectOptions,
  type ConnectPayload,
  type ConnectResponsePayload,
  type ConnectResult,
  type CorrelationId,
  type InternalClientConfig,
  type ListProvidersResult,
  type ProtocolEnvelopePayload,
  type ProviderDescriptor,
  type ProviderListPayload,
  type ProviderListResponsePayload,
  type RequestId,
  type SelectProviderInput,
  type SelectProviderResponsePayload,
  type SelectProviderResult,
  type SessionId,
  type TransportRequest,
  type TransportResponse,
} from "./types.js";

type SelectedProvider = Readonly<{
  providerId: string;
  modelId: string;
}>;

type BYOMClientOptions = Readonly<{
  transport: BYOMTransport;
  protocolVersion?: string;
  origin?: string;
  timeoutMs?: number;
  envelopeTtlMs?: number;
  nonce?: string;
  now?: () => Date;
  randomId?: () => string;
  defaultCapabilities?: readonly ProtocolCapability[];
  defaultProviderId?: string;
  defaultModelId?: string;
  tracing?: TelemetryTracing;
}>;

const DEFAULT_ORIGIN = "https://app.byom.local";
const DEFAULT_PROVIDER_ID = "provider.system";
const DEFAULT_MODEL_ID = "model.default";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new BYOMProtocolBoundaryError(`Field "${fieldName}" must be a string.`, {
      reasonCode: "request.invalid",
      details: { field: fieldName },
    });
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BYOMProtocolBoundaryError(
      `Field "${fieldName}" must not be empty.`,
      {
        reasonCode: "request.invalid",
        details: { field: fieldName },
      },
    );
  }

  return trimmed;
}

function parseCapabilities(value: unknown): readonly ProtocolCapability[] {
  if (!Array.isArray(value)) {
    throw new BYOMProtocolBoundaryError("Field \"capabilities\" must be an array.", {
      reasonCode: "request.invalid",
      details: { field: "capabilities" },
    });
  }

  const capabilities = value.map((entry) => {
    if (typeof entry !== "string" || !CAPABILITY_CATALOG.includes(entry as ProtocolCapability)) {
      throw new BYOMProtocolBoundaryError(
        "Field \"capabilities\" includes unsupported entries.",
        {
          reasonCode: "protocol.unsupported_capability",
          details: { field: "capabilities" },
        },
      );
    }

    return entry as ProtocolCapability;
  });

  return capabilities;
}

function parseConnectPayload(value: unknown): ConnectResponsePayload {
  if (!isRecord(value)) {
    throw new BYOMProtocolBoundaryError(
      "Connect response payload must be an object.",
      {
        reasonCode: "request.invalid",
        details: { field: "payload" },
      },
    );
  }

  return {
    capabilities: parseCapabilities(value.capabilities),
  };
}

function parseProviderDescriptor(value: unknown): ProviderDescriptor {
  if (!isRecord(value)) {
    throw new BYOMProtocolBoundaryError("Provider entry must be an object.", {
      reasonCode: "request.invalid",
      details: { field: "providers" },
    });
  }

  const providerId = assertNonEmptyString(value.providerId, "providers[].providerId");
  const providerName = assertNonEmptyString(
    value.providerName,
    "providers[].providerName",
  );

  if (!Array.isArray(value.models) || value.models.some((model) => typeof model !== "string")) {
    throw new BYOMProtocolBoundaryError(
      "Provider entry must include a string[] models field.",
      {
        reasonCode: "request.invalid",
        details: { field: "providers[].models" },
      },
    );
  }

  const models = value.models.map((model) =>
    assertNonEmptyString(model, "providers[].models[]"),
  );

  return {
    providerId,
    providerName,
    models,
  };
}

function parseProviderListPayload(value: unknown): ProviderListResponsePayload {
  if (!isRecord(value)) {
    throw new BYOMProtocolBoundaryError(
      "Provider list payload must be an object.",
      {
        reasonCode: "request.invalid",
        details: { field: "payload" },
      },
    );
  }

  if (!Array.isArray(value.providers)) {
    throw new BYOMProtocolBoundaryError(
      "Provider list payload must include providers[].",
      {
        reasonCode: "request.invalid",
        details: { field: "providers" },
      },
    );
  }

  return {
    providers: value.providers.map(parseProviderDescriptor),
  };
}

function parseSelectProviderPayload(value: unknown): SelectProviderResponsePayload {
  if (!isRecord(value)) {
    throw new BYOMProtocolBoundaryError(
      "Provider selection payload must be an object.",
      {
        reasonCode: "request.invalid",
        details: { field: "payload" },
      },
    );
  }

  return {
    providerId: assertNonEmptyString(value.providerId, "providerId"),
    modelId: assertNonEmptyString(value.modelId, "modelId"),
  };
}

function parseChatMessage(value: unknown): ChatMessage {
  if (!isRecord(value)) {
    throw new BYOMProtocolBoundaryError("Message payload must be an object.", {
      reasonCode: "request.invalid",
      details: { field: "message" },
    });
  }

  const role = assertNonEmptyString(value.role, "message.role");
  if (!["system", "user", "assistant"].includes(role)) {
    throw new BYOMProtocolBoundaryError(
      `Message role "${role}" is unsupported.`,
      {
        reasonCode: "request.invalid",
        details: { field: "message.role" },
      },
    );
  }

  return {
    role: role as ChatMessage["role"],
    content: assertNonEmptyString(value.content, "message.content"),
  };
}

function parseChatSendPayload(value: unknown): ChatSendResponsePayload {
  if (!isRecord(value)) {
    throw new BYOMProtocolBoundaryError("Chat send payload must be an object.", {
      reasonCode: "request.invalid",
      details: { field: "payload" },
    });
  }

  return {
    message: parseChatMessage(value.message),
  };
}

function parseChatStreamPayload(value: unknown): ChatStreamResponsePayload {
  if (!isRecord(value)) {
    throw new BYOMProtocolBoundaryError(
      "Chat stream payload must be an object.",
      {
        reasonCode: "request.invalid",
        details: { field: "payload" },
      },
    );
  }

  const type = assertNonEmptyString(value.type, "payload.type");
  if (type === "done") {
    return { type: "done" };
  }

  if (type !== "chunk") {
    throw new BYOMProtocolBoundaryError("Chat stream payload type is invalid.", {
      reasonCode: "request.invalid",
      details: { field: "payload.type" },
    });
  }

  if (typeof value.delta !== "string" || value.delta.length === 0) {
    throw new BYOMProtocolBoundaryError(
      `Field "payload.delta" must be a non-empty string.`,
      {
        reasonCode: "request.invalid",
        details: { field: "payload.delta" },
      },
    );
  }
  const delta = value.delta;
  if (typeof value.index !== "number" || !Number.isInteger(value.index) || value.index < 0) {
    throw new BYOMProtocolBoundaryError("Chat stream chunk index is invalid.", {
      reasonCode: "request.invalid",
      details: { field: "payload.index" },
    });
  }

  return {
    type: "chunk",
    delta,
    index: value.index,
  };
}

function parseChatInput(input: ChatInput): readonly ChatMessage[] {
  if (!isRecord(input) || !Array.isArray(input.messages) || input.messages.length === 0) {
    throw new BYOMStateError("Chat input requires a non-empty messages array.", {
      reasonCode: "request.invalid",
      details: { field: "messages" },
    });
  }

  return input.messages.map(parseChatMessage);
}

function defaultRandomId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().replace(/-/g, "");
  }

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  const fallback = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
  return fallback;
}

function createInternalConfig(options: BYOMClientOptions): InternalClientConfig {
  return {
    protocolVersion: options.protocolVersion ?? SDK_PROTOCOL_VERSION ?? DEFAULT_PROTOCOL_VERSION,
    origin: options.origin ?? DEFAULT_ORIGIN,
    timeoutMs: options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    envelopeTtlMs: options.envelopeTtlMs ?? DEFAULT_ENVELOPE_TTL_MS,
    nonce: options.nonce ?? SDK_ENVELOPE_NONCE,
    now: options.now ?? (() => new Date()),
    randomId: options.randomId ?? defaultRandomId,
    defaultCapabilities: options.defaultCapabilities ?? CAPABILITY_CATALOG,
    defaultProviderId: options.defaultProviderId ?? DEFAULT_PROVIDER_ID,
    defaultModelId: options.defaultModelId ?? DEFAULT_MODEL_ID,
  };
}

function createCorrelationId(randomId: () => string): CorrelationId {
  return `corr.${randomId()}`;
}

function createRequestId(randomId: () => string): RequestId {
  return `req.${randomId()}`;
}

function createSessionId(randomId: () => string): SessionId {
  return `session.${randomId()}`;
}

export class BYOMClient {
  readonly #transport: BYOMTransport;
  readonly #stateMachine: BYOMStateMachine;
  readonly #config: InternalClientConfig;
  readonly #tracing: TelemetryTracing | undefined;

  #sessionId: SessionId | undefined;
  #appId: string | undefined;
  #selectedProvider: SelectedProvider | undefined;
  #capabilities: readonly ProtocolCapability[];

  readonly chat: Readonly<{
    send: (input: ChatInput, options?: ChatOperationOptions) => Promise<ChatSendResult>;
    stream: (
      input: ChatInput,
      options?: ChatOperationOptions,
    ) => AsyncIterable<ChatStreamEvent>;
  }>;

  constructor(options: BYOMClientOptions) {
    this.#transport = options.transport;
    this.#stateMachine = new BYOMStateMachine();
    this.#config = createInternalConfig(options);
    this.#capabilities = this.#config.defaultCapabilities;
    this.#tracing = options.tracing;
    this.chat = {
      send: (input, operationOptions) => this.#sendChat(input, operationOptions),
      stream: (input, operationOptions) => this.#streamChat(input, operationOptions),
    };
  }

  get state(): ClientState {
    return this.#stateMachine.state;
  }

  get sessionId(): SessionId | undefined {
    return this.#sessionId;
  }

  get selectedProvider():
    | Readonly<{
      providerId: string;
      modelId: string;
    }>
    | undefined {
    return this.#selectedProvider;
  }

  async connect(options: ConnectOptions): Promise<ConnectResult> {
    this.#assertState("connect", ["disconnected"]);
    const origin = options.origin ?? this.#config.origin;
    const appId = resolveAppId(options, origin);
    this.#stateMachine.transition("connecting");

    const requestId = createRequestId(this.#config.randomId);
    const correlationId = createCorrelationId(this.#config.randomId);
    const candidateSessionId = createSessionId(this.#config.randomId);
    const timeoutMs = options.timeoutMs ?? this.#config.timeoutMs;

    const requestEnvelope = this.#createEnvelope<ConnectPayload>({
      requestId,
      correlationId,
      sessionId: candidateSessionId,
      capability: "session.create",
      providerId: this.#config.defaultProviderId,
      modelId: this.#config.defaultModelId,
      payload: {
        appId,
        requestedCapabilities: this.#config.defaultCapabilities,
        ...(options.appName !== undefined ? { appName: options.appName } : {}),
        ...(options.appDescription !== undefined ? { appDescription: options.appDescription } : {}),
        ...(options.appIcon !== undefined && validateAppIconUrl(options.appIcon, origin)
          ? { appIcon: options.appIcon }
          : {}),
      },
      origin,
    });

    const request: TransportRequest<ConnectPayload> = {
      envelope: requestEnvelope,
      timeoutMs,
    };

    try {
      const response = await withTimeout(
        this.#transport.request<ConnectPayload, ConnectResponsePayload>(request),
        timeoutMs,
        `Connect request timed out after ${timeoutMs}ms.`,
      );

      const envelope = this.#parseResponseEnvelope<ConnectResponsePayload>(response, {
        expectedCorrelationId: correlationId,
        expectedCapability: "session.create",
        payloadParser: parseConnectPayload,
      });

      this.#sessionId = envelope.sessionId;
      this.#appId = appId;
      this.#selectedProvider = undefined;
      this.#capabilities = envelope.payload.capabilities;
      this.#stateMachine.transition("connected");

      const result: ConnectResult = {
        sessionId: envelope.sessionId,
        capabilities: envelope.payload.capabilities,
        protocolVersion: envelope.protocolVersion,
        correlationId,
      };
      this.#tracing?.startSpan(TELEMETRY_SPAN_NAMES.REQUEST, {
        metadata: {
          correlationId,
          origin: this.#config.origin,
          providerId: this.#config.defaultProviderId,
        },
        attributes: { capability: "session.create", outcome: "connected" },
      }).end();
      return result;
    } catch (error) {
      if (this.#stateMachine.state === "connecting") {
        this.#stateMachine.transition("failed");
      }

      this.#tracing?.startSpan(TELEMETRY_SPAN_NAMES.REQUEST, {
        metadata: {
          correlationId,
          origin: this.#config.origin,
          providerId: this.#config.defaultProviderId,
        },
        attributes: { capability: "session.create", outcome: "failed" },
      }).end();

      throw normalizeSDKError(error, {
        message: "Failed to connect to the BYOM provider bridge.",
        machineCode: SDK_MACHINE_CODES.TRANSPORT_ERROR,
        reasonCode: "transport.transient_failure",
        retryable: true,
        correlationId,
      });
    }
  }

  async listProviders(): Promise<ListProvidersResult> {
    this.#assertState("listProviders", ["connected", "degraded"]);
    const sessionId = this.#requireSessionId();
    const correlationId = createCorrelationId(this.#config.randomId);
    const requestId = createRequestId(this.#config.randomId);

    const envelope = this.#createEnvelope<ProviderListPayload>({
      requestId,
      correlationId,
      sessionId,
      capability: "provider.list",
      providerId: this.#config.defaultProviderId,
      modelId: this.#config.defaultModelId,
      payload: {},
    });

    try {
      const response = await withTimeout(
        this.#transport.request<ProviderListPayload, ProviderListResponsePayload>({
          envelope,
          timeoutMs: this.#config.timeoutMs,
        }),
        this.#config.timeoutMs,
        `Provider list request timed out after ${this.#config.timeoutMs}ms.`,
      );

      const parsed = this.#parseResponseEnvelope<ProviderListResponsePayload>(response, {
        expectedCorrelationId: correlationId,
        expectedCapability: "provider.list",
        payloadParser: parseProviderListPayload,
      });

      return {
        providers: parsed.payload.providers,
        correlationId,
      };
    } catch (error) {
      throw normalizeSDKError(error, {
        message: "Failed to list available providers.",
        machineCode: SDK_MACHINE_CODES.TRANSPORT_ERROR,
        reasonCode: "transport.transient_failure",
        retryable: true,
        correlationId,
      });
    }
  }

  async selectProvider(input: SelectProviderInput): Promise<SelectProviderResult> {
    this.#assertState("selectProvider", ["connected", "degraded"]);
    const sessionId = this.#requireSessionId();
    const providerId = assertNonEmptyString(input.providerId, "providerId");
    const modelId = assertNonEmptyString(input.modelId, "modelId");
    const correlationId = createCorrelationId(this.#config.randomId);
    const requestId = createRequestId(this.#config.randomId);

    const envelope = this.#createEnvelope<SelectProviderInput>({
      requestId,
      correlationId,
      sessionId,
      capability: "session.create",
      providerId,
      modelId,
      payload: { providerId, modelId },
    });

    try {
      const response = await withTimeout(
        this.#transport.request<SelectProviderInput, SelectProviderResponsePayload>({
          envelope,
          timeoutMs: this.#config.timeoutMs,
        }),
        this.#config.timeoutMs,
        `Provider selection request timed out after ${this.#config.timeoutMs}ms.`,
      );

      const parsed = this.#parseResponseEnvelope<SelectProviderResponsePayload>(response, {
        expectedCorrelationId: correlationId,
        expectedCapability: "session.create",
        payloadParser: parseSelectProviderPayload,
      });

      this.#selectedProvider = {
        providerId: parsed.payload.providerId,
        modelId: parsed.payload.modelId,
      };

      return {
        providerId: parsed.payload.providerId,
        modelId: parsed.payload.modelId,
        correlationId,
      };
    } catch (error) {
      throw normalizeSDKError(error, {
        message: "Failed to select provider.",
        machineCode: SDK_MACHINE_CODES.TRANSPORT_ERROR,
        reasonCode: "transport.transient_failure",
        retryable: true,
        correlationId,
      });
    }
  }

  async disconnect(): Promise<void> {
    if (this.#stateMachine.state === "disconnected") {
      return;
    }

    this.#assertState("disconnect", [
      "connecting",
      "connected",
      "degraded",
      "reconnecting",
      "failed",
    ]);

    const sessionId = this.#sessionId;
    if (sessionId !== undefined && typeof this.#transport.disconnect === "function") {
      try {
        await withTimeout(
          this.#transport.disconnect(sessionId),
          this.#config.timeoutMs,
          `Disconnect timed out after ${this.#config.timeoutMs}ms.`,
        );
      } catch (error) {
        throw normalizeSDKError(error, {
          message: "Failed to disconnect from BYOM provider bridge.",
          machineCode: SDK_MACHINE_CODES.TRANSPORT_ERROR,
          reasonCode: "transport.transient_failure",
          retryable: true,
        });
      }
    }

    if (this.#stateMachine.canTransition("disconnected")) {
      this.#stateMachine.transition("disconnected");
    }

    this.#sessionId = undefined;
    this.#appId = undefined;
    this.#selectedProvider = undefined;
    this.#capabilities = this.#config.defaultCapabilities;
  }

  async #sendChat(
    input: ChatInput,
    options: ChatOperationOptions = {},
  ): Promise<ChatSendResult> {
    this.#assertState("chat.send", ["connected", "degraded"]);
    const sessionId = this.#requireSessionId();
    const selection = this.#requireSelectedProvider();
    const messages = parseChatInput(input);
    const correlationId = createCorrelationId(this.#config.randomId);
    const requestId = createRequestId(this.#config.randomId);
    const timeoutMs = options.timeoutMs ?? this.#config.timeoutMs;
    const signal = options.signal;

    const envelope = this.#createEnvelope<ChatSendPayload>({
      requestId,
      correlationId,
      sessionId,
      capability: "chat.completions",
      providerId: selection.providerId,
      modelId: selection.modelId,
      payload: { messages },
    });

    try {
      const response = await withTimeout(
        this.#transport.request<ChatSendPayload, ChatSendResponsePayload>({
          envelope,
          timeoutMs,
          ...(signal !== undefined ? { signal } : {}),
        }),
        timeoutMs,
        `chat.send timed out after ${timeoutMs}ms.`,
        signal,
      );

      const parsed = this.#parseResponseEnvelope<ChatSendResponsePayload>(response, {
        expectedCorrelationId: correlationId,
        expectedCapability: "chat.completions",
        payloadParser: parseChatSendPayload,
      });

      const sendResult: ChatSendResult = {
        message: parsed.payload.message,
        correlationId,
      };
      this.#tracing?.startSpan(TELEMETRY_SPAN_NAMES.REQUEST, {
        metadata: {
          correlationId,
          origin: this.#config.origin,
          providerId: selection.providerId,
        },
        attributes: { capability: "chat.completions", outcome: "ok" },
      }).end();
      return sendResult;
    } catch (error) {
      this.#tracing?.startSpan(TELEMETRY_SPAN_NAMES.REQUEST, {
        metadata: {
          correlationId,
          origin: this.#config.origin,
          providerId: selection.providerId,
        },
        attributes: { capability: "chat.completions", outcome: "error" },
      }).end();
      throw normalizeSDKError(error, {
        message: "Failed to send chat request.",
        machineCode: SDK_MACHINE_CODES.TRANSPORT_ERROR,
        reasonCode: "transport.transient_failure",
        retryable: true,
        correlationId,
      });
    }
  }

  #streamChat(
    input: ChatInput,
    options: ChatOperationOptions = {},
  ): AsyncIterable<ChatStreamEvent> {
    this.#assertState("chat.stream", ["connected", "degraded"]);
    const sessionId = this.#requireSessionId();
    const selection = this.#requireSelectedProvider();
    const messages = parseChatInput(input);
    const correlationId = createCorrelationId(this.#config.randomId);
    const requestId = createRequestId(this.#config.randomId);
    const timeoutMs = options.timeoutMs ?? this.#config.timeoutMs;
    const signal = options.signal;

    const requestEnvelope = this.#createEnvelope<ChatStreamPayload>({
      requestId,
      correlationId,
      sessionId,
      capability: "chat.stream",
      providerId: selection.providerId,
      modelId: selection.modelId,
      payload: { messages },
    });

    const request: TransportRequest<ChatStreamPayload> = {
      envelope: requestEnvelope,
      timeoutMs,
      ...(signal !== undefined ? { signal } : {}),
    };

    const streamFactory = async () => {
      const stream = await withTimeout(
        this.#transport.stream<ChatStreamPayload, ChatStreamResponsePayload>(request),
        timeoutMs,
        `chat.stream setup timed out after ${timeoutMs}ms.`,
        signal,
      );

      return withStreamTimeout(
        stream,
        timeoutMs,
        `chat.stream timed out after ${timeoutMs}ms.`,
        signal,
      );
    };

    const tracing = this.#tracing;
    const configOrigin = this.#config.origin;
    const parseResponseEnvelope = <T>(
      response: TransportResponse<unknown>,
      options: {
        expectedCorrelationId: CorrelationId;
        expectedCapability: ProtocolCapability;
        payloadParser: (payload: unknown) => T;
      },
    ): ProtocolEnvelopePayload<T> => this.#parseResponseEnvelope<T>(response, options);
    return (async function* streamGenerator(): AsyncIterable<ChatStreamEvent> {
      try {
        const timedStream = await streamFactory();
        for await (const response of timedStream) {
          const parsed = parseResponseEnvelope<ChatStreamResponsePayload>(
            response,
            {
              expectedCorrelationId: correlationId,
              expectedCapability: "chat.stream",
              payloadParser: parseChatStreamPayload,
            },
          );

          if (parsed.payload.type === "chunk") {
            yield {
              type: "chunk",
              delta: parsed.payload.delta,
              index: parsed.payload.index,
              correlationId,
            };
            continue;
          }

          if (parsed.payload.type === "done") {
            tracing?.startSpan(TELEMETRY_SPAN_NAMES.STREAM, {
              metadata: {
                correlationId,
                origin: configOrigin,
                providerId: selection.providerId,
              },
              attributes: { outcome: "done" },
            }).end();
            yield {
              type: "done",
              correlationId,
            };
          }
        }
      } catch (error) {
        tracing?.startSpan(TELEMETRY_SPAN_NAMES.STREAM, {
          metadata: {
            correlationId,
            origin: configOrigin,
            providerId: selection.providerId,
          },
          attributes: { outcome: "error" },
        }).end();
        throw normalizeSDKError(error, {
          message: "Failed during chat stream.",
          machineCode: SDK_MACHINE_CODES.TRANSPORT_ERROR,
          reasonCode: "transport.transient_failure",
          retryable: true,
          correlationId,
        });
      }
    })();
  }

  #assertState(operation: string, validStates: readonly ClientState[]): void {
    if (validStates.includes(this.#stateMachine.state)) {
      return;
    }

    throw new BYOMStateError(
      `Operation "${operation}" is not allowed while state is "${this.#stateMachine.state}".`,
      {
        reasonCode: "request.invalid",
        details: {
          operation,
          state: this.#stateMachine.state,
        },
      },
    );
  }

  #requireSessionId(): SessionId {
    if (this.#sessionId !== undefined) {
      return this.#sessionId;
    }

    throw new BYOMStateError("Client is not connected to a session.", {
      reasonCode: "request.invalid",
      details: { field: "sessionId" },
    });
  }

  #requireSelectedProvider(): SelectedProvider {
    if (this.#selectedProvider !== undefined) {
      return this.#selectedProvider;
    }

    throw new BYOMSDKError(
      "A provider must be selected before chat operations can run.",
      {
        machineCode: SDK_MACHINE_CODES.MISSING_PROVIDER_SELECTION,
        reasonCode: "request.invalid",
        retryable: false,
      },
    );
  }

  #createEnvelope<TPayload>(input: {
    requestId: RequestId;
    correlationId: CorrelationId;
    sessionId: SessionId;
    capability: ProtocolCapability;
    providerId: string;
    modelId: string;
    payload: TPayload;
    origin?: string;
  }): ProtocolEnvelopePayload<TPayload> {
    const issuedAt = this.#config.now();
    const expiresAt = new Date(issuedAt.getTime() + this.#config.envelopeTtlMs);

    return parseEnvelope<TPayload>(
      {
        protocolVersion: this.#config.protocolVersion,
        requestId: input.requestId,
        correlationId: input.correlationId,
        origin: input.origin ?? this.#config.origin,
        sessionId: input.sessionId,
        capability: input.capability,
        providerId: input.providerId,
        modelId: input.modelId,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        nonce: this.#config.nonce,
        payload: input.payload,
      },
      {
        now: issuedAt,
        supportedProtocolVersion: this.#config.protocolVersion,
      },
    );
  }

  #parseResponseEnvelope<TPayload>(
    response: TransportResponse<unknown>,
    options: {
      expectedCorrelationId: CorrelationId;
      expectedCapability: ProtocolCapability;
      payloadParser: (payload: unknown) => TPayload;
    },
  ): ProtocolEnvelopePayload<TPayload> {
    if (!isRecord(response) || !("envelope" in response)) {
      throw new BYOMProtocolBoundaryError(
        "Transport response is missing the canonical envelope.",
        {
          reasonCode: "protocol.invalid_envelope",
          details: { field: "envelope" },
        },
      );
    }

    const parsedEnvelope = parseEnvelope<TPayload>(response.envelope, {
      now: this.#config.now(),
      supportedProtocolVersion: this.#config.protocolVersion,
      payloadParser: options.payloadParser,
    });

    if (parsedEnvelope.correlationId !== options.expectedCorrelationId) {
      throw new BYOMProtocolBoundaryError(
        "Correlation ID mismatch detected in response envelope.",
        {
          reasonCode: normalizeReasonCode("request.invalid"),
          details: {
            expectedCorrelationId: options.expectedCorrelationId,
            actualCorrelationId: parsedEnvelope.correlationId,
          },
        },
      );
    }

    if (parsedEnvelope.capability !== options.expectedCapability) {
      throw new BYOMProtocolBoundaryError(
        "Capability mismatch detected in response envelope.",
        {
          reasonCode: "request.invalid",
          details: {
            expectedCapability: options.expectedCapability,
            actualCapability: parsedEnvelope.capability,
          },
        },
      );
    }

    return parsedEnvelope;
  }
}
