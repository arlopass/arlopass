import {
  EnvelopeValidationError,
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

const WALLET_KEY_PROVIDERS = "byom.wallet.providers.v1";
const WALLET_KEY_ACTIVE = "byom.wallet.activeProvider.v1";
const RESPONSE_TTL_MS = 60_000;
const STREAM_CHUNK_SIZE = 96;

const DEFAULT_CAPABILITIES = [
  "provider.list",
  "session.create",
  "chat.completions",
  "chat.stream",
] as const;

type StoredProviderModel = Readonly<{
  id: string;
  name: string;
}>;

type StoredProviderStatus = "connected" | "disconnected" | "attention";

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

type RuntimeDependencies = Readonly<{
  now?: () => Date;
  fetchImpl?: typeof fetch;
  sendNativeMessage?: (
    hostName: string,
    message: Record<string, unknown>,
  ) => Promise<unknown>;
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
      value["status"] !== "attention")
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

  if (provider.status === "disconnected") {
    throw new ProviderUnavailableError(`Provider "${provider.name}" is disconnected.`, {
      details: { providerId: provider.id },
    });
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
    .filter((provider) => provider.status !== "disconnected")
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
}): Promise<string> {
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
        throw new TransientNetworkError(
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

    const messageRecord = isRecord(payload["message"]) ? payload["message"] : undefined;
    const messageContent =
      typeof messageRecord?.["content"] === "string"
        ? messageRecord["content"].trim()
        : undefined;
    const fallbackResponse =
      typeof payload["response"] === "string" ? payload["response"].trim() : undefined;
    const content =
      (messageContent !== undefined && messageContent.length > 0
        ? messageContent
        : fallbackResponse) ?? "";

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

    return content;
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

async function resolveCompletion(options: {
  provider: CompletionProvider;
  messages: readonly ChatMessage[];
  timeoutMs: number;
  correlationId: string;
  sessionId?: string;
  fetchImpl: typeof fetch;
  sendNativeMessage: (
    hostName: string,
    message: Record<string, unknown>,
  ) => Promise<unknown>;
}): Promise<string> {
  switch (options.provider.providerType) {
    case "local":
      return runOllamaCompletion({
        provider: options.provider,
        messages: options.messages,
        timeoutMs: options.timeoutMs,
        fetchImpl: options.fetchImpl,
      });

    case "cloud":
      throw new ProviderUnavailableError(
        `Provider "${options.provider.providerName}" requires a secure token broker for runtime chat.`,
        {
          details: {
            providerId: options.provider.providerId,
          },
        },
      );

    case "cli":
      return runCliBridgeCompletion({
        provider: options.provider,
        messages: options.messages,
        timeoutMs: options.timeoutMs,
        correlationId: options.correlationId,
        ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
        sendNativeMessage: options.sendNativeMessage,
      });

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
  dependencies: Required<RuntimeDependencies>;
}): Promise<
  | ConnectResponsePayload
  | SelectProviderResponsePayload
  | ProviderListResponsePayload
  | ChatSendResponsePayload
> {
  const snapshot = await readWalletSnapshot(options.storage);

  switch (options.envelope.capability) {
    case "session.create": {
      if (isRecord(options.envelope.payload) && typeof options.envelope.payload["appId"] === "string") {
        const response: ConnectResponsePayload = {
          capabilities: DEFAULT_CAPABILITIES,
        };
        return response;
      }

      const selection = parseSelectionPayload(options.envelope.payload);
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
      const response: ProviderListResponsePayload = {
        providers: toProviderDescriptors(snapshot.providers),
      };
      return response;
    }

    case "chat.completions": {
      const provider = resolveProviderSelection(
        snapshot,
        options.envelope.providerId,
        options.envelope.modelId,
      );
      const messages = parseChatMessages(options.envelope.payload as ChatSendPayload);
      const completion = await resolveCompletion({
        provider,
        messages,
        timeoutMs: options.requestTimeoutMs ?? 90_000,
        correlationId: options.envelope.correlationId,
        sessionId: options.envelope.sessionId,
        fetchImpl: options.dependencies.fetchImpl,
        sendNativeMessage: options.dependencies.sendNativeMessage,
      });

      const response: ChatSendResponsePayload = {
        message: {
          role: "assistant",
          content: completion,
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

    default:
      throw new EnvelopeValidationError("Capability is not supported by transport runtime.", {
        reasonCode: "protocol.unsupported_capability",
        details: { capability: options.envelope.capability },
      });
  }
}

async function dispatchTransportStreamRequest(options: {
  envelope: CanonicalEnvelope<unknown>;
  requestTimeoutMs?: number;
  storage: WalletStorageAdapter;
  dependencies: Required<RuntimeDependencies>;
  now: () => Date;
}): Promise<readonly CanonicalEnvelope<ChatStreamResponsePayload>[]> {
  if (options.envelope.capability !== "chat.stream") {
    throw new EnvelopeValidationError(
      "request-stream action requires chat.stream capability.",
      {
        reasonCode: "request.invalid",
        details: { capability: options.envelope.capability },
      },
    );
  }

  const snapshot = await readWalletSnapshot(options.storage);
  const provider = resolveProviderSelection(
    snapshot,
    options.envelope.providerId,
    options.envelope.modelId,
  );
  const messages = parseChatMessages(options.envelope.payload as ChatSendPayload);
  const completion = await resolveCompletion({
    provider,
    messages,
    timeoutMs: options.requestTimeoutMs ?? 90_000,
    correlationId: options.envelope.correlationId,
    sessionId: options.envelope.sessionId,
    fetchImpl: options.dependencies.fetchImpl,
    sendNativeMessage: options.dependencies.sendNativeMessage,
  });

  const now = options.now();
  const chunks = chunkText(completion, STREAM_CHUNK_SIZE);
  const envelopes: CanonicalEnvelope<ChatStreamResponsePayload>[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    envelopes.push(
      createResponseEnvelope(
        options.envelope,
        {
          type: "chunk",
          delta: chunks[index] ?? "",
          index,
        },
        now,
      ) as CanonicalEnvelope<ChatStreamResponsePayload>,
    );
  }

  envelopes.push(
    createResponseEnvelope(
      options.envelope,
      { type: "done" },
      now,
    ) as CanonicalEnvelope<ChatStreamResponsePayload>,
  );

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

export function createTransportMessageHandler(
  options: TransportMessageHandlerOptions,
): (message: unknown) => Promise<TransportActionResponse | null> {
  const now = options.dependencies?.now ?? (() => new Date());
  const fetchImpl =
    options.dependencies?.fetchImpl ??
    ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  const sendNativeMessage =
    options.dependencies?.sendNativeMessage ?? createDefaultNativeMessenger();

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
        dependencies: {
          now,
          fetchImpl,
          sendNativeMessage,
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

type ExtensionGlobalState = typeof globalThis & Record<string, unknown>;
const TRANSPORT_MESSAGE_LISTENER_FLAG = "__byom.transport.listener.registered.v1";

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
  const handleTransportMessage = createTransportMessageHandler({ storage });

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
