import {
  CLOUD_ANTHROPIC_CONNECTOR_ID,
  createCloudAnthropicConnector,
  sanitizeAnthropicConnectorMetadata,
  validateAnthropicConnectorInput,
} from "./cloud-anthropic.js";
import {
  CLOUD_BEDROCK_CONNECTOR_ID,
  createCloudBedrockConnector,
  sanitizeBedrockConnectorMetadata,
  validateBedrockConnectorInput,
} from "./cloud-bedrock.js";
import {
  CLOUD_GEMINI_CONNECTOR_ID,
  createCloudGeminiConnector,
  sanitizeGeminiConnectorMetadata,
  validateGeminiConnectorInput,
} from "./cloud-gemini.js";
import {
  CLOUD_FOUNDRY_CONNECTOR_ID,
  createCloudFoundryConnector,
  sanitizeFoundryConnectorMetadata,
  validateFoundryConnectorInput,
} from "./cloud-foundry.js";
import {
  CLOUD_OPENAI_CONNECTOR_ID,
  createCloudOpenAiConnector,
  sanitizeOpenAiConnectorMetadata,
  validateOpenAiConnectorInput,
} from "./cloud-openai.js";
import {
  CLOUD_PERPLEXITY_CONNECTOR_ID,
  createCloudPerplexityConnector,
  sanitizePerplexityConnectorMetadata,
  validatePerplexityConnectorInput,
} from "./cloud-perplexity.js";
import {
  CLOUD_VERTEX_CONNECTOR_ID,
  createCloudVertexConnector,
  sanitizeVertexConnectorMetadata,
  validateVertexConnectorInput,
} from "./cloud-vertex.js";
import type {
  CloudConnectorDependencies,
  ConnectorDefinition,
  ConnectorValidationResult,
} from "./types.js";

export type { ConnectionTestResult, ConnectorDefinition, ConnectorField, ConnectorSelectOption, ProviderModel, ProviderStatus } from "./types.js";

export const CLOUD_CONNECTOR_IDS = [
  CLOUD_ANTHROPIC_CONNECTOR_ID,
  CLOUD_FOUNDRY_CONNECTOR_ID,
  CLOUD_VERTEX_CONNECTOR_ID,
  CLOUD_BEDROCK_CONNECTOR_ID,
  CLOUD_OPENAI_CONNECTOR_ID,
  CLOUD_PERPLEXITY_CONNECTOR_ID,
  CLOUD_GEMINI_CONNECTOR_ID,
] as const;

export type CloudConnectorId = (typeof CLOUD_CONNECTOR_IDS)[number];

type CloudConnectorSanitizer = (
  config: Readonly<Record<string, string>>,
) => Readonly<Record<string, string>>;

const DEFAULT_SANITIZER = sanitizeAnthropicConnectorMetadata;

const SANITIZERS_BY_CONNECTOR_ID: Readonly<Record<CloudConnectorId, CloudConnectorSanitizer>> = {
  [CLOUD_ANTHROPIC_CONNECTOR_ID]: sanitizeAnthropicConnectorMetadata,
  [CLOUD_FOUNDRY_CONNECTOR_ID]: sanitizeFoundryConnectorMetadata,
  [CLOUD_VERTEX_CONNECTOR_ID]: sanitizeVertexConnectorMetadata,
  [CLOUD_BEDROCK_CONNECTOR_ID]: sanitizeBedrockConnectorMetadata,
  [CLOUD_OPENAI_CONNECTOR_ID]: sanitizeOpenAiConnectorMetadata,
  [CLOUD_PERPLEXITY_CONNECTOR_ID]: sanitizePerplexityConnectorMetadata,
  [CLOUD_GEMINI_CONNECTOR_ID]: sanitizeGeminiConnectorMetadata,
};

type CloudConnectorValidator = (
  config: Readonly<Record<string, string>>,
) => ConnectorValidationResult;

const VALIDATORS_BY_CONNECTOR_ID: Readonly<Record<CloudConnectorId, CloudConnectorValidator>> = {
  [CLOUD_ANTHROPIC_CONNECTOR_ID]: validateAnthropicConnectorInput,
  [CLOUD_FOUNDRY_CONNECTOR_ID]: validateFoundryConnectorInput,
  [CLOUD_VERTEX_CONNECTOR_ID]: validateVertexConnectorInput,
  [CLOUD_BEDROCK_CONNECTOR_ID]: validateBedrockConnectorInput,
  [CLOUD_OPENAI_CONNECTOR_ID]: validateOpenAiConnectorInput,
  [CLOUD_PERPLEXITY_CONNECTOR_ID]: validatePerplexityConnectorInput,
  [CLOUD_GEMINI_CONNECTOR_ID]: validateGeminiConnectorInput,
};

function isCloudConnectorId(value: string): value is CloudConnectorId {
  return (CLOUD_CONNECTOR_IDS as readonly string[]).includes(value);
}

export function validateCloudConnectorInput(
  connectorId: string,
  config: Readonly<Record<string, string>>,
): ConnectorValidationResult {
  if (!isCloudConnectorId(connectorId)) {
    return { ok: false, message: `Unknown cloud connector: ${connectorId}` };
  }
  return VALIDATORS_BY_CONNECTOR_ID[connectorId](config);
}

export function sanitizeCloudConnectorMetadata(
  config: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const connectorId =
    typeof config["connectorId"] === "string" && isCloudConnectorId(config["connectorId"])
      ? config["connectorId"]
      : CLOUD_ANTHROPIC_CONNECTOR_ID;
  const sanitizer = SANITIZERS_BY_CONNECTOR_ID[connectorId] ?? DEFAULT_SANITIZER;
  return sanitizer(config);
}

export function createCloudConnectors(
  deps: CloudConnectorDependencies,
): readonly ConnectorDefinition[] {
  return [
    createCloudAnthropicConnector(deps),
    createCloudFoundryConnector(deps),
    createCloudVertexConnector(deps),
    createCloudBedrockConnector(deps),
    createCloudOpenAiConnector(deps),
    createCloudPerplexityConnector(deps),
    createCloudGeminiConnector(deps),
  ];
}

