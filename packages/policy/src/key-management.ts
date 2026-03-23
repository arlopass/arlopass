import { type PolicyKeyResolver } from "./signature.js";

export const POLICY_KEY_STATUS = {
  ACTIVE: "active",
  ROTATED: "rotated",
  REVOKED: "revoked",
} as const;

export type PolicyKeyStatus = (typeof POLICY_KEY_STATUS)[keyof typeof POLICY_KEY_STATUS];

export const POLICY_KEY_MANAGEMENT_ERROR_CODES = {
  KEY_ALREADY_EXISTS: "POLICY_KEY_ALREADY_EXISTS",
  KEY_NOT_FOUND: "POLICY_KEY_NOT_FOUND",
  KEY_NOT_ACTIVE: "POLICY_KEY_NOT_ACTIVE",
  KEY_ALREADY_REVOKED: "POLICY_KEY_ALREADY_REVOKED",
  INVALID_PUBLIC_KEY: "POLICY_KEY_INVALID_PUBLIC_KEY",
  INVALID_INPUT: "POLICY_KEY_INVALID_INPUT",
  LIFECYCLE_HOOK_FAILED: "POLICY_KEY_LIFECYCLE_HOOK_FAILED",
} as const;

export type PolicyKeyManagementErrorCode =
  (typeof POLICY_KEY_MANAGEMENT_ERROR_CODES)[keyof typeof POLICY_KEY_MANAGEMENT_ERROR_CODES];

export type PolicyKeyManagementErrorDetails = Readonly<
  Record<string, string | number | boolean | null>
>;

export class PolicyKeyManagementError extends Error {
  readonly code: PolicyKeyManagementErrorCode;
  readonly keyId: string | undefined;
  readonly details: PolicyKeyManagementErrorDetails | undefined;

  constructor(
    message: string,
    options: Readonly<{
      code: PolicyKeyManagementErrorCode;
      keyId?: string;
      details?: PolicyKeyManagementErrorDetails;
      cause?: Error;
    }>,
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "PolicyKeyManagementError";
    this.code = options.code;
    this.keyId = options.keyId;
    this.details = options.details;
  }
}

export type PolicyKeyRecord = Readonly<{
  keyId: string;
  publicKeyPem: string;
  status: PolicyKeyStatus;
  createdAt: string;
  rotatedAt?: string;
  revokedAt?: string;
  replacementKeyId?: string;
  revocationReason?: string;
  metadata?: Readonly<Record<string, string>>;
}>;

export type PolicyKeyCreateInput = Readonly<{
  keyId: string;
  publicKeyPem: string;
  createdAt?: Date | string;
  metadata?: Readonly<Record<string, string>>;
}>;

export type PolicyKeyRotateInput = Readonly<{
  nextKeyId: string;
  nextPublicKeyPem: string;
  rotatedAt?: Date | string;
  metadata?: Readonly<Record<string, string>>;
}>;

export type PolicyKeyRevokeInput = Readonly<{
  revokedAt?: Date | string;
  reason?: string;
}>;

export type PolicyKeyResolveOptions = Readonly<{
  includeRotated?: boolean;
  includeRevoked?: boolean;
}>;

export type PolicyKeyLifecycleHooks = Readonly<{
  onCreate?: (event: Readonly<{ current: PolicyKeyRecord }>) => void;
  onRotate?: (event: Readonly<{ previous: PolicyKeyRecord; current: PolicyKeyRecord }>) => void;
  onRevoke?: (event: Readonly<{ previous: PolicyKeyRecord; current: PolicyKeyRecord }>) => void;
}>;

export type PolicyKeyManagerOptions = Readonly<{
  hooks?: PolicyKeyLifecycleHooks;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function managementError(
  message: string,
  options: Readonly<{
    code: PolicyKeyManagementErrorCode;
    keyId?: string;
    details?: PolicyKeyManagementErrorDetails;
    cause?: Error;
  }>,
): PolicyKeyManagementError {
  return new PolicyKeyManagementError(message, options);
}

function normalizeKeyId(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw managementError(`"${fieldName}" must not be empty.`, {
      code: POLICY_KEY_MANAGEMENT_ERROR_CODES.INVALID_INPUT,
      details: { field: fieldName },
    });
  }

  return normalized;
}

function normalizeIsoTimestamp(input: Date | string | undefined, fieldName: string): string {
  if (input === undefined) {
    return new Date().toISOString();
  }

  const parsed = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw managementError(`"${fieldName}" must be a valid date or ISO timestamp.`, {
      code: POLICY_KEY_MANAGEMENT_ERROR_CODES.INVALID_INPUT,
      details: { field: fieldName },
    });
  }

  return parsed.toISOString();
}

function normalizePublicKeyPem(value: string): string {
  const normalized = value.trim();
  if (
    !normalized.startsWith("-----BEGIN PUBLIC KEY-----") ||
    !normalized.endsWith("-----END PUBLIC KEY-----")
  ) {
    throw managementError("Public key must be a PEM-formatted public key.", {
      code: POLICY_KEY_MANAGEMENT_ERROR_CODES.INVALID_PUBLIC_KEY,
    });
  }

  return normalized;
}

function normalizeMetadata(
  metadata: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  if (!isRecord(metadata)) {
    throw managementError("metadata must be an object of string values when provided.", {
      code: POLICY_KEY_MANAGEMENT_ERROR_CODES.INVALID_INPUT,
      details: { field: "metadata" },
    });
  }

  const normalized: Record<string, string> = {};
  for (const [entryKey, entryValue] of Object.entries(metadata)) {
    if (typeof entryValue !== "string") {
      throw managementError(`metadata.${entryKey} must be a string.`, {
        code: POLICY_KEY_MANAGEMENT_ERROR_CODES.INVALID_INPUT,
        details: { field: `metadata.${entryKey}` },
      });
    }
    const trimmed = entryValue.trim();
    if (trimmed.length === 0) {
      throw managementError(`metadata.${entryKey} must not be empty.`, {
        code: POLICY_KEY_MANAGEMENT_ERROR_CODES.INVALID_INPUT,
        details: { field: `metadata.${entryKey}` },
      });
    }
    normalized[entryKey] = trimmed;
  }

  return Object.freeze(normalized);
}

function freezeKeyRecord(record: PolicyKeyRecord): PolicyKeyRecord {
  return Object.freeze({
    keyId: record.keyId,
    publicKeyPem: record.publicKeyPem,
    status: record.status,
    createdAt: record.createdAt,
    ...(record.rotatedAt !== undefined ? { rotatedAt: record.rotatedAt } : {}),
    ...(record.revokedAt !== undefined ? { revokedAt: record.revokedAt } : {}),
    ...(record.replacementKeyId !== undefined
      ? { replacementKeyId: record.replacementKeyId }
      : {}),
    ...(record.revocationReason !== undefined ? { revocationReason: record.revocationReason } : {}),
    ...(record.metadata !== undefined ? { metadata: record.metadata } : {}),
  });
}

export class InMemoryPolicyKeyManager implements PolicyKeyResolver {
  readonly #keys = new Map<string, PolicyKeyRecord>();
  readonly #hooks: PolicyKeyLifecycleHooks;

  constructor(options: PolicyKeyManagerOptions = {}) {
    this.#hooks = options.hooks ?? {};
  }

  createKey(input: PolicyKeyCreateInput): PolicyKeyRecord {
    const keyId = normalizeKeyId(input.keyId, "keyId");
    if (this.#keys.has(keyId)) {
      throw managementError(`A key with id "${keyId}" already exists.`, {
        code: POLICY_KEY_MANAGEMENT_ERROR_CODES.KEY_ALREADY_EXISTS,
        keyId,
      });
    }

    const metadata = normalizeMetadata(input.metadata);
    const record = freezeKeyRecord({
      keyId,
      publicKeyPem: normalizePublicKeyPem(input.publicKeyPem),
      status: POLICY_KEY_STATUS.ACTIVE,
      createdAt: normalizeIsoTimestamp(input.createdAt, "createdAt"),
      ...(metadata !== undefined ? { metadata } : {}),
    });

    this.#invokeCreateHook({ current: record }, keyId);
    this.#keys.set(keyId, record);
    return record;
  }

  rotateKey(
    keyIdInput: string,
    input: PolicyKeyRotateInput,
  ): Readonly<{ previous: PolicyKeyRecord; current: PolicyKeyRecord }> {
    const keyId = normalizeKeyId(keyIdInput, "keyId");
    const current = this.#requireKey(keyId);
    if (current.status !== POLICY_KEY_STATUS.ACTIVE) {
      throw managementError(`Only active keys can be rotated. "${keyId}" is ${current.status}.`, {
        code: POLICY_KEY_MANAGEMENT_ERROR_CODES.KEY_NOT_ACTIVE,
        keyId,
        details: { status: current.status },
      });
    }

    const nextKeyId = normalizeKeyId(input.nextKeyId, "nextKeyId");
    if (nextKeyId === keyId) {
      throw managementError("A key cannot rotate to itself.", {
        code: POLICY_KEY_MANAGEMENT_ERROR_CODES.INVALID_INPUT,
        keyId,
        details: {
          keyId,
          nextKeyId,
        },
      });
    }
    if (this.#keys.has(nextKeyId)) {
      throw managementError(`A key with id "${nextKeyId}" already exists.`, {
        code: POLICY_KEY_MANAGEMENT_ERROR_CODES.KEY_ALREADY_EXISTS,
        keyId: nextKeyId,
      });
    }

    const rotatedAt = normalizeIsoTimestamp(input.rotatedAt, "rotatedAt");
    const rotatedRecord = freezeKeyRecord({
      ...current,
      status: POLICY_KEY_STATUS.ROTATED,
      rotatedAt,
      replacementKeyId: nextKeyId,
    });
    const metadata = normalizeMetadata(input.metadata);
    const nextRecord = freezeKeyRecord({
      keyId: nextKeyId,
      publicKeyPem: normalizePublicKeyPem(input.nextPublicKeyPem),
      status: POLICY_KEY_STATUS.ACTIVE,
      createdAt: rotatedAt,
      ...(metadata !== undefined ? { metadata } : {}),
    });

    this.#invokeRotateHook(
      {
        previous: rotatedRecord,
        current: nextRecord,
      },
      keyId,
    );

    this.#keys.set(keyId, rotatedRecord);
    this.#keys.set(nextKeyId, nextRecord);

    return Object.freeze({
      previous: rotatedRecord,
      current: nextRecord,
    });
  }

  revokeKey(keyIdInput: string, input: PolicyKeyRevokeInput = {}): PolicyKeyRecord {
    const keyId = normalizeKeyId(keyIdInput, "keyId");
    const current = this.#requireKey(keyId);
    if (current.status === POLICY_KEY_STATUS.REVOKED) {
      throw managementError(`Key "${keyId}" has already been revoked.`, {
        code: POLICY_KEY_MANAGEMENT_ERROR_CODES.KEY_ALREADY_REVOKED,
        keyId,
      });
    }

    const revocationReason =
      typeof input.reason === "string" && input.reason.trim().length > 0
        ? input.reason.trim()
        : undefined;
    const revokedRecord = freezeKeyRecord({
      ...current,
      status: POLICY_KEY_STATUS.REVOKED,
      revokedAt: normalizeIsoTimestamp(input.revokedAt, "revokedAt"),
      ...(revocationReason !== undefined ? { revocationReason } : {}),
    });

    this.#invokeRevokeHook(
      {
        previous: current,
        current: revokedRecord,
      },
      keyId,
    );

    this.#keys.set(keyId, revokedRecord);
    return revokedRecord;
  }

  getKey(keyIdInput: string): PolicyKeyRecord | undefined {
    const keyId = normalizeKeyId(keyIdInput, "keyId");
    return this.#keys.get(keyId);
  }

  listKeys(): readonly PolicyKeyRecord[] {
    return Object.freeze(
      Array.from(this.#keys.values()).sort((left, right) => left.keyId.localeCompare(right.keyId)),
    );
  }

  resolvePublicKey(keyIdInput: string, options: PolicyKeyResolveOptions = {}): string | undefined {
    const keyId = normalizeKeyId(keyIdInput, "keyId");
    const record = this.#keys.get(keyId);
    if (record === undefined) {
      return undefined;
    }

    if (record.status === POLICY_KEY_STATUS.ACTIVE) {
      return record.publicKeyPem;
    }
    if (record.status === POLICY_KEY_STATUS.ROTATED && options.includeRotated === true) {
      return record.publicKeyPem;
    }
    if (record.status === POLICY_KEY_STATUS.REVOKED && options.includeRevoked === true) {
      return record.publicKeyPem;
    }

    return undefined;
  }

  assertActiveKey(keyIdInput: string): PolicyKeyRecord {
    const keyId = normalizeKeyId(keyIdInput, "keyId");
    const key = this.#requireKey(keyId);
    if (key.status !== POLICY_KEY_STATUS.ACTIVE) {
      throw managementError(`Key "${keyId}" is not active.`, {
        code: POLICY_KEY_MANAGEMENT_ERROR_CODES.KEY_NOT_ACTIVE,
        keyId,
        details: { status: key.status },
      });
    }
    return key;
  }

  #requireKey(keyId: string): PolicyKeyRecord {
    const key = this.#keys.get(keyId);
    if (key === undefined) {
      throw managementError(`No key exists with id "${keyId}".`, {
        code: POLICY_KEY_MANAGEMENT_ERROR_CODES.KEY_NOT_FOUND,
        keyId,
      });
    }
    return key;
  }

  #invokeCreateHook(event: Readonly<{ current: PolicyKeyRecord }>, keyId: string): void {
    const hook = this.#hooks.onCreate;
    if (hook === undefined) {
      return;
    }
    try {
      hook(event);
    } catch (cause) {
      const parsedCause = cause instanceof Error ? cause : undefined;
      throw managementError(`Policy key lifecycle hook "onCreate" failed.`, {
        code: POLICY_KEY_MANAGEMENT_ERROR_CODES.LIFECYCLE_HOOK_FAILED,
        keyId,
        details: { hookName: "onCreate" },
        ...(parsedCause !== undefined ? { cause: parsedCause } : {}),
      });
    }
  }

  #invokeRotateHook(
    event: Readonly<{ previous: PolicyKeyRecord; current: PolicyKeyRecord }>,
    keyId: string,
  ): void {
    const hook = this.#hooks.onRotate;
    if (hook === undefined) {
      return;
    }
    try {
      hook(event);
    } catch (cause) {
      const parsedCause = cause instanceof Error ? cause : undefined;
      throw managementError(`Policy key lifecycle hook "onRotate" failed.`, {
        code: POLICY_KEY_MANAGEMENT_ERROR_CODES.LIFECYCLE_HOOK_FAILED,
        keyId,
        details: { hookName: "onRotate" },
        ...(parsedCause !== undefined ? { cause: parsedCause } : {}),
      });
    }
  }

  #invokeRevokeHook(
    event: Readonly<{ previous: PolicyKeyRecord; current: PolicyKeyRecord }>,
    keyId: string,
  ): void {
    const hook = this.#hooks.onRevoke;
    if (hook === undefined) {
      return;
    }
    try {
      hook(event);
    } catch (cause) {
      const parsedCause = cause instanceof Error ? cause : undefined;
      throw managementError(`Policy key lifecycle hook "onRevoke" failed.`, {
        code: POLICY_KEY_MANAGEMENT_ERROR_CODES.LIFECYCLE_HOOK_FAILED,
        keyId,
        details: { hookName: "onRevoke" },
        ...(parsedCause !== undefined ? { cause: parsedCause } : {}),
      });
    }
  }
}
