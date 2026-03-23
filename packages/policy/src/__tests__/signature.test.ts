import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it } from "vitest";

import { InMemoryPolicyKeyManager } from "../key-management.js";
import {
  parsePolicyBundle,
  parseSignedPolicyBundle,
  type SignedPolicyBundle,
} from "../schema.js";
import {
  POLICY_SIGNATURE_ERROR_CODES,
  PolicySignatureError,
  canonicalizePolicyBundle,
  createPolicyBundleDigest,
  verifyPolicyBundleSignature,
} from "../signature.js";

function createSignedBundle(): Readonly<{
  bundle: SignedPolicyBundle;
  publicKeyPem: string;
}> {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

  const payload = parsePolicyBundle({
    schemaVersion: "1.0.0",
    policyVersion: "2026.03.23",
    keyId: "key.signature.primary",
    issuedAt: "2026-03-23T10:00:00.000Z",
    rules: {
      allowedOrigins: ["https://app.example.com"],
      allowedCapabilities: ["chat.stream"],
    },
  });

  const digest = createPolicyBundleDigest(payload);
  const signature = sign(
    null,
    Buffer.from(canonicalizePolicyBundle(payload), "utf8"),
    privateKey,
  ).toString("base64");

  const bundle = parseSignedPolicyBundle({
    payload,
    signature: {
      algorithm: "ed25519",
      keyId: payload.keyId,
      signedAt: "2026-03-23T10:00:01.000Z",
      digest,
      value: signature,
    },
  });

  return Object.freeze({
    bundle,
    publicKeyPem,
  });
}

function expectSignatureError(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(PolicySignatureError);
  if (error instanceof PolicySignatureError) {
    expect(error.code).toBe(code);
  }
}

describe("verifyPolicyBundleSignature", () => {
  it("accepts valid signatures and returns verification details", () => {
    const { bundle, publicKeyPem } = createSignedBundle();
    const manager = new InMemoryPolicyKeyManager();
    manager.createKey({
      keyId: bundle.payload.keyId,
      publicKeyPem,
      createdAt: "2026-03-23T10:00:00.000Z",
    });

    const result = verifyPolicyBundleSignature(bundle, {
      keyResolver: manager,
    });

    expect(result.keyId).toBe(bundle.payload.keyId);
    expect(result.digest).toBe(bundle.signature.digest);
    expect(result.canonicalPayload).toContain("\"policyVersion\":\"2026.03.23\"");
  });

  it("rejects verification when key material is missing", () => {
    const { bundle } = createSignedBundle();

    expect(() =>
      verifyPolicyBundleSignature(bundle, {
        keyResolver: {
          resolvePublicKey: () => undefined,
        },
      }),
    ).toThrowError(PolicySignatureError);

    try {
      verifyPolicyBundleSignature(bundle, {
        keyResolver: {
          resolvePublicKey: () => undefined,
        },
      });
    } catch (error) {
      expectSignatureError(error, POLICY_SIGNATURE_ERROR_CODES.KEY_NOT_FOUND);
    }
  });

  it("rejects digest mismatches deterministically", () => {
    const { bundle, publicKeyPem } = createSignedBundle();
    const manager = new InMemoryPolicyKeyManager();
    manager.createKey({
      keyId: bundle.payload.keyId,
      publicKeyPem,
      createdAt: "2026-03-23T10:00:00.000Z",
    });
    const tamperedDigestBundle: SignedPolicyBundle = {
      payload: bundle.payload,
      signature: {
        ...bundle.signature,
        digest: "f".repeat(64),
      },
    };

    expect(() =>
      verifyPolicyBundleSignature(tamperedDigestBundle, {
        keyResolver: manager,
      }),
    ).toThrowError(PolicySignatureError);

    try {
      verifyPolicyBundleSignature(tamperedDigestBundle, {
        keyResolver: manager,
      });
    } catch (error) {
      expectSignatureError(error, POLICY_SIGNATURE_ERROR_CODES.BUNDLE_DIGEST_MISMATCH);
    }
  });

  it("rejects invalid signatures", () => {
    const { bundle, publicKeyPem } = createSignedBundle();
    const manager = new InMemoryPolicyKeyManager();
    manager.createKey({
      keyId: bundle.payload.keyId,
      publicKeyPem,
      createdAt: "2026-03-23T10:00:00.000Z",
    });
    const tamperedSignatureBundle: SignedPolicyBundle = {
      payload: bundle.payload,
      signature: {
        ...bundle.signature,
        value: "AAAA",
      },
    };

    expect(() =>
      verifyPolicyBundleSignature(tamperedSignatureBundle, {
        keyResolver: manager,
      }),
    ).toThrowError(PolicySignatureError);

    try {
      verifyPolicyBundleSignature(tamperedSignatureBundle, {
        keyResolver: manager,
      });
    } catch (error) {
      expectSignatureError(error, POLICY_SIGNATURE_ERROR_CODES.SIGNATURE_INVALID);
    }
  });

  it("rejects signature and payload key-id mismatches", () => {
    const { bundle, publicKeyPem } = createSignedBundle();
    const manager = new InMemoryPolicyKeyManager();
    manager.createKey({
      keyId: bundle.payload.keyId,
      publicKeyPem,
      createdAt: "2026-03-23T10:00:00.000Z",
    });
    const mismatchedKeyBundle: SignedPolicyBundle = {
      payload: bundle.payload,
      signature: {
        ...bundle.signature,
        keyId: "key.signature.different",
      },
    };

    expect(() =>
      verifyPolicyBundleSignature(mismatchedKeyBundle, {
        keyResolver: manager,
      }),
    ).toThrowError(PolicySignatureError);

    try {
      verifyPolicyBundleSignature(mismatchedKeyBundle, {
        keyResolver: manager,
      });
    } catch (error) {
      expectSignatureError(error, POLICY_SIGNATURE_ERROR_CODES.KEY_ID_MISMATCH);
    }
  });
});
