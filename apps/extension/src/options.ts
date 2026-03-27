import { createCloudConnectors } from "./options/connectors/index.js";
import {
  BRIDGE_PAIRING_STATE_STORAGE_KEY,
  createPairingCompletionData,
  parseBridgePairingState,
  parsePairingBeginPayload,
  unwrapPairingKeyMaterial,
  wrapPairingKeyMaterial,
  type BridgePairingState,
  type PairingBeginPayload,
} from "./transport/bridge-pairing.js";

type ProviderModel = Readonly<{
  id: string;
  name: string;
}>;

type ProviderStatus =
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
  metadata?: Readonly<Record<string, string>>;
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

type ProviderEditState = Readonly<{
  providerId: string;
  providerName: string;
}>;

const STORAGE_KEY_PROVIDERS = "byom.wallet.providers.v1";
const STORAGE_KEY_ACTIVE = "byom.wallet.activeProvider.v1";
const STORAGE_KEY_LAST_ERROR = "byom.wallet.ui.lastError.v1";
const PROVIDER_ID_PREFIX = "provider";
const NATIVE_MESSAGE_TIMEOUT_MS = 15_000;
const DEFAULT_CLOUD_POLICY_VERSION = "policy.unknown";

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

function resolveCloudBindingContextForOptions(): Readonly<{
  extensionId: string;
  origin: string;
  policyVersion: string;
}> {
  const extensionId =
    typeof chrome.runtime.id === "string" ? chrome.runtime.id.trim() : "";
  if (extensionId.length === 0) {
    throw new Error(
      "Cloud connection binding requires a non-empty extension runtime ID.",
    );
  }
  const origin =
    typeof window.location.origin === "string"
      ? window.location.origin.trim()
      : "";
  if (origin.length === 0) {
    throw new Error(
      "Cloud connection binding requires a non-empty extension origin.",
    );
  }
  return {
    extensionId,
    origin,
    policyVersion: DEFAULT_CLOUD_POLICY_VERSION,
  };
}

function withCloudConnectionBinding(
  message: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  if (message["type"] !== "cloud.connection.complete") {
    return message;
  }
  const binding = resolveCloudBindingContextForOptions();
  const extensionId =
    typeof message["extensionId"] === "string" ? message["extensionId"].trim() : "";
  const origin = typeof message["origin"] === "string" ? message["origin"].trim() : "";
  const policyVersion =
    typeof message["policyVersion"] === "string" ? message["policyVersion"].trim() : "";
  return {
    ...message,
    extensionId: extensionId.length > 0 ? extensionId : binding.extensionId,
    origin: origin.length > 0 ? origin : binding.origin,
    policyVersion: policyVersion.length > 0 ? policyVersion : binding.policyVersion,
  };
}

function withCloudCompletionBindingFromRequest(
  request: Readonly<Record<string, unknown>>,
  response: unknown,
): unknown {
  if (
    request["type"] !== "cloud.connection.complete" ||
    !isRecord(response) ||
    response["type"] !== "cloud.connection.complete"
  ) {
    return response;
  }
  const extensionId =
    typeof request["extensionId"] === "string" ? request["extensionId"].trim() : "";
  const origin = typeof request["origin"] === "string" ? request["origin"].trim() : "";
  const policyVersion =
    typeof request["policyVersion"] === "string" ? request["policyVersion"].trim() : "";
  return {
    ...response,
    ...(extensionId.length > 0 &&
      !(typeof response["extensionId"] === "string" && response["extensionId"].trim().length > 0)
      ? { extensionId }
      : {}),
    ...(origin.length > 0 &&
      !(typeof response["origin"] === "string" && response["origin"].trim().length > 0)
      ? { origin }
      : {}),
    ...(policyVersion.length > 0 &&
      !(typeof response["policyVersion"] === "string" && response["policyVersion"].trim().length > 0)
      ? { policyVersion }
      : {}),
  };
}

function formatDiscoveredCloudModelsMessage(modelCount: number): string {
  if (modelCount === 1) {
    return "1 model discovered for this cloud connection.";
  }
  return `${modelCount} models discovered for this cloud connection.`;
}

function getCloudModelDiscoveryNotice(options: Readonly<{
  connectorType: StoredProvider["type"];
  result: ConnectionTestResult;
}>): string | undefined {
  if (options.connectorType !== "cloud" || !options.result.ok) {
    return undefined;
  }
  return formatDiscoveredCloudModelsMessage(options.result.models.length);
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

function parseCloudDiscoveredModels(value: unknown): ProviderModel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const models: ProviderModel[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const id = typeof entry["id"] === "string" ? entry["id"].trim() : "";
    if (id.length === 0) {
      continue;
    }
    const displayName =
      typeof entry["displayName"] === "string"
        ? entry["displayName"].trim()
        : typeof entry["name"] === "string"
          ? entry["name"].trim()
          : "";
    models.push({
      id,
      name: displayName.length > 0 ? displayName : id,
    });
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

function connectorIdForProvider(provider: StoredProvider): string {
  if (provider.type === "local") {
    return "ollama";
  }
  if (provider.type === "cli") {
    return "local-cli-bridge";
  }
  const methodId = normalizeText(provider.metadata?.["methodId"] ?? "");
  switch (methodId) {
    case "anthropic.api_key":
    case "anthropic.oauth_subscription":
      return "cloud-anthropic";
    case "foundry.api_key":
      return "cloud-foundry";
    case "vertex.service_account":
    case "vertex.api_key":
      return "cloud-vertex";
    case "bedrock.assume_role":
    case "bedrock.api_key":
      return "cloud-bedrock";
    case "openai.api_key":
      return "cloud-openai";
    case "perplexity.api_key":
      return "cloud-perplexity";
    case "gemini.api_key":
    case "gemini.oauth_access_token":
      return "cloud-gemini";
    default:
      throw new Error(
        `Cannot edit provider "${provider.name}" because its connector cannot be inferred.`,
      );
  }
}

function deriveEditFieldValues(
  provider: StoredProvider,
  connector: ConnectorDefinition,
): Readonly<Record<string, string>> {
  const metadata = provider.metadata ?? {};
  const values: Record<string, string> = {};
  for (const field of connector.fields) {
    const metadataValue = metadata[field.key];
    if (typeof metadataValue === "string" && metadataValue.trim().length > 0) {
      values[field.key] = metadataValue.trim();
    }
  }

  if (connector.id === "ollama") {
    const selectedModelId = normalizeText(metadata["selectedModelId"] ?? provider.models[0]?.id ?? "");
    if (selectedModelId.length > 0) {
      values["modelId"] = selectedModelId;
    }
  }

  if (connector.id === "local-cli-bridge") {
    values["cliType"] = normalizeText(metadata["cliType"] ?? "", "copilot-cli");
    const selectedModelId = normalizeText(metadata["selectedModelId"] ?? provider.models[0]?.id ?? "");
    if (selectedModelId.length > 0) {
      values["modelId"] = selectedModelId;
    }
    const thinkingLevel = normalizeText(metadata["thinkingLevel"] ?? "");
    if (thinkingLevel.length > 0) {
      values["thinkingLevel"] = thinkingLevel;
    }
  }

  return values;
}

function resolveCloudSecretFieldKeys(
  connectorId: string,
  fieldValues: Readonly<Record<string, string>>,
): readonly string[] {
  switch (connectorId) {
    case "cloud-anthropic":
      return fieldValues["methodId"] === "anthropic.oauth_subscription"
        ? ["accessToken"]
        : ["apiKey"];
    case "cloud-foundry":
      return ["apiKey"];
    case "cloud-openai":
      return ["apiKey"];
    case "cloud-perplexity":
      return ["apiKey"];
    case "cloud-bedrock":
      return fieldValues["methodId"] === "bedrock.api_key" ? ["apiKey"] : [];
    case "cloud-vertex":
      return fieldValues["methodId"] === "vertex.api_key"
        ? ["apiKey"]
        : ["serviceAccountJson"];
    case "cloud-gemini":
      return fieldValues["methodId"] === "gemini.oauth_access_token"
        ? ["accessToken"]
        : ["apiKey"];
    default:
      return [];
  }
}

function hasCloudSecretInput(
  connectorId: string,
  fieldValues: Readonly<Record<string, string>>,
): boolean {
  const secretKeys = resolveCloudSecretFieldKeys(connectorId, fieldValues);
  if (secretKeys.length === 0) {
    return false;
  }
  return secretKeys.some((key) => normalizeText(fieldValues[key] ?? "").length > 0);
}

function toBridgeErrorMessage(response: unknown): string | undefined {
  if (!isRecord(response)) {
    return "Native host returned an invalid payload.";
  }
  if (response["type"] !== "error") {
    return undefined;
  }
  if (typeof response["message"] === "string" && response["message"].trim().length > 0) {
    return response["message"].trim();
  }
  return "Native host cloud operation failed.";
}

async function validateCloudConnectionViaExistingHandle(options: Readonly<{
  provider: StoredProvider;
  connectorId: string;
  fieldValues: Readonly<Record<string, string>>;
}>): Promise<ConnectionTestResult> {
  const metadata = options.provider.metadata ?? {};
  const nativeHostName = normalizeText(
    options.fieldValues["nativeHostName"] ?? metadata["nativeHostName"] ?? "com.byom.bridge",
    "com.byom.bridge",
  );
  const providerId = normalizeText(
    options.fieldValues["providerId"] ?? metadata["providerId"] ?? "",
  );
  const methodId = normalizeText(options.fieldValues["methodId"] ?? metadata["methodId"] ?? "");
  const connectionHandle = normalizeText(metadata["connectionHandle"] ?? "");
  const endpointProfileHash = normalizeText(metadata["endpointProfileHash"] ?? "");
  if (
    nativeHostName.length === 0 ||
    providerId.length === 0 ||
    methodId.length === 0 ||
    connectionHandle.length === 0
  ) {
    return {
      ok: false,
      status: "attention",
      message:
        "Existing cloud connection metadata is incomplete. Re-enter credentials and re-test to refresh the connection handle.",
      models: [],
    };
  }

  let binding: Readonly<{
    extensionId: string;
    origin: string;
    policyVersion: string;
  }>;
  try {
    binding = resolveCloudBindingContextForOptions();
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: "attention",
      message: `Unable to validate existing cloud connection binding context: ${err}`,
      models: [],
    };
  }

  const validateResponse = await sendNativeMessage(
    nativeHostName,
    {
      type: "cloud.connection.validate",
      providerId,
      methodId,
      connectionHandle,
      extensionId: binding.extensionId,
      origin: binding.origin,
      policyVersion: binding.policyVersion,
      ...(endpointProfileHash.length > 0 ? { endpointProfileHash } : {}),
    },
    { timeoutMs: 10_000 },
  );
  if (!validateResponse.ok) {
    return {
      ok: false,
      status: "attention",
      message: `Unable to validate the existing cloud connection handle without credentials: ${formatNativeHostRuntimeError(validateResponse.errorMessage)}`,
      models: [],
    };
  }
  const bridgeError = toBridgeErrorMessage(validateResponse.response);
  if (bridgeError !== undefined) {
    return {
      ok: false,
      status: "attention",
      message: bridgeError.toLowerCase().includes("unknown connection handle")
        ? "Stored cloud connection handle is no longer valid in the bridge. For security, credentials are never persisted in extension storage; enter credentials once to mint a new handle."
        : `Unable to validate the existing cloud connection handle without credentials: ${bridgeError}`,
      models: [],
    };
  }
  if (
    !isRecord(validateResponse.response) ||
    validateResponse.response["type"] !== "cloud.connection.validate" ||
    validateResponse.response["valid"] !== true
  ) {
    return {
      ok: false,
      status: "attention",
      message:
        "Unable to validate the existing cloud connection handle without credentials: Native host returned an unexpected validation payload.",
      models: [],
    };
  }

  const discoverResponse = await sendNativeMessage(
    nativeHostName,
    {
      type: "cloud.models.discover",
      providerId,
      methodId,
      connectionHandle,
      extensionId: binding.extensionId,
      origin: binding.origin,
      policyVersion: binding.policyVersion,
      ...(endpointProfileHash.length > 0 ? { endpointProfileHash } : {}),
      refresh: true,
    },
    { timeoutMs: 10_000 },
  );
  if (!discoverResponse.ok) {
    return {
      ok: false,
      status: "attention",
      message:
        `Unable to refresh cloud models for the existing connection handle: ${formatNativeHostRuntimeError(discoverResponse.errorMessage)}`,
      models: [],
    };
  }
  if (!isRecord(discoverResponse.response)) {
    return {
      ok: false,
      status: "attention",
      message:
        "Unable to refresh cloud models for the existing connection handle: Native host returned an invalid payload.",
      models: [],
    };
  }
  const discoverError = toBridgeErrorMessage(discoverResponse.response);
  if (discoverError !== undefined) {
    return {
      ok: false,
      status: "attention",
      message:
        `Unable to refresh cloud models for the existing connection handle: ${discoverError}`,
      models: [],
    };
  }
  if (discoverResponse.response["type"] !== "cloud.models.discover") {
    return {
      ok: false,
      status: "attention",
      message:
        "Unable to refresh cloud models for the existing connection handle: Native host returned an unexpected discovery payload.",
      models: [],
    };
  }
  const discovered = parseCloudDiscoveredModels(discoverResponse.response["models"]);
  if (discovered.length === 0) {
    return {
      ok: false,
      status: "attention",
      message:
        "No models were discovered for this cloud connection handle. Re-enter credentials and re-test to refresh model access.",
      models: [],
    };
  }

  return {
    ok: true,
    status: "connected",
    message:
      `Existing cloud connection handle for ${options.provider.name} was revalidated via native bridge.`,
    models: discovered,
    metadata: {
      providerId,
      methodId,
      nativeHostName,
      connectionHandle,
      policyVersion: binding.policyVersion,
      ...(endpointProfileHash.length > 0 ? { endpointProfileHash } : {}),
    },
  };
}

export const __optionsTestHooks = {
  validateCloudConnectionViaExistingHandle,
  formatDiscoveredCloudModelsMessage,
  getCloudModelDiscoveryNotice,
};

function parseStoredProvider(value: unknown): StoredProvider | null {
  if (!isRecord(value)) return null;

  if (
    typeof value["id"] !== "string" ||
    typeof value["name"] !== "string" ||
    (value["type"] !== "local" && value["type"] !== "cloud" && value["type"] !== "cli") ||
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

async function readBridgePairingState(): Promise<ReturnType<typeof parseBridgePairingState>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([BRIDGE_PAIRING_STATE_STORAGE_KEY], (rawState) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError !== undefined) {
        reject(new Error(runtimeError.message ?? "Failed to read bridge pairing state."));
        return;
      }
      resolve(parseBridgePairingState(rawState[BRIDGE_PAIRING_STATE_STORAGE_KEY]));
    });
  });
}

async function writeBridgePairingState(pairingState: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(
      {
        [BRIDGE_PAIRING_STATE_STORAGE_KEY]: pairingState ?? null,
      },
      () => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError !== undefined) {
          reject(new Error(runtimeError.message ?? "Failed to write bridge pairing state."));
          return;
        }
        resolve();
      },
    );
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
    let bridgedMessage: Readonly<Record<string, unknown>>;
    try {
      bridgedMessage = withCloudConnectionBinding(message);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      resolve({
        ok: false,
        errorMessage: err.message,
      });
      return;
    }
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
      chrome.runtime.sendNativeMessage(hostName, bridgedMessage, (response) => {
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
          response: withCloudCompletionBindingFromRequest(bridgedMessage, response),
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

const LOCAL_CONNECTORS: readonly ConnectorDefinition[] = [
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
];

const CLOUD_CONNECTORS: readonly ConnectorDefinition[] = createCloudConnectors({
  sendNativeMessage,
  formatNativeHostRuntimeError,
  defaultNativeHostName: "com.byom.bridge",
});

const CLI_CONNECTOR: ConnectorDefinition = {
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
};

const CONNECTORS: readonly ConnectorDefinition[] = [
  ...LOCAL_CONNECTORS,
  ...CLOUD_CONNECTORS,
  CLI_CONNECTOR,
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

function readConnectorFieldValues(
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
    values[field.key] = fieldElement.value.trim();
  }
  return values;
}

function collectConnectorFieldValues(
  form: HTMLFormElement,
  connector: ConnectorDefinition,
  options: Readonly<{
    skipRequiredKeys?: readonly string[];
  }> = {},
): Readonly<Record<string, string>> {
  const values = readConnectorFieldValues(form, connector);
  const skipRequiredKeys = new Set(options.skipRequiredKeys ?? []);
  for (const field of connector.fields) {
    if (field.required !== true) {
      continue;
    }
    if (skipRequiredKeys.has(field.key)) {
      continue;
    }
    if (normalizeText(values[field.key] ?? "").length === 0) {
      throw new Error(`"${field.label}" is required.`);
    }
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

function isCloudValidationOnlyProvider(provider: StoredProvider): boolean {
  return provider.type === "cloud" && provider.status === "attention";
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
    const isValidationOnly = isCloudValidationOnlyProvider(provider);
    const statusLabelByStatus: Record<ProviderStatus, string> = {
      connected: "Connected",
      disconnected: "Disconnected",
      attention: "Needs attention",
      reconnecting: "Reconnecting",
      failed: "Action required",
      revoked: "Revoked",
      degraded: "Degraded",
    };
    const statusLabel = statusLabelByStatus[provider.status];
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
        <button class="btn btn--secondary btn--small" type="button" data-provider-action="activate" data-provider-id="${escapeHtml(provider.id)}"${isValidationOnly ? ' disabled aria-disabled="true" title="Cloud provider is in validation-only mode."' : ""}>
          ${isActive ? "Active" : "Set Active"}
        </button>
        <button class="btn btn--secondary btn--small" type="button" data-provider-action="edit" data-provider-id="${escapeHtml(provider.id)}">
          Edit
        </button>
        ${provider.models.length > 0
        ? `<select class="provider-model-select" data-provider-action="model" data-provider-id="${escapeHtml(provider.id)}"${isValidationOnly ? ' disabled aria-disabled="true"' : ""}>${modelOptions}</select>`
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
  options: Readonly<{
    onEditProvider?: (
      provider: StoredProvider,
      snapshot: ProviderStorageSnapshot,
    ) => Promise<void>;
    onProviderRemoved?: (providerId: string) => Promise<void>;
  }> = {},
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
    if (isCloudValidationOnlyProvider(provider)) {
      setFeedback(feedbackNode, {
        kind: "info",
        title: "Validation-only provider",
        message:
          "This cloud provider passed direct endpoint validation, but bridge cloud execution is still disabled by policy. Re-test and save after enabling cloud execution.",
      });
      await refreshConnectedProviders(providersContainer);
      return;
    }

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

  if (action === "edit") {
    if (options.onEditProvider === undefined) {
      throw new Error("Provider edit handler is not configured.");
    }
    await options.onEditProvider(provider, snapshot);
    setFeedback(feedbackNode, {
      kind: "info",
      title: "Edit mode enabled",
      message:
        `Editing ${provider.name}. Re-test is required before update. Secret fields can be left blank to reuse the existing cloud connection handle.`,
    });
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
    if (options.onProviderRemoved !== undefined) {
      await options.onProviderRemoved(providerId);
    }
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

  if (isCloudValidationOnlyProvider(provider)) {
    setFeedback(feedbackNode, {
      kind: "info",
      title: "Validation-only provider",
      message:
        "This cloud provider is not yet eligible for chat execution. Enable bridge cloud execution, re-test, and save again.",
    });
    await refreshConnectedProviders(providersContainer);
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

async function syncDynamicConnectorFields(form: HTMLFormElement, connector: ConnectorDefinition): Promise<void> {
  if (connector.id === "local-cli-bridge") {
    await syncCliModelSelector(form);
    await syncCliThinkingSelector(form);
    return;
  }
  if (connector.id === "ollama") {
    await syncOllamaModelSelector(form);
  }
}

function applyConnectorFieldValues(
  form: HTMLFormElement,
  connector: ConnectorDefinition,
  values: Readonly<Record<string, string>>,
): void {
  for (const field of connector.fields) {
    const fieldElement = form.elements.namedItem(field.key);
    if (
      !(fieldElement instanceof HTMLInputElement) &&
      !(fieldElement instanceof HTMLSelectElement)
    ) {
      continue;
    }
    if (field.type === "password") {
      fieldElement.value = "";
      continue;
    }
    const value = normalizeText(values[field.key] ?? "");
    if (value.length > 0) {
      fieldElement.value = value;
    }
  }
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

type PairingDescriptor = Readonly<{
  pairingHandle: string;
  extensionId: string;
  hostName: string;
  createdAt: string;
  rotatedFromPairingHandle?: string;
}>;

function normalizeBridgeHostName(rawValue: string): string {
  const normalized = rawValue.trim();
  if (!/^[a-z0-9]+(\.[a-z0-9-]+)+$/i.test(normalized)) {
    throw new Error("Bridge host name is invalid.");
  }
  return normalized;
}

function parsePairingDescriptors(payload: unknown): readonly PairingDescriptor[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  const descriptors: PairingDescriptor[] = [];
  for (const entry of payload) {
    if (
      !isRecord(entry) ||
      typeof entry["pairingHandle"] !== "string" ||
      typeof entry["extensionId"] !== "string" ||
      typeof entry["hostName"] !== "string" ||
      typeof entry["createdAt"] !== "string"
    ) {
      continue;
    }
    descriptors.push({
      pairingHandle: entry["pairingHandle"].trim(),
      extensionId: entry["extensionId"].trim(),
      hostName: entry["hostName"].trim(),
      createdAt: entry["createdAt"].trim(),
      ...(typeof entry["rotatedFromPairingHandle"] === "string" &&
        entry["rotatedFromPairingHandle"].trim().length > 0
        ? { rotatedFromPairingHandle: entry["rotatedFromPairingHandle"].trim() }
        : {}),
    });
  }
  return descriptors;
}

function parseNativeReason(message: unknown): string {
  if (
    isRecord(message) &&
    message["type"] === "error" &&
    typeof message["message"] === "string"
  ) {
    return message["message"];
  }
  return "Native bridge returned an unexpected response.";
}

function renderPairingSelector(
  selectNode: HTMLSelectElement,
  pairings: readonly PairingDescriptor[],
  preferredHandle?: string,
): void {
  const options = pairings.map((pairing) => ({
    value: pairing.pairingHandle,
    label: `${pairing.pairingHandle} (${pairing.hostName})`,
  }));
  if (options.length === 0) {
    selectNode.innerHTML = `<option value="">No pairings found</option>`;
    selectNode.disabled = true;
    return;
  }
  selectNode.disabled = false;
  selectNode.innerHTML = options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}"${preferredHandle !== undefined && preferredHandle === option.value
          ? " selected"
          : ""
        }>${escapeHtml(option.label)}</option>`,
    )
    .join("");
}

function setupBridgeSecurityControls(options: {
  hostInput: HTMLInputElement;
  pairingCodeInput: HTMLInputElement;
  beginButton: HTMLButtonElement;
  completeButton: HTMLButtonElement;
  rotateButton: HTMLButtonElement;
  refreshButton: HTMLButtonElement;
  revokeButton: HTMLButtonElement;
  pairingSelect: HTMLSelectElement;
  feedbackNode: HTMLElement;
}): void {
  const extensionId =
    typeof chrome.runtime.id === "string" && chrome.runtime.id.trim().length > 0
      ? chrome.runtime.id.trim()
      : undefined;
  if (extensionId === undefined) {
    setFeedback(options.feedbackNode, {
      kind: "error",
      title: "Pairing unavailable",
      message: "Extension runtime ID is unavailable; secure bridge pairing is disabled.",
    });
    return;
  }

  let pendingPairingBegin: PairingBeginPayload | undefined;
  const actionButtons: readonly HTMLButtonElement[] = [
    options.beginButton,
    options.completeButton,
    options.rotateButton,
    options.refreshButton,
    options.revokeButton,
  ];

  const refreshPairings = async (
    hostName: string,
    preferredHandle?: string,
  ): Promise<readonly PairingDescriptor[]> => {
    const response = await sendNativeMessage(
      hostName,
      {
        type: "pairing.list",
        extensionId,
        hostName,
      },
      { timeoutMs: 10_000 },
    );
    if (!response.ok) {
      throw new Error(formatNativeHostRuntimeError(response.errorMessage));
    }
    if (
      !isRecord(response.response) ||
      response.response["type"] !== "pairing.list"
    ) {
      throw new Error(parseNativeReason(response.response));
    }
    const pairings = parsePairingDescriptors(response.response["pairings"]);
    renderPairingSelector(options.pairingSelect, pairings, preferredHandle);
    return pairings;
  };

  const refreshFeedback = async (): Promise<void> => {
    const hostName = normalizeBridgeHostName(options.hostInput.value);
    const pairingState = await readBridgePairingState();
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
        setFeedback(options.feedbackNode, {
          kind: "info",
          title: "Bridge paired",
          message:
            `Paired via handle ${pairingState.pairingHandle}. Use Rotate Pairing for key rotation or Revoke Pairing to disable cloud chat handshake.`,
        });
        await refreshPairings(hostName, pairingState.pairingHandle);
        return;
      }
    }
    setFeedback(options.feedbackNode, {
      kind: "info",
      title: "Bridge pairing required",
      message:
        "Cloud chat requires secure bridge pairing. Click Pair Bridge for one-click pairing. If auto-pair is unavailable, enter the one-time code and click Complete Pairing.",
    });
    await refreshPairings(hostName);
  };

  const completePairing = async (
    beginPayload: PairingBeginPayload,
    pairingCode: string,
  ): Promise<BridgePairingState> => {
    const completion = await createPairingCompletionData({
      pairingBegin: beginPayload,
      pairingCode,
    });
    const completeResponse = await sendNativeMessage(
      beginPayload.hostName,
      {
        type: "pairing.complete",
        pairingSessionId: beginPayload.pairingSessionId,
        extensionId: beginPayload.extensionId,
        hostName: beginPayload.hostName,
        extensionPublicKey: completion.extensionPublicKey,
        proof: completion.proof,
      },
      { timeoutMs: 10_000 },
    );
    if (!completeResponse.ok) {
      throw new Error(formatNativeHostRuntimeError(completeResponse.errorMessage));
    }
    if (
      !isRecord(completeResponse.response) ||
      completeResponse.response["type"] !== "pairing.complete" ||
      typeof completeResponse.response["pairingHandle"] !== "string"
    ) {
      throw new Error(parseNativeReason(completeResponse.response));
    }
    const wrappedState = await wrapPairingKeyMaterial({
      pairingHandle: completeResponse.response["pairingHandle"],
      extensionId: beginPayload.extensionId,
      hostName: beginPayload.hostName,
      pairingKeyHex: completion.pairingKeyHex,
      runtimeId: extensionId,
      createdAt:
        typeof completeResponse.response["createdAt"] === "string"
          ? completeResponse.response["createdAt"]
          : new Date().toISOString(),
      ...(typeof completeResponse.response["rotatedFromPairingHandle"] === "string"
        ? {
          rotatedFromPairingHandle:
            completeResponse.response["rotatedFromPairingHandle"],
        }
        : {}),
    });
    await writeBridgePairingState(wrappedState);
    return wrappedState;
  };

  void refreshFeedback().catch((error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    setFeedback(options.feedbackNode, {
      kind: "error",
      title: "Pairing state read failed",
      message: err.message,
    });
  });

  options.beginButton.addEventListener("click", () => {
    setButtonsBusy(actionButtons, true);
    clearFeedback(options.feedbackNode);
    (async () => {
      const hostName = normalizeBridgeHostName(options.hostInput.value);
      const beginResponse = await sendNativeMessage(
        hostName,
        {
          type: "pairing.begin",
          extensionId,
          hostName,
          includeOneTimeCode: true,
        },
        { timeoutMs: 10_000 },
      );
      if (!beginResponse.ok) {
        throw new Error(formatNativeHostRuntimeError(beginResponse.errorMessage));
      }
      if (isRecord(beginResponse.response) && beginResponse.response["type"] === "error") {
        throw new Error(parseNativeReason(beginResponse.response));
      }
      const beginPayload = parsePairingBeginPayload(beginResponse.response);
      if (typeof beginPayload.oneTimeCode === "string" && beginPayload.oneTimeCode.length > 0) {
        try {
          const wrappedState = await completePairing(
            beginPayload,
            beginPayload.oneTimeCode,
          );
          pendingPairingBegin = undefined;
          options.pairingCodeInput.value = "";
          setFeedback(options.feedbackNode, {
            kind: "success",
            title: "Bridge paired",
            message:
              `Secure pairing completed in one click. Handle ${wrappedState.pairingHandle} is active for ${wrappedState.hostName}.`,
          });
          await refreshPairings(
            wrappedState.hostName,
            wrappedState.pairingHandle,
          );
          return;
        } catch (error) {
          const autoPairError = error instanceof Error ? error.message : String(error);
          const codeRetrievalHint =
            beginPayload.codeRetrievalHint ?? "the bridge terminal output";
          pendingPairingBegin = beginPayload;
          options.pairingCodeInput.value = "";
          setFeedback(options.feedbackNode, {
            kind: "info",
            title: "Pairing started (manual fallback)",
            message:
              `One-click pairing failed (${autoPairError}). Enter the ${String(beginPayload.codeLength)}-character one-time code shown in ${codeRetrievalHint}. Session expires at ${beginPayload.expiresAt}.`,
          });
          await refreshPairings(hostName);
          return;
        }
      }

      pendingPairingBegin = beginPayload;
      options.pairingCodeInput.value = "";
      const codeRetrievalHint =
        beginPayload.codeRetrievalHint ?? "the bridge terminal output";
      setFeedback(options.feedbackNode, {
        kind: "info",
        title: "Pairing started",
        message:
          `Enter the ${String(beginPayload.codeLength)}-character one-time code shown in ${codeRetrievalHint}. Session expires at ${beginPayload.expiresAt}.`,
      });
      await refreshPairings(hostName);
    })()
      .catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        setFeedback(options.feedbackNode, {
          kind: "error",
          title: "Pairing begin failed",
          message: err.message,
        });
      })
      .finally(() => {
        setButtonsBusy(actionButtons, false);
      });
  });

  options.completeButton.addEventListener("click", () => {
    setButtonsBusy(actionButtons, true);
    clearFeedback(options.feedbackNode);
    (async () => {
      if (pendingPairingBegin === undefined) {
        throw new Error("No active pairing session. Click Pair Bridge first.");
      }
      const wrappedState = await completePairing(
        pendingPairingBegin,
        options.pairingCodeInput.value,
      );
      pendingPairingBegin = undefined;
      options.pairingCodeInput.value = "";
      setFeedback(options.feedbackNode, {
        kind: "success",
        title: "Bridge paired",
        message:
          `Secure pairing completed. Handle ${wrappedState.pairingHandle} is active for ${wrappedState.hostName}.`,
      });
      await refreshPairings(
        wrappedState.hostName,
        wrappedState.pairingHandle,
      );
    })()
      .catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        setFeedback(options.feedbackNode, {
          kind: "error",
          title: "Pairing complete failed",
          message: err.message,
        });
      })
      .finally(() => {
        setButtonsBusy(actionButtons, false);
      });
  });

  options.refreshButton.addEventListener("click", () => {
    setButtonsBusy(actionButtons, true);
    clearFeedback(options.feedbackNode);
    (async () => {
      const hostName = normalizeBridgeHostName(options.hostInput.value);
      await refreshPairings(hostName);
      setFeedback(options.feedbackNode, {
        kind: "info",
        title: "Pairings refreshed",
        message: `Fetched pairing handles for ${hostName}.`,
      });
    })()
      .catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        setFeedback(options.feedbackNode, {
          kind: "error",
          title: "Pairings refresh failed",
          message: err.message,
        });
      })
      .finally(() => {
        setButtonsBusy(actionButtons, false);
      });
  });

  options.revokeButton.addEventListener("click", () => {
    setButtonsBusy(actionButtons, true);
    clearFeedback(options.feedbackNode);
    (async () => {
      const hostName = normalizeBridgeHostName(options.hostInput.value);
      const pairingHandle = options.pairingSelect.value.trim();
      if (pairingHandle.length === 0) {
        throw new Error("Select a pairing handle to revoke.");
      }
      const revokeResponse = await sendNativeMessage(
        hostName,
        {
          type: "pairing.revoke",
          extensionId,
          hostName,
          pairingHandle,
        },
        { timeoutMs: 10_000 },
      );
      if (!revokeResponse.ok) {
        throw new Error(formatNativeHostRuntimeError(revokeResponse.errorMessage));
      }
      if (
        !isRecord(revokeResponse.response) ||
        revokeResponse.response["type"] !== "pairing.revoke" ||
        revokeResponse.response["revoked"] !== true
      ) {
        throw new Error(parseNativeReason(revokeResponse.response));
      }

      const currentState = await readBridgePairingState();
      if (
        currentState !== undefined &&
        currentState.pairingHandle === pairingHandle
      ) {
        await writeBridgePairingState(undefined);
      }

      setFeedback(options.feedbackNode, {
        kind: "info",
        title: "Pairing revoked",
        message: `Pairing handle ${pairingHandle} has been revoked.`,
      });
      await refreshPairings(hostName);
    })()
      .catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        setFeedback(options.feedbackNode, {
          kind: "error",
          title: "Pairing revoke failed",
          message: err.message,
        });
      })
      .finally(() => {
        setButtonsBusy(actionButtons, false);
      });
  });

  options.rotateButton.addEventListener("click", () => {
    setButtonsBusy(actionButtons, true);
    clearFeedback(options.feedbackNode);
    (async () => {
      const hostName = normalizeBridgeHostName(options.hostInput.value);
      const pairingHandle = options.pairingSelect.value.trim();
      if (pairingHandle.length === 0) {
        throw new Error("Select a pairing handle to rotate.");
      }
      const rotateResponse = await sendNativeMessage(
        hostName,
        {
          type: "pairing.rotate",
          extensionId,
          hostName,
          pairingHandle,
        },
        { timeoutMs: 10_000 },
      );
      if (!rotateResponse.ok) {
        throw new Error(formatNativeHostRuntimeError(rotateResponse.errorMessage));
      }
      if (isRecord(rotateResponse.response) && rotateResponse.response["type"] === "error") {
        throw new Error(parseNativeReason(rotateResponse.response));
      }
      const rotatePayload = parsePairingBeginPayload(rotateResponse.response);
      pendingPairingBegin = rotatePayload;
      options.pairingCodeInput.value = "";
      setFeedback(options.feedbackNode, {
        kind: "info",
        title: "Pairing rotation started",
        message:
          `Enter the one-time code for rotation. Existing handle remains valid until completion.`,
      });
      await refreshPairings(hostName, pairingHandle);
    })()
      .catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        setFeedback(options.feedbackNode, {
          kind: "error",
          title: "Pairing rotation failed",
          message: err.message,
        });
      })
      .finally(() => {
        setButtonsBusy(actionButtons, false);
      });
  });
}

async function onSaveProvider(
  form: HTMLFormElement,
  feedbackNode: HTMLElement,
  providersContainer: HTMLElement,
  options: Readonly<{
    editState: ProviderEditState | null;
    setEditState: (next: ProviderEditState | null) => void;
    syncEditUi: () => void;
  }>,
): Promise<void> {
  const connectorSelect = form.elements.namedItem("connector");
  if (!(connectorSelect instanceof HTMLSelectElement)) {
    throw new Error("Connector selector is not available.");
  }

  const connector = connectorById(connectorSelect.value);
  const isEditMode = options.editState !== null;
  const provisionalFieldValues = readConnectorFieldValues(form, connector);
  const requiredFieldSkips =
    isEditMode && connector.type === "cloud"
      ? resolveCloudSecretFieldKeys(connector.id, provisionalFieldValues)
      : [];
  const fieldValues = collectConnectorFieldValues(form, connector, {
    skipRequiredKeys: requiredFieldSkips,
  });
  let testResult: ConnectionTestResult;
  if (
    isEditMode &&
    connector.type === "cloud" &&
    !hasCloudSecretInput(connector.id, fieldValues)
  ) {
    const editingSnapshot = await getStorageSnapshot();
    const editingProvider = editingSnapshot.providers.find(
      (candidate) => candidate.id === options.editState?.providerId,
    );
    if (editingProvider === undefined) {
      setFeedback(feedbackNode, {
        kind: "error",
        title: "Edit target missing",
        message: "The provider being edited no longer exists. Edit mode was reset.",
      });
      options.setEditState(null);
      options.syncEditUi();
      await refreshConnectedProviders(providersContainer);
      return;
    }
    testResult = await validateCloudConnectionViaExistingHandle({
      provider: editingProvider,
      connectorId: connector.id,
      fieldValues,
    });
  } else {
    testResult = await connector.testConnection(fieldValues);
  }

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
    (provider) =>
      provider.name.toLowerCase() === displayName.toLowerCase() &&
      (!isEditMode || provider.id !== options.editState?.providerId),
  );
  if (existingByName !== undefined) {
    setFeedback(feedbackNode, {
      kind: "error",
      title: "Duplicate display name",
      message: "A provider with that display name already exists. Use a different name.",
    });
    return;
  }

  const sanitizedMetadata = connector.sanitizeMetadata(fieldValues);
  let provider: StoredProvider = {
    id: isEditMode ? options.editState!.providerId : createProviderId(connector.id),
    name: displayName,
    type: connector.type,
    status: testResult.status,
    models: testResult.models,
    lastSyncedAt: Date.now(),
    metadata: {
      ...sanitizedMetadata,
      ...(testResult.metadata ?? {}),
    },
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

  const providers = isEditMode
    ? snapshot.providers.map((candidate) =>
      candidate.id === options.editState?.providerId ? provider : candidate,
    )
    : [...snapshot.providers, provider];
  const preferredModelId =
    connector.id === "local-cli-bridge" || connector.id === "ollama"
      ? normalizeText(fieldValues["modelId"] ?? "")
      : "";
  const currentActiveModelId =
    snapshot.activeProvider?.providerId === provider.id
      ? normalizeText(snapshot.activeProvider.modelId ?? "")
      : "";
  const initialModelId =
    preferredModelId.length > 0 && provider.models.some((model) => model.id === preferredModelId)
      ? preferredModelId
      : currentActiveModelId.length > 0 &&
        provider.models.some((model) => model.id === currentActiveModelId)
        ? currentActiveModelId
        : provider.models[0]?.id;
  const shouldAutoActivateProvider = !isCloudValidationOnlyProvider(provider);
  const activeProvider =
    snapshot.activeProvider === null
      ? shouldAutoActivateProvider
        ? initialModelId !== undefined
          ? { providerId: provider.id, modelId: initialModelId }
          : { providerId: provider.id }
        : null
      : snapshot.activeProvider.providerId === provider.id
        ? initialModelId !== undefined
          ? { providerId: provider.id, modelId: initialModelId }
          : { providerId: provider.id }
        : snapshot.activeProvider;

  await writeStorageState({
    providers,
    activeProvider,
    clearError: true,
  });

  if (isCloudValidationOnlyProvider(provider)) {
    setFeedback(feedbackNode, {
      kind: "info",
      title: isEditMode ? "Provider updated with warnings" : "Provider saved with warnings",
      message:
        `${provider.name} is saved in validation-only mode. Cloud chat will remain disabled until bridge cloud execution is enabled, then the provider is re-tested and re-saved.`,
    });
  } else {
    setFeedback(feedbackNode, {
      kind: "success",
      title: isEditMode ? "Provider updated" : "Provider saved",
      message: isEditMode
        ? `${provider.name} updated successfully.`
        : `${provider.name} connected successfully.`,
    });
  }

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

  options.setEditState(null);
  options.syncEditUi();
  await refreshConnectedProviders(providersContainer);
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("provider-connect-form");
  const connectorSelect = document.getElementById("provider-connector");
  const fieldsContainer = document.getElementById("provider-connector-fields");
  const feedbackNode = document.getElementById("provider-connect-feedback");
  const btnTest = document.getElementById("btn-test-connection");
  const btnSave = document.getElementById("btn-save-provider");
  const btnCancelEdit = document.getElementById("btn-cancel-edit-provider");
  const editStateNode = document.getElementById("provider-edit-state");
  const modelDiscoveryStateNode = document.getElementById("provider-model-discovery-state");
  const providersContainer = document.getElementById("connected-providers-list");
  const bridgePairHostInput = document.getElementById("bridge-pair-host-name");
  const bridgePairCodeInput = document.getElementById("bridge-pairing-code");
  const bridgePairBeginButton = document.getElementById("btn-begin-bridge-pairing");
  const bridgePairCompleteButton = document.getElementById("btn-complete-bridge-pairing");
  const bridgePairRotateButton = document.getElementById("btn-rotate-bridge-pairing");
  const bridgePairRefreshButton = document.getElementById("btn-refresh-bridge-pairings");
  const bridgePairRevokeButton = document.getElementById("btn-revoke-bridge-pairing");
  const bridgePairSelect = document.getElementById("bridge-pairing-handle-select");
  const bridgeSecretFeedback = document.getElementById("bridge-security-feedback");

  if (
    !(form instanceof HTMLFormElement) ||
    !(connectorSelect instanceof HTMLSelectElement) ||
    !(fieldsContainer instanceof HTMLElement) ||
    !(feedbackNode instanceof HTMLElement) ||
    !(btnTest instanceof HTMLButtonElement) ||
    !(btnSave instanceof HTMLButtonElement) ||
    !(btnCancelEdit instanceof HTMLButtonElement) ||
    !(editStateNode instanceof HTMLElement) ||
    !(modelDiscoveryStateNode instanceof HTMLElement) ||
    !(providersContainer instanceof HTMLElement)
  ) {
    console.error("BYOM Wallet options page failed to initialize required elements.");
    return;
  }

  setupConnectorPicker(form, connectorSelect, fieldsContainer, feedbackNode);
  void refreshConnectedProviders(providersContainer);
  if (
    bridgePairHostInput instanceof HTMLInputElement &&
    bridgePairCodeInput instanceof HTMLInputElement &&
    bridgePairBeginButton instanceof HTMLButtonElement &&
    bridgePairCompleteButton instanceof HTMLButtonElement &&
    bridgePairRotateButton instanceof HTMLButtonElement &&
    bridgePairRefreshButton instanceof HTMLButtonElement &&
    bridgePairRevokeButton instanceof HTMLButtonElement &&
    bridgePairSelect instanceof HTMLSelectElement &&
    bridgeSecretFeedback instanceof HTMLElement
  ) {
    setupBridgeSecurityControls({
      hostInput: bridgePairHostInput,
      pairingCodeInput: bridgePairCodeInput,
      beginButton: bridgePairBeginButton,
      completeButton: bridgePairCompleteButton,
      rotateButton: bridgePairRotateButton,
      refreshButton: bridgePairRefreshButton,
      revokeButton: bridgePairRevokeButton,
      pairingSelect: bridgePairSelect,
      feedbackNode: bridgeSecretFeedback,
    });
  }

  const actionButtons: readonly HTMLButtonElement[] = [btnTest, btnSave];
  let providerEditState: ProviderEditState | null = null;

  const clearModelDiscoveryState = (): void => {
    modelDiscoveryStateNode.hidden = true;
    modelDiscoveryStateNode.textContent = "";
  };

  const setModelDiscoveryState = (message: string): void => {
    modelDiscoveryStateNode.hidden = false;
    modelDiscoveryStateNode.textContent = message;
  };

  const setProviderEditState = (next: ProviderEditState | null): void => {
    providerEditState = next;
  };

  const syncEditUi = (): void => {
    const isEditing = providerEditState !== null;
    btnSave.textContent = isEditing ? "Update Provider" : "Save Provider";
    btnCancelEdit.hidden = !isEditing;
    btnCancelEdit.disabled = !isEditing;
    btnCancelEdit.setAttribute("aria-disabled", isEditing ? "false" : "true");
    connectorSelect.disabled = isEditing;
    connectorSelect.setAttribute("aria-disabled", isEditing ? "true" : "false");
    if (isEditing) {
      const editingProviderName = providerEditState?.providerName ?? "provider";
      editStateNode.hidden = false;
      editStateNode.textContent = `Editing ${editingProviderName}. Re-test is required before update.`;
      return;
    }
    editStateNode.hidden = true;
    editStateNode.textContent = "";
  };

  const resetProviderFormForCurrentConnector = async (): Promise<void> => {
    const connector = connectorById(connectorSelect.value);
    renderConnectorFields(fieldsContainer, connector);
    await syncDynamicConnectorFields(form, connector);
    const displayInput = form.elements.namedItem("displayName");
    if (displayInput instanceof HTMLInputElement) {
      displayInput.value = "";
    }
  };

  const enterEditMode = async (provider: StoredProvider): Promise<void> => {
    const connectorId = connectorIdForProvider(provider);
    const connector = connectorById(connectorId);
    connectorSelect.value = connector.id;
    renderConnectorFields(fieldsContainer, connector);
    const fieldValues = deriveEditFieldValues(provider, connector);
    applyConnectorFieldValues(form, connector, fieldValues);
    await syncDynamicConnectorFields(form, connector);
    applyConnectorFieldValues(form, connector, fieldValues);
    if (connector.id === "local-cli-bridge") {
      await syncCliThinkingSelector(form);
      applyConnectorFieldValues(form, connector, fieldValues);
    }
    const displayInput = form.elements.namedItem("displayName");
    if (displayInput instanceof HTMLInputElement) {
      displayInput.value = provider.name;
    }
    setProviderEditState({
      providerId: provider.id,
      providerName: provider.name,
    });
    syncEditUi();
  };

  const exitEditMode = async (): Promise<void> => {
    if (providerEditState === null) {
      return;
    }
    setProviderEditState(null);
    syncEditUi();
    await resetProviderFormForCurrentConnector();
  };

  syncEditUi();

  form.addEventListener("change", (event) => {
    clearModelDiscoveryState();
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

  btnCancelEdit.addEventListener("click", () => {
    setButtonsBusy(actionButtons, true);
    clearModelDiscoveryState();
    clearFeedback(feedbackNode);
    exitEditMode()
      .then(() => {
        setFeedback(feedbackNode, {
          kind: "info",
          title: "Edit mode cancelled",
          message: "Provider edit mode was cancelled. You can now add a new provider.",
        });
      })
      .catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        setFeedback(feedbackNode, {
          kind: "error",
          title: "Cancel edit failed",
          message: err.message,
        });
      })
      .finally(() => {
        setButtonsBusy(actionButtons, false);
      });
  });

  btnTest.addEventListener("click", () => {
    const connector = connectorById(connectorSelect.value);

    setButtonsBusy(actionButtons, true);
    clearModelDiscoveryState();
    clearFeedback(feedbackNode);

    (async () => {
      const provisionalFieldValues = readConnectorFieldValues(form, connector);
      const requiredFieldSkips =
        providerEditState !== null && connector.type === "cloud"
          ? resolveCloudSecretFieldKeys(connector.id, provisionalFieldValues)
          : [];
      const fieldValues = collectConnectorFieldValues(form, connector, {
        skipRequiredKeys: requiredFieldSkips,
      });
      let result: ConnectionTestResult;
      if (
        providerEditState !== null &&
        connector.type === "cloud" &&
        !hasCloudSecretInput(connector.id, fieldValues)
      ) {
        const snapshot = await getStorageSnapshot();
        const editingProvider = snapshot.providers.find(
          (candidate) => candidate.id === providerEditState?.providerId,
        );
        if (editingProvider === undefined) {
          await exitEditMode();
          setFeedback(feedbackNode, {
            kind: "error",
            title: "Edit target missing",
            message: "The provider being edited no longer exists. Edit mode was reset.",
          });
          await refreshConnectedProviders(providersContainer);
          return;
        }
        result = await validateCloudConnectionViaExistingHandle({
          provider: editingProvider,
          connectorId: connector.id,
          fieldValues,
        });
      } else {
        result = await connector.testConnection(fieldValues);
      }
      if (result.ok) {
        const modelDiscoveryNotice = getCloudModelDiscoveryNotice({
          connectorType: connector.type,
          result,
        });
        if (modelDiscoveryNotice !== undefined) {
          setModelDiscoveryState(modelDiscoveryNotice);
        } else {
          clearModelDiscoveryState();
        }
        if (connector.type === "cloud" && result.status === "attention") {
          setFeedback(feedbackNode, {
            kind: "info",
            title: "Validation completed with warnings",
            message: result.message,
          });
        } else {
          setFeedback(feedbackNode, {
            kind: "success",
            title: "Connection successful",
            message: result.message,
          });
        }
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
    clearModelDiscoveryState();
    clearFeedback(feedbackNode);

    onSaveProvider(form, feedbackNode, providersContainer, {
      editState: providerEditState,
      setEditState: setProviderEditState,
      syncEditUi,
    })
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
    void handleProviderAction(event, providersContainer, feedbackNode, {
      onEditProvider: async (provider) => {
        await enterEditMode(provider);
      },
      onProviderRemoved: async (providerId) => {
        if (providerEditState?.providerId === providerId) {
          await exitEditMode();
        }
      },
    }).catch((error: unknown) => {
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

