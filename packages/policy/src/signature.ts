import * as crypto from "node:crypto";

import type { PolicyBundle, SignedPolicyBundle } from "./schema.js";

export interface PolicyKeyResolver {
  resolvePublicKey(keyId: string): string | undefined;
}

export const POLICY_SIGNATURE_ERROR_CODES = {
  KEY_NOT_FOUND: "POLICY_SIGNATURE_KEY_NOT_FOUND",
  KEY_ID_MISMATCH: "POLICY_SIGNATURE_KEY_ID_MISMATCH",
  BUNDLE_DIGEST_MISMATCH: "POLICY_SIGNATURE_BUNDLE_DIGEST_MISMATCH",
  SIGNATURE_INVALID: "POLICY_SIGNATURE_INVALID",
  INVALID_PUBLIC_KEY: "POLICY_SIGNATURE_INVALID_PUBLIC_KEY",
} as const;

export type PolicySignatureErrorCode =
  (typeof POLICY_SIGNATURE_ERROR_CODES)[keyof typeof POLICY_SIGNATURE_ERROR_CODES];

export class PolicySignatureError extends Error {
  readonly code: PolicySignatureErrorCode;

  constructor(
    message: string,
    code: PolicySignatureErrorCode,
    options?: { readonly cause?: Error },
  ) {
    super(message, options);
    this.name = "PolicySignatureError";
    this.code = code;
  }
}

function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted;
}

export function canonicalizePolicyBundle(payload: PolicyBundle): string {
  const entries = Object.entries(payload).sort(([a], [b]) => a.localeCompare(b));
  const sorted: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    if (k === "rules" && typeof v === "object" && v !== null && !Array.isArray(v)) {
      sorted[k] = sortObjectKeys(v as Record<string, unknown>);
    } else {
      sorted[k] = v;
    }
  }
  return JSON.stringify(sorted);
}

export function createPolicyBundleDigest(payload: PolicyBundle): string {
  const canonical = canonicalizePolicyBundle(payload);
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

export type BundleVerificationResult = Readonly<{
  keyId: string;
  digest: string;
  canonicalPayload: string;
}>;

export function verifyPolicyBundleSignature(
  bundle: SignedPolicyBundle,
  options: Readonly<{ keyResolver: PolicyKeyResolver }>,
): BundleVerificationResult {
  const { payload, signature } = bundle;
  const { keyResolver } = options;

  if (payload.keyId !== signature.keyId) {
    throw new PolicySignatureError(
      `Key ID mismatch: payload has "${payload.keyId}" but signature has "${signature.keyId}".`,
      POLICY_SIGNATURE_ERROR_CODES.KEY_ID_MISMATCH,
    );
  }

  const publicKeyPem = keyResolver.resolvePublicKey(signature.keyId);
  if (publicKeyPem === undefined) {
    throw new PolicySignatureError(
      `Public key not found for key ID "${signature.keyId}".`,
      POLICY_SIGNATURE_ERROR_CODES.KEY_NOT_FOUND,
    );
  }

  const canonicalPayload = canonicalizePolicyBundle(payload);
  const expectedDigest = crypto.createHash("sha256").update(canonicalPayload, "utf8").digest("hex");

  if (signature.digest !== expectedDigest) {
    throw new PolicySignatureError(
      `Bundle digest mismatch: expected "${expectedDigest}" but got "${signature.digest}".`,
      POLICY_SIGNATURE_ERROR_CODES.BUNDLE_DIGEST_MISMATCH,
    );
  }

  let publicKey: crypto.KeyObject;
  try {
    publicKey = crypto.createPublicKey(publicKeyPem);
  } catch (cause) {
    throw new PolicySignatureError(
      `Invalid public key for key ID "${signature.keyId}".`,
      POLICY_SIGNATURE_ERROR_CODES.INVALID_PUBLIC_KEY,
      cause instanceof Error ? { cause } : undefined,
    );
  }

  const signatureBuffer = Buffer.from(signature.value, "base64");
  const dataBuffer = Buffer.from(canonicalPayload, "utf8");

  let isValid: boolean;
  try {
    isValid = crypto.verify(null, dataBuffer, publicKey, signatureBuffer);
  } catch (cause) {
    throw new PolicySignatureError(
      `Signature verification failed for key ID "${signature.keyId}".`,
      POLICY_SIGNATURE_ERROR_CODES.SIGNATURE_INVALID,
      cause instanceof Error ? { cause } : undefined,
    );
  }

  if (!isValid) {
    throw new PolicySignatureError(
      `Invalid signature for key ID "${signature.keyId}".`,
      POLICY_SIGNATURE_ERROR_CODES.SIGNATURE_INVALID,
    );
  }

  return Object.freeze({
    keyId: signature.keyId,
    digest: signature.digest,
    canonicalPayload,
  });
}
