import type {
  CloudConnectorDependencies,
  ConnectionTestResult,
  ConnectorDefinition,
  ConnectorValidationResult,
  ProviderModel,
} from "./types.js";

export const CLOUD_ANTHROPIC_CONNECTOR_ID = "cloud-anthropic";

const DEFAULT_NATIVE_HOST_NAME = "com.arlopass.bridge";
const DEFAULT_PROVIDER_ID = "claude-subscription";
const DEFAULT_METHOD_ID = "anthropic.api_key";
const DEFAULT_BASE_URL = "https://api.anthropic.com";
const NO_MODELS_DISCOVERED_MESSAGE =
  "No models were discovered for this Anthropic connection. Ensure your account has model access.";

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
  return models.slice(0, 40);
}

function toBridgeErrorMessage(
  deps: CloudConnectorDependencies,
  response: unknown,
): string | undefined {
  if (!isRecord(response)) {
    return "Native host returned an invalid payload.";
  }

  if (response["type"] !== "error") {
    return undefined;
  }

  const message =
    typeof response["message"] === "string" && response["message"].trim().length > 0
      ? response["message"].trim()
      : "Native host cloud operation failed.";
  return message;
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
    return "Unable to reach Anthropic endpoint. Verify connectivity and CSP connect-src policy.";
  }
  if (normalized.includes("timed out")) {
    return "Anthropic endpoint timed out before responding.";
  }
  return `Anthropic validation failed: ${message}`;
}

function isPolicyDisabledMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("disabled by policy") || normalized.includes("policy.denied");
}

export function validateAnthropicConnectorInput(
  config: Readonly<Record<string, string>>,
): ConnectorValidationResult {
  const methodId = normalizeText(config["methodId"], DEFAULT_METHOD_ID);
  if (methodId !== "anthropic.api_key" && methodId !== "anthropic.oauth_subscription") {
    return {
      ok: false,
      message: "Unsupported Anthropic methodId.",
    };
  }

  try {
    normalizeUrl(config["baseUrl"] ?? DEFAULT_BASE_URL);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Base URL is invalid.",
    };
  }

  if (methodId === "anthropic.api_key") {
    const apiKey = normalizeText(config["apiKey"]);
    if (apiKey.length < 20) {
      return {
        ok: false,
        message: "Provide a valid API key for anthropic.api_key.",
      };
    }
  } else {
    const accessToken = normalizeText(config["accessToken"]);
    if (accessToken.length < 12) {
      return {
        ok: false,
        message: "Provide an access token for anthropic.oauth_subscription.",
      };
    }
  }

  return { ok: true };
}

export function sanitizeAnthropicConnectorMetadata(
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
    baseUrl: normalizeUrl(config["baseUrl"] ?? DEFAULT_BASE_URL),
  };
  const tenantId = normalizeText(config["tenantId"]);
  const region = normalizeText(config["region"]);
  if (tenantId.length > 0) {
    metadata["tenantId"] = tenantId;
  }
  if (region.length > 0) {
    metadata["region"] = region;
  }
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
    message: string;
    bindingMetadata: Readonly<Record<string, string>>;
  }>
  | Readonly<{ ok: false; message: string }>
> {
  const methodId = normalizeText(config["methodId"], DEFAULT_METHOD_ID);
  const nativeHostName = normalizeText(
    config["nativeHostName"],
    deps.defaultNativeHostName ?? DEFAULT_NATIVE_HOST_NAME,
  );
  const baseUrl = normalizeUrl(config["baseUrl"] ?? DEFAULT_BASE_URL);

  const input: Record<string, unknown> =
    methodId === "anthropic.api_key"
      ? {
        apiKey: normalizeText(config["apiKey"]),
        endpointProfile: { baseUrl },
      }
      : {
        accessToken: normalizeText(config["accessToken"]),
        endpointProfile: { baseUrl },
      };

  const completeResponse = await deps.sendNativeMessage(nativeHostName, {
    type: "cloud.connection.complete",
    providerId: DEFAULT_PROVIDER_ID,
    methodId,
    input,
  });

  if (!completeResponse.ok) {
    return {
      ok: false,
      message: deps.formatNativeHostRuntimeError(completeResponse.errorMessage),
    };
  }

  const completeError = toBridgeErrorMessage(deps, completeResponse.response);
  if (completeError !== undefined) {
    return {
      ok: false,
      message: completeError,
    };
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
    return {
      ok: false,
      message: "Native host did not return a connection handle.",
    };
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
  const discoverError = toBridgeErrorMessage(deps, discoverResponse.response);
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
  const models = parseDiscoveredModels(discoverResponse.response["models"]);
  if (models.length === 0) {
    return { ok: false, message: NO_MODELS_DISCOVERED_MESSAGE };
  }

  return {
    ok: true,
    connectionHandle,
    models,
    message: "Native cloud bridge validation succeeded.",
    bindingMetadata,
  };
}

async function validateAnthropicApiKeyEndpoint(
  config: Readonly<Record<string, string>>,
): Promise<ConnectionTestResult> {
  const baseUrl = normalizeUrl(config["baseUrl"] ?? DEFAULT_BASE_URL);
  const apiKey = normalizeText(config["apiKey"]);
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
      message: formatTransportError(error),
      models: [],
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      status: "attention",
      message: "Authentication failed. Check your Anthropic API key.",
      models: [],
    };
  }

  if (response.status === 404) {
    return {
      ok: false,
      status: "attention",
      message: "Anthropic endpoint was not found. Check API Base URL.",
      models: [],
    };
  }

  if (response.status === 429) {
    return {
      ok: false,
      status: "attention",
      message: "Anthropic endpoint rate-limited model discovery. Try again shortly.",
      models: [],
    };
  }

  if (!response.ok && response.status >= 500) {
    return {
      ok: false,
      status: "attention",
      message: `Anthropic endpoint unavailable (HTTP ${String(response.status)}).`,
      models: [],
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: "attention",
      message: `Anthropic endpoint rejected model discovery (HTTP ${String(response.status)}).`,
      models: [],
    };
  }

  let models: readonly ProviderModel[] = [];
  try {
    const payload = (await response.json()) as unknown;
    if (isRecord(payload)) {
      models = parseDiscoveredModels(payload["data"]);
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
    message: "Anthropic endpoint validated.",
    models,
  };
}

export function createCloudAnthropicConnector(
  deps: CloudConnectorDependencies,
): ConnectorDefinition {
  return {
    id: CLOUD_ANTHROPIC_CONNECTOR_ID,
    label: "Anthropic (Cloud)",
    type: "cloud",
    defaultName: "Anthropic Cloud",
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
        options: [
          { value: "anthropic.api_key", label: "API Key" },
          { value: "anthropic.oauth_subscription", label: "OAuth Subscription" },
        ],
      },
      {
        key: "baseUrl",
        label: "API Base URL",
        type: "url",
        defaultValue: DEFAULT_BASE_URL,
        required: true,
        maxLength: 200,
      },
      {
        key: "apiKey",
        label: "API Key (for anthropic.api_key)",
        type: "password",
        required: false,
        minLength: 20,
        maxLength: 300,
      },
      {
        key: "accessToken",
        label: "Access Token (for anthropic.oauth_subscription)",
        type: "password",
        required: false,
        minLength: 12,
        maxLength: 300,
      },
      {
        key: "modelHint",
        label: "Preferred Model (optional)",
        type: "text",
        required: false,
        maxLength: 120,
        placeholder: "claude-sonnet-4-5",
      },
      {
        key: "tenantId",
        label: "Tenant (optional)",
        type: "text",
        required: false,
        maxLength: 120,
      },
      {
        key: "region",
        label: "Region (optional)",
        type: "text",
        required: false,
        maxLength: 60,
      },
    ],
    async testConnection(config): Promise<ConnectionTestResult> {
      const validation = validateAnthropicConnectorInput(config);
      if (!validation.ok) {
        return {
          ok: false,
          status: "attention",
          message: validation.message,
          models: [],
        };
      }

      const methodId = normalizeText(config["methodId"], DEFAULT_METHOD_ID);
      const bridgeResult = await completeViaBridge(deps, config);
      if (bridgeResult.ok) {
        const metadata = sanitizeAnthropicConnectorMetadata({
          ...config,
          methodId,
          connectionHandle: bridgeResult.connectionHandle,
          providerId: DEFAULT_PROVIDER_ID,
        });
        return {
          ok: true,
          status: "connected",
          message: bridgeResult.message,
          models: bridgeResult.models,
          metadata: {
            ...metadata,
            ...bridgeResult.bindingMetadata,
          },
        };
      }

      if (methodId !== "anthropic.api_key") {
        return {
          ok: false,
          status: "attention",
          message: bridgeResult.message,
          models: [],
        };
      }

      if (!isPolicyDisabledMessage(bridgeResult.message)) {
        return {
          ok: false,
          status: "attention",
          message: bridgeResult.message,
          models: [],
        };
      }

      const apiValidationResult = await validateAnthropicApiKeyEndpoint(config);
      if (!apiValidationResult.ok) {
        return apiValidationResult;
      }

      const metadata = sanitizeAnthropicConnectorMetadata({
        ...config,
        methodId,
        providerId: DEFAULT_PROVIDER_ID,
      });
      return {
        ...apiValidationResult,
        status: "attention",
        message: `${apiValidationResult.message} Native bridge cloud execution is currently disabled by policy. Enable bridge flags ARLOPASS_CLOUD_BROKER_V2_ENABLED=true and ARLOPASS_CLOUD_PROVIDER_ANTHROPIC_API_KEY_ENABLED=true to finalize a cloud connection handle.`,
        metadata,
      };
    },
    sanitizeMetadata(config): Readonly<Record<string, string>> {
      return sanitizeAnthropicConnectorMetadata({
        ...config,
        providerId: DEFAULT_PROVIDER_ID,
      });
    },
  };
}

