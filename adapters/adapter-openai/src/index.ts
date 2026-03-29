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
  MANIFEST_SCHEMA_VERSION,
  type ModelDescriptor,
  type RevokeCredentialRefInput,
  type ValidateCredentialRefInput,
  type ValidationResult,
} from "@arlopass/adapter-runtime";
import {
  type ProtocolCapability,
  AuthError,
  PermissionError,
  ProviderUnavailableError,
  TimeoutError,
  TransientNetworkError,
} from "@arlopass/protocol";

export const OPENAI_CONNECTION_METHOD_IDS = {
  API_KEY: "openai.api_key",
} as const;

export type OpenAiConnectionMethodId =
  (typeof OPENAI_CONNECTION_METHOD_IDS)[keyof typeof OPENAI_CONNECTION_METHOD_IDS];

export const OPENAI_CONNECTION_METHODS: readonly ConnectionMethodDescriptor[] = [
  {
    id: OPENAI_CONNECTION_METHOD_IDS.API_KEY,
    authFlow: "api-key",
    displayName: "OpenAI (API Key)",
    requiredFields: ["apiKey"],
    optionalFields: ["baseUrl", "organization", "project"],
  },
] as const;

const OPENAI_CAPABILITIES = [
  "chat.completions",
  "chat.stream",
  "provider.list",
  "session.create",
] as unknown as readonly ProtocolCapability[];

export const OPENAI_MANIFEST: AdapterManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  providerId: "openai",
  version: "0.1.0",
  displayName: "OpenAI",
  authType: "api_key",
  capabilities: OPENAI_CAPABILITIES,
  connectionMethods: OPENAI_CONNECTION_METHODS,
  requiredPermissions: ["network.egress"],
  egressRules: [{ host: "api.openai.com", protocol: "https" }],
  riskLevel: "medium",
  signingKeyId: "arlopass-first-party-v1",
};

const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const OPENAI_DEFAULT_MODEL = "gpt-5.3-codex";
const OPENAI_DEFAULT_TIMEOUT_MS = 60_000;
const OPENAI_MODEL_IDS = [
  "gpt-5.3-codex",
  "gpt-5.2",
  "gpt-5-mini",
  "gpt-4.1",
  "o4-mini",
] as const;

const OPENAI_MODEL_DESCRIPTORS: readonly ModelDescriptor[] = OPENAI_MODEL_IDS.map((id) =>
  Object.freeze({
    id,
    displayName: id,
  }),
);

type OpenAiSession = {
  model: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  organization?: string;
  project?: string;
};

type StoredCredentialRef = Readonly<{
  providerId: string;
  methodId: OpenAiConnectionMethodId;
  endpointProfile: Readonly<Record<string, unknown>>;
  credentialDigest: string;
  apiKey: string;
}>;

type OpenAiChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

type OpenAiStreamDelta = {
  choices?: Array<{ delta?: { content?: string } }>;
};

type OpenAiErrorBody = {
  error?: { message?: string };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildOpenAiHeaders(
  apiKey: string,
  organization?: string,
  project?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (organization) headers["OpenAI-Organization"] = organization;
  if (project) headers["OpenAI-Project"] = project;
  return headers;
}

function mapNetworkError(error: unknown): never {
  const err = error instanceof Error ? error : new Error(String(error));
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET") {
    throw new ProviderUnavailableError(`OpenAI API is not reachable: ${err.message}`, {
      cause: err,
    });
  }
  if (code === "ETIMEDOUT") {
    throw new TimeoutError(`OpenAI API request timed out: ${err.message}`, { cause: err });
  }
  throw new TransientNetworkError(`OpenAI API network error: ${err.message}`, { cause: err });
}

async function mapHttpError(response: Response): Promise<never> {
  let errorBody: OpenAiErrorBody = {};
  try {
    errorBody = (await response.json()) as OpenAiErrorBody;
  } catch {
    // ignore parse errors
  }
  const message = errorBody.error?.message ?? response.statusText;

  if (response.status === 401) {
    throw new AuthError(`OpenAI API authentication failed: ${message}`);
  }
  if (response.status === 403) {
    throw new PermissionError(`OpenAI API permission denied: ${message}`);
  }
  if (response.status === 429) {
    throw new TransientNetworkError(`OpenAI API rate limit exceeded: ${message}`);
  }
  if (response.status >= 500) {
    throw new ProviderUnavailableError(
      `OpenAI API server error ${response.status}: ${message}`,
    );
  }
  throw new TransientNetworkError(
    `OpenAI API request failed with HTTP ${response.status}: ${message}`,
  );
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function canonicalizeJsonValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return "null";
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    return Number.isFinite(value) ? JSON.stringify(value) : "null";
  }
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

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new AuthError("completeConnect input.baseUrl must not be empty.");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new AuthError("completeConnect input.baseUrl must be a valid URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new AuthError("completeConnect input.baseUrl must use HTTPS.");
  }
  return parsed.toString().replace(/\/$/, "");
}

function resolveMethodId(methodId: unknown): OpenAiConnectionMethodId | undefined {
  const normalized = normalizeNonEmptyString(methodId);
  if (normalized === OPENAI_CONNECTION_METHOD_IDS.API_KEY) return normalized;
  return undefined;
}

function assertProviderId(providerId: unknown, expected: string): string {
  const normalized = normalizeNonEmptyString(providerId);
  if (normalized === undefined || normalized !== expected) {
    throw new AuthError(`Unsupported providerId "${String(providerId)}" for ${expected}.`);
  }
  return normalized;
}

function requireInputRecord(input: CompleteConnectInput["input"]): Readonly<Record<string, unknown>> {
  if (!isRecord(input)) {
    throw new AuthError("completeConnect input must be an object.");
  }
  return input;
}

function requireInputString(input: Readonly<Record<string, unknown>>, field: string): string {
  const value = normalizeNonEmptyString(input[field]);
  if (value === undefined) {
    throw new AuthError(`completeConnect input.${field} is required.`);
  }
  return value;
}

function resolveEndpointProfile(
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const baseUrl = normalizeBaseUrl(
    normalizeNonEmptyString(input["baseUrl"]) ?? OPENAI_DEFAULT_BASE_URL,
  );
  const organization = normalizeNonEmptyString(input["organization"]);
  const project = normalizeNonEmptyString(input["project"]);
  return Object.freeze({
    baseUrl,
    ...(organization !== undefined ? { organization } : {}),
    ...(project !== undefined ? { project } : {}),
  });
}

function resolveCredentialDigest(input: Readonly<Record<string, unknown>>): string {
  const apiKey = requireInputString(input, "apiKey");
  return canonicalizeJsonValue({
    method: OPENAI_CONNECTION_METHOD_IDS.API_KEY,
    apiKeyLength: apiKey.length,
  });
}

function parseOpenAiModelList(payload: unknown): readonly ModelDescriptor[] {
  if (!isRecord(payload) || !Array.isArray(payload["data"])) {
    return OPENAI_MODEL_DESCRIPTORS;
  }
  const models: ModelDescriptor[] = [];
  for (const entry of payload["data"]) {
    if (!isRecord(entry)) continue;
    const id = typeof entry["id"] === "string" ? entry["id"].trim() : undefined;
    if (id === undefined || id.length === 0) continue;
    models.push(Object.freeze({ id, displayName: id }));
  }
  return models.length > 0 ? models : OPENAI_MODEL_DESCRIPTORS;
}

export class OpenAiAdapter implements CloudAdapterContractV2 {
  readonly manifest: AdapterManifest = OPENAI_MANIFEST;
  readonly requiredEndpointProfileFields = ["baseUrl"] as const;

  readonly #sessions = new Map<string, OpenAiSession>();
  readonly #credentialRefs = new Map<string, StoredCredentialRef>();
  #sessionCounter = 0;
  #credentialCounter = 0;

  describeCapabilities(): readonly ProtocolCapability[] {
    return OPENAI_MANIFEST.capabilities;
  }

  async listModels(): Promise<readonly string[]> {
    return OPENAI_MODEL_IDS;
  }

  listConnectionMethods(): readonly ConnectionMethodDescriptor[] {
    return OPENAI_CONNECTION_METHODS;
  }

  async beginConnect(input: BeginConnectInput): Promise<BeginConnectResult> {
    const providerId = assertProviderId(input.providerId, this.manifest.providerId);
    const methodId = resolveMethodId(input.methodId);
    if (methodId === undefined) {
      throw new AuthError(`Unsupported connection method "${String(input.methodId)}".`);
    }

    return {
      providerId,
      methodId,
      requiredFields: ["apiKey"],
      optionalFields: ["baseUrl", "organization", "project"],
    };
  }

  async completeConnect(input: CompleteConnectInput): Promise<CompleteConnectResult> {
    const providerId = assertProviderId(input.providerId, this.manifest.providerId);
    const methodId = resolveMethodId(input.methodId);
    if (methodId === undefined) {
      throw new AuthError(`Unsupported connection method "${String(input.methodId)}".`);
    }

    const payload = requireInputRecord(input.input);
    const apiKey = requireInputString(payload, "apiKey");
    const endpointProfile = resolveEndpointProfile(payload);
    const credentialDigest = resolveCredentialDigest(payload);
    const credentialRef = `credref.${providerId}.${methodId}.${++this.#credentialCounter}`;
    this.#credentialRefs.set(credentialRef, {
      providerId,
      methodId,
      endpointProfile,
      credentialDigest,
      apiKey,
    });

    return {
      providerId,
      methodId,
      credentialRef,
      endpointProfile,
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

    const methodId = resolveMethodId(input.methodId);
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
    if (storedRef.credentialDigest.length === 0) {
      return { ok: false, retryable: false, reason: "credential_material_missing" };
    }

    if (
      input.endpointProfile !== undefined &&
      canonicalizeJsonValue(input.endpointProfile) !== canonicalizeJsonValue(storedRef.endpointProfile)
    ) {
      return { ok: false, retryable: false, reason: "endpoint_profile_mismatch" };
    }

    return { ok: true };
  }

  async revokeCredentialRef(input: RevokeCredentialRefInput): Promise<void> {
    const providerId = normalizeNonEmptyString(input.providerId);
    const methodId = resolveMethodId(input.methodId);
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

    let apiKey: string;
    let baseUrl: string;
    let organization: string | undefined;
    let project: string | undefined;
    if (canUseStatelessInput && statelessInput !== undefined) {
      apiKey = requireInputString(statelessInput, "apiKey");
      baseUrl =
        normalizeNonEmptyString(ctx.endpointProfile["baseUrl"]) ??
        normalizeNonEmptyString(statelessInput["baseUrl"]) ??
        OPENAI_DEFAULT_BASE_URL;
      organization = normalizeNonEmptyString(statelessInput["organization"]);
      project = normalizeNonEmptyString(statelessInput["project"]);
    } else {
      const credentialRef = normalizeNonEmptyString(ctx.credentialRef);
      if (credentialRef === undefined) {
        throw new AuthError("Cannot discover models without a credential reference.");
      }
      const storedRef = this.#credentialRefs.get(credentialRef);
      if (storedRef === undefined) {
        throw new AuthError("Cannot discover models: credential reference is unavailable.");
      }
      apiKey = storedRef.apiKey;
      baseUrl =
        normalizeNonEmptyString(ctx.endpointProfile["baseUrl"]) ??
        (normalizeNonEmptyString(storedRef.endpointProfile["baseUrl"]) as string) ??
        OPENAI_DEFAULT_BASE_URL;
      organization = normalizeNonEmptyString(storedRef.endpointProfile["organization"]);
      project = normalizeNonEmptyString(storedRef.endpointProfile["project"]);
    }

    const headers = buildOpenAiHeaders(apiKey, organization, project);
    try {
      const response = await fetch(`${baseUrl}/models`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        return OPENAI_MODEL_DESCRIPTORS;
      }
      const payload: unknown = await response.json();
      return parseOpenAiModelList(payload);
    } catch {
      return OPENAI_MODEL_DESCRIPTORS;
    }
  }

  async discoverCapabilities(ctx: CloudConnectionContext): Promise<CapabilityDescriptor> {
    const validation = await this.validateCredentialRef({
      providerId: ctx.providerId,
      methodId: ctx.methodId,
      credentialRef: ctx.credentialRef,
      endpointProfile: ctx.endpointProfile,
      correlationId: ctx.correlationId,
    });
    if (!validation.ok) {
      throw new AuthError(
        `Cannot discover capabilities for invalid credential reference: ${validation.reason ?? "invalid_ref"}.`,
      );
    }

    return {
      capabilities: OPENAI_MANIFEST.capabilities,
      providerId: ctx.providerId,
      methodId: ctx.methodId,
    };
  }

  async createSession(options?: Readonly<Record<string, unknown>>): Promise<string> {
    const requestedModel = normalizeNonEmptyString(options?.["model"]);
    const model = requestedModel ?? OPENAI_DEFAULT_MODEL;
    const sessionId = `openai-session-${++this.#sessionCounter}`;

    const connectionInput = isRecord(options?.["connectionInput"])
      ? options["connectionInput"]
      : undefined;
    const credentialRefKey = normalizeNonEmptyString(options?.["credentialRef"]);

    let apiKey: string;
    let baseUrl: string = OPENAI_DEFAULT_BASE_URL;
    let organization: string | undefined;
    let project: string | undefined;

    if (connectionInput !== undefined) {
      apiKey = requireInputString(connectionInput, "apiKey");
      const rawBaseUrl = normalizeNonEmptyString(connectionInput["baseUrl"]);
      baseUrl = rawBaseUrl !== undefined ? normalizeBaseUrl(rawBaseUrl) : OPENAI_DEFAULT_BASE_URL;
      organization = normalizeNonEmptyString(connectionInput["organization"]);
      project = normalizeNonEmptyString(connectionInput["project"]);
    } else if (credentialRefKey !== undefined) {
      const storedRef = this.#credentialRefs.get(credentialRefKey);
      if (storedRef === undefined) {
        throw new AuthError("Cannot create session: credential reference not found.");
      }
      apiKey = storedRef.apiKey;
      baseUrl =
        (normalizeNonEmptyString(storedRef.endpointProfile["baseUrl"]) as string) ??
        OPENAI_DEFAULT_BASE_URL;
      organization = normalizeNonEmptyString(storedRef.endpointProfile["organization"]);
      project = normalizeNonEmptyString(storedRef.endpointProfile["project"]);
    } else {
      throw new AuthError(
        "Cannot create session: no credentials provided (supply connectionInput or credentialRef).",
      );
    }

    this.#sessions.set(sessionId, {
      model,
      messages: [],
      apiKey,
      baseUrl,
      timeoutMs: OPENAI_DEFAULT_TIMEOUT_MS,
      ...(organization !== undefined ? { organization } : {}),
      ...(project !== undefined ? { project } : {}),
    });
    return sessionId;
  }

  async sendMessage(sessionId: string, message: string): Promise<string> {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) {
      throw new TransientNetworkError(`Session "${sessionId}" not found.`);
    }

    session.messages.push({ role: "user", content: message });

    const headers = buildOpenAiHeaders(session.apiKey, session.organization, session.project);
    let response: Response;
    try {
      response = await fetch(`${session.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: session.model,
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

    const data = (await response.json()) as OpenAiChatResponse;
    const text = data.choices?.[0]?.message?.content ?? "";
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

    const headers = buildOpenAiHeaders(session.apiKey, session.organization, session.project);
    let response: Response;
    try {
      response = await fetch(`${session.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: session.model,
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
      throw new ProviderUnavailableError("OpenAI API response body is null.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";

    try {
      let streaming = true;
      while (streaming) {
        const { done, value } = await reader.read();
        if (done) {
          streaming = false;
          break;
        }
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const event = JSON.parse(jsonStr) as OpenAiStreamDelta;
            const content = event.choices?.[0]?.delta?.content;
            if (content) {
              onChunk(content);
              fullContent += content;
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
    return true;
  }

  async shutdown(): Promise<void> {
    this.#sessions.clear();
    this.#credentialRefs.clear();
    this.#sessionCounter = 0;
    this.#credentialCounter = 0;
  }
}

