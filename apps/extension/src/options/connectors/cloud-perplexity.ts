import type {
  CloudConnectorDependencies,
  ConnectionTestResult,
  ConnectorDefinition,
  ConnectorValidationResult,
  ProviderModel,
} from "./types.js";

export const CLOUD_PERPLEXITY_CONNECTOR_ID = "cloud-perplexity";

const DEFAULT_NATIVE_HOST_NAME = "com.arlopass.bridge";
const DEFAULT_PROVIDER_ID = "perplexity";
const DEFAULT_METHOD_ID = "perplexity.api_key";
const DEFAULT_BASE_URL = "https://api.perplexity.ai";

const FALLBACK_MODELS: readonly ProviderModel[] = [
  { id: "sonar", name: "Sonar" },
  { id: "sonar-pro", name: "Sonar Pro" },
  { id: "sonar-reasoning-pro", name: "Sonar Reasoning Pro" },
];

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
    throw new Error("API Base URL is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("API Base URL must be a valid URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("API Base URL must use HTTPS.");
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
  return models.slice(0, 80);
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

export function validatePerplexityConnectorInput(
  config: Readonly<Record<string, string>>,
): ConnectorValidationResult {
  const methodId = normalizeText(config["methodId"], DEFAULT_METHOD_ID);
  if (methodId !== DEFAULT_METHOD_ID) {
    return { ok: false, message: "Unsupported Perplexity methodId." };
  }

  try {
    normalizeUrl(config["baseUrl"] ?? DEFAULT_BASE_URL);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "API Base URL is invalid.",
    };
  }

  if (normalizeText(config["apiKey"]).length === 0) {
    return { ok: false, message: "API key is required." };
  }
  return { ok: true };
}

export function sanitizePerplexityConnectorMetadata(
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
  const defaultModel = normalizeText(config["defaultModel"]);
  if (defaultModel.length > 0) {
    metadata["defaultModel"] = defaultModel;
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
      apiKey: normalizeText(config["apiKey"]),
      baseUrl: normalizeUrl(config["baseUrl"] ?? DEFAULT_BASE_URL),
      defaultModel: normalizeText(config["defaultModel"]),
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
  if (
    !discoverResponse.ok ||
    !isRecord(discoverResponse.response) ||
    discoverResponse.response["type"] !== "cloud.models.discover"
  ) {
    return { ok: true, connectionHandle, models: FALLBACK_MODELS, bindingMetadata };
  }

  const discovered = parseDiscoveredModels(discoverResponse.response["models"]);
  return {
    ok: true,
    connectionHandle,
    models: discovered.length > 0 ? discovered : FALLBACK_MODELS,
    bindingMetadata,
  };
}

export function createCloudPerplexityConnector(
  deps: CloudConnectorDependencies,
): ConnectorDefinition {
  return {
    id: CLOUD_PERPLEXITY_CONNECTOR_ID,
    label: "Perplexity (Cloud)",
    type: "cloud",
    defaultName: "Perplexity",
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
        options: [{ value: DEFAULT_METHOD_ID, label: "API Key" }],
      },
      {
        key: "baseUrl",
        label: "API Base URL",
        type: "url",
        required: true,
        defaultValue: DEFAULT_BASE_URL,
        maxLength: 240,
      },
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        maxLength: 500,
      },
      {
        key: "defaultModel",
        label: "Default Model (optional)",
        type: "text",
        required: false,
        maxLength: 120,
      },
    ],
    async testConnection(config): Promise<ConnectionTestResult> {
      const validation = validatePerplexityConnectorInput(config);
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
        return {
          ok: false,
          status: "attention",
          message: bridgeResult.message,
          models: [],
        };
      }

      const metadata = sanitizePerplexityConnectorMetadata({
        ...config,
        providerId: DEFAULT_PROVIDER_ID,
        connectionHandle: bridgeResult.connectionHandle,
      });
      return {
        ok: true,
        status: "connected",
        message: "Perplexity connection validated through native bridge.",
        models: bridgeResult.models,
        metadata: {
          ...metadata,
          ...bridgeResult.bindingMetadata,
        },
      };
    },
    sanitizeMetadata(config): Readonly<Record<string, string>> {
      return sanitizePerplexityConnectorMetadata({
        ...config,
        providerId: DEFAULT_PROVIDER_ID,
      });
    },
  };
}

