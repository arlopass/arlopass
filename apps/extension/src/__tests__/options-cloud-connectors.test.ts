import { afterEach, describe, expect, it, vi } from "vitest";

import {
  sanitizeCloudConnectorMetadata,
  validateCloudConnectorInput,
} from "../options/connectors/index.js";
import { createCloudAnthropicConnector } from "../options/connectors/cloud-anthropic.js";
import { createCloudFoundryConnector } from "../options/connectors/cloud-foundry.js";
import { createCloudOpenAiConnector } from "../options/connectors/cloud-openai.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cloud connector helpers", () => {
  it("never persists raw credential fields in sanitized metadata", () => {
    const metadata = sanitizeCloudConnectorMetadata({
      apiKey: "sk-secret",
      baseUrl: "https://api.anthropic.com",
      methodId: "anthropic.api_key",
    });

    const serializedMetadata = JSON.stringify(metadata);
    expect(serializedMetadata).not.toContain("sk-secret");
    expect(metadata.connectionHandle).toBeDefined();
  });

  it("requires roleArn for bedrock.assume_role and treats externalId as optional", () => {
    const valid = validateCloudConnectorInput("cloud-bedrock", {
      methodId: "bedrock.assume_role",
      roleArn: "arn:aws:iam::111122223333:role/byom-bedrock-role",
      externalId: "optional-external-id",
      region: "us-east-1",
      modelAccessPolicy: "allow-listed",
    });
    expect(valid.ok).toBe(true);

    const missingRole = validateCloudConnectorInput("cloud-bedrock", {
      methodId: "bedrock.assume_role",
      region: "us-east-1",
      modelAccessPolicy: "allow-listed",
    });
    expect(missingRole.ok).toBe(false);
  });

  it("validates foundry api key + api url flow", () => {
    const valid = validateCloudConnectorInput("cloud-foundry", {
      methodId: "foundry.api_key",
      apiUrl: "https://example-resource.openai.azure.com/openai/v1",
      apiVersion: "v1",
      apiKey: "foundry-secret",
    });
    expect(valid.ok).toBe(true);

    const missingApiKey = validateCloudConnectorInput("cloud-foundry", {
      methodId: "foundry.api_key",
      apiUrl: "https://example-resource.openai.azure.com/openai/v1",
    });
    expect(missingApiKey.ok).toBe(false);
  });

  it("supports vertex and bedrock api-key method validations", () => {
    const vertexValid = validateCloudConnectorInput("cloud-vertex", {
      methodId: "vertex.api_key",
      apiKey: "vertex-secret",
    });
    expect(vertexValid.ok).toBe(true);

    const bedrockValid = validateCloudConnectorInput("cloud-bedrock", {
      methodId: "bedrock.api_key",
      region: "us-east-1",
      modelAccessPolicy: "allow-listed",
      apiKey: "bedrock-secret",
    });
    expect(bedrockValid.ok).toBe(true);

    const bedrockMissingApiKey = validateCloudConnectorInput("cloud-bedrock", {
      methodId: "bedrock.api_key",
      region: "us-east-1",
      modelAccessPolicy: "allow-listed",
    });
    expect(bedrockMissingApiKey.ok).toBe(false);
  });

  it("supports openai and perplexity api-key method validations", () => {
    const openAiValid = validateCloudConnectorInput("cloud-openai", {
      methodId: "openai.api_key",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-openai-secret",
    });
    expect(openAiValid.ok).toBe(true);

    const perplexityValid = validateCloudConnectorInput("cloud-perplexity", {
      methodId: "perplexity.api_key",
      baseUrl: "https://api.perplexity.ai",
      apiKey: "pplx-secret",
    });
    expect(perplexityValid.ok).toBe(true);

    const openAiMissingApiKey = validateCloudConnectorInput("cloud-openai", {
      methodId: "openai.api_key",
      baseUrl: "https://api.openai.com/v1",
    });
    expect(openAiMissingApiKey.ok).toBe(false);
  });

  it("supports gemini api-key and oauth-access-token method validations", () => {
    const apiKeyValid = validateCloudConnectorInput("cloud-gemini", {
      methodId: "gemini.api_key",
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: "gemini-secret",
    });
    expect(apiKeyValid.ok).toBe(true);

    const oauthValid = validateCloudConnectorInput("cloud-gemini", {
      methodId: "gemini.oauth_access_token",
      baseUrl: "https://generativelanguage.googleapis.com",
      accessToken: "ya29.token",
    });
    expect(oauthValid.ok).toBe(true);

    const oauthMissingToken = validateCloudConnectorInput("cloud-gemini", {
      methodId: "gemini.oauth_access_token",
      baseUrl: "https://generativelanguage.googleapis.com",
    });
    expect(oauthMissingToken.ok).toBe(false);
  });

  it("never persists secrets for openai and gemini metadata sanitization", () => {
    const openAiMetadata = sanitizeCloudConnectorMetadata({
      connectorId: "cloud-openai",
      methodId: "openai.api_key",
      apiKey: "sk-openai-secret",
      baseUrl: "https://api.openai.com/v1",
    });
    expect(JSON.stringify(openAiMetadata)).not.toContain("sk-openai-secret");

    const geminiMetadata = sanitizeCloudConnectorMetadata({
      connectorId: "cloud-gemini",
      methodId: "gemini.oauth_access_token",
      accessToken: "ya29.secret",
      baseUrl: "https://generativelanguage.googleapis.com",
    });
    expect(JSON.stringify(geminiMetadata)).not.toContain("ya29.secret");
  });

  it("persists bridge-issued binding metadata for cloud execution reuse", async () => {
    const sendNativeMessage = vi.fn(async (_hostName: string, message: Record<string, unknown>) => {
      if (message["type"] === "cloud.connection.complete") {
        return {
          ok: true as const,
          response: {
            type: "cloud.connection.complete",
            connectionHandle:
              "connh.provider.openai.openai.api_key.00000000-0000-4000-8000-000000000123.0.sig",
            endpointProfileHash: "sha256:endpoint-profile-openai",
            policyVersion: "policy.2026.03.24",
          },
        };
      }
      if (message["type"] === "cloud.models.discover") {
        return {
          ok: true as const,
          response: {
            type: "cloud.models.discover",
            models: [{ id: "gpt-5-mini", displayName: "GPT-5 Mini" }],
          },
        };
      }
      throw new Error(`Unexpected message type: ${String(message["type"])}`);
    });

    const connector = createCloudOpenAiConnector({
      sendNativeMessage,
      formatNativeHostRuntimeError: (message) => message,
      defaultNativeHostName: "com.byom.bridge",
    });

    const result = await connector.testConnection({
      methodId: "openai.api_key",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-openai-secret",
    });

    expect(result.ok).toBe(true);
    expect(result.metadata?.connectionHandle).toContain("connh.provider.openai");
    expect(result.metadata?.endpointProfileHash).toBe("sha256:endpoint-profile-openai");
    expect(result.metadata?.policyVersion).toBe("policy.2026.03.24");
  });

  it("falls back to direct foundry endpoint validation when cloud execution is policy-denied", async () => {
    const connector = createCloudFoundryConnector({
      sendNativeMessage: vi.fn(async () => ({
        ok: true as const,
        response: {
          type: "error",
          message: 'Cloud execution for method "foundry.api_key" is disabled by policy.',
        },
      })),
      formatNativeHostRuntimeError: (message) => message,
      defaultNativeHostName: "com.byom.bridge",
    });

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [{ id: "gpt-4o-mini", name: "GPT-4o mini" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await connector.testConnection({
      methodId: "foundry.api_key",
      apiUrl: "https://example-resource.openai.azure.com/openai/v1",
      apiVersion: "v1",
      apiKey: "foundry-secret",
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("attention");
    expect(result.message).toContain("Foundry endpoint validated.");
    expect(result.metadata?.connectionHandle).toBeDefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects foundry connection when bridge discover returns no models", async () => {
    const sendNativeMessage = vi.fn(async (_hostName: string, message: Record<string, unknown>) => {
      if (message["type"] === "cloud.connection.complete") {
        return {
          ok: true as const,
          response: {
            type: "cloud.connection.complete",
            connectionHandle:
              "connh.provider.microsoft-foundry.foundry.api_key.00000000-0000-4000-8000-000000000999.0.sig",
          },
        };
      }
      if (message["type"] === "cloud.models.discover") {
        return {
          ok: true as const,
          response: {
            type: "cloud.models.discover",
            models: [],
          },
        };
      }
      throw new Error(`Unexpected message type: ${String(message["type"])}`);
    });
    const connector = createCloudFoundryConnector({
      sendNativeMessage,
      formatNativeHostRuntimeError: (message) => message,
      defaultNativeHostName: "com.byom.bridge",
    });

    const result = await connector.testConnection({
      methodId: "foundry.api_key",
      apiUrl: "https://example-resource.openai.azure.com/openai/v1",
      apiVersion: "v1",
      apiKey: "foundry-secret",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("No models were discovered");
    const discoverCall = sendNativeMessage.mock.calls.find(
      (call) => call[1]?.["type"] === "cloud.models.discover",
    );
    expect(discoverCall?.[1]?.["connectionHandle"]).toContain(
      "connh.provider.microsoft-foundry.foundry.api_key.",
    );
  });

  it("rejects policy-denied foundry validation when endpoint reports no models", async () => {
    const connector = createCloudFoundryConnector({
      sendNativeMessage: vi.fn(async () => ({
        ok: true as const,
        response: {
          type: "error",
          message: 'Cloud execution for method "foundry.api_key" is disabled by policy.',
        },
      })),
      formatNativeHostRuntimeError: (message) => message,
      defaultNativeHostName: "com.byom.bridge",
    });
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await connector.testConnection({
      methodId: "foundry.api_key",
      apiUrl: "https://example-resource.openai.azure.com/openai/v1",
      apiVersion: "v1",
      apiKey: "foundry-secret",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("No models were discovered");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("falls back to Anthropic endpoint validation only when cloud execution is policy-denied", async () => {
    const connector = createCloudAnthropicConnector({
      sendNativeMessage: vi.fn(async () => ({
        ok: true as const,
        response: {
          type: "error",
          message: 'Cloud execution for method "anthropic.api_key" is disabled by policy.',
        },
      })),
      formatNativeHostRuntimeError: (message) => message,
      defaultNativeHostName: "com.byom.bridge",
    });
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [{ id: "claude-sonnet-4-5", displayName: "Claude Sonnet 4.5" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await connector.testConnection({
      methodId: "anthropic.api_key",
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test-key-1234567890",
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("attention");
    expect(result.message).toContain("disabled by policy");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects Anthropic connection when bridge discover returns no models", async () => {
    const sendNativeMessage = vi.fn(async (_hostName: string, message: Record<string, unknown>) => {
        if (message["type"] === "cloud.connection.complete") {
          return {
            ok: true as const,
            response: {
              type: "cloud.connection.complete",
              connectionHandle:
                "connh.provider.claude-subscription.anthropic.api_key.00000000-0000-4000-8000-000000000777.0.sig",
            },
          };
        }
        if (message["type"] === "cloud.models.discover") {
          return {
            ok: true as const,
            response: {
              type: "cloud.models.discover",
              models: [],
            },
          };
        }
        throw new Error(`Unexpected message type: ${String(message["type"])}`);
      });
    const connector = createCloudAnthropicConnector({
      sendNativeMessage,
      formatNativeHostRuntimeError: (message) => message,
      defaultNativeHostName: "com.byom.bridge",
    });
    const result = await connector.testConnection({
      methodId: "anthropic.api_key",
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test-key-1234567890",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("No models were discovered");
    const discoverCall = sendNativeMessage.mock.calls.find(
      (call) => call[1]?.["type"] === "cloud.models.discover",
    );
    expect(discoverCall?.[1]?.["connectionHandle"]).toContain(
      "connh.provider.claude-subscription.anthropic.api_key.",
    );
  });

  it("rejects policy-denied Anthropic endpoint validation when endpoint reports no models", async () => {
    const connector = createCloudAnthropicConnector({
      sendNativeMessage: vi.fn(async () => ({
        ok: true as const,
        response: {
          type: "error",
          message: 'Cloud execution for method "anthropic.api_key" is disabled by policy.',
        },
      })),
      formatNativeHostRuntimeError: (message) => message,
      defaultNativeHostName: "com.byom.bridge",
    });
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await connector.testConnection({
      methodId: "anthropic.api_key",
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test-key-1234567890",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("No models were discovered");
  });

  it("does not hide non-policy Anthropic bridge failures behind endpoint fallback", async () => {
    const connector = createCloudAnthropicConnector({
      sendNativeMessage: vi.fn(async () => ({
        ok: true as const,
        response: {
          type: "error",
          message: "Pairing session is missing or expired.",
        },
      })),
      formatNativeHostRuntimeError: (message) => message,
      defaultNativeHostName: "com.byom.bridge",
    });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await connector.testConnection({
      methodId: "anthropic.api_key",
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test-key-1234567890",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Pairing session is missing or expired");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
