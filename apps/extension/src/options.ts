type ProviderModel = Readonly<{
  id: string;
  name: string;
}>;

type ProviderStatus = "connected" | "disconnected" | "attention";

type StoredProvider = Readonly<{
  id: string;
  name: string;
  type: "local" | "cloud" | "cli";
  status: ProviderStatus;
  models: readonly ProviderModel[];
  lastSyncedAt?: number;
  metadata?: Readonly<Record<string, string>>;
}>;

type ActiveProviderRef = Readonly<{
  providerId: string;
  modelId?: string;
}>;

type ConnectionTestResult = Readonly<{
  ok: boolean;
  status: ProviderStatus;
  message: string;
  models: readonly ProviderModel[];
}>;

type ConnectorSelectOption = Readonly<{
  value: string;
  label: string;
}>;

type ConnectorField = Readonly<{
  key: string;
  label: string;
  type: "text" | "password" | "url" | "select";
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  helpText?: string;
  maxLength?: number;
  minLength?: number;
  options?: readonly ConnectorSelectOption[];
}>;

type ConnectorDefinition = Readonly<{
  id: string;
  label: string;
  type: StoredProvider["type"];
  defaultName: string;
  fields: readonly ConnectorField[];
  testConnection(config: Readonly<Record<string, string>>): Promise<ConnectionTestResult>;
  sanitizeMetadata(config: Readonly<Record<string, string>>): Readonly<Record<string, string>>;
}>;

type ProviderStorageSnapshot = Readonly<{
  providers: readonly StoredProvider[];
  activeProvider: ActiveProviderRef | null;
}>;

const STORAGE_KEY_PROVIDERS = "byom.wallet.providers.v1";
const STORAGE_KEY_ACTIVE = "byom.wallet.activeProvider.v1";
const STORAGE_KEY_LAST_ERROR = "byom.wallet.ui.lastError.v1";
const PROVIDER_ID_PREFIX = "provider";
const NATIVE_MESSAGE_TIMEOUT_MS = 15_000;

const CLAUDE_KNOWN_MODELS: readonly ProviderModel[] = [
  { id: "claude-opus-4-5", name: "Claude Opus 4.5" },
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
];

type SupportedCliType = "copilot-cli" | "claude-code";

type CliClientCatalogEntry = Readonly<{
  id: SupportedCliType;
  label: string;
  defaultProviderName: string;
}>;

const CLI_CLIENTS: readonly CliClientCatalogEntry[] = [
  {
    id: "copilot-cli",
    label: "GitHub Copilot CLI",
    defaultProviderName: "GitHub Copilot CLI",
  },
  {
    id: "claude-code",
    label: "Claude Code",
    defaultProviderName: "Claude Code",
  },
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("Value must be a non-empty URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Value must be a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are allowed.");
  }

  return parsed.toString().replace(/\/$/, "");
}

function normalizeText(value: string, fallback = ""): string {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function cliClientById(cliTypeRaw: string | undefined): CliClientCatalogEntry {
  const cliType = normalizeText(cliTypeRaw ?? "", "copilot-cli");
  const match = CLI_CLIENTS.find((candidate) => candidate.id === cliType);
  return match ?? CLI_CLIENTS[0]!;
}

function toConnectorSelectOptions(
  options: readonly {
    id: string;
    label: string;
  }[],
): readonly ConnectorSelectOption[] {
  return options.map((option) => ({
    value: option.id,
    label: option.label,
  }));
}

function toConnectorModelOptions(models: readonly ProviderModel[]): readonly ConnectorSelectOption[] {
  return models.map((model) => ({
    value: model.id,
    label: model.name,
  }));
}

function parseProviderModels(value: unknown): ProviderModel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const models: ProviderModel[] = [];
  for (const entry of value) {
    if (
      isRecord(entry) &&
      typeof entry["id"] === "string" &&
      typeof entry["name"] === "string"
    ) {
      models.push({
        id: entry["id"],
        name: entry["name"],
      });
    }
  }
  return models;
}

function parseOllamaTagsModels(value: unknown): ProviderModel[] {
  if (!isRecord(value) || !Array.isArray(value["models"])) {
    return [];
  }

  return (value["models"] as unknown[])
    .map((entry) => (isRecord(entry) ? entry["name"] : undefined))
    .filter((name): name is string => typeof name === "string" && name.length > 0)
    .slice(0, 40)
    .map((name) => ({ id: name, name }));
}

async function discoverOllamaModels(baseUrl: string): Promise<readonly ProviderModel[]> {
  const tagsResponse = await runFetchCheck(`${baseUrl}/api/tags`);
  if (!tagsResponse.ok) {
    return [];
  }

  const payload = (await tagsResponse.json()) as unknown;
  return parseOllamaTagsModels(payload);
}

function createProviderId(connectorId: string): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${PROVIDER_ID_PREFIX}.${connectorId}.${Date.now().toString(36)}.${randomPart}`;
}

function parseStoredProvider(value: unknown): StoredProvider | null {
  if (!isRecord(value)) return null;

  if (
    typeof value["id"] !== "string" ||
    typeof value["name"] !== "string" ||
    (value["type"] !== "local" && value["type"] !== "cloud" && value["type"] !== "cli") ||
    (value["status"] !== "connected" &&
      value["status"] !== "disconnected" &&
      value["status"] !== "attention")
  ) {
    return null;
  }

  const rawModels = Array.isArray(value["models"]) ? value["models"] : [];
  const models: ProviderModel[] = [];
  for (const model of rawModels) {
    if (
      isRecord(model) &&
      typeof model["id"] === "string" &&
      typeof model["name"] === "string"
    ) {
      models.push({ id: model["id"], name: model["name"] });
    }
  }

  const metadata =
    isRecord(value["metadata"])
      ? Object.fromEntries(
          Object.entries(value["metadata"]).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : undefined;

  return {
    id: value["id"],
    name: value["name"],
    type: value["type"],
    status: value["status"],
    models,
    ...(typeof value["lastSyncedAt"] === "number" ? { lastSyncedAt: value["lastSyncedAt"] } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

function parseActiveProvider(value: unknown): ActiveProviderRef | null {
  if (!isRecord(value) || typeof value["providerId"] !== "string") {
    return null;
  }

  return {
    providerId: value["providerId"],
    ...(typeof value["modelId"] === "string" ? { modelId: value["modelId"] } : {}),
  };
}

async function getStorageSnapshot(): Promise<ProviderStorageSnapshot> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY_PROVIDERS, STORAGE_KEY_ACTIVE], (rawState) => {
      const rawProviders = rawState[STORAGE_KEY_PROVIDERS];
      const providers = Array.isArray(rawProviders)
        ? rawProviders.map(parseStoredProvider).filter((provider): provider is StoredProvider => provider !== null)
        : [];
      const activeProvider = parseActiveProvider(rawState[STORAGE_KEY_ACTIVE]);

      resolve({ providers, activeProvider });
    });
  });
}

async function writeStorageState(state: {
  providers: readonly StoredProvider[];
  activeProvider: ActiveProviderRef | null;
  clearError?: boolean;
}): Promise<void> {
  const update: Record<string, unknown> = {
    [STORAGE_KEY_PROVIDERS]: state.providers,
    [STORAGE_KEY_ACTIVE]: state.activeProvider,
  };
  if (state.clearError === true) {
    update[STORAGE_KEY_LAST_ERROR] = null;
  }

  return new Promise((resolve, reject) => {
    chrome.storage.local.set(update, () => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError !== undefined) {
        reject(new Error(runtimeError.message ?? "Failed to write wallet state."));
        return;
      }
      resolve();
    });
  });
}

async function runFetchCheck(url: string, options: {
  method?: "GET" | "HEAD";
  headers?: Readonly<Record<string, string>>;
  timeoutMs?: number;
} = {}): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    signal: abortController.signal,
  };

  if (options.headers !== undefined) {
    requestInit.headers = options.headers;
  }

  try {
    return await fetch(url, requestInit);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms.`);
    }

    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function formatValidationTransportError(options: {
  serviceName: string;
  endpoint: string;
  error: unknown;
}): string {
  const errorMessage = options.error instanceof Error
    ? options.error.message
    : String(options.error);
  const normalizedMessage = errorMessage.toLowerCase();

  if (normalizedMessage.includes("failed to fetch")) {
    return `Unable to reach ${options.serviceName} at ${options.endpoint}. Confirm the service is running and reload the extension to apply connect-src policy updates.`;
  }

  if (normalizedMessage.includes("timed out")) {
    return `${options.serviceName} did not respond before timeout at ${options.endpoint}.`;
  }

  return `${options.serviceName} validation failed: ${errorMessage}`;
}

function formatNativeHostRuntimeError(rawMessage: string): string {
  const hint =
    rawMessage.includes("Specified native messaging host not found")
      ? " Run `npm run dev:register-native-host`, then reload the extension and retry."
      : rawMessage.includes("Error when communicating with the native messaging host")
        ? " The native host process started but exited unexpectedly. Re-run `npm run dev:full` and verify bridge startup logs."
        : "";
  return `Native host not reachable: ${rawMessage}.${hint}`;
}

async function sendNativeMessage(
  hostName: string,
  message: Readonly<Record<string, unknown>>,
  options: Readonly<{ timeoutMs?: number }> = {},
): Promise<
  | Readonly<{ ok: true; response: unknown }>
  | Readonly<{ ok: false; errorMessage: string }>
> {
  return new Promise((resolve) => {
    let settled = false;
    const timeoutMs = options.timeoutMs ?? NATIVE_MESSAGE_TIMEOUT_MS;
    const timeoutHandle = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        ok: false,
        errorMessage: `Native host response timed out after ${String(timeoutMs)}ms.`,
      });
    }, timeoutMs);

    try {
      chrome.runtime.sendNativeMessage(hostName, message, (response) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutHandle);
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError !== undefined) {
          resolve({
            ok: false,
            errorMessage: runtimeError.message ?? "unknown error",
          });
          return;
        }

        resolve({
          ok: true,
          response,
        });
      });
    } catch (error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      const err = error instanceof Error ? error : new Error(String(error));
      resolve({
        ok: false,
        errorMessage: err.message,
      });
    }
  });
}

type CliConnectorCache = {
  hostName: string;
  cliType: SupportedCliType;
  models: readonly ProviderModel[];
  thinkingLevelsByModel: Record<string, readonly string[]>;
};

function createCliCacheKey(hostName: string, cliType: SupportedCliType): string {
  return `${hostName}::${cliType}`;
}

const cliConnectorCacheByKey: Record<string, CliConnectorCache> = {};

function parseThinkingLevels(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const levels = value
    .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
    .map((entry) => (entry === "medium" ? "med" : entry))
    .filter((entry) => entry.length > 0);
  return [...new Set(levels)];
}

function toThinkingLevelOptions(levels: readonly string[]): readonly ConnectorSelectOption[] {
  return levels.map((level) => ({
    value: level,
    label:
      level === "xhigh"
        ? "Very High"
        : level === "med"
          ? "Medium"
          : `${level[0]?.toUpperCase() ?? ""}${level.slice(1)}`,
  }));
}

function serializeThinkingLevelsMap(
  thinkingLevelsByModel: Record<string, readonly string[]>,
): string {
  const normalized = Object.fromEntries(
    Object.entries(thinkingLevelsByModel).filter((entry) => entry[1].length > 0),
  );
  return JSON.stringify(normalized);
}

async function ensureNativeBridgeHandshake(hostName: string): Promise<void> {
  const challengeResponse = await sendNativeMessage(hostName, {
    type: "handshake.challenge",
  }, { timeoutMs: 5_000 });
  if (!challengeResponse.ok) {
    throw new Error(formatNativeHostRuntimeError(challengeResponse.errorMessage));
  }
  if (
    !isRecord(challengeResponse.response) ||
    challengeResponse.response["type"] !== "handshake.challenge"
  ) {
    throw new Error("Native host responded with an unexpected payload.");
  }
}

async function fetchCliModelsFromBridge(options: {
  hostName: string;
  cliType: SupportedCliType;
}): Promise<readonly ProviderModel[]> {
  await ensureNativeBridgeHandshake(options.hostName);
  const modelListResponse = await sendNativeMessage(options.hostName, {
    type: "cli.models.list",
    cliType: options.cliType,
  }, { timeoutMs: 10_000 });
  if (!modelListResponse.ok) {
    throw new Error(formatNativeHostRuntimeError(modelListResponse.errorMessage));
  }

  if (!isRecord(modelListResponse.response)) {
    throw new Error("Native host returned an invalid models payload.");
  }
  if (modelListResponse.response["type"] === "error") {
    const message =
      typeof modelListResponse.response["message"] === "string"
        ? modelListResponse.response["message"]
        : "Native host failed to list CLI models.";
    throw new Error(message);
  }
  if (modelListResponse.response["type"] !== "cli.models.list") {
    throw new Error("Native host returned an unexpected models payload.");
  }

  const models = parseProviderModels(modelListResponse.response["models"]);
  if (models.length === 0) {
    throw new Error("Native host did not return any models for this CLI type.");
  }
  return models;
}

async function fetchCliThinkingLevelsFromBridge(options: {
  hostName: string;
  cliType: SupportedCliType;
  modelId: string;
}): Promise<readonly string[]> {
  await ensureNativeBridgeHandshake(options.hostName);
  const levelsResponse = await sendNativeMessage(options.hostName, {
    type: "cli.thinking-levels.list",
    cliType: options.cliType,
    modelId: options.modelId,
  }, { timeoutMs: 10_000 });
  if (!levelsResponse.ok) {
    throw new Error(formatNativeHostRuntimeError(levelsResponse.errorMessage));
  }

  if (!isRecord(levelsResponse.response)) {
    throw new Error("Native host returned an invalid thinking-level payload.");
  }
  if (levelsResponse.response["type"] === "error") {
    const message =
      typeof levelsResponse.response["message"] === "string"
        ? levelsResponse.response["message"]
        : "Native host failed to list thinking levels.";
    throw new Error(message);
  }
  if (levelsResponse.response["type"] !== "cli.thinking-levels.list") {
    throw new Error("Native host returned an unexpected thinking-level payload.");
  }

  return parseThinkingLevels(levelsResponse.response["thinkingLevels"]);
}

function readCliConnectorCache(
  hostName: string,
  cliType: SupportedCliType,
): CliConnectorCache | undefined {
  return cliConnectorCacheByKey[createCliCacheKey(hostName, cliType)];
}

function writeCliConnectorCache(cache: CliConnectorCache): void {
  cliConnectorCacheByKey[createCliCacheKey(cache.hostName, cache.cliType)] = cache;
}

async function getCliConnectorCache(options: {
  hostName: string;
  cliType: SupportedCliType;
}): Promise<CliConnectorCache> {
  const cached = readCliConnectorCache(options.hostName, options.cliType);
  if (cached !== undefined && cached.models.length > 0) {
    return cached;
  }

  const models = await fetchCliModelsFromBridge({
    hostName: options.hostName,
    cliType: options.cliType,
  });
  const nextCache: CliConnectorCache = {
    hostName: options.hostName,
    cliType: options.cliType,
    models,
    thinkingLevelsByModel: {},
  };
  writeCliConnectorCache(nextCache);
  return nextCache;
}

async function getCliThinkingLevelsForModel(options: {
  hostName: string;
  cliType: SupportedCliType;
  modelId: string;
}): Promise<readonly string[]> {
  const cache = await getCliConnectorCache({
    hostName: options.hostName,
    cliType: options.cliType,
  });
  const cachedLevels = cache.thinkingLevelsByModel[options.modelId];
  if (cachedLevels !== undefined) {
    return cachedLevels;
  }

  const levels = await fetchCliThinkingLevelsFromBridge(options);
  const nextCache: CliConnectorCache = {
    ...cache,
    thinkingLevelsByModel: {
      ...cache.thinkingLevelsByModel,
      [options.modelId]: levels,
    },
  };
  writeCliConnectorCache(nextCache);
  return levels;
}

async function hydrateCliProviderMetadata(options: {
  provider: StoredProvider;
  hostName: string;
  cliType: SupportedCliType;
  selectedModelId: string;
  selectedThinkingLevel: string;
}): Promise<StoredProvider> {
  const cache = await getCliConnectorCache({
    hostName: options.hostName,
    cliType: options.cliType,
  });
  const selectedModelId = cache.models.some((model) => model.id === options.selectedModelId)
    ? options.selectedModelId
    : "";
  const modelThinkingLevels =
    selectedModelId.length > 0 ? (cache.thinkingLevelsByModel[selectedModelId] ?? []) : [];
  const selectedThinkingLevel = modelThinkingLevels.includes(options.selectedThinkingLevel)
    ? options.selectedThinkingLevel
    : "";

  const metadata: Record<string, string> = {
    ...(options.provider.metadata ?? {}),
    nativeHostName: options.hostName,
    cliType: options.cliType,
    thinkingLevelsByModel: serializeThinkingLevelsMap(cache.thinkingLevelsByModel),
  };
  if (selectedModelId.length > 0) {
    metadata["selectedModelId"] = selectedModelId;
  }
  if (selectedThinkingLevel.length > 0) {
    metadata["thinkingLevel"] = selectedThinkingLevel;
  }

  return {
    ...options.provider,
    models: cache.models,
    metadata,
    lastSyncedAt: Date.now(),
  };
}

const CONNECTORS: readonly ConnectorDefinition[] = [
  {
    id: "ollama",
    label: "Ollama (Local)",
    type: "local",
    defaultName: "Ollama Local",
    fields: [
      {
        key: "baseUrl",
        label: "Base URL",
        type: "url",
        defaultValue: "http://localhost:11434",
        placeholder: "http://localhost:11434",
        required: true,
        maxLength: 200,
        helpText: "Endpoint for your local Ollama runtime.",
      },
      {
        key: "modelId",
        label: "Preferred Model",
        type: "select",
        required: true,
        options: [{ value: "", label: "Loading models..." }],
        helpText: "Discovered from Ollama /api/tags when reachable.",
      },
    ],
    async testConnection(config): Promise<ConnectionTestResult> {
      const baseUrl = normalizeUrl(config["baseUrl"] ?? "http://localhost:11434");
      let response: Response;
      try {
        response = await runFetchCheck(`${baseUrl}/api/version`);
      } catch (error) {
        return {
          ok: false,
          status: "attention",
          message: formatValidationTransportError({
            serviceName: "Ollama",
            endpoint: `${baseUrl}/api/version`,
            error,
          }),
          models: [],
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          status: "attention",
          message: `Ollama responded with HTTP ${response.status}.`,
          models: [],
        };
      }

      let models: readonly ProviderModel[];
      try {
        models = await discoverOllamaModels(baseUrl);
      } catch (error) {
        return {
          ok: false,
          status: "attention",
          message: formatValidationTransportError({
            serviceName: "Ollama",
            endpoint: `${baseUrl}/api/tags`,
            error,
          }),
          models: [],
        };
      }

      if (models.length === 0) {
        return {
          ok: false,
          status: "attention",
          message: "Ollama model discovery returned no models. Add a model locally and retry.",
          models: [],
        };
      }

      const selectedModelId = normalizeText(config["modelId"] ?? "", "");
      if (selectedModelId.length > 0 && !models.some((model) => model.id === selectedModelId)) {
        return {
          ok: false,
          status: "attention",
          message: `Selected model "${selectedModelId}" is not available in Ollama.`,
          models: [],
        };
      }

      return {
        ok: true,
        status: "connected",
        message: "Ollama is reachable.",
        models,
      };
    },
    sanitizeMetadata(config): Readonly<Record<string, string>> {
      const modelId = normalizeText(config["modelId"] ?? "", "");
      return {
        baseUrl: normalizeUrl(config["baseUrl"] ?? "http://localhost:11434"),
        ...(modelId.length > 0 ? { selectedModelId: modelId } : {}),
      };
    },
  },
  {
    id: "claude-subscription",
    label: "Claude Subscription (Cloud)",
    type: "cloud",
    defaultName: "Claude Subscription",
    fields: [
      {
        key: "baseUrl",
        label: "API Base URL",
        type: "url",
        placeholder: "https://api.anthropic.com",
        required: true,
        maxLength: 200,
      },
      {
        key: "apiKey",
        label: "API Key (test only)",
        type: "password",
        required: true,
        minLength: 20,
        maxLength: 200,
        helpText: "Used only for test validation and never stored.",
      },
      {
        key: "modelHint",
        label: "Preferred Model (optional)",
        type: "text",
        placeholder: "claude-sonnet-4-5",
        maxLength: 100,
      },
    ],
    async testConnection(config): Promise<ConnectionTestResult> {
      const baseUrl = normalizeUrl(config["baseUrl"] ?? "https://api.anthropic.com");
      const apiKey = normalizeText(config["apiKey"] ?? "");
      if (apiKey.length < 20) {
        return {
          ok: false,
          status: "attention",
          message: "Provide a valid API key to test Claude connectivity.",
          models: [],
        };
      }

      let response: Response;
      try {
        response = await runFetchCheck(`${baseUrl}/v1/models`, {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
        });
      } catch (error) {
        return {
          ok: false,
          status: "attention",
          message: formatValidationTransportError({
            serviceName: "Claude endpoint",
            endpoint: `${baseUrl}/v1/models`,
            error,
          }),
          models: [],
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          status: "attention",
          message: "Authentication failed. Check your API key.",
          models: [],
        };
      }

      if (!response.ok && response.status >= 500) {
        return {
          ok: false,
          status: "attention",
          message: `Claude endpoint unavailable (HTTP ${response.status}).`,
          models: [],
        };
      }

      let models: ProviderModel[] = [...CLAUDE_KNOWN_MODELS];
      try {
        if (response.ok) {
          const payload = (await response.json()) as { data?: Array<{ id?: string }> };
          const discovered = (payload.data ?? [])
            .map((item) => item.id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
            .slice(0, 20)
            .map((id) => ({ id, name: id }));
          if (discovered.length > 0) {
            models = discovered;
          }
        }
      } catch {
        // Non-fatal. Keep known model list.
      }

      const modelHint = normalizeText(config["modelHint"] ?? "");
      if (modelHint.length > 0 && !models.some((model) => model.id === modelHint)) {
        models = [{ id: modelHint, name: modelHint }, ...models];
      }

      return {
        ok: true,
        status: "connected",
        message: "Claude endpoint validated.",
        models,
      };
    },
    sanitizeMetadata(config): Readonly<Record<string, string>> {
      return {
        baseUrl: normalizeUrl(config["baseUrl"] ?? "https://api.anthropic.com"),
      };
    },
  },
  {
    id: "local-cli-bridge",
    label: "Native Bridge Host (CLI clients)",
    type: "cli",
    defaultName: "GitHub Copilot CLI",
    fields: [
      {
        key: "nativeHostName",
        label: "Native Host Name",
        type: "text",
        defaultValue: "com.byom.bridge",
        required: true,
        maxLength: 120,
        placeholder: "com.byom.bridge",
      },
      {
        key: "cliType",
        label: "CLI Type",
        type: "select",
        required: true,
        options: toConnectorSelectOptions(CLI_CLIENTS),
        helpText: "Choose which local CLI runtime should execute chat requests.",
      },
      {
        key: "modelId",
        label: "Model",
        type: "select",
        required: true,
        options: [{ value: "", label: "Loading models..." }],
        helpText: "Fetched from native bridge for selected CLI type.",
      },
      {
        key: "thinkingLevel",
        label: "Thinking Level",
        type: "select",
        required: false,
        options: [{ value: "", label: "Loading thinking levels..." }],
        helpText: "Fetched from native bridge for selected model.",
      },
    ],
    async testConnection(config): Promise<ConnectionTestResult> {
      const hostName = normalizeText(config["nativeHostName"] ?? "com.byom.bridge", "com.byom.bridge");
      const cliClient = cliClientById(config["cliType"]);
      if (!/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(hostName)) {
        return {
          ok: false,
          status: "attention",
          message: "Native host name format is invalid.",
          models: [],
        };
      }

      try {
        const cache = await getCliConnectorCache({
          hostName,
          cliType: cliClient.id,
        });
        const models = cache.models;

        const selectedModelId = normalizeText(config["modelId"] ?? "", "");
        if (selectedModelId.length > 0) {
          if (!models.some((model) => model.id === selectedModelId)) {
            return {
              ok: false,
              status: "attention",
              message: `Selected model "${selectedModelId}" is not available for ${cliClient.label}.`,
              models: [],
            };
          }
          await getCliThinkingLevelsForModel({
            hostName,
            cliType: cliClient.id,
            modelId: selectedModelId,
          });
        } else if (models[0] !== undefined) {
          await getCliThinkingLevelsForModel({
            hostName,
            cliType: cliClient.id,
            modelId: models[0].id,
          });
        }

        return {
          ok: true,
          status: "connected",
          message: `${cliClient.label} bridge is reachable.`,
          models,
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        return {
          ok: false,
          status: "attention",
          message: err.message,
          models: [],
        };
      }
    },
    sanitizeMetadata(config): Readonly<Record<string, string>> {
      const hostName = normalizeText(
        config["nativeHostName"] ?? "com.byom.bridge",
        "com.byom.bridge",
      );
      const cliClient = cliClientById(config["cliType"]);
      const selectedModelId = normalizeText(config["modelId"] ?? "", "");
      const selectedThinkingLevel = normalizeText(config["thinkingLevel"] ?? "", "");
      const cache = readCliConnectorCache(hostName, cliClient.id);
      const metadata: Record<string, string> = {
        nativeHostName: hostName,
        cliType: cliClient.id,
      };
      if (selectedModelId.length > 0) {
        metadata["selectedModelId"] = selectedModelId;
      }
      if (selectedThinkingLevel.length > 0) {
        metadata["thinkingLevel"] = selectedThinkingLevel;
      }
      if (cache !== undefined) {
        metadata["thinkingLevelsByModel"] = serializeThinkingLevelsMap(cache.thinkingLevelsByModel);
      }
      return metadata;
    },
  },
];

function connectorById(connectorId: string): ConnectorDefinition {
  const connector = CONNECTORS.find((candidate) => candidate.id === connectorId);
  if (connector === undefined) {
    throw new Error(`Unknown connector: ${connectorId}`);
  }
  return connector;
}

function updateSelectOptions(
  selectElement: HTMLSelectElement,
  options: readonly ConnectorSelectOption[],
  preferredValue: string | undefined,
): void {
  selectElement.innerHTML = options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`,
    )
    .join("");

  if (preferredValue !== undefined && options.some((option) => option.value === preferredValue)) {
    selectElement.value = preferredValue;
    return;
  }

  const firstOption = options[0];
  if (firstOption !== undefined) {
    selectElement.value = firstOption.value;
  }
}

function setSelectLoadingState(selectElement: HTMLSelectElement, label: string): void {
  updateSelectOptions(selectElement, [{ value: "", label }], undefined);
  selectElement.disabled = true;
  selectElement.setAttribute("aria-busy", "true");
}

function setSelectUnavailableState(selectElement: HTMLSelectElement, label: string): void {
  updateSelectOptions(selectElement, [{ value: "", label }], undefined);
  selectElement.disabled = true;
  selectElement.setAttribute("aria-busy", "false");
}

function setSelectOptionsReady(
  selectElement: HTMLSelectElement,
  options: readonly ConnectorSelectOption[],
  preferredValue: string | undefined,
): void {
  updateSelectOptions(selectElement, options, preferredValue);
  selectElement.disabled = options.length === 0;
  selectElement.setAttribute("aria-busy", "false");
}

let cliModelSyncCounter = 0;
let cliThinkingSyncCounter = 0;

async function syncCliThinkingSelector(form: HTMLFormElement): Promise<void> {
  const hostNameField = form.elements.namedItem("nativeHostName");
  const cliTypeField = form.elements.namedItem("cliType");
  const modelField = form.elements.namedItem("modelId");
  const thinkingField = form.elements.namedItem("thinkingLevel");
  if (
    !(hostNameField instanceof HTMLInputElement) ||
    !(cliTypeField instanceof HTMLSelectElement) ||
    !(modelField instanceof HTMLSelectElement) ||
    !(thinkingField instanceof HTMLSelectElement)
  ) {
    return;
  }

  const syncId = ++cliThinkingSyncCounter;
  const modelId = normalizeText(modelField.value, "");
  if (modelId.length === 0) {
    setSelectUnavailableState(thinkingField, "Select a model first.");
    return;
  }

  setSelectLoadingState(thinkingField, "Loading thinking levels...");
  const hostName = normalizeText(hostNameField.value, "com.byom.bridge");
  const cliType = cliClientById(cliTypeField.value).id;
  const previousThinkingLevel = normalizeText(thinkingField.value, "");
  try {
    const thinkingLevels = await getCliThinkingLevelsForModel({
      hostName,
      cliType,
      modelId,
    });
    if (syncId !== cliThinkingSyncCounter) {
      return;
    }
    if (thinkingLevels.length === 0) {
      setSelectUnavailableState(thinkingField, "No thinking levels available for this model.");
      return;
    }
    setSelectOptionsReady(
      thinkingField,
      toThinkingLevelOptions(thinkingLevels),
      previousThinkingLevel,
    );
  } catch (error) {
    if (syncId !== cliThinkingSyncCounter) {
      return;
    }
    const message = error instanceof Error ? error.message : "Unable to load thinking levels.";
    setSelectUnavailableState(
      thinkingField,
      `Thinking levels unavailable: ${message}`,
    );
  }
}

async function syncCliModelSelector(form: HTMLFormElement): Promise<void> {
  const hostNameField = form.elements.namedItem("nativeHostName");
  const cliTypeField = form.elements.namedItem("cliType");
  const modelField = form.elements.namedItem("modelId");
  const thinkingField = form.elements.namedItem("thinkingLevel");
  if (
    !(hostNameField instanceof HTMLInputElement) ||
    !(cliTypeField instanceof HTMLSelectElement) ||
    !(modelField instanceof HTMLSelectElement) ||
    !(thinkingField instanceof HTMLSelectElement)
  ) {
    return;
  }

  const syncId = ++cliModelSyncCounter;
  const hostName = normalizeText(hostNameField.value, "com.byom.bridge");
  const cliClient = cliClientById(cliTypeField.value);
  const previousModelId = normalizeText(modelField.value, "");
  setSelectLoadingState(modelField, "Loading models...");
  setSelectLoadingState(thinkingField, "Loading thinking levels...");
  try {
    const cache = await getCliConnectorCache({
      hostName,
      cliType: cliClient.id,
    });
    if (syncId !== cliModelSyncCounter) {
      return;
    }
    if (cache.models.length === 0) {
      setSelectUnavailableState(modelField, "No models available for this CLI.");
      setSelectUnavailableState(thinkingField, "Select a model first.");
      return;
    }
    setSelectOptionsReady(
      modelField,
      toConnectorModelOptions(cache.models),
      previousModelId,
    );
    await syncCliThinkingSelector(form);
  } catch (error) {
    if (syncId !== cliModelSyncCounter) {
      return;
    }
    const message = error instanceof Error ? error.message : "Unable to load models.";
    setSelectUnavailableState(modelField, `Models unavailable: ${message}`);
    setSelectUnavailableState(thinkingField, "Thinking levels unavailable.");
  }
}

let ollamaModelSyncCounter = 0;

async function syncOllamaModelSelector(form: HTMLFormElement): Promise<void> {
  const baseUrlField = form.elements.namedItem("baseUrl");
  const modelField = form.elements.namedItem("modelId");
  if (
    !(baseUrlField instanceof HTMLInputElement) ||
    !(modelField instanceof HTMLSelectElement)
  ) {
    return;
  }

  const syncId = ++ollamaModelSyncCounter;
  const previousModelId = normalizeText(modelField.value, "");
  setSelectLoadingState(modelField, "Loading models...");
  let models: readonly ProviderModel[] = [];
  let unavailableReason = "No models available.";

  const baseUrlCandidate = normalizeText(baseUrlField.value, "http://localhost:11434");
  try {
    const normalizedBaseUrl = normalizeUrl(baseUrlCandidate);
    models = await discoverOllamaModels(normalizedBaseUrl);
    if (models.length === 0) {
      unavailableReason = "No Ollama models found at /api/tags.";
    }
  } catch (error) {
    unavailableReason =
      error instanceof Error ? error.message : "Unable to load Ollama models.";
  }

  if (syncId !== ollamaModelSyncCounter) {
    return;
  }

  if (models.length === 0) {
    setSelectUnavailableState(modelField, `Models unavailable: ${unavailableReason}`);
    return;
  }
  setSelectOptionsReady(modelField, toConnectorModelOptions(models), previousModelId);
}

function resolveConnectorDefaultName(
  connector: ConnectorDefinition,
  fieldValues: Readonly<Record<string, string>>,
): string {
  if (connector.id === "local-cli-bridge") {
    return cliClientById(fieldValues["cliType"]).defaultProviderName;
  }

  return connector.defaultName;
}

function renderConnectorFields(container: HTMLElement, connector: ConnectorDefinition): void {
  const html = connector.fields
    .map((field) => {
      const requiredAttr = field.required === true ? " required" : "";
      const minLengthAttr =
        typeof field.minLength === "number" ? ` minlength="${field.minLength}"` : "";
      const maxLengthAttr =
        typeof field.maxLength === "number" ? ` maxlength="${field.maxLength}"` : "";
      const placeholderAttr =
        field.placeholder !== undefined ? ` placeholder="${escapeHtml(field.placeholder)}"` : "";
      const defaultValueAttr =
        field.defaultValue !== undefined ? ` value="${escapeHtml(field.defaultValue)}"` : "";
      const autoCompleteAttr = field.type === "password" ? ` autocomplete="off"` : "";
      const fieldId = `field-${escapeHtml(field.key)}`;
      const label = `<label for="${fieldId}">${escapeHtml(field.label)}</label>`;

      if (field.type === "select") {
        const optionsMarkup = (field.options ?? [])
          .map(
            (option) =>
              `<option value="${escapeHtml(option.value)}"${field.defaultValue === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`,
          )
          .join("");
        return `<div class="form-row">
          ${label}
          <select id="${fieldId}" name="${escapeHtml(field.key)}"${requiredAttr}>
            ${optionsMarkup}
          </select>
          ${field.helpText !== undefined ? `<p class="field-help">${escapeHtml(field.helpText)}</p>` : ""}
        </div>`;
      }

      return `<div class="form-row">
        ${label}
        <input
          id="${fieldId}"
          name="${escapeHtml(field.key)}"
          type="${escapeHtml(field.type)}"${requiredAttr}${minLengthAttr}${maxLengthAttr}${placeholderAttr}${defaultValueAttr}${autoCompleteAttr}
        />
        ${field.helpText !== undefined ? `<p class="field-help">${escapeHtml(field.helpText)}</p>` : ""}
      </div>`;
    })
    .join("");

  container.innerHTML = html;
}

function collectConnectorFieldValues(
  form: HTMLFormElement,
  connector: ConnectorDefinition,
): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const field of connector.fields) {
    const fieldElement = form.elements.namedItem(field.key);
    if (
      !(fieldElement instanceof HTMLInputElement) &&
      !(fieldElement instanceof HTMLSelectElement)
    ) {
      throw new Error(`Missing field "${field.label}".`);
    }
    const value = fieldElement.value.trim();
    if (field.required === true && value.length === 0) {
      throw new Error(`"${field.label}" is required.`);
    }
    values[field.key] = value;
  }
  return values;
}

function setFeedback(
  node: HTMLElement,
  feedback: {
    kind: "success" | "error" | "info";
    title: string;
    message: string;
  },
): void {
  node.className = `options-feedback options-feedback--${feedback.kind}`;
  node.innerHTML = `<p class="options-feedback__title">${escapeHtml(feedback.title)}</p><p class="options-feedback__message">${escapeHtml(feedback.message)}</p>`;
}

function clearFeedback(node: HTMLElement): void {
  node.className = "options-feedback";
  node.innerHTML = "";
}

function renderConnectedProviders(
  container: HTMLElement,
  snapshot: ProviderStorageSnapshot,
): void {
  if (snapshot.providers.length === 0) {
    container.innerHTML = `<p class="providers-empty">No providers saved yet. Add one from the form on the left.</p>`;
    return;
  }

  const rows = snapshot.providers.map((provider) => {
    const isActive = snapshot.activeProvider?.providerId === provider.id;
    const statusLabel =
      provider.status === "connected"
        ? "Connected"
        : provider.status === "attention"
          ? "Needs attention"
          : "Disconnected";
    const modelOptions = provider.models
      .map(
        (model) =>
          `<option value="${escapeHtml(model.id)}"${snapshot.activeProvider?.providerId === provider.id &&
          snapshot.activeProvider.modelId === model.id
            ? " selected"
            : ""}>${escapeHtml(model.name)}</option>`,
      )
      .join("");

    return `<article class="provider-row" data-provider-id="${escapeHtml(provider.id)}">
      <div class="provider-row__main">
        <div class="provider-row__heading">
          <h3>${escapeHtml(provider.name)}</h3>
          <span class="provider-status provider-status--${escapeHtml(provider.status)}">${escapeHtml(statusLabel)}</span>
          ${isActive ? `<span class="provider-active">Active</span>` : ""}
        </div>
        <p class="provider-row__meta">${escapeHtml(provider.type.toUpperCase())} · ${escapeHtml(provider.id)}</p>
      </div>
      <div class="provider-row__actions">
        <button class="btn btn--secondary btn--small" type="button" data-provider-action="activate" data-provider-id="${escapeHtml(provider.id)}">
          ${isActive ? "Active" : "Set Active"}
        </button>
        ${
          provider.models.length > 0
            ? `<select class="provider-model-select" data-provider-action="model" data-provider-id="${escapeHtml(provider.id)}">${modelOptions}</select>`
            : ""
        }
        <button class="btn btn--danger btn--small" type="button" data-provider-action="remove" data-provider-id="${escapeHtml(provider.id)}">
          Remove
        </button>
      </div>
    </article>`;
  });

  container.innerHTML = rows.join("");
}

async function refreshConnectedProviders(container: HTMLElement): Promise<ProviderStorageSnapshot> {
  const snapshot = await getStorageSnapshot();
  renderConnectedProviders(container, snapshot);
  return snapshot;
}

async function handleProviderAction(
  event: Event,
  providersContainer: HTMLElement,
  feedbackNode: HTMLElement,
): Promise<void> {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const actionButton = target.closest("[data-provider-action]");
  if (!(actionButton instanceof HTMLElement)) {
    return;
  }

  const action = actionButton.dataset["providerAction"];
  const providerId = actionButton.dataset["providerId"];
  if (action === undefined || providerId === undefined) {
    return;
  }

  const snapshot = await getStorageSnapshot();
  const provider = snapshot.providers.find((item) => item.id === providerId);
  if (provider === undefined) {
    setFeedback(feedbackNode, {
      kind: "error",
      title: "Provider missing",
      message: "The provider could not be found in storage.",
    });
    await refreshConnectedProviders(providersContainer);
    return;
  }

  if (action === "activate") {
    const defaultModelId = provider.models[0]?.id;
    await writeStorageState({
      providers: snapshot.providers,
      activeProvider: { providerId, ...(defaultModelId !== undefined ? { modelId: defaultModelId } : {}) },
      clearError: true,
    });
    setFeedback(feedbackNode, {
      kind: "success",
      title: "Provider activated",
      message: `${provider.name} is now active.`,
    });
    await refreshConnectedProviders(providersContainer);
    return;
  }

  if (action === "remove") {
    const nextProviders = snapshot.providers.filter((item) => item.id !== providerId);
    const nextActive =
      snapshot.activeProvider !== null && snapshot.activeProvider.providerId === providerId
        ? null
        : snapshot.activeProvider;

    await writeStorageState({
      providers: nextProviders,
      activeProvider: nextActive,
      clearError: true,
    });
    setFeedback(feedbackNode, {
      kind: "info",
      title: "Provider removed",
      message: `${provider.name} has been removed from wallet storage.`,
    });
    await refreshConnectedProviders(providersContainer);
    return;
  }
}

async function handleProviderModelChange(
  event: Event,
  providersContainer: HTMLElement,
  feedbackNode: HTMLElement,
): Promise<void> {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) || target.dataset["providerAction"] !== "model") {
    return;
  }

  const providerId = target.dataset["providerId"];
  const modelId = target.value;
  if (providerId === undefined || modelId.length === 0) {
    return;
  }

  const snapshot = await getStorageSnapshot();
  const provider = snapshot.providers.find((item) => item.id === providerId);
  if (provider === undefined) {
    setFeedback(feedbackNode, {
      kind: "error",
      title: "Provider missing",
      message: "Unable to update model for an unknown provider.",
    });
    return;
  }

  const modelExists = provider.models.some((model) => model.id === modelId);
  if (!modelExists) {
    setFeedback(feedbackNode, {
      kind: "error",
      title: "Invalid model",
      message: "Selected model does not belong to this provider.",
    });
    await refreshConnectedProviders(providersContainer);
    return;
  }

  await writeStorageState({
    providers: snapshot.providers,
    activeProvider: { providerId, modelId },
    clearError: true,
  });
  setFeedback(feedbackNode, {
    kind: "success",
    title: "Model selected",
    message: `${provider.name} now uses model ${modelId}.`,
  });
  await refreshConnectedProviders(providersContainer);
}

function setupConnectorPicker(
  form: HTMLFormElement,
  selectElement: HTMLSelectElement,
  fieldsContainer: HTMLElement,
  feedbackNode: HTMLElement,
): void {
  selectElement.innerHTML = CONNECTORS.map(
    (connector) =>
      `<option value="${escapeHtml(connector.id)}">${escapeHtml(connector.label)}</option>`,
  ).join("");
  const initialConnector = CONNECTORS.at(0);
  if (initialConnector === undefined) {
    throw new Error("No connectors are configured.");
  }
  renderConnectorFields(fieldsContainer, initialConnector);
  if (initialConnector.id === "local-cli-bridge") {
    void syncCliModelSelector(form);
  } else if (initialConnector.id === "ollama") {
    void syncOllamaModelSelector(form);
  }
  clearFeedback(feedbackNode);

  selectElement.addEventListener("change", () => {
    const connector = connectorById(selectElement.value);
    renderConnectorFields(fieldsContainer, connector);
    if (connector.id === "local-cli-bridge") {
      void syncCliModelSelector(form);
    } else if (connector.id === "ollama") {
      void syncOllamaModelSelector(form);
    }
    clearFeedback(feedbackNode);
  });
}

function setButtonsBusy(
  buttons: readonly HTMLButtonElement[],
  busy: boolean,
): void {
  for (const button of buttons) {
    button.disabled = busy;
    button.setAttribute("aria-disabled", busy ? "true" : "false");
  }
}

async function onSaveProvider(
  form: HTMLFormElement,
  feedbackNode: HTMLElement,
  providersContainer: HTMLElement,
): Promise<void> {
  const connectorSelect = form.elements.namedItem("connector");
  if (!(connectorSelect instanceof HTMLSelectElement)) {
    throw new Error("Connector selector is not available.");
  }

  const connector = connectorById(connectorSelect.value);
  const fieldValues = collectConnectorFieldValues(form, connector);
  const testResult = await connector.testConnection(fieldValues);

  if (!testResult.ok) {
    setFeedback(feedbackNode, {
      kind: "error",
      title: "Connection test failed",
      message: testResult.message,
    });
    return;
  }

  const displayNameInput = form.elements.namedItem("displayName");
  const defaultDisplayName = resolveConnectorDefaultName(connector, fieldValues);
  const displayName =
    displayNameInput instanceof HTMLInputElement
      ? normalizeText(displayNameInput.value, defaultDisplayName)
      : defaultDisplayName;

  const snapshot = await getStorageSnapshot();
  const existingByName = snapshot.providers.find(
    (provider) => provider.name.toLowerCase() === displayName.toLowerCase(),
  );
  if (existingByName !== undefined) {
    setFeedback(feedbackNode, {
      kind: "error",
      title: "Duplicate display name",
      message: "A provider with that display name already exists. Use a different name.",
    });
    return;
  }

  let provider: StoredProvider = {
    id: createProviderId(connector.id),
    name: displayName,
    type: connector.type,
    status: testResult.status,
    models: testResult.models,
    lastSyncedAt: Date.now(),
    metadata: connector.sanitizeMetadata(fieldValues),
  };
  if (connector.id === "local-cli-bridge") {
    provider = await hydrateCliProviderMetadata({
      provider,
      hostName: normalizeText(
        fieldValues["nativeHostName"] ?? "com.byom.bridge",
        "com.byom.bridge",
      ),
      cliType: cliClientById(fieldValues["cliType"]).id,
      selectedModelId: normalizeText(fieldValues["modelId"] ?? "", ""),
      selectedThinkingLevel: normalizeText(fieldValues["thinkingLevel"] ?? "", ""),
    });
  }

  const providers = [...snapshot.providers, provider];
  const preferredModelId =
    connector.id === "local-cli-bridge" || connector.id === "ollama"
      ? normalizeText(fieldValues["modelId"] ?? "")
      : "";
  const initialModelId =
    preferredModelId.length > 0 && provider.models.some((model) => model.id === preferredModelId)
      ? preferredModelId
      : provider.models[0]?.id;
  const activeProvider =
    snapshot.activeProvider ??
    (initialModelId !== undefined
      ? { providerId: provider.id, modelId: initialModelId }
      : { providerId: provider.id });

  await writeStorageState({
    providers,
    activeProvider,
    clearError: true,
  });

  setFeedback(feedbackNode, {
    kind: "success",
    title: "Provider saved",
    message: `${provider.name} connected successfully.`,
  });

  const displayInput = form.elements.namedItem("displayName");
  if (displayInput instanceof HTMLInputElement) {
    displayInput.value = "";
  }

  for (const field of connector.fields) {
    const fieldElement = form.elements.namedItem(field.key);
    if (fieldElement instanceof HTMLInputElement && field.type === "password") {
      fieldElement.value = "";
    }
  }

  await refreshConnectedProviders(providersContainer);
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("provider-connect-form");
  const connectorSelect = document.getElementById("provider-connector");
  const fieldsContainer = document.getElementById("provider-connector-fields");
  const feedbackNode = document.getElementById("provider-connect-feedback");
  const btnTest = document.getElementById("btn-test-connection");
  const btnSave = document.getElementById("btn-save-provider");
  const providersContainer = document.getElementById("connected-providers-list");

  if (
    !(form instanceof HTMLFormElement) ||
    !(connectorSelect instanceof HTMLSelectElement) ||
    !(fieldsContainer instanceof HTMLElement) ||
    !(feedbackNode instanceof HTMLElement) ||
    !(btnTest instanceof HTMLButtonElement) ||
    !(btnSave instanceof HTMLButtonElement) ||
    !(providersContainer instanceof HTMLElement)
  ) {
    console.error("BYOM Wallet options page failed to initialize required elements.");
    return;
  }

  setupConnectorPicker(form, connectorSelect, fieldsContainer, feedbackNode);
  void refreshConnectedProviders(providersContainer);

  const actionButtons: readonly HTMLButtonElement[] = [btnTest, btnSave];

  form.addEventListener("change", (event) => {
    const target = event.target;
    if (
      connectorSelect.value === "local-cli-bridge" &&
      target instanceof HTMLSelectElement &&
      target.name === "cliType"
    ) {
      void syncCliModelSelector(form);
      return;
    }

    if (
      connectorSelect.value === "local-cli-bridge" &&
      target instanceof HTMLInputElement &&
      target.name === "nativeHostName"
    ) {
      void syncCliModelSelector(form);
      return;
    }

    if (
      connectorSelect.value === "local-cli-bridge" &&
      target instanceof HTMLSelectElement &&
      target.name === "modelId"
    ) {
      void syncCliThinkingSelector(form);
      return;
    }

    if (
      connectorSelect.value === "ollama" &&
      target instanceof HTMLInputElement &&
      target.name === "baseUrl"
    ) {
      void syncOllamaModelSelector(form);
    }
  });

  btnTest.addEventListener("click", () => {
    const connector = connectorById(connectorSelect.value);

    setButtonsBusy(actionButtons, true);
    clearFeedback(feedbackNode);

    (async () => {
      const fieldValues = collectConnectorFieldValues(form, connector);
      const result = await connector.testConnection(fieldValues);
      if (result.ok) {
        setFeedback(feedbackNode, {
          kind: "success",
          title: "Connection successful",
          message: result.message,
        });
      } else {
        setFeedback(feedbackNode, {
          kind: "error",
          title: "Connection failed",
          message: result.message,
        });
      }
    })()
      .catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        setFeedback(feedbackNode, {
          kind: "error",
          title: "Validation error",
          message: err.message,
        });
      })
      .finally(() => {
        setButtonsBusy(actionButtons, false);
      });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    setButtonsBusy(actionButtons, true);
    clearFeedback(feedbackNode);

    onSaveProvider(form, feedbackNode, providersContainer)
      .catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        setFeedback(feedbackNode, {
          kind: "error",
          title: "Save failed",
          message: err.message,
        });
      })
      .finally(() => {
        setButtonsBusy(actionButtons, false);
      });
  });

  providersContainer.addEventListener("click", (event) => {
    void handleProviderAction(event, providersContainer, feedbackNode).catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      setFeedback(feedbackNode, {
        kind: "error",
        title: "Provider action failed",
        message: err.message,
      });
    });
  });

  providersContainer.addEventListener("change", (event) => {
    void handleProviderModelChange(event, providersContainer, feedbackNode).catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      setFeedback(feedbackNode, {
        kind: "error",
        title: "Model update failed",
        message: err.message,
      });
    });
  });
});

