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
  signingKeyId: "byom-first-party-v1",
};

const GEMINI_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";
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

type GeminiSession = Readonly<{
  model: string;
  messages: Array<Readonly<{ role: "user" | "assistant"; content: string }>>;
}>;

type StoredCredentialRef = Readonly<{
  providerId: string;
  methodId: GeminiConnectionMethodId;
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

    const baseUrl = normalizeNonEmptyString(ctx.endpointProfile["baseUrl"]) ?? GEMINI_DEFAULT_BASE_URL;
    return GEMINI_MODEL_DESCRIPTORS.map((descriptor) =>
      Object.freeze({
        ...descriptor,
        baseUrl,
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
      capabilities: GEMINI_MANIFEST.capabilities,
      providerId: ctx.providerId,
      methodId: ctx.methodId,
    };
  }

  async createSession(options?: Readonly<Record<string, unknown>>): Promise<string> {
    const requestedModel = normalizeNonEmptyString(options?.["model"]);
    const model = requestedModel ?? GEMINI_DEFAULT_MODEL;
    const sessionId = `gemini-session-${++this.#sessionCounter}`;
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
    const response = `[gemini:${session.model}] ${message}`;
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

