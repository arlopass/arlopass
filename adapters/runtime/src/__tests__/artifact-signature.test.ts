import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ARTIFACT_SIGNATURE_ALGORITHM,
  RUNTIME_ERROR_CODES,
  SignatureVerificationError,
  canonicalizeArtifactPayload,
  computeArtifactDigest,
  parseArtifactSignature,
  signArtifact,
  verifyArtifactSignature,
  type ArtifactKeyResolver,
  type SignedArtifact,
} from "../index.js";

function makeKeyPair(): { publicKeyPem: string; privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"] } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function makeResolver(keyId: string, publicKeyPem: string): ArtifactKeyResolver {
  return {
    resolvePublicKey: (id) => (id === keyId ? publicKeyPem : undefined),
  };
}

function createSignedArtifact(
  keyId: string,
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
  overrides: Partial<{ providerId: string; version: string; content: string }> = {},
): SignedArtifact {
  return signArtifact(
    {
      providerId: overrides.providerId ?? "ollama",
      version: overrides.version ?? "1.0.0",
      content: overrides.content ?? '{"name":"ollama"}',
    },
    { keyId, privateKey },
  );
}

function expectSignatureError(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(SignatureVerificationError);
  if (error instanceof SignatureVerificationError) {
    expect(error.code).toBe(code);
  }
}

describe("computeArtifactDigest", () => {
  it("produces a 64-char lowercase hex sha256", () => {
    const digest = computeArtifactDigest("hello world");
    expect(digest).toHaveLength(64);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for the same input", () => {
    expect(computeArtifactDigest("test")).toBe(computeArtifactDigest("test"));
  });

  it("is sensitive to input changes", () => {
    expect(computeArtifactDigest("test")).not.toBe(computeArtifactDigest("Test"));
  });

  it("accepts Buffer input", () => {
    const buf = Buffer.from("hello");
    const str = "hello";
    expect(computeArtifactDigest(buf)).toBe(computeArtifactDigest(str));
  });
});

describe("canonicalizeArtifactPayload", () => {
  it("produces stable JSON with sorted keys", () => {
    const result = canonicalizeArtifactPayload({
      version: "1.0.0",
      providerId: "ollama",
      digest: "abc123",
    });
    expect(result).toBe('{"digest":"abc123","providerId":"ollama","version":"1.0.0"}');
  });
});

describe("signArtifact", () => {
  it("produces a signed artifact with the correct shape", () => {
    const { privateKey } = makeKeyPair();
    const artifact = signArtifact(
      { providerId: "ollama", version: "1.0.0", content: '{"name":"ollama"}' },
      { keyId: "key.adapter.primary", privateKey },
    );
    expect(artifact.providerId).toBe("ollama");
    expect(artifact.version).toBe("1.0.0");
    expect(artifact.digest).toHaveLength(64);
    expect(artifact.signature.algorithm).toBe(ARTIFACT_SIGNATURE_ALGORITHM);
    expect(artifact.signature.keyId).toBe("key.adapter.primary");
    expect(artifact.signature.value).toBeTruthy();
  });

  it("digest matches content hash", () => {
    const content = '{"name":"ollama"}';
    const { privateKey } = makeKeyPair();
    const artifact = signArtifact(
      { providerId: "ollama", version: "1.0.0", content },
      { keyId: "key.adapter.primary", privateKey },
    );
    expect(artifact.digest).toBe(computeArtifactDigest(content));
  });
});

describe("verifyArtifactSignature", () => {
  it("verifies a valid signed artifact", () => {
    const { privateKey, publicKeyPem } = makeKeyPair();
    const artifact = createSignedArtifact("key.adapter.primary", privateKey);
    const resolver = makeResolver("key.adapter.primary", publicKeyPem);

    const result = verifyArtifactSignature(artifact, { keyResolver: resolver });
    expect(result.keyId).toBe("key.adapter.primary");
    expect(result.digest).toBe(artifact.digest);
    expect(result.providerId).toBe("ollama");
    expect(result.version).toBe("1.0.0");
  });

  it("rejects when key is not found", () => {
    const { privateKey } = makeKeyPair();
    const artifact = createSignedArtifact("key.adapter.primary", privateKey);
    const resolver: ArtifactKeyResolver = { resolvePublicKey: () => undefined };

    try {
      verifyArtifactSignature(artifact, { keyResolver: resolver });
      expect.fail("Should have thrown");
    } catch (error) {
      expectSignatureError(error, RUNTIME_ERROR_CODES.SIGNATURE_KEY_NOT_FOUND);
    }
  });

  it("rejects digest mismatch", () => {
    const { privateKey, publicKeyPem } = makeKeyPair();
    const artifact = createSignedArtifact("key.adapter.primary", privateKey);
    const tampered: SignedArtifact = {
      ...artifact,
      digest: "f".repeat(64),
    };
    const resolver = makeResolver("key.adapter.primary", publicKeyPem);

    try {
      verifyArtifactSignature(tampered, { keyResolver: resolver });
      expect.fail("Should have thrown");
    } catch (error) {
      expectSignatureError(error, RUNTIME_ERROR_CODES.SIGNATURE_DIGEST_MISMATCH);
    }
  });

  it("rejects tampered signature value", () => {
    const { privateKey, publicKeyPem } = makeKeyPair();
    const artifact = createSignedArtifact("key.adapter.primary", privateKey);
    const tampered: SignedArtifact = {
      ...artifact,
      signature: { ...artifact.signature, value: Buffer.alloc(64).toString("base64") },
    };
    const resolver = makeResolver("key.adapter.primary", publicKeyPem);

    try {
      verifyArtifactSignature(tampered, { keyResolver: resolver });
      expect.fail("Should have thrown");
    } catch (error) {
      expectSignatureError(error, RUNTIME_ERROR_CODES.SIGNATURE_INVALID);
    }
  });

  it("rejects invalid public key PEM", () => {
    const { privateKey } = makeKeyPair();
    const artifact = createSignedArtifact("key.adapter.primary", privateKey);
    const resolver = makeResolver("key.adapter.primary", "not-a-pem");

    try {
      verifyArtifactSignature(artifact, { keyResolver: resolver });
      expect.fail("Should have thrown");
    } catch (error) {
      expectSignatureError(error, RUNTIME_ERROR_CODES.SIGNATURE_INVALID_PUBLIC_KEY);
    }
  });

  it("rejects wrong key used for verification", () => {
    const { privateKey } = makeKeyPair();
    const { publicKeyPem: wrongPublicKeyPem } = makeKeyPair();
    const artifact = createSignedArtifact("key.adapter.primary", privateKey);
    const resolver = makeResolver("key.adapter.primary", wrongPublicKeyPem);

    try {
      verifyArtifactSignature(artifact, { keyResolver: resolver });
      expect.fail("Should have thrown");
    } catch (error) {
      expectSignatureError(error, RUNTIME_ERROR_CODES.SIGNATURE_INVALID);
    }
  });

  it("rejects unsupported algorithm", () => {
    const { privateKey, publicKeyPem } = makeKeyPair();
    const artifact = createSignedArtifact("key.adapter.primary", privateKey);
    const badAlgoArtifact: SignedArtifact = {
      ...artifact,
      signature: {
        ...artifact.signature,
        algorithm: "rsa" as typeof ARTIFACT_SIGNATURE_ALGORITHM,
      },
    };
    const resolver = makeResolver("key.adapter.primary", publicKeyPem);

    try {
      verifyArtifactSignature(badAlgoArtifact, { keyResolver: resolver });
      expect.fail("Should have thrown");
    } catch (error) {
      expectSignatureError(error, RUNTIME_ERROR_CODES.SIGNATURE_ALGORITHM_UNSUPPORTED);
    }
  });
});

describe("parseArtifactSignature", () => {
  it("parses a valid signature object", () => {
    const { privateKey } = makeKeyPair();
    const artifact = createSignedArtifact("key.adapter.primary", privateKey);
    const parsed = parseArtifactSignature(artifact.signature);
    expect(parsed.algorithm).toBe(ARTIFACT_SIGNATURE_ALGORITHM);
    expect(parsed.keyId).toBe("key.adapter.primary");
  });

  it("rejects non-object input", () => {
    expect(() => parseArtifactSignature(null)).toThrow(SignatureVerificationError);
    expect(() => parseArtifactSignature("string")).toThrow(SignatureVerificationError);
  });

  it("rejects unsupported algorithm", () => {
    expect(() =>
      parseArtifactSignature({
        algorithm: "rsa",
        keyId: "key.1",
        signedAt: "2026-01-01T00:00:00.000Z",
        digest: "a".repeat(64),
        value: "AAAA",
      }),
    ).toThrow(SignatureVerificationError);
  });

  it("rejects invalid digest format", () => {
    const { privateKey } = makeKeyPair();
    const artifact = createSignedArtifact("key.adapter.primary", privateKey);
    expect(() =>
      parseArtifactSignature({ ...artifact.signature, digest: "ZZZZ" }),
    ).toThrow(SignatureVerificationError);
  });

  it("rejects invalid signedAt timestamp", () => {
    const { privateKey } = makeKeyPair();
    const artifact = createSignedArtifact("key.adapter.primary", privateKey);
    expect(() =>
      parseArtifactSignature({ ...artifact.signature, signedAt: "not-a-date" }),
    ).toThrow(SignatureVerificationError);
  });
});
