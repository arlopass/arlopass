import * as crypto from "node:crypto";

import { RUNTIME_ERROR_CODES, SignatureVerificationError } from "./errors.js";

export const ARTIFACT_SIGNATURE_ALGORITHM = "ed25519";
export type ArtifactSignatureAlgorithm = typeof ARTIFACT_SIGNATURE_ALGORITHM;

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

export type ArtifactSignature = Readonly<{
  algorithm: ArtifactSignatureAlgorithm;
  keyId: string;
  signedAt: string;
  digest: string;
  value: string;
}>;

export type SignedArtifact = Readonly<{
  providerId: string;
  version: string;
  digest: string;
  signature: ArtifactSignature;
}>;

export interface ArtifactKeyResolver {
  resolvePublicKey(keyId: string): string | undefined;
}

export type ArtifactVerificationResult = Readonly<{
  keyId: string;
  digest: string;
  providerId: string;
  version: string;
}>;

function signatureError(
  message: string,
  code: (typeof RUNTIME_ERROR_CODES)[keyof typeof RUNTIME_ERROR_CODES],
  details?: Readonly<Record<string, string | number | boolean | null>>,
  cause?: Error,
): SignatureVerificationError {
  return new SignatureVerificationError(message, {
    code,
    ...(details !== undefined ? { details } : {}),
    ...(cause !== undefined ? { cause } : {}),
  });
}

export function computeArtifactDigest(content: string | Buffer): string {
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function signArtifact(
  payload: Readonly<{ providerId: string; version: string; content: string | Buffer }>,
  options: Readonly<{
    keyId: string;
    privateKey: crypto.KeyObject;
    signedAt?: string;
  }>,
): SignedArtifact {
  const digest = computeArtifactDigest(payload.content);
  const signedAt = options.signedAt ?? new Date().toISOString();

  const dataToSign = canonicalizeArtifactPayload({
    providerId: payload.providerId,
    version: payload.version,
    digest,
  });
  const signatureValue = crypto
    .sign(null, Buffer.from(dataToSign, "utf8"), options.privateKey)
    .toString("base64");

  return Object.freeze({
    providerId: payload.providerId,
    version: payload.version,
    digest,
    signature: Object.freeze({
      algorithm: ARTIFACT_SIGNATURE_ALGORITHM,
      keyId: options.keyId,
      signedAt,
      digest,
      value: signatureValue,
    }),
  });
}

export function canonicalizeArtifactPayload(
  artifact: Readonly<{ providerId: string; version: string; digest: string }>,
): string {
  const entries = Object.entries(artifact).sort(([a], [b]) => a.localeCompare(b));
  const sorted: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    sorted[k] = v;
  }
  return JSON.stringify(sorted);
}

export function verifyArtifactSignature(
  artifact: SignedArtifact,
  options: Readonly<{ keyResolver: ArtifactKeyResolver }>,
): ArtifactVerificationResult {
  const { signature } = artifact;

  if (signature.algorithm !== ARTIFACT_SIGNATURE_ALGORITHM) {
    throw signatureError(
      `Unsupported signature algorithm "${signature.algorithm}".`,
      RUNTIME_ERROR_CODES.SIGNATURE_ALGORITHM_UNSUPPORTED,
      { algorithm: signature.algorithm },
    );
  }

  if (!SHA256_HEX_PATTERN.test(signature.digest)) {
    throw signatureError(
      `Artifact signature digest must be a lowercase sha256 hex string.`,
      RUNTIME_ERROR_CODES.SIGNATURE_DIGEST_MISMATCH,
    );
  }

  if (artifact.digest !== signature.digest) {
    throw signatureError(
      `Artifact digest mismatch: artifact has "${artifact.digest}" but signature has "${signature.digest}".`,
      RUNTIME_ERROR_CODES.SIGNATURE_DIGEST_MISMATCH,
      { artifactDigest: artifact.digest, signatureDigest: signature.digest },
    );
  }

  const publicKeyPem = options.keyResolver.resolvePublicKey(signature.keyId);
  if (publicKeyPem === undefined) {
    throw signatureError(
      `Public key not found for key ID "${signature.keyId}".`,
      RUNTIME_ERROR_CODES.SIGNATURE_KEY_NOT_FOUND,
      { keyId: signature.keyId },
    );
  }

  let publicKey: crypto.KeyObject;
  try {
    publicKey = crypto.createPublicKey(publicKeyPem);
  } catch (cause) {
    throw signatureError(
      `Invalid public key for key ID "${signature.keyId}".`,
      RUNTIME_ERROR_CODES.SIGNATURE_INVALID_PUBLIC_KEY,
      { keyId: signature.keyId },
      cause instanceof Error ? cause : undefined,
    );
  }

  const dataToVerify = canonicalizeArtifactPayload({
    providerId: artifact.providerId,
    version: artifact.version,
    digest: artifact.digest,
  });

  const signatureBuffer = Buffer.from(signature.value, "base64");
  const dataBuffer = Buffer.from(dataToVerify, "utf8");

  let isValid: boolean;
  try {
    isValid = crypto.verify(null, dataBuffer, publicKey, signatureBuffer);
  } catch (cause) {
    throw signatureError(
      `Signature verification failed for key ID "${signature.keyId}".`,
      RUNTIME_ERROR_CODES.SIGNATURE_INVALID,
      { keyId: signature.keyId },
      cause instanceof Error ? cause : undefined,
    );
  }

  if (!isValid) {
    throw signatureError(
      `Invalid artifact signature for key ID "${signature.keyId}".`,
      RUNTIME_ERROR_CODES.SIGNATURE_INVALID,
      { keyId: signature.keyId },
    );
  }

  return Object.freeze({
    keyId: signature.keyId,
    digest: artifact.digest,
    providerId: artifact.providerId,
    version: artifact.version,
  });
}

export function parseArtifactSignature(input: unknown): ArtifactSignature {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw signatureError("Artifact signature must be an object.", RUNTIME_ERROR_CODES.SIGNATURE_INVALID);
  }
  const record = input as Record<string, unknown>;

  const algorithm = typeof record["algorithm"] === "string" ? record["algorithm"].trim() : "";
  if (algorithm !== ARTIFACT_SIGNATURE_ALGORITHM) {
    throw signatureError(
      `Unsupported signature algorithm "${algorithm}". Expected "${ARTIFACT_SIGNATURE_ALGORITHM}".`,
      RUNTIME_ERROR_CODES.SIGNATURE_ALGORITHM_UNSUPPORTED,
      { algorithm },
    );
  }

  const keyId = typeof record["keyId"] === "string" ? record["keyId"].trim() : "";
  if (!keyId) {
    throw signatureError(`"keyId" must be a non-empty string.`, RUNTIME_ERROR_CODES.SIGNATURE_INVALID);
  }

  const signedAt = typeof record["signedAt"] === "string" ? record["signedAt"].trim() : "";
  if (!signedAt || Number.isNaN(new Date(signedAt).getTime())) {
    throw signatureError(
      `"signedAt" must be a valid ISO-8601 timestamp.`,
      RUNTIME_ERROR_CODES.SIGNATURE_INVALID,
    );
  }

  const digest = typeof record["digest"] === "string" ? record["digest"].trim().toLowerCase() : "";
  if (!SHA256_HEX_PATTERN.test(digest)) {
    throw signatureError(
      `"digest" must be a lowercase sha256 hex string.`,
      RUNTIME_ERROR_CODES.SIGNATURE_INVALID,
    );
  }

  const value = typeof record["value"] === "string" ? record["value"].trim() : "";
  if (!value) {
    throw signatureError(`"value" must be a non-empty base64 string.`, RUNTIME_ERROR_CODES.SIGNATURE_INVALID);
  }

  return Object.freeze({
    algorithm: ARTIFACT_SIGNATURE_ALGORITHM,
    keyId,
    signedAt: new Date(signedAt).toISOString(),
    digest,
    value,
  });
}
