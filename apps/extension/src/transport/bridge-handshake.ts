const HANDSHAKE_NONCE_BYTE_LENGTH = 32;
const HANDSHAKE_SESSION_TOKEN_BYTE_LENGTH = 32;
const DEFAULT_HANDSHAKE_SESSION_TTL_MS = 5 * 60_000;

type NativeMessageSender = (
  hostName: string,
  message: Record<string, unknown>,
) => Promise<unknown>;

type BridgeSharedSecretResolver = (
  hostName: string,
) => Promise<string | Uint8Array | undefined | null>;
type BridgePairingHandleResolver = (
  hostName: string,
) => Promise<string | undefined | null>;

type CachedBridgeHandshakeSession = Readonly<{
  hostName: string;
  extensionId: string;
  sessionToken: string;
  sessionKey: Uint8Array;
  establishedAt: string;
  expiresAt: string;
  expiresAtMs: number;
}>;

export type BridgeHandshakeSession = Readonly<{
  hostName: string;
  extensionId: string;
  sessionToken: string;
  sessionKey: Uint8Array;
  establishedAt: string;
  expiresAt: string;
}>;

export type EnsureBridgeHandshakeSessionOptions = Readonly<{
  hostName: string;
  extensionId: string;
  sendNativeMessage: NativeMessageSender;
  resolveBridgeSharedSecret: BridgeSharedSecretResolver;
  resolveBridgePairingHandle?: BridgePairingHandleResolver;
  now?: () => Date;
}>;

const sessionCacheByKey = new Map<string, CachedBridgeHandshakeSession>();
const inFlightByKey = new Map<string, Promise<BridgeHandshakeSession>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNonEmptyText(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`Bridge handshake requires non-empty "${field}".`);
  }
  return normalized;
}

function isFixedLengthHex(value: string, byteLength: number): boolean {
  return (
    value.length === byteLength * 2 && new RegExp(`^[0-9a-f]{${String(byteLength * 2)}}$`, "i").test(value)
  );
}

function parseTimestamp(value: string): number | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hexValue: string): Uint8Array {
  const normalized = hexValue.trim().toLowerCase();
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
}

function parseBridgeSharedSecret(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) {
    return value.length > 0 ? Uint8Array.from(value) : undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized.length === 0 ||
    normalized.length % 2 !== 0 ||
    !/^[0-9a-f]+$/.test(normalized)
  ) {
    return undefined;
  }
  return hexToBytes(normalized);
}

function toCacheKey(hostName: string, extensionId: string, pairingHandle?: string): string {
  return `${hostName}\u0000${extensionId}\u0000${pairingHandle ?? ""}`;
}

function fromCacheKey(
  cacheKey: string,
): Readonly<{ hostName: string; extensionId: string; pairingHandle?: string }> {
  const [hostName = "", extensionId = "", pairingHandle = ""] = cacheKey.split("\u0000");
  return {
    hostName,
    extensionId,
    ...(pairingHandle.length > 0 ? { pairingHandle } : {}),
  };
}

function normalizePairingHandle(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function cloneSession(
  cached: CachedBridgeHandshakeSession,
): BridgeHandshakeSession {
  return {
    hostName: cached.hostName,
    extensionId: cached.extensionId,
    sessionToken: cached.sessionToken,
    sessionKey: Uint8Array.from(cached.sessionKey),
    establishedAt: cached.establishedAt,
    expiresAt: cached.expiresAt,
  };
}

function normalizeErrorReasonCode(errorPayload: Record<string, unknown>): string | undefined {
  const reasonCode = errorPayload["reasonCode"];
  return typeof reasonCode === "string" ? reasonCode : undefined;
}

function normalizeErrorMessage(errorPayload: Record<string, unknown>): string {
  const message = errorPayload["message"];
  return typeof message === "string"
    ? message
    : "Bridge handshake verification failed.";
}

async function computeHandshakeHmac(secret: Uint8Array, nonce: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    throw new Error("Web Crypto API is unavailable for bridge handshake HMAC computation.");
  }

  const secretBytes = Uint8Array.from(secret);

  const key = await subtle.importKey(
    "raw",
    secretBytes,
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
  const signature = await subtle.sign("HMAC", key, new TextEncoder().encode(nonce));
  return bytesToHex(new Uint8Array(signature));
}

async function acquireHandshakeSession(
  options: EnsureBridgeHandshakeSessionOptions,
  secret: Uint8Array,
  pairingHandle: string | undefined,
  allowRefreshOnAuthFailure: boolean,
): Promise<CachedBridgeHandshakeSession> {
  const challengeResponse = await options.sendNativeMessage(options.hostName, {
    type: "handshake.challenge",
    extensionId: options.extensionId,
    ...(pairingHandle !== undefined ? { pairingHandle } : {}),
  });
  if (!isRecord(challengeResponse) || challengeResponse["type"] !== "handshake.challenge") {
    throw new Error("Bridge handshake challenge response payload is invalid.");
  }

  const nonce = challengeResponse["nonce"];
  if (typeof nonce !== "string" || !isFixedLengthHex(nonce, HANDSHAKE_NONCE_BYTE_LENGTH)) {
    throw new Error("Bridge handshake challenge nonce is missing or invalid.");
  }

  const hmac = await computeHandshakeHmac(secret, nonce);
  const verifyResponse = await options.sendNativeMessage(options.hostName, {
    type: "handshake.verify",
    nonce,
    hmac,
    extensionId: options.extensionId,
    hostName: options.hostName,
    ...(pairingHandle !== undefined ? { pairingHandle } : {}),
  });
  if (!isRecord(verifyResponse)) {
    throw new Error("Bridge handshake verify response payload is invalid.");
  }

  if (verifyResponse["type"] === "error") {
    const reasonCode = normalizeErrorReasonCode(verifyResponse);
    if (
      allowRefreshOnAuthFailure &&
      (reasonCode === "auth.expired" || reasonCode === "auth.invalid")
    ) {
      return acquireHandshakeSession(options, secret, pairingHandle, false);
    }
    const errorMessage = normalizeErrorMessage(verifyResponse);
    throw new Error(
      reasonCode !== undefined
        ? `Bridge handshake verify failed (${reasonCode}): ${errorMessage}`
        : errorMessage,
    );
  }

  if (verifyResponse["type"] !== "handshake.session") {
    throw new Error("Bridge handshake verify returned an unexpected payload.");
  }

  const sessionToken = verifyResponse["sessionToken"];
  if (
    typeof sessionToken !== "string" ||
    !isFixedLengthHex(sessionToken, HANDSHAKE_SESSION_TOKEN_BYTE_LENGTH)
  ) {
    throw new Error("Bridge handshake session token is missing or invalid.");
  }

  const responseExtensionId = verifyResponse["extensionId"];
  if (
    typeof responseExtensionId === "string" &&
    responseExtensionId.trim().length > 0 &&
    responseExtensionId !== options.extensionId
  ) {
    throw new Error("Bridge handshake session extension binding mismatch.");
  }

  const nowMs = (options.now ?? (() => new Date()))().getTime();
  const establishedAt =
    typeof verifyResponse["establishedAt"] === "string"
      ? verifyResponse["establishedAt"]
      : new Date(nowMs).toISOString();
  const establishedAtMs = parseTimestamp(establishedAt) ?? nowMs;

  const expiresAt =
    typeof verifyResponse["expiresAt"] === "string"
      ? verifyResponse["expiresAt"]
      : new Date(establishedAtMs + DEFAULT_HANDSHAKE_SESSION_TTL_MS).toISOString();
  const expiresAtMs =
    parseTimestamp(expiresAt) ?? establishedAtMs + DEFAULT_HANDSHAKE_SESSION_TTL_MS;
  if (expiresAtMs <= nowMs) {
    if (allowRefreshOnAuthFailure) {
      return acquireHandshakeSession(options, secret, pairingHandle, false);
    }
    throw new Error("Bridge handshake session is already expired.");
  }

  return {
    hostName: options.hostName,
    extensionId: options.extensionId,
    sessionToken: sessionToken.toLowerCase(),
    sessionKey: hexToBytes(sessionToken),
    establishedAt,
    expiresAt,
    expiresAtMs,
  };
}

function cleanupExpiredSessions(nowMs: number): void {
  for (const [cacheKey, cacheEntry] of sessionCacheByKey) {
    if (cacheEntry.expiresAtMs <= nowMs) {
      sessionCacheByKey.delete(cacheKey);
    }
  }
}

export async function ensureBridgeHandshakeSession(
  options: EnsureBridgeHandshakeSessionOptions,
): Promise<BridgeHandshakeSession> {
  const hostName = normalizeNonEmptyText(options.hostName, "hostName");
  const extensionId = normalizeNonEmptyText(options.extensionId, "extensionId");
  const now = options.now ?? (() => new Date());
  const nowMs = now().getTime();
  cleanupExpiredSessions(nowMs);

  const normalizedOptions: EnsureBridgeHandshakeSessionOptions = {
    ...options,
    hostName,
    extensionId,
    now,
  };
  const resolvedPairingHandle =
    options.resolveBridgePairingHandle !== undefined
      ? normalizePairingHandle(await options.resolveBridgePairingHandle(hostName))
      : undefined;
  const cacheKey = toCacheKey(hostName, extensionId, resolvedPairingHandle);
  const cachedSession = sessionCacheByKey.get(cacheKey);
  if (cachedSession !== undefined && cachedSession.expiresAtMs > nowMs) {
    return cloneSession(cachedSession);
  }

  const existingInFlight = inFlightByKey.get(cacheKey);
  if (existingInFlight !== undefined) {
    return existingInFlight;
  }

  const inFlight = (async () => {
    const resolvedSecret = await normalizedOptions.resolveBridgeSharedSecret(hostName);
    const secret = parseBridgeSharedSecret(resolvedSecret);
    if (secret === undefined) {
      throw new Error(
        "Bridge shared secret is missing or invalid. Native handshake aborted (fail closed).",
      );
    }

    const session = await acquireHandshakeSession(
      normalizedOptions,
      secret,
      resolvedPairingHandle,
      true,
    );
    sessionCacheByKey.set(cacheKey, session);
    return cloneSession(session);
  })();

  inFlightByKey.set(cacheKey, inFlight);
  try {
    return await inFlight;
  } finally {
    inFlightByKey.delete(cacheKey);
  }
}

export function clearBridgeHandshakeSessionCache(
  options: Readonly<{
    hostName?: string;
    extensionId?: string;
  }> = {},
): void {
  const hasHost = typeof options.hostName === "string";
  const hasExtension = typeof options.extensionId === "string";

  if (!hasHost && !hasExtension) {
    sessionCacheByKey.clear();
    inFlightByKey.clear();
    return;
  }

  for (const key of [...sessionCacheByKey.keys()]) {
    const parsed = fromCacheKey(key);
    if (
      (!hasHost || parsed.hostName === options.hostName) &&
      (!hasExtension || parsed.extensionId === options.extensionId)
    ) {
      sessionCacheByKey.delete(key);
    }
  }

  for (const key of [...inFlightByKey.keys()]) {
    const parsed = fromCacheKey(key);
    if (
      (!hasHost || parsed.hostName === options.hostName) &&
      (!hasExtension || parsed.extensionId === options.extensionId)
    ) {
      inFlightByKey.delete(key);
    }
  }
}

export const invalidateBridgeHandshakeSessionCache = clearBridgeHandshakeSessionCache;
