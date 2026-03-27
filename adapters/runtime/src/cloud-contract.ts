import { type ProtocolCapability } from "@arlopass/protocol";

import {
  ManifestValidationError,
  RUNTIME_ERROR_CODES,
  type RuntimeErrorDetails,
} from "./errors.js";
import { type AdapterContract } from "./adapter-loader.js";

const CONNECTION_METHOD_TOKEN_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const CLOUD_ADAPTER_V2_METHODS = [
  "listConnectionMethods",
  "beginConnect",
  "completeConnect",
  "validateCredentialRef",
  "revokeCredentialRef",
  "discoverModels",
  "discoverCapabilities",
] as const;

export type ConnectionMethodDescriptor = Readonly<{
  id: string;
  authFlow: string;
  [key: string]: unknown;
}>;

export type BeginConnectInput = Readonly<{
  providerId: string;
  methodId: string;
  input?: Readonly<Record<string, unknown>>;
  correlationId?: string;
}>;

export type BeginConnectResult = Readonly<Record<string, unknown>>;

export type CompleteConnectInput = Readonly<{
  providerId: string;
  methodId: string;
  state?: string;
  input?: Readonly<Record<string, unknown>>;
  correlationId?: string;
}>;

export type CompleteConnectResult = Readonly<Record<string, unknown>>;

export type ValidateCredentialRefInput = Readonly<{
  providerId: string;
  methodId: string;
  credentialRef: string;
  endpointProfile?: Readonly<Record<string, unknown>>;
  correlationId?: string;
}>;

export type ValidationResult = Readonly<{
  ok: boolean;
  retryable?: boolean;
  reason?: string;
  details?: Readonly<Record<string, unknown>>;
}>;

export type RevokeCredentialRefInput = Readonly<{
  providerId: string;
  methodId: string;
  credentialRef: string;
  reason?: string;
  correlationId?: string;
}>;

export type ModelDescriptor = Readonly<{
  id: string;
  displayName?: string;
  [key: string]: unknown;
}>;

export type CapabilityDescriptor = Readonly<{
  capabilities: readonly ProtocolCapability[];
  [key: string]: unknown;
}>;

export type CloudConnectionContext = Readonly<{
  providerId: string;
  methodId: string;
  endpointProfile: Readonly<Record<string, unknown>>;
  credentialRef: string;
  connectionInput?: Readonly<Record<string, unknown>>;
  connectionHandle?: string;
  correlationId: string;
}>;

export type SendMessageOptions = Readonly<{
  timeoutMs?: number;
  signal?: AbortSignal;
}>;

export interface CloudAdapterContractV2 extends AdapterContract {
  listConnectionMethods(): readonly ConnectionMethodDescriptor[];
  beginConnect(input: BeginConnectInput): Promise<BeginConnectResult>;
  completeConnect(input: CompleteConnectInput): Promise<CompleteConnectResult>;
  validateCredentialRef(input: ValidateCredentialRefInput): Promise<ValidationResult>;
  revokeCredentialRef(input: RevokeCredentialRefInput): Promise<void>;
  discoverModels(ctx: CloudConnectionContext): Promise<readonly ModelDescriptor[]>;
  discoverCapabilities(ctx: CloudConnectionContext): Promise<CapabilityDescriptor>;
  sendMessage(
    sessionId: string,
    message: string,
    options?: SendMessageOptions,
  ): Promise<string>;
}

export type CloudAdapterContractV2ValidationSuccess = Readonly<{
  ok: true;
  contract: CloudAdapterContractV2;
  connectionMethods: readonly ConnectionMethodDescriptor[];
}>;

export type CloudAdapterContractV2ValidationFailure = Readonly<{
  ok: false;
  message: string;
  details?: RuntimeErrorDetails;
  cause?: Error;
}>;

export type CloudAdapterContractV2ValidationResult =
  | CloudAdapterContractV2ValidationSuccess
  | CloudAdapterContractV2ValidationFailure;

function manifestError(
  message: string,
  options: Readonly<{
    field?: string;
    details?: RuntimeErrorDetails;
    code?: (typeof RUNTIME_ERROR_CODES)[keyof typeof RUNTIME_ERROR_CODES];
  }> = {},
): ManifestValidationError {
  return new ManifestValidationError(message, {
    code: options.code ?? RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD,
    ...(options.field !== undefined ? { field: options.field } : {}),
    ...(options.details !== undefined ? { details: options.details } : {}),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function requireNonEmptyToken(
  record: Record<string, unknown>,
  field: "id" | "authFlow",
  containerField: string,
): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw manifestError(`"${containerField}.${field}" must be a string.`, {
      field: containerField,
    });
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw manifestError(`"${containerField}.${field}" must not be empty.`, {
      field: containerField,
    });
  }

  if (!CONNECTION_METHOD_TOKEN_PATTERN.test(trimmed)) {
    throw manifestError(
      `"${containerField}.${field}" must use lowercase tokens joined by ".", "_" or "-".`,
      {
        field: containerField,
      },
    );
  }

  return trimmed;
}

function hasFunction(candidate: unknown, field: string): boolean {
  if (!isRecord(candidate)) return false;
  return typeof candidate[field] === "function";
}

function isAdapterContractLike(candidate: unknown): candidate is AdapterContract {
  if (!isRecord(candidate)) return false;

  return (
    candidate["manifest"] !== undefined &&
    hasFunction(candidate, "describeCapabilities") &&
    hasFunction(candidate, "listModels") &&
    hasFunction(candidate, "createSession") &&
    hasFunction(candidate, "sendMessage") &&
    hasFunction(candidate, "streamMessage") &&
    hasFunction(candidate, "healthCheck") &&
    hasFunction(candidate, "shutdown")
  );
}

export function parseConnectionMethodDescriptor(
  input: unknown,
  options: Readonly<{ field?: string }> = {},
): ConnectionMethodDescriptor {
  const field = options.field ?? "connectionMethod";
  if (!isRecord(input)) {
    throw manifestError(`"${field}" must be an object.`, {
      field,
    });
  }

  const id = requireNonEmptyToken(input, "id", field);
  const authFlow = requireNonEmptyToken(input, "authFlow", field);

  return Object.freeze({
    ...input,
    id,
    authFlow,
  });
}

export function parseConnectionMethods(
  input: unknown,
  options: Readonly<{ field?: string }> = {},
): readonly ConnectionMethodDescriptor[] {
  const field = options.field ?? "connectionMethods";
  if (!Array.isArray(input)) {
    throw manifestError(`"${field}" must be an array.`, {
      field,
    });
  }

  const seenIds = new Map<string, number>();
  const normalized: ConnectionMethodDescriptor[] = [];
  for (const [index, descriptor] of input.entries()) {
    const parsed = parseConnectionMethodDescriptor(descriptor, {
      field: `${field}[${index}]`,
    });
    const firstIndex = seenIds.get(parsed.id);
    if (firstIndex !== undefined) {
      throw manifestError(
        `"${field}[${index}].id" duplicates connection method id "${parsed.id}" first declared at index ${firstIndex}.`,
        {
          field,
          details: { index, id: parsed.id, firstIndex },
        },
      );
    }
    seenIds.set(parsed.id, index);
    normalized.push(parsed);
  }
  return Object.freeze(normalized);
}

export function isConnectionMethodDescriptor(input: unknown): input is ConnectionMethodDescriptor {
  try {
    parseConnectionMethodDescriptor(input);
    return true;
  } catch {
    return false;
  }
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
    const pairs = keys
      .filter((key) => {
        const candidate = record[key];
        return (
          candidate !== undefined &&
          typeof candidate !== "function" &&
          typeof candidate !== "symbol"
        );
      })
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJsonValue(record[key])}`);
    return `{${pairs.join(",")}}`;
  }
  return "null";
}

function compareConnectionMethods(
  expected: readonly ConnectionMethodDescriptor[],
  actual: readonly ConnectionMethodDescriptor[],
): Readonly<{ message: string; details: RuntimeErrorDetails }> | undefined {
  const expectedMap = new Map(
    expected.map((descriptor) => [descriptor.id, canonicalizeJsonValue(descriptor)]),
  );
  const actualMap = new Map(
    actual.map((descriptor) => [descriptor.id, canonicalizeJsonValue(descriptor)]),
  );

  const missingIds = [...expectedMap.keys()].filter((id) => !actualMap.has(id));
  const unexpectedIds = [...actualMap.keys()].filter((id) => !expectedMap.has(id));
  const mismatchedIds = [...expectedMap.keys()].filter(
    (id) => actualMap.has(id) && expectedMap.get(id) !== actualMap.get(id),
  );

  if (missingIds.length === 0 && unexpectedIds.length === 0 && mismatchedIds.length === 0) {
    return undefined;
  }

  const reasons: string[] = [];
  if (missingIds.length > 0) reasons.push(`missing ids: ${missingIds.join(", ")}`);
  if (unexpectedIds.length > 0) reasons.push(`unexpected ids: ${unexpectedIds.join(", ")}`);
  if (mismatchedIds.length > 0) reasons.push(`descriptor mismatch ids: ${mismatchedIds.join(", ")}`);

  return {
    message: reasons.join("; "),
    details: {
      expectedCount: expectedMap.size,
      actualCount: actualMap.size,
      ...(missingIds.length > 0 ? { missingMethodIds: missingIds.join(",") } : {}),
      ...(unexpectedIds.length > 0 ? { unexpectedMethodIds: unexpectedIds.join(",") } : {}),
      ...(mismatchedIds.length > 0 ? { mismatchedMethodIds: mismatchedIds.join(",") } : {}),
    },
  };
}

export function validateCloudAdapterContractV2Strict(
  candidate: unknown,
  options: Readonly<{
    expectedConnectionMethods?: readonly ConnectionMethodDescriptor[];
  }> = {},
): CloudAdapterContractV2ValidationResult {
  if (!isAdapterContractLike(candidate)) {
    return {
      ok: false,
      message: `does not satisfy the base AdapterContract interface.`,
      details: { requiredContract: "AdapterContract" },
    };
  }

  const missingMethods = CLOUD_ADAPTER_V2_METHODS.filter((method) => !hasFunction(candidate, method));
  if (missingMethods.length > 0) {
    return {
      ok: false,
      message: `is missing CloudAdapterContractV2 method(s): ${missingMethods.join(", ")}.`,
      details: { missingMethods: missingMethods.join(",") },
    };
  }

  const contract = candidate as CloudAdapterContractV2;

  let listedMethodsRaw: unknown;
  try {
    listedMethodsRaw = contract.listConnectionMethods();
  } catch (error) {
    const cause = normalizeError(error);
    return {
      ok: false,
      message: `listConnectionMethods() threw: ${cause.message}`,
      cause,
    };
  }

  let listedMethods: readonly ConnectionMethodDescriptor[];
  try {
    listedMethods = parseConnectionMethods(listedMethodsRaw, {
      field: "contract.listConnectionMethods()",
    });
  } catch (error) {
    const cause = normalizeError(error);
    return {
      ok: false,
      message: `listConnectionMethods() returned invalid descriptors: ${cause.message}`,
      cause,
    };
  }

  if (options.expectedConnectionMethods !== undefined) {
    const diff = compareConnectionMethods(options.expectedConnectionMethods, listedMethods);
    if (diff !== undefined) {
      return {
        ok: false,
        message: `manifest "connectionMethods" and contract "listConnectionMethods()" differ: ${diff.message}`,
        details: diff.details,
      };
    }
  }

  return {
    ok: true,
    contract,
    connectionMethods: listedMethods,
  };
}

export function isCloudAdapterContractV2(candidate: unknown): candidate is CloudAdapterContractV2 {
  if (!isAdapterContractLike(candidate)) return false;

  return (
    hasFunction(candidate, "listConnectionMethods") &&
    hasFunction(candidate, "beginConnect") &&
    hasFunction(candidate, "completeConnect") &&
    hasFunction(candidate, "validateCredentialRef") &&
    hasFunction(candidate, "revokeCredentialRef") &&
    hasFunction(candidate, "discoverModels") &&
    hasFunction(candidate, "discoverCapabilities")
  );
}
