type CanonicalProofFields = Readonly<{
  requestId: string;
  nonce: string;
  origin: string;
  connectionHandle: string;
  payloadHash: string;
}>;

export type CloudRequestProofPayload = CanonicalProofFields &
  Readonly<{
    proof: string;
  }>;

export type BuildCloudRequestProofInput = CanonicalProofFields &
  Readonly<{
    sessionKey: Uint8Array;
  }>;

function normalizeNonEmptyString(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`Cloud request proof field "${field}" must not be empty.`);
  }
  return normalized;
}

function canonicalizeJsonValue(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? JSON.stringify(value) : "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeJsonValue(entry)).join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((left, right) =>
      left.localeCompare(right),
    );
    const fields = keys
      .filter((key) => {
        const candidate = record[key];
        return (
          candidate !== undefined &&
          typeof candidate !== "function" &&
          typeof candidate !== "symbol"
        );
      })
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalizeJsonValue(record[key])}`,
      );
    return `{${fields.join(",")}}`;
  }

  return "null";
}

function requireSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    throw new Error("Web Crypto API is unavailable for cloud request proof.");
  }
  return subtle;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = Uint8Array.from(value);
  return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
}

function canonicalizeProofFields(input: CanonicalProofFields): string {
  const requestId = normalizeNonEmptyString(input.requestId, "requestId");
  const nonce = normalizeNonEmptyString(input.nonce, "nonce");
  const origin = normalizeNonEmptyString(input.origin, "origin");
  const connectionHandle = normalizeNonEmptyString(
    input.connectionHandle,
    "connectionHandle",
  );
  const payloadHash = normalizeNonEmptyString(input.payloadHash, "payloadHash");

  return JSON.stringify([
    ["requestId", requestId],
    ["nonce", nonce],
    ["origin", origin],
    ["connectionHandle", connectionHandle],
    ["payloadHash", payloadHash],
  ]);
}

export async function computeCloudRequestPayloadHash(
  payload: unknown,
): Promise<string> {
  const subtle = requireSubtleCrypto();
  const canonical = canonicalizeJsonValue(payload);
  const encoded = new TextEncoder().encode(canonical);
  const digest = await subtle.digest("SHA-256", encoded);
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

export async function buildCloudRequestProof(
  input: BuildCloudRequestProofInput,
): Promise<CloudRequestProofPayload> {
  const subtle = requireSubtleCrypto();
  const canonicalPayload = canonicalizeProofFields(input);
  const keyBytes = Uint8Array.from(input.sessionKey);
  if (keyBytes.length === 0) {
    throw new Error("Cloud request proof requires a non-empty session key.");
  }

  const key = await subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
  const canonicalBytes = new TextEncoder().encode(canonicalPayload);
  const signature = await subtle.sign(
    "HMAC",
    key,
    toArrayBuffer(canonicalBytes),
  );
  const proof = bytesToHex(new Uint8Array(signature));

  return {
    requestId: input.requestId.trim(),
    nonce: input.nonce.trim(),
    origin: input.origin.trim(),
    connectionHandle: input.connectionHandle.trim(),
    payloadHash: input.payloadHash.trim(),
    proof,
  };
}
