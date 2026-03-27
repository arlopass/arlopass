const TEXT_ENCODER = new TextEncoder();

export const BRIDGE_PAIRING_STATE_STORAGE_KEY = "arlopass.wallet.bridgePairing.v1";
export const BRIDGE_PAIRING_WRAP_VERSION = 1 as const;
export const BRIDGE_PAIRING_WRAP_PBKDF2_ITERATIONS = 150_000;
export const BRIDGE_PAIRING_WRAP_SALT_BYTE_LENGTH = 16;
export const BRIDGE_PAIRING_WRAP_IV_BYTE_LENGTH = 12;

export type BridgePairingState = Readonly<{
  version: 1;
  pairingHandle: string;
  extensionId: string;
  hostName: string;
  wrappedPairingKey: string;
  wrapSalt: string;
  wrapIv: string;
  wrapIterations: number;
  createdAt: string;
  rotatedFromPairingHandle?: string;
}>;

export type PairingBeginPayload = Readonly<{
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
  oneTimeCode?: string;
  codeRetrievalHint?: string;
  supersedesPairingHandle?: string;
}>;

export type PairingCompletionData = Readonly<{
  extensionPublicKey: string;
  proof: string;
  pairingKeyHex: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHex(value: string): boolean {
  return /^[0-9a-f]+$/i.test(value);
}

function normalizeNonEmptyText(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`Bridge pairing requires non-empty "${field}".`);
  }
  return normalized;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function toBufferSource(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function hexToBytes(hexValue: string, field: string): Uint8Array {
  const normalized = hexValue.trim().toLowerCase();
  if (
    normalized.length === 0 ||
    normalized.length % 2 !== 0 ||
    !isHex(normalized)
  ) {
    throw new Error(`Bridge pairing "${field}" must be valid hex.`);
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
}

function toPairingTranscript(input: Readonly<{
  pairingSessionId: string;
  extensionId: string;
  hostName: string;
  bridgePublicKey: string;
  extensionPublicKey: string;
}>): string {
  return [
    "arlopass.bridge.pairing.v1",
    input.pairingSessionId,
    input.extensionId,
    input.hostName,
    input.bridgePublicKey.toLowerCase(),
    input.extensionPublicKey.toLowerCase(),
  ].join("|");
}

function toWrapAdditionalData(input: Readonly<{
  pairingHandle: string;
  extensionId: string;
  hostName: string;
}>): Uint8Array {
  return TEXT_ENCODER.encode(
    `arlopass.bridge.wrap.v1|${input.pairingHandle}|${input.extensionId}|${input.hostName}`,
  );
}

async function requireSubtleCrypto(): Promise<SubtleCrypto> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    throw new Error("Web Crypto API is unavailable for bridge pairing.");
  }
  return subtle;
}

async function deriveCodeKeyBytes(input: Readonly<{
  pairingCode: string;
  saltBytes: Uint8Array;
  iterations: number;
}>): Promise<Uint8Array> {
  const subtle = await requireSubtleCrypto();
  const codeMaterial = await subtle.importKey(
    "raw",
    TEXT_ENCODER.encode(input.pairingCode),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const codeBits = await subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toBufferSource(input.saltBytes),
      iterations: input.iterations,
    },
    codeMaterial,
    256,
  );
  return new Uint8Array(codeBits);
}

async function computeProofHex(input: Readonly<{
  codeKey: Uint8Array;
  transcript: string;
}>): Promise<string> {
  const subtle = await requireSubtleCrypto();
  const hmacKey = await subtle.importKey(
    "raw",
    toBufferSource(input.codeKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await subtle.sign(
    "HMAC",
    hmacKey,
    TEXT_ENCODER.encode(input.transcript),
  );
  return bytesToHex(new Uint8Array(signature));
}

async function derivePairingKeyHex(input: Readonly<{
  sharedSecretBits: Uint8Array;
  codeKey: Uint8Array;
  transcript: string;
}>): Promise<string> {
  const subtle = await requireSubtleCrypto();
  const ikmKey = await subtle.importKey(
    "raw",
    toBufferSource(input.sharedSecretBits),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const derivedBits = await subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toBufferSource(input.codeKey),
      info: TEXT_ENCODER.encode(input.transcript),
    },
    ikmKey,
    256,
  );
  return bytesToHex(new Uint8Array(derivedBits));
}

async function deriveWrapKey(input: Readonly<{
  runtimeId: string;
  salt: Uint8Array;
  iterations: number;
}>): Promise<CryptoKey> {
  const subtle = await requireSubtleCrypto();
  const material = await subtle.importKey(
    "raw",
    TEXT_ENCODER.encode(`arlopass.bridge.wrap.v1|${input.runtimeId}`),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toBufferSource(input.salt),
      iterations: input.iterations,
    },
    material,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

export function parsePairingBeginPayload(payload: unknown): PairingBeginPayload {
  if (!isRecord(payload)) {
    throw new Error("Pairing begin payload is not an object.");
  }

  const pairingSessionId = normalizeNonEmptyText(
    String(payload["pairingSessionId"] ?? ""),
    "pairingSessionId",
  );
  const extensionId = normalizeNonEmptyText(String(payload["extensionId"] ?? ""), "extensionId");
  const hostName = normalizeNonEmptyText(String(payload["hostName"] ?? ""), "hostName");
  const curve = String(payload["curve"] ?? "");
  if (curve !== "P-256") {
    throw new Error('Pairing begin payload "curve" must be "P-256".');
  }
  const bridgePublicKey = normalizeNonEmptyText(
    String(payload["bridgePublicKey"] ?? ""),
    "bridgePublicKey",
  ).toLowerCase();
  if (!isHex(bridgePublicKey) || bridgePublicKey.length !== 130 || !bridgePublicKey.startsWith("04")) {
    throw new Error("Pairing begin bridgePublicKey is invalid.");
  }
  const salt = normalizeNonEmptyText(String(payload["salt"] ?? ""), "salt").toLowerCase();
  if (!isHex(salt) || salt.length !== 32) {
    throw new Error("Pairing begin salt is invalid.");
  }

  const iterations = Number(payload["iterations"]);
  const codeLength = Number(payload["codeLength"]);
  const maxAttempts = Number(payload["maxAttempts"]);
  const backoffBaseMs = Number(payload["backoffBaseMs"]);
  const ttlMs = Number(payload["ttlMs"]);
  if (
    !Number.isFinite(iterations) ||
    iterations < 10_000 ||
    !Number.isFinite(codeLength) ||
    codeLength < 6 ||
    !Number.isFinite(maxAttempts) ||
    maxAttempts < 1 ||
    !Number.isFinite(backoffBaseMs) ||
    backoffBaseMs < 0 ||
    !Number.isFinite(ttlMs) ||
    ttlMs < 10_000
  ) {
    throw new Error("Pairing begin payload numeric fields are invalid.");
  }

  const createdAt = normalizeNonEmptyText(String(payload["createdAt"] ?? ""), "createdAt");
  const expiresAt = normalizeNonEmptyText(String(payload["expiresAt"] ?? ""), "expiresAt");
  return {
    pairingSessionId,
    extensionId,
    hostName,
    curve: "P-256",
    bridgePublicKey,
    salt,
    iterations,
    codeLength,
    maxAttempts,
    backoffBaseMs,
    ttlMs,
    createdAt,
    expiresAt,
    ...(typeof payload["oneTimeCode"] === "string" &&
      payload["oneTimeCode"].trim().length === codeLength
      ? {
        oneTimeCode: payload["oneTimeCode"].trim().toUpperCase(),
      }
      : {}),
    ...(typeof payload["codeRetrievalHint"] === "string" &&
      payload["codeRetrievalHint"].trim().length > 0
      ? {
        codeRetrievalHint: payload["codeRetrievalHint"].trim(),
      }
      : {}),
    ...(typeof payload["supersedesPairingHandle"] === "string" &&
      payload["supersedesPairingHandle"].trim().length > 0
      ? {
        supersedesPairingHandle: payload["supersedesPairingHandle"].trim(),
      }
      : {}),
  };
}

export async function createPairingCompletionData(input: Readonly<{
  pairingBegin: PairingBeginPayload;
  pairingCode: string;
}>): Promise<PairingCompletionData> {
  const subtle = await requireSubtleCrypto();
  const pairingCode = normalizeNonEmptyText(input.pairingCode.toUpperCase(), "pairingCode");
  if (pairingCode.length !== input.pairingBegin.codeLength) {
    throw new Error(
      `Pairing code must be exactly ${String(input.pairingBegin.codeLength)} characters.`,
    );
  }

  const keyPair = await subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveBits"],
  );
  if (!(keyPair.privateKey instanceof CryptoKey) || !(keyPair.publicKey instanceof CryptoKey)) {
    throw new Error("Failed to generate extension pairing keypair.");
  }

  const extensionPublicKeyRaw = await subtle.exportKey("raw", keyPair.publicKey);
  const extensionPublicKey = bytesToHex(new Uint8Array(extensionPublicKeyRaw));
  const bridgePublicKey = await subtle.importKey(
    "raw",
    toBufferSource(hexToBytes(input.pairingBegin.bridgePublicKey, "bridgePublicKey")),
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    false,
    [],
  );
  const sharedSecretBits = new Uint8Array(
    await subtle.deriveBits(
      {
        name: "ECDH",
        public: bridgePublicKey,
      },
      keyPair.privateKey,
      256,
    ),
  );
  const codeKey = await deriveCodeKeyBytes({
    pairingCode,
    saltBytes: hexToBytes(input.pairingBegin.salt, "salt"),
    iterations: input.pairingBegin.iterations,
  });
  const transcript = toPairingTranscript({
    pairingSessionId: input.pairingBegin.pairingSessionId,
    extensionId: input.pairingBegin.extensionId,
    hostName: input.pairingBegin.hostName,
    bridgePublicKey: input.pairingBegin.bridgePublicKey,
    extensionPublicKey,
  });

  const proof = await computeProofHex({
    codeKey,
    transcript,
  });
  const pairingKeyHex = await derivePairingKeyHex({
    sharedSecretBits,
    codeKey,
    transcript,
  });
  return {
    extensionPublicKey,
    proof,
    pairingKeyHex,
  };
}

export async function wrapPairingKeyMaterial(input: Readonly<{
  pairingHandle: string;
  extensionId: string;
  hostName: string;
  pairingKeyHex: string;
  runtimeId: string;
  createdAt: string;
  rotatedFromPairingHandle?: string;
}>): Promise<BridgePairingState> {
  const subtle = await requireSubtleCrypto();
  const pairingHandle = normalizeNonEmptyText(input.pairingHandle, "pairingHandle");
  const extensionId = normalizeNonEmptyText(input.extensionId, "extensionId");
  const hostName = normalizeNonEmptyText(input.hostName, "hostName");
  const runtimeId = normalizeNonEmptyText(input.runtimeId, "runtimeId");
  const pairingKeyBytes = hexToBytes(input.pairingKeyHex, "pairingKeyHex");
  if (pairingKeyBytes.length !== 32) {
    throw new Error("Pairing key material must be 32 bytes.");
  }

  const wrapSalt = globalThis.crypto.getRandomValues(
    new Uint8Array(BRIDGE_PAIRING_WRAP_SALT_BYTE_LENGTH),
  );
  const wrapIv = globalThis.crypto.getRandomValues(
    new Uint8Array(BRIDGE_PAIRING_WRAP_IV_BYTE_LENGTH),
  );
  const wrapKey = await deriveWrapKey({
    runtimeId,
    salt: wrapSalt,
    iterations: BRIDGE_PAIRING_WRAP_PBKDF2_ITERATIONS,
  });
  const wrapped = await subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toBufferSource(wrapIv),
      additionalData: toBufferSource(
        toWrapAdditionalData({ pairingHandle, extensionId, hostName }),
      ),
    },
    wrapKey,
    toBufferSource(pairingKeyBytes),
  );
  return {
    version: BRIDGE_PAIRING_WRAP_VERSION,
    pairingHandle,
    extensionId,
    hostName,
    wrappedPairingKey: bytesToHex(new Uint8Array(wrapped)),
    wrapSalt: bytesToHex(wrapSalt),
    wrapIv: bytesToHex(wrapIv),
    wrapIterations: BRIDGE_PAIRING_WRAP_PBKDF2_ITERATIONS,
    createdAt: normalizeNonEmptyText(input.createdAt, "createdAt"),
    ...(input.rotatedFromPairingHandle !== undefined
      ? { rotatedFromPairingHandle: input.rotatedFromPairingHandle }
      : {}),
  };
}

export function parseBridgePairingState(value: unknown): BridgePairingState | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (value["version"] !== BRIDGE_PAIRING_WRAP_VERSION) {
    return undefined;
  }

  const pairingHandle =
    typeof value["pairingHandle"] === "string" ? value["pairingHandle"].trim() : "";
  const extensionId =
    typeof value["extensionId"] === "string" ? value["extensionId"].trim() : "";
  const hostName = typeof value["hostName"] === "string" ? value["hostName"].trim() : "";
  const wrappedPairingKey =
    typeof value["wrappedPairingKey"] === "string"
      ? value["wrappedPairingKey"].trim().toLowerCase()
      : "";
  const wrapSalt =
    typeof value["wrapSalt"] === "string" ? value["wrapSalt"].trim().toLowerCase() : "";
  const wrapIv = typeof value["wrapIv"] === "string" ? value["wrapIv"].trim().toLowerCase() : "";
  const wrapIterations =
    typeof value["wrapIterations"] === "number" ? value["wrapIterations"] : Number.NaN;
  const createdAt = typeof value["createdAt"] === "string" ? value["createdAt"].trim() : "";

  if (
    pairingHandle.length === 0 ||
    extensionId.length === 0 ||
    hostName.length === 0 ||
    !isHex(wrappedPairingKey) ||
    !isHex(wrapSalt) ||
    !isHex(wrapIv) ||
    !Number.isFinite(wrapIterations) ||
    wrapIterations < 10_000 ||
    createdAt.length === 0
  ) {
    return undefined;
  }

  return {
    version: BRIDGE_PAIRING_WRAP_VERSION,
    pairingHandle,
    extensionId,
    hostName,
    wrappedPairingKey,
    wrapSalt,
    wrapIv,
    wrapIterations,
    createdAt,
    ...(typeof value["rotatedFromPairingHandle"] === "string" &&
      value["rotatedFromPairingHandle"].trim().length > 0
      ? { rotatedFromPairingHandle: value["rotatedFromPairingHandle"].trim() }
      : {}),
  };
}

export async function unwrapPairingKeyMaterial(input: Readonly<{
  pairingState: BridgePairingState;
  runtimeId: string;
}>): Promise<Readonly<{ pairingHandle: string; pairingKeyHex: string; hostName: string }> | undefined> {
  const subtle = await requireSubtleCrypto();
  const runtimeId = normalizeNonEmptyText(input.runtimeId, "runtimeId");
  const wrapKey = await deriveWrapKey({
    runtimeId,
    salt: hexToBytes(input.pairingState.wrapSalt, "wrapSalt"),
    iterations: input.pairingState.wrapIterations,
  });
  try {
    const decrypted = await subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toBufferSource(hexToBytes(input.pairingState.wrapIv, "wrapIv")),
        additionalData: toBufferSource(
          toWrapAdditionalData({
            pairingHandle: input.pairingState.pairingHandle,
            extensionId: input.pairingState.extensionId,
            hostName: input.pairingState.hostName,
          }),
        ),
      },
      wrapKey,
      toBufferSource(
        hexToBytes(input.pairingState.wrappedPairingKey, "wrappedPairingKey"),
      ),
    );
    const pairingKeyHex = bytesToHex(new Uint8Array(decrypted));
    if (!isHex(pairingKeyHex) || pairingKeyHex.length !== 64) {
      return undefined;
    }
    return {
      pairingHandle: input.pairingState.pairingHandle,
      pairingKeyHex,
      hostName: input.pairingState.hostName,
    };
  } catch {
    return undefined;
  }
}

