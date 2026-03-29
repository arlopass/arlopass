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
  ProviderUnavailableError,
  TimeoutError,
  TransientNetworkError,
} from "@arlopass/protocol";

export const GEMINI_CONNECTION_METHOD_IDS = {
  API_KEY: "gemini.api_key",
  OAUTH_ACCESS_TOKEN: "gemini.oauth_access_token",
} as const;

export type GeminiConnectionMethodId =
  (typeof GEMINI_CONNECTION_METHOD_IDS)[keyof typeof GEMINI_CONNECTION_METHOD_IDS];

export const GEMINI_CONNECTION_METHODS: readonly ConnectionMethodDescriptor[] = [
  {
    id: GEMINI_CONNECTION_METHOD_IDS.API_KEY,
    authFlow: "api-key",
    displayName: "Gemini API (API Key)",
    requiredFields: ["apiKey"],
    optionalFields: ["baseUrl", "projectId"],
  },
  {
    id: GEMINI_CONNECTION_METHOD_IDS.OAUTH_ACCESS_TOKEN,
    authFlow: "oauth-access-token",
    displayName: "Gemini API (OAuth Access Token)",
    requiredFields: ["accessToken"],
    optionalFields: ["baseUrl", "projectId"],
  },
] as const;

const GEMINI_CAPABILITIES = [
  "chat.completions",
  "chat.stream",
  "provider.list",
  "session.create",
] as unknown as readonly ProtocolCapability[];

export const GEMINI_MANIFEST: AdapterManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  providerId: "gemini",
  version: "0.1.0",
  displayName: "Gemini",
  authType: "oauth2",
  capabilities: GEMINI_CAPABILITIES,
  connectionMethods: GEMINI_CONNECTION_METHODS,
  requiredPermissions: ["network.egress"],
  egressRules: [{ host: "generativelanguage.googleapis.com", protocol: "https" }],
  riskLevel: "medium",
  signingKeyId: "arlopass-first-party-v1",
};

const GEMINI_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";
const GEMINI_DEFAULT_TIMEOUT_MS = 60_000;
const GEMINI_MODEL_IDS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

const GEMINI_MODEL_DESCRIPTORS: readonly ModelDescriptor[] = GEMINI_MODEL_IDS.map((id) =>
  Object.freeze({
    id,
    displayName: id,
  }),
);

type GeminiAuthType = "api_key" | "oauth_access_token";

type GeminiAuthConfig = Readonly<{
  authType: GeminiAuthType;
  apiKey?: string;
  accessToken?: string;
}>;

type GeminiSession = {
  model: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  auth: GeminiAuthConfig;
  baseUrl: string;
  timeoutMs: number;
};

type StoredCredentialRef = Readonly<{
  providerId: string;
  methodId: GeminiConnectionMethodId;
  endpointProfile: Readonly<Record<string, unknown>>;
  credentialDigest: string;
  auth: GeminiAuthConfig;
}>;

type GeminiContentPart = { text?: string };
type GeminiContent = { role: string; parts: GeminiContentPart[] };
type GeminiCandidate = { content?: { parts?: GeminiContentPart[] } };
type GeminiGenerateResponse = { candidates?: GeminiCandidate[] };
type GeminiErrorBody = { error?: { message?: string; status?: string } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildGeminiUrl(
  baseUrl: string,
  model: string,
  action: "generateContent" | "streamGenerateContent",
): string {
  const url = `${baseUrl}/v1beta/models/${model}:${action}`;
  return action === "streamGenerateContent" ? `${url}?alt=sse` : url;
}

function buildGeminiHeaders(auth: GeminiAuthConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (auth.authType === "api_key" && auth.apiKey) {
    headers["x-goog-api-key"] = auth.apiKey;
  } else if (auth.authType === "oauth_access_token" && auth.accessToken) {
    headers["Authorization"] = `Bearer ${auth.accessToken}`;
  }
  return headers;
}

function toGeminiContents(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): GeminiContent[] {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

function mapNetworkError(error: unknown): never {
  const err = error instanceof Error ? error : new Error(String(error));
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET") {
    throw new ProviderUnavailableError(`Gemini API is not reachable: ${err.message}`, {
      cause: err,
    });
  }
  if (code === "ETIMEDOUT") {
    throw new TimeoutError(`Gemini API request timed out: ${err.message}`, { cause: err });
  }
  throw new TransientNetworkError(`Gemini API network error: ${err.message}`, { cause: err });
}

async function mapHttpError(response: Response): Promise<never> {
  let errorBody: GeminiErrorBody = {};
  try {
    errorBody = (await response.json()) as GeminiErrorBody;
  } catch {
    // ignore parse errors
  }
  const message = errorBody.error?.message ?? response.statusText;

  if (response.status === 401 || response.status === 403) {
    throw new AuthError(`Gemini API authentication failed: ${message}`);
  }
  if (response.status === 429) {
    throw new TransientNetworkError(`Gemini API rate limit exceeded: ${message}`);
  }
  if (response.status >= 500) {
    throw new ProviderUnavailableError(
      `Gemini API server error ${response.status}: ${message}`,
    );
  }
  throw new TransientNetworkError(
    `Gemini API request failed with HTTP ${response.status}: ${message}`,
  );
}

function resolveGeminiAuth(
  methodId: GeminiConnectionMethodId,
  input: Readonly<Record<string, unknown>>,
): GeminiAuthConfig {
  if (methodId === GEMINI_CONNECTION_METHOD_IDS.API_KEY) {
    const apiKey = normalizeNonEmptyString(input["apiKey"]);
    if (apiKey === undefined) {
      throw new AuthError('Connection method "gemini.api_key" requires input.apiKey.');
    }
    return { authType: "api_key", apiKey };
  }
  const accessToken = normalizeNonEmptyString(input["accessToken"]);
  if (accessToken === undefined) {
    throw new AuthError(
      'Connection method "gemini.oauth_access_token" requires input.accessToken.',
    );
  }
  return { authType: "oauth_access_token", accessToken };
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

function resolveMethodId(methodId: unknown): GeminiConnectionMethodId | undefined {
  const normalized = normalizeNonEmptyString(methodId);
  if (normalized === GEMINI_CONNECTION_METHOD_IDS.API_KEY) return normalized;
  if (normalized === GEMINI_CONNECTION_METHOD_IDS.OAUTH_ACCESS_TOKEN) return normalized;
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
    normalizeNonEmptyString(input["baseUrl"]) ?? GEMINI_DEFAULT_BASE_URL,
  );
  const projectId = normalizeNonEmptyString(input["projectId"]);
  return Object.freeze({
    baseUrl,
    ...(projectId !== undefined ? { projectId } : {}),
  });
}

function resolveCredentialDigest(
  methodId: GeminiConnectionMethodId,
  input: Readonly<Record<string, unknown>>,
): string {
  if (methodId === GEMINI_CONNECTION_METHOD_IDS.API_KEY) {
    const apiKey = requireInputString(input, "apiKey");
    return canonicalizeJsonValue({
      method: methodId,
      apiKeyLength: apiKey.length,
    });
  }

  const accessToken = requireInputString(input, "accessToken");
  return canonicalizeJsonValue({
    method: methodId,
    accessTokenLength: accessToken.length,
  });
}

function parseGeminiModelList(payload: unknown): readonly ModelDescriptor[] {
  if (!isRecord(payload) || !Array.isArray(payload["models"])) {
    return GEMINI_MODEL_DESCRIPTORS;
  }
  const models: ModelDescriptor[] = [];
  for (const entry of payload["models"]) {
    if (!isRecord(entry)) continue;
    const rawName = typeof entry["name"] === "string" ? entry["name"].trim() : undefined;
    if (rawName === undefined || rawName.length === 0) continue;
    // Gemini returns "models/gemini-2.5-flash" — strip the "models/" prefix
    const id = rawName.startsWith("models/") ? rawName.slice(7) : rawName;
    const displayName =
      typeof entry["displayName"] === "string" && entry["displayName"].trim().length > 0
        ? entry["displayName"].trim()
        : id;
    // Only include generative models that support generateContent
    const methods = Array.isArray(entry["supportedGenerationMethods"])
      ? (entry["supportedGenerationMethods"] as unknown[])
      : [];
    if (methods.includes("generateContent") || methods.includes("streamGenerateContent")) {
      models.push(Object.freeze({ id, displayName }));
    }
  }
  return models.length > 0 ? models : GEMINI_MODEL_DESCRIPTORS;
}

export class GeminiAdapter implements CloudAdapterContractV2 {
  readonly manifest: AdapterManifest = GEMINI_MANIFEST;
  readonly requiredEndpointProfileFields = ["baseUrl"] as const;

  readonly #sessions = new Map<string, GeminiSession>();
  readonly #credentialRefs = new Map<string, StoredCredentialRef>();
  #sessionCounter = 0;
  #credentialCounter = 0;

  describeCapabilities(): readonly ProtocolCapability[] {
    return GEMINI_MANIFEST.capabilities;
  }

  async listModels(): Promise<readonly string[]> {
    return GEMINI_MODEL_IDS;
  }

  listConnectionMethods(): readonly ConnectionMethodDescriptor[] {
    return GEMINI_CONNECTION_METHODS;
  }

  async beginConnect(input: BeginConnectInput): Promise<BeginConnectResult> {
    const providerId = assertProviderId(input.providerId, this.manifest.providerId);
    const methodId = resolveMethodId(input.methodId);
    if (methodId === undefined) {
      throw new AuthError(`Unsupported connection method "${String(input.methodId)}".`);
    }

    if (methodId === GEMINI_CONNECTION_METHOD_IDS.API_KEY) {
      return {
        providerId,
        methodId,
        requiredFields: ["apiKey"],
        optionalFields: ["baseUrl", "projectId"],
      };
    }
    return {
      providerId,
      methodId,
      requiredFields: ["accessToken"],
      optionalFields: ["baseUrl", "projectId"],
    };
  }

  async completeConnect(input: CompleteConnectInput): Promise<CompleteConnectResult> {
    const providerId = assertProviderId(input.providerId, this.manifest.providerId);
    const methodId = resolveMethodId(input.methodId);
    if (methodId === undefined) {
      throw new AuthError(`Unsupported connection method "${String(input.methodId)}".`);
    }

    const payload = requireInputRecord(input.input);
    const endpointProfile = resolveEndpointProfile(payload);
    const credentialDigest = resolveCredentialDigest(methodId, payload);
    const auth = resolveGeminiAuth(methodId, payload);
    const credentialRef = `credref.${providerId}.${methodId}.${++this.#credentialCounter}`;
    this.#credentialRefs.set(credentialRef, {
      providerId,
      methodId,
      endpointProfile,
      credentialDigest,
      auth,
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

    let auth: GeminiAuthConfig;
    let baseUrl: string;
    if (canUseStatelessInput && statelessInput !== undefined) {
      const methodId = resolveMethodId(ctx.methodId);
      if (methodId === undefined) {
        throw new AuthError(`Unsupported connection method "${String(ctx.methodId)}".`);
      }
      auth = resolveGeminiAuth(methodId, statelessInput);
      baseUrl =
        normalizeNonEmptyString(ctx.endpointProfile["baseUrl"]) ??
        normalizeNonEmptyString(statelessInput["baseUrl"]) ??
        GEMINI_DEFAULT_BASE_URL;
    } else {
      const credentialRef = normalizeNonEmptyString(ctx.credentialRef);
      if (credentialRef === undefined) {
        throw new AuthError("Cannot discover models without a credential reference.");
      }
      const storedRef = this.#credentialRefs.get(credentialRef);
      if (storedRef === undefined) {
        throw new AuthError("Cannot discover models: credential reference is unavailable.");
      }
      auth = storedRef.auth;
      baseUrl =
        normalizeNonEmptyString(ctx.endpointProfile["baseUrl"]) ??
        (normalizeNonEmptyString(storedRef.endpointProfile["baseUrl"]) as string) ??
        GEMINI_DEFAULT_BASE_URL;
    }

    const headers = buildGeminiHeaders(auth);
    try {
      const response = await fetch(`${baseUrl}/v1beta/models`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        return GEMINI_MODEL_DESCRIPTORS;
      }
      const payload: unknown = await response.json();
      return parseGeminiModelList(payload);
    } catch {
      return GEMINI_MODEL_DESCRIPTORS;
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
      capabilities: GEMINI_MANIFEST.capabilities,
      providerId: ctx.providerId,
      methodId: ctx.methodId,
    };
  }

  async createSession(options?: Readonly<Record<string, unknown>>): Promise<string> {
    const requestedModel = normalizeNonEmptyString(options?.["model"]);
    const model = requestedModel ?? GEMINI_DEFAULT_MODEL;
    const sessionId = `gemini-session-${++this.#sessionCounter}`;

    const methodId = resolveMethodId(options?.["methodId"]);
    const connectionInput = isRecord(options?.["connectionInput"])
      ? options["connectionInput"]
      : undefined;
    const credentialRefKey = normalizeNonEmptyString(options?.["credentialRef"]);

    let auth: GeminiAuthConfig;
    let baseUrl: string = GEMINI_DEFAULT_BASE_URL;

    if (connectionInput !== undefined && methodId !== undefined) {
      auth = resolveGeminiAuth(methodId, connectionInput);
      const rawBaseUrl = normalizeNonEmptyString(connectionInput["baseUrl"]);
      baseUrl = rawBaseUrl !== undefined ? normalizeBaseUrl(rawBaseUrl) : GEMINI_DEFAULT_BASE_URL;
    } else if (credentialRefKey !== undefined) {
      const storedRef = this.#credentialRefs.get(credentialRefKey);
      if (storedRef === undefined) {
        throw new AuthError("Cannot create session: credential reference not found.");
      }
      auth = storedRef.auth;
      baseUrl =
        (normalizeNonEmptyString(storedRef.endpointProfile["baseUrl"]) as string) ??
        GEMINI_DEFAULT_BASE_URL;
    } else {
      throw new AuthError(
        "Cannot create session: no credentials provided (supply connectionInput or credentialRef).",
      );
    }

    this.#sessions.set(sessionId, {
      model,
      messages: [],
      auth,
      baseUrl,
      timeoutMs: GEMINI_DEFAULT_TIMEOUT_MS,
    });
    return sessionId;
  }

  async sendMessage(sessionId: string, message: string): Promise<string> {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) {
      throw new TransientNetworkError(`Session "${sessionId}" not found.`);
    }

    session.messages.push({ role: "user", content: message });

    const url = buildGeminiUrl(session.baseUrl, session.model, "generateContent");
    const headers = buildGeminiHeaders(session.auth);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          contents: toGeminiContents(session.messages),
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

    const data = (await response.json()) as GeminiGenerateResponse;
    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
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

    const url = buildGeminiUrl(
      session.baseUrl,
      session.model,
      "streamGenerateContent",
    );
    const headers = buildGeminiHeaders(session.auth);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          contents: toGeminiContents(session.messages),
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
      throw new ProviderUnavailableError("Gemini API response body is null.");
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
          if (jsonStr === "[DONE]" || jsonStr.length === 0) continue;
          try {
            const event = JSON.parse(jsonStr) as GeminiGenerateResponse;
            const parts = event.candidates?.[0]?.content?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.text) {
                  onChunk(part.text);
                  fullContent += part.text;
                }
              }
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

