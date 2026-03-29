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
import { type ProtocolCapability, AuthError, PermissionError, ProviderUnavailableError, TimeoutError, TransientNetworkError } from "@arlopass/protocol";

export const VERTEX_CONNECTION_METHOD_IDS = {
  API_KEY: "vertex.api_key",
  SERVICE_ACCOUNT: "vertex.service_account",
  WORKLOAD_IDENTITY_FEDERATION: "vertex.workload_identity_federation",
} as const;

export type VertexConnectionMethodId =
  (typeof VERTEX_CONNECTION_METHOD_IDS)[keyof typeof VERTEX_CONNECTION_METHOD_IDS];

export const VERTEX_CONNECTION_METHODS: readonly ConnectionMethodDescriptor[] = [
  {
    id: VERTEX_CONNECTION_METHOD_IDS.API_KEY,
    authFlow: "api-key",
    displayName: "Vertex AI (API Key)",
    requiredFields: ["apiKey"],
    optionalFields: ["projectId", "location", "publisher", "defaultModel"],
    metadata: {
      intendedUse: "testing-or-express-mode",
    },
  },
  {
    id: VERTEX_CONNECTION_METHOD_IDS.SERVICE_ACCOUNT,
    authFlow: "oauth2-service-account",
    displayName: "Vertex AI (Service Account JSON)",
    requiredFields: ["projectId", "location", "serviceAccountJson"],
    optionalFields: ["publisher", "defaultModel"],
  },
  {
    id: VERTEX_CONNECTION_METHOD_IDS.WORKLOAD_IDENTITY_FEDERATION,
    authFlow: "oauth2-workload-identity-federation",
    displayName: "Vertex AI (Workload Identity Federation)",
    requiredFields: ["projectId", "location", "audience", "subjectTokenType"],
    optionalFields: ["serviceAccountImpersonationEmail", "defaultModel"],
    metadata: {
      singleHopAssumption: "true",
    },
  },
] as const;

const VERTEX_CAPABILITIES = [
  "chat.completions",
  "chat.stream",
  "provider.list",
  "session.create",
] as unknown as readonly ProtocolCapability[];

export const GOOGLE_VERTEX_AI_MANIFEST: AdapterManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  providerId: "google-vertex-ai",
  version: "0.1.0",
  displayName: "Google Vertex AI",
  authType: "oauth2",
  capabilities: VERTEX_CAPABILITIES,
  connectionMethods: VERTEX_CONNECTION_METHODS,
  requiredPermissions: ["network.egress"],
  egressRules: [
    { host: "oauth2.googleapis.com", protocol: "https" },
    { host: "iamcredentials.googleapis.com", protocol: "https" },
    { host: "aiplatform.googleapis.com", protocol: "https" },
  ],
  riskLevel: "medium",
  signingKeyId: "arlopass-first-party-v1",
};

const VERTEX_DEFAULT_MODEL = "gemini-2.5-flash";
const VERTEX_DEFAULT_PROJECT_ID = "express-mode";
const VERTEX_DEFAULT_LOCATION = "global";

const VERTEX_DEFAULT_TIMEOUT_MS = 60_000;

const VERTEX_MODEL_DESCRIPTORS: readonly ModelDescriptor[] = [
  Object.freeze({ id: "gemini-2.5-flash-lite", displayName: "Gemini 2.5 Flash Lite" }),
  Object.freeze({ id: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash" }),
  Object.freeze({ id: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro" }),
  Object.freeze({ id: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash" }),
  Object.freeze({ id: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro" }),
  Object.freeze({ id: "gemini-1.5-flash", displayName: "Gemini 1.5 Flash" }),
];

type VertexAuthConfig = Readonly<{
  methodId: VertexConnectionMethodId;
  apiKey?: string;
  serviceAccountJson?: string;
}>;

type VertexSession = {
  model: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  auth: VertexAuthConfig;
  projectId: string;
  location: string;
  publisher: string;
  timeoutMs: number;
};

type StoredCredentialRef = Readonly<{
  providerId: string;
  methodId: VertexConnectionMethodId;
  endpointProfile: Readonly<Record<string, unknown>>;
  credentialDigest: string;
  auth: VertexAuthConfig;
}>;

type VertexContentPart = { text?: string };
type VertexContent = { role: string; parts: VertexContentPart[] };
type VertexCandidate = { content?: { parts?: VertexContentPart[] } };
type VertexGenerateResponse = { candidates?: VertexCandidate[] };
type VertexErrorBody = { error?: { message?: string; status?: string } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function resolveMethodId(methodId: unknown): VertexConnectionMethodId | undefined {
  const normalized = normalizeNonEmptyString(methodId);
  if (normalized === undefined) return undefined;
  if (normalized === VERTEX_CONNECTION_METHOD_IDS.API_KEY) return normalized;
  if (normalized === VERTEX_CONNECTION_METHOD_IDS.SERVICE_ACCOUNT) return normalized;
  if (normalized === VERTEX_CONNECTION_METHOD_IDS.WORKLOAD_IDENTITY_FEDERATION) return normalized;
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
  methodId: VertexConnectionMethodId,
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const projectId =
    methodId === VERTEX_CONNECTION_METHOD_IDS.API_KEY
      ? normalizeNonEmptyString(input["projectId"]) ?? VERTEX_DEFAULT_PROJECT_ID
      : requireInputString(input, "projectId");
  const location =
    methodId === VERTEX_CONNECTION_METHOD_IDS.API_KEY
      ? normalizeNonEmptyString(input["location"]) ?? VERTEX_DEFAULT_LOCATION
      : requireInputString(input, "location");
  const publisher = normalizeNonEmptyString(input["publisher"]) ?? "google";
  const defaultModel = normalizeNonEmptyString(input["defaultModel"]) ?? VERTEX_DEFAULT_MODEL;
  return Object.freeze({
    projectId,
    location,
    publisher,
    defaultModel,
  });
}

function resolveCredentialDigest(
  methodId: VertexConnectionMethodId,
  input: Readonly<Record<string, unknown>>,
): string {
  if (methodId === VERTEX_CONNECTION_METHOD_IDS.API_KEY) {
    const apiKey = requireInputString(input, "apiKey");
    return canonicalizeJsonValue({
      method: methodId,
      apiKeyLength: apiKey.length,
    });
  }

  if (methodId === VERTEX_CONNECTION_METHOD_IDS.SERVICE_ACCOUNT) {
    const serviceAccountJson = requireInputString(input, "serviceAccountJson");
    return canonicalizeJsonValue({
      method: methodId,
      serviceAccountJsonLength: serviceAccountJson.length,
    });
  }

  const audience = requireInputString(input, "audience");
  const subjectTokenType = requireInputString(input, "subjectTokenType");
  return canonicalizeJsonValue({
    method: methodId,
    audience,
    subjectTokenType,
  });
}

function buildVertexUrl(
  auth: VertexAuthConfig,
  projectId: string,
  location: string,
  publisher: string,
  model: string,
  action: "generateContent" | "streamGenerateContent",
): string {
  if (auth.methodId === VERTEX_CONNECTION_METHOD_IDS.API_KEY && auth.apiKey) {
    // Express mode: global endpoint with API key in query string
    const base = `https://aiplatform.googleapis.com/v1/publishers/${publisher}/models/${model}:${action}`;
    return `${base}?key=${encodeURIComponent(auth.apiKey)}`;
  }
  // Project-scoped endpoint for service account / WIF
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/${publisher}/models/${model}:${action}`;
}

function buildVertexHeaders(auth: VertexAuthConfig): Record<string, string> {
  // API key auth passes the key in the URL query string, not a header
  return { "content-type": "application/json" };
}

function toVertexContents(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): VertexContent[] {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

function resolveVertexAuth(
  methodId: VertexConnectionMethodId,
  input: Readonly<Record<string, unknown>>,
): VertexAuthConfig {
  if (methodId === VERTEX_CONNECTION_METHOD_IDS.API_KEY) {
    const apiKey = normalizeNonEmptyString(input["apiKey"]);
    if (apiKey === undefined) {
      throw new AuthError('Connection method "vertex.api_key" requires input.apiKey.');
    }
    return { methodId, apiKey };
  }
  if (methodId === VERTEX_CONNECTION_METHOD_IDS.SERVICE_ACCOUNT) {
    const serviceAccountJson = normalizeNonEmptyString(input["serviceAccountJson"]);
    if (serviceAccountJson === undefined) {
      throw new AuthError('Connection method "vertex.service_account" requires input.serviceAccountJson.');
    }
    return { methodId, serviceAccountJson };
  }
  // WIF: store method ID for connection tracking; live calls will fail with a clear error at session creation
  return { methodId };
}

function mapNetworkError(error: unknown): never {
  const err = error instanceof Error ? error : new Error(String(error));
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET") {
    throw new ProviderUnavailableError(`Vertex AI API is not reachable: ${err.message}`, { cause: err });
  }
  if (code === "ETIMEDOUT") {
    throw new TimeoutError(`Vertex AI API request timed out: ${err.message}`, { cause: err });
  }
  throw new TransientNetworkError(`Vertex AI API network error: ${err.message}`, { cause: err });
}

async function mapHttpError(response: Response): Promise<never> {
  let errorBody: VertexErrorBody = {};
  try { errorBody = (await response.json()) as VertexErrorBody; } catch { /* ignore */ }
  const message = errorBody.error?.message ?? response.statusText;
  if (response.status === 401 || response.status === 403) {
    throw new AuthError(`Vertex AI API authentication failed: ${message}`);
  }
  if (response.status === 429) {
    throw new TransientNetworkError(`Vertex AI API rate limit exceeded: ${message}`);
  }
  if (response.status >= 500) {
    throw new ProviderUnavailableError(`Vertex AI API server error ${response.status}: ${message}`);
  }
  throw new TransientNetworkError(`Vertex AI API request failed with HTTP ${response.status}: ${message}`);
}

export class GoogleVertexAiAdapter implements CloudAdapterContractV2 {
  readonly manifest: AdapterManifest = GOOGLE_VERTEX_AI_MANIFEST;
  readonly requiredEndpointProfileFields = ["projectId", "location"] as const;

  readonly #sessions = new Map<string, VertexSession>();
  readonly #credentialRefs = new Map<string, StoredCredentialRef>();
  #sessionCounter = 0;
  #credentialCounter = 0;

  describeCapabilities(): readonly ProtocolCapability[] {
    return GOOGLE_VERTEX_AI_MANIFEST.capabilities;
  }

  async listModels(): Promise<readonly string[]> {
    return VERTEX_MODEL_DESCRIPTORS.map((model) => model.id);
  }

  listConnectionMethods(): readonly ConnectionMethodDescriptor[] {
    return VERTEX_CONNECTION_METHODS;
  }

  async beginConnect(input: BeginConnectInput): Promise<BeginConnectResult> {
    const providerId = assertProviderId(input.providerId, this.manifest.providerId);
    const methodId = resolveMethodId(input.methodId);
    if (methodId === undefined) {
      throw new AuthError(`Unsupported connection method "${String(input.methodId)}".`);
    }

    if (methodId === VERTEX_CONNECTION_METHOD_IDS.API_KEY) {
      return {
        providerId,
        methodId,
        requiredFields: ["apiKey"],
        optionalFields: ["projectId", "location", "publisher", "defaultModel"],
        metadata: {
          intendedUse: "testing-or-express-mode",
        },
      };
    }

    if (methodId === VERTEX_CONNECTION_METHOD_IDS.SERVICE_ACCOUNT) {
      return {
        providerId,
        methodId,
        requiredFields: ["projectId", "location", "serviceAccountJson"],
        optionalFields: ["publisher", "defaultModel"],
      };
    }

    return {
      providerId,
      methodId,
      requiredFields: ["projectId", "location", "audience", "subjectTokenType"],
      optionalFields: ["serviceAccountImpersonationEmail", "defaultModel"],
      metadata: {
        wifExchange: "sts-token-exchange",
      },
    };
  }

  async completeConnect(input: CompleteConnectInput): Promise<CompleteConnectResult> {
    const providerId = assertProviderId(input.providerId, this.manifest.providerId);
    const methodId = resolveMethodId(input.methodId);
    if (methodId === undefined) {
      throw new AuthError(`Unsupported connection method "${String(input.methodId)}".`);
    }

    const payload = requireInputRecord(input.input);
    const endpointProfile = resolveEndpointProfile(methodId, payload);
    const credentialDigest = resolveCredentialDigest(methodId, payload);
    const auth = resolveVertexAuth(methodId, payload);

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

    const projectId = normalizeNonEmptyString(ctx.endpointProfile["projectId"]) ?? VERTEX_DEFAULT_PROJECT_ID;
    const location = normalizeNonEmptyString(ctx.endpointProfile["location"]) ?? VERTEX_DEFAULT_LOCATION;
    const publisher = normalizeNonEmptyString(ctx.endpointProfile["publisher"]) ?? "google";

    // Resolve API key for live discovery
    let apiKey: string | undefined;
    if (canUseStatelessInput && statelessInput !== undefined) {
      apiKey = normalizeNonEmptyString(statelessInput["apiKey"]);
    } else {
      const credentialRef = normalizeNonEmptyString(ctx.credentialRef);
      if (credentialRef !== undefined) {
        const storedRef = this.#credentialRefs.get(credentialRef);
        if (storedRef?.auth.apiKey) {
          apiKey = storedRef.auth.apiKey;
        }
      }
    }

    if (apiKey !== undefined) {
      try {
        // Use Gemini API model listing — works with API keys and returns all available Gemini models
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(url, {
          method: "GET",
          headers: { "content-type": "application/json" },
          signal: AbortSignal.timeout(30_000),
        });
        if (response.ok) {
          const payload = (await response.json()) as {
            models?: Array<{
              name?: string;
              displayName?: string;
              supportedGenerationMethods?: string[];
            }>;
          };
          if (Array.isArray(payload.models) && payload.models.length > 0) {
            const models: ModelDescriptor[] = [];
            for (const entry of payload.models) {
              const rawName = typeof entry.name === "string" ? entry.name.trim() : undefined;
              if (rawName === undefined) continue;
              // Gemini API returns "models/gemini-2.5-flash" — strip the prefix
              const id = rawName.startsWith("models/") ? rawName.slice(7) : rawName;
              const displayName =
                typeof entry.displayName === "string" && entry.displayName.trim().length > 0
                  ? entry.displayName.trim()
                  : id;
              // Only include models that support content generation
              const methods = Array.isArray(entry.supportedGenerationMethods)
                ? entry.supportedGenerationMethods
                : [];
              if (methods.includes("generateContent") || methods.includes("streamGenerateContent")) {
                models.push(Object.freeze({ id, displayName, projectId, location }));
              }
            }
            if (models.length > 0) return models;
          }
        }
      } catch { /* fall back to static list */ }
    }

    return VERTEX_MODEL_DESCRIPTORS.map((descriptor) =>
      Object.freeze({ ...descriptor, projectId, location }),
    );
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
      capabilities: GOOGLE_VERTEX_AI_MANIFEST.capabilities,
      providerId: ctx.providerId,
      methodId: ctx.methodId,
    };
  }

  async createSession(options?: Readonly<Record<string, unknown>>): Promise<string> {
    const requestedModel = normalizeNonEmptyString(options?.["model"]);
    const model = requestedModel ?? VERTEX_DEFAULT_MODEL;
    const sessionId = `vertex-session-${++this.#sessionCounter}`;

    const methodId = resolveMethodId(options?.["methodId"]);
    const connectionInput = isRecord(options?.["connectionInput"])
      ? options["connectionInput"]
      : undefined;
    const credentialRefKey = normalizeNonEmptyString(options?.["credentialRef"]);

    let auth: VertexAuthConfig;
    let projectId = VERTEX_DEFAULT_PROJECT_ID;
    let location = VERTEX_DEFAULT_LOCATION;
    let publisher = "google";

    if (connectionInput !== undefined && methodId !== undefined) {
      auth = resolveVertexAuth(methodId, connectionInput);
      projectId = normalizeNonEmptyString(connectionInput["projectId"]) ?? VERTEX_DEFAULT_PROJECT_ID;
      location = normalizeNonEmptyString(connectionInput["location"]) ?? VERTEX_DEFAULT_LOCATION;
      publisher = normalizeNonEmptyString(connectionInput["publisher"]) ?? "google";
    } else if (credentialRefKey !== undefined) {
      const storedRef = this.#credentialRefs.get(credentialRefKey);
      if (storedRef === undefined) {
        throw new AuthError("Cannot create session: credential reference not found.");
      }
      auth = storedRef.auth;
      projectId = (normalizeNonEmptyString(storedRef.endpointProfile["projectId"]) as string) ?? VERTEX_DEFAULT_PROJECT_ID;
      location = (normalizeNonEmptyString(storedRef.endpointProfile["location"]) as string) ?? VERTEX_DEFAULT_LOCATION;
      publisher = (normalizeNonEmptyString(storedRef.endpointProfile["publisher"]) as string) ?? "google";
    } else {
      throw new AuthError(
        "Cannot create session: no credentials provided (supply connectionInput or credentialRef).",
      );
    }

    if (auth.methodId !== VERTEX_CONNECTION_METHOD_IDS.API_KEY) {
      throw new AuthError(
        "Vertex AI service account and workload identity federation auth are not yet supported for live chat. Use the API Key connection method.",
      );
    }

    this.#sessions.set(sessionId, {
      model,
      messages: [],
      auth,
      projectId,
      location,
      publisher,
      timeoutMs: VERTEX_DEFAULT_TIMEOUT_MS,
    });
    return sessionId;
  }

  async sendMessage(sessionId: string, message: string): Promise<string> {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) {
      throw new TransientNetworkError(`Session "${sessionId}" not found.`);
    }

    session.messages.push({ role: "user", content: message });

    const url = buildVertexUrl(session.auth, session.projectId, session.location, session.publisher, session.model, "generateContent");
    const headers = buildVertexHeaders(session.auth);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ contents: toVertexContents(session.messages) }),
        signal: AbortSignal.timeout(session.timeoutMs),
      });
    } catch (error) {
      if (error instanceof AuthError) throw error;
      mapNetworkError(error);
    }
    if (!response.ok) {
      await mapHttpError(response);
    }

    const data = (await response.json()) as VertexGenerateResponse;
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
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

    const baseUrl = buildVertexUrl(session.auth, session.projectId, session.location, session.publisher, session.model, "streamGenerateContent");
    const url = baseUrl.includes("?") ? `${baseUrl}&alt=sse` : `${baseUrl}?alt=sse`;
    const headers = buildVertexHeaders(session.auth);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ contents: toVertexContents(session.messages) }),
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
      throw new ProviderUnavailableError("Vertex AI API response body is null.");
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
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === "[DONE]" || jsonStr.length === 0) continue;
          try {
            const event = JSON.parse(jsonStr) as VertexGenerateResponse;
            const parts = event.candidates?.[0]?.content?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.text) { onChunk(part.text); fullContent += part.text; }
              }
            }
          } catch { /* skip malformed SSE lines */ }
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
