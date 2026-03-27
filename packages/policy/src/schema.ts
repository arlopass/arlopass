import { isProtocolCapability, type ProtocolCapability } from "@arlopass/protocol";

export const POLICY_BUNDLE_SCHEMA_VERSION = "1.0.0";
export const POLICY_SIGNATURE_ALGORITHM = "ed25519";

export type PolicySignatureAlgorithm = typeof POLICY_SIGNATURE_ALGORITHM;

export type PolicySchemaErrorDetails = Readonly<
  Record<string, string | number | boolean | null>
>;

export const POLICY_SCHEMA_ERROR_CODES = {
  INVALID_INPUT: "POLICY_SCHEMA_INVALID_INPUT",
  MISSING_FIELD: "POLICY_SCHEMA_MISSING_FIELD",
  INVALID_FIELD: "POLICY_SCHEMA_INVALID_FIELD",
  INVALID_TIMESTAMP: "POLICY_SCHEMA_INVALID_TIMESTAMP",
  INVALID_ORIGIN: "POLICY_SCHEMA_INVALID_ORIGIN",
  UNSUPPORTED_CAPABILITY: "POLICY_SCHEMA_UNSUPPORTED_CAPABILITY",
  UNSUPPORTED_SCHEMA_VERSION: "POLICY_SCHEMA_UNSUPPORTED_SCHEMA_VERSION",
  UNSUPPORTED_SIGNATURE_ALGORITHM: "POLICY_SCHEMA_UNSUPPORTED_SIGNATURE_ALGORITHM",
} as const;

export type PolicySchemaErrorCode =
  (typeof POLICY_SCHEMA_ERROR_CODES)[keyof typeof POLICY_SCHEMA_ERROR_CODES];

export class PolicySchemaError extends Error {
  readonly code: PolicySchemaErrorCode;
  readonly field: string | undefined;
  readonly details: PolicySchemaErrorDetails | undefined;

  constructor(
    message: string,
    options: Readonly<{
      code: PolicySchemaErrorCode;
      field?: string;
      details?: PolicySchemaErrorDetails;
      cause?: Error;
    }>,
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "PolicySchemaError";
    this.code = options.code;
    this.field = options.field;
    this.details = options.details;
  }
}

export type PolicyRuleSet = Readonly<{
  allowedOrigins?: readonly string[];
  deniedOrigins?: readonly string[];
  allowedCapabilities?: readonly ProtocolCapability[];
  deniedCapabilities?: readonly ProtocolCapability[];
  allowedProviders?: readonly string[];
  deniedProviders?: readonly string[];
  allowedModels?: readonly string[];
  deniedModels?: readonly string[];
}>;

export type PolicyBundle = Readonly<{
  schemaVersion: string;
  policyVersion: string;
  keyId: string;
  issuedAt: string;
  expiresAt?: string;
  rules: PolicyRuleSet;
  metadata?: Readonly<Record<string, string>>;
}>;

export type PolicyBundleSignature = Readonly<{
  algorithm: PolicySignatureAlgorithm;
  keyId: string;
  signedAt: string;
  digest: string;
  value: string;
}>;

export type SignedPolicyBundle = Readonly<{
  payload: PolicyBundle;
  signature: PolicyBundleSignature;
}>;

export type SafeParseSuccess<T> = Readonly<{ success: true; data: T }>;
export type SafeParseFailure = Readonly<{ success: false; error: PolicySchemaError }>;
export type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseFailure;

const ALLOWED_ORIGIN_SCHEMES = new Set(["https:", "http:", "chrome-extension:"]);
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

type MutablePolicyRuleSet = {
  allowedOrigins?: readonly string[];
  deniedOrigins?: readonly string[];
  allowedCapabilities?: readonly ProtocolCapability[];
  deniedCapabilities?: readonly ProtocolCapability[];
  allowedProviders?: readonly string[];
  deniedProviders?: readonly string[];
  allowedModels?: readonly string[];
  deniedModels?: readonly string[];
};

type MutablePolicyBundle = {
  schemaVersion: string;
  policyVersion: string;
  keyId: string;
  issuedAt: string;
  expiresAt?: string;
  rules: PolicyRuleSet;
  metadata?: Readonly<Record<string, string>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaError(
  message: string,
  options: Readonly<{
    code: PolicySchemaErrorCode;
    field?: string;
    details?: PolicySchemaErrorDetails;
    cause?: Error;
  }>,
): PolicySchemaError {
  return new PolicySchemaError(message, options);
}

function requireRecord(input: unknown, field: string): Record<string, unknown> {
  if (!isRecord(input)) {
    throw schemaError(`"${field}" must be an object.`, {
      code: POLICY_SCHEMA_ERROR_CODES.INVALID_INPUT,
      field,
    });
  }

  return input;
}

function requireString(
  input: Record<string, unknown>,
  field: string,
  options: Readonly<{
    code?: PolicySchemaErrorCode;
  }> = {},
): string {
  const value = input[field];
  if (typeof value !== "string") {
    throw schemaError(`"${field}" must be a string.`, {
      code: options.code ?? POLICY_SCHEMA_ERROR_CODES.MISSING_FIELD,
      field,
    });
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw schemaError(`"${field}" must not be empty.`, {
      code: options.code ?? POLICY_SCHEMA_ERROR_CODES.INVALID_FIELD,
      field,
    });
  }

  return normalized;
}

function optionalString(
  input: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = input[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw schemaError(`"${field}" must be a string when provided.`, {
      code: POLICY_SCHEMA_ERROR_CODES.INVALID_FIELD,
      field,
    });
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw schemaError(`"${field}" must not be empty when provided.`, {
      code: POLICY_SCHEMA_ERROR_CODES.INVALID_FIELD,
      field,
    });
  }

  return normalized;
}

function parseIsoTimestamp(value: string, field: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw schemaError(`"${field}" must be a valid ISO-8601 timestamp.`, {
      code: POLICY_SCHEMA_ERROR_CODES.INVALID_TIMESTAMP,
      field,
      details: { value },
    });
  }

  return parsed.toISOString();
}

function parseOrigin(value: string, field: string, index: number): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (cause) {
    const parsedCause = cause instanceof Error ? cause : undefined;
    throw schemaError(`"${field}[${index}]" must be a valid absolute URL origin.`, {
      code: POLICY_SCHEMA_ERROR_CODES.INVALID_ORIGIN,
      field,
      details: { index, value },
      ...(parsedCause !== undefined ? { cause: parsedCause } : {}),
    });
  }

  if (!ALLOWED_ORIGIN_SCHEMES.has(parsed.protocol)) {
    throw schemaError(`"${field}[${index}]" uses an unsupported URL scheme.`, {
      code: POLICY_SCHEMA_ERROR_CODES.INVALID_ORIGIN,
      field,
      details: { index, value, scheme: parsed.protocol },
    });
  }

  return parsed.origin;
}

function parseStringList(
  input: Record<string, unknown>,
  field: string,
  options: Readonly<{
    allowWildcard?: boolean;
    normalize?: (value: string, index: number) => string;
  }> = {},
): readonly string[] | undefined {
  const value = input[field];
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw schemaError(`"${field}" must be an array of strings.`, {
      code: POLICY_SCHEMA_ERROR_CODES.INVALID_FIELD,
      field,
    });
  }

  const uniqueValues = new Set<string>();
  value.forEach((entry, index) => {
    if (typeof entry !== "string") {
      throw schemaError(`"${field}[${index}]" must be a string.`, {
        code: POLICY_SCHEMA_ERROR_CODES.INVALID_FIELD,
        field,
        details: { index },
      });
    }

    const normalized = entry.trim();
    if (normalized.length === 0) {
      throw schemaError(`"${field}[${index}]" must not be empty.`, {
        code: POLICY_SCHEMA_ERROR_CODES.INVALID_FIELD,
        field,
        details: { index },
      });
    }

    if (normalized === "*" && options.allowWildcard === true) {
      uniqueValues.add("*");
      return;
    }

    uniqueValues.add(options.normalize ? options.normalize(normalized, index) : normalized);
  });

  return Object.freeze(Array.from(uniqueValues).sort((left, right) => left.localeCompare(right)));
}

function parseCapabilityList(
  input: Record<string, unknown>,
  field: string,
): readonly ProtocolCapability[] | undefined {
  const value = input[field];
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw schemaError(`"${field}" must be an array of capability identifiers.`, {
      code: POLICY_SCHEMA_ERROR_CODES.INVALID_FIELD,
      field,
    });
  }

  const uniqueValues = new Set<ProtocolCapability>();
  value.forEach((entry, index) => {
    if (typeof entry !== "string") {
      throw schemaError(`"${field}[${index}]" must be a capability string.`, {
        code: POLICY_SCHEMA_ERROR_CODES.INVALID_FIELD,
        field,
        details: { index },
      });
    }

    const normalized = entry.trim();
    if (!isProtocolCapability(normalized)) {
      throw schemaError(`"${field}[${index}]" is not a supported capability.`, {
        code: POLICY_SCHEMA_ERROR_CODES.UNSUPPORTED_CAPABILITY,
        field,
        details: { index, value: normalized },
      });
    }

    uniqueValues.add(normalized);
  });

  return Object.freeze(
    Array.from(uniqueValues).sort((left, right) => left.localeCompare(right)),
  );
}

function parseMetadata(
  input: Record<string, unknown>,
): Readonly<Record<string, string>> | undefined {
  const value = input.metadata;
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw schemaError(`"metadata" must be an object of string values when provided.`, {
      code: POLICY_SCHEMA_ERROR_CODES.INVALID_FIELD,
      field: "metadata",
    });
  }

  const normalized: Record<string, string> = {};
  for (const [metadataKey, metadataValue] of Object.entries(value)) {
    if (typeof metadataValue !== "string") {
      throw schemaError(`"metadata.${metadataKey}" must be a string.`, {
        code: POLICY_SCHEMA_ERROR_CODES.INVALID_FIELD,
        field: `metadata.${metadataKey}`,
      });
    }
    const trimmed = metadataValue.trim();
    if (trimmed.length === 0) {
      throw schemaError(`"metadata.${metadataKey}" must not be empty.`, {
        code: POLICY_SCHEMA_ERROR_CODES.INVALID_FIELD,
        field: `metadata.${metadataKey}`,
      });
    }
    normalized[metadataKey] = trimmed;
  }

  return Object.freeze(normalized);
}

function freezePolicyRuleSet(ruleSet: MutablePolicyRuleSet): PolicyRuleSet {
  return Object.freeze({
    ...(ruleSet.allowedOrigins !== undefined
      ? { allowedOrigins: Object.freeze([...ruleSet.allowedOrigins]) }
      : {}),
    ...(ruleSet.deniedOrigins !== undefined
      ? { deniedOrigins: Object.freeze([...ruleSet.deniedOrigins]) }
      : {}),
    ...(ruleSet.allowedCapabilities !== undefined
      ? { allowedCapabilities: Object.freeze([...ruleSet.allowedCapabilities]) }
      : {}),
    ...(ruleSet.deniedCapabilities !== undefined
      ? { deniedCapabilities: Object.freeze([...ruleSet.deniedCapabilities]) }
      : {}),
    ...(ruleSet.allowedProviders !== undefined
      ? { allowedProviders: Object.freeze([...ruleSet.allowedProviders]) }
      : {}),
    ...(ruleSet.deniedProviders !== undefined
      ? { deniedProviders: Object.freeze([...ruleSet.deniedProviders]) }
      : {}),
    ...(ruleSet.allowedModels !== undefined
      ? { allowedModels: Object.freeze([...ruleSet.allowedModels]) }
      : {}),
    ...(ruleSet.deniedModels !== undefined
      ? { deniedModels: Object.freeze([...ruleSet.deniedModels]) }
      : {}),
  });
}

function parseRuleSet(input: Record<string, unknown>): PolicyRuleSet {
  const rulesRecord = requireRecord(input.rules, "rules");

  const allowedOrigins = parseStringList(rulesRecord, "allowedOrigins", {
    allowWildcard: true,
    normalize: (value, index) => parseOrigin(value, "allowedOrigins", index),
  });
  const deniedOrigins = parseStringList(rulesRecord, "deniedOrigins", {
    allowWildcard: true,
    normalize: (value, index) => parseOrigin(value, "deniedOrigins", index),
  });
  const allowedCapabilities = parseCapabilityList(rulesRecord, "allowedCapabilities");
  const deniedCapabilities = parseCapabilityList(rulesRecord, "deniedCapabilities");
  const allowedProviders = parseStringList(rulesRecord, "allowedProviders", {
    allowWildcard: true,
  });
  const deniedProviders = parseStringList(rulesRecord, "deniedProviders", {
    allowWildcard: true,
  });
  const allowedModels = parseStringList(rulesRecord, "allowedModels", {
    allowWildcard: true,
  });
  const deniedModels = parseStringList(rulesRecord, "deniedModels", {
    allowWildcard: true,
  });

  const normalizedRuleSet: MutablePolicyRuleSet = {};
  if (allowedOrigins !== undefined) {
    normalizedRuleSet.allowedOrigins = allowedOrigins;
  }
  if (deniedOrigins !== undefined) {
    normalizedRuleSet.deniedOrigins = deniedOrigins;
  }
  if (allowedCapabilities !== undefined) {
    normalizedRuleSet.allowedCapabilities = allowedCapabilities;
  }
  if (deniedCapabilities !== undefined) {
    normalizedRuleSet.deniedCapabilities = deniedCapabilities;
  }
  if (allowedProviders !== undefined) {
    normalizedRuleSet.allowedProviders = allowedProviders;
  }
  if (deniedProviders !== undefined) {
    normalizedRuleSet.deniedProviders = deniedProviders;
  }
  if (allowedModels !== undefined) {
    normalizedRuleSet.allowedModels = allowedModels;
  }
  if (deniedModels !== undefined) {
    normalizedRuleSet.deniedModels = deniedModels;
  }

  return freezePolicyRuleSet(normalizedRuleSet);
}

function ensureBase64(value: string, field: string): string {
  if (value.length === 0 || value.length % 4 !== 0) {
    throw schemaError(`"${field}" must be a base64 string.`, {
      code: POLICY_SCHEMA_ERROR_CODES.INVALID_FIELD,
      field,
    });
  }

  let decoded: Buffer;
  try {
    decoded = Buffer.from(value, "base64");
  } catch (cause) {
    const parsedCause = cause instanceof Error ? cause : undefined;
    throw schemaError(`"${field}" must be valid base64.`, {
      code: POLICY_SCHEMA_ERROR_CODES.INVALID_FIELD,
      field,
      ...(parsedCause !== undefined ? { cause: parsedCause } : {}),
    });
  }

  if (decoded.length === 0 || decoded.toString("base64") !== value) {
    throw schemaError(`"${field}" must be valid base64.`, {
      code: POLICY_SCHEMA_ERROR_CODES.INVALID_FIELD,
      field,
    });
  }

  return value;
}

function parseSignature(input: Record<string, unknown>): PolicyBundleSignature {
  const signatureRecord = requireRecord(input.signature, "signature");

  const algorithm = requireString(signatureRecord, "algorithm");
  if (algorithm !== POLICY_SIGNATURE_ALGORITHM) {
    throw schemaError(`Unsupported signature algorithm "${algorithm}".`, {
      code: POLICY_SCHEMA_ERROR_CODES.UNSUPPORTED_SIGNATURE_ALGORITHM,
      field: "signature.algorithm",
      details: { algorithm },
    });
  }

  const keyId = requireString(signatureRecord, "keyId");
  const signedAt = parseIsoTimestamp(
    requireString(signatureRecord, "signedAt"),
    "signature.signedAt",
  );
  const digest = requireString(signatureRecord, "digest").toLowerCase();
  if (!SHA256_HEX_PATTERN.test(digest)) {
    throw schemaError(`"signature.digest" must be a lowercase sha256 hex digest.`, {
      code: POLICY_SCHEMA_ERROR_CODES.INVALID_FIELD,
      field: "signature.digest",
    });
  }

  const value = ensureBase64(requireString(signatureRecord, "value"), "signature.value");

  return Object.freeze({
    algorithm: POLICY_SIGNATURE_ALGORITHM,
    keyId,
    signedAt,
    digest,
    value,
  });
}

export function parsePolicyBundle(input: unknown): PolicyBundle {
  const record = requireRecord(input, "policyBundle");
  const schemaVersion = requireString(record, "schemaVersion");
  if (schemaVersion !== POLICY_BUNDLE_SCHEMA_VERSION) {
    throw schemaError(
      `Unsupported policy schema version "${schemaVersion}". Expected "${POLICY_BUNDLE_SCHEMA_VERSION}".`,
      {
        code: POLICY_SCHEMA_ERROR_CODES.UNSUPPORTED_SCHEMA_VERSION,
        field: "schemaVersion",
        details: {
          schemaVersion,
          expectedSchemaVersion: POLICY_BUNDLE_SCHEMA_VERSION,
        },
      },
    );
  }

  const policyVersion = requireString(record, "policyVersion");
  const keyId = requireString(record, "keyId");
  const issuedAt = parseIsoTimestamp(requireString(record, "issuedAt"), "issuedAt");
  const expiresAtRaw = optionalString(record, "expiresAt");
  const expiresAt = expiresAtRaw ? parseIsoTimestamp(expiresAtRaw, "expiresAt") : undefined;
  if (expiresAt !== undefined && new Date(expiresAt).getTime() <= new Date(issuedAt).getTime()) {
    throw schemaError(`"expiresAt" must be greater than "issuedAt".`, {
      code: POLICY_SCHEMA_ERROR_CODES.INVALID_TIMESTAMP,
      field: "expiresAt",
      details: {
        issuedAt,
        expiresAt,
      },
    });
  }

  const rules = parseRuleSet(record);
  const metadata = parseMetadata(record);

  const normalizedBundle: MutablePolicyBundle = {
    schemaVersion,
    policyVersion,
    keyId,
    issuedAt,
    rules,
  };
  if (expiresAt !== undefined) {
    normalizedBundle.expiresAt = expiresAt;
  }
  if (metadata !== undefined) {
    normalizedBundle.metadata = metadata;
  }

  return Object.freeze(normalizedBundle);
}

export function parseSignedPolicyBundle(input: unknown): SignedPolicyBundle {
  const record = requireRecord(input, "signedPolicyBundle");
  const payload = parsePolicyBundle(record.payload);
  const signature = parseSignature(record);

  if (signature.keyId !== payload.keyId) {
    throw schemaError(`"signature.keyId" must match "payload.keyId".`, {
      code: POLICY_SCHEMA_ERROR_CODES.INVALID_FIELD,
      field: "signature.keyId",
      details: {
        signatureKeyId: signature.keyId,
        payloadKeyId: payload.keyId,
      },
    });
  }

  return Object.freeze({
    payload,
    signature,
  });
}

export function safeParsePolicyBundle(input: unknown): SafeParseResult<PolicyBundle> {
  try {
    return { success: true, data: parsePolicyBundle(input) };
  } catch (error) {
    if (error instanceof PolicySchemaError) {
      return { success: false, error };
    }
    const parsedCause = error instanceof Error ? error : undefined;
    return {
      success: false,
      error: schemaError("Failed to parse policy bundle.", {
        code: POLICY_SCHEMA_ERROR_CODES.INVALID_INPUT,
        ...(parsedCause !== undefined ? { cause: parsedCause } : {}),
      }),
    };
  }
}

export function safeParseSignedPolicyBundle(
  input: unknown,
): SafeParseResult<SignedPolicyBundle> {
  try {
    return { success: true, data: parseSignedPolicyBundle(input) };
  } catch (error) {
    if (error instanceof PolicySchemaError) {
      return { success: false, error };
    }
    const parsedCause = error instanceof Error ? error : undefined;
    return {
      success: false,
      error: schemaError("Failed to parse signed policy bundle.", {
        code: POLICY_SCHEMA_ERROR_CODES.INVALID_INPUT,
        ...(parsedCause !== undefined ? { cause: parsedCause } : {}),
      }),
    };
  }
}

export function isPolicyBundle(input: unknown): input is PolicyBundle {
  return safeParsePolicyBundle(input).success;
}

export function isSignedPolicyBundle(input: unknown): input is SignedPolicyBundle {
  return safeParseSignedPolicyBundle(input).success;
}
