import { createHmac, createHash } from "node:crypto";

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
import { type ProtocolCapability, AuthError, ProviderUnavailableError, TimeoutError, TransientNetworkError } from "@arlopass/protocol";

export const BEDROCK_CONNECTION_METHOD_IDS = {
  API_KEY: "bedrock.api_key",
  AWS_ACCESS_KEY: "bedrock.aws_access_key",
  ASSUME_ROLE: "bedrock.assume_role",
} as const;

export type BedrockConnectionMethodId =
  (typeof BEDROCK_CONNECTION_METHOD_IDS)[keyof typeof BEDROCK_CONNECTION_METHOD_IDS];

export type BedrockDiscoveryStatus = "healthy" | "partial" | "stale" | "unavailable";

export type BedrockDiscoveryRegionStatus = Readonly<{
  region: string;
  status: BedrockDiscoveryStatus;
  modelCount: number;
}>;

export const BEDROCK_CONNECTION_METHODS: readonly ConnectionMethodDescriptor[] = [
  {
    id: BEDROCK_CONNECTION_METHOD_IDS.API_KEY,
    authFlow: "api-key",
    displayName: "Amazon Bedrock (API Key)",
    requiredFields: ["region", "apiKey"],
    optionalFields: ["modelAccessPolicy"],
  },
  {
    id: BEDROCK_CONNECTION_METHOD_IDS.AWS_ACCESS_KEY,
    authFlow: "aws-signature-v4",
    displayName: "Amazon Bedrock (AWS Access Key)",
    requiredFields: ["region", "accessKeyId", "secretAccessKey"],
    optionalFields: ["modelAccessPolicy", "roleArn", "sessionToken"],
  },
  {
    id: BEDROCK_CONNECTION_METHOD_IDS.ASSUME_ROLE,
    authFlow: "aws-assume-role",
    displayName: "Amazon Bedrock (Assume Role)",
    requiredFields: ["region", "roleArn"],
    optionalFields: ["modelAccessPolicy", "externalId"],
    metadata: {
      maxAssumeRoleHopDepth: 1,
      assumeRoleMode: "single-hop",
    },
  },
] as const;

const BEDROCK_CAPABILITIES = [
  "chat.completions",
  "chat.stream",
  "provider.list",
  "session.create",
] as unknown as readonly ProtocolCapability[];

export const AMAZON_BEDROCK_MANIFEST: AdapterManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  providerId: "amazon-bedrock",
  version: "0.1.0",
  displayName: "Amazon Bedrock",
  authType: "api_key",
  capabilities: BEDROCK_CAPABILITIES,
  connectionMethods: BEDROCK_CONNECTION_METHODS,
  requiredPermissions: ["network.egress"],
  egressRules: [
    { host: "sts.amazonaws.com", protocol: "https" },
    { host: "bedrock.us-east-1.amazonaws.com", protocol: "https" },
    { host: "bedrock.us-west-2.amazonaws.com", protocol: "https" },
    { host: "bedrock-runtime.us-east-1.amazonaws.com", protocol: "https" },
    { host: "bedrock-runtime.us-west-2.amazonaws.com", protocol: "https" },
  ],
  riskLevel: "medium",
  signingKeyId: "arlopass-first-party-v1",
};

const BEDROCK_DEFAULT_MODEL = "anthropic.claude-3-5-sonnet-20241022-v2:0";
const BEDROCK_DEFAULT_TIMEOUT_MS = 60_000;

const BEDROCK_MODEL_CATALOG_BY_REGION: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "us-east-1": Object.freeze([
    "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "anthropic.claude-3-5-haiku-20241022-v1:0",
    "amazon.nova-lite-v1:0",
  ]),
  "us-west-2": Object.freeze([
    "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "amazon.nova-pro-v1:0",
  ]),
  "eu-central-1": Object.freeze(["amazon.nova-lite-v1:0"]),
});

const ALLOWED_DISCOVERY_STATUSES: readonly BedrockDiscoveryStatus[] = Object.freeze([
  "healthy",
  "partial",
  "stale",
  "unavailable",
]);

type BedrockAuthConfig = Readonly<{
  methodId: BedrockConnectionMethodId;
  apiKey?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}>;

type BedrockSession = {
  model: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  auth: BedrockAuthConfig;
  region: string;
  timeoutMs: number;
};

type StoredCredentialRef = Readonly<{
  providerId: string;
  methodId: BedrockConnectionMethodId;
  endpointProfile: Readonly<Record<string, unknown>>;
  credentialDigest: string;
  maxAssumeRoleHopDepth: 1;
  auth: BedrockAuthConfig;
}>;

type ConverseMessage = { role: "user" | "assistant"; content: Array<{ text: string }> };
type ConverseResponse = { output?: { message?: { content?: Array<{ text?: string }> } } };
type ConverseStreamEvent = { contentBlockDelta?: { delta?: { text?: string } } };
type BedrockErrorBody = { message?: string; Message?: string };

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

function resolveMethodId(methodId: unknown): BedrockConnectionMethodId | undefined {
  const normalized = normalizeNonEmptyString(methodId);
  if (normalized === undefined) return undefined;
  if (normalized === BEDROCK_CONNECTION_METHOD_IDS.API_KEY) return normalized;
  if (normalized === BEDROCK_CONNECTION_METHOD_IDS.AWS_ACCESS_KEY) return normalized;
  if (normalized === BEDROCK_CONNECTION_METHOD_IDS.ASSUME_ROLE) return normalized;
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
  methodId: BedrockConnectionMethodId,
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const region = requireInputString(input, "region");
  const modelAccessPolicy = normalizeNonEmptyString(input["modelAccessPolicy"]) ?? "allow-all";
  const roleArn =
    methodId === BEDROCK_CONNECTION_METHOD_IDS.ASSUME_ROLE
      ? requireInputString(input, "roleArn")
      : normalizeNonEmptyString(input["roleArn"]);
  const externalId = normalizeNonEmptyString(input["externalId"]);
  return Object.freeze({
    region,
    modelAccessPolicy,
    ...(roleArn !== undefined ? { roleArn } : {}),
    ...(externalId !== undefined ? { externalId } : {}),
  });
}

function parseRegionList(regionField: unknown): readonly string[] {
  const normalized = normalizeNonEmptyString(regionField);
  if (normalized === undefined) return Object.freeze(["us-east-1"]);
  const values = normalized
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const deduped = Array.from(new Set(values));
  return Object.freeze(deduped.length > 0 ? deduped : ["us-east-1"]);
}

function resolveCredentialDigest(
  methodId: BedrockConnectionMethodId,
  input: Readonly<Record<string, unknown>>,
): string {
  if (methodId === BEDROCK_CONNECTION_METHOD_IDS.API_KEY) {
    const apiKey = requireInputString(input, "apiKey");
    return canonicalizeJsonValue({
      method: methodId,
      apiKeyLength: apiKey.length,
    });
  }

  if (methodId === BEDROCK_CONNECTION_METHOD_IDS.AWS_ACCESS_KEY) {
    const accessKeyId = requireInputString(input, "accessKeyId");
    const secretAccessKey = requireInputString(input, "secretAccessKey");
    const sessionTokenLength = normalizeNonEmptyString(input["sessionToken"])?.length ?? 0;
    return canonicalizeJsonValue({
      method: methodId,
      accessKeyId,
      secretAccessKeyLength: secretAccessKey.length,
      sessionTokenLength,
    });
  }

  const roleArn = requireInputString(input, "roleArn");
  const externalId = normalizeNonEmptyString(input["externalId"]);
  const hopDepthRaw = input["hopDepth"];
  const hopDepth = typeof hopDepthRaw === "number" && Number.isFinite(hopDepthRaw) ? hopDepthRaw : 1;
  if (hopDepth > 1) {
    throw new AuthError("bedrock.assume_role supports single-hop assume-role only.");
  }
  return canonicalizeJsonValue({
    method: methodId,
    roleArn,
    externalId: externalId ?? null,
    hopDepth,
  });
}

function normalizeDiscoveryStatus(index: number, modelCount: number): BedrockDiscoveryStatus {
  if (modelCount <= 0) return "unavailable";
  if (index % 3 === 1) return "partial";
  if (index % 5 === 2) return "stale";
  return "healthy";
}

function resolveBedrockAuth(
  methodId: BedrockConnectionMethodId,
  input: Readonly<Record<string, unknown>>,
): BedrockAuthConfig {
  if (methodId === BEDROCK_CONNECTION_METHOD_IDS.API_KEY) {
    const apiKey = normalizeNonEmptyString(input["apiKey"]);
    if (apiKey === undefined) {
      throw new AuthError('Connection method "bedrock.api_key" requires input.apiKey.');
    }
    return { methodId, apiKey };
  }
  if (methodId === BEDROCK_CONNECTION_METHOD_IDS.AWS_ACCESS_KEY) {
    const accessKeyId = normalizeNonEmptyString(input["accessKeyId"]);
    const secretAccessKey = normalizeNonEmptyString(input["secretAccessKey"]);
    if (accessKeyId === undefined || secretAccessKey === undefined) {
      throw new AuthError('Connection method "bedrock.aws_access_key" requires accessKeyId and secretAccessKey.');
    }
    const sessionToken = normalizeNonEmptyString(input["sessionToken"]);
    return { methodId, accessKeyId, secretAccessKey, ...(sessionToken !== undefined ? { sessionToken } : {}) };
  }
  // Assume Role: store method ID for connection tracking; live calls will fail with a clear error at session creation
  return { methodId };
}

function toConverseMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): ConverseMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: [{ text: m.content }],
  }));
}

// AWS Signature V4 helpers
function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function getSignatureKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function signAwsRequest(options: {
  method: string;
  url: string;
  body: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}): Record<string, string> {
  const parsedUrl = new URL(options.url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const host = parsedUrl.host;
  const canonicalUri = parsedUrl.pathname;
  const canonicalQueryString = parsedUrl.search ? parsedUrl.search.slice(1) : "";
  const payloadHash = sha256Hex(options.body);

  const signedHeadersList = ["content-type", "host", "x-amz-date"];
  if (options.sessionToken) signedHeadersList.push("x-amz-security-token");
  signedHeadersList.sort();
  const signedHeaders = signedHeadersList.join(";");

  const headerEntries: Record<string, string> = {
    "content-type": "application/json",
    "host": host,
    "x-amz-date": amzDate,
  };
  if (options.sessionToken) {
    headerEntries["x-amz-security-token"] = options.sessionToken;
  }

  const canonicalHeaders = signedHeadersList
    .map((h) => `${h}:${headerEntries[h]}\n`)
    .join("");

  const canonicalRequest = [
    options.method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${options.region}/${options.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(options.secretAccessKey, dateStamp, options.region, options.service);
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  const authHeader = `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    "Authorization": authHeader,
  };
  if (options.sessionToken) {
    headers["x-amz-security-token"] = options.sessionToken;
  }
  return headers;
}

function buildBedrockHeaders(
  auth: BedrockAuthConfig,
  url: string,
  body: string,
  region: string,
): Record<string, string> {
  if (auth.methodId === BEDROCK_CONNECTION_METHOD_IDS.API_KEY && auth.apiKey) {
    return {
      "content-type": "application/json",
      "Authorization": `Bearer ${auth.apiKey}`,
    };
  }
  if (auth.methodId === BEDROCK_CONNECTION_METHOD_IDS.AWS_ACCESS_KEY && auth.accessKeyId && auth.secretAccessKey) {
    return signAwsRequest({
      method: "POST",
      url,
      body,
      region,
      service: "bedrock",
      accessKeyId: auth.accessKeyId,
      secretAccessKey: auth.secretAccessKey,
      ...(auth.sessionToken !== undefined ? { sessionToken: auth.sessionToken } : {}),
    });
  }
  return { "content-type": "application/json" };
}

function mapNetworkError(error: unknown): never {
  const err = error instanceof Error ? error : new Error(String(error));
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET") {
    throw new ProviderUnavailableError(`Bedrock API is not reachable: ${err.message}`, { cause: err });
  }
  if (code === "ETIMEDOUT") {
    throw new TimeoutError(`Bedrock API request timed out: ${err.message}`, { cause: err });
  }
  throw new TransientNetworkError(`Bedrock API network error: ${err.message}`, { cause: err });
}

async function mapHttpError(response: Response): Promise<never> {
  let errorBody: BedrockErrorBody = {};
  try { errorBody = (await response.json()) as BedrockErrorBody; } catch { /* ignore */ }
  const message = errorBody.message ?? errorBody.Message ?? response.statusText;
  if (response.status === 401 || response.status === 403) {
    throw new AuthError(`Bedrock API authentication failed: ${message}`);
  }
  if (response.status === 429) {
    throw new TransientNetworkError(`Bedrock API rate limit exceeded: ${message}`);
  }
  if (response.status >= 500) {
    throw new ProviderUnavailableError(`Bedrock API server error ${response.status}: ${message}`);
  }
  throw new TransientNetworkError(`Bedrock API request failed with HTTP ${response.status}: ${message}`);
}

export class AmazonBedrockAdapter implements CloudAdapterContractV2 {
  readonly manifest: AdapterManifest = AMAZON_BEDROCK_MANIFEST;
  readonly requiredEndpointProfileFields = ["region"] as const;
  lastDiscoveryRegions: readonly BedrockDiscoveryRegionStatus[] = Object.freeze([]);

  readonly #sessions = new Map<string, BedrockSession>();
  readonly #credentialRefs = new Map<string, StoredCredentialRef>();
  #sessionCounter = 0;
  #credentialCounter = 0;

  describeCapabilities(): readonly ProtocolCapability[] {
    return AMAZON_BEDROCK_MANIFEST.capabilities;
  }

  async listModels(): Promise<readonly string[]> {
    const unique = new Set<string>();
    Object.values(BEDROCK_MODEL_CATALOG_BY_REGION).forEach((models) => {
      models.forEach((modelId) => unique.add(modelId));
    });
    return Object.freeze(Array.from(unique));
  }

  listConnectionMethods(): readonly ConnectionMethodDescriptor[] {
    return BEDROCK_CONNECTION_METHODS;
  }

  async beginConnect(input: BeginConnectInput): Promise<BeginConnectResult> {
    const providerId = assertProviderId(input.providerId, this.manifest.providerId);
    const methodId = resolveMethodId(input.methodId);
    if (methodId === undefined) {
      throw new AuthError(`Unsupported connection method "${String(input.methodId)}".`);
    }

    if (methodId === BEDROCK_CONNECTION_METHOD_IDS.API_KEY) {
      return {
        providerId,
        methodId,
        requiredFields: ["region", "apiKey"],
        optionalFields: ["modelAccessPolicy"],
      };
    }

    if (methodId === BEDROCK_CONNECTION_METHOD_IDS.AWS_ACCESS_KEY) {
      return {
        providerId,
        methodId,
        requiredFields: ["region", "accessKeyId", "secretAccessKey"],
        optionalFields: ["modelAccessPolicy", "sessionToken"],
      };
    }

    return {
      providerId,
      methodId,
      requiredFields: ["region", "roleArn"],
      optionalFields: ["modelAccessPolicy", "externalId"],
      metadata: {
        maxAssumeRoleHopDepth: 1,
        assumeRoleMode: "single-hop",
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
    const auth = resolveBedrockAuth(methodId, payload);
    const credentialRef = `credref.${providerId}.${methodId}.${++this.#credentialCounter}`;

    this.#credentialRefs.set(credentialRef, {
      providerId,
      methodId,
      endpointProfile,
      credentialDigest,
      maxAssumeRoleHopDepth: 1,
      auth,
    });

    return {
      providerId,
      methodId,
      credentialRef,
      endpointProfile,
      metadata: {
        maxAssumeRoleHopDepth: 1,
      },
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
    if (storedRef.maxAssumeRoleHopDepth !== 1) {
      return { ok: false, retryable: false, reason: "assume_role_hop_depth_invalid" };
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

    const regions = parseRegionList(ctx.endpointProfile["region"]);
    const regionStatuses: BedrockDiscoveryRegionStatus[] = regions.map((region, index) => {
      const models = BEDROCK_MODEL_CATALOG_BY_REGION[region] ?? Object.freeze([]);
      const status = normalizeDiscoveryStatus(index, models.length);
      return Object.freeze({
        region,
        status,
        modelCount: models.length,
      });
    });

    this.lastDiscoveryRegions = Object.freeze(regionStatuses);

    const aggregatedModels = new Map<string, ModelDescriptor>();
    regionStatuses.forEach((entry) => {
      const regionModels = BEDROCK_MODEL_CATALOG_BY_REGION[entry.region] ?? [];
      regionModels.forEach((modelId) => {
        const existing = aggregatedModels.get(modelId);
        if (existing !== undefined) return;
        aggregatedModels.set(
          modelId,
          Object.freeze({
            id: modelId,
            displayName: modelId,
            region: entry.region,
            regionStatus: entry.status,
          }),
        );
      });
    });

    if (aggregatedModels.size === 0) {
      aggregatedModels.set(
        BEDROCK_DEFAULT_MODEL,
        Object.freeze({
          id: BEDROCK_DEFAULT_MODEL,
          displayName: BEDROCK_DEFAULT_MODEL,
          region: regions[0] ?? "us-east-1",
          regionStatus: "unavailable",
        }),
      );
    }

    return Object.freeze(Array.from(aggregatedModels.values()));
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

    const statuses = this.lastDiscoveryRegions;
    const normalizedStatuses = statuses.filter((entry) => ALLOWED_DISCOVERY_STATUSES.includes(entry.status));
    return {
      capabilities: AMAZON_BEDROCK_MANIFEST.capabilities,
      providerId: ctx.providerId,
      methodId: ctx.methodId,
      discovery: {
        regions: normalizedStatuses,
      },
    };
  }

  async createSession(options?: Readonly<Record<string, unknown>>): Promise<string> {
    const requestedModel = normalizeNonEmptyString(options?.["model"]);
    const model = requestedModel ?? BEDROCK_DEFAULT_MODEL;
    const sessionId = `bedrock-session-${++this.#sessionCounter}`;

    const methodId = resolveMethodId(options?.["methodId"]);
    const connectionInput = isRecord(options?.["connectionInput"])
      ? options["connectionInput"]
      : undefined;
    const credentialRefKey = normalizeNonEmptyString(options?.["credentialRef"]);

    let auth: BedrockAuthConfig;
    let region = "us-east-1";

    if (connectionInput !== undefined && methodId !== undefined) {
      auth = resolveBedrockAuth(methodId, connectionInput);
      region = normalizeNonEmptyString(connectionInput["region"]) ?? "us-east-1";
    } else if (credentialRefKey !== undefined) {
      const storedRef = this.#credentialRefs.get(credentialRefKey);
      if (storedRef === undefined) {
        throw new AuthError("Cannot create session: credential reference not found.");
      }
      auth = storedRef.auth;
      region = (normalizeNonEmptyString(storedRef.endpointProfile["region"]) as string) ?? "us-east-1";
    } else {
      throw new AuthError(
        "Cannot create session: no credentials provided (supply connectionInput or credentialRef).",
      );
    }

    if (auth.methodId === BEDROCK_CONNECTION_METHOD_IDS.ASSUME_ROLE) {
      throw new AuthError(
        "Amazon Bedrock Assume Role is not yet supported for live chat. Use API Key or AWS Access Key.",
      );
    }

    this.#sessions.set(sessionId, {
      model,
      messages: [],
      auth,
      region,
      timeoutMs: BEDROCK_DEFAULT_TIMEOUT_MS,
    });
    return sessionId;
  }

  async sendMessage(sessionId: string, message: string): Promise<string> {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) {
      throw new TransientNetworkError(`Session "${sessionId}" not found.`);
    }

    session.messages.push({ role: "user", content: message });

    const url = `https://bedrock-runtime.${session.region}.amazonaws.com/model/${encodeURIComponent(session.model)}/converse`;
    const body = JSON.stringify({
      messages: toConverseMessages(session.messages),
    });
    const headers = buildBedrockHeaders(session.auth, url, body, session.region);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(session.timeoutMs),
      });
    } catch (error) {
      if (error instanceof AuthError) throw error;
      mapNetworkError(error);
    }
    if (!response.ok) {
      await mapHttpError(response);
    }

    const data = (await response.json()) as ConverseResponse;
    const text = data.output?.message?.content?.map((c) => c.text ?? "").join("") ?? "";
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

    const url = `https://bedrock-runtime.${session.region}.amazonaws.com/model/${encodeURIComponent(session.model)}/converse-stream`;
    const body = JSON.stringify({
      messages: toConverseMessages(session.messages),
    });
    const headers = buildBedrockHeaders(session.auth, url, body, session.region);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body,
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
      throw new ProviderUnavailableError("Bedrock API response body is null.");
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
          if (trimmed.length === 0) continue;
          // Bedrock streams events as JSON lines or event-stream format
          try {
            const event = JSON.parse(trimmed) as ConverseStreamEvent;
            const delta = event.contentBlockDelta?.delta?.text;
            if (delta) { onChunk(delta); fullContent += delta; }
          } catch { /* skip non-JSON lines */ }
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
    this.lastDiscoveryRegions = Object.freeze([]);
    this.#sessionCounter = 0;
    this.#credentialCounter = 0;
  }
}
