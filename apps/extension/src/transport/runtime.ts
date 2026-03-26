import {
  EnvelopeValidationError,
  ProtocolError,
  PROTOCOL_MACHINE_CODES,
  ProviderUnavailableError,
  TimeoutError,
  TransientNetworkError,
  isProtocolError,
  parseEnvelope,
  type CanonicalEnvelope,
  type ProtocolErrorDetailValue,
} from "@byom-ai/protocol";
import type {
  ChatMessage,
  ChatSendPayload,
  ChatSendResponsePayload,
  ChatStreamResponsePayload,
  ConnectResponsePayload,
  ProviderDescriptor,
  ProviderListResponsePayload,
  SelectProviderPayload,
  SelectProviderResponsePayload,
} from "@byom-ai/web-sdk";
import { ensureBridgeHandshakeSession } from "./bridge-handshake.js";
import {
  BRIDGE_PAIRING_STATE_STORAGE_KEY,
  parseBridgePairingState,
  unwrapPairingKeyMaterial,
} from "./bridge-pairing.js";
import {
  runCloudBridgeCompletion,
  runCloudBridgeCompletionStream,
} from "./cloud-native.js";
import type { UsageReport } from "../usage/token-usage-types.js";
import { estimateUsageReport } from "../usage/token-estimation.js";
import { TokenUsageService } from "../usage/token-usage-service.js";

const WALLET_KEY_PROVIDERS = "byom.wallet.providers.v1";
const WALLET_KEY_ACTIVE = "byom.wallet.activeProvider.v1";
const WALLET_KEY_BRIDGE_SHARED_SECRET = "byom.wallet.bridgeSharedSecret.v1";
const RESPONSE_TTL_MS = 60_000;
const TRANSPORT_STREAM_CHANNEL = "byom.transport.stream";
const TRANSPORT_STREAM_PORT_NAME = "byom.transport.stream.v1";

const DEFAULT_CAPABILITIES = [
  "provider.list",
  "session.create",
  "chat.completions",
  "chat.stream",
  "usage.query",
] as const;

type StoredProviderModel = Readonly<{
  id: string;
  name: string;
}>;

type StoredProviderStatus =
  | "connected"
  | "disconnected"
  | "attention"
  | "reconnecting"
  | "failed"
  | "revoked"
  | "degraded";

type StoredProvider = Readonly<{
  id: string;
  name: string;
  type: "local" | "cloud" | "cli";
  status: StoredProviderStatus;
  models: readonly StoredProviderModel[];
  lastSyncedAt?: number;
  metadata?: Readonly<Record<string, string>>;
}>;

type StoredActiveProvider =
  | Readonly<{
    providerId: string;
    modelId?: string;
  }>
  | null;

type WalletSnapshot = Readonly<{
  providers: readonly StoredProvider[];
  activeProvider: StoredActiveProvider;
}>;

export type WalletStorageAdapter = Readonly<{
  get(keys: readonly string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}>;

type SupportedTransportAction = "request" | "request-stream" | "disconnect";

export type TransportMessageEnvelope = Readonly<{
  channel: "byom.transport";
  action: SupportedTransportAction;
  request?: Readonly<{
    envelope: unknown;
    timeoutMs?: number;
  }>;
  sessionId?: string;
}>;

type TransportErrorDetails = Readonly<
  Record<string, ProtocolErrorDetailValue>
>;

export type TransportErrorPayload = Readonly<{
  message: string;
  machineCode: string;
  reasonCode: string;
  retryable: boolean;
  correlationId?: string;
  details?: TransportErrorDetails;
}>;

export type TransportActionResponse =
  | Readonly<{
    ok: true;
    envelope?: CanonicalEnvelope<unknown>;
    envelopes?: readonly CanonicalEnvelope<unknown>[];
  }>
  | Readonly<{
    ok: false;
    error: TransportErrorPayload;
  }>;

type SupportedStreamPortAction = "start" | "cancel";

type TransportStreamPortMessage = Readonly<{
  channel: typeof TRANSPORT_STREAM_CHANNEL;
  action: SupportedStreamPortAction;
  requestId: string;
  request?: Readonly<{
    envelope: unknown;
    timeoutMs?: number;
  }>;
}>;

type TransportStreamPortEvent = Readonly<{
  channel: typeof TRANSPORT_STREAM_CHANNEL;
  requestId: string;
  event: "start" | "chunk" | "done" | "error" | "cancelled";
  envelope?: CanonicalEnvelope<ChatStreamResponsePayload>;
  error?: TransportErrorPayload;
}>;

type RuntimeDependencies = Readonly<{
  now?: () => Date;
  fetchImpl?: typeof fetch;
  sendNativeMessage?: (
    hostName: string,
    message: Record<string, unknown>,
  ) => Promise<unknown>;
  resolveBridgeSharedSecret?: (
    hostName: string,
  ) => Promise<string | Uint8Array | undefined | null>;
  resolveBridgePairingHandle?: (hostName: string) => Promise<string | undefined | null>;
  extensionId?: string;
}>;

type ResolvedRuntimeDependencies = Readonly<{
  now: () => Date;
  fetchImpl: typeof fetch;
  sendNativeMessage: (
    hostName: string,
    message: Record<string, unknown>,
  ) => Promise<unknown>;
  resolveBridgeSharedSecret?: (
    hostName: string,
  ) => Promise<string | Uint8Array | undefined | null>;
  resolveBridgePairingHandle?: (hostName: string) => Promise<string | undefined | null>;
  extensionId?: string;
}>;

type TransportMessageHandlerOptions = Readonly<{
  storage: WalletStorageAdapter;
  dependencies?: RuntimeDependencies;
}>;

type CompletionProvider = Readonly<{
  providerId: string;
  providerName: string;
  providerType: StoredProvider["type"];
  modelId: string;
  metadata: Readonly<Record<string, string>>;
}>;

type CompletionStreamResult = {
  stream: AsyncIterable<string>;
  usage: Promise<UsageReport>;
};

type CompletionResult = {
  content: string;
  usage: UsageReport;
};

type CliSessionCacheEntry = Readonly<{
  cliSessionId: string;
  expiresAtMs: number;
}>;

const CLI_SESSION_CACHE_TTL_MS = 30 * 60_000;
const MAX_CLI_SESSION_CACHE_ENTRIES = 512;
const cliSessionCache = new Map<string, CliSessionCacheEntry>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string, fallback = ""): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function createSingleDeltaStream(value: string): AsyncIterable<string> {
  return (async function* (): AsyncIterable<string> {
    if (value.length > 0) {
      yield value;
    }
  })();
}

function readOllamaResponseContent(payload: Record<string, unknown>): string | undefined {
  const messageRecord = isRecord(payload["message"]) ? payload["message"] : undefined;
  if (
    isRecord(messageRecord) &&
    typeof messageRecord["content"] === "string" &&
    messageRecord["content"].length > 0
  ) {
    return messageRecord["content"];
  }

  if (typeof payload["response"] === "string" && payload["response"].length > 0) {
    return payload["response"];
  }

  return undefined;
}

function createCliSessionCacheKey(options: {
  hostName: string;
  providerId: string;
  modelId: string;
  sessionId: string;
}): string {
  return `${options.hostName}::${options.providerId}::${options.modelId}::${options.sessionId}`;
}

function toProtocolErrorDetails(value: unknown): Record<string, ProtocolErrorDetailValue> {
  if (!isRecord(value)) {
    return {};
  }

  const details: Record<string, ProtocolErrorDetailValue> = {};
  for (const [key, detailValue] of Object.entries(value)) {
    if (
      typeof detailValue === "string" ||
      typeof detailValue === "number" ||
      typeof detailValue === "boolean" ||
      detailValue === null
    ) {
      details[key] = detailValue;
    }
  }

  return details;
}

function parseStoredProvider(value: unknown): StoredProvider | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value["id"] !== "string" ||
    typeof value["name"] !== "string" ||
    (value["type"] !== "local" &&
      value["type"] !== "cloud" &&
      value["type"] !== "cli") ||
    (value["status"] !== "connected" &&
      value["status"] !== "disconnected" &&
      value["status"] !== "attention" &&
      value["status"] !== "reconnecting" &&
      value["status"] !== "failed" &&
      value["status"] !== "revoked" &&
      value["status"] !== "degraded")
  ) {
    return null;
  }

  const rawModels = Array.isArray(value["models"]) ? value["models"] : [];
  const models: StoredProviderModel[] = [];
  for (const model of rawModels) {
    if (
      isRecord(model) &&
      typeof model["id"] === "string" &&
      typeof model["name"] === "string"
    ) {
      models.push({
        id: model["id"],
        name: model["name"],
      });
    }
  }

  const metadata =
    isRecord(value["metadata"])
      ? Object.fromEntries(
        Object.entries(value["metadata"]).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
      : {};

  return {
    id: value["id"],
    name: value["name"],
    type: value["type"],
    status: value["status"],
    models,
    ...(typeof value["lastSyncedAt"] === "number"
      ? { lastSyncedAt: value["lastSyncedAt"] }
      : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

function parseActiveProvider(value: unknown): StoredActiveProvider {
  if (!isRecord(value) || typeof value["providerId"] !== "string") {
    return null;
  }

  return {
    providerId: value["providerId"],
    ...(typeof value["modelId"] === "string" ? { modelId: value["modelId"] } : {}),
  };
}

async function readWalletSnapshot(
  storage: WalletStorageAdapter,
): Promise<WalletSnapshot> {
  const rawState = await storage.get([WALLET_KEY_PROVIDERS, WALLET_KEY_ACTIVE]);
  const providersRaw = rawState[WALLET_KEY_PROVIDERS];
  const providers = Array.isArray(providersRaw)
    ? providersRaw
      .map((value) => parseStoredProvider(value))
      .filter((value): value is StoredProvider => value !== null)
    : [];

  const activeProvider = parseActiveProvider(rawState[WALLET_KEY_ACTIVE]);
  return {
    providers,
    activeProvider,
  };
}

function createResponseEnvelope<TPayload>(
  requestEnvelope: CanonicalEnvelope<unknown>,
  payload: TPayload,
  now: Date,
): CanonicalEnvelope<TPayload> {
  const expiresAt = new Date(now.getTime() + RESPONSE_TTL_MS);
  return {
    ...requestEnvelope,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    payload,
  };
}

function toTransportErrorPayload(
  error: unknown,
  correlationId: string | undefined,
): TransportErrorPayload {
  if (isProtocolError(error)) {
    return {
      message: error.message,
      machineCode: error.machineCode,
      reasonCode: error.reasonCode,
      retryable: error.retryable,
      ...(error.correlationId !== undefined
        ? { correlationId: error.correlationId }
        : correlationId !== undefined
          ? { correlationId }
          : {}),
      ...(error.details !== undefined ? { details: error.details } : {}),
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      machineCode: PROTOCOL_MACHINE_CODES.TRANSIENT_NETWORK,
      reasonCode: "transport.transient_failure",
      retryable: true,
      ...(correlationId !== undefined ? { correlationId } : {}),
    };
  }

  return {
    message: String(error),
    machineCode: PROTOCOL_MACHINE_CODES.TRANSIENT_NETWORK,
    reasonCode: "transport.transient_failure",
    retryable: true,
    ...(correlationId !== undefined ? { correlationId } : {}),
  };
}

function assertTransportRequestPayload(
  request: unknown,
): Readonly<{
  envelope: unknown;
  timeoutMs?: number;
}> {
  if (!isRecord(request) || !("envelope" in request)) {
    throw new EnvelopeValidationError(
      "Transport request payload must include an envelope.",
      {
        reasonCode: "request.invalid",
        details: { field: "request.envelope" },
      },
    );
  }

  if (
    "timeoutMs" in request &&
    request["timeoutMs"] !== undefined &&
    (typeof request["timeoutMs"] !== "number" || !Number.isFinite(request["timeoutMs"]))
  ) {
    throw new EnvelopeValidationError(
      "request.timeoutMs must be a finite number when provided.",
      {
        reasonCode: "request.invalid",
        details: { field: "request.timeoutMs" },
      },
    );
  }

  return {
    envelope: request["envelope"],
    ...(typeof request["timeoutMs"] === "number"
      ? { timeoutMs: request["timeoutMs"] }
      : {}),
  };
}

function parseChatMessages(payload: unknown): readonly ChatMessage[] {
  if (!isRecord(payload) || !Array.isArray(payload["messages"])) {
    throw new EnvelopeValidationError(
      "chat.completions payload must include a messages array.",
      {
        reasonCode: "request.invalid",
        details: { field: "payload.messages" },
      },
    );
  }

  const messages: ChatMessage[] = [];
  for (const entry of payload["messages"]) {
    if (
      !isRecord(entry) ||
      (entry["role"] !== "system" &&
        entry["role"] !== "user" &&
        entry["role"] !== "assistant") ||
      typeof entry["content"] !== "string" ||
      entry["content"].trim().length === 0
    ) {
      throw new EnvelopeValidationError("Invalid chat message entry.", {
        reasonCode: "request.invalid",
        details: { field: "payload.messages[]" },
      });
    }

    messages.push({
      role: entry["role"],
      content: entry["content"],
    });
  }

  if (messages.length === 0) {
    throw new EnvelopeValidationError("At least one chat message is required.", {
      reasonCode: "request.invalid",
      details: { field: "payload.messages" },
    });
  }

  return messages;
}

function buildOllamaBaseUrlCandidates(rawBaseUrl: string): readonly string[] {
  const normalized = normalizeBaseUrl(rawBaseUrl);
  const parsed = new URL(normalized);

  const candidates = new Set<string>([normalized]);
  const makeCandidate = (hostname: string): string => {
    const clone = new URL(parsed.toString());
    clone.hostname = hostname;
    return clone.toString().replace(/\/$/, "");
  };

  if (parsed.hostname === "localhost") {
    candidates.add(makeCandidate("127.0.0.1"));
    candidates.add(makeCandidate("[::1]"));
  } else if (parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]") {
    candidates.add(makeCandidate("localhost"));
  }

  return [...candidates];
}

function buildGeneratePrompt(messages: readonly ChatMessage[]): string {
  return messages.map((message) => `${message.role}: ${message.content}`).join("\n");
}

function resolveProviderSelection(
  snapshot: WalletSnapshot,
  providerId: string,
  modelId: string,
): CompletionProvider {
  const provider = snapshot.providers.find((item) => item.id === providerId);
  if (provider === undefined) {
    throw new ProviderUnavailableError(`Provider "${providerId}" is not connected.`, {
      details: { providerId },
    });
  }

  if (
    provider.status === "disconnected" ||
    provider.status === "failed" ||
    provider.status === "revoked" ||
    provider.status === "reconnecting"
  ) {
    throw new ProviderUnavailableError(`Provider "${provider.name}" is ${provider.status}.`, {
      details: { providerId: provider.id },
    });
  }

  if (provider.type === "cloud" && provider.status === "attention") {
    throw new ProviderUnavailableError(
      `Provider "${provider.name}" is in validation-only mode. Enable cloud bridge execution, re-test the provider connection, and save again before sending chat messages.`,
      {
        details: {
          providerId: provider.id,
          status: provider.status,
          providerType: provider.type,
        },
      },
    );
  }

  const modelExists = provider.models.some((model) => model.id === modelId);
  if (!modelExists) {
    throw new ProviderUnavailableError(
      `Model "${modelId}" is not available for provider "${provider.name}".`,
      {
        details: {
          providerId: provider.id,
          modelId,
        },
      },
    );
  }

  return {
    providerId: provider.id,
    providerName: provider.name,
    providerType: provider.type,
    modelId,
    metadata: provider.metadata ?? {},
  };
}

function parseSelectionPayload(payload: unknown): SelectProviderPayload {
  if (
    !isRecord(payload) ||
    typeof payload["providerId"] !== "string" ||
    typeof payload["modelId"] !== "string"
  ) {
    throw new EnvelopeValidationError(
      "session.create selection payload requires providerId and modelId.",
      {
        reasonCode: "request.invalid",
        details: {
          field: "payload",
        },
      },
    );
  }

  return {
    providerId: payload["providerId"],
    modelId: payload["modelId"],
  };
}

function toProviderDescriptors(
  providers: readonly StoredProvider[],
): readonly ProviderDescriptor[] {
  return providers
    .filter(
      (provider) =>
        provider.status !== "disconnected" &&
        provider.status !== "failed" &&
        provider.status !== "revoked" &&
        provider.status !== "reconnecting" &&
        !(provider.type === "cloud" && provider.status === "attention"),
    )
    .map((provider) => ({
      providerId: provider.id,
      providerName: provider.name,
      models: provider.models.map((model) => model.id),
    }));
}

function normalizeBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (error) {
    const causeError = error instanceof Error ? error : undefined;
    throw new ProviderUnavailableError("Provider base URL is invalid.", {
      ...(causeError !== undefined ? { cause: causeError } : {}),
      details: { baseUrl: raw },
    });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ProviderUnavailableError("Provider base URL protocol is unsupported.", {
      details: {
        baseUrl: raw,
        protocol: parsed.protocol,
      },
    });
  }

  return parsed.toString().replace(/\/$/, "");
}

async function runOllamaCompletion(options: {
  provider: CompletionProvider;
  messages: readonly ChatMessage[];
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<CompletionResult> {
  const baseUrlCandidates = buildOllamaBaseUrlCandidates(
    normalizeText(options.provider.metadata["baseUrl"] ?? "http://localhost:11434"),
  );
  const networkErrors: string[] = [];
  const effectiveTimeoutMs = Math.max(options.timeoutMs, 15_000);

  const runRequest = async (
    url: string,
    body: Record<string, unknown>,
  ): Promise<Response> => {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, effectiveTimeoutMs);

    try {
      return await options.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new TimeoutError(
          `Ollama request timed out after ${String(effectiveTimeoutMs)}ms.`,
        );
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new TransientNetworkError(
        `Unable to reach Ollama runtime at ${url}: ${errorMessage}`,
        {
          details: {
            providerId: options.provider.providerId,
            endpoint: url,
          },
          ...(error instanceof Error ? { cause: error } : {}),
        },
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  };

  for (const baseUrl of baseUrlCandidates) {
    let response: Response;
    try {
      response = await runRequest(`${baseUrl}/api/chat`, {
        model: options.provider.modelId,
        stream: false,
        messages: options.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });
    } catch (error) {
      if (error instanceof TransientNetworkError) {
        networkErrors.push(error.message);
        continue;
      }
      throw error;
    }

    if (response.status === 404) {
      try {
        response = await runRequest(`${baseUrl}/api/generate`, {
          model: options.provider.modelId,
          stream: false,
          prompt: buildGeneratePrompt(options.messages),
        });
      } catch (error) {
        if (error instanceof TransientNetworkError) {
          networkErrors.push(error.message);
          continue;
        }
        throw error;
      }
    }

    if (!response.ok) {
      throw new ProviderUnavailableError(
        `Ollama responded with HTTP ${String(response.status)}.`,
        {
          details: {
            providerId: options.provider.providerId,
            status: response.status,
            endpoint: baseUrl,
          },
        },
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      const causeError = error instanceof Error ? error : undefined;
      throw new ProviderUnavailableError("Ollama returned invalid JSON.", {
        ...(causeError !== undefined ? { cause: causeError } : {}),
        details: {
          providerId: options.provider.providerId,
          endpoint: baseUrl,
        },
      });
    }

    if (!isRecord(payload)) {
      throw new ProviderUnavailableError("Ollama response payload is malformed.", {
        details: {
          providerId: options.provider.providerId,
          endpoint: baseUrl,
        },
      });
    }

    const content = readOllamaResponseContent(payload)?.trim() ?? "";

    if (content.length === 0) {
      throw new ProviderUnavailableError(
        "Ollama response did not include assistant content.",
        {
          details: {
            providerId: options.provider.providerId,
            endpoint: baseUrl,
          },
        },
      );
    }

    const promptEval = typeof payload["prompt_eval_count"] === "number" ? payload["prompt_eval_count"] : undefined;
    const evalCount = typeof payload["eval_count"] === "number" ? payload["eval_count"] : undefined;
    const usage: UsageReport =
      promptEval !== undefined && evalCount !== undefined
        ? { inputTokens: promptEval, outputTokens: evalCount, source: "reported" }
        : estimateUsageReport(options.messages, content);
    return { content, usage };
  }

  const summarizedAttempts = networkErrors
    .slice(0, 3)
    .map((item) => item.slice(0, 200))
    .join(" | ");
  throw new TransientNetworkError(
    summarizedAttempts.length > 0
      ? `Unable to reach Ollama runtime at configured endpoint(s): ${summarizedAttempts}`
      : "Unable to reach Ollama runtime at configured endpoint(s).",
    {
      details: {
        providerId: options.provider.providerId,
        attempts: networkErrors.join(" | ").slice(0, 1_000),
      },
    },
  );
}

async function runOllamaCompletionStream(options: {
  provider: CompletionProvider;
  messages: readonly ChatMessage[];
  timeoutMs: number;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}): Promise<CompletionStreamResult> {
  const baseUrlCandidates = buildOllamaBaseUrlCandidates(
    normalizeText(options.provider.metadata["baseUrl"] ?? "http://localhost:11434"),
  );
  const networkErrors: string[] = [];
  const effectiveTimeoutMs = Math.max(options.timeoutMs, 15_000);

  const runRequest = async (
    url: string,
    body: Record<string, unknown>,
  ): Promise<Response> => {
    throwIfAborted(options.signal);
    const controller = new AbortController();
    let timedOut = false;
    const abortFromSignal = () => {
      controller.abort();
    };
    if (options.signal !== undefined) {
      options.signal.addEventListener("abort", abortFromSignal, { once: true });
    }
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, effectiveTimeoutMs);

    try {
      return await options.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (options.signal?.aborted === true && !timedOut) {
          throw createTransportCancelledError();
        }
        throw new TimeoutError(
          `Ollama request timed out after ${String(effectiveTimeoutMs)}ms.`,
        );
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new TransientNetworkError(
        `Unable to reach Ollama runtime at ${url}: ${errorMessage}`,
        {
          details: {
            providerId: options.provider.providerId,
            endpoint: url,
          },
          ...(error instanceof Error ? { cause: error } : {}),
        },
      );
    } finally {
      clearTimeout(timeoutHandle);
      if (options.signal !== undefined) {
        options.signal.removeEventListener("abort", abortFromSignal);
      }
    }
  };

  for (const baseUrl of baseUrlCandidates) {
    let response: Response;
    try {
      response = await runRequest(`${baseUrl}/api/chat`, {
        model: options.provider.modelId,
        stream: true,
        messages: options.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });
    } catch (error) {
      if (error instanceof TransientNetworkError) {
        networkErrors.push(error.message);
        continue;
      }
      throw error;
    }

    if (response.status === 404) {
      try {
        response = await runRequest(`${baseUrl}/api/generate`, {
          model: options.provider.modelId,
          stream: true,
          prompt: buildGeneratePrompt(options.messages),
        });
      } catch (error) {
        if (error instanceof TransientNetworkError) {
          networkErrors.push(error.message);
          continue;
        }
        throw error;
      }
    }

    if (!response.ok) {
      throw new ProviderUnavailableError(
        `Ollama responded with HTTP ${String(response.status)}.`,
        {
          details: {
            providerId: options.provider.providerId,
            status: response.status,
            endpoint: baseUrl,
          },
        },
      );
    }

    const responseBody = response.body;
    if (responseBody === null) {
      const fallback = await runOllamaCompletion({
        provider: options.provider,
        messages: options.messages,
        timeoutMs: options.timeoutMs,
        fetchImpl: options.fetchImpl,
      });
      return { stream: createSingleDeltaStream(fallback.content), usage: Promise.resolve(fallback.usage) };
    }

    let resolveUsage!: (report: UsageReport) => void;
    const usagePromise = new Promise<UsageReport>((resolve) => { resolveUsage = resolve; });

    const stream = async function* (): AsyncIterable<string> {
      const reader = responseBody.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let hasContent = false;
      let doneSignalSeen = false;
      let fullContent = "";
      let usageResolved = false;

      const processLine = (
        line: string,
      ): Readonly<{ delta?: string; done: boolean; usage?: UsageReport }> => {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
          return { done: false };
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(trimmed);
        } catch (error) {
          throw new ProviderUnavailableError(
            "Ollama streaming response contained invalid JSON.",
            {
              details: {
                providerId: options.provider.providerId,
                endpoint: baseUrl,
              },
              ...(error instanceof Error ? { cause: error } : {}),
            },
          );
        }

        if (!isRecord(parsed)) {
          return { done: false };
        }

        const delta = readOllamaResponseContent(parsed);
        const isDone = parsed["done"] === true;
        let lineUsage: UsageReport | undefined;
        if (isDone) {
          const promptEval = typeof parsed["prompt_eval_count"] === "number" ? parsed["prompt_eval_count"] : undefined;
          const evalCount = typeof parsed["eval_count"] === "number" ? parsed["eval_count"] : undefined;
          if (promptEval !== undefined && evalCount !== undefined) {
            lineUsage = { inputTokens: promptEval, outputTokens: evalCount, source: "reported" };
          }
        }
        return {
          ...(delta !== undefined ? { delta } : {}),
          done: isDone,
          ...(lineUsage !== undefined ? { usage: lineUsage } : {}),
        };
      };

      try {
        while (!doneSignalSeen) {
          throwIfAborted(options.signal);
          const next = await reader.read();
          if (next.done) {
            break;
          }

          buffer += decoder.decode(next.value, { stream: true });
          let newlineIndex = buffer.indexOf("\n");
          while (newlineIndex >= 0) {
            throwIfAborted(options.signal);
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            const parsed = processLine(line);
            if (parsed.delta !== undefined && parsed.delta.length > 0) {
              hasContent = true;
              fullContent += parsed.delta;
              yield parsed.delta;
            }
            if (parsed.done) {
              if (parsed.usage !== undefined) {
                usageResolved = true;
                resolveUsage(parsed.usage);
              }
              doneSignalSeen = true;
              break;
            }
            newlineIndex = buffer.indexOf("\n");
          }
        }

        buffer += decoder.decode();
        if (!doneSignalSeen && buffer.trim().length > 0) {
          throwIfAborted(options.signal);
          const parsed = processLine(buffer);
          if (parsed.delta !== undefined && parsed.delta.length > 0) {
            hasContent = true;
            fullContent += parsed.delta;
            yield parsed.delta;
          }
          if (parsed.done && parsed.usage !== undefined && !usageResolved) {
            usageResolved = true;
            resolveUsage(parsed.usage);
          }
          doneSignalSeen = parsed.done;
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw createTransportCancelledError();
        }
        throw error;
      } finally {
        reader.releaseLock();
      }

      if (!usageResolved) {
        resolveUsage(estimateUsageReport(options.messages, fullContent));
      }

      if (!hasContent) {
        throw new ProviderUnavailableError(
          "Ollama stream did not include assistant content.",
          {
            details: {
              providerId: options.provider.providerId,
              endpoint: baseUrl,
            },
          },
        );
      }
    };

    return { stream: stream(), usage: usagePromise };
  }

  const summarizedAttempts = networkErrors
    .slice(0, 3)
    .map((item) => item.slice(0, 200))
    .join(" | ");
  throw new TransientNetworkError(
    summarizedAttempts.length > 0
      ? `Unable to reach Ollama runtime at configured endpoint(s): ${summarizedAttempts}`
      : "Unable to reach Ollama runtime at configured endpoint(s).",
    {
      details: {
        providerId: options.provider.providerId,
        attempts: networkErrors.join(" | ").slice(0, 1_000),
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Persistent native messaging port (connectNative)
// ---------------------------------------------------------------------------

type PendingBridgeRequest = {
  resolve: (response: unknown) => void;
  reject: (error: Error) => void;
  onChunk?: (chunk: string) => void;
};

/**
 * Manages a persistent `connectNative` port to the bridge process.
 * All messages are tagged with `_bridgeRequestId` and the bridge echoes
 * the tag in every response (including intermediate stream chunks).
 * This avoids spawning a new bridge process for each `sendNativeMessage`
 * call and enables real-time streaming through the same pipe.
 */
class PersistentBridgePort {
  #port: chrome.runtime.Port | null = null;
  #pending = new Map<string, PendingBridgeRequest>();
  #nextId = 0;
  #hostName: string;

  constructor(hostName: string) {
    this.#hostName = hostName;
  }

  #ensurePort(): chrome.runtime.Port {
    if (this.#port !== null) {
      return this.#port;
    }
    const port = chrome.runtime.connectNative(this.#hostName);
    port.onMessage.addListener((msg: unknown) => this.#onMessage(msg));
    port.onDisconnect.addListener(() => this.#onDisconnect());
    this.#port = port;
    return port;
  }

  #onMessage(response: unknown): void {
    if (!isRecord(response)) {
      return;
    }
    const requestId = response["_bridgeRequestId"];
    if (typeof requestId !== "string") {
      return;
    }

    const pending = this.#pending.get(requestId);
    if (pending === undefined) {
      return;
    }

    // Intermediate streaming chunk — forward and keep waiting.
    if (
      response["type"] === "cloud.chat.stream.chunk" ||
      response["type"] === "cli.chat.stream.chunk"
    ) {
      if (pending.onChunk !== undefined) {
        const delta =
          typeof response["delta"] === "string" ? response["delta"] : "";
        if (delta.length > 0) {
          pending.onChunk(delta);
        }
      }
      return;
    }

    // Terminal response — resolve the pending request.
    this.#pending.delete(requestId);
    // Strip internal tag before returning to caller.
    const { _bridgeRequestId: _, ...cleanResponse } = response;
    pending.resolve(cleanResponse);
  }

  #onDisconnect(): void {
    const error = new ProviderUnavailableError(
      "Native bridge port disconnected.",
      { details: { hostName: this.#hostName } },
    );
    this.#port = null;
    for (const [, pending] of this.#pending) {
      pending.reject(error);
    }
    this.#pending.clear();
  }

  /** Send a one-shot request-response message. */
  send(message: Record<string, unknown>): Promise<unknown> {
    const port = this.#ensurePort();
    const requestId = `_brq.${String(++this.#nextId)}.${Date.now().toString(36)}`;
    return new Promise<unknown>((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject });
      try {
        port.postMessage({ ...message, _bridgeRequestId: requestId });
      } catch (error) {
        this.#pending.delete(requestId);
        reject(
          new ProviderUnavailableError("Failed to send message to native bridge.", {
            ...(error instanceof Error ? { cause: error } : {}),
            details: { hostName: this.#hostName },
          }),
        );
      }
    });
  }

  /**
   * Send a request that may produce intermediate stream chunks before the
   * terminal response.  Each chunk is forwarded to `onChunk`.
   */
  sendWithChunks(
    message: Record<string, unknown>,
    onChunk: (chunk: string) => void,
  ): Promise<unknown> {
    const port = this.#ensurePort();
    const requestId = `_brq.${String(++this.#nextId)}.${Date.now().toString(36)}`;
    return new Promise<unknown>((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject, onChunk });
      try {
        port.postMessage({ ...message, _bridgeRequestId: requestId });
      } catch (error) {
        this.#pending.delete(requestId);
        reject(
          new ProviderUnavailableError(
            "Failed to send streaming message to native bridge.",
            {
              ...(error instanceof Error ? { cause: error } : {}),
              details: { hostName: this.#hostName },
            },
          ),
        );
      }
    });
  }

  dispose(): void {
    if (this.#port !== null) {
      try {
        this.#port.disconnect();
      } catch {
        // best effort
      }
      this.#port = null;
    }
    for (const [, pending] of this.#pending) {
      pending.reject(
        new ProviderUnavailableError("Bridge port disposed.", {
          details: { hostName: this.#hostName },
        }),
      );
    }
    this.#pending.clear();
  }
}

const BRIDGE_PORT_SINGLETON_KEY = "__byom.bridge.persistent_port.v1";
const DEFAULT_BRIDGE_HOST_NAME = "com.byom.bridge";

function getSharedBridgePort(): PersistentBridgePort | undefined {
  if (
    typeof chrome === "undefined" ||
    typeof chrome.runtime?.connectNative !== "function"
  ) {
    return undefined;
  }
  const globalState = globalThis as Record<string, unknown>;
  let port = globalState[BRIDGE_PORT_SINGLETON_KEY] as
    | PersistentBridgePort
    | undefined;
  if (port === undefined) {
    port = new PersistentBridgePort(DEFAULT_BRIDGE_HOST_NAME);
    globalState[BRIDGE_PORT_SINGLETON_KEY] = port;
  }
  return port;
}

function createDefaultNativeMessenger(): (
  hostName: string,
  message: Record<string, unknown>,
) => Promise<unknown> {
  return async (hostName, message) => {
    if (typeof chrome === "undefined") {
      throw new ProviderUnavailableError(
        "Native bridge is unavailable because chrome runtime is missing.",
      );
    }

    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendNativeMessage(
          hostName,
          message,
          (response: unknown) => {
            const runtimeError = chrome.runtime.lastError;
            if (runtimeError !== undefined) {
              reject(
                new ProviderUnavailableError(
                  runtimeError.message ?? "Native messaging host request failed.",
                  {
                    details: { hostName },
                  },
                ),
              );
              return;
            }

            resolve(response);
          },
        );
      } catch (error) {
        const causeError = error instanceof Error ? error : undefined;
        reject(
          new ProviderUnavailableError("Failed to call native messaging host.", {
            ...(causeError !== undefined ? { cause: causeError } : {}),
            details: { hostName },
          }),
        );
      }
    });
  };
}

async function runCliBridgeCompletion(options: {
  provider: CompletionProvider;
  messages: readonly ChatMessage[];
  timeoutMs: number;
  correlationId: string;
  sessionId?: string;
  bridgeHandshake?: Readonly<{
    extensionId: string;
    resolveBridgeSharedSecret: (
      hostName: string,
    ) => Promise<string | Uint8Array | undefined | null>;
    resolveBridgePairingHandle?: (hostName: string) => Promise<string | undefined | null>;
    now: () => Date;
  }>;
  sendNativeMessage: (
    hostName: string,
    message: Record<string, unknown>,
  ) => Promise<unknown>;
}): Promise<string> {
  const hostName = normalizeText(
    options.provider.metadata["nativeHostName"] ?? "com.byom.bridge",
    "com.byom.bridge",
  );
  const cliType = normalizeText(
    options.provider.metadata["cliType"] ?? "copilot-cli",
    "copilot-cli",
  );
  const thinkingLevel = normalizeText(
    options.provider.metadata["thinkingLevel"] ?? "",
    "",
  );
  if (!/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(hostName)) {
    throw new ProviderUnavailableError("Native bridge host name is invalid.", {
      details: { hostName },
    });
  }

  if (options.bridgeHandshake !== undefined) {
    await ensureBridgeHandshakeSession({
      hostName,
      extensionId: options.bridgeHandshake.extensionId,
      sendNativeMessage: options.sendNativeMessage,
      resolveBridgeSharedSecret: options.bridgeHandshake.resolveBridgeSharedSecret,
      ...(options.bridgeHandshake.resolveBridgePairingHandle !== undefined
        ? { resolveBridgePairingHandle: options.bridgeHandshake.resolveBridgePairingHandle }
        : {}),
      now: options.bridgeHandshake.now,
    });
  }

  const sessionId = normalizeText(options.sessionId ?? "", "");
  const cacheKey =
    sessionId.length > 0
      ? createCliSessionCacheKey({
        hostName,
        providerId: options.provider.providerId,
        modelId: options.provider.modelId,
        sessionId,
      })
      : undefined;
  const nowMs = Date.now();
  const cachedSession =
    cacheKey !== undefined ? cliSessionCache.get(cacheKey) : undefined;
  const resumeSessionId =
    cachedSession !== undefined && cachedSession.expiresAtMs > nowMs
      ? cachedSession.cliSessionId
      : undefined;
  if (
    cacheKey !== undefined &&
    cachedSession !== undefined &&
    cachedSession.expiresAtMs <= nowMs
  ) {
    cliSessionCache.delete(cacheKey);
  }
  const executionResponse = await options.sendNativeMessage(hostName, {
    type: "cli.chat.execute",
    correlationId: options.correlationId,
    ...(sessionId.length > 0 ? { sessionId } : {}),
    ...(resumeSessionId !== undefined ? { resumeSessionId } : {}),
    providerId: options.provider.providerId,
    modelId: options.provider.modelId,
    cliType,
    ...(thinkingLevel.length > 0 ? { thinkingLevel } : {}),
    messages: options.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    timeoutMs: options.timeoutMs,
  });

  if (!isRecord(executionResponse)) {
    throw new ProviderUnavailableError(
      "Native bridge returned an invalid CLI execution response.",
      {
        details: {
          hostName,
          providerId: options.provider.providerId,
          modelId: options.provider.modelId,
        },
      },
    );
  }

  if (executionResponse["type"] === "error") {
    const reasonCode =
      typeof executionResponse["reasonCode"] === "string"
        ? executionResponse["reasonCode"]
        : "provider.unavailable";
    const message =
      typeof executionResponse["message"] === "string"
        ? executionResponse["message"]
        : "CLI execution failed in native bridge.";
    const details = {
      hostName,
      providerId: options.provider.providerId,
      modelId: options.provider.modelId,
      ...toProtocolErrorDetails(executionResponse["details"]),
    };
    if (reasonCode === "transport.timeout") {
      throw new TimeoutError(message, { details });
    }

    if (reasonCode === "transport.cancelled") {
      throw new ProtocolError(message, {
        machineCode: PROTOCOL_MACHINE_CODES.TRANSIENT_NETWORK,
        reasonCode: "transport.cancelled",
        retryable: true,
        details,
      });
    }

    if (reasonCode === "request.invalid") {
      throw new EnvelopeValidationError(message, {
        reasonCode: "request.invalid",
        details,
      });
    }

    if (reasonCode === "transport.transient_failure") {
      throw new TransientNetworkError(message, { details });
    }

    throw new ProviderUnavailableError(message, { details });
  }

  if (executionResponse["type"] !== "cli.chat.result") {
    throw new ProviderUnavailableError(
      "Native bridge returned an unexpected CLI execution payload.",
      {
        details: {
          hostName,
          providerId: options.provider.providerId,
          modelId: options.provider.modelId,
        },
      },
    );
  }

  const responseCorrelationId = executionResponse["correlationId"];
  if (
    typeof responseCorrelationId === "string" &&
    responseCorrelationId !== options.correlationId
  ) {
    throw new ProviderUnavailableError(
      "Native bridge returned mismatched correlation ID for CLI execution.",
      {
        details: {
          hostName,
          expectedCorrelationId: options.correlationId,
          receivedCorrelationId: responseCorrelationId,
        },
      },
    );
  }

  const content =
    typeof executionResponse["content"] === "string"
      ? executionResponse["content"].trim()
      : "";
  if (content.length === 0) {
    throw new ProviderUnavailableError(
      "Native bridge CLI execution returned empty assistant content.",
      {
        details: {
          hostName,
          providerId: options.provider.providerId,
          modelId: options.provider.modelId,
        },
      },
    );
  }

  if (cacheKey !== undefined) {
    const responseCliSessionId =
      typeof executionResponse["cliSessionId"] === "string"
        ? executionResponse["cliSessionId"].trim()
        : "";
    if (responseCliSessionId.length > 0) {
      cliSessionCache.set(cacheKey, {
        cliSessionId: responseCliSessionId,
        expiresAtMs: Date.now() + CLI_SESSION_CACHE_TTL_MS,
      });
      while (cliSessionCache.size > MAX_CLI_SESSION_CACHE_ENTRIES) {
        const oldest = cliSessionCache.keys().next().value as string | undefined;
        if (oldest === undefined) {
          break;
        }
        cliSessionCache.delete(oldest);
      }
    }
  }

  return content;
}

async function runCliBridgeCompletionStream(options: {
  provider: CompletionProvider;
  messages: readonly ChatMessage[];
  timeoutMs: number;
  correlationId: string;
  sessionId?: string;
  bridgeHandshake?: Readonly<{
    extensionId: string;
    resolveBridgeSharedSecret: (
      hostName: string,
    ) => Promise<string | Uint8Array | undefined | null>;
    resolveBridgePairingHandle?: (hostName: string) => Promise<string | undefined | null>;
    now: () => Date;
  }>;
  sendNativeMessage: (
    hostName: string,
    message: Record<string, unknown>,
  ) => Promise<unknown>;
  sendPortMessage?: (message: Record<string, unknown>) => Promise<unknown>;
  sendStreamingMessage?: (
    message: Record<string, unknown>,
    onChunk: (chunk: string) => void,
  ) => Promise<unknown>;
}): Promise<AsyncIterable<string>> {
  const bridgePort = options.sendStreamingMessage;
  if (bridgePort === undefined) {
    const completion = await runCliBridgeCompletion(options);
    return createSingleDeltaStream(completion);
  }

  // With a persistent bridge port, perform handshake and then send a
  // streaming CLI request. Intermediate chunks arrive via onChunk.
  const hostName = normalizeText(
    options.provider.metadata["nativeHostName"] ?? "com.byom.bridge",
    "com.byom.bridge",
  );
  const cliType = normalizeText(
    options.provider.metadata["cliType"] ?? "copilot-cli",
    "copilot-cli",
  );
  const thinkingLevel = normalizeText(
    options.provider.metadata["thinkingLevel"] ?? "",
    "",
  );

  // When a persistent port is available, route handshake through it so the
  // session lives in the same bridge process as the streaming call.
  const portMessenger: typeof options.sendNativeMessage =
    options.sendPortMessage !== undefined
      ? async (_hostName, message) => options.sendPortMessage!(message)
      : options.sendNativeMessage;

  if (options.bridgeHandshake !== undefined) {
    await ensureBridgeHandshakeSession({
      hostName,
      extensionId: options.bridgeHandshake.extensionId,
      sendNativeMessage: portMessenger,
      resolveBridgeSharedSecret: options.bridgeHandshake.resolveBridgeSharedSecret,
      ...(options.bridgeHandshake.resolveBridgePairingHandle !== undefined
        ? { resolveBridgePairingHandle: options.bridgeHandshake.resolveBridgePairingHandle }
        : {}),
      now: options.bridgeHandshake.now,
    });
  }

  const sessionId = normalizeText(options.sessionId ?? "", "");
  const cacheKey =
    sessionId.length > 0
      ? createCliSessionCacheKey({
        hostName,
        providerId: options.provider.providerId,
        modelId: options.provider.modelId,
        sessionId,
      })
      : undefined;
  const nowMs = Date.now();
  const cachedSession =
    cacheKey !== undefined ? cliSessionCache.get(cacheKey) : undefined;
  const resumeSessionId =
    cachedSession !== undefined && cachedSession.expiresAtMs > nowMs
      ? cachedSession.cliSessionId
      : undefined;
  if (
    cacheKey !== undefined &&
    cachedSession !== undefined &&
    cachedSession.expiresAtMs <= nowMs
  ) {
    cliSessionCache.delete(cacheKey);
  }

  return (async function* (): AsyncIterable<string> {
    const queue: string[] = [];
    const waiters: Array<(value: string | null) => void> = [];
    let streamDone = false;

    const onChunk = (delta: string): void => {
      const waiter = waiters.shift();
      if (waiter !== undefined) {
        waiter(delta);
        return;
      }
      queue.push(delta);
    };

    const streamPromise = bridgePort(
      {
        type: "cli.chat.execute",
        correlationId: options.correlationId,
        ...(sessionId.length > 0 ? { sessionId } : {}),
        ...(resumeSessionId !== undefined ? { resumeSessionId } : {}),
        providerId: options.provider.providerId,
        modelId: options.provider.modelId,
        cliType,
        ...(thinkingLevel.length > 0 ? { thinkingLevel } : {}),
        messages: options.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        timeoutMs: options.timeoutMs,
        streamRequested: true,
      },
      onChunk,
    )
      .then((response) => {
        streamDone = true;
        const waiter = waiters.shift();
        if (waiter !== undefined) {
          waiter(null);
        }

        // Cache CLI session ID for continuations.
        if (isRecord(response) && response["type"] === "cli.chat.result") {
          const cliSessionId =
            typeof response["cliSessionId"] === "string"
              ? response["cliSessionId"]
              : undefined;
          if (cacheKey !== undefined && cliSessionId !== undefined) {
            cliSessionCache.set(cacheKey, {
              cliSessionId,
              expiresAtMs: Date.now() + CLI_SESSION_CACHE_TTL_MS,
            });
            while (cliSessionCache.size > MAX_CLI_SESSION_CACHE_ENTRIES) {
              const oldest = cliSessionCache.keys().next().value as string | undefined;
              if (oldest === undefined) {
                break;
              }
              cliSessionCache.delete(oldest);
            }
          }
        }
      })
      .catch((error: unknown) => {
        streamDone = true;
        const waiter = waiters.shift();
        if (waiter !== undefined) {
          waiter(null);
        }
        throw error;
      });

    while (!streamDone || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift() as string;
        continue;
      }
      if (streamDone) {
        break;
      }
      const next = await new Promise<string | null>((resolve) => {
        waiters.push(resolve);
      });
      if (next === null) {
        break;
      }
      yield next;
    }

    await streamPromise;
  })();
}

async function withAbortSignal<T>(
  operation: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (signal === undefined) {
    return operation;
  }

  if (signal.aborted) {
    throw createTransportCancelledError();
  }

  let abortHandler: (() => void) | undefined;
  const abortPromise = new Promise<T>((_resolve, reject) => {
    abortHandler = () => {
      reject(createTransportCancelledError());
    };
    signal.addEventListener("abort", abortHandler, { once: true });
  });

  try {
    return await Promise.race([operation, abortPromise]);
  } finally {
    if (abortHandler !== undefined) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}

async function resolveCompletion(options: {
  provider: CompletionProvider;
  messages: readonly ChatMessage[];
  timeoutMs: number;
  correlationId: string;
  requestId: string;
  nonce: string;
  origin: string;
  sessionId?: string;
  fetchImpl: typeof fetch;
  now: () => Date;
  extensionId?: string;
  resolveBridgeSharedSecret?: (
    hostName: string,
  ) => Promise<string | Uint8Array | undefined | null>;
  resolveBridgePairingHandle?: (hostName: string) => Promise<string | undefined | null>;
  sendNativeMessage: (
    hostName: string,
    message: Record<string, unknown>,
  ) => Promise<unknown>;
}): Promise<CompletionResult> {
  switch (options.provider.providerType) {
    case "local":
      return runOllamaCompletion({
        provider: options.provider,
        messages: options.messages,
        timeoutMs: options.timeoutMs,
        fetchImpl: options.fetchImpl,
      });

    case "cloud": {
      if (
        options.extensionId === undefined ||
        options.resolveBridgeSharedSecret === undefined
      ) {
        throw new ProviderUnavailableError(
          `Provider "${options.provider.providerName}" requires bridge handshake configuration for secure cloud execution.`,
          {
            details: {
              providerId: options.provider.providerId,
            },
          },
        );
      }

      const content = await runCloudBridgeCompletion({
        provider: options.provider,
        messages: options.messages,
        correlationId: options.correlationId,
        timeoutMs: options.timeoutMs,
        requestId: options.requestId,
        nonce: options.nonce,
        origin: options.origin,
        extensionId: options.extensionId,
        resolveBridgeSharedSecret: options.resolveBridgeSharedSecret,
        ...(options.resolveBridgePairingHandle !== undefined
          ? { resolveBridgePairingHandle: options.resolveBridgePairingHandle }
          : {}),
        sendNativeMessage: options.sendNativeMessage,
        now: options.now,
      });
      return { content, usage: estimateUsageReport(options.messages, content) };
    }

    case "cli": {
      const content = await runCliBridgeCompletion({
        provider: options.provider,
        messages: options.messages,
        timeoutMs: options.timeoutMs,
        correlationId: options.correlationId,
        ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
        ...(options.extensionId !== undefined &&
          options.resolveBridgeSharedSecret !== undefined
          ? {
            bridgeHandshake: {
              extensionId: options.extensionId,
              resolveBridgeSharedSecret: options.resolveBridgeSharedSecret,
              ...(options.resolveBridgePairingHandle !== undefined
                ? {
                  resolveBridgePairingHandle:
                    options.resolveBridgePairingHandle,
                }
                : {}),
              now: options.now,
            },
          }
          : {}),
        sendNativeMessage: options.sendNativeMessage,
      });
      return { content, usage: estimateUsageReport(options.messages, content) };
    }

    default:
      throw new ProviderUnavailableError("Unsupported provider type.", {
        details: {
          providerId: options.provider.providerId,
        },
      });
  }
}

async function resolveCompletionStream(options: {
  provider: CompletionProvider;
  messages: readonly ChatMessage[];
  timeoutMs: number;
  correlationId: string;
  requestId: string;
  nonce: string;
  origin: string;
  sessionId?: string;
  fetchImpl: typeof fetch;
  now: () => Date;
  extensionId?: string;
  resolveBridgeSharedSecret?: (
    hostName: string,
  ) => Promise<string | Uint8Array | undefined | null>;
  resolveBridgePairingHandle?: (hostName: string) => Promise<string | undefined | null>;
  sendNativeMessage: (
    hostName: string,
    message: Record<string, unknown>,
  ) => Promise<unknown>;
  signal?: AbortSignal;
}): Promise<CompletionStreamResult> {
  switch (options.provider.providerType) {
    case "local":
      return runOllamaCompletionStream({
        provider: options.provider,
        messages: options.messages,
        timeoutMs: options.timeoutMs,
        fetchImpl: options.fetchImpl,
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      });

    case "cloud": {
      if (
        options.extensionId === undefined ||
        options.resolveBridgeSharedSecret === undefined
      ) {
        throw new ProviderUnavailableError(
          `Provider "${options.provider.providerName}" requires bridge handshake configuration for secure cloud execution.`,
          {
            details: {
              providerId: options.provider.providerId,
            },
          },
        );
      }

      const innerStream = await withAbortSignal(
        runCloudBridgeCompletionStream({
          provider: options.provider,
          messages: options.messages,
          correlationId: options.correlationId,
          timeoutMs: options.timeoutMs,
          requestId: options.requestId,
          nonce: options.nonce,
          origin: options.origin,
          extensionId: options.extensionId,
          resolveBridgeSharedSecret: options.resolveBridgeSharedSecret,
          ...(options.resolveBridgePairingHandle !== undefined
            ? { resolveBridgePairingHandle: options.resolveBridgePairingHandle }
            : {}),
          sendNativeMessage: options.sendNativeMessage,
          ...(() => {
            const bp = getSharedBridgePort();
            return bp !== undefined
              ? {
                sendPortMessage: (msg: Record<string, unknown>) => bp.send(msg),
                sendStreamingMessage: (msg: Record<string, unknown>, onChunk: (c: string) => void) => bp.sendWithChunks(msg, onChunk),
              }
              : {};
          })(),
          now: options.now,
        }),
        options.signal,
      );
      let fullContent = "";
      let resolveUsage!: (r: UsageReport) => void;
      const usagePromise = new Promise<UsageReport>((resolve) => { resolveUsage = resolve; });
      const wrappedStream = async function* (): AsyncIterable<string> {
        for await (const delta of innerStream) {
          fullContent += delta;
          yield delta;
        }
        resolveUsage(estimateUsageReport(options.messages, fullContent));
      };
      return { stream: wrappedStream(), usage: usagePromise };
    }

    case "cli": {
      const innerStream = await withAbortSignal(
        runCliBridgeCompletionStream({
          provider: options.provider,
          messages: options.messages,
          timeoutMs: options.timeoutMs,
          correlationId: options.correlationId,
          ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
          ...(options.extensionId !== undefined &&
            options.resolveBridgeSharedSecret !== undefined
            ? {
              bridgeHandshake: {
                extensionId: options.extensionId,
                resolveBridgeSharedSecret: options.resolveBridgeSharedSecret,
                ...(options.resolveBridgePairingHandle !== undefined
                  ? {
                    resolveBridgePairingHandle:
                      options.resolveBridgePairingHandle,
                  }
                  : {}),
                now: options.now,
              },
            }
            : {}),
          sendNativeMessage: options.sendNativeMessage,
          ...(() => {
            const bp = getSharedBridgePort();
            return bp !== undefined
              ? {
                sendPortMessage: (msg: Record<string, unknown>) => bp.send(msg),
                sendStreamingMessage: (msg: Record<string, unknown>, onChunk: (c: string) => void) => bp.sendWithChunks(msg, onChunk),
              }
              : {};
          })(),
        }),
        options.signal,
      );
      let fullContent = "";
      let resolveUsage!: (r: UsageReport) => void;
      const usagePromise = new Promise<UsageReport>((resolve) => { resolveUsage = resolve; });
      const wrappedStream = async function* (): AsyncIterable<string> {
        for await (const delta of innerStream) {
          fullContent += delta;
          yield delta;
        }
        resolveUsage(estimateUsageReport(options.messages, fullContent));
      };
      return { stream: wrappedStream(), usage: usagePromise };
    }

    default:
      throw new ProviderUnavailableError("Unsupported provider type.", {
        details: {
          providerId: options.provider.providerId,
        },
      });
  }
}

async function dispatchTransportRequest(options: {
  envelope: CanonicalEnvelope<unknown>;
  requestTimeoutMs?: number;
  storage: WalletStorageAdapter;
  dependencies: ResolvedRuntimeDependencies;
  usageService: TokenUsageService;
}): Promise<
  | ConnectResponsePayload
  | SelectProviderResponsePayload
  | ProviderListResponsePayload
  | ChatSendResponsePayload
> {
  const snapshot = await readWalletSnapshot(options.storage);

  // Load the connected app for this origin to enforce access controls
  const appsRaw = await options.storage.get(["byom.wallet.apps.v1"]);
  const apps = Array.isArray(appsRaw["byom.wallet.apps.v1"]) ? appsRaw["byom.wallet.apps.v1"] as unknown[] : [];
  const connectedApp = apps.find((a): a is Record<string, unknown> =>
    isRecord(a) && typeof a["origin"] === "string" && a["origin"] === options.envelope.origin && a["status"] === "active"
  ) ?? null;
  const appProviderIds: ReadonlySet<string> | null = connectedApp !== null && Array.isArray(connectedApp["enabledProviderIds"])
    ? new Set(connectedApp["enabledProviderIds"] as string[])
    : null;
  const appModelIds: ReadonlySet<string> | null = connectedApp !== null && Array.isArray(connectedApp["enabledModelIds"])
    ? new Set(connectedApp["enabledModelIds"] as string[])
    : null;

  switch (options.envelope.capability) {
    case "session.create": {
      if (isRecord(options.envelope.payload) && typeof options.envelope.payload["appId"] === "string") {
        const response: ConnectResponsePayload = {
          capabilities: DEFAULT_CAPABILITIES,
        };
        return response;
      }

      const selection = parseSelectionPayload(options.envelope.payload);
      // Enforce app-level access control on provider selection
      if (appProviderIds !== null && !appProviderIds.has(selection.providerId)) {
        throw new ProviderUnavailableError(
          `Provider "${selection.providerId}" is not enabled for this app.`,
          { details: { providerId: selection.providerId } },
        );
      }
      if (appModelIds !== null && !appModelIds.has(selection.modelId)) {
        throw new ProviderUnavailableError(
          `Model "${selection.modelId}" is not enabled for this app.`,
          { details: { providerId: selection.providerId, modelId: selection.modelId } },
        );
      }
      resolveProviderSelection(snapshot, selection.providerId, selection.modelId);
      await options.storage.set({
        [WALLET_KEY_ACTIVE]: {
          providerId: selection.providerId,
          modelId: selection.modelId,
        },
      });
      const response: SelectProviderResponsePayload = {
        providerId: selection.providerId,
        modelId: selection.modelId,
      };
      return response;
    }

    case "provider.list": {
      let descriptors = toProviderDescriptors(snapshot.providers);
      // Scope to app-enabled providers and models
      if (appProviderIds !== null) {
        descriptors = descriptors
          .filter((d) => appProviderIds.has(d.providerId))
          .map((d) => appModelIds !== null
            ? { ...d, models: d.models.filter((m) => appModelIds.has(m)) }
            : d
          );
      }
      const response: ProviderListResponsePayload = { providers: descriptors };
      return response;
    }

    case "chat.completions": {
      // Enforce app-level access control
      if (appProviderIds !== null && !appProviderIds.has(options.envelope.providerId)) {
        throw new ProviderUnavailableError(
          `Provider "${options.envelope.providerId}" is not enabled for this app.`,
          { details: { providerId: options.envelope.providerId } },
        );
      }
      if (appModelIds !== null && !appModelIds.has(options.envelope.modelId)) {
        throw new ProviderUnavailableError(
          `Model "${options.envelope.modelId}" is not enabled for this app.`,
          { details: { providerId: options.envelope.providerId, modelId: options.envelope.modelId } },
        );
      }
      const provider = resolveProviderSelection(
        snapshot,
        options.envelope.providerId,
        options.envelope.modelId,
      );
      const messages = parseChatMessages(options.envelope.payload as ChatSendPayload);
      const result = await resolveCompletion({
        provider,
        messages,
        timeoutMs: options.requestTimeoutMs ?? 90_000,
        correlationId: options.envelope.correlationId,
        requestId: options.envelope.requestId,
        nonce: options.envelope.nonce,
        origin: options.envelope.origin,
        sessionId: options.envelope.sessionId,
        fetchImpl: options.dependencies.fetchImpl,
        now: options.dependencies.now,
        ...(options.dependencies.extensionId !== undefined
          ? { extensionId: options.dependencies.extensionId }
          : {}),
        ...(options.dependencies.resolveBridgeSharedSecret !== undefined
          ? {
            resolveBridgeSharedSecret:
              options.dependencies.resolveBridgeSharedSecret,
          }
          : {}),
        ...(options.dependencies.resolveBridgePairingHandle !== undefined
          ? {
            resolveBridgePairingHandle:
              options.dependencies.resolveBridgePairingHandle,
          }
          : {}),
        sendNativeMessage: options.dependencies.sendNativeMessage,
      });

      void options.usageService.recordUsage({
        origin: options.envelope.origin,
        providerId: options.envelope.providerId,
        modelId: options.envelope.modelId,
        report: result.usage,
      });

      const response: ChatSendResponsePayload = {
        message: {
          role: "assistant",
          content: result.content,
        },
      };
      return response;
    }

    case "chat.stream":
      throw new EnvelopeValidationError(
        "chat.stream capability must be routed through transport.stream.",
        {
          reasonCode: "request.invalid",
          details: { capability: "chat.stream" },
        },
      );

    case "usage.query": {
      const usageSummary = await options.usageService.getUsageByOrigin(
        options.envelope.origin,
      );
      return usageSummary as unknown as ChatSendResponsePayload;
    }

    default:
      throw new EnvelopeValidationError("Capability is not supported by transport runtime.", {
        reasonCode: "protocol.unsupported_capability",
        details: { capability: options.envelope.capability },
      });
  }
}

function createTransportCancelledError(
  message = "Transport stream request cancelled.",
): ProtocolError {
  return new ProtocolError(message, {
    machineCode: PROTOCOL_MACHINE_CODES.TRANSIENT_NETWORK,
    reasonCode: "transport.cancelled",
    retryable: true,
  });
}

function throwIfAborted(signal: AbortSignal | undefined, message?: string): void {
  if (signal?.aborted === true) {
    throw createTransportCancelledError(message);
  }
}

async function resolveTransportStreamEnvelopeIterable(options: {
  envelope: CanonicalEnvelope<unknown>;
  requestTimeoutMs?: number;
  storage: WalletStorageAdapter;
  dependencies: ResolvedRuntimeDependencies;
  now: () => Date;
  signal?: AbortSignal;
}): Promise<AsyncIterable<CanonicalEnvelope<ChatStreamResponsePayload>>> {
  if (options.envelope.capability !== "chat.stream") {
    throw new EnvelopeValidationError(
      "request-stream action requires chat.stream capability.",
      {
        reasonCode: "request.invalid",
        details: { capability: options.envelope.capability },
      },
    );
  }

  throwIfAborted(options.signal);

  const snapshot = await readWalletSnapshot(options.storage);

  // Enforce app-level access control for streams
  const streamAppsRaw = await options.storage.get(["byom.wallet.apps.v1"]);
  const streamApps = Array.isArray(streamAppsRaw["byom.wallet.apps.v1"]) ? streamAppsRaw["byom.wallet.apps.v1"] as unknown[] : [];
  const streamApp = streamApps.find((a): a is Record<string, unknown> =>
    isRecord(a) && typeof a["origin"] === "string" && a["origin"] === options.envelope.origin && a["status"] === "active"
  ) ?? null;
  if (streamApp !== null) {
    const streamAppProviderIds = Array.isArray(streamApp["enabledProviderIds"]) ? new Set(streamApp["enabledProviderIds"] as string[]) : null;
    const streamAppModelIds = Array.isArray(streamApp["enabledModelIds"]) ? new Set(streamApp["enabledModelIds"] as string[]) : null;
    if (streamAppProviderIds !== null && !streamAppProviderIds.has(options.envelope.providerId)) {
      throw new ProviderUnavailableError(
        `Provider "${options.envelope.providerId}" is not enabled for this app.`,
        { details: { providerId: options.envelope.providerId } },
      );
    }
    if (streamAppModelIds !== null && !streamAppModelIds.has(options.envelope.modelId)) {
      throw new ProviderUnavailableError(
        `Model "${options.envelope.modelId}" is not enabled for this app.`,
        { details: { providerId: options.envelope.providerId, modelId: options.envelope.modelId } },
      );
    }
  }

  const provider = resolveProviderSelection(
    snapshot,
    options.envelope.providerId,
    options.envelope.modelId,
  );
  const messages = parseChatMessages(options.envelope.payload as ChatSendPayload);
  const completionResult = await resolveCompletionStream({
    provider,
    messages,
    timeoutMs: options.requestTimeoutMs ?? 90_000,
    correlationId: options.envelope.correlationId,
    requestId: options.envelope.requestId,
    nonce: options.envelope.nonce,
    origin: options.envelope.origin,
    sessionId: options.envelope.sessionId,
    fetchImpl: options.dependencies.fetchImpl,
    now: options.dependencies.now,
    ...(options.dependencies.extensionId !== undefined
      ? { extensionId: options.dependencies.extensionId }
      : {}),
    ...(options.dependencies.resolveBridgeSharedSecret !== undefined
      ? {
        resolveBridgeSharedSecret:
          options.dependencies.resolveBridgeSharedSecret,
      }
      : {}),
    ...(options.dependencies.resolveBridgePairingHandle !== undefined
      ? {
        resolveBridgePairingHandle:
          options.dependencies.resolveBridgePairingHandle,
      }
      : {}),
    sendNativeMessage: options.dependencies.sendNativeMessage,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });

  const { stream: completionStream, usage: usagePromise } = completionResult;

  const usageService = new TokenUsageService(options.storage);

  const stream = async function* (): AsyncIterable<
    CanonicalEnvelope<ChatStreamResponsePayload>
  > {
    let index = 0;
    for await (const delta of completionStream) {
      throwIfAborted(options.signal);
      if (delta.length === 0) {
        continue;
      }

      yield createResponseEnvelope(
        options.envelope,
        {
          type: "chunk",
          delta,
          index,
        },
        options.now(),
      ) as CanonicalEnvelope<ChatStreamResponsePayload>;
      index += 1;
    }

    // Record usage after stream completes, before signaling done.
    try {
      const usageReport = await usagePromise;
      void usageService.recordUsage({
        origin: options.envelope.origin,
        providerId: options.envelope.providerId,
        modelId: options.envelope.modelId,
        report: usageReport,
      });
    } catch {
      // Best effort — don't fail the stream on usage recording errors.
    }

    throwIfAborted(options.signal);
    yield createResponseEnvelope(
      options.envelope,
      { type: "done" },
      options.now(),
    ) as CanonicalEnvelope<ChatStreamResponsePayload>;
  };

  return stream();
}

async function dispatchTransportStreamRequest(options: {
  envelope: CanonicalEnvelope<unknown>;
  requestTimeoutMs?: number;
  storage: WalletStorageAdapter;
  dependencies: ResolvedRuntimeDependencies;
  now: () => Date;
  signal?: AbortSignal;
}): Promise<readonly CanonicalEnvelope<ChatStreamResponsePayload>[]> {
  const stream = await resolveTransportStreamEnvelopeIterable(options);
  const envelopes: CanonicalEnvelope<ChatStreamResponsePayload>[] = [];
  for await (const envelope of stream) {
    envelopes.push(envelope);
  }
  return envelopes;
}

function isTransportMessageEnvelope(
  message: unknown,
): message is TransportMessageEnvelope {
  return (
    isRecord(message) &&
    message["channel"] === "byom.transport" &&
    (message["action"] === "request" ||
      message["action"] === "request-stream" ||
      message["action"] === "disconnect")
  );
}

function isTransportStreamPortMessage(
  message: unknown,
): message is TransportStreamPortMessage {
  return (
    isRecord(message) &&
    message["channel"] === TRANSPORT_STREAM_CHANNEL &&
    typeof message["requestId"] === "string" &&
    (message["action"] === "start" || message["action"] === "cancel")
  );
}

function isTransportStreamPort(port: unknown): port is ChromeRuntimePortLike {
  return (
    isRecord(port) &&
    port["name"] === TRANSPORT_STREAM_PORT_NAME &&
    isRecord(port["onMessage"]) &&
    typeof port["onMessage"]["addListener"] === "function" &&
    isRecord(port["onDisconnect"]) &&
    typeof port["onDisconnect"]["addListener"] === "function" &&
    typeof port["postMessage"] === "function"
  );
}

export function createTransportMessageHandler(
  options: TransportMessageHandlerOptions,
): (message: unknown) => Promise<TransportActionResponse | null> {
  const now = options.dependencies?.now ?? (() => new Date());
  const fetchImpl =
    options.dependencies?.fetchImpl ??
    ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  const sendNativeMessage =
    options.dependencies?.sendNativeMessage ?? createDefaultNativeMessenger();
  const resolveBridgeSharedSecret = options.dependencies?.resolveBridgeSharedSecret;
  const resolveBridgePairingHandle = options.dependencies?.resolveBridgePairingHandle;
  const extensionId = options.dependencies?.extensionId;
  const usageService = new TokenUsageService(options.storage);

  return async (message: unknown): Promise<TransportActionResponse | null> => {
    if (!isTransportMessageEnvelope(message)) {
      return null;
    }

    const correlationId =
      isRecord(message.request?.envelope) &&
        typeof message.request?.envelope["correlationId"] === "string"
        ? message.request?.envelope["correlationId"]
        : undefined;

    try {
      if (message.action === "disconnect") {
        return { ok: true };
      }

      const parsedRequest = assertTransportRequestPayload(message.request);
      const envelope = parseEnvelope(parsedRequest.envelope);

      if (message.action === "request-stream") {
        const envelopes = await dispatchTransportStreamRequest({
          envelope,
          storage: options.storage,
          dependencies: {
            now,
            fetchImpl,
            sendNativeMessage,
            ...(resolveBridgeSharedSecret !== undefined
              ? { resolveBridgeSharedSecret }
              : {}),
            ...(resolveBridgePairingHandle !== undefined
              ? { resolveBridgePairingHandle }
              : {}),
            ...(typeof extensionId === "string" && extensionId.trim().length > 0
              ? { extensionId: extensionId.trim() }
              : {}),
          },
          now,
          ...(parsedRequest.timeoutMs !== undefined
            ? { requestTimeoutMs: parsedRequest.timeoutMs }
            : {}),
        });

        return {
          ok: true,
          envelopes,
        };
      }

      const responsePayload = await dispatchTransportRequest({
        envelope,
        storage: options.storage,
        usageService,
        dependencies: {
          now,
          fetchImpl,
          sendNativeMessage,
          ...(resolveBridgeSharedSecret !== undefined
            ? { resolveBridgeSharedSecret }
            : {}),
          ...(resolveBridgePairingHandle !== undefined
            ? { resolveBridgePairingHandle }
            : {}),
          ...(typeof extensionId === "string" && extensionId.trim().length > 0
            ? { extensionId: extensionId.trim() }
            : {}),
        },
        ...(parsedRequest.timeoutMs !== undefined
          ? { requestTimeoutMs: parsedRequest.timeoutMs }
          : {}),
      });

      return {
        ok: true,
        envelope: createResponseEnvelope(envelope, responsePayload, now()),
      };
    } catch (error) {
      return {
        ok: false,
        error: toTransportErrorPayload(error, correlationId),
      };
    }
  };
}

type ChromeRuntimeLike = Readonly<{
  id?: string;
  onConnect?: Readonly<{
    addListener(listener: (port: ChromeRuntimePortLike) => void): void;
  }>;
  onMessage: Readonly<{
    addListener(
      listener: (
        message: unknown,
        sender: unknown,
        sendResponse: (response: TransportActionResponse) => void,
      ) => boolean | void,
    ): void;
  }>;
  lastError?: Readonly<{ message?: string }>;
}>;

type ChromeRuntimePortLike = Readonly<{
  name: string;
  onMessage: Readonly<{
    addListener(listener: (message: unknown) => void): void;
  }>;
  onDisconnect: Readonly<{
    addListener(listener: () => void): void;
  }>;
  postMessage(message: unknown): void;
  disconnect?: () => void;
}>;

type ChromeStorageAreaLike = Readonly<{
  get(
    keys: readonly string[],
    callback: (items: Record<string, unknown>) => void,
  ): void;
  set(
    items: Record<string, unknown>,
    callback?: () => void,
  ): void;
}>;

function createChromeStorageAdapter(
  runtime: ChromeRuntimeLike,
  storage: ChromeStorageAreaLike,
): WalletStorageAdapter {
  return {
    get(keys): Promise<Record<string, unknown>> {
      return new Promise((resolve, reject) => {
        storage.get(keys, (items) => {
          const runtimeError = runtime.lastError;
          if (runtimeError !== undefined) {
            reject(
              new Error(runtimeError.message ?? "chrome.storage.local.get failed."),
            );
            return;
          }
          resolve(items);
        });
      });
    },
    set(items): Promise<void> {
      return new Promise((resolve, reject) => {
        storage.set(items, () => {
          const runtimeError = runtime.lastError;
          if (runtimeError !== undefined) {
            reject(
              new Error(runtimeError.message ?? "chrome.storage.local.set failed."),
            );
            return;
          }
          resolve();
        });
      });
    },
  };
}

function createDefaultTransportRuntimeDependencies(options: {
  runtime: ChromeRuntimeLike;
  storage: WalletStorageAdapter;
}): RuntimeDependencies {
  const extensionId =
    typeof options.runtime.id === "string" && options.runtime.id.trim().length > 0
      ? options.runtime.id.trim()
      : undefined;

  return {
    ...(extensionId !== undefined ? { extensionId } : {}),
    resolveBridgeSharedSecret: async (hostName: string) => {
      const state = await options.storage.get([
        WALLET_KEY_BRIDGE_SHARED_SECRET,
        BRIDGE_PAIRING_STATE_STORAGE_KEY,
      ]);
      if (extensionId !== undefined) {
        const pairingState = parseBridgePairingState(
          state[BRIDGE_PAIRING_STATE_STORAGE_KEY],
        );
        if (
          pairingState !== undefined &&
          pairingState.extensionId === extensionId &&
          pairingState.hostName === hostName
        ) {
          const unwrapped = await unwrapPairingKeyMaterial({
            pairingState,
            runtimeId: extensionId,
          });
          if (unwrapped !== undefined) {
            return unwrapped.pairingKeyHex;
          }
        }
      }
      const rawSecret = state[WALLET_KEY_BRIDGE_SHARED_SECRET];
      return typeof rawSecret === "string" && rawSecret.trim().length > 0
        ? rawSecret.trim()
        : undefined;
    },
    resolveBridgePairingHandle: async (hostName: string) => {
      if (extensionId === undefined) {
        return undefined;
      }
      const state = await options.storage.get([BRIDGE_PAIRING_STATE_STORAGE_KEY]);
      const pairingState = parseBridgePairingState(
        state[BRIDGE_PAIRING_STATE_STORAGE_KEY],
      );
      if (
        pairingState === undefined ||
        pairingState.extensionId !== extensionId ||
        pairingState.hostName !== hostName
      ) {
        return undefined;
      }
      return pairingState.pairingHandle;
    },
  };
}

type ExtensionGlobalState = typeof globalThis & Record<string, unknown>;
const TRANSPORT_MESSAGE_LISTENER_FLAG = "__byom.transport.listener.registered.v1";
const TRANSPORT_STREAM_PORT_LISTENER_FLAG =
  "__byom.transport.stream-port.listener.registered.v1";

export function registerDefaultTransportMessageListener(options: {
  reportError?: (error: Error) => void;
} = {}): void {
  const reportError =
    options.reportError ??
    ((error: Error) => {
      console.error("BYOM transport message handler failed", error);
    });

  if (typeof chrome === "undefined") {
    return;
  }

  const runtime = chrome.runtime as unknown as ChromeRuntimeLike | undefined;
  const storageLocal = chrome.storage?.local as unknown as
    | ChromeStorageAreaLike
    | undefined;
  if (runtime === undefined || storageLocal === undefined) {
    return;
  }

  const globalState = globalThis as ExtensionGlobalState;
  if (globalState[TRANSPORT_MESSAGE_LISTENER_FLAG] === true) {
    return;
  }

  const storage = createChromeStorageAdapter(runtime, storageLocal);
  const dependencies = createDefaultTransportRuntimeDependencies({
    runtime,
    storage,
  });
  const handleTransportMessage = createTransportMessageHandler({
    storage,
    dependencies,
  });

  runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isTransportMessageEnvelope(message)) {
      return false;
    }

    void handleTransportMessage(message)
      .then((response) => {
        sendResponse(
          response ?? {
            ok: false,
            error: {
              message: "Transport action failed unexpectedly.",
              machineCode: PROTOCOL_MACHINE_CODES.TRANSIENT_NETWORK,
              reasonCode: "transport.transient_failure",
              retryable: true,
            },
          },
        );
      })
      .catch((error: unknown) => {
        const errorObject = error instanceof Error ? error : new Error(String(error));
        reportError(errorObject);
        sendResponse({
          ok: false,
          error: {
            message: "Transport action failed unexpectedly.",
            machineCode: PROTOCOL_MACHINE_CODES.TRANSIENT_NETWORK,
            reasonCode: "transport.transient_failure",
            retryable: true,
          },
        });
      });

    return true;
  });

  globalState[TRANSPORT_MESSAGE_LISTENER_FLAG] = true;
}

export function registerDefaultTransportStreamPortListener(options: {
  reportError?: (error: Error) => void;
} = {}): void {
  const reportError =
    options.reportError ??
    ((error: Error) => {
      console.error("BYOM transport stream port handler failed", error);
    });

  if (typeof chrome === "undefined") {
    return;
  }

  const runtime = chrome.runtime as unknown as ChromeRuntimeLike | undefined;
  const storageLocal = chrome.storage?.local as unknown as
    | ChromeStorageAreaLike
    | undefined;
  if (
    runtime === undefined ||
    storageLocal === undefined ||
    runtime.onConnect === undefined
  ) {
    return;
  }

  const globalState = globalThis as ExtensionGlobalState;
  if (globalState[TRANSPORT_STREAM_PORT_LISTENER_FLAG] === true) {
    return;
  }

  const storage = createChromeStorageAdapter(runtime, storageLocal);
  const dependencies = createDefaultTransportRuntimeDependencies({
    runtime,
    storage,
  });
  const now = dependencies.now ?? (() => new Date());
  const fetchImpl =
    dependencies.fetchImpl ??
    ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  const sendNativeMessage =
    dependencies.sendNativeMessage ?? createDefaultNativeMessenger();
  const extensionId = dependencies.extensionId;
  const resolveBridgeSharedSecret = dependencies.resolveBridgeSharedSecret;
  const resolveBridgePairingHandle = dependencies.resolveBridgePairingHandle;

  runtime.onConnect.addListener((port) => {
    if (!isTransportStreamPort(port)) {
      return;
    }

    let portDisconnected = false;
    const inFlight = new Map<string, AbortController>();

    const postToPort = (event: TransportStreamPortEvent): boolean => {
      if (portDisconnected) {
        return false;
      }
      try {
        port.postMessage(event);
        return true;
      } catch (error) {
        const errorObject = error instanceof Error ? error : new Error(String(error));
        reportError(errorObject);
        return false;
      }
    };

    const cancelRequest = (requestId: string): void => {
      const controller = inFlight.get(requestId);
      if (controller === undefined) {
        void postToPort({
          channel: TRANSPORT_STREAM_CHANNEL,
          requestId,
          event: "cancelled",
        });
        return;
      }
      controller.abort();
    };

    const startRequest = async (message: TransportStreamPortMessage): Promise<void> => {
      if (portDisconnected) {
        return;
      }

      if (inFlight.has(message.requestId)) {
        void postToPort({
          channel: TRANSPORT_STREAM_CHANNEL,
          requestId: message.requestId,
          event: "error",
          error: toTransportErrorPayload(
            new EnvelopeValidationError("Stream requestId is already active.", {
              reasonCode: "request.invalid",
              details: { requestId: message.requestId },
            }),
            undefined,
          ),
        });
        return;
      }

      const requestCorrelationId =
        isRecord(message.request?.envelope) &&
          typeof message.request?.envelope["correlationId"] === "string"
          ? message.request?.envelope["correlationId"]
          : undefined;

      let parsedRequest: Readonly<{ envelope: unknown; timeoutMs?: number }>;
      let envelope: CanonicalEnvelope<unknown>;
      try {
        parsedRequest = assertTransportRequestPayload(message.request);
        envelope = parseEnvelope(parsedRequest.envelope);
      } catch (error) {
        void postToPort({
          channel: TRANSPORT_STREAM_CHANNEL,
          requestId: message.requestId,
          event: "error",
          error: toTransportErrorPayload(error, requestCorrelationId),
        });
        return;
      }

      const abortController = new AbortController();
      inFlight.set(message.requestId, abortController);

      if (
        !postToPort({
          channel: TRANSPORT_STREAM_CHANNEL,
          requestId: message.requestId,
          event: "start",
        })
      ) {
        abortController.abort();
        inFlight.delete(message.requestId);
        return;
      }

      try {
        const stream = await resolveTransportStreamEnvelopeIterable({
          envelope,
          storage,
          dependencies: {
            now,
            fetchImpl,
            sendNativeMessage,
            ...(resolveBridgeSharedSecret !== undefined
              ? { resolveBridgeSharedSecret }
              : {}),
            ...(resolveBridgePairingHandle !== undefined
              ? { resolveBridgePairingHandle }
              : {}),
            ...(typeof extensionId === "string" && extensionId.trim().length > 0
              ? { extensionId: extensionId.trim() }
              : {}),
          },
          now,
          ...(parsedRequest.timeoutMs !== undefined
            ? { requestTimeoutMs: parsedRequest.timeoutMs }
            : {}),
          signal: abortController.signal,
        });

        for await (const streamEnvelope of stream) {
          const payloadType = streamEnvelope.payload.type;
          const delivered = postToPort({
            channel: TRANSPORT_STREAM_CHANNEL,
            requestId: message.requestId,
            event: payloadType === "done" ? "done" : "chunk",
            envelope: streamEnvelope,
          });
          if (!delivered) {
            abortController.abort();
            return;
          }
        }
      } catch (error) {
        if (portDisconnected) {
          return;
        }
        const errorPayload = toTransportErrorPayload(error, envelope.correlationId);
        void postToPort({
          channel: TRANSPORT_STREAM_CHANNEL,
          requestId: message.requestId,
          event:
            errorPayload.reasonCode === "transport.cancelled"
              ? "cancelled"
              : "error",
          ...(errorPayload.reasonCode === "transport.cancelled"
            ? {}
            : { error: errorPayload }),
        });
      } finally {
        inFlight.delete(message.requestId);
      }
    };

    port.onMessage.addListener((message: unknown) => {
      if (portDisconnected) {
        return;
      }

      if (!isTransportStreamPortMessage(message)) {
        return;
      }

      if (message.action === "cancel") {
        cancelRequest(message.requestId);
        return;
      }

      void startRequest(message);
    });

    port.onDisconnect.addListener(() => {
      portDisconnected = true;
      for (const controller of inFlight.values()) {
        controller.abort();
      }
      inFlight.clear();
    });
  });

  globalState[TRANSPORT_STREAM_PORT_LISTENER_FLAG] = true;
}
