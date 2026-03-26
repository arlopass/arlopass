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
import {
  type ProtocolCapability,
  AuthError,
  PermissionError,
  ProviderUnavailableError,
  TimeoutError,
  TransientNetworkError,
} from "@byom-ai/protocol";

export const FOUNDRY_CONNECTION_METHOD_IDS = {
  API_KEY: "foundry.api_key",
} as const;

export type FoundryConnectionMethodId =
  (typeof FOUNDRY_CONNECTION_METHOD_IDS)[keyof typeof FOUNDRY_CONNECTION_METHOD_IDS];

export const FOUNDRY_CONNECTION_METHODS: readonly ConnectionMethodDescriptor[] = [
  {
    id: FOUNDRY_CONNECTION_METHOD_IDS.API_KEY,
    authFlow: "api-key",
    displayName: "Microsoft Foundry (API Key + API URL)",
    requiredFields: ["apiUrl", "apiKey"],
    optionalFields: ["apiVersion", "deployment"],
  },
] as const;

const FOUNDRY_CAPABILITIES = [
  "chat.completions",
  "chat.stream",
  "provider.list",
  "session.create",
] as unknown as readonly ProtocolCapability[];

export const MICROSOFT_FOUNDRY_MANIFEST: AdapterManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  providerId: "microsoft-foundry",
  version: "0.1.0",
  displayName: "Microsoft Foundry",
  authType: "api_key",
  capabilities: FOUNDRY_CAPABILITIES,
  connectionMethods: FOUNDRY_CONNECTION_METHODS,
  requiredPermissions: ["network.egress"],
  egressRules: [
    { host: "openai.azure.com", protocol: "https" },
    { host: "services.ai.azure.com", protocol: "https" },
  ],
  riskLevel: "medium",
  signingKeyId: "byom-first-party-v1",
};

const FOUNDRY_DEFAULT_MODEL = "gpt-4o-mini";
const FOUNDRY_DEFAULT_API_VERSION = "v1";
const FOUNDRY_MODEL_IDS = [FOUNDRY_DEFAULT_MODEL] as const;

type FoundrySession = Readonly<{
  model: string;
  apiUrl: string;
  apiVersion: string;
  apiKey: string;
  deployment?: string;
  messages: Array<Readonly<{ role: "user" | "assistant"; content: string }>>;
}>;

type FoundryCredentialMaterial = Readonly<{
  apiKey: string;
}>;

type StoredCredentialRef = Readonly<{
  providerId: string;
  methodId: FoundryConnectionMethodId;
  endpointProfile: Readonly<Record<string, unknown>>;
  credentialDigest: string;
  credentialMaterial: FoundryCredentialMaterial;
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

function normalizeApiUrl(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new AuthError("completeConnect input.apiUrl is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new AuthError("completeConnect input.apiUrl must be a valid URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new AuthError("completeConnect input.apiUrl must use HTTPS.");
  }

  return parsed.toString().replace(/\/$/, "");
}

function resolveMethodId(methodId: unknown): FoundryConnectionMethodId | undefined {
  const normalized = normalizeNonEmptyString(methodId);
  if (normalized === undefined) return undefined;
  if (normalized === FOUNDRY_CONNECTION_METHOD_IDS.API_KEY) {
    return normalized;
  }
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
  const apiUrl = normalizeApiUrl(requireInputString(input, "apiUrl"));
  const apiVersion =
    normalizeNonEmptyString(input["apiVersion"]) ?? FOUNDRY_DEFAULT_API_VERSION;
  const deployment = normalizeNonEmptyString(input["deployment"]);
  return Object.freeze({
    apiUrl,
    apiVersion,
    ...(deployment !== undefined ? { deployment } : {}),
  });
}

function resolveCredentialDigest(input: Readonly<Record<string, unknown>>): string {
  const apiKey = requireInputString(input, "apiKey");
  return canonicalizeJsonValue({
    method: FOUNDRY_CONNECTION_METHOD_IDS.API_KEY,
    apiKeyLength: apiKey.length,
  });
}

function resolveCredentialMaterial(input: Readonly<Record<string, unknown>>): FoundryCredentialMaterial {
  const apiKey = requireInputString(input, "apiKey");
  return Object.freeze({ apiKey });
}

function resolveEndpointProfileFromOptions(
  options: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  const endpointProfile = options?.["endpointProfile"];
  if (!isRecord(endpointProfile)) {
    return Object.freeze({});
  }
  return Object.freeze({ ...endpointProfile });
}

function mapNetworkError(error: unknown): never {
  const err = error instanceof Error ? error : new Error(String(error));
  const errWithCode = err as Error & { code?: unknown };
  const code = typeof errWithCode.code === "string" ? errWithCode.code : undefined;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET") {
    throw new ProviderUnavailableError(`Foundry API is not reachable: ${err.message}`, {
      cause: err,
    });
  }
  if (code === "ETIMEDOUT") {
    throw new TimeoutError(`Foundry API request timed out: ${err.message}`, { cause: err });
  }
  throw new TransientNetworkError(`Foundry API network error: ${err.message}`, {
    cause: err,
  });
}

async function mapHttpError(response: Response): Promise<never> {
  let errorBody: unknown;
  try {
    errorBody = await response.json();
  } catch {
    errorBody = undefined;
  }
  const message =
    isRecord(errorBody) &&
      isRecord(errorBody["error"]) &&
      typeof errorBody["error"]["message"] === "string"
      ? errorBody["error"]["message"]
      : isRecord(errorBody) && typeof errorBody["message"] === "string"
        ? errorBody["message"]
        : response.statusText;

  if (response.status === 401) {
    throw new AuthError(`Foundry API authentication failed: ${message}`);
  }
  if (response.status === 403) {
    throw new PermissionError(`Foundry API permission denied: ${message}`);
  }
  if (response.status === 404) {
    throw new ProviderUnavailableError(
      `Foundry endpoint or deployment was not found: ${message}`,
    );
  }
  if (response.status === 429) {
    throw new TransientNetworkError(`Foundry API rate limit exceeded: ${message}`);
  }
  if (response.status >= 500) {
    throw new ProviderUnavailableError(
      `Foundry API server error ${String(response.status)}: ${message}`,
    );
  }
  throw new TransientNetworkError(
    `Foundry API request failed with HTTP ${String(response.status)}: ${message}`,
  );
}

function extractChatResponseContent(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload["choices"]) || payload["choices"].length === 0) {
    throw new ProviderUnavailableError("Foundry API response did not include chat choices.");
  }
  const firstChoice = payload["choices"][0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice["message"])) {
    throw new ProviderUnavailableError("Foundry API response did not include a chat message.");
  }
  const content = firstChoice["message"]["content"];
  if (typeof content === "string" && content.trim().length > 0) {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const joined = content
      .map((entry) => {
        if (!isRecord(entry) || typeof entry["text"] !== "string") {
          return "";
        }
        return entry["text"];
      })
      .join("")
      .trim();
    if (joined.length > 0) {
      return joined;
    }
  }
  throw new ProviderUnavailableError("Foundry API returned empty assistant content.");
}

function extractModelDescriptors(
  payload: unknown,
  endpointContext: Readonly<{
    apiUrl: string;
    deployment?: string;
  }>,
): readonly ModelDescriptor[] {
  if (!isRecord(payload) || !Array.isArray(payload["data"])) {
    return [];
  }
  const models: ModelDescriptor[] = [];
  for (const candidate of payload["data"]) {
    if (!isRecord(candidate)) {
      continue;
    }
    const id =
      normalizeNonEmptyString(candidate["id"]) ??
      normalizeNonEmptyString(candidate["model"]) ??
      undefined;
    if (id === undefined) {
      continue;
    }
    const displayName =
      normalizeNonEmptyString(candidate["displayName"]) ??
      normalizeNonEmptyString(candidate["name"]) ??
      id;
    models.push(
      Object.freeze({
        id,
        displayName,
        apiUrl: endpointContext.apiUrl,
        ...(endpointContext.deployment !== undefined
          ? { deployment: endpointContext.deployment }
          : {}),
      }),
    );
  }
  return models;
}

export class MicrosoftFoundryAdapter implements CloudAdapterContractV2 {
  readonly manifest: AdapterManifest = MICROSOFT_FOUNDRY_MANIFEST;
  readonly requiredEndpointProfileFields = ["apiUrl"] as const;

  readonly #sessions = new Map<string, FoundrySession>();
  readonly #credentialRefs = new Map<string, StoredCredentialRef>();
  #sessionCounter = 0;
  #credentialCounter = 0;

  describeCapabilities(): readonly ProtocolCapability[] {
    return MICROSOFT_FOUNDRY_MANIFEST.capabilities;
  }

  async listModels(): Promise<readonly string[]> {
    return FOUNDRY_MODEL_IDS;
  }

  listConnectionMethods(): readonly ConnectionMethodDescriptor[] {
    return FOUNDRY_CONNECTION_METHODS;
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
      requiredFields: ["apiUrl", "apiKey"],
      optionalFields: ["apiVersion", "deployment"],
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
    const credentialDigest = resolveCredentialDigest(payload);
    const credentialMaterial = resolveCredentialMaterial(payload);
    const credentialRef = `credref.${providerId}.${methodId}.${++this.#credentialCounter}`;
    this.#credentialRefs.set(credentialRef, {
      providerId,
      methodId,
      endpointProfile,
      credentialDigest,
      credentialMaterial,
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
    const credentialRef = normalizeNonEmptyString(ctx.credentialRef);
    const storedRef = credentialRef !== undefined ? this.#credentialRefs.get(credentialRef) : undefined;
    const statelessEndpointProfile =
      statelessInput !== undefined ? resolveEndpointProfile(statelessInput) : undefined;
    const endpointProfile: Readonly<Record<string, unknown>> = isRecord(ctx.endpointProfile)
      ? ctx.endpointProfile
      : (statelessEndpointProfile ?? storedRef?.endpointProfile ?? Object.freeze({}));
    const apiUrl = normalizeApiUrl(
      normalizeNonEmptyString(endpointProfile["apiUrl"]) ??
      normalizeNonEmptyString(statelessEndpointProfile?.["apiUrl"]) ??
      normalizeNonEmptyString(storedRef?.endpointProfile["apiUrl"]) ??
      "",
    );
    const apiVersion =
      normalizeNonEmptyString(endpointProfile["apiVersion"]) ??
      normalizeNonEmptyString(statelessEndpointProfile?.["apiVersion"]) ??
      normalizeNonEmptyString(storedRef?.endpointProfile["apiVersion"]) ??
      FOUNDRY_DEFAULT_API_VERSION;
    const deployment =
      normalizeNonEmptyString(endpointProfile["deployment"]) ??
      normalizeNonEmptyString(statelessEndpointProfile?.["deployment"]) ??
      normalizeNonEmptyString(storedRef?.endpointProfile["deployment"]);
    const statelessCredential =
      statelessInput !== undefined ? resolveCredentialMaterial(statelessInput) : undefined;
    const apiKey =
      normalizeNonEmptyString(statelessCredential?.apiKey) ??
      normalizeNonEmptyString(storedRef?.credentialMaterial.apiKey);
    if (apiKey === undefined) {
      throw new AuthError(
        "Cannot discover models: credential reference is unavailable.",
      );
    }
    const endpoint = new URL(`${apiUrl}/models`);
    endpoint.searchParams.set("api-version", apiVersion);

    let response: Response;
    try {
      response = await fetch(endpoint.toString(), {
        method: "GET",
        headers: {
          "api-key": apiKey,
        },
        signal: AbortSignal.timeout(30_000),
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
      throw new ProviderUnavailableError("Foundry API model discovery response was not valid JSON.");
    }
    return extractModelDescriptors(payload, { apiUrl, ...(deployment !== undefined ? { deployment } : {}) });
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
      capabilities: MICROSOFT_FOUNDRY_MANIFEST.capabilities,
      providerId: ctx.providerId,
      methodId: ctx.methodId,
    };
  }

  async createSession(options?: Readonly<Record<string, unknown>>): Promise<string> {
    const requestedModel = normalizeNonEmptyString(options?.["model"]);
    const model = requestedModel ?? FOUNDRY_DEFAULT_MODEL;
    const requestedMethodId = options?.["methodId"];
    const resolvedMethodId =
      requestedMethodId === undefined
        ? FOUNDRY_CONNECTION_METHOD_IDS.API_KEY
        : resolveMethodId(requestedMethodId);
    if (resolvedMethodId === undefined) {
      throw new AuthError(
        `Unsupported connection method "${String(requestedMethodId)}" for Foundry session.`,
      );
    }
    const endpointProfile = resolveEndpointProfileFromOptions(options);
    const credentialRef = normalizeNonEmptyString(options?.["credentialRef"]);
    const storedCredentialRef =
      credentialRef !== undefined ? this.#credentialRefs.get(credentialRef) : undefined;
    if (credentialRef !== undefined && storedCredentialRef === undefined) {
      throw new AuthError(
        "Foundry credential reference is unavailable. Re-test provider connection to refresh bridge credential state.",
      );
    }
    const connectionInput = isRecord(options?.["connectionInput"]) ? options["connectionInput"] : undefined;
    const apiUrl = normalizeApiUrl(
      normalizeNonEmptyString(connectionInput?.["apiUrl"]) ??
      normalizeNonEmptyString(endpointProfile["apiUrl"]) ??
      normalizeNonEmptyString(storedCredentialRef?.endpointProfile["apiUrl"]) ??
      "",
    );
    const apiVersion =
      normalizeNonEmptyString(connectionInput?.["apiVersion"]) ??
      normalizeNonEmptyString(endpointProfile["apiVersion"]) ??
      normalizeNonEmptyString(storedCredentialRef?.endpointProfile["apiVersion"]) ??
      FOUNDRY_DEFAULT_API_VERSION;
    const deployment =
      normalizeNonEmptyString(connectionInput?.["deployment"]) ??
      normalizeNonEmptyString(endpointProfile["deployment"]) ??
      normalizeNonEmptyString(storedCredentialRef?.endpointProfile["deployment"]);
    const apiKey =
      normalizeNonEmptyString(connectionInput?.["apiKey"]) ??
      normalizeNonEmptyString(storedCredentialRef?.credentialMaterial.apiKey);
    if (apiKey === undefined) {
      throw new AuthError(
        "Foundry session auth context is unavailable. Re-test provider connection to refresh bridge credential state.",
      );
    }
    const sessionId = `foundry-session-${++this.#sessionCounter}`;
    this.#sessions.set(sessionId, {
      model,
      apiUrl,
      apiVersion,
      apiKey,
      ...(deployment !== undefined ? { deployment } : {}),
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

    const endpoint = new URL(`${session.apiUrl}/chat/completions`);
    endpoint.searchParams.set("api-version", session.apiVersion);

    let response: Response;
    try {
      response = await fetch(endpoint.toString(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "api-key": session.apiKey,
        },
        body: JSON.stringify({
          model: session.deployment ?? session.model,
          messages: session.messages,
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      mapNetworkError(error);
    }
    if (!response.ok) {
      await mapHttpError(response);
    }
    const payload = (await response.json()) as unknown;
    const content = extractChatResponseContent(payload);
    session.messages.push({ role: "assistant", content });
    return content;
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

