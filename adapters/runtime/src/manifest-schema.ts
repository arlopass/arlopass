import { isProtocolCapability, type ProtocolCapability } from "@byom-ai/protocol";

import {
  ManifestValidationError,
  RUNTIME_ERROR_CODES,
  type RuntimeErrorDetails,
} from "./errors.js";

export const MANIFEST_SCHEMA_VERSION = "1.0.0";

export const ADAPTER_AUTH_TYPES = {
  NONE: "none",
  API_KEY: "api_key",
  OAUTH2: "oauth2",
  LOCAL: "local",
} as const;

export type AdapterAuthType = (typeof ADAPTER_AUTH_TYPES)[keyof typeof ADAPTER_AUTH_TYPES];

const AUTH_TYPE_SET: ReadonlySet<string> = new Set(Object.values(ADAPTER_AUTH_TYPES));

export function isAdapterAuthType(value: string): value is AdapterAuthType {
  return AUTH_TYPE_SET.has(value);
}

export const ADAPTER_RISK_LEVELS = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

export type AdapterRiskLevel = (typeof ADAPTER_RISK_LEVELS)[keyof typeof ADAPTER_RISK_LEVELS];

const RISK_LEVEL_SET: ReadonlySet<string> = new Set(Object.values(ADAPTER_RISK_LEVELS));

export function isAdapterRiskLevel(value: string): value is AdapterRiskLevel {
  return RISK_LEVEL_SET.has(value);
}

export type AdapterEgressRule = Readonly<{
  host: string;
  port?: number;
  protocol: "https" | "http" | "tcp";
}>;

export type AdapterManifest = Readonly<{
  schemaVersion: string;
  providerId: string;
  version: string;
  displayName: string;
  authType: AdapterAuthType;
  capabilities: readonly ProtocolCapability[];
  requiredPermissions: readonly string[];
  egressRules: readonly AdapterEgressRule[];
  riskLevel: AdapterRiskLevel;
  signingKeyId: string;
  metadata?: Readonly<Record<string, string>>;
}>;

export type SafeParseSuccess<T> = Readonly<{ success: true; data: T }>;
export type SafeParseFailure = Readonly<{ success: false; error: ManifestValidationError }>;
export type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function manifestError(
  message: string,
  options: Readonly<{
    code: (typeof RUNTIME_ERROR_CODES)[keyof typeof RUNTIME_ERROR_CODES];
    field?: string;
    details?: RuntimeErrorDetails;
    cause?: Error;
  }>,
): ManifestValidationError {
  return new ManifestValidationError(message, options);
}

function requireRecord(input: unknown, field: string): Record<string, unknown> {
  if (!isRecord(input)) {
    throw manifestError(`"${field}" must be an object.`, {
      code: RUNTIME_ERROR_CODES.MANIFEST_INVALID_INPUT,
      field,
    });
  }
  return input;
}

function requireString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string") {
    throw manifestError(`"${field}" must be a string.`, {
      code: RUNTIME_ERROR_CODES.MANIFEST_MISSING_FIELD,
      field,
    });
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw manifestError(`"${field}" must not be empty.`, {
      code: RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD,
      field,
    });
  }
  return normalized;
}

function parseCapabilityList(
  input: Record<string, unknown>,
  field: string,
): readonly ProtocolCapability[] {
  const value = input[field];
  if (!Array.isArray(value)) {
    throw manifestError(`"${field}" must be an array.`, {
      code: RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD,
      field,
    });
  }
  if (value.length === 0) {
    throw manifestError(`"${field}" must contain at least one capability.`, {
      code: RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD,
      field,
    });
  }
  const seen = new Set<ProtocolCapability>();
  value.forEach((entry, index) => {
    if (typeof entry !== "string") {
      throw manifestError(`"${field}[${index}]" must be a string.`, {
        code: RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD,
        field,
        details: { index },
      });
    }
    const normalized = entry.trim();
    if (!isProtocolCapability(normalized)) {
      throw manifestError(`"${field}[${index}]" is not a supported capability: "${normalized}".`, {
        code: RUNTIME_ERROR_CODES.MANIFEST_UNSUPPORTED_CAPABILITY,
        field,
        details: { index, value: normalized },
      });
    }
    seen.add(normalized);
  });
  return Object.freeze(Array.from(seen).sort((a, b) => a.localeCompare(b)));
}

function parsePermissionList(
  input: Record<string, unknown>,
  field: string,
): readonly string[] {
  const value = input[field];
  if (!Array.isArray(value)) {
    throw manifestError(`"${field}" must be an array.`, {
      code: RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD,
      field,
    });
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    if (typeof entry !== "string") {
      throw manifestError(`"${field}[${index}]" must be a string.`, {
        code: RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD,
        field,
        details: { index },
      });
    }
    const normalized = entry.trim();
    if (normalized.length === 0) {
      throw manifestError(`"${field}[${index}]" must not be empty.`, {
        code: RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD,
        field,
        details: { index },
      });
    }
    seen.add(normalized);
  });
  return Object.freeze(Array.from(seen).sort((a, b) => a.localeCompare(b)));
}

const EGRESS_PROTOCOLS = new Set(["https", "http", "tcp"]);
const HOST_PATTERN =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$|^\*$/;

function parseEgressRules(
  input: Record<string, unknown>,
  field: string,
): readonly AdapterEgressRule[] {
  const value = input[field];
  if (!Array.isArray(value)) {
    throw manifestError(`"${field}" must be an array.`, {
      code: RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD,
      field,
    });
  }
  return Object.freeze(
    value.map((entry, index) => {
      if (!isRecord(entry)) {
        throw manifestError(`"${field}[${index}]" must be an object.`, {
          code: RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD,
          field,
          details: { index },
        });
      }
      const host = (entry["host"] as string | undefined)?.trim() ?? "";
      if (!host || !HOST_PATTERN.test(host)) {
        throw manifestError(
          `"${field}[${index}].host" must be a valid hostname or wildcard "*".`,
          {
            code: RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD,
            field,
            details: { index, host },
          },
        );
      }
      const protocol = (entry["protocol"] as string | undefined)?.trim() ?? "";
      if (!EGRESS_PROTOCOLS.has(protocol)) {
        throw manifestError(
          `"${field}[${index}].protocol" must be one of: https, http, tcp.`,
          {
            code: RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD,
            field,
            details: { index, protocol },
          },
        );
      }
      const portRaw = entry["port"];
      let port: number | undefined;
      if (portRaw !== undefined) {
        if (typeof portRaw !== "number" || !Number.isInteger(portRaw) || portRaw < 1 || portRaw > 65535) {
          throw manifestError(
            `"${field}[${index}].port" must be an integer between 1 and 65535.`,
            {
              code: RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD,
              field,
              details: { index },
            },
          );
        }
        port = portRaw;
      }
      return Object.freeze({
        host,
        protocol: protocol as "https" | "http" | "tcp",
        ...(port !== undefined ? { port } : {}),
      });
    }),
  );
}

function parseMetadata(
  input: Record<string, unknown>,
): Readonly<Record<string, string>> | undefined {
  const value = input["metadata"];
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw manifestError(`"metadata" must be an object of string values when provided.`, {
      code: RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD,
      field: "metadata",
    });
  }
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== "string") {
      throw manifestError(`"metadata.${k}" must be a string.`, {
        code: RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD,
        field: `metadata.${k}`,
      });
    }
    const trimmed = v.trim();
    if (trimmed.length === 0) {
      throw manifestError(`"metadata.${k}" must not be empty.`, {
        code: RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD,
        field: `metadata.${k}`,
      });
    }
    normalized[k] = trimmed;
  }
  return Object.freeze(normalized);
}

export function parseAdapterManifest(input: unknown): AdapterManifest {
  const record = requireRecord(input, "adapterManifest");

  const schemaVersion = requireString(record, "schemaVersion");
  if (schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw manifestError(
      `Unsupported adapter manifest schema version "${schemaVersion}". Expected "${MANIFEST_SCHEMA_VERSION}".`,
      {
        code: RUNTIME_ERROR_CODES.MANIFEST_UNSUPPORTED_SCHEMA_VERSION,
        field: "schemaVersion",
        details: { schemaVersion, expectedSchemaVersion: MANIFEST_SCHEMA_VERSION },
      },
    );
  }

  const providerId = requireString(record, "providerId");
  const version = requireString(record, "version");
  const displayName = requireString(record, "displayName");

  const authTypeRaw = requireString(record, "authType");
  if (!isAdapterAuthType(authTypeRaw)) {
    throw manifestError(
      `"authType" must be one of: ${Object.values(ADAPTER_AUTH_TYPES).join(", ")}.`,
      {
        code: RUNTIME_ERROR_CODES.MANIFEST_UNSUPPORTED_AUTH_TYPE,
        field: "authType",
        details: { authType: authTypeRaw },
      },
    );
  }

  const capabilities = parseCapabilityList(record, "capabilities");
  const requiredPermissions = parsePermissionList(record, "requiredPermissions");
  const egressRules = parseEgressRules(record, "egressRules");

  const riskLevelRaw = requireString(record, "riskLevel");
  if (!isAdapterRiskLevel(riskLevelRaw)) {
    throw manifestError(
      `"riskLevel" must be one of: ${Object.values(ADAPTER_RISK_LEVELS).join(", ")}.`,
      {
        code: RUNTIME_ERROR_CODES.MANIFEST_UNSUPPORTED_RISK_LEVEL,
        field: "riskLevel",
        details: { riskLevel: riskLevelRaw },
      },
    );
  }

  const signingKeyId = requireString(record, "signingKeyId");
  const metadata = parseMetadata(record);

  return Object.freeze({
    schemaVersion,
    providerId,
    version,
    displayName,
    authType: authTypeRaw,
    capabilities,
    requiredPermissions,
    egressRules,
    riskLevel: riskLevelRaw,
    signingKeyId,
    ...(metadata !== undefined ? { metadata } : {}),
  });
}

export function safeParseAdapterManifest(input: unknown): SafeParseResult<AdapterManifest> {
  try {
    return { success: true, data: parseAdapterManifest(input) };
  } catch (error) {
    if (error instanceof ManifestValidationError) {
      return { success: false, error };
    }
    const cause = error instanceof Error ? error : undefined;
    return {
      success: false,
      error: new ManifestValidationError("Failed to parse adapter manifest.", {
        code: RUNTIME_ERROR_CODES.MANIFEST_INVALID_INPUT,
        ...(cause !== undefined ? { cause } : {}),
      }),
    };
  }
}

export function isAdapterManifest(input: unknown): input is AdapterManifest {
  return safeParseAdapterManifest(input).success;
}
