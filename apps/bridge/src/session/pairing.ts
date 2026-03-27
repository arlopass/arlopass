import {
  createECDH,
  createHmac,
  hkdfSync,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";

export const PAIRING_SESSION_ID_BYTE_LENGTH = 16;
export const PAIRING_HANDLE_ID_BYTE_LENGTH = 16;
export const PAIRING_SALT_BYTE_LENGTH = 16;
export const PAIRING_CODE_LENGTH = 8;
export const PAIRING_KEY_BYTE_LENGTH = 32;
export const PAIRING_DEFAULT_TTL_MS = 120_000;
export const PAIRING_DEFAULT_MAX_ATTEMPTS = 5;
export const PAIRING_DEFAULT_BACKOFF_BASE_MS = 500;
export const PAIRING_DEFAULT_PBKDF2_ITERATIONS = 120_000;
export const PAIRING_CURVE_NAME = "P-256";

const ECDH_CURVE_NAME = "prime256v1";
const PAIRING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type PairingReasonCode =
  | "request.invalid"
  | "auth.invalid"
  | "auth.expired"
  | "auth.throttled";

export class PairingError extends Error {
  readonly reasonCode: PairingReasonCode;
  readonly details: Readonly<Record<string, string | number | boolean>> | undefined;

  constructor(
    message: string,
    reasonCode: PairingReasonCode,
    details?: Readonly<Record<string, string | number | boolean>>,
  ) {
    super(message);
    this.name = "PairingError";
    this.reasonCode = reasonCode;
    this.details = details;
  }
}

export type PairingManagerOptions = Readonly<{
  now?: () => Date;
  generateBytes?: (length: number) => Buffer;
  codeTtlMs?: number;
  maxAttempts?: number;
  backoffBaseMs?: number;
  pbkdf2Iterations?: number;
  stateFilePath?: string;
}>;

export type BeginPairingInput = Readonly<{
  extensionId: string;
  hostName: string;
  supersedesPairingHandle?: string;
}>;

export type BeginPairingResult = Readonly<{
  pairingSessionId: string;
  extensionId: string;
  hostName: string;
  curve: "P-256";
  bridgePublicKey: string;
  salt: string;
  iterations: number;
  codeLength: number;
  maxAttempts: number;
  backoffBaseMs: number;
  ttlMs: number;
  createdAt: string;
  expiresAt: string;
  supersedesPairingHandle?: string;
  oneTimeCode: string;
}>;

export type CompletePairingInput = Readonly<{
  pairingSessionId: string;
  extensionId: string;
  hostName: string;
  extensionPublicKey: string;
  proof: string;
}>;

export type CompletePairingResult = Readonly<{
  pairingHandle: string;
  extensionId: string;
  hostName: string;
  createdAt: string;
  rotatedFromPairingHandle?: string;
}>;

export type CreateAutoPairingInput = Readonly<{
  extensionId: string;
  hostName: string;
}>;

export type CreateAutoPairingResult = Readonly<{
  pairingHandle: string;
  pairingKeyHex: string;
  extensionId: string;
  hostName: string;
  createdAt: string;
}>;

export type RevokePairingInput = Readonly<{
  pairingHandle: string;
  extensionId?: string;
  hostName?: string;
}>;

export type RotatePairingInput = Readonly<{
  pairingHandle: string;
  extensionId: string;
  hostName: string;
}>;

export type PairingRecordDescriptor = Readonly<{
  pairingHandle: string;
  extensionId: string;
  hostName: string;
  createdAt: string;
  rotatedFromPairingHandle?: string;
}>;

type PendingPairingSession = Readonly<{
  pairingSessionId: string;
  extensionId: string;
  hostName: string;
  bridgePublicKey: string;
  bridgePrivateKey: string;
  salt: string;
  iterations: number;
  codeKey: Buffer;
  createdAtMs: number;
  expiresAtMs: number;
  attemptCount: number;
  nextAllowedAtMs: number;
  supersedesPairingHandle?: string;
}>;

type PairingRecord = Readonly<{
  pairingHandle: string;
  extensionId: string;
  hostName: string;
  pairingKey: Buffer;
  createdAtMs: number;
  rotatedFromPairingHandle?: string;
}>;

type PersistedPendingPairingSession = Readonly<{
  pairingSessionId: string;
  extensionId: string;
  hostName: string;
  bridgePublicKey: string;
  bridgePrivateKey: string;
  salt: string;
  iterations: number;
  codeKeyHex: string;
  createdAtMs: number;
  expiresAtMs: number;
  attemptCount: number;
  nextAllowedAtMs: number;
  supersedesPairingHandle?: string;
}>;

type PersistedPairingRecord = Readonly<{
  pairingHandle: string;
  extensionId: string;
  hostName: string;
  pairingKeyHex: string;
  createdAtMs: number;
  rotatedFromPairingHandle?: string;
}>;

type PersistedPairingState = Readonly<{
  version: 1;
  pendingBySessionId: readonly PersistedPendingPairingSession[];
  recordsByHandle: readonly PersistedPairingRecord[];
}>;

function isHex(value: string): boolean {
  return /^[0-9a-f]+$/i.test(value);
}

function normalizeNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new PairingError(`Pairing requires non-empty "${field}".`, "request.invalid");
  }
  return normalized;
}

function normalizePairingCode(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (
    normalized.length !== PAIRING_CODE_LENGTH ||
    !new RegExp(`^[${PAIRING_CODE_ALPHABET}]{${String(PAIRING_CODE_LENGTH)}}$`).test(normalized)
  ) {
    throw new PairingError(
      `Pairing code must be ${String(PAIRING_CODE_LENGTH)} characters from [${PAIRING_CODE_ALPHABET}].`,
      "request.invalid",
    );
  }
  return normalized;
}

function normalizePublicKeyHex(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  if (!isHex(normalized) || normalized.length !== 130 || !normalized.startsWith("04")) {
    throw new PairingError(
      `Pairing "${field}" must be an uncompressed P-256 public key hex string.`,
      "request.invalid",
    );
  }
  return normalized;
}

function normalizeProofHex(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!isHex(normalized) || normalized.length !== 64) {
    throw new PairingError("Pairing proof must be a 64-char hex HMAC.", "request.invalid");
  }
  return normalized;
}

function encodeIso(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

function toKeyDerivationTranscript(input: Readonly<{
  pairingSessionId: string;
  extensionId: string;
  hostName: string;
  bridgePublicKey: string;
  extensionPublicKey: string;
}>): string {
  return [
    "byom.bridge.pairing.v1",
    input.pairingSessionId,
    input.extensionId,
    input.hostName,
    input.bridgePublicKey.toLowerCase(),
    input.extensionPublicKey.toLowerCase(),
  ].join("|");
}

function toPairingCode(bytes: Buffer): string {
  let code = "";
  for (let index = 0; index < PAIRING_CODE_LENGTH; index += 1) {
    const sourceByte = bytes[index] ?? 0;
    code += PAIRING_CODE_ALPHABET.charAt(sourceByte % PAIRING_CODE_ALPHABET.length);
  }
  return code;
}

function cloneBuffer(value: Buffer): Buffer {
  return Buffer.from(value);
}

function verifyProof(expectedHex: string, receivedHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(receivedHex, "hex");
  if (expected.length !== received.length) {
    return false;
  }
  return timingSafeEqual(expected, received);
}

function derivePairingKey(input: Readonly<{
  sharedSecret: Buffer;
  codeKey: Buffer;
  transcript: string;
}>): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      input.sharedSecret,
      input.codeKey,
      Buffer.from(input.transcript, "utf8"),
      PAIRING_KEY_BYTE_LENGTH,
    ),
  );
}

function deriveCodeKey(input: Readonly<{
  code: string;
  saltHex: string;
  iterations: number;
}>): Buffer {
  return pbkdf2Sync(
    Buffer.from(input.code, "utf8"),
    Buffer.from(input.saltHex, "hex"),
    input.iterations,
    PAIRING_KEY_BYTE_LENGTH,
    "sha256",
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPersistedPendingPairingSession(
  value: unknown,
): value is PersistedPendingPairingSession {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (
    !isNonEmptyString(candidate["pairingSessionId"]) ||
    !isNonEmptyString(candidate["extensionId"]) ||
    !isNonEmptyString(candidate["hostName"]) ||
    !isNonEmptyString(candidate["bridgePublicKey"]) ||
    !isNonEmptyString(candidate["bridgePrivateKey"]) ||
    !isNonEmptyString(candidate["salt"]) ||
    !isFiniteNumber(candidate["iterations"]) ||
    !isNonEmptyString(candidate["codeKeyHex"]) ||
    !isFiniteNumber(candidate["createdAtMs"]) ||
    !isFiniteNumber(candidate["expiresAtMs"]) ||
    !isFiniteNumber(candidate["attemptCount"]) ||
    !isFiniteNumber(candidate["nextAllowedAtMs"])
  ) {
    return false;
  }
  if (!isHex(candidate["codeKeyHex"])) {
    return false;
  }
  if (
    candidate["supersedesPairingHandle"] !== undefined &&
    !isNonEmptyString(candidate["supersedesPairingHandle"])
  ) {
    return false;
  }
  return true;
}

function isPersistedPairingRecord(value: unknown): value is PersistedPairingRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (
    !isNonEmptyString(candidate["pairingHandle"]) ||
    !isNonEmptyString(candidate["extensionId"]) ||
    !isNonEmptyString(candidate["hostName"]) ||
    !isNonEmptyString(candidate["pairingKeyHex"]) ||
    !isFiniteNumber(candidate["createdAtMs"])
  ) {
    return false;
  }
  if (!isHex(candidate["pairingKeyHex"])) {
    return false;
  }
  if (
    candidate["rotatedFromPairingHandle"] !== undefined &&
    !isNonEmptyString(candidate["rotatedFromPairingHandle"])
  ) {
    return false;
  }
  return true;
}

function toPersistedPendingPairingSession(
  pending: PendingPairingSession,
): PersistedPendingPairingSession {
  return {
    pairingSessionId: pending.pairingSessionId,
    extensionId: pending.extensionId,
    hostName: pending.hostName,
    bridgePublicKey: pending.bridgePublicKey,
    bridgePrivateKey: pending.bridgePrivateKey,
    salt: pending.salt,
    iterations: pending.iterations,
    codeKeyHex: pending.codeKey.toString("hex"),
    createdAtMs: pending.createdAtMs,
    expiresAtMs: pending.expiresAtMs,
    attemptCount: pending.attemptCount,
    nextAllowedAtMs: pending.nextAllowedAtMs,
    ...(pending.supersedesPairingHandle !== undefined
      ? { supersedesPairingHandle: pending.supersedesPairingHandle }
      : {}),
  };
}

function fromPersistedPendingPairingSession(
  pending: PersistedPendingPairingSession,
): PendingPairingSession {
  return {
    pairingSessionId: pending.pairingSessionId,
    extensionId: pending.extensionId,
    hostName: pending.hostName,
    bridgePublicKey: pending.bridgePublicKey,
    bridgePrivateKey: pending.bridgePrivateKey,
    salt: pending.salt,
    iterations: pending.iterations,
    codeKey: Buffer.from(pending.codeKeyHex, "hex"),
    createdAtMs: pending.createdAtMs,
    expiresAtMs: pending.expiresAtMs,
    attemptCount: pending.attemptCount,
    nextAllowedAtMs: pending.nextAllowedAtMs,
    ...(pending.supersedesPairingHandle !== undefined
      ? { supersedesPairingHandle: pending.supersedesPairingHandle }
      : {}),
  };
}

function toPersistedPairingRecord(record: PairingRecord): PersistedPairingRecord {
  return {
    pairingHandle: record.pairingHandle,
    extensionId: record.extensionId,
    hostName: record.hostName,
    pairingKeyHex: record.pairingKey.toString("hex"),
    createdAtMs: record.createdAtMs,
    ...(record.rotatedFromPairingHandle !== undefined
      ? { rotatedFromPairingHandle: record.rotatedFromPairingHandle }
      : {}),
  };
}

function fromPersistedPairingRecord(record: PersistedPairingRecord): PairingRecord {
  return {
    pairingHandle: record.pairingHandle,
    extensionId: record.extensionId,
    hostName: record.hostName,
    pairingKey: Buffer.from(record.pairingKeyHex, "hex"),
    createdAtMs: record.createdAtMs,
    ...(record.rotatedFromPairingHandle !== undefined
      ? { rotatedFromPairingHandle: record.rotatedFromPairingHandle }
      : {}),
  };
}

export class PairingManager {
  readonly #now: () => Date;
  readonly #generateBytes: (length: number) => Buffer;
  readonly #codeTtlMs: number;
  readonly #maxAttempts: number;
  readonly #backoffBaseMs: number;
  readonly #pbkdf2Iterations: number;
  readonly #stateFilePath: string | undefined;
  readonly #pendingBySessionId = new Map<string, PendingPairingSession>();
  readonly #recordsByHandle = new Map<string, PairingRecord>();

  constructor(options: PairingManagerOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#generateBytes = options.generateBytes ?? ((length) => randomBytes(length));
    this.#codeTtlMs = options.codeTtlMs ?? PAIRING_DEFAULT_TTL_MS;
    this.#maxAttempts = options.maxAttempts ?? PAIRING_DEFAULT_MAX_ATTEMPTS;
    this.#backoffBaseMs = options.backoffBaseMs ?? PAIRING_DEFAULT_BACKOFF_BASE_MS;
    this.#pbkdf2Iterations = options.pbkdf2Iterations ?? PAIRING_DEFAULT_PBKDF2_ITERATIONS;
    this.#stateFilePath = isNonEmptyString(options.stateFilePath)
      ? options.stateFilePath.trim()
      : undefined;
    this.#loadStateFromDisk();
    this.#cleanupExpired();
    this.#persistState();
  }

  beginPairing(input: BeginPairingInput): BeginPairingResult {
    this.#cleanupExpired();

    const extensionId = normalizeNonEmpty(input.extensionId, "extensionId");
    const hostName = normalizeNonEmpty(input.hostName, "hostName");
    const nowMs = this.#now().getTime();
    const pairingSessionId = this.#generateBytes(PAIRING_SESSION_ID_BYTE_LENGTH).toString("hex");
    const oneTimeCode = toPairingCode(this.#generateBytes(PAIRING_CODE_LENGTH));
    const salt = this.#generateBytes(PAIRING_SALT_BYTE_LENGTH).toString("hex");
    const codeKey = deriveCodeKey({
      code: normalizePairingCode(oneTimeCode),
      saltHex: salt,
      iterations: this.#pbkdf2Iterations,
    });

    const ecdh = createECDH(ECDH_CURVE_NAME);
    const bridgePublicKey = ecdh.generateKeys("hex", "uncompressed");
    const bridgePrivateKey = ecdh.getPrivateKey("hex");

    const expiresAtMs = nowMs + this.#codeTtlMs;
    const pending: PendingPairingSession = {
      pairingSessionId,
      extensionId,
      hostName,
      bridgePublicKey: bridgePublicKey.toLowerCase(),
      bridgePrivateKey: bridgePrivateKey.toLowerCase(),
      salt: salt.toLowerCase(),
      iterations: this.#pbkdf2Iterations,
      codeKey,
      createdAtMs: nowMs,
      expiresAtMs,
      attemptCount: 0,
      nextAllowedAtMs: nowMs,
      ...(input.supersedesPairingHandle !== undefined
        ? { supersedesPairingHandle: input.supersedesPairingHandle }
        : {}),
    };
    this.#pendingBySessionId.set(pairingSessionId, pending);
    this.#persistState();

    return {
      pairingSessionId,
      extensionId,
      hostName,
      curve: PAIRING_CURVE_NAME,
      bridgePublicKey: pending.bridgePublicKey,
      salt: pending.salt,
      iterations: pending.iterations,
      codeLength: PAIRING_CODE_LENGTH,
      maxAttempts: this.#maxAttempts,
      backoffBaseMs: this.#backoffBaseMs,
      ttlMs: this.#codeTtlMs,
      createdAt: encodeIso(nowMs),
      expiresAt: encodeIso(expiresAtMs),
      ...(pending.supersedesPairingHandle !== undefined
        ? { supersedesPairingHandle: pending.supersedesPairingHandle }
        : {}),
      oneTimeCode,
    };
  }

  completePairing(input: CompletePairingInput): CompletePairingResult {
    this.#cleanupExpired();

    const pairingSessionId = normalizeNonEmpty(input.pairingSessionId, "pairingSessionId");
    const extensionId = normalizeNonEmpty(input.extensionId, "extensionId");
    const hostName = normalizeNonEmpty(input.hostName, "hostName");
    const extensionPublicKey = normalizePublicKeyHex(input.extensionPublicKey, "extensionPublicKey");
    const proof = normalizeProofHex(input.proof);

    const pending = this.#pendingBySessionId.get(pairingSessionId);
    if (pending === undefined) {
      throw new PairingError("Pairing session is missing or expired.", "auth.invalid");
    }

    const nowMs = this.#now().getTime();
    if (pending.expiresAtMs <= nowMs) {
      this.#pendingBySessionId.delete(pairingSessionId);
      throw new PairingError("Pairing session expired.", "auth.expired");
    }
    if (pending.nextAllowedAtMs > nowMs) {
      throw new PairingError("Pairing attempt throttled.", "auth.throttled", {
        retryAfterMs: pending.nextAllowedAtMs - nowMs,
      });
    }
    if (pending.extensionId !== extensionId || pending.hostName !== hostName) {
      throw new PairingError("Pairing binding mismatch for extension or host.", "auth.invalid");
    }

    const transcript = toKeyDerivationTranscript({
      pairingSessionId,
      extensionId,
      hostName,
      bridgePublicKey: pending.bridgePublicKey,
      extensionPublicKey,
    });
    const expectedProof = createHmac("sha256", pending.codeKey)
      .update(transcript, "utf8")
      .digest("hex");

    if (!verifyProof(expectedProof, proof)) {
      const attemptCount = pending.attemptCount + 1;
      if (attemptCount >= this.#maxAttempts) {
        this.#pendingBySessionId.delete(pairingSessionId);
        this.#persistState();
        throw new PairingError("Pairing verification failed: maximum attempts exceeded.", "auth.invalid", {
          attemptCount,
          maxAttempts: this.#maxAttempts,
        });
      }

      const retryAfterMs = this.#backoffBaseMs * 2 ** (attemptCount - 1);
      this.#pendingBySessionId.set(pairingSessionId, {
        ...pending,
        attemptCount,
        nextAllowedAtMs: nowMs + retryAfterMs,
      });
      this.#persistState();
      throw new PairingError("Pairing verification failed.", "auth.invalid", {
        attemptCount,
        remainingAttempts: this.#maxAttempts - attemptCount,
        retryAfterMs,
      });
    }

    const ecdh = createECDH(ECDH_CURVE_NAME);
    ecdh.setPrivateKey(Buffer.from(pending.bridgePrivateKey, "hex"));
    const sharedSecret = ecdh.computeSecret(Buffer.from(extensionPublicKey, "hex"));
    const pairingKey = derivePairingKey({
      sharedSecret,
      codeKey: pending.codeKey,
      transcript,
    });

    const pairingHandle = `pairh.${this.#generateBytes(PAIRING_HANDLE_ID_BYTE_LENGTH).toString("hex")}`;
    const record: PairingRecord = {
      pairingHandle,
      extensionId,
      hostName,
      pairingKey,
      createdAtMs: nowMs,
      ...(pending.supersedesPairingHandle !== undefined
        ? { rotatedFromPairingHandle: pending.supersedesPairingHandle }
        : {}),
    };

    if (
      pending.supersedesPairingHandle !== undefined &&
      this.#recordsByHandle.has(pending.supersedesPairingHandle)
    ) {
      this.#recordsByHandle.delete(pending.supersedesPairingHandle);
    }

    this.#recordsByHandle.set(pairingHandle, record);
    this.#pendingBySessionId.delete(pairingSessionId);
    this.#persistState();

    return {
      pairingHandle,
      extensionId,
      hostName,
      createdAt: encodeIso(nowMs),
      ...(record.rotatedFromPairingHandle !== undefined
        ? { rotatedFromPairingHandle: record.rotatedFromPairingHandle }
        : {}),
    };
  }

  listPairings(filter: Readonly<{ extensionId?: string; hostName?: string }> = {}): readonly PairingRecordDescriptor[] {
    this.#cleanupExpired();
    return [...this.#recordsByHandle.values()]
      .filter(
        (record) =>
          (filter.extensionId === undefined || record.extensionId === filter.extensionId) &&
          (filter.hostName === undefined || record.hostName === filter.hostName),
      )
      .map((record) => ({
        pairingHandle: record.pairingHandle,
        extensionId: record.extensionId,
        hostName: record.hostName,
        createdAt: encodeIso(record.createdAtMs),
        ...(record.rotatedFromPairingHandle !== undefined
          ? { rotatedFromPairingHandle: record.rotatedFromPairingHandle }
          : {}),
      }));
  }

  revokePairing(input: RevokePairingInput): boolean {
    const pairingHandle = normalizeNonEmpty(input.pairingHandle, "pairingHandle");
    const record = this.#recordsByHandle.get(pairingHandle);
    if (record === undefined) {
      return false;
    }

    if (input.extensionId !== undefined && normalizeNonEmpty(input.extensionId, "extensionId") !== record.extensionId) {
      return false;
    }
    if (input.hostName !== undefined && normalizeNonEmpty(input.hostName, "hostName") !== record.hostName) {
      return false;
    }

    const revoked = this.#recordsByHandle.delete(pairingHandle);
    if (revoked) {
      this.#persistState();
    }
    return revoked;
  }

  rotatePairing(input: RotatePairingInput): BeginPairingResult {
    const pairingHandle = normalizeNonEmpty(input.pairingHandle, "pairingHandle");
    const record = this.#recordsByHandle.get(pairingHandle);
    if (record === undefined) {
      throw new PairingError("Pairing handle is missing or revoked.", "auth.invalid");
    }

    const extensionId = normalizeNonEmpty(input.extensionId, "extensionId");
    const hostName = normalizeNonEmpty(input.hostName, "hostName");
    if (record.extensionId !== extensionId || record.hostName !== hostName) {
      throw new PairingError("Pairing rotate binding mismatch.", "auth.invalid");
    }

    return this.beginPairing({
      extensionId,
      hostName,
      supersedesPairingHandle: pairingHandle,
    });
  }

  createAutoPairing(input: CreateAutoPairingInput): CreateAutoPairingResult {
    const extensionId = normalizeNonEmpty(input.extensionId, "extensionId");
    const hostName = normalizeNonEmpty(input.hostName, "hostName");

    // Check if this extensionId + hostName already has an active pairing
    for (const record of this.#recordsByHandle.values()) {
      if (record.extensionId === extensionId && record.hostName === hostName) {
        // Verify the record is still resolvable before returning it
        const resolved = this.resolvePairingSecret({
          pairingHandle: record.pairingHandle,
          extensionId,
          hostName,
        });
        if (resolved !== undefined) {
          return {
            pairingHandle: record.pairingHandle,
            pairingKeyHex: record.pairingKey.toString("hex"),
            extensionId: record.extensionId,
            hostName: record.hostName,
            createdAt: encodeIso(record.createdAtMs),
          };
        }
      }
    }

    // Generate random 32-byte secret
    const pairingSecret = this.#generateBytes(PAIRING_KEY_BYTE_LENGTH);
    const pairingKeyHex = pairingSecret.toString("hex");

    // Generate pairing handle
    const handleBytes = this.#generateBytes(PAIRING_HANDLE_ID_BYTE_LENGTH);
    const pairingHandle = `pairh.${handleBytes.toString("hex")}`;

    // Register the pairing in the same structure completePairing uses
    const nowMs = this.#now().getTime();
    const record: PairingRecord = {
      pairingHandle,
      extensionId,
      hostName,
      pairingKey: pairingSecret,
      createdAtMs: nowMs,
    };
    this.#recordsByHandle.set(pairingHandle, record);
    this.#persistState();

    const createdAt = encodeIso(nowMs);
    return { pairingHandle, pairingKeyHex, extensionId, hostName, createdAt };
  }

  resolvePairingSecret(input: Readonly<{
    pairingHandle: string;
    extensionId: string;
    hostName: string;
  }>): Buffer | undefined {
    const pairingHandle = normalizeNonEmpty(input.pairingHandle, "pairingHandle");
    const extensionId = normalizeNonEmpty(input.extensionId, "extensionId");
    const hostName = normalizeNonEmpty(input.hostName, "hostName");
    const record = this.#recordsByHandle.get(pairingHandle);
    if (record === undefined) {
      return undefined;
    }
    if (record.extensionId !== extensionId || record.hostName !== hostName) {
      return undefined;
    }
    return cloneBuffer(record.pairingKey);
  }

  #cleanupExpired(): void {
    const nowMs = this.#now().getTime();
    let changed = false;
    for (const [sessionId, pending] of this.#pendingBySessionId) {
      if (pending.expiresAtMs <= nowMs) {
        this.#pendingBySessionId.delete(sessionId);
        changed = true;
      }
    }
    if (changed) {
      this.#persistState();
    }
  }

  #loadStateFromDisk(): void {
    if (this.#stateFilePath === undefined) {
      return;
    }
    if (!existsSync(this.#stateFilePath)) {
      return;
    }

    try {
      const raw = readFileSync(this.#stateFilePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return;
      }
      const state = parsed as Record<string, unknown>;
      if (state["version"] !== 1) {
        return;
      }
      const pendingEntries = Array.isArray(state["pendingBySessionId"])
        ? state["pendingBySessionId"]
        : [];
      const recordEntries = Array.isArray(state["recordsByHandle"])
        ? state["recordsByHandle"]
        : [];

      for (const entry of pendingEntries) {
        if (!isPersistedPendingPairingSession(entry)) {
          continue;
        }
        this.#pendingBySessionId.set(
          entry.pairingSessionId,
          fromPersistedPendingPairingSession(entry),
        );
      }
      for (const entry of recordEntries) {
        if (!isPersistedPairingRecord(entry)) {
          continue;
        }
        this.#recordsByHandle.set(
          entry.pairingHandle,
          fromPersistedPairingRecord(entry),
        );
      }
    } catch {
      // Fail closed to in-memory state only when persisted state is unreadable.
    }
  }

  #persistState(): void {
    if (this.#stateFilePath === undefined) {
      return;
    }
    const state: PersistedPairingState = {
      version: 1,
      pendingBySessionId: [...this.#pendingBySessionId.values()].map(
        toPersistedPendingPairingSession,
      ),
      recordsByHandle: [...this.#recordsByHandle.values()].map(
        toPersistedPairingRecord,
      ),
    };

    try {
      const directoryPath = dirname(this.#stateFilePath);
      mkdirSync(directoryPath, { recursive: true });
      const tempPath = `${this.#stateFilePath}.tmp`;
      writeFileSync(tempPath, JSON.stringify(state), { encoding: "utf8" });
      renameSync(tempPath, this.#stateFilePath);
    } catch {
      // Persist failure should not break live pairing flow.
    }
  }
}

