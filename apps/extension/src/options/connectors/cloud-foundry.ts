import type {
  CloudConnectorDependencies,
  ConnectionTestResult,
  ConnectorDefinition,
  ConnectorValidationResult,
  ProviderModel,
} from "./types.js";

export const CLOUD_FOUNDRY_CONNECTOR_ID = "cloud-foundry";

const DEFAULT_NATIVE_HOST_NAME = "com.arlopass.bridge";
const DEFAULT_PROVIDER_ID = "microsoft-foundry";
const DEFAULT_METHOD_ID = "foundry.api_key";
const DEFAULT_API_URL = "https://your-resource.services.ai.azure.com/api/projects/your-project";
const DEFAULT_API_VERSION = "v1";
const NO_MODELS_DISCOVERED_MESSAGE =
  "No models were discovered for this Foundry endpoint. Ensure at least one model is available for your API key.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string | undefined, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("API URL is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("API URL must be a valid URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("API URL must use HTTPS.");
  }

  return parsed.toString().replace(/\/$/, "");
}

function createProvisionalConnectionHandle(providerId: string, methodId: string): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `connh.${providerId}.${methodId}.${Date.now().toString(36)}.pending.${randomPart}`;
}

function parseDiscoveredModels(value: unknown): readonly ProviderModel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const models: ProviderModel[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    // Deployment name is the primary identifier used in API calls
    const id = typeof entry["name"] === "string" ? entry["name"].trim()
      : typeof entry["id"] === "string" ? entry["id"].trim()
      : "";
    if (id.length === 0) {
      continue;
    }

    // Filter: only include models with chat completion capability
    const capabilities = entry["capabilities"];
    if (isRecord(capabilities)) {
      const hasChatCompletion =
        capabilities["chat_completion"] === true ||
        capabilities["completion"] === true ||
        capabilities["inference"] === true;
      if (!hasChatCompletion) {
        continue;
      }
    }

    const modelName = typeof entry["modelName"] === "string" ? entry["modelName"].trim() : "";
    const modelPublisher = typeof entry["modelPublisher"] === "string" ? entry["modelPublisher"].trim() : "";
    const modelVersion = typeof entry["modelVersion"] === "string" ? entry["modelVersion"].trim() : "";
    const displayName =
      typeof entry["displayName"] === "string"
        ? entry["displayName"].trim()
        : "";

    // Build name: "gpt-4o-mini (OpenAI, 2024-07-18)" or just the deployment name
    let name = displayName.length > 0 ? displayName : modelName.length > 0 ? modelName : id;
    const parts = [modelPublisher, modelVersion].filter((p) => p.length > 0).join(", ");
    if (parts.length > 0) {
      name = `${name} (${parts})`;
    }

    models.push({ id, name });
  }
  return models.slice(0, 60);
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

function parseCompletionBindingMetadata(
  response: Readonly<Record<string, unknown>>,
): Readonly<Record<string, string>> {
  const policyVersion = normalizeText(
    typeof response["policyVersion"] === "string" ? response["policyVersion"] : "",
  );
  const endpointProfileHash = normalizeText(
    typeof response["endpointProfileHash"] === "string"
      ? response["endpointProfileHash"]
      : "",
  );
  const metadata: Record<string, string> = {};
  if (policyVersion.length > 0) {
    metadata["policyVersion"] = policyVersion;
  }
  if (endpointProfileHash.length > 0) {
    metadata["endpointProfileHash"] = endpointProfileHash;
  }
  return metadata;
}

async function runFetchCheck(
  url: string,
  options: Readonly<{
    headers?: Readonly<Record<string, string>>;
    timeoutMs?: number;
  }> = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      method: "GET",
      signal: abortController.signal,
      ...(options.headers !== undefined ? { headers: options.headers } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timed out after ${String(timeoutMs)}ms.`);
    }
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function formatTransportError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (normalized.includes("failed to fetch")) {
    return "Unable to reach Foundry endpoint. Verify connectivity and extension connect-src policy.";
  }
  if (normalized.includes("timed out")) {
    return "Foundry endpoint timed out before responding.";
  }
  return `Foundry validation failed: ${message}`;
}

function isPolicyDisabledMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("disabled by policy") || normalized.includes("policy.denied");
}

async function validateFoundryApiEndpoint(
  config: Readonly<Record<string, string>>,
): Promise<ConnectionTestResult> {
  const apiUrl = normalizeUrl(config["apiUrl"] ?? DEFAULT_API_URL);
  const apiVersion = normalizeText(config["apiVersion"], DEFAULT_API_VERSION);
  const apiKey = normalizeText(config["apiKey"]);
  // Use the Foundry REST API Deployments - list endpoint
  const deploymentsUrl = new URL(`${apiUrl}/deployments`);
  deploymentsUrl.searchParams.set("api-version", apiVersion);

  let response: Response;
  try {
    response = await runFetchCheck(deploymentsUrl.toString(), {
      headers: {
        "api-key": apiKey,
      },
    });
  } catch (error) {
    return {
      ok: false,
      status: "attention",
      message: formatTransportError(error),
      models: [],
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      status: "attention",
      message: "Authentication failed. Check your Foundry API key and endpoint.",
      models: [],
    };
  }

  if (response.status === 404) {
    return {
      ok: false,
      status: "attention",
      message: "Foundry endpoint was not found. Check API URL and API version.",
      models: [],
    };
  }

  if (response.status === 429) {
    return {
      ok: false,
      status: "attention",
      message: "Foundry endpoint rate-limited model discovery. Try again shortly.",
      models: [],
    };
  }

  if (!response.ok && response.status >= 500) {
    return {
      ok: false,
      status: "attention",
      message: `Foundry endpoint unavailable (HTTP ${String(response.status)}).`,
      models: [],
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: "attention",
      message: `Foundry endpoint rejected model discovery (HTTP ${String(response.status)}).`,
      models: [],
    };
  }

  let models: readonly ProviderModel[] = [];
  try {
    const payload = (await response.json()) as unknown;
    if (isRecord(payload)) {
      // Foundry REST API returns { value: [...] } for PagedDeployment
      const items = Array.isArray(payload["value"]) ? payload["value"] : Array.isArray(payload["data"]) ? payload["data"] : [];
      models = parseDiscoveredModels(items);
    }
  } catch (error) {
    return {
      ok: false,
      status: "attention",
      message: formatTransportError(error),
      models: [],
    };
  }

  if (models.length === 0) {
    return {
      ok: false,
      status: "attention",
      message: NO_MODELS_DISCOVERED_MESSAGE,
      models: [],
    };
  }

  return {
    ok: true,
    status: "connected",
    message: "Foundry endpoint validated.",
    models,
  };
}

export function validateFoundryConnectorInput(
  config: Readonly<Record<string, string>>,
): ConnectorValidationResult {
  const methodId = normalizeText(config["methodId"], DEFAULT_METHOD_ID);
  if (methodId !== DEFAULT_METHOD_ID) {
    return { ok: false, message: "Unsupported Foundry methodId." };
  }

  try {
    normalizeUrl(config["apiUrl"] ?? DEFAULT_API_URL);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "API URL is invalid." };
  }

  if (normalizeText(config["apiKey"]).length === 0) {
    return { ok: false, message: "API key is required." };
  }

  if (normalizeText(config["apiVersion"], DEFAULT_API_VERSION).length === 0) {
    return { ok: false, message: "API version is required." };
  }

  return { ok: true };
}

export function sanitizeFoundryConnectorMetadata(
  config: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const providerId = normalizeText(config["providerId"], DEFAULT_PROVIDER_ID);
  const methodId = normalizeText(config["methodId"], DEFAULT_METHOD_ID);
  const nativeHostName = normalizeText(
    config["nativeHostName"],
    DEFAULT_NATIVE_HOST_NAME,
  );
  const connectionHandle = normalizeText(
    config["connectionHandle"],
    createProvisionalConnectionHandle(providerId, methodId),
  );
  const metadata: Record<string, string> = {
    providerId,
    methodId,
    nativeHostName,
    connectionHandle,
    apiUrl: normalizeUrl(config["apiUrl"] ?? DEFAULT_API_URL),
    apiVersion: normalizeText(config["apiVersion"], DEFAULT_API_VERSION),
  };
  return metadata;
}

async function completeViaBridge(
  deps: CloudConnectorDependencies,
  config: Readonly<Record<string, string>>,
): Promise<
  | Readonly<{
    ok: true;
    connectionHandle: string;
    models: readonly ProviderModel[];
    bindingMetadata: Readonly<Record<string, string>>;
  }>
  | Readonly<{ ok: false; message: string }>
> {
  const nativeHostName = normalizeText(
    config["nativeHostName"],
    deps.defaultNativeHostName ?? DEFAULT_NATIVE_HOST_NAME,
  );
  const methodId = normalizeText(config["methodId"], DEFAULT_METHOD_ID);
  const completeResponse = await deps.sendNativeMessage(nativeHostName, {
    type: "cloud.connection.complete",
    providerId: DEFAULT_PROVIDER_ID,
    methodId,
    input: {
      apiUrl: normalizeUrl(config["apiUrl"] ?? DEFAULT_API_URL),
      apiVersion: normalizeText(config["apiVersion"], DEFAULT_API_VERSION),
      apiKey: normalizeText(config["apiKey"]),
    },
  });
  if (!completeResponse.ok) {
    return {
      ok: false,
      message: deps.formatNativeHostRuntimeError(completeResponse.errorMessage),
    };
  }

  const completeError = toBridgeErrorMessage(completeResponse.response);
  if (completeError !== undefined) {
    return { ok: false, message: completeError };
  }

  if (
    !isRecord(completeResponse.response) ||
    completeResponse.response["type"] !== "cloud.connection.complete"
  ) {
    return {
      ok: false,
      message: "Native host returned an unexpected cloud completion payload.",
    };
  }

  const connectionHandle = normalizeText(
    typeof completeResponse.response["connectionHandle"] === "string"
      ? completeResponse.response["connectionHandle"]
      : "",
  );
  const bindingMetadata = parseCompletionBindingMetadata(completeResponse.response);
  if (connectionHandle.length === 0) {
    return { ok: false, message: "Native host did not return a connection handle." };
  }

  const discoverResponse = await deps.sendNativeMessage(nativeHostName, {
    type: "cloud.models.discover",
    providerId: DEFAULT_PROVIDER_ID,
    methodId,
    connectionHandle,
  });
  if (!discoverResponse.ok) {
    return {
      ok: false,
      message: deps.formatNativeHostRuntimeError(discoverResponse.errorMessage),
    };
  }
  const discoverError = toBridgeErrorMessage(discoverResponse.response);
  if (discoverError !== undefined) {
    return { ok: false, message: discoverError };
  }
  if (
    !isRecord(discoverResponse.response) ||
    discoverResponse.response["type"] !== "cloud.models.discover"
  ) {
    return {
      ok: false,
      message: "Native host returned an unexpected cloud model discovery payload.",
    };
  }

  const discovered = parseDiscoveredModels(discoverResponse.response["models"]);
  if (discovered.length === 0) {
    return { ok: false, message: NO_MODELS_DISCOVERED_MESSAGE };
  }
  return {
    ok: true,
    connectionHandle,
    models: discovered,
    bindingMetadata,
  };
}

export function createCloudFoundryConnector(
  deps: CloudConnectorDependencies,
): ConnectorDefinition {
  return {
    id: CLOUD_FOUNDRY_CONNECTOR_ID,
    label: "Microsoft Foundry (Cloud)",
    type: "cloud",
    defaultName: "Microsoft Foundry",
    fields: [
      {
        key: "nativeHostName",
        label: "Native Host Name",
        type: "text",
        defaultValue: deps.defaultNativeHostName ?? DEFAULT_NATIVE_HOST_NAME,
        required: true,
        maxLength: 120,
        placeholder: DEFAULT_NATIVE_HOST_NAME,
      },
      {
        key: "methodId",
        label: "Connection Method",
        type: "select",
        required: true,
        defaultValue: DEFAULT_METHOD_ID,
        options: [{ value: DEFAULT_METHOD_ID, label: "API Key + API URL" }],
      },
      {
        key: "apiUrl",
        label: "Project URL",
        type: "url",
        required: true,
        defaultValue: DEFAULT_API_URL,
        maxLength: 300,
        helpText: "Example: https://<resource>.services.ai.azure.com/api/projects/<project-name>",
      },
      {
        key: "apiVersion",
        label: "API Version",
        type: "text",
        required: true,
        defaultValue: DEFAULT_API_VERSION,
        maxLength: 60,
      },
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        maxLength: 400,
      },
    ],
    async testConnection(config): Promise<ConnectionTestResult> {
      const validation = validateFoundryConnectorInput(config);
      if (!validation.ok) {
        return {
          ok: false,
          status: "attention",
          message: validation.message,
          models: [],
        };
      }

      const bridgeResult = await completeViaBridge(deps, config);
      if (!bridgeResult.ok) {
        if (!isPolicyDisabledMessage(bridgeResult.message)) {
          return {
            ok: false,
            status: "attention",
            message: bridgeResult.message,
            models: [],
          };
        }

        const apiValidationResult = await validateFoundryApiEndpoint(config);
        if (!apiValidationResult.ok) {
          return apiValidationResult;
        }

        const metadata = sanitizeFoundryConnectorMetadata({
          ...config,
          providerId: DEFAULT_PROVIDER_ID,
        });
        return {
          ...apiValidationResult,
          status: "attention",
          message: `${apiValidationResult.message} Native bridge connection handle will be finalized when cloud broker is reachable.`,
          metadata,
        };
      }

      const metadata = sanitizeFoundryConnectorMetadata({
        ...config,
        providerId: DEFAULT_PROVIDER_ID,
        connectionHandle: bridgeResult.connectionHandle,
      });
      return {
        ok: true,
        status: "connected",
        message: "Foundry connection validated through native bridge.",
        models: bridgeResult.models,
        metadata: {
          ...metadata,
          ...bridgeResult.bindingMetadata,
        },
      };
    },
    sanitizeMetadata(config): Readonly<Record<string, string>> {
      return sanitizeFoundryConnectorMetadata({
        ...config,
        providerId: DEFAULT_PROVIDER_ID,
      });
    },
  };
}

