#!/usr/bin/env node
import process from "node:process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { BridgeHandler } from "./bridge-handler.js";
import { CopilotCliChatExecutor } from "./cli/copilot-chat-executor.js";
import {
  type CloudChatMessage,
  CloudChatExecutor,
  type CloudChatExecuteRequest,
} from "./cloud/cloud-chat-executor.js";
import {
  CloudConnectionService,
  CloudConnectionServiceError,
  type CloudConnectionCompleteResult,
  type CloudControlPlaneAdapter,
} from "./cloud/cloud-connection-service.js";
import { ConnectionRegistry } from "./cloud/connection-registry.js";
import { InMemoryRequestIdempotencyStore } from "./cloud/idempotency-store.js";
import {
  createAuthenticatedOriginPolicyFromEnv,
  createCloudFeatureFlagsFromEnv,
} from "./config/index.js";
import { NativeHost } from "./native-host.js";
import { HandshakeManager } from "./session/handshake.js";
import { PairingManager } from "./session/pairing.js";
import { RequestVerifier } from "./session/request-verifier.js";
import { SessionKeyRegistry } from "./session/session-key-registry.js";
import { CloudObservability } from "./telemetry/cloud-observability.js";
import { VaultStore } from "./vault/vault-store.js";

type CloudAdapterContractV2Like = Readonly<{
  manifest: Readonly<{
    providerId: string;
  }>;
  beginConnect(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
  completeConnect(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
  validateCredentialRef(
    input: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>>;
  revokeCredentialRef(input: Readonly<Record<string, unknown>>): Promise<void>;
  discoverModels(
    context: Readonly<Record<string, unknown>>,
  ): Promise<readonly Readonly<Record<string, unknown>>[]>;
  discoverCapabilities(
    context: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>>;
  createSession(options?: Readonly<Record<string, unknown>>): Promise<string>;
  sendMessage(
    sessionId: string,
    message: string,
    options?: Readonly<{
      timeoutMs?: number;
      signal?: AbortSignal;
    }>,
  ): Promise<string>;
  streamMessage?: (
    sessionId: string,
    message: string,
    onChunk: (chunk: string) => void,
  ) => Promise<void>;
}>;

type AdapterConstructor<T> = new (...args: unknown[]) => T;

type StoredCloudConnectionState = Readonly<{
  credentialRef: string;
  endpointProfile: Readonly<Record<string, unknown>>;
}>;

type CloudChatExecutionResult = Readonly<{ content: string }>;
type CredentialEpochRequest = Readonly<{
  providerId: string;
  methodId: string;
  connectionHandle: string;
  region: string;
  extensionId: string;
  origin: string;
  policyVersion: string;
  endpointProfileHash: string;
}>;

const PACKAGE_NAME_BY_PROVIDER_ID: Readonly<Record<string, string>> = Object.freeze(
  {
    "claude-subscription": "@arlopass/adapter-claude-subscription",
    "microsoft-foundry": "@arlopass/adapter-microsoft-foundry",
    "google-vertex-ai": "@arlopass/adapter-google-vertex-ai",
    "amazon-bedrock": "@arlopass/adapter-amazon-bedrock",
    openai: "@arlopass/adapter-openai",
    perplexity: "@arlopass/adapter-perplexity",
    gemini: "@arlopass/adapter-gemini",
  },
);

const PROVIDER_ID_BY_PACKAGE_NAME: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(PACKAGE_NAME_BY_PROVIDER_ID).map(([providerId, packageName]) => [
      packageName,
      providerId,
    ]),
  ),
);

const CONSTRUCTOR_EXPORT_BY_PROVIDER_ID: Readonly<Record<string, string>> = Object.freeze({
  "claude-subscription": "ClaudeSubscriptionAdapter",
  "microsoft-foundry": "MicrosoftFoundryAdapter",
  "google-vertex-ai": "GoogleVertexAiAdapter",
  "amazon-bedrock": "AmazonBedrockAdapter",
  openai: "OpenAiAdapter",
  perplexity: "PerplexityAdapter",
  gemini: "GeminiAdapter",
});

const WORKSPACE_ADAPTER_SOURCE_ENTRY_BY_PROVIDER_ID: Readonly<Record<string, string>> =
  Object.freeze({
    "claude-subscription":
      "../../../adapters/adapter-claude-subscription/src/index.ts",
    "microsoft-foundry":
      "../../../adapters/adapter-microsoft-foundry/src/index.ts",
    "google-vertex-ai":
      "../../../adapters/adapter-google-vertex-ai/src/index.ts",
    "amazon-bedrock":
      "../../../adapters/adapter-amazon-bedrock/src/index.ts",
    openai: "../../../adapters/adapter-openai/src/index.ts",
    perplexity: "../../../adapters/adapter-perplexity/src/index.ts",
    gemini: "../../../adapters/adapter-gemini/src/index.ts",
  });

const registeredCloudAdapterPackages = new Map<string, string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toReadonlyRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return Object.freeze({ ...value });
}

function toStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return Object.freeze([]);
  }
  const normalized = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return Object.freeze(Array.from(new Set(normalized)));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseBooleanEnv(value: unknown): boolean | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  ) {
    return true;
  }
  if (
    normalized === "0" ||
    normalized === "false" ||
    normalized === "no" ||
    normalized === "off"
  ) {
    return false;
  }
  return undefined;
}

function parsePositiveIntegerEnv(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function isModuleNotFoundError(error: unknown): boolean {
  return (
    isRecord(error) &&
    typeof error["code"] === "string" &&
    error["code"] === "ERR_MODULE_NOT_FOUND"
  );
}

function shouldPreferWorkspaceAdapterSource(env: NodeJS.ProcessEnv): boolean {
  return parseBooleanEnv(env["ARLOPASS_BRIDGE_PREFER_WORKSPACE_ADAPTER_SOURCE"]) === true;
}

function isCloudAdapterContractV2Like(value: unknown): value is CloudAdapterContractV2Like {
  if (!isRecord(value)) {
    return false;
  }
  const manifest = toReadonlyRecord(value["manifest"]);
  if (manifest === undefined || normalizeNonEmptyString(manifest["providerId"]) === undefined) {
    return false;
  }

  return (
    typeof value["beginConnect"] === "function" &&
    typeof value["completeConnect"] === "function" &&
    typeof value["validateCredentialRef"] === "function" &&
    typeof value["revokeCredentialRef"] === "function" &&
    typeof value["discoverModels"] === "function" &&
    typeof value["discoverCapabilities"] === "function" &&
    typeof value["createSession"] === "function" &&
    typeof value["sendMessage"] === "function"
  );
}

function requireProviderAndMethod(
  input: Readonly<Record<string, unknown>>,
  operation: string,
): Readonly<{ providerId: string; methodId: string }> {
  const providerId = normalizeNonEmptyString(input["providerId"]);
  const methodId = normalizeNonEmptyString(input["methodId"]);
  if (providerId === undefined || methodId === undefined) {
    throw new CloudConnectionServiceError(
      `${operation} requires string fields: providerId and methodId.`,
      "request.invalid",
    );
  }
  return { providerId, methodId };
}

function parseDiscoverMethodId(
  input: Readonly<Record<string, unknown>>,
): string | undefined {
  return normalizeNonEmptyString(input["methodId"]);
}

function selectDiscoverMethodId(
  input: Readonly<Record<string, unknown>>,
  stateByMethodId: Map<string, StoredCloudConnectionState>,
  providerId: string,
): string {
  const requestedMethodId = parseDiscoverMethodId(input);
  if (requestedMethodId !== undefined) {
    return requestedMethodId;
  }
  const firstState = stateByMethodId.keys().next();
  if (!firstState.done) {
    return firstState.value;
  }
  throw new CloudConnectionServiceError(
    `No active cloud connection exists for provider "${providerId}".`,
    "request.invalid",
  );
}

function parseEndpointProfile(
  completeResult: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return toReadonlyRecord(completeResult["endpointProfile"]) ?? Object.freeze({});
}

function parseCredentialRef(completeResult: Readonly<Record<string, unknown>>): string {
  const credentialRef = normalizeNonEmptyString(completeResult["credentialRef"]);
  if (credentialRef === undefined) {
    throw new CloudConnectionServiceError(
      "Cloud adapter completion did not return a valid credentialRef.",
      "provider.unavailable",
    );
  }
  return credentialRef;
}

function parseCloudChatMessages(
  value: unknown,
): readonly CloudChatMessage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CloudConnectionServiceError(
      "executeChat requires a non-empty messages array.",
      "request.invalid",
    );
  }

  const messages: CloudChatMessage[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      (entry["role"] !== "system" &&
        entry["role"] !== "user" &&
        entry["role"] !== "assistant") ||
      typeof entry["content"] !== "string" ||
      entry["content"].trim().length === 0
    ) {
      throw new CloudConnectionServiceError(
        "executeChat contains an invalid message payload.",
        "request.invalid",
      );
    }
    messages.push({
      role: entry["role"],
      content: entry["content"],
    });
  }
  return messages;
}

type AdapterExecutionReasonCode =
  | "request.invalid"
  | "auth.invalid"
  | "auth.expired"
  | "permission.denied"
  | "policy.denied"
  | "provider.unavailable"
  | "transport.timeout"
  | "transport.cancelled"
  | "transport.transient_failure";

function normalizeAdapterExecutionReasonCode(
  value: unknown,
): AdapterExecutionReasonCode | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const canonical = value.trim().toLowerCase();
  switch (canonical) {
    case "request.invalid":
    case "auth.invalid":
    case "auth.expired":
    case "permission.denied":
    case "policy.denied":
    case "provider.unavailable":
    case "transport.timeout":
    case "transport.cancelled":
    case "transport.transient_failure":
      return canonical;
    case "timeout":
      return "transport.timeout";
    case "cancelled":
    case "canceled":
    case "aborted":
    case "abort":
      return "transport.cancelled";
    case "transient":
      return "transport.transient_failure";
    default:
      return undefined;
  }
}

function toAdapterExecutionError(
  error: unknown,
  fallbackMessage: string,
): Error & Readonly<{ reasonCode: AdapterExecutionReasonCode }> {
  const message =
    typeof error === "string" && error.trim().length > 0
      ? error
      : error instanceof Error && error.message.trim().length > 0
        ? error.message
        : fallbackMessage;
  const explicitReasonCode =
    isRecord(error)
      ? normalizeAdapterExecutionReasonCode(error["reasonCode"])
      : undefined;
  const fromCodeField =
    isRecord(error) && typeof error["code"] === "string"
      ? error["code"].toUpperCase()
      : undefined;
  const fromAbortName =
    error instanceof Error && error.name === "AbortError"
      ? "transport.cancelled"
      : undefined;
  const inferredReasonCode: AdapterExecutionReasonCode =
    explicitReasonCode ??
    fromAbortName ??
    (fromCodeField === "ETIMEDOUT" || fromCodeField === "ETIME"
      ? "transport.timeout"
      : /\b(timeout|timed out|deadline exceeded)\b/i.test(message)
        ? "transport.timeout"
        : "transport.transient_failure");
  const normalizedError =
    error instanceof Error
      ? new Error(message, { cause: error })
      : new Error(message);
  return Object.assign(normalizedError, {
    reasonCode: inferredReasonCode,
  });
}

function toAdapterPrompt(messages: readonly CloudChatMessage[]): string {
  return messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");
}

export function buildCloudControlPlaneAdapter(
  contract: CloudAdapterContractV2Like,
): CloudControlPlaneAdapter {
  const providerIdFromManifest = normalizeNonEmptyString(contract.manifest.providerId);
  if (providerIdFromManifest === undefined) {
    throw new CloudConnectionServiceError(
      "Cloud adapter manifest is missing providerId.",
      "request.invalid",
    );
  }

  const stateByMethodId = new Map<string, StoredCloudConnectionState>();

  return {
    async beginConnection(
      input: Readonly<Record<string, unknown>>,
    ): Promise<Readonly<Record<string, unknown>>> {
      const { providerId, methodId } = requireProviderAndMethod(input, "beginConnection");
      if (providerId !== providerIdFromManifest) {
        throw new CloudConnectionServiceError(
          `Provider mismatch: expected "${providerIdFromManifest}", received "${providerId}".`,
          "request.invalid",
        );
      }
      return contract.beginConnect({
        providerId,
        methodId,
        ...(toReadonlyRecord(input["input"]) !== undefined
          ? { input: toReadonlyRecord(input["input"]) }
          : {}),
        ...(normalizeNonEmptyString(input["correlationId"]) !== undefined
          ? { correlationId: normalizeNonEmptyString(input["correlationId"]) }
          : {}),
      });
    },

    async completeConnection(
      input: Readonly<Record<string, unknown>>,
    ): Promise<CloudConnectionCompleteResult> {
      const { providerId, methodId } = requireProviderAndMethod(
        input,
        "completeConnection",
      );
      if (providerId !== providerIdFromManifest) {
        throw new CloudConnectionServiceError(
          `Provider mismatch: expected "${providerIdFromManifest}", received "${providerId}".`,
          "request.invalid",
        );
      }
      const completeResult = await contract.completeConnect({
        providerId,
        methodId,
        ...(normalizeNonEmptyString(input["state"]) !== undefined
          ? { state: normalizeNonEmptyString(input["state"]) }
          : {}),
        ...(toReadonlyRecord(input["input"]) !== undefined
          ? { input: toReadonlyRecord(input["input"]) }
          : {}),
        ...(normalizeNonEmptyString(input["correlationId"]) !== undefined
          ? { correlationId: normalizeNonEmptyString(input["correlationId"]) }
          : {}),
      });

      if (!isRecord(completeResult)) {
        throw new CloudConnectionServiceError(
          "Cloud adapter completion returned an invalid payload.",
          "provider.unavailable",
        );
      }

      const completeResultRecord = Object.freeze({ ...completeResult });
      const credentialRef = parseCredentialRef(completeResultRecord);
      const endpointProfile = parseEndpointProfile(completeResultRecord);
      stateByMethodId.set(methodId, {
        credentialRef,
        endpointProfile,
      });

      return {
        ...completeResultRecord,
        credentialRef,
        ...(Object.keys(endpointProfile).length > 0 ? { endpointProfile } : {}),
      };
    },

    async validateConnection(
      input: Readonly<Record<string, unknown>>,
    ): Promise<Readonly<Record<string, unknown>>> {
      const { providerId, methodId } = requireProviderAndMethod(
        input,
        "validateConnection",
      );
      if (providerId !== providerIdFromManifest) {
        throw new CloudConnectionServiceError(
          `Provider mismatch: expected "${providerIdFromManifest}", received "${providerId}".`,
          "request.invalid",
        );
      }

      const storedState = stateByMethodId.get(methodId);
      const credentialRef =
        normalizeNonEmptyString(input["credentialRef"]) ?? storedState?.credentialRef;
      if (credentialRef === undefined) {
        return { ok: false, retryable: true, reason: "credential_ref_missing" };
      }

      const endpointProfile =
        toReadonlyRecord(input["endpointProfile"]) ??
        storedState?.endpointProfile ??
        Object.freeze({});
      return contract.validateCredentialRef({
        providerId,
        methodId,
        credentialRef,
        ...(Object.keys(endpointProfile).length > 0 ? { endpointProfile } : {}),
        ...(normalizeNonEmptyString(input["correlationId"]) !== undefined
          ? { correlationId: normalizeNonEmptyString(input["correlationId"]) }
          : {}),
      });
    },

    async revokeConnection(input: Readonly<Record<string, unknown>>): Promise<void> {
      const { providerId, methodId } = requireProviderAndMethod(input, "revokeConnection");
      if (providerId !== providerIdFromManifest) {
        throw new CloudConnectionServiceError(
          `Provider mismatch: expected "${providerIdFromManifest}", received "${providerId}".`,
          "request.invalid",
        );
      }

      const storedState = stateByMethodId.get(methodId);
      const credentialRef =
        normalizeNonEmptyString(input["credentialRef"]) ?? storedState?.credentialRef;
      if (credentialRef === undefined) {
        return;
      }

      await contract.revokeCredentialRef({
        providerId,
        methodId,
        credentialRef,
        ...(normalizeNonEmptyString(input["reason"]) !== undefined
          ? { reason: normalizeNonEmptyString(input["reason"]) }
          : {}),
        ...(normalizeNonEmptyString(input["correlationId"]) !== undefined
          ? { correlationId: normalizeNonEmptyString(input["correlationId"]) }
          : {}),
      });
      stateByMethodId.delete(methodId);
    },

    async discover(
      input: Readonly<Record<string, unknown>>,
    ): Promise<Readonly<{ models: readonly Readonly<Record<string, unknown>>[]; capabilities: readonly string[] }>> {
      const providerId = normalizeNonEmptyString(input["providerId"]);
      if (providerId === undefined) {
        throw new CloudConnectionServiceError(
          "discover requires a providerId string.",
          "request.invalid",
        );
      }
      if (providerId !== providerIdFromManifest) {
        throw new CloudConnectionServiceError(
          `Provider mismatch: expected "${providerIdFromManifest}", received "${providerId}".`,
          "request.invalid",
        );
      }

      const methodId = selectDiscoverMethodId(input, stateByMethodId, providerId);
      const state = stateByMethodId.get(methodId);
      const credentialRefFromInput = normalizeNonEmptyString(input["credentialRef"]);
      const credentialRef = credentialRefFromInput ?? state?.credentialRef;
      if (credentialRef === undefined) {
        throw new CloudConnectionServiceError(
          `No active cloud connection state is available for provider "${providerId}" method "${methodId}".`,
          "request.invalid",
        );
      }
      const endpointProfileFromInput = toReadonlyRecord(input["endpointProfile"]);
      const endpointProfile =
        endpointProfileFromInput ?? state?.endpointProfile ?? Object.freeze({});
      if (credentialRefFromInput !== undefined && state === undefined) {
        stateByMethodId.set(methodId, {
          credentialRef: credentialRefFromInput,
          endpointProfile,
        });
      }
      const correlationId =
        normalizeNonEmptyString(input["correlationId"]) ??
        `bridge.discovery.${providerId}.${methodId}.${Date.now().toString(36)}`;
      const connectionHandle = normalizeNonEmptyString(input["connectionHandle"]);
      const connectionInput = toReadonlyRecord(input["connectionInput"]);
      const context: Readonly<Record<string, unknown>> = {
        providerId,
        methodId,
        credentialRef,
        endpointProfile,
        correlationId,
        ...(connectionInput !== undefined ? { connectionInput } : {}),
        ...(connectionHandle !== undefined ? { connectionHandle } : {}),
      };

      const [modelsRaw, capabilitiesRaw] = await Promise.all([
        contract.discoverModels(context),
        contract.discoverCapabilities(context),
      ]);
      const models = modelsRaw
        .filter((entry): entry is Readonly<Record<string, unknown>> => isRecord(entry))
        .map((entry) => Object.freeze({ ...entry }));
      const capabilities = toStringArray(
        isRecord(capabilitiesRaw) ? capabilitiesRaw["capabilities"] : undefined,
      );

      return {
        models,
        capabilities,
      };
    },

    async executeChat(
      input: Readonly<Record<string, unknown>>,
    ): Promise<CloudChatExecutionResult> {
      const { providerId, methodId } = requireProviderAndMethod(
        input,
        "executeChat",
      );
      if (providerId !== providerIdFromManifest) {
        throw new CloudConnectionServiceError(
          `Provider mismatch: expected "${providerIdFromManifest}", received "${providerId}".`,
          "request.invalid",
        );
      }

      const state = stateByMethodId.get(methodId);
      const credentialRefFromInput = normalizeNonEmptyString(input["credentialRef"]);
      const credentialRef = credentialRefFromInput ?? state?.credentialRef;
      const endpointProfileFromInput = toReadonlyRecord(input["endpointProfile"]);
      const endpointProfile =
        endpointProfileFromInput ?? state?.endpointProfile ?? Object.freeze({});
      if (credentialRefFromInput !== undefined && state === undefined) {
        stateByMethodId.set(methodId, {
          credentialRef: credentialRefFromInput,
          endpointProfile,
        });
      }
      const modelId = normalizeNonEmptyString(input["modelId"]);
      if (modelId === undefined) {
        throw new CloudConnectionServiceError(
          "executeChat requires a non-empty modelId.",
          "request.invalid",
        );
      }
      const correlationId =
        normalizeNonEmptyString(input["correlationId"]) ??
        `bridge.chat.${providerId}.${methodId}.${Date.now().toString(36)}`;
      const timeoutMs =
        typeof input["timeoutMs"] === "number" && Number.isFinite(input["timeoutMs"])
          ? Math.max(1, Math.floor(input["timeoutMs"]))
          : undefined;
      const signal = input["signal"] instanceof AbortSignal ? input["signal"] : undefined;
      const messages = parseCloudChatMessages(input["messages"]);
      const statelessConnectionInput = toReadonlyRecord(input["connectionInput"]);

      if (credentialRef !== undefined) {
        const validation = await contract.validateCredentialRef({
          providerId,
          methodId,
          credentialRef,
          endpointProfile,
          correlationId,
        });
        if (!isRecord(validation) || validation["ok"] !== true) {
          const reason =
            typeof validation["reason"] === "string"
              ? validation["reason"].trim()
              : "";
          if (reason !== "credential_ref_not_found") {
            throw new CloudConnectionServiceError(
              "Cloud credential reference is missing, invalid, or revoked.",
              "auth.invalid",
            );
          }
        }
      }

      let sessionId: string;
      try {
        const sessionOptions: Readonly<Record<string, unknown>> = {
          model: modelId,
          methodId,
          ...(credentialRef !== undefined ? { credentialRef } : {}),
          ...(Object.keys(endpointProfile).length > 0
            ? { endpointProfile }
            : {}),
          ...(statelessConnectionInput !== undefined
            ? { connectionInput: statelessConnectionInput }
            : {}),
        };
        process.stderr.write(
          `[arlopass-bridge] DEBUG adapter.createSession provider=${providerId} model=${modelId} method=${methodId} hasCredRef=${credentialRef !== undefined} hasConnInput=${statelessConnectionInput !== undefined}\n`,
        );
        sessionId = await contract.createSession({
          ...sessionOptions,
        });
        process.stderr.write(
          `[arlopass-bridge] DEBUG adapter.createSession OK sessionId=${sessionId}\n`,
        );
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        process.stderr.write(
          `[arlopass-bridge] DEBUG adapter.createSession FAILED provider=${providerId}: ${errMsg}\n`,
        );
        throw toAdapterExecutionError(
          error,
          "Cloud adapter failed to create a chat session.",
        );
      }
      let content: string;
      const onChunk =
        typeof input["onChunk"] === "function"
          ? (input["onChunk"] as (chunk: string) => void)
          : undefined;
      const prompt = toAdapterPrompt(messages);
      process.stderr.write(
        `[arlopass-bridge] DEBUG adapter.send provider=${providerId} sessionId=${sessionId} promptLen=${prompt.length} streaming=${onChunk !== undefined && typeof contract.streamMessage === "function"}\n`,
      );
      try {
        if (onChunk !== undefined && typeof contract.streamMessage === "function") {
          let streamed = "";
          await contract.streamMessage(
            sessionId,
            prompt,
            (chunk: string) => {
              streamed += chunk;
              onChunk(chunk);
            },
          );
          content = streamed;
          process.stderr.write(
            `[arlopass-bridge] DEBUG adapter.streamMessage OK provider=${providerId} contentLen=${content.length}\n`,
          );
        } else {
          content = await contract.sendMessage(
            sessionId,
            prompt,
            {
              ...(timeoutMs !== undefined ? { timeoutMs } : {}),
              ...(signal !== undefined ? { signal } : {}),
            },
          );
          process.stderr.write(
            `[arlopass-bridge] DEBUG adapter.sendMessage OK provider=${providerId} contentLen=${content.length} preview="${content.slice(0, 120)}"\n`,
          );
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const errName = error instanceof Error ? error.constructor.name : "unknown";
        process.stderr.write(
          `[arlopass-bridge] DEBUG adapter.send FAILED provider=${providerId} error=${errName}: ${errMsg}\n`,
        );
        throw toAdapterExecutionError(
          error,
          "Cloud adapter failed to send a chat message.",
        );
      }
      if (typeof content !== "string" || content.trim().length === 0) {
        process.stderr.write(
          `[arlopass-bridge] DEBUG adapter.send EMPTY provider=${providerId} contentType=${typeof content} contentLen=${typeof content === "string" ? content.length : -1}\n`,
        );
        throw new CloudConnectionServiceError(
          "Cloud adapter returned empty chat content.",
          "provider.unavailable",
        );
      }
      return {
        content: content.trim(),
      };
    },
  };
}

function resolveAdapterConstructor(
  providerId: string,
  moduleNamespace: Readonly<Record<string, unknown>>,
): AdapterConstructor<CloudAdapterContractV2Like> {
  const exportName = CONSTRUCTOR_EXPORT_BY_PROVIDER_ID[providerId];
  if (exportName === undefined) {
    throw new Error(`No adapter constructor is configured for provider "${providerId}".`);
  }

  const constructorCandidate = moduleNamespace[exportName];
  if (typeof constructorCandidate !== "function") {
    throw new Error(
      `Adapter package for provider "${providerId}" does not export "${exportName}".`,
    );
  }
  return constructorCandidate as AdapterConstructor<CloudAdapterContractV2Like>;
}

function instantiateCloudAdapter(
  providerId: string,
  AdapterClass: AdapterConstructor<CloudAdapterContractV2Like>,
): CloudAdapterContractV2Like {
  if (providerId === "claude-subscription") {
    const adapter = new AdapterClass({
      auth: {
        authType: "api_key",
      },
    });
    if (!isCloudAdapterContractV2Like(adapter)) {
      throw new Error(
        `Loaded adapter for provider "${providerId}" does not implement CloudAdapterContractV2.`,
      );
    }
    return adapter;
  }

  const adapter = new AdapterClass();
  if (!isCloudAdapterContractV2Like(adapter)) {
    throw new Error(
      `Loaded adapter for provider "${providerId}" does not implement CloudAdapterContractV2.`,
    );
  }
  return adapter;
}

export function registerCloudAdapterPackage(packageName: string): void {
  const providerId = PROVIDER_ID_BY_PACKAGE_NAME[packageName];
  if (providerId === undefined) {
    throw new Error(`Unsupported cloud adapter package "${packageName}".`);
  }
  registeredCloudAdapterPackages.set(providerId, packageName);
}

export async function resolveCloudAdapter(
  providerId: string,
): Promise<CloudControlPlaneAdapter> {
  const normalizedProviderId = normalizeNonEmptyString(providerId);
  if (normalizedProviderId === undefined) {
    throw new Error("Cloud adapter providerId must be non-empty.");
  }

  const packageName = registeredCloudAdapterPackages.get(normalizedProviderId);
  if (packageName === undefined) {
    throw new Error(
      `No cloud adapter package is registered for provider "${normalizedProviderId}".`,
    );
  }

  const workspaceSourceEntry =
    WORKSPACE_ADAPTER_SOURCE_ENTRY_BY_PROVIDER_ID[normalizedProviderId];
  let workspaceSourceUrl: URL | undefined;
  if (workspaceSourceEntry !== undefined) {
    try {
      workspaceSourceUrl = new URL(workspaceSourceEntry, import.meta.url);
    } catch {
      // import.meta.url is unavailable in SEA / CJS bundles — skip workspace source
    }
  }

  if (
    workspaceSourceUrl !== undefined &&
    shouldPreferWorkspaceAdapterSource(process.env)
  ) {
    try {
      process.stderr.write(
        `[arlopass-bridge] info: cloud adapter "${normalizedProviderId}" loading workspace source by preference from ${workspaceSourceUrl.pathname}\n`,
      );
      const preferredNamespace = (await import(workspaceSourceUrl.href)) as unknown;
      if (!isRecord(preferredNamespace)) {
        throw new Error("workspace source module namespace is invalid");
      }
      const preferredAdapterClass = resolveAdapterConstructor(
        normalizedProviderId,
        preferredNamespace,
      );
      const preferredContract = instantiateCloudAdapter(
        normalizedProviderId,
        preferredAdapterClass,
      );
      return buildCloudControlPlaneAdapter(preferredContract);
    } catch (error) {
      process.stderr.write(
        `[arlopass-bridge] warning: cloud adapter "${normalizedProviderId}" workspace source preference failed; falling back to package import: ${toErrorMessage(error)}\n`,
      );
    }
  }

  const moduleNamespaceUnknown = (await (async () => {
    try {
      return (await import(packageName)) as unknown;
    } catch (error) {
      if (
        workspaceSourceUrl === undefined ||
        !isModuleNotFoundError(error)
      ) {
        throw error;
      }

      try {
        process.stderr.write(
          `[arlopass-bridge] info: cloud adapter "${normalizedProviderId}" package entry is unavailable; loading workspace source fallback from ${workspaceSourceUrl.pathname}\n`,
        );
        return (await import(workspaceSourceUrl.href)) as unknown;
      } catch (fallbackError) {
        throw new Error(
          `Failed to load cloud adapter package "${packageName}" and workspace source fallback "${workspaceSourceEntry}": packageError=${toErrorMessage(error)} | fallbackError=${toErrorMessage(fallbackError)}`,
        );
      }
    }
  })()) as unknown;
  if (!isRecord(moduleNamespaceUnknown)) {
    throw new Error(`Adapter package "${packageName}" returned an invalid module namespace.`);
  }

  const AdapterClass = resolveAdapterConstructor(
    normalizedProviderId,
    moduleNamespaceUnknown,
  );
  const contract = instantiateCloudAdapter(normalizedProviderId, AdapterClass);
  return buildCloudControlPlaneAdapter(contract);
}

async function loadRegisteredCloudAdapters(): Promise<
  Readonly<Record<string, CloudControlPlaneAdapter>>
> {
  const adaptersByProvider: Record<string, CloudControlPlaneAdapter> = {};
  for (const providerId of registeredCloudAdapterPackages.keys()) {
    try {
      adaptersByProvider[providerId] = await resolveCloudAdapter(providerId);
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      process.stderr.write(
        `[arlopass-bridge] warning: failed to load cloud adapter for "${providerId}": ${errorMessage}\n`,
      );
    }
  }
  return Object.freeze(adaptersByProvider);
}

function resolvePairingCodeRetrievalHintFromEnv(
  env: NodeJS.ProcessEnv,
): string | undefined {
  const explicitHint = normalizeNonEmptyString(env["ARLOPASS_BRIDGE_PAIRING_CODE_HINT"]);
  if (explicitHint !== undefined) {
    return explicitHint;
  }

  const pairingCodeLogPath = normalizeNonEmptyString(
    env["ARLOPASS_BRIDGE_PAIRING_CODE_LOG_PATH"],
  );
  if (pairingCodeLogPath !== undefined) {
    return `Bridge pairing code log: ${pairingCodeLogPath}`;
  }
  return undefined;
}

function resolveVaultFilePathFromEnv(
  env: NodeJS.ProcessEnv,
): string | undefined {
  const value = normalizeNonEmptyString(env["ARLOPASS_BRIDGE_VAULT_FILE_PATH"]);
  if (value !== undefined) return value;
  const localAppData = normalizeNonEmptyString(env["LOCALAPPDATA"]);
  if (localAppData !== undefined) {
    return join(localAppData, "Arlopass", "bridge", "state", "vault.encrypted");
  }
  return undefined;
}

function resolveVaultLockoutFilePathFromEnv(
  env: NodeJS.ProcessEnv,
): string | undefined {
  const value = normalizeNonEmptyString(env["ARLOPASS_BRIDGE_VAULT_LOCKOUT_FILE_PATH"]);
  if (value !== undefined) return value;
  const localAppData = normalizeNonEmptyString(env["LOCALAPPDATA"]);
  if (localAppData !== undefined) {
    return join(localAppData, "Arlopass", "bridge", "state", "vault-lockout.json");
  }
  return undefined;
}

function resolvePairingStateFilePathFromEnv(
  env: NodeJS.ProcessEnv,
): string | undefined {
  const explicitPath = normalizeNonEmptyString(env["ARLOPASS_BRIDGE_PAIRING_STATE_PATH"]);
  if (explicitPath !== undefined) {
    return explicitPath;
  }

  const localAppData = normalizeNonEmptyString(env["LOCALAPPDATA"]);
  if (localAppData !== undefined) {
    return join(localAppData, "Arlopass", "bridge", "state", "pairing-state.json");
  }
  return undefined;
}

function resolveHandshakeStateFilePathFromEnv(
  env: NodeJS.ProcessEnv,
): string | undefined {
  const explicitPath = normalizeNonEmptyString(env["ARLOPASS_BRIDGE_HANDSHAKE_STATE_PATH"]);
  if (explicitPath !== undefined) {
    return explicitPath;
  }

  const localAppData = normalizeNonEmptyString(env["LOCALAPPDATA"]);
  if (localAppData !== undefined) {
    return join(localAppData, "Arlopass", "bridge", "state", "handshake-state.json");
  }
  return undefined;
}

function resolveSessionKeyStateFilePathFromEnv(
  env: NodeJS.ProcessEnv,
): string | undefined {
  const explicitPath = normalizeNonEmptyString(env["ARLOPASS_BRIDGE_SESSION_KEY_STATE_PATH"]);
  if (explicitPath !== undefined) {
    return explicitPath;
  }

  const localAppData = normalizeNonEmptyString(env["LOCALAPPDATA"]);
  if (localAppData !== undefined) {
    return join(localAppData, "Arlopass", "bridge", "state", "session-key-state.json");
  }
  return undefined;
}

function resolveCloudConnectionStateFilePathFromEnv(
  env: NodeJS.ProcessEnv,
): string | undefined {
  const explicitPath = normalizeNonEmptyString(
    env["ARLOPASS_BRIDGE_CLOUD_CONNECTION_STATE_PATH"],
  );
  if (explicitPath !== undefined) {
    return explicitPath;
  }

  const localAppData = normalizeNonEmptyString(env["LOCALAPPDATA"]);
  if (localAppData !== undefined) {
    return join(
      localAppData,
      "Arlopass",
      "bridge",
      "state",
      "cloud-connection-state.json",
    );
  }
  return undefined;
}

function resolveRequestIdempotencyStateFilePathFromEnv(
  env: NodeJS.ProcessEnv,
): string | undefined {
  const explicitPath = normalizeNonEmptyString(
    env["ARLOPASS_BRIDGE_REQUEST_IDEMPOTENCY_STATE_PATH"],
  );
  if (explicitPath !== undefined) {
    return explicitPath;
  }

  const localAppData = normalizeNonEmptyString(env["LOCALAPPDATA"]);
  if (localAppData !== undefined) {
    return join(
      localAppData,
      "Arlopass",
      "bridge",
      "state",
      "request-idempotency-state.json",
    );
  }
  return undefined;
}

registerCloudAdapterPackage("@arlopass/adapter-claude-subscription");
registerCloudAdapterPackage("@arlopass/adapter-microsoft-foundry");
registerCloudAdapterPackage("@arlopass/adapter-google-vertex-ai");
registerCloudAdapterPackage("@arlopass/adapter-amazon-bedrock");
registerCloudAdapterPackage("@arlopass/adapter-openai");
registerCloudAdapterPackage("@arlopass/adapter-perplexity");
registerCloudAdapterPackage("@arlopass/adapter-gemini");

/**
 * Resolves file path for the connection registry signing key.
 */
function resolveSigningKeyFilePathFromEnv(
  env: NodeJS.ProcessEnv,
): string | undefined {
  const explicitPath = normalizeNonEmptyString(env["ARLOPASS_BRIDGE_SIGNING_KEY_PATH"]);
  if (explicitPath !== undefined) {
    return explicitPath;
  }

  const localAppData = normalizeNonEmptyString(env["LOCALAPPDATA"]);
  if (localAppData !== undefined) {
    return join(localAppData, "Arlopass", "bridge", "state", "signing-key.bin");
  }
  return undefined;
}

/**
 * Loads the connection registry signing key from disk, or generates and
 * persists a new one.  This ensures connection handles survive bridge
 * process restarts — the same key is used to sign and verify handles.
 */
function loadOrGenerateSigningKey(env: NodeJS.ProcessEnv): Buffer {
  const keyPath = resolveSigningKeyFilePathFromEnv(env);
  if (keyPath === undefined) {
    return randomBytes(32);
  }

  if (existsSync(keyPath)) {
    try {
      const raw = readFileSync(keyPath);
      if (raw.length === 32) {
        return Buffer.from(raw);
      }
      process.stderr.write(
        `[arlopass-bridge] warning: signing key at "${keyPath}" has invalid length (${String(raw.length)}), regenerating\n`,
      );
    } catch (error) {
      process.stderr.write(
        `[arlopass-bridge] warning: failed to read signing key from "${keyPath}": ${toErrorMessage(error)}, regenerating\n`,
      );
    }
  }

  const key = randomBytes(32);
  try {
    mkdirSync(dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, key, { mode: 0o600 });
  } catch (error) {
    process.stderr.write(
      `[arlopass-bridge] warning: failed to persist signing key to "${keyPath}": ${toErrorMessage(error)}\n`,
    );
  }
  return key;
}

/**
 * Bridge entry point.
 *
 * Bootstraps the native messaging host and wires the BridgeHandler into the
 * message pipeline.  Extensions must pair via `pairing.auto` before
 * performing a handshake — there is no shared secret.
 */
async function main(): Promise<void> {
  process.title = "Arlopass Bridge";

  const signingKey = loadOrGenerateSigningKey(process.env);
  const cloudFeatureFlags = createCloudFeatureFlagsFromEnv(process.env);
  const authenticatedOriginPolicy =
    createAuthenticatedOriginPolicyFromEnv(process.env);
  const cloudConnectionStateFilePath =
    resolveCloudConnectionStateFilePathFromEnv(process.env);
  const requestIdempotencyStateFilePath =
    resolveRequestIdempotencyStateFilePathFromEnv(process.env);
  const requestIdempotencyTtlMs = parsePositiveIntegerEnv(
    process.env["ARLOPASS_BRIDGE_REQUEST_IDEMPOTENCY_TTL_MS"],
  );
  const requestIdempotencyMaxEntries = parsePositiveIntegerEnv(
    process.env["ARLOPASS_BRIDGE_REQUEST_IDEMPOTENCY_MAX_ENTRIES"],
  );
  const sessionKeyStateFilePath = resolveSessionKeyStateFilePathFromEnv(process.env);
  const sessionKeyRegistry = new SessionKeyRegistry({
    ...(sessionKeyStateFilePath !== undefined
      ? { stateFilePath: sessionKeyStateFilePath }
      : {}),
  });
  const cloudObservability = new CloudObservability();

  const cliChatExecutor = new CopilotCliChatExecutor();
  const adaptersByProvider = await loadRegisteredCloudAdapters();
  const connectionRegistry = new ConnectionRegistry({
    signatureKey: signingKey,
  });
  const cloudConnectionService = new CloudConnectionService({
    adaptersByProvider,
    connectionRegistry,
    ...(cloudConnectionStateFilePath !== undefined
      ? { stateFilePath: cloudConnectionStateFilePath }
      : {}),
  });
  const cloudChatExecutor = new CloudChatExecutor({
    epochLookup: {
      getCredentialEpoch: async (input: CredentialEpochRequest) =>
        cloudConnectionService.getCredentialEpoch({
          providerId: input.providerId,
          methodId: input.methodId,
          connectionHandle: input.connectionHandle,
          region: input.region,
          extensionId: input.extensionId,
          origin: input.origin,
          policyVersion: input.policyVersion,
          endpointProfileHash: input.endpointProfileHash,
        }),
    },
    dataPlaneSend: async (
      request: CloudChatExecuteRequest,
    ): Promise<CloudChatExecutionResult> =>
      cloudConnectionService.executeChat({
        providerId: request.providerId,
        methodId: request.methodId,
        modelId: request.modelId,
        connectionHandle: request.connectionHandle,
        extensionId: request.extensionId,
        origin: request.origin,
        messages: request.messages,
        correlationId: request.correlationId,
        ...(typeof request.timeoutMs === "number" && Number.isFinite(request.timeoutMs)
          ? { timeoutMs: request.timeoutMs }
          : {}),
        ...(request.signal instanceof AbortSignal ? { signal: request.signal } : {}),
        policyVersion: request.policyVersion,
        endpointProfileHash: request.endpointProfileHash,
        ...(typeof request.onChunk === "function" ? { onChunk: request.onChunk } : {}),
      }),
    observability: cloudObservability,
  });
  cloudConnectionService.startBackgroundRefresh();
  const probeTargets = [
    { cliType: "copilot-cli", label: "GitHub Copilot CLI" },
    { cliType: "claude-code", label: "Claude Code" },
  ] as const;
  for (const target of probeTargets) {
    try {
      await cliChatExecutor.probe(5_000, target.cliType);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `[arlopass-bridge] warning: ${target.label} probe failed; that CLI path may be unavailable: ${errorMessage}\n`,
      );
    }
  }
  const pairingCodeRetrievalHint =
    resolvePairingCodeRetrievalHintFromEnv(process.env);
  const pairingStateFilePath = resolvePairingStateFilePathFromEnv(process.env);
  const handshakeStateFilePath = resolveHandshakeStateFilePathFromEnv(
    process.env,
  );

  const vaultFilePath = resolveVaultFilePathFromEnv(process.env) ?? "vault.encrypted";
  const vaultLockoutFilePath = resolveVaultLockoutFilePathFromEnv(process.env) ?? "vault-lockout.json";
  const vaultAutoLockMs = parsePositiveIntegerEnv(process.env["ARLOPASS_VAULT_AUTO_LOCK_MS"]);
  const vaultMinPasswordLength = parsePositiveIntegerEnv(process.env["ARLOPASS_VAULT_MIN_PASSWORD_LENGTH"]);
  const vaultStore = new VaultStore({
    vaultFilePath,
    lockoutFilePath: vaultLockoutFilePath,
    ...(vaultAutoLockMs !== undefined ? { autoLockMs: vaultAutoLockMs } : {}),
    ...(vaultMinPasswordLength !== undefined ? { minPasswordLength: vaultMinPasswordLength } : {}),
  });

  const bridgeHandler = new BridgeHandler({
    vaultStore,
    signingKey,
    handshakeManager: new HandshakeManager({
      ...(handshakeStateFilePath !== undefined
        ? { stateFilePath: handshakeStateFilePath }
        : {}),
    }),
    sessionKeyRegistry,
    requestVerifier: new RequestVerifier({
      authenticatedOrigins: authenticatedOriginPolicy.authenticatedOrigins,
      authenticatedOriginMatcher:
        authenticatedOriginPolicy.authenticatedOriginMatcher,
      sessionKeyResolver: (sessionToken) =>
        sessionKeyRegistry.resolveRecord(sessionToken),
    }),
    requestIdempotencyStore: new InMemoryRequestIdempotencyStore({
      ...(requestIdempotencyStateFilePath !== undefined
        ? { stateFilePath: requestIdempotencyStateFilePath }
        : {}),
      ...(requestIdempotencyTtlMs !== undefined
        ? { ttlMs: requestIdempotencyTtlMs }
        : {}),
      ...(requestIdempotencyMaxEntries !== undefined
        ? { maxEntries: requestIdempotencyMaxEntries }
        : {}),
    }),
    cliChatExecutor,
    cloudConnectionService,
    cloudChatExecutor,
    cloudFeatureFlags,
    pairingManager: new PairingManager({
      ...(pairingStateFilePath !== undefined
        ? { stateFilePath: pairingStateFilePath }
        : {}),
    }),
    ...(pairingCodeRetrievalHint !== undefined
      ? { pairingCodeRetrievalHint }
      : {}),
  });

  const host = new NativeHost({
    input: process.stdin,
    output: process.stdout,
    handler: (message, writer) => bridgeHandler.handle(message, writer),
  });

  await host.run();
}

if (process.env["VITEST"] !== "true") {
  main().catch((error: unknown) => {
    process.stderr.write(`[arlopass-bridge] fatal: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
