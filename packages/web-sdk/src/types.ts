import type {
  CanonicalEnvelope,
  ProtocolCapability,
  ProtocolReasonCode,
} from "@byom-ai/protocol";

export const SDK_PROTOCOL_VERSION = "1.0.0";
export const SDK_ENVELOPE_NONCE = "AQIDBAUGBwgJCgsMDQ4PEA";
export const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
export const DEFAULT_ENVELOPE_TTL_MS = 60_000;

export type ClientState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "degraded"
  | "reconnecting"
  | "failed";

export type RequestId = string;
export type CorrelationId = string;
export type SessionId = string;

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = Readonly<{
  role: ChatRole;
  content: string;
}>;

export type ChatInput = Readonly<{
  messages: readonly ChatMessage[];
}>;

export type ChatOperationOptions = Readonly<{
  timeoutMs?: number;
  signal?: AbortSignal;
}>;

export type ConnectOptions = Readonly<{
  /** Full appId (reverse-domain). Auto-derived from origin if omitted. */
  appId?: string;
  /** Suffix appended to the auto-derived domain prefix. Ignored if appId is set. */
  appSuffix?: string;
  /** Human-readable app name. Defaults to origin hostname. */
  appName?: string;
  /** Short app description. */
  appDescription?: string;
  /** URL to square icon/logo (https:// or data: URI). */
  appIcon?: string;
  origin?: string;
  timeoutMs?: number;
}>;

export type ConnectResult = Readonly<{
  sessionId: SessionId;
  capabilities: readonly ProtocolCapability[];
  protocolVersion: string;
  correlationId: CorrelationId;
}>;

export type ProviderDescriptor = Readonly<{
  providerId: string;
  providerName: string;
  models: readonly string[];
}>;

export type ListProvidersResult = Readonly<{
  providers: readonly ProviderDescriptor[];
  correlationId: CorrelationId;
}>;

export type SelectProviderInput = Readonly<{
  providerId: string;
  modelId: string;
}>;

export type SelectProviderResult = Readonly<{
  providerId: string;
  modelId: string;
  correlationId: CorrelationId;
}>;

export type ChatSendResult = Readonly<{
  message: ChatMessage;
  correlationId: CorrelationId;
}>;

export type ChatStreamEvent =
  | Readonly<{
    type: "chunk";
    delta: string;
    index: number;
    correlationId: CorrelationId;
  }>
  | Readonly<{
    type: "done";
    correlationId: CorrelationId;
  }>;

export type ProtocolEnvelopePayload<TPayload = unknown> = CanonicalEnvelope<TPayload>;

export type TransportRequest<TPayload = unknown> = Readonly<{
  envelope: ProtocolEnvelopePayload<TPayload>;
  timeoutMs?: number;
  signal?: AbortSignal;
}>;

export type TransportResponse<TPayload = unknown> = Readonly<{
  envelope: ProtocolEnvelopePayload<TPayload>;
}>;

export type TransportStream<TPayload = unknown> = AsyncIterable<
  TransportResponse<TPayload>
>;

export type ConnectPayload = Readonly<{
  appId: string;
  requestedCapabilities: readonly ProtocolCapability[];
  appName?: string;
  appDescription?: string;
  appIcon?: string;
}>;

export type ConnectResponsePayload = Readonly<{
  capabilities: readonly ProtocolCapability[];
}>;

export type ProviderListPayload = Readonly<Record<never, never>>;

export type ProviderListResponsePayload = Readonly<{
  providers: readonly ProviderDescriptor[];
}>;

export type SelectProviderPayload = Readonly<{
  providerId: string;
  modelId: string;
}>;

export type SelectProviderResponsePayload = SelectProviderPayload;

export type ChatSendPayload = Readonly<{
  messages: readonly ChatMessage[];
}>;

export type ChatSendResponsePayload = Readonly<{
  message: ChatMessage;
}>;

export type ChatStreamPayload = ChatSendPayload;

export type ChatStreamChunkPayload = Readonly<{
  type: "chunk";
  delta: string;
  index: number;
}>;

export type ChatStreamDonePayload = Readonly<{
  type: "done";
}>;

export type ChatStreamResponsePayload = ChatStreamChunkPayload | ChatStreamDonePayload;

export type TransportErrorLike = Readonly<{
  message?: string;
  machineCode?: string;
  reasonCode?: string;
  retryable?: boolean;
  correlationId?: string;
  details?: Readonly<Record<string, string | number | boolean | null>>;
  cause?: unknown;
}>;

export type EnvelopeContext = Readonly<{
  requestId: RequestId;
  correlationId: CorrelationId;
  capability: ProtocolCapability;
  providerId: string;
  modelId: string;
}>;

export type InternalClientConfig = Readonly<{
  protocolVersion: string;
  origin: string;
  timeoutMs: number;
  envelopeTtlMs: number;
  nonce: string;
  now: () => Date;
  randomId: () => string;
  defaultCapabilities: readonly ProtocolCapability[];
  defaultProviderId: string;
  defaultModelId: string;
}>;

export type RequiredResponsePayload<TPayload> = Readonly<{
  correlationId: string;
  payload: TPayload;
}>;

export type ContextWindowInfo = Readonly<{
  /** Maximum context window size in tokens for the selected model. */
  maxTokens: number;
  /** Estimated tokens currently used by messages in the context window. */
  usedTokens: number;
  /** Tokens reserved for model output (not available for input). */
  reservedOutputTokens: number;
  /** Tokens still available for new input messages. */
  remainingTokens: number;
  /** Usage as a fraction (0–1) of the input budget (maxTokens − reservedOutputTokens). */
  usageRatio: number;
}>;

export type DeterministicFailure = Readonly<{
  reasonCode: ProtocolReasonCode;
  machineCode: string;
}>;
