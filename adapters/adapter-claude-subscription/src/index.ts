import { randomUUID } from "node:crypto";

import {
  type AdapterManifest,
  type BeginConnectInput,
  type BeginConnectResult,
  type CapabilityDescriptor,
  type CloudAdapterContractV2,
  type CloudConnectionContext,
  type CompleteConnectInput,
  type CompleteConnectResult,
  type ConnectionMethodDescriptor,
  type ModelDescriptor,
  type RevokeCredentialRefInput,
  type ValidateCredentialRefInput,
  type ValidationResult,
  MANIFEST_SCHEMA_VERSION,
} from "@byom-ai/adapter-runtime";
import {
  type ProtocolCapability,
  AuthError,
  PermissionError,
  ProviderUnavailableError,
  TimeoutError,
  TransientNetworkError,
} from "@byom-ai/protocol";
import {
  buildAuthHeaders,
  CLAUDE_API_BASE,
  CLAUDE_CONNECTION_METHOD_IDS,
  isClaudeConnectionMethodId,
  type ClaudeAuthConfig,
  type ClaudeConnectionMethodId,
} from "./auth.js";

export {
  buildAuthHeaders,
  CLAUDE_CONNECTION_METHOD_IDS,
  isClaudeConnectionMethodId,
  type ClaudeAuthConfig,
  type ClaudeConnectionMethodId,
} from "./auth.js";

export const CLAUDE_CONNECTION_METHODS: readonly ConnectionMethodDescriptor[] = [
  {
    id: CLAUDE_CONNECTION_METHOD_IDS.OAUTH_SUBSCRIPTION,
    authFlow: "oauth2-device",
    displayName: "Anthropic Subscription (OAuth)",
    requiredFields: ["accessToken"],
    optionalFields: ["endpointProfile", "refreshToken"],
  },
  {
    id: CLAUDE_CONNECTION_METHOD_IDS.API_KEY,
    authFlow: "api-key",
    displayName: "Anthropic API Key",
    requiredFields: ["apiKey"],
    optionalFields: ["endpointProfile"],
  },
] as const;

export const CLAUDE_SUBSCRIPTION_MANIFEST: AdapterManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  providerId: "claude-subscription",
  version: "0.1.0",
  displayName: "Claude (Subscription)",
  authType: "oauth2",
  capabilities: [
    "chat.completions",
    "chat.stream",
    "provider.list",
    "session.create",
  ] as unknown as readonly ProtocolCapability[],
  connectionMethods: CLAUDE_CONNECTION_METHODS,
  requiredPermissions: ["network.egress"],
  egressRules: [{ host: "api.anthropic.com", protocol: "https" }],
  riskLevel: "medium",
  signingKeyId: "byom-first-party-v1",
};

export type ClaudeAdapterOptions = Readonly<{
  auth: ClaudeAuthConfig;
  defaultModel?: string;
  timeoutMs?: number;
  baseUrl?: string;
}>;

type ClaudeSession = {
  model: string;
  messages: Array<{ role: string; content: string }>;
  auth: ClaudeAuthConfig;
  baseUrl: string;
  timeoutMs: number;
};

type ClaudeErrorBody = {
  type?: string;
  error?: { type?: string; message?: string };
};

type ClaudeContentBlock = { type: string; text?: string };
type ClaudeMessageResponse = {
  id?: string;
  type?: string;
  role?: string;
  content?: ClaudeContentBlock[];
  stop_reason?: string;
};

type ClaudeStreamEvent = {
  type: string;
  index?: number;
  delta?: { type: string; text?: string };
};

type StoredCredentialRef = Readonly<{
  providerId: string;
  methodId: ClaudeConnectionMethodId;
  auth: ClaudeAuthConfig;
  endpointProfile: Readonly<Record<string, unknown>>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function resolveConnectionMethod(methodId: unknown): ClaudeConnectionMethodId | undefined {
  const normalized = normalizeNonEmptyString(methodId);
  if (normalized === undefined || !isClaudeConnectionMethodId(normalized)) {
    return undefined;
  }
  return normalized;
}

function resolveEndpointProfile(
  input: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  const endpointProfile = input?.["endpointProfile"];
  if (!isRecord(endpointProfile)) return Object.freeze({});
  return Object.freeze({ ...endpointProfile });
}

function canonicalizeJsonValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return "null";
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeJsonValue(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
    const fields = keys
      .filter((key) => {
        const candidate = record[key];
        return (
          candidate !== undefined &&
          typeof candidate !== "function" &&
          typeof candidate !== "symbol"
        );
      })
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJsonValue(record[key])}`);
    return `{${fields.join(",")}}`;
  }
  return "null";
}

function resolveCredentialMaterial(
  methodId: ClaudeConnectionMethodId,
  input: Readonly<Record<string, unknown>> | undefined,
): ClaudeAuthConfig {
  if (methodId === CLAUDE_CONNECTION_METHOD_IDS.API_KEY) {
    const apiKey = normalizeNonEmptyString(input?.["apiKey"]);
    if (apiKey === undefined) {
      throw new AuthError(
        'Connection method "anthropic.api_key" requires input.apiKey.',
      );
    }
    return {
      authType: "api_key",
      apiKey,
    };
  }

  const accessToken = normalizeNonEmptyString(input?.["accessToken"]);
  if (accessToken === undefined) {
    throw new AuthError(
      'Connection method "anthropic.oauth_subscription" requires input.accessToken.',
    );
  }
  return {
    authType: "oauth2",
    accessToken,
  };
}

function mapNetworkError(error: unknown): never {
  const err = error instanceof Error ? error : new Error(String(error));
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET") {
    throw new ProviderUnavailableError(
      `Claude API is not reachable: ${err.message}`,
      { cause: err },
    );
  }
  if (code === "ETIMEDOUT") {
    throw new TimeoutError(`Claude API request timed out: ${err.message}`, { cause: err });
  }
  throw new TransientNetworkError(`Claude API network error: ${err.message}`, { cause: err });
}

async function mapHttpError(response: Response): Promise<never> {
  let errorBody: ClaudeErrorBody = {};
  try {
    errorBody = (await response.json()) as ClaudeErrorBody;
  } catch {
    // ignore parse errors
  }
  const message = errorBody.error?.message ?? response.statusText;

  if (response.status === 401) {
    throw new AuthError(`Claude API authentication failed: ${message}`);
  }
  if (response.status === 403) {
    throw new PermissionError(`Claude API permission denied: ${message}`);
  }
  if (response.status === 429) {
    throw new TransientNetworkError(`Claude API rate limit exceeded: ${message}`);
  }
  if (response.status >= 500 || response.status === 529) {
    throw new ProviderUnavailableError(`Claude API server error ${response.status}: ${message}`);
  }
  throw new TransientNetworkError(
    `Claude API request failed with HTTP ${response.status}: ${message}`,
  );
}

function resolveBaseUrlForDiscovery(
  endpointProfile: Readonly<Record<string, unknown>>,
  fallbackProfile: Readonly<Record<string, unknown>>,
  fallbackBaseUrl: string,
): string {
  const resolved =
    normalizeNonEmptyString(endpointProfile["baseUrl"]) ??
    normalizeNonEmptyString(fallbackProfile["baseUrl"]) ??
    fallbackBaseUrl;
  return resolved.replace(/\/$/, "");
}

function parseAnthropicModelDescriptors(payload: unknown): readonly ModelDescriptor[] {
  if (!isRecord(payload) || !Array.isArray(payload["data"])) {
    return [];
  }
  const models: ModelDescriptor[] = [];
  for (const entry of payload["data"]) {
    if (!isRecord(entry)) {
      continue;
    }
    const id =
      normalizeNonEmptyString(entry["id"]) ??
      normalizeNonEmptyString(entry["model"]);
    if (id === undefined) {
      continue;
    }
    const displayName =
      normalizeNonEmptyString(entry["display_name"]) ??
      normalizeNonEmptyString(entry["displayName"]) ??
      normalizeNonEmptyString(entry["name"]) ??
      id;
    models.push(
      Object.freeze({
        id,
        displayName,
      }),
    );
  }
  return models;
}

export class ClaudeSubscriptionAdapter implements CloudAdapterContractV2 {
  readonly manifest: AdapterManifest = CLAUDE_SUBSCRIPTION_MANIFEST;

  readonly #auth: ClaudeAuthConfig;
  readonly #defaultModel: string;
  readonly #timeoutMs: number;
  readonly #baseUrl: string;
  readonly #sessions = new Map<string, ClaudeSession>();
  readonly #credentialRefs = new Map<string, StoredCredentialRef>();

  constructor(options: ClaudeAdapterOptions) {
    this.#auth = options.auth;
    this.#defaultModel = options.defaultModel ?? "claude-sonnet-4-5";
    this.#timeoutMs = options.timeoutMs ?? 60_000;
    this.#baseUrl = options.baseUrl ?? CLAUDE_API_BASE;
  }

  describeCapabilities(): readonly ProtocolCapability[] {
    return CLAUDE_SUBSCRIPTION_MANIFEST.capabilities;
  }

  async listModels(): Promise<readonly string[]> {
    return [this.#defaultModel];
  }

  listConnectionMethods(): readonly ConnectionMethodDescriptor[] {
    return CLAUDE_CONNECTION_METHODS;
  }

  async beginConnect(input: BeginConnectInput): Promise<BeginConnectResult> {
    const providerId = normalizeNonEmptyString(input.providerId);
    if (providerId !== this.manifest.providerId) {
      throw new AuthError(
        `Unsupported providerId "${String(input.providerId)}" for claude-subscription adapter.`,
      );
    }
    const methodId = resolveConnectionMethod(input.methodId);
    if (methodId === undefined) {
      throw new AuthError(`Unsupported connection method "${String(input.methodId)}".`);
    }

    if (methodId === CLAUDE_CONNECTION_METHOD_IDS.API_KEY) {
      return {
        providerId,
        methodId,
        requiredFields: ["apiKey"],
        optionalFields: ["endpointProfile"],
      };
    }

    return {
      providerId,
      methodId,
      requiredFields: ["accessToken"],
      optionalFields: ["endpointProfile", "refreshToken"],
      challenge: {
        type: "oauth2.device_code",
        verification_uri: "https://claude.ai/device",
        user_code: "CLAUDE-SUBSCRIPTION",
        interval: 5,
        expires_in: 600,
      },
    };
  }

  async completeConnect(input: CompleteConnectInput): Promise<CompleteConnectResult> {
    const providerId = normalizeNonEmptyString(input.providerId);
    if (providerId !== this.manifest.providerId) {
      throw new AuthError(
        `Unsupported providerId "${String(input.providerId)}" for claude-subscription adapter.`,
      );
    }
    const methodId = resolveConnectionMethod(input.methodId);
    if (methodId === undefined) {
      throw new AuthError(`Unsupported connection method "${String(input.methodId)}".`);
    }

    const credentialMaterial = resolveCredentialMaterial(methodId, input.input);
    const endpointProfile = resolveEndpointProfile(input.input);
    const credentialRef = `credref.${this.manifest.providerId}.${methodId}.${randomUUID()}`;
    this.#credentialRefs.set(credentialRef, {
      providerId,
      methodId,
      auth: credentialMaterial,
      endpointProfile,
    });

    return {
      providerId,
      methodId,
      credentialRef,
      ...(Object.keys(endpointProfile).length > 0 ? { endpointProfile } : {}),
    };
  }

  async validateCredentialRef(input: ValidateCredentialRefInput): Promise<ValidationResult> {
    const providerId = normalizeNonEmptyString(input.providerId);
    if (providerId === undefined) {
      return { ok: false, retryable: false, reason: "provider_id_missing" };
    }
    if (providerId !== this.manifest.providerId) {
      return { ok: false, retryable: false, reason: "provider_id_mismatch" };
    }

    const methodId = resolveConnectionMethod(input.methodId);
    if (methodId === undefined) {
      return { ok: false, retryable: false, reason: "unsupported_method_id" };
    }

    const credentialRef = normalizeNonEmptyString(input.credentialRef);
    if (credentialRef === undefined) {
      return { ok: false, retryable: false, reason: "credential_ref_missing" };
    }

    const storedRef = this.#credentialRefs.get(credentialRef);
    if (storedRef === undefined) {
      return { ok: false, retryable: false, reason: "credential_ref_not_found" };
    }
    if (storedRef.providerId !== providerId || storedRef.methodId !== methodId) {
      return { ok: false, retryable: false, reason: "credential_ref_binding_mismatch" };
    }

    if (
      input.endpointProfile !== undefined &&
      canonicalizeJsonValue(input.endpointProfile) !== canonicalizeJsonValue(storedRef.endpointProfile)
    ) {
      return { ok: false, retryable: false, reason: "endpoint_profile_mismatch" };
    }

    if (methodId === CLAUDE_CONNECTION_METHOD_IDS.API_KEY) {
      const apiKey = normalizeNonEmptyString(storedRef.auth.apiKey);
      if (apiKey === undefined) {
        return { ok: false, retryable: false, reason: "credential_material_missing" };
      }
      return { ok: true };
    }

    const accessToken = normalizeNonEmptyString(storedRef.auth.accessToken);
    if (accessToken === undefined) {
      return { ok: false, retryable: false, reason: "credential_material_missing" };
    }
    return { ok: true };
  }

  async revokeCredentialRef(input: RevokeCredentialRefInput): Promise<void> {
    const providerId = normalizeNonEmptyString(input.providerId);
    const methodId = resolveConnectionMethod(input.methodId);
    const credentialRef = normalizeNonEmptyString(input.credentialRef);
    if (
      providerId === undefined ||
      providerId !== this.manifest.providerId ||
      methodId === undefined ||
      credentialRef === undefined
    ) {
      return;
    }

    const storedRef = this.#credentialRefs.get(credentialRef);
    if (storedRef === undefined) return;
    if (storedRef.providerId !== providerId || storedRef.methodId !== methodId) return;
    this.#credentialRefs.delete(credentialRef);
  }

  async discoverModels(ctx: CloudConnectionContext): Promise<readonly ModelDescriptor[]> {
    const methodId = resolveConnectionMethod(ctx.methodId);
    if (methodId === undefined) {
      throw new AuthError(`Unsupported connection method "${String(ctx.methodId)}".`);
    }
    const contextRecord = ctx as Readonly<Record<string, unknown>>;
    const statelessInput = isRecord(contextRecord["connectionInput"])
      ? contextRecord["connectionInput"]
      : undefined;
    const validation = await this.validateCredentialRef({
      providerId: ctx.providerId,
      methodId: ctx.methodId,
      credentialRef: ctx.credentialRef,
      endpointProfile: ctx.endpointProfile,
      correlationId: ctx.correlationId,
    });
    const canUseStatelessInput =
      statelessInput !== undefined &&
      (validation.reason === "credential_ref_not_found" ||
        validation.reason === "credential_ref_missing");
    if (!validation.ok && !canUseStatelessInput) {
      throw new AuthError(
        `Cannot discover models for invalid credential reference: ${validation.reason ?? "invalid_ref"}.`,
      );
    }
    let baseUrl = this.#baseUrl;
    let headers: Readonly<Record<string, string>>;
    if (canUseStatelessInput && statelessInput !== undefined) {
      const statelessEndpointProfile = resolveEndpointProfile(statelessInput);
      const statelessAuth = resolveCredentialMaterial(methodId, statelessInput);
      baseUrl = resolveBaseUrlForDiscovery(ctx.endpointProfile, statelessEndpointProfile, this.#baseUrl);
      headers = buildAuthHeaders(statelessAuth);
    } else {
      const credentialRef = normalizeNonEmptyString(ctx.credentialRef);
      if (credentialRef === undefined) {
        throw new AuthError("Cannot discover models without a credential reference.");
      }
      const storedRef = this.#credentialRefs.get(credentialRef);
      if (storedRef === undefined) {
        throw new AuthError("Cannot discover models: credential reference is unavailable.");
      }
      baseUrl = resolveBaseUrlForDiscovery(
        ctx.endpointProfile,
        storedRef.endpointProfile,
        this.#baseUrl,
      );
      headers = buildAuthHeaders(storedRef.auth);
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/models`, {
        method: "GET",
        headers: headers as Record<string, string>,
        signal: AbortSignal.timeout(Math.min(this.#timeoutMs, 30_000)),
      });
    } catch (error) {
      mapNetworkError(error);
    }
    if (!response.ok) {
      await mapHttpError(response);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ProviderUnavailableError("Anthropic model discovery response was not valid JSON.");
    }
    return parseAnthropicModelDescriptors(payload);
  }

  async discoverCapabilities(ctx: CloudConnectionContext): Promise<CapabilityDescriptor> {
    const contextRecord = ctx as Readonly<Record<string, unknown>>;
    const statelessInput = isRecord(contextRecord["connectionInput"])
      ? contextRecord["connectionInput"]
      : undefined;
    const validation = await this.validateCredentialRef({
      providerId: ctx.providerId,
      methodId: ctx.methodId,
      credentialRef: ctx.credentialRef,
      endpointProfile: ctx.endpointProfile,
      correlationId: ctx.correlationId,
    });
    const canUseStatelessInput =
      statelessInput !== undefined &&
      (validation.reason === "credential_ref_not_found" ||
        validation.reason === "credential_ref_missing");
    if (!validation.ok && !canUseStatelessInput) {
      throw new AuthError(
        `Cannot discover capabilities for invalid credential reference: ${validation.reason ?? "invalid_ref"}.`,
      );
    }

    return {
      capabilities: CLAUDE_SUBSCRIPTION_MANIFEST.capabilities,
      providerId: ctx.providerId,
      methodId: ctx.methodId,
    };
  }

  async createSession(options?: Readonly<Record<string, unknown>>): Promise<string> {
    const sessionId = randomUUID();
    const model =
      typeof options?.["model"] === "string" ? options["model"] : this.#defaultModel;
    const methodId = resolveConnectionMethod(options?.["methodId"]);
    const connectionInput = isRecord(options?.["connectionInput"])
      ? options["connectionInput"]
      : undefined;
    const endpointProfile: Readonly<Record<string, unknown>> =
      connectionInput !== undefined ? resolveEndpointProfile(connectionInput) : Object.freeze({});
    const endpointBaseUrl = normalizeNonEmptyString(endpointProfile["baseUrl"]);
    const auth =
      methodId !== undefined && connectionInput !== undefined
        ? resolveCredentialMaterial(methodId, connectionInput)
        : this.#auth;
    if (
      (auth.authType === "api_key" && normalizeNonEmptyString(auth.apiKey) === undefined) ||
      (auth.authType === "oauth2" && normalizeNonEmptyString(auth.accessToken) === undefined)
    ) {
      throw new AuthError(
        "Claude session auth context is unavailable. Re-test provider connection to refresh bridge credential state.",
      );
    }
    this.#sessions.set(sessionId, {
      model,
      messages: [],
      auth,
      baseUrl: endpointBaseUrl ?? this.#baseUrl,
      timeoutMs: this.#timeoutMs,
    });
    return sessionId;
  }

  async sendMessage(sessionId: string, message: string): Promise<string> {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) {
      throw new TransientNetworkError(`Session "${sessionId}" not found.`);
    }
    session.messages.push({ role: "user", content: message });

    const headers = buildAuthHeaders(session.auth);
    let response: Response;
    try {
      response = await fetch(`${session.baseUrl}/v1/messages`, {
        method: "POST",
        headers: headers as Record<string, string>,
        body: JSON.stringify({
          model: session.model,
          max_tokens: 4096,
          messages: session.messages,
        }),
        signal: AbortSignal.timeout(session.timeoutMs),
      });
    } catch (error) {
      if (error instanceof AuthError) throw error;
      mapNetworkError(error);
    }
    if (!response.ok) {
      await mapHttpError(response);
    }
    const data = (await response.json()) as ClaudeMessageResponse;
    const text =
      data.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("") ?? "";
    session.messages.push({ role: "assistant", content: text });
    return text;
  }

  async streamMessage(
    sessionId: string,
    message: string,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) {
      throw new TransientNetworkError(`Session "${sessionId}" not found.`);
    }
    session.messages.push({ role: "user", content: message });

    const headers = buildAuthHeaders(session.auth);
    let response: Response;
    try {
      response = await fetch(`${session.baseUrl}/v1/messages`, {
        method: "POST",
        headers: { ...(headers as Record<string, string>), "anthropic-streaming": "1" },
        body: JSON.stringify({
          model: session.model,
          max_tokens: 4096,
          messages: session.messages,
          stream: true,
        }),
        signal: AbortSignal.timeout(session.timeoutMs),
      });
    } catch (error) {
      if (error instanceof AuthError) throw error;
      mapNetworkError(error);
    }
    if (!response.ok) {
      await mapHttpError(response);
    }
    if (response.body === null) {
      throw new ProviderUnavailableError("Claude API response body is null.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";

    try {
      let streaming = true;
      while (streaming) {
        const { done, value } = await reader.read();
        if (done) { streaming = false; break; }
        const text = decoder.decode(value, { stream: true });
        // Anthropic uses SSE format: "data: {...}\n\n"
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const event = JSON.parse(jsonStr) as ClaudeStreamEvent;
            if (
              event.type === "content_block_delta" &&
              event.delta?.type === "text_delta" &&
              event.delta.text
            ) {
              onChunk(event.delta.text);
              fullContent += event.delta.text;
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    session.messages.push({ role: "assistant", content: fullContent });
  }

  async healthCheck(): Promise<boolean> {
    // Anthropic has no dedicated health endpoint; validate auth by attempting a minimal request.
    try {
      const headers = buildAuthHeaders(this.#auth);
      // HEAD or GET on the API root returns 200 or 404 if the service is up.
      const response = await fetch(`${this.#baseUrl}/v1/models`, {
        method: "GET",
        headers: headers as Record<string, string>,
        signal: AbortSignal.timeout(5_000),
      });
      // 200, 404 (endpoint not found) all indicate the service is reachable.
      return response.status < 500;
    } catch {
      return false;
    }
  }

  async shutdown(): Promise<void> {
    this.#sessions.clear();
    this.#credentialRefs.clear();
  }
}
