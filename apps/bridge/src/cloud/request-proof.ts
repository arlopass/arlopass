import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type RequestProofFields = Readonly<{
  requestId: string;
  nonce: string;
  origin: string;
  connectionHandle: string;
  payloadHash: string;
}>;

export type RequestProofCreateInput = RequestProofFields &
  Readonly<{
    sessionKey: Buffer;
  }>;

export type RequestProofVerifyInput = RequestProofFields &
  Readonly<{
    proof: string;
    sessionKey: Buffer;
  }>;

export type RequestProofVerifySuccess = Readonly<{ ok: true }>;

export type RequestProofVerifyFailure = Readonly<{
  ok: false;
  error: Readonly<{ reasonCode: "request.replay_prone"; message: string }>;
}>;

export type RequestProofVerifyResult =
  | RequestProofVerifySuccess
  | RequestProofVerifyFailure;

function normalizeNonEmptyString(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`Request proof field "${field}" must not be empty.`);
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
    if (!Number.isFinite(value)) return "null";
    return JSON.stringify(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

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

function canonicalizeProofFields(input: RequestProofFields): string {
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

function timingSafeStringEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  return timingSafeEqual(leftBytes, rightBytes);
}

export function computeRequestPayloadHash(payload: unknown): string {
  const canonicalPayload = canonicalizeJsonValue(payload);
  return `sha256:${createHash("sha256").update(canonicalPayload, "utf8").digest("hex")}`;
}

export function createRequestProof(input: RequestProofCreateInput): string {
  const canonicalProofPayload = canonicalizeProofFields(input);
  return createHmac("sha256", input.sessionKey)
    .update(canonicalProofPayload, "utf8")
    .digest("hex");
}

export function verifyRequestProof(
  input: RequestProofVerifyInput,
): RequestProofVerifyResult {
  const expectedProof = createRequestProof(input);

  if (!timingSafeStringEquals(expectedProof, input.proof)) {
    return {
      ok: false,
      error: {
        reasonCode: "request.replay_prone",
        message: "Request proof verification failed.",
      },
    };
  }

  return { ok: true };
}
