import type {
  CloudConnectorDependencies,
  ConnectionTestResult,
  ConnectorDefinition,
  ConnectorValidationResult,
  ProviderModel,
} from "./types.js";

export const CLOUD_BEDROCK_CONNECTOR_ID = "cloud-bedrock";

const DEFAULT_NATIVE_HOST_NAME = "com.arlopass.bridge";
const DEFAULT_PROVIDER_ID = "amazon-bedrock";
const DEFAULT_METHOD_ID = "bedrock.assume_role";
const DEFAULT_REGION = "us-east-1";

const FALLBACK_MODELS: readonly ProviderModel[] = [
  {
    id: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    name: "Claude 3.5 Sonnet",
  },
  {
    id: "amazon.nova-lite-v1:0",
    name: "Amazon Nova Lite",
  },
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

export function validateBedrockConnectorInput(
  config: Readonly<Record<string, string>>,
): ConnectorValidationResult {
  const methodId = normalizeText(config["methodId"], DEFAULT_METHOD_ID);
  if (
    methodId !== "bedrock.api_key" &&
    methodId !== "bedrock.assume_role" &&
    methodId !== "bedrock.aws_access_key"
  ) {
    return { ok: false, message: "Unsupported Bedrock methodId." };
  }

  if (normalizeText(config["region"], DEFAULT_REGION).length === 0) {
    return { ok: false, message: "Region is required." };
  }
  if (normalizeText(config["modelAccessPolicy"]).length === 0) {
    return { ok: false, message: "Model access policy is required." };
  }

  if (methodId === "bedrock.assume_role") {
    if (normalizeText(config["roleArn"]).length === 0) {
      return {
        ok: false,
        message: "roleArn is required for bedrock.assume_role.",
      };
    }
    return { ok: true };
  }

  if (methodId === "bedrock.api_key") {
    if (normalizeText(config["apiKey"]).length === 0) {
      return { ok: false, message: "apiKey is required for bedrock.api_key." };
    }
    return { ok: true };
  }

  if (normalizeText(config["accessKeyId"]).length === 0) {
    return { ok: false, message: "accessKeyId is required for bedrock.aws_access_key." };
  }
  if (normalizeText(config["secretAccessKey"]).length === 0) {
    return { ok: false, message: "secretAccessKey is required for bedrock.aws_access_key." };
  }

  return { ok: true };
}

export function sanitizeBedrockConnectorMetadata(
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
    region: normalizeText(config["region"], DEFAULT_REGION),
    modelAccessPolicy: normalizeText(config["modelAccessPolicy"]),
  };
  const roleArn = normalizeText(config["roleArn"]);
  if (roleArn.length > 0) {
    metadata["roleArn"] = roleArn;
  }

  const externalId = normalizeText(config["externalId"]);
  if (externalId.length > 0) {
    metadata["externalId"] = externalId;
  }
  const tenantId = normalizeText(config["tenantId"]);
  if (tenantId.length > 0) {
    metadata["tenantId"] = tenantId;
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
  const input: Record<string, unknown> =
    methodId === "bedrock.api_key"
      ? {
        region: normalizeText(config["region"], DEFAULT_REGION),
        modelAccessPolicy: normalizeText(config["modelAccessPolicy"]),
        apiKey: normalizeText(config["apiKey"]),
      }
      : methodId === "bedrock.assume_role"
        ? {
          region: normalizeText(config["region"], DEFAULT_REGION),
          modelAccessPolicy: normalizeText(config["modelAccessPolicy"]),
          roleArn: normalizeText(config["roleArn"]),
          externalId: normalizeText(config["externalId"]),
        }
        : {
          region: normalizeText(config["region"], DEFAULT_REGION),
          modelAccessPolicy: normalizeText(config["modelAccessPolicy"]),
          roleArn: normalizeText(config["roleArn"]),
          accessKeyId: normalizeText(config["accessKeyId"]),
          secretAccessKey: normalizeText(config["secretAccessKey"]),
          sessionToken: normalizeText(config["sessionToken"]),
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

export function createCloudBedrockConnector(
  deps: CloudConnectorDependencies,
): ConnectorDefinition {
  return {
    id: CLOUD_BEDROCK_CONNECTOR_ID,
    label: "Amazon Bedrock (Cloud)",
    type: "cloud",
    defaultName: "Amazon Bedrock",
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
          { value: "bedrock.api_key", label: "API Key" },
          { value: "bedrock.assume_role", label: "Assume Role" },
          { value: "bedrock.aws_access_key", label: "AWS Access Key" },
        ],
      },
      {
        key: "region",
        label: "Region",
        type: "text",
        required: true,
        defaultValue: DEFAULT_REGION,
        maxLength: 80,
      },
      {
        key: "modelAccessPolicy",
        label: "Model Access Policy",
        type: "text",
        required: true,
        maxLength: 200,
      },
      {
        key: "roleArn",
        label: "Role ARN",
        type: "text",
        required: false,
        maxLength: 300,
      },
      {
        key: "apiKey",
        label: "API Key (for bedrock.api_key)",
        type: "password",
        required: false,
        maxLength: 500,
      },
      {
        key: "externalId",
        label: "External ID (optional)",
        type: "text",
        required: false,
        maxLength: 200,
      },
      {
        key: "accessKeyId",
        label: "Access Key ID (for aws_access_key)",
        type: "text",
        required: false,
        maxLength: 200,
      },
      {
        key: "secretAccessKey",
        label: "Secret Access Key (for aws_access_key)",
        type: "password",
        required: false,
        maxLength: 400,
      },
      {
        key: "sessionToken",
        label: "Session Token (optional, aws_access_key)",
        type: "password",
        required: false,
        maxLength: 500,
      },
      {
        key: "tenantId",
        label: "Tenant (optional)",
        type: "text",
        required: false,
        maxLength: 120,
      },
    ],
    async testConnection(config): Promise<ConnectionTestResult> {
      const validation = validateBedrockConnectorInput(config);
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

      const metadata = sanitizeBedrockConnectorMetadata({
        ...config,
        providerId: DEFAULT_PROVIDER_ID,
        connectionHandle: bridgeResult.connectionHandle,
      });
      return {
        ok: true,
        status: "connected",
        message: "Bedrock connection validated through native bridge.",
        models: bridgeResult.models,
        metadata: {
          ...metadata,
          ...bridgeResult.bindingMetadata,
        },
      };
    },
    sanitizeMetadata(config): Readonly<Record<string, string>> {
      return sanitizeBedrockConnectorMetadata({
        ...config,
        providerId: DEFAULT_PROVIDER_ID,
      });
    },
  };
}

