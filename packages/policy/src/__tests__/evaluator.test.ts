import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  evaluatePolicy,
  UNKNOWN_POLICY_VERSION,
  type PolicyEvaluationContext,
} from "../evaluator.js";
import { InMemoryPolicyKeyManager } from "../key-management.js";
import { POLICY_DECISION_MACHINE_CODES } from "../reason-codes.js";
import {
  parsePolicyBundle,
  parseSignedPolicyBundle,
  type SignedPolicyBundle,
} from "../schema.js";
import { canonicalizePolicyBundle, createPolicyBundleDigest } from "../signature.js";

const BASE_CONTEXT: PolicyEvaluationContext = {
  origin: "https://app.example.com",
  capability: "chat.stream",
  providerId: "provider.ollama",
  modelId: "model.llama3",
  correlationId: "corr.policy.001",
};

function createSignedBundle(
  overrides: Partial<SignedPolicyBundle["payload"]> = {},
): Readonly<{
  bundle: SignedPolicyBundle;
  publicKeyPem: string;
}> {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const payload = parsePolicyBundle({
    schemaVersion: "1.0.0",
    policyVersion: "2026.03.23",
    keyId: "key.primary",
    issuedAt: "2026-03-23T10:00:00.000Z",
    rules: {
      allowedOrigins: ["https://app.example.com"],
      allowedCapabilities: ["chat.stream"],
      allowedProviders: ["provider.ollama"],
      allowedModels: ["model.llama3"],
    },
    ...overrides,
  });
  const digest = createPolicyBundleDigest(payload);
  const signatureValue = sign(
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
      value: signatureValue,
    },
  });

  return Object.freeze({
    bundle,
    publicKeyPem,
  });
}

describe("evaluatePolicy", () => {
  it("denies by default when no policy bundle is provided", () => {
    const decision = evaluatePolicy(BASE_CONTEXT);

    expect(decision).toEqual({
      decision: "deny",
      machineCode: POLICY_DECISION_MACHINE_CODES.DENY_POLICY_MISSING,
      reasonCode: "policy.denied",
      policyVersion: UNKNOWN_POLICY_VERSION,
      correlationId: "corr.policy.001",
    });
  });

  it("allows when request matches allow-rules and signature is valid", () => {
    const { bundle, publicKeyPem } = createSignedBundle();
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({
      keyId: "key.primary",
      publicKeyPem,
      createdAt: "2026-03-23T10:00:00.000Z",
    });

    const decision = evaluatePolicy(BASE_CONTEXT, {
      signedPolicyBundle: bundle,
      keyResolver: keyManager,
    });

    expect(decision).toEqual({
      decision: "allow",
      machineCode: POLICY_DECISION_MACHINE_CODES.ALLOW,
      reasonCode: "allow",
      policyVersion: "2026.03.23",
      correlationId: "corr.policy.001",
    });
  });

  it("applies deny precedence when allow and deny rules conflict", () => {
    const { bundle, publicKeyPem } = createSignedBundle({
      rules: {
        allowedCapabilities: ["chat.stream"],
        deniedCapabilities: ["chat.stream"],
      },
    });
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({
      keyId: "key.primary",
      publicKeyPem,
      createdAt: "2026-03-23T10:00:00.000Z",
    });

    const decision = evaluatePolicy(BASE_CONTEXT, {
      signedPolicyBundle: bundle,
      keyResolver: keyManager,
    });

    expect(decision).toEqual({
      decision: "deny",
      machineCode: POLICY_DECISION_MACHINE_CODES.DENY_CAPABILITY_DENIED,
      reasonCode: "policy.denied",
      policyVersion: "2026.03.23",
      correlationId: "corr.policy.001",
    });
  });

  it("keeps default deny when no explicit allow rules exist", () => {
    const { bundle, publicKeyPem } = createSignedBundle({
      rules: {
        deniedModels: ["model.blocked"],
      },
    });
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({
      keyId: "key.primary",
      publicKeyPem,
      createdAt: "2026-03-23T10:00:00.000Z",
    });

    const decision = evaluatePolicy(BASE_CONTEXT, {
      signedPolicyBundle: bundle,
      keyResolver: keyManager,
    });

    expect(decision).toEqual({
      decision: "deny",
      machineCode: POLICY_DECISION_MACHINE_CODES.DENY_POLICY_NO_ALLOW_RULES,
      reasonCode: "policy.denied",
      policyVersion: "2026.03.23",
      correlationId: "corr.policy.001",
    });
  });

  it("denies when signature verification fails", () => {
    const { bundle, publicKeyPem } = createSignedBundle();
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({
      keyId: "key.primary",
      publicKeyPem,
      createdAt: "2026-03-23T10:00:00.000Z",
    });

    const tamperedBundle: SignedPolicyBundle = {
      payload: bundle.payload,
      signature: {
        ...bundle.signature,
        value: "AAAA",
      },
    };

    const decision = evaluatePolicy(BASE_CONTEXT, {
      signedPolicyBundle: tamperedBundle,
      keyResolver: keyManager,
    });

    expect(decision).toEqual({
      decision: "deny",
      machineCode: POLICY_DECISION_MACHINE_CODES.DENY_SIGNATURE_INVALID,
      reasonCode: "policy.denied",
      policyVersion: "2026.03.23",
      correlationId: "corr.policy.001",
    });
  });

  it("denies expired policy bundles before evaluation", () => {
    const { bundle, publicKeyPem } = createSignedBundle({
      expiresAt: "2026-03-23T10:01:00.000Z",
    });
    const keyManager = new InMemoryPolicyKeyManager();
    keyManager.createKey({
      keyId: "key.primary",
      publicKeyPem,
      createdAt: "2026-03-23T10:00:00.000Z",
    });

    const decision = evaluatePolicy(BASE_CONTEXT, {
      signedPolicyBundle: bundle,
      keyResolver: keyManager,
      now: new Date("2026-03-23T10:02:00.000Z"),
    });

    expect(decision).toEqual({
      decision: "deny",
      machineCode: POLICY_DECISION_MACHINE_CODES.DENY_POLICY_EXPIRED,
      reasonCode: "request.expired",
      policyVersion: "2026.03.23",
      correlationId: "corr.policy.001",
    });
  });
});