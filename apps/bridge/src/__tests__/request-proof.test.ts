import { describe, expect, it } from "vitest";

import {
  computeRequestPayloadHash,
  createRequestProof,
  verifyRequestProof,
} from "../cloud/request-proof.js";
import { RequestVerifier } from "../session/request-verifier.js";

const FIXED_NOW = new Date("2026-03-24T18:00:00.000Z");
const SESSION_TOKEN = "11".repeat(32);
const SESSION_KEY = Buffer.from(SESSION_TOKEN, "hex");

const CONNECTION_HANDLE = {
  connectionHandle:
    "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000111.0.sigproof",
  providerId: "provider.claude",
  methodId: "anthropic.api_key",
  extensionId: "ext-1",
  origin: "https://app.example.com",
  policyVersion: "pol.v2",
  endpointProfileHash: "sha256:endpoint-profile",
} as const;

function makeEnvelope(overrides: Partial<Record<string, unknown>> = {}) {
  const issuedAt = new Date(FIXED_NOW.getTime() - 30_000).toISOString();
  const expiresAt = new Date(FIXED_NOW.getTime() + 60_000).toISOString();

  return {
    protocolVersion: "1.0.0",
    requestId: "req.proof.001",
    correlationId: "cor.proof.001",
    origin: "https://app.example.com",
    sessionId: "ses.proof.001",
    capability: "chat.completions",
    providerId: "provider.claude",
    modelId: "model.a",
    issuedAt,
    expiresAt,
    nonce: "nonce-proof-000001",
    payload: {
      messages: [{ role: "user", content: "hello world" }],
      temperature: 0.2,
    },
    ...overrides,
  };
}

function makeProofPayload(
  envelope: ReturnType<typeof makeEnvelope>,
  overrides: Partial<Record<string, unknown>> = {},
) {
  const payloadHash = computeRequestPayloadHash(envelope.payload);
  const proof = createRequestProof({
    requestId: envelope.requestId,
    nonce: envelope.nonce,
    origin: envelope.origin,
    connectionHandle: CONNECTION_HANDLE.connectionHandle,
    payloadHash,
    sessionKey: SESSION_KEY,
  });

  return {
    requestId: envelope.requestId,
    nonce: envelope.nonce,
    origin: envelope.origin,
    connectionHandle: CONNECTION_HANDLE.connectionHandle,
    payloadHash,
    proof,
    ...overrides,
  };
}

describe("request-proof helper", () => {
  it("verifies a proof generated from canonical proof fields", () => {
    const envelope = makeEnvelope();
    const proofPayload = makeProofPayload(envelope);

    const verified = verifyRequestProof({
      requestId: proofPayload.requestId as string,
      nonce: proofPayload.nonce as string,
      origin: proofPayload.origin as string,
      connectionHandle: proofPayload.connectionHandle as string,
      payloadHash: proofPayload.payloadHash as string,
      proof: proofPayload.proof as string,
      sessionKey: SESSION_KEY,
    });

    expect(verified).toEqual({ ok: true });
  });

  it("rejects tampered proof material with request.replay_prone", () => {
    const envelope = makeEnvelope();
    const proofPayload = makeProofPayload(envelope);

    const tampered = verifyRequestProof({
      requestId: proofPayload.requestId as string,
      nonce: proofPayload.nonce as string,
      origin: proofPayload.origin as string,
      connectionHandle: proofPayload.connectionHandle as string,
      payloadHash: "sha256:tampered",
      proof: proofPayload.proof as string,
      sessionKey: SESSION_KEY,
    });

    expect(tampered.ok).toBe(false);
    if (!tampered.ok) {
      expect(tampered.error.reasonCode).toBe("request.replay_prone");
    }
  });
});

describe("RequestVerifier.verifyWithProof", () => {
  it("accepts a valid envelope + proof + bound connection handle", () => {
    const envelope = makeEnvelope();
    const proofPayload = makeProofPayload(envelope);

    const verifier = new RequestVerifier({
      now: () => FIXED_NOW,
      sessionKeyResolver: (sessionToken) =>
        sessionToken === SESSION_TOKEN
          ? {
              extensionId: CONNECTION_HANDLE.extensionId,
              sessionKey: SESSION_KEY,
            }
          : undefined,
    });

    const result = verifier.verifyWithProof(envelope, {
      sessionToken: SESSION_TOKEN,
      proof: proofPayload,
      connectionHandle: CONNECTION_HANDLE,
      extensionId: CONNECTION_HANDLE.extensionId,
      origin: CONNECTION_HANDLE.origin,
      policyVersion: CONNECTION_HANDLE.policyVersion,
      endpointProfileHash: CONNECTION_HANDLE.endpointProfileHash,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects request.check when proof does not match request payload hash", () => {
    const envelope = makeEnvelope();
    const proofPayload = makeProofPayload(envelope, {
      payloadHash: "sha256:deadbeef",
    });
    const forgedProof = createRequestProof({
      requestId: proofPayload.requestId as string,
      nonce: proofPayload.nonce as string,
      origin: proofPayload.origin as string,
      connectionHandle: proofPayload.connectionHandle as string,
      payloadHash: proofPayload.payloadHash as string,
      sessionKey: SESSION_KEY,
    });

    const verifier = new RequestVerifier({
      now: () => FIXED_NOW,
      sessionKeyResolver: () => ({
        extensionId: CONNECTION_HANDLE.extensionId,
        sessionKey: SESSION_KEY,
      }),
    });

    const result = verifier.verifyWithProof(envelope, {
      sessionToken: SESSION_TOKEN,
      proof: { ...proofPayload, proof: forgedProof },
      connectionHandle: CONNECTION_HANDLE,
      extensionId: CONNECTION_HANDLE.extensionId,
      origin: CONNECTION_HANDLE.origin,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe("request.replay_prone");
    }
  });

  it("rejects proof when handle binding metadata mismatches context", () => {
    const envelope = makeEnvelope({
      requestId: "req.proof.002",
      nonce: "nonce-proof-000002",
    });
    const proofPayload = makeProofPayload(envelope, {
      requestId: "req.proof.002",
      nonce: "nonce-proof-000002",
    });
    const proof = createRequestProof({
      requestId: proofPayload.requestId as string,
      nonce: proofPayload.nonce as string,
      origin: proofPayload.origin as string,
      connectionHandle: proofPayload.connectionHandle as string,
      payloadHash: proofPayload.payloadHash as string,
      sessionKey: SESSION_KEY,
    });

    const verifier = new RequestVerifier({
      now: () => FIXED_NOW,
      sessionKeyResolver: () => ({
        extensionId: CONNECTION_HANDLE.extensionId,
        sessionKey: SESSION_KEY,
      }),
    });

    const result = verifier.verifyWithProof(envelope, {
      sessionToken: SESSION_TOKEN,
      proof: { ...proofPayload, proof },
      connectionHandle: CONNECTION_HANDLE,
      extensionId: "ext-2",
      origin: CONNECTION_HANDLE.origin,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe("request.replay_prone");
    }
  });

  it("does not consume nonce when proof verification fails", () => {
    const envelope = makeEnvelope({
      requestId: "req.proof.003",
      nonce: "nonce-proof-000003",
    });

    const verifier = new RequestVerifier({
      now: () => FIXED_NOW,
      sessionKeyResolver: () => ({
        extensionId: CONNECTION_HANDLE.extensionId,
        sessionKey: SESSION_KEY,
      }),
    });

    const tamperedProof = makeProofPayload(envelope, {
      payloadHash: "sha256:tampered",
    });
    const rejected = verifier.verifyWithProof(envelope, {
      sessionToken: SESSION_TOKEN,
      proof: tamperedProof,
      connectionHandle: CONNECTION_HANDLE,
      extensionId: CONNECTION_HANDLE.extensionId,
      origin: CONNECTION_HANDLE.origin,
      policyVersion: CONNECTION_HANDLE.policyVersion,
      endpointProfileHash: CONNECTION_HANDLE.endpointProfileHash,
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.error.reasonCode).toBe("request.replay_prone");
    }

    const validProof = makeProofPayload(envelope);
    const accepted = verifier.verifyWithProof(envelope, {
      sessionToken: SESSION_TOKEN,
      proof: validProof,
      connectionHandle: CONNECTION_HANDLE,
      extensionId: CONNECTION_HANDLE.extensionId,
      origin: CONNECTION_HANDLE.origin,
      policyVersion: CONNECTION_HANDLE.policyVersion,
      endpointProfileHash: CONNECTION_HANDLE.endpointProfileHash,
    });
    expect(accepted.ok).toBe(true);
  });

  it("enforces authenticatedOriginMatcher during proof verification", () => {
    const envelope = makeEnvelope({
      requestId: "req.proof.004",
      nonce: "nonce-proof-000004",
    });
    const proofPayload = makeProofPayload(envelope, {
      requestId: "req.proof.004",
      nonce: "nonce-proof-000004",
    });

    const verifier = new RequestVerifier({
      now: () => FIXED_NOW,
      sessionKeyResolver: () => ({
        extensionId: CONNECTION_HANDLE.extensionId,
        sessionKey: SESSION_KEY,
      }),
      authenticatedOriginMatcher: (origin) => origin === "http://127.0.0.1:4172",
    });

    const result = verifier.verifyWithProof(envelope, {
      sessionToken: SESSION_TOKEN,
      proof: proofPayload,
      connectionHandle: CONNECTION_HANDLE,
      extensionId: CONNECTION_HANDLE.extensionId,
      origin: CONNECTION_HANDLE.origin,
      policyVersion: CONNECTION_HANDLE.policyVersion,
      endpointProfileHash: CONNECTION_HANDLE.endpointProfileHash,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe("auth.invalid");
    }
  });

  it("rejects proof verification when session token extension binding mismatches", () => {
    const envelope = makeEnvelope({
      requestId: "req.proof.005",
      nonce: "nonce-proof-000005",
    });
    const proofPayload = makeProofPayload(envelope, {
      requestId: "req.proof.005",
      nonce: "nonce-proof-000005",
    });

    const verifier = new RequestVerifier({
      now: () => FIXED_NOW,
      sessionKeyResolver: () => ({
        extensionId: "ext-other",
        sessionKey: SESSION_KEY,
      }),
    });

    const result = verifier.verifyWithProof(envelope, {
      sessionToken: SESSION_TOKEN,
      proof: proofPayload,
      connectionHandle: CONNECTION_HANDLE,
      extensionId: CONNECTION_HANDLE.extensionId,
      origin: CONNECTION_HANDLE.origin,
      policyVersion: CONNECTION_HANDLE.policyVersion,
      endpointProfileHash: CONNECTION_HANDLE.endpointProfileHash,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe("request.replay_prone");
      expect(result.error.message).toMatch(/session token extensionid binding/i);
    }
  });

  it("fails closed when session resolver omits extension binding metadata", () => {
    const envelope = makeEnvelope({
      requestId: "req.proof.006",
      nonce: "nonce-proof-000006",
    });
    const proofPayload = makeProofPayload(envelope, {
      requestId: "req.proof.006",
      nonce: "nonce-proof-000006",
    });

    const verifier = new RequestVerifier({
      now: () => FIXED_NOW,
      sessionKeyResolver: (() => Buffer.from(SESSION_KEY)) as unknown as (
        sessionToken: string,
      ) => {
        extensionId: string;
        sessionKey: Buffer;
      },
    });

    const result = verifier.verifyWithProof(envelope, {
      sessionToken: SESSION_TOKEN,
      proof: proofPayload,
      connectionHandle: CONNECTION_HANDLE,
      extensionId: CONNECTION_HANDLE.extensionId,
      origin: CONNECTION_HANDLE.origin,
      policyVersion: CONNECTION_HANDLE.policyVersion,
      endpointProfileHash: CONNECTION_HANDLE.endpointProfileHash,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe("auth.invalid");
    }
  });

  it("fails closed when authenticatedOriginMatcher throws", () => {
    const verifier = new RequestVerifier({
      now: () => FIXED_NOW,
      authenticatedOriginMatcher: () => {
        throw new Error("matcher failure");
      },
    });

    const result = verifier.verify(makeEnvelope());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe("auth.invalid");
    }
  });

  it("fails closed when session key resolver throws during proof verification", () => {
    const envelope = makeEnvelope({
      requestId: "req.proof.007",
      nonce: "nonce-proof-000007",
    });
    const proofPayload = makeProofPayload(envelope, {
      requestId: "req.proof.007",
      nonce: "nonce-proof-000007",
    });
    const verifier = new RequestVerifier({
      now: () => FIXED_NOW,
      sessionKeyResolver: () => {
        throw new Error("resolver failure");
      },
    });

    const result = verifier.verifyWithProof(envelope, {
      sessionToken: SESSION_TOKEN,
      proof: proofPayload,
      connectionHandle: CONNECTION_HANDLE,
      extensionId: CONNECTION_HANDLE.extensionId,
      origin: CONNECTION_HANDLE.origin,
      policyVersion: CONNECTION_HANDLE.policyVersion,
      endpointProfileHash: CONNECTION_HANDLE.endpointProfileHash,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reasonCode).toBe("auth.invalid");
    }
  });

  it("enforces consumed nonce capacity fail-closed", () => {
    const clock = { nowMs: FIXED_NOW.getTime() };
    const verifier = new RequestVerifier({
      now: () => new Date(clock.nowMs),
      maxConsumedNonces: 1,
      consumedNonceTtlMs: 120_000,
    });

    const first = verifier.verify(
      makeEnvelope({ requestId: "req.capacity.001", nonce: "nonce-capacity-000001" }),
    );
    expect(first.ok).toBe(true);

    const second = verifier.verify(
      makeEnvelope({ requestId: "req.capacity.002", nonce: "nonce-capacity-000002" }),
    );
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.reasonCode).toBe("request.replay_prone");
      expect(second.error.message).toMatch(/capacity/i);
    }
  });

  it("allows consumed nonce proofs when allowConsumedNonce is true at retention capacity", () => {
    const verifier = new RequestVerifier({
      now: () => FIXED_NOW,
      sessionKeyResolver: () => ({
        extensionId: CONNECTION_HANDLE.extensionId,
        sessionKey: SESSION_KEY,
      }),
      maxConsumedNonces: 1,
      consumedNonceTtlMs: 120_000,
    });

    const consumedNonce = "nonce-proof-capacity-000001";
    const seed = verifier.verify(
      makeEnvelope({
        requestId: "req.proof.capacity.seed",
        nonce: consumedNonce,
      }),
    );
    expect(seed.ok).toBe(true);

    const replayEnvelope = makeEnvelope({
      requestId: "req.proof.capacity.replay",
      nonce: consumedNonce,
    });
    const replayProof = makeProofPayload(replayEnvelope, {
      requestId: "req.proof.capacity.replay",
      nonce: consumedNonce,
    });

    const replay = verifier.verifyWithProof(replayEnvelope, {
      sessionToken: SESSION_TOKEN,
      proof: replayProof,
      connectionHandle: CONNECTION_HANDLE,
      extensionId: CONNECTION_HANDLE.extensionId,
      origin: CONNECTION_HANDLE.origin,
      policyVersion: CONNECTION_HANDLE.policyVersion,
      endpointProfileHash: CONNECTION_HANDLE.endpointProfileHash,
      allowConsumedNonce: true,
    });
    expect(replay.ok).toBe(true);
  });

  it("allows nonce reuse after retention TTL elapsed", () => {
    const clock = { nowMs: FIXED_NOW.getTime() };
    const verifier = new RequestVerifier({
      now: () => new Date(clock.nowMs),
      consumedNonceTtlMs: 5_000,
      maxConsumedNonces: 8,
    });

    const nonce = "nonce-ttl-reuse-000001";
    const first = verifier.verify(makeEnvelope({ requestId: "req.ttl.001", nonce }));
    expect(first.ok).toBe(true);

    clock.nowMs += 6_000;
    const second = verifier.verify(makeEnvelope({ requestId: "req.ttl.002", nonce }));
    expect(second.ok).toBe(true);
  });
});
