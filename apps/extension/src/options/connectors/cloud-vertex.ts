import type {
  CloudConnectorDependencies,
  ConnectionTestResult,
  ConnectorDefinition,
  ConnectorValidationResult,
  ProviderModel,
} from "./types.js";

export const CLOUD_VERTEX_CONNECTOR_ID = "cloud-vertex";

const DEFAULT_NATIVE_HOST_NAME = "com.arlopass.bridge";
const DEFAULT_PROVIDER_ID = "google-vertex-ai";
const DEFAULT_METHOD_ID = "vertex.service_account";
const DEFAULT_API_KEY_PROJECT_ID = "express-mode";
const DEFAULT_API_KEY_LOCATION = "global";
const DEFAULT_REGION = "global";

const FALLBACK_MODELS: readonly ProviderModel[] = [
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
  { id: "gemini-2.0-pro", name: "Gemini 2.0 Pro" },
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

export function validateVertexConnectorInput(
  config: Readonly<Record<string, string>>,
): ConnectorValidationResult {
  const methodId = normalizeText(config["methodId"], DEFAULT_METHOD_ID);
  if (
    methodId !== "vertex.api_key" &&
    methodId !== "vertex.service_account" &&
    methodId !== "vertex.workload_identity_federation"
  ) {
    return { ok: false, message: "Unsupported Vertex methodId." };
  }

  if (methodId === "vertex.api_key") {
    if (normalizeText(config["apiKey"]).length === 0) {
      return { ok: false, message: "API key is required for vertex.api_key." };
    }
    return { ok: true };
  }

  if (normalizeText(config["projectId"]).length === 0) {
    return { ok: false, message: "Project ID is required." };
  }
  if (normalizeText(config["location"]).length === 0) {
    return { ok: false, message: "Location is required." };
  }

  if (methodId === "vertex.service_account") {
    if (normalizeText(config["serviceAccountJson"]).length === 0) {
      return { ok: false, message: "Service account JSON is required." };
    }
  } else {
    if (normalizeText(config["audience"]).length === 0) {
      return { ok: false, message: "Audience is required for workload identity federation." };
    }
    if (normalizeText(config["subjectTokenType"]).length === 0) {
      return {
        ok: false,
        message: "subjectTokenType is required for workload identity federation.",
      };
    }
  }

  return { ok: true };
}

export function sanitizeVertexConnectorMetadata(
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
    projectId:
      methodId === "vertex.api_key"
        ? normalizeText(config["projectId"], DEFAULT_API_KEY_PROJECT_ID)
        : normalizeText(config["projectId"]),
    location:
      methodId === "vertex.api_key"
        ? normalizeText(config["location"], DEFAULT_API_KEY_LOCATION)
        : normalizeText(config["location"]),
    region: normalizeText(config["region"], DEFAULT_REGION),
  };
  const defaultModel = normalizeText(config["defaultModel"]);
  const publisher = normalizeText(config["publisher"]);
  if (defaultModel.length > 0) {
    metadata["defaultModel"] = defaultModel;
  }
  if (publisher.length > 0) {
    metadata["publisher"] = publisher;
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
  const completeInput: Record<string, unknown> =
    methodId === "vertex.api_key"
      ? {
        projectId: normalizeText(config["projectId"], DEFAULT_API_KEY_PROJECT_ID),
        location: normalizeText(config["location"], DEFAULT_API_KEY_LOCATION),
        apiKey: normalizeText(config["apiKey"]),
        publisher: normalizeText(config["publisher"]),
        defaultModel: normalizeText(config["defaultModel"]),
      }
      : methodId === "vertex.service_account"
        ? {
          projectId: normalizeText(config["projectId"]),
          location: normalizeText(config["location"]),
          serviceAccountJson: normalizeText(config["serviceAccountJson"]),
          publisher: normalizeText(config["publisher"]),
          defaultModel: normalizeText(config["defaultModel"]),
        }
        : {
          projectId: normalizeText(config["projectId"]),
          location: normalizeText(config["location"]),
          audience: normalizeText(config["audience"]),
          subjectTokenType: normalizeText(config["subjectTokenType"]),
          serviceAccountImpersonationEmail: normalizeText(
            config["serviceAccountImpersonationEmail"],
          ),
          defaultModel: normalizeText(config["defaultModel"]),
        };

  const completeResponse = await deps.sendNativeMessage(nativeHostName, {
    type: "cloud.connection.complete",
    providerId: DEFAULT_PROVIDER_ID,
    methodId,
    input: completeInput,
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

export function createCloudVertexConnector(
  deps: CloudConnectorDependencies,
): ConnectorDefinition {
  return {
    id: CLOUD_VERTEX_CONNECTOR_ID,
    label: "Google Vertex AI (Cloud)",
    type: "cloud",
    defaultName: "Google Vertex AI",
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
          { value: "vertex.api_key", label: "API Key (Express/Test)" },
          { value: "vertex.service_account", label: "Service Account" },
          {
            value: "vertex.workload_identity_federation",
            label: "Workload Identity Federation",
          },
        ],
      },
      {
        key: "apiKey",
        label: "API Key (for vertex.api_key)",
        type: "password",
        required: false,
        maxLength: 500,
      },
      {
        key: "projectId",
        label: "Project ID",
        type: "text",
        required: false,
        maxLength: 200,
      },
      {
        key: "location",
        label: "Location",
        type: "text",
        required: false,
        maxLength: 80,
        placeholder: "us-central1",
      },
      {
        key: "serviceAccountJson",
        label: "Service Account JSON (for service_account)",
        type: "password",
        required: false,
        maxLength: 8000,
      },
      {
        key: "audience",
        label: "Audience (for workload_identity_federation)",
        type: "text",
        required: false,
        maxLength: 500,
      },
      {
        key: "subjectTokenType",
        label: "Subject Token Type (for workload_identity_federation)",
        type: "text",
        required: false,
        maxLength: 160,
      },
      {
        key: "serviceAccountImpersonationEmail",
        label: "Impersonation Email (optional)",
        type: "text",
        required: false,
        maxLength: 200,
      },
      {
        key: "publisher",
        label: "Publisher (optional)",
        type: "text",
        required: false,
        maxLength: 80,
      },
      {
        key: "defaultModel",
        label: "Default Model (optional)",
        type: "text",
        required: false,
        maxLength: 120,
      },
      {
        key: "region",
        label: "Region (optional)",
        type: "text",
        required: false,
        defaultValue: DEFAULT_REGION,
        maxLength: 60,
      },
    ],
    async testConnection(config): Promise<ConnectionTestResult> {
      const validation = validateVertexConnectorInput(config);
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

      const metadata = sanitizeVertexConnectorMetadata({
        ...config,
        providerId: DEFAULT_PROVIDER_ID,
        connectionHandle: bridgeResult.connectionHandle,
      });
      return {
        ok: true,
        status: "connected",
        message: "Vertex connection validated through native bridge.",
        models: bridgeResult.models,
        metadata: {
          ...metadata,
          ...bridgeResult.bindingMetadata,
        },
      };
    },
    sanitizeMetadata(config): Readonly<Record<string, string>> {
      return sanitizeVertexConnectorMetadata({
        ...config,
        providerId: DEFAULT_PROVIDER_ID,
      });
    },
  };
}

