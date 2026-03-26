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
} from "@byom-ai/adapter-runtime";
import { type ProtocolCapability, AuthError, TransientNetworkError } from "@byom-ai/protocol";

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
  signingKeyId: "byom-first-party-v1",
};

const VERTEX_DEFAULT_MODEL = "gemini-2.0-flash";
const VERTEX_DEFAULT_PROJECT_ID = "express-mode";
const VERTEX_DEFAULT_LOCATION = "global";

const VERTEX_MODEL_DESCRIPTORS: readonly ModelDescriptor[] = [
  Object.freeze({ id: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash" }),
  Object.freeze({ id: "gemini-2.0-pro", displayName: "Gemini 2.0 Pro" }),
  Object.freeze({ id: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro" }),
];

type VertexSession = Readonly<{
  model: string;
  messages: Array<Readonly<{ role: "user" | "assistant"; content: string }>>;
}>;

type StoredCredentialRef = Readonly<{
  providerId: string;
  methodId: VertexConnectionMethodId;
  endpointProfile: Readonly<Record<string, unknown>>;
  credentialDigest: string;
}>;

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

    const credentialRef = `credref.${providerId}.${methodId}.${++this.#credentialCounter}`;
    this.#credentialRefs.set(credentialRef, {
      providerId,
      methodId,
      endpointProfile,
      credentialDigest,
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
    const validation = await this.validateCredentialRef({
      providerId: ctx.providerId,
      methodId: ctx.methodId,
      credentialRef: ctx.credentialRef,
      endpointProfile: ctx.endpointProfile,
      correlationId: ctx.correlationId,
    });
    if (!validation.ok) {
      throw new AuthError(
        `Cannot discover models for invalid credential reference: ${validation.reason ?? "invalid_ref"}.`,
      );
    }

    const projectId = normalizeNonEmptyString(ctx.endpointProfile["projectId"]) ?? "unknown-project";
    const location = normalizeNonEmptyString(ctx.endpointProfile["location"]) ?? "us-central1";
    return VERTEX_MODEL_DESCRIPTORS.map((descriptor) =>
      Object.freeze({
        ...descriptor,
        projectId,
        location,
      }),
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
    this.#sessions.set(sessionId, {
      model,
      messages: [],
    });
    return sessionId;
  }

  async sendMessage(sessionId: string, message: string): Promise<string> {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) {
      throw new TransientNetworkError(`Session "${sessionId}" not found.`);
    }

    session.messages.push({ role: "user", content: message });
    const response = `[vertex:${session.model}] ${message}`;
    session.messages.push({ role: "assistant", content: response });
    return response;
  }

  async streamMessage(
    sessionId: string,
    message: string,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const response = await this.sendMessage(sessionId, message);
    for (const token of response.split(" ")) {
      const chunk = token.length > 0 ? `${token} ` : "";
      if (chunk.length > 0) onChunk(chunk);
    }
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
