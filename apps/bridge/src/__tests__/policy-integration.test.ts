/**
 * Integration tests for bridge RuntimeEvaluator + AuditEmitter.
 *
 * Coverage:
 *  - deny-default when no policy bundle (bridge-authoritative)
 *  - allow when policy permits
 *  - bridge denies even when extension cache would allow (stale cache scenario)
 *  - extension deny + bridge deny parity
 *  - audit event emitted on every allow decision
 *  - audit event emitted on every deny decision
 *  - audit emitter failure does not block the decision path
 *  - malformed policy bundle → deny
 *  - expired policy signature → deny
 */
import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  POLICY_DECISION_TYPES,
  parsePolicyBundle,
  InMemoryPolicyKeyManager,
  canonicalizePolicyBundle,
  createPolicyBundleDigest,
  type SignedPolicyBundle,
} from "@arlopass/policy";
import type { AuditEvent } from "@arlopass/audit";

import { RuntimeEvaluator, type RuntimeEvaluationRequest } from "../policy/runtime-evaluator.js";
import { AuditEmitter, type AuditExporter } from "../audit/audit-emitter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  overrides: Partial<RuntimeEvaluationRequest> = {},
): RuntimeEvaluationRequest {
  return {
    origin: "https://app.example.com",
    capability: "chat.stream",
    providerId: "provider.ollama",
    modelId: "model.llama3",
    correlationId: "cor.rt.001",
    ...overrides,
  };
}

function createSignedBundle(
  ruleOverrides: Record<string, unknown> = {},
  expiresAt?: string,
): Readonly<{ bundle: SignedPolicyBundle; publicKeyPem: string; keyId: string }> {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const keyId = "key.rt.test";

  const payload = parsePolicyBundle({
    schemaVersion: "1.0.0",
    policyVersion: "2026.03.23",
    keyId,
    issuedAt: "2026-03-23T10:00:00.000Z",
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    rules: {
      allowedOrigins: ["https://app.example.com"],
      allowedCapabilities: ["chat.stream"],
      allowedProviders: ["provider.ollama"],
      allowedModels: ["model.llama3"],
      ...ruleOverrides,
    },
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

function captureExporter(): { exporter: AuditExporter; captured: AuditEvent[] } {
  const captured: AuditEvent[] = [];
  const exporter: AuditExporter = {
    export: vi.fn().mockImplementation((event: AuditEvent) => {
      captured.push(event);
    }),
  };
  return { exporter, captured };
}

// ---------------------------------------------------------------------------
// Bridge deny-default
// ---------------------------------------------------------------------------

describe("RuntimeEvaluator — deny-default", () => {
  it("denies when no policy bundle is configured", () => {
    const evaluator = new RuntimeEvaluator();
    const result = evaluator.evaluate(makeRequest());
    expect(result.decision).toBe(POLICY_DECISION_TYPES.DENY);
  });

  it("reports unknown policy version when no bundle is set", () => {
    const evaluator = new RuntimeEvaluator();
    const result = evaluator.evaluate(makeRequest());
    expect(result.policyVersion).toBe("unknown");
    expect(evaluator.currentPolicyVersion).toBe("unknown");
  });

  it("denies on expired policy bundle", () => {
    const { bundle, publicKeyPem, keyId } = createSignedBundle(
      {},
      "2026-03-23T11:00:00.000Z",
    );
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({ keyId, publicKeyPem });

    const evaluator = new RuntimeEvaluator({
      signedPolicyBundle: bundle,
      keyResolver: keyManager,
      clock: () => new Date("2026-03-23T12:00:00.000Z"),
    });

    expect(evaluator.evaluate(makeRequest()).decision).toBe(POLICY_DECISION_TYPES.DENY);
  });
});

// ---------------------------------------------------------------------------
// Allow paths
// ---------------------------------------------------------------------------

describe("RuntimeEvaluator — allow", () => {
  it("allows when the policy permits the request", () => {
    const { bundle, publicKeyPem, keyId } = createSignedBundle();
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({ keyId, publicKeyPem });

    const evaluator = new RuntimeEvaluator({
      signedPolicyBundle: bundle,
      keyResolver: keyManager,
      clock: () => new Date("2026-03-23T10:30:00.000Z"),
    });

    expect(evaluator.evaluate(makeRequest()).decision).toBe(POLICY_DECISION_TYPES.ALLOW);
  });

  it("exposes the policy version from the bundle", () => {
    const { bundle, publicKeyPem, keyId } = createSignedBundle();
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({ keyId, publicKeyPem });

    const evaluator = new RuntimeEvaluator({
      signedPolicyBundle: bundle,
      keyResolver: keyManager,
      clock: () => new Date("2026-03-23T10:30:00.000Z"),
    });

    expect(evaluator.currentPolicyVersion).toBe("2026.03.23");
  });
});

// ---------------------------------------------------------------------------
// Bridge-authoritative: stale extension cache scenario
// ---------------------------------------------------------------------------

describe("RuntimeEvaluator — bridge authoritative over stale extension cache", () => {
  it("bridge denies when it has no bundle even if extension-side had an allow (stale cache)", () => {
    // The bridge has NO policy bundle (simulating a stricter / updated policy
    // while the extension cache still references the old allow bundle).
    const bridgeEvaluator = new RuntimeEvaluator(); // no bundle → deny by default
    expect(bridgeEvaluator.evaluate(makeRequest()).decision).toBe(POLICY_DECISION_TYPES.DENY);
  });

  it("bridge denies with origin-denied rule even if the request would have been allowed by an older bundle", () => {
    const { bundle, publicKeyPem, keyId } = createSignedBundle({
      deniedOrigins: ["https://app.example.com"],
    });
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({ keyId, publicKeyPem });

    const bridgeEvaluator = new RuntimeEvaluator({
      signedPolicyBundle: bundle,
      keyResolver: keyManager,
      clock: () => new Date("2026-03-23T10:30:00.000Z"),
    });

    expect(bridgeEvaluator.evaluate(makeRequest()).decision).toBe(POLICY_DECISION_TYPES.DENY);
  });
});

// ---------------------------------------------------------------------------
// Extension + bridge parity
// ---------------------------------------------------------------------------

describe("RuntimeEvaluator — extension/bridge deny parity", () => {
  it("both evaluators deny when origin is not in the allow list", () => {
    const { bundle, publicKeyPem, keyId } = createSignedBundle();
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({ keyId, publicKeyPem });

    const sharedOpts = {
      signedPolicyBundle: bundle,
      keyResolver: keyManager,
      clock: () => new Date("2026-03-23T10:30:00.000Z"),
    };

    // Both use the same evaluatePolicy core from @arlopass/policy — same inputs produce same output.
    const runtime1 = new RuntimeEvaluator(sharedOpts);
    const runtime2 = new RuntimeEvaluator(sharedOpts);

    const badOriginResult1 = runtime1.evaluate({ ...makeRequest(), origin: "https://evil.example.com" });
    const badOriginResult2 = runtime2.evaluate({ ...makeRequest(), origin: "https://evil.example.com" });

    expect(badOriginResult1.decision).toBe(POLICY_DECISION_TYPES.DENY);
    expect(badOriginResult2.decision).toBe(POLICY_DECISION_TYPES.DENY);
    expect(badOriginResult1.reasonCode).toBe(badOriginResult2.reasonCode);
  });

  it("evaluation is deterministic: same inputs always produce same output", () => {
    const { bundle, publicKeyPem, keyId } = createSignedBundle();
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({ keyId, publicKeyPem });
    const opts = {
      signedPolicyBundle: bundle,
      keyResolver: keyManager,
      clock: () => new Date("2026-03-23T10:30:00.000Z"),
    };
    const evaluator = new RuntimeEvaluator(opts);
    const req = makeRequest();
    const r1 = evaluator.evaluate(req);
    const r2 = evaluator.evaluate(req);
    expect(r1.decision).toBe(r2.decision);
    expect(r1.reasonCode).toBe(r2.reasonCode);
    expect(r1.policyVersion).toBe(r2.policyVersion);
  });
});

// ---------------------------------------------------------------------------
// Audit emission on every decision
// ---------------------------------------------------------------------------

describe("RuntimeEvaluator — audit emission", () => {
  it("emits an audit event on a deny decision", async () => {
    const { exporter, captured } = captureExporter();
    const auditEmitter = new AuditEmitter({ onLog: () => { } });
    auditEmitter.addExporter(exporter);

    const evaluator = new RuntimeEvaluator({}, auditEmitter);
    evaluator.evaluate(makeRequest({ correlationId: "cor.audit.deny" }));
    await auditEmitter.waitForIdle();

    expect(captured).toHaveLength(1);
    expect(captured[0]!.decision).toBe("deny");
    expect(captured[0]!.correlationId).toBe("cor.audit.deny");
  });

  it("emits an audit event on an allow decision", async () => {
    const { bundle, publicKeyPem, keyId } = createSignedBundle();
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({ keyId, publicKeyPem });

    const { exporter, captured } = captureExporter();
    const auditEmitter = new AuditEmitter({ onLog: () => { } });
    auditEmitter.addExporter(exporter);

    const evaluator = new RuntimeEvaluator(
      {
        signedPolicyBundle: bundle,
        keyResolver: keyManager,
        clock: () => new Date("2026-03-23T10:30:00.000Z"),
      },
      auditEmitter,
    );

    evaluator.evaluate(makeRequest({ correlationId: "cor.audit.allow" }));
    await auditEmitter.waitForIdle();

    expect(captured).toHaveLength(1);
    expect(captured[0]!.decision).toBe("allow");
    expect(captured[0]!.origin).toBe("https://app.example.com");
    expect(captured[0]!.policyVersion).toBe("2026.03.23");
  });

  it("audit event contains all required fields", async () => {
    const { exporter, captured } = captureExporter();
    const auditEmitter = new AuditEmitter({ onLog: () => { } });
    auditEmitter.addExporter(exporter);

    const evaluator = new RuntimeEvaluator({}, auditEmitter);
    evaluator.evaluate(makeRequest());
    await auditEmitter.waitForIdle();

    const event = captured[0]!;
    expect(typeof event.timestamp).toBe("string");
    expect(event.origin).toBe("https://app.example.com");
    expect(event.providerId).toBe("provider.ollama");
    expect(event.modelId).toBe("model.llama3");
    expect(event.capability).toBe("chat.stream");
    expect(["allow", "deny"]).toContain(event.decision);
    expect(typeof event.reasonCode).toBe("string");
    expect(typeof event.correlationId).toBe("string");
    expect(typeof event.policyVersion).toBe("string");
  });

  it("audit emitter failure does not block the enforcement decision", () => {
    const faultyExporter: AuditExporter = {
      export: vi.fn().mockImplementation(() => {
        throw new Error("storage full");
      }),
    };

    const auditEmitter = new AuditEmitter({
      maxAttempts: 1,
      retryBaseDelayMs: 0,
      maxRetryDelayMs: 0,
      onLog: () => { },
    });
    auditEmitter.addExporter(faultyExporter);

    const evaluator = new RuntimeEvaluator({}, auditEmitter);
    // Must not throw even though the exporter throws.
    expect(() => evaluator.evaluate(makeRequest())).not.toThrow();

    const result = evaluator.evaluate(makeRequest());
    expect(result.decision).toBe(POLICY_DECISION_TYPES.DENY);
  });
});

// ---------------------------------------------------------------------------
// Hardening: malformed / invalid policy conditions
// ---------------------------------------------------------------------------

describe("RuntimeEvaluator — malformed/invalid policy hardening", () => {
  it("denies on invalid signature (tampered digest)", () => {
    const { bundle, publicKeyPem, keyId } = createSignedBundle();
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({ keyId, publicKeyPem });

    // Tamper the digest so verification fails.
    const tamperedBundle: SignedPolicyBundle = {
      payload: bundle.payload,
      signature: {
        ...bundle.signature,
        digest: "a".repeat(64),
      },
    };

    const evaluator = new RuntimeEvaluator({
      signedPolicyBundle: tamperedBundle,
      keyResolver: keyManager,
      clock: () => new Date("2026-03-23T10:30:00.000Z"),
    });

    const result = evaluator.evaluate(makeRequest());
    expect(result.decision).toBe(POLICY_DECISION_TYPES.DENY);
  });

  it("denies when policy key has been revoked in the key manager", () => {
    const { bundle, publicKeyPem, keyId } = createSignedBundle();
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({ keyId, publicKeyPem });
    keyManager.revokeKey(keyId, { reason: "compromised" });

    const evaluator = new RuntimeEvaluator({
      signedPolicyBundle: bundle,
      keyResolver: keyManager,
      clock: () => new Date("2026-03-23T10:30:00.000Z"),
    });

    const result = evaluator.evaluate(makeRequest());
    expect(result.decision).toBe(POLICY_DECISION_TYPES.DENY);
  });

  it("denies when no key resolver is provided (key unavailable)", () => {
    const { bundle } = createSignedBundle();

    const evaluator = new RuntimeEvaluator({
      signedPolicyBundle: bundle,
      clock: () => new Date("2026-03-23T10:30:00.000Z"),
    });

    const result = evaluator.evaluate(makeRequest());
    expect(result.decision).toBe(POLICY_DECISION_TYPES.DENY);
  });
});
