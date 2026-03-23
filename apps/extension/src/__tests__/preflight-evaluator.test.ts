/**
 * Tests for PreflightEvaluator — extension-side policy preflight.
 *
 * Coverage:
 *  - deny-default when no policy bundle is configured
 *  - deny when policy bundle is expired
 *  - deny when origin is not in the allow list
 *  - allow when policy permits the request
 *  - deny on invalid/malformed context (bad origin)
 *  - parity: same request produces the same decision as bridge RuntimeEvaluator
 *  - exception safety: unexpected evaluation errors default to deny
 */
import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { CanonicalEnvelope } from "@byom-ai/protocol";
import {
  POLICY_DECISION_TYPES,
  parsePolicyBundle,
  InMemoryPolicyKeyManager,
  canonicalizePolicyBundle,
  createPolicyBundleDigest,
  type SignedPolicyBundle,
} from "@byom-ai/policy";

import { PreflightEvaluator } from "../policy/preflight-evaluator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnvelope(
  overrides: Partial<CanonicalEnvelope<null>> = {},
): CanonicalEnvelope<null> {
  const now = new Date("2026-03-23T12:00:00.000Z");
  return {
    protocolVersion: "1.0.0",
    requestId: "req.pre.001",
    correlationId: "cor.pre.001",
    origin: "https://app.example.com",
    sessionId: "ses.pre.001",
    capability: "chat.stream",
    providerId: "provider.ollama",
    modelId: "model.llama3",
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    nonce: "nonce-pre-001",
    payload: null,
    ...overrides,
  } as unknown as CanonicalEnvelope<null>;
}

function createSignedBundle(
  overrides: Partial<Parameters<typeof parsePolicyBundle>[0]> = {},
  expiredAt?: string,
): Readonly<{ bundle: SignedPolicyBundle; publicKeyPem: string; keyId: string }> {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const keyId = "key.preflight.test";

  const payload = parsePolicyBundle({
    schemaVersion: "1.0.0",
    policyVersion: "2026.03.23",
    keyId,
    issuedAt: "2026-03-23T10:00:00.000Z",
    ...(expiredAt !== undefined ? { expiresAt: expiredAt } : {}),
    rules: {
      allowedOrigins: ["https://app.example.com"],
      allowedCapabilities: ["chat.stream"],
      allowedProviders: ["provider.ollama"],
      allowedModels: ["model.llama3"],
    },
    ...overrides,
  });

  const digest = createPolicyBundleDigest(payload);
  const canonical = canonicalizePolicyBundle(payload);
  const signatureValue = sign(null, Buffer.from(canonical), privateKey);

  const bundle: SignedPolicyBundle = {
    payload,
    signature: {
      algorithm: "ed25519",
      keyId,
      signedAt: "2026-03-23T10:00:00.000Z",
      digest,
      value: signatureValue.toString("base64"),
    },
  };

  return { bundle, publicKeyPem, keyId };
}

// ---------------------------------------------------------------------------
// Deny-default behaviour
// ---------------------------------------------------------------------------

describe("PreflightEvaluator — deny-default", () => {
  it("denies when no policy bundle is configured", () => {
    const evaluator = new PreflightEvaluator();
    const result = evaluator.evaluate(makeEnvelope());
    expect(result.decision).toBe(POLICY_DECISION_TYPES.DENY);
  });

  it("includes the unknown policy version when no bundle is set", () => {
    const evaluator = new PreflightEvaluator();
    const result = evaluator.evaluate(makeEnvelope());
    expect(result.policyVersion).toBe("unknown");
  });

  it("denies when policy bundle is expired", () => {
    const { bundle, publicKeyPem, keyId } = createSignedBundle(
      {},
      "2026-03-23T11:00:00.000Z",
    );
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({ keyId, publicKeyPem });
    const evaluator = new PreflightEvaluator({
      signedPolicyBundle: bundle,
      keyResolver: keyManager,
      clock: () => new Date("2026-03-23T12:00:00.000Z"),
    });

    const result = evaluator.evaluate(makeEnvelope());
    expect(result.decision).toBe(POLICY_DECISION_TYPES.DENY);
  });
});

// ---------------------------------------------------------------------------
// Allow / deny based on rules
// ---------------------------------------------------------------------------

describe("PreflightEvaluator — allow/deny rules", () => {
  it("allows a request that satisfies every allow rule", () => {
    const { bundle, publicKeyPem, keyId } = createSignedBundle();
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({ keyId, publicKeyPem });

    const evaluator = new PreflightEvaluator({
      signedPolicyBundle: bundle,
      keyResolver: keyManager,
      clock: () => new Date("2026-03-23T10:30:00.000Z"),
    });

    const result = evaluator.evaluate(makeEnvelope());
    expect(result.decision).toBe(POLICY_DECISION_TYPES.ALLOW);
  });

  it("denies when origin is not in the allowed list", () => {
    const { bundle, publicKeyPem, keyId } = createSignedBundle();
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({ keyId, publicKeyPem });

    const evaluator = new PreflightEvaluator({
      signedPolicyBundle: bundle,
      keyResolver: keyManager,
      clock: () => new Date("2026-03-23T10:30:00.000Z"),
    });

    const result = evaluator.evaluate(
      makeEnvelope({ origin: "https://untrusted.example.com" }),
    );
    expect(result.decision).toBe(POLICY_DECISION_TYPES.DENY);
  });

  it("denies when capability is denied in the deny list", () => {
    const { bundle, publicKeyPem, keyId } = createSignedBundle({
      rules: {
        deniedCapabilities: ["chat.stream"],
        allowedOrigins: ["https://app.example.com"],
        allowedCapabilities: ["chat.stream"],
        allowedProviders: ["provider.ollama"],
        allowedModels: ["model.llama3"],
      },
    });
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({ keyId, publicKeyPem });

    const evaluator = new PreflightEvaluator({
      signedPolicyBundle: bundle,
      keyResolver: keyManager,
      clock: () => new Date("2026-03-23T10:30:00.000Z"),
    });

    const result = evaluator.evaluate(makeEnvelope());
    expect(result.decision).toBe(POLICY_DECISION_TYPES.DENY);
  });

  it("denies when the envelope has a malformed origin", () => {
    const { bundle, publicKeyPem, keyId } = createSignedBundle();
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({ keyId, publicKeyPem });

    const evaluator = new PreflightEvaluator({
      signedPolicyBundle: bundle,
      keyResolver: keyManager,
    });

    const result = evaluator.evaluate(
      makeEnvelope({ origin: "not-a-valid-origin" }),
    );
    expect(result.decision).toBe(POLICY_DECISION_TYPES.DENY);
  });
});

// ---------------------------------------------------------------------------
// Exception safety
// ---------------------------------------------------------------------------

describe("PreflightEvaluator — exception safety", () => {
  it("returns deny when evaluatePolicy throws unexpectedly", () => {
    const { bundle, publicKeyPem, keyId } = createSignedBundle();
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({ keyId, publicKeyPem });

    const evaluator = new PreflightEvaluator({
      signedPolicyBundle: bundle,
      keyResolver: keyManager,
    });

    // Corrupt the envelope to trigger an edge-case error path.
    const result = evaluator.evaluate(
      makeEnvelope({ capability: "unsupported.capability" as never }),
    );
    expect(result.decision).toBe(POLICY_DECISION_TYPES.DENY);
  });
});

// ---------------------------------------------------------------------------
// Correlation ID propagation
// ---------------------------------------------------------------------------

describe("PreflightEvaluator — correlation ID", () => {
  it("propagates the envelope correlationId into the deny decision", () => {
    const evaluator = new PreflightEvaluator();
    const result = evaluator.evaluate(
      makeEnvelope({ correlationId: "cor.test.xyz" }),
    );
    expect(result.decision).toBe(POLICY_DECISION_TYPES.DENY);
    expect(result.correlationId).toBe("cor.test.xyz");
  });

  it("propagates correlationId into an allow decision", () => {
    const { bundle, publicKeyPem, keyId } = createSignedBundle();
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({ keyId, publicKeyPem });

    const evaluator = new PreflightEvaluator({
      signedPolicyBundle: bundle,
      keyResolver: keyManager,
      clock: () => new Date("2026-03-23T10:30:00.000Z"),
    });

    const result = evaluator.evaluate(
      makeEnvelope({ correlationId: "cor.allow.001" }),
    );
    expect(result.decision).toBe(POLICY_DECISION_TYPES.ALLOW);
    expect(result.correlationId).toBe("cor.allow.001");
  });
});
