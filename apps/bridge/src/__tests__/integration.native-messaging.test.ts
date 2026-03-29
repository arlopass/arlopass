/**
 * Integration tests for the bridge mediation surface.
 *
 * Coverage:
 *  - connect/handshake â†’ session establishment
 *  - grant sync + request.check success path
 *  - unauthorized origin denial (no grant)
 *  - revoked grant immediate denial
 *  - invalid / expired envelope rejection
 *  - nonce replay rejection
 *  - wire-protocol integration through NativeHost
 */
import { createHmac } from "node:crypto";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it } from "vitest";

import { BridgeHandler } from "../bridge-handler.js";
import {
  computeRequestPayloadHash,
  createRequestProof,
} from "../cloud/request-proof.js";
import { HandshakeManager } from "../session/handshake.js";
import { PairingManager } from "../session/pairing.js";
import { RequestVerifier } from "../session/request-verifier.js";
import { SessionKeyRegistry } from "../session/session-key-registry.js";
import { RuntimeEnforcer } from "../permissions/runtime-enforcer.js";
import type { RuntimeGrant } from "../permissions/runtime-enforcer.js";
import { NativeHost } from "../native-host.js";
import type { CloudFeatureFlags } from "../config/cloud-feature-flags.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_EXTENSION_ID = "abcdefghabcdefghabcdefghabcdefgh";
const TEST_HOST_NAME = "com.arlopass.bridge";
const TEST_ORIGIN = "https://app.example.com";
const FIXED_NOW = new Date("2026-03-23T12:00:00.000Z");

// Deterministic 32-byte nonce for handshake tests.
const HANDSHAKE_NONCE_BYTES = Buffer.from("aa".repeat(32), "hex");
const HANDSHAKE_NONCE_HEX = HANDSHAKE_NONCE_BYTES.toString("hex");

// Token bytes used for the session token after the nonce is consumed.
const SESSION_TOKEN_BYTES = Buffer.from("bb".repeat(32), "hex");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTestHandshakeManager(): HandshakeManager {
  let callCount = 0;
  return new HandshakeManager({
    now: () => FIXED_NOW,
    generateBytes: (n: number) => {
      // Odd calls produce challenge nonces, even calls produce session tokens.
      callCount++;
      if (callCount % 2 === 1) return HANDSHAKE_NONCE_BYTES.subarray(0, n);
      return SESSION_TOKEN_BYTES.subarray(0, n);
    },
  });
}

function buildTestHandler(): BridgeHandler {
  const handshakeManager = buildTestHandshakeManager();

  const sessionKeyRegistry = new SessionKeyRegistry({ now: () => FIXED_NOW });
  const requestVerifier = new RequestVerifier({ now: () => FIXED_NOW });
  const enforcer = new RuntimeEnforcer({ now: () => FIXED_NOW });
  const pairingManager = new PairingManager();

  return new BridgeHandler({
    signingKey: Buffer.alloc(32, 0x01),
    handshakeManager,
    sessionKeyRegistry,
    requestVerifier,
    enforcer,
    pairingManager,
  });
}

/**
 * Performs a full HMAC handshake against the handler, returning the session
 * token that must be included in subsequent requests.
 */
async function performHandshake(handler: BridgeHandler): Promise<string> {
  // Auto-pair first
  const autoPairing = await handler.handle({
    type: "pairing.auto",
    extensionId: TEST_EXTENSION_ID,
    hostName: TEST_HOST_NAME,
  });
  const pairingHandle = (autoPairing as Record<string, string>)["pairingHandle"] ?? "";
  const pairingKeyHex = (autoPairing as Record<string, string>)["pairingKeyHex"] ?? "";
  const pairingSecret = Buffer.from(pairingKeyHex, "hex");

  const challenge = await handler.handle({ type: "handshake.challenge" });
  const nonce = (challenge as Record<string, string>)["nonce"] ?? "";
  const hmac = computeExpectedHmac(nonce, pairingSecret);
  const verify = await handler.handle({
    type: "handshake.verify",
    nonce,
    hmac,
    extensionId: TEST_EXTENSION_ID,
    hostName: TEST_HOST_NAME,
    pairingHandle,
  });
  return (verify as Record<string, string>)["sessionToken"] ?? "";
}

function computeExpectedHmac(nonce: string, secret: Buffer): string {
  return createHmac("sha256", secret).update(nonce).digest("hex");
}

/**
 * Creates a minimal valid envelope against FIXED_NOW:
 *  - issuedAt  = FIXED_NOW âˆ’ 30 s  (within 30 s clock-skew limit)
 *  - expiresAt = FIXED_NOW + 3 min  (4 min lifetime < 5 min limit)
 */
function makeEnvelope(nonce: string, origin = TEST_ORIGIN): Record<string, unknown> {
  const issuedAt = new Date(FIXED_NOW.getTime() - 30_000).toISOString();
  const expiresAt = new Date(FIXED_NOW.getTime() + 3 * 60_000).toISOString();
  return {
    protocolVersion: "1.0.0",
    requestId: `req.${nonce.slice(0, 12)}`,
    correlationId: `cor.${nonce.slice(0, 12)}`,
    origin,
    sessionId: "ses.test.001",
    capability: "chat.completions",
    providerId: "provider.a",
    modelId: "model.a",
    issuedAt,
    expiresAt,
    nonce,
    payload: null,
  };
}

function makeGrant(overrides: Partial<RuntimeGrant> = {}): RuntimeGrant {
  return {
    id: "grant.integration.001",
    origin: TEST_ORIGIN,
    capability: "chat.completions",
    providerId: "provider.a",
    modelId: "model.a",
    grantType: "persistent",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// NativeHost wire-protocol helpers
// ---------------------------------------------------------------------------

function encodeNativeFrame(msg: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(msg), "utf8");
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

function decodeNativeFrames(data: Buffer): unknown[] {
  const messages: unknown[] = [];
  let offset = 0;
  while (offset + 4 <= data.length) {
    const len = data.readUInt32LE(offset);
    offset += 4;
    if (offset + len > data.length) break;
    messages.push(JSON.parse(data.subarray(offset, offset + len).toString("utf8")));
    offset += len;
  }
  return messages;
}

async function runWireScenario(
  handler: BridgeHandler,
  messages: unknown[],
): Promise<unknown[]> {
  const inputStream = new PassThrough();
  const outputChunks: Buffer[] = [];

  const outputStream = new Writable({
    write(chunk: Buffer, _enc: BufferEncoding, cb: (err?: Error | null) => void) {
      outputChunks.push(chunk);
      cb();
    },
  });

  const host = new NativeHost({
    input: inputStream,
    output: outputStream,
    handler: (msg) => handler.handle(msg),
  });

  const runPromise = host.run();

  for (const msg of messages) {
    inputStream.push(encodeNativeFrame(msg));
  }
  inputStream.push(null); // EOF

  await runPromise;
  return decodeNativeFrames(Buffer.concat(outputChunks));
}

// ---------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------

describe("BridgeHandler â€” handshake", () => {
  it("issues a challenge with a nonce, issuedAt, and expiresAt", async () => {
    const handler = buildTestHandler();
    const response = await handler.handle({ type: "handshake.challenge" });

    expect(response).toMatchObject({
      type: "handshake.challenge",
      nonce: HANDSHAKE_NONCE_HEX,
      issuedAt: FIXED_NOW.toISOString(),
    });
    expect(typeof (response as Record<string, unknown>)["expiresAt"]).toBe("string");
  });

  it("completes the handshake and returns a session token for a correct HMAC", async () => {
    const handler = buildTestHandler();

    const pairResp = await handler.handle({
      type: "pairing.auto",
      extensionId: TEST_EXTENSION_ID,
      hostName: TEST_HOST_NAME,
    });
    const pairingHandle = (pairResp as Record<string, string>)["pairingHandle"] ?? "";
    const pairingKeyHex = (pairResp as Record<string, string>)["pairingKeyHex"] ?? "";
    const pairingSecret = Buffer.from(pairingKeyHex, "hex");

    await handler.handle({ type: "handshake.challenge" });

    const hmac = computeExpectedHmac(HANDSHAKE_NONCE_HEX, pairingSecret);
    const response = await handler.handle({
      type: "handshake.verify",
      nonce: HANDSHAKE_NONCE_HEX,
      hmac,
      extensionId: TEST_EXTENSION_ID,
      hostName: TEST_HOST_NAME,
      pairingHandle,
    });

    expect(response).toMatchObject({
      type: "handshake.session",
      sessionToken: SESSION_TOKEN_BYTES.toString("hex"),
      extensionId: TEST_EXTENSION_ID,
      establishedAt: FIXED_NOW.toISOString(),
      expiresAt: new Date(
        FIXED_NOW.getTime() + 5 * 60_000,
      ).toISOString(),
    });
    expect((response as Record<string, unknown>)["sessionToken"]).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("rejects handshake.verify with an incorrect HMAC", async () => {
    const handler = buildTestHandler();

    const pairResp = await handler.handle({
      type: "pairing.auto",
      extensionId: TEST_EXTENSION_ID,
      hostName: TEST_HOST_NAME,
    });
    const pairingHandle = (pairResp as Record<string, string>)["pairingHandle"] ?? "";

    await handler.handle({ type: "handshake.challenge" });

    const response = await handler.handle({
      type: "handshake.verify",
      nonce: HANDSHAKE_NONCE_HEX,
      hmac: "00".repeat(32), // wrong HMAC
      extensionId: TEST_EXTENSION_ID,
      hostName: TEST_HOST_NAME,
      pairingHandle,
    });

    expect(response).toMatchObject({ type: "error", reasonCode: "auth.invalid" });
  });

  it("rejects a replayed nonce", async () => {
    const handler = buildTestHandler();

    const pairResp = await handler.handle({
      type: "pairing.auto",
      extensionId: TEST_EXTENSION_ID,
      hostName: TEST_HOST_NAME,
    });
    const pairingHandle = (pairResp as Record<string, string>)["pairingHandle"] ?? "";
    const pairingKeyHex = (pairResp as Record<string, string>)["pairingKeyHex"] ?? "";
    const pairingSecret = Buffer.from(pairingKeyHex, "hex");

    await handler.handle({ type: "handshake.challenge" });

    const hmac = computeExpectedHmac(HANDSHAKE_NONCE_HEX, pairingSecret);
    const verifyMsg = {
      type: "handshake.verify",
      nonce: HANDSHAKE_NONCE_HEX,
      hmac,
      extensionId: TEST_EXTENSION_ID,
      hostName: TEST_HOST_NAME,
      pairingHandle,
    };

    await handler.handle(verifyMsg); // first verify: succeeds
    const replayed = await handler.handle(verifyMsg); // second: replay

    expect(replayed).toMatchObject({ type: "error", reasonCode: "auth.invalid" });
  });

  it("rejects handshake.verify for a nonce that was never issued", async () => {
    const handler = buildTestHandler();
    const unknownNonce = "cc".repeat(32);
    const hmac = computeExpectedHmac(unknownNonce, Buffer.alloc(32, 0xff));

    const response = await handler.handle({
      type: "handshake.verify",
      nonce: unknownNonce,
      hmac,
      extensionId: TEST_EXTENSION_ID,
      hostName: TEST_HOST_NAME,
      pairingHandle: "pairh.nonexistent",
    });

    expect(response).toMatchObject({ type: "error", reasonCode: "auth.invalid" });
  });

  it("returns an explicit error for missing handshake.verify fields", async () => {
    const handler = buildTestHandler();

    const response = await handler.handle({
      type: "handshake.verify",
      // missing nonce, hmac, extensionId
    });

    expect(response).toMatchObject({ type: "error", reasonCode: "request.invalid" });
  });

  it("rejects handshake when extension ID is not in the allowlist", async () => {
    const pairingManager = new PairingManager();
    const handler = new BridgeHandler({
      signingKey: Buffer.alloc(32, 0x01),
      handshakeManager: buildTestHandshakeManager(),
      sessionKeyRegistry: new SessionKeyRegistry({ now: () => FIXED_NOW }),
      pairingManager,
      extensionIdAllowlist: [
        { extensionId: "pppppppppppppppppppppppppppppppp", browser: "chrome" },
      ],
    });

    // With pairing-based auth, the allowlist is enforced at pairing.auto time
    const response = await handler.handle({
      type: "pairing.auto",
      extensionId: TEST_EXTENSION_ID,
      hostName: TEST_HOST_NAME,
    });

    expect(response).toMatchObject({
      type: "error",
      reasonCode: "auth.invalid",
    });
  });

  it("accepts handshake when extension ID is in the allowlist", async () => {
    const pairingManager = new PairingManager();
    const handler = new BridgeHandler({
      signingKey: Buffer.alloc(32, 0x01),
      handshakeManager: buildTestHandshakeManager(),
      sessionKeyRegistry: new SessionKeyRegistry({ now: () => FIXED_NOW }),
      pairingManager,
      extensionIdAllowlist: [
        { extensionId: TEST_EXTENSION_ID, browser: "chrome" },
        { extensionId: "arlopass-wallet@arlopass.com", browser: "firefox" },
      ],
    });

    const pairResp = await handler.handle({
      type: "pairing.auto",
      extensionId: TEST_EXTENSION_ID,
      hostName: TEST_HOST_NAME,
    });
    const pairingHandle = (pairResp as Record<string, string>)["pairingHandle"] ?? "";
    const pairingKeyHex = (pairResp as Record<string, string>)["pairingKeyHex"] ?? "";
    const pairingSecret = Buffer.from(pairingKeyHex, "hex");

    await handler.handle({ type: "handshake.challenge" });
    const hmac = computeExpectedHmac(HANDSHAKE_NONCE_HEX, pairingSecret);
    const response = await handler.handle({
      type: "handshake.verify",
      nonce: HANDSHAKE_NONCE_HEX,
      hmac,
      extensionId: TEST_EXTENSION_ID,
      hostName: TEST_HOST_NAME,
      pairingHandle,
    });

    expect(response).toMatchObject({
      type: "handshake.session",
      extensionId: TEST_EXTENSION_ID,
    });
  });

  it("accepts Firefox add-on ID in the allowlist", async () => {
    const pairingManager = new PairingManager();
    const handler = new BridgeHandler({
      signingKey: Buffer.alloc(32, 0x01),
      handshakeManager: buildTestHandshakeManager(),
      sessionKeyRegistry: new SessionKeyRegistry({ now: () => FIXED_NOW }),
      pairingManager,
      extensionIdAllowlist: [
        { extensionId: "arlopass-wallet@arlopass.com", browser: "firefox" },
      ],
    });

    const pairResp = await handler.handle({
      type: "pairing.auto",
      extensionId: "arlopass-wallet@arlopass.com",
      hostName: TEST_HOST_NAME,
    });
    const pairingHandle = (pairResp as Record<string, string>)["pairingHandle"] ?? "";
    const pairingKeyHex = (pairResp as Record<string, string>)["pairingKeyHex"] ?? "";
    const pairingSecret = Buffer.from(pairingKeyHex, "hex");

    await handler.handle({ type: "handshake.challenge" });
    const hmac = computeExpectedHmac(HANDSHAKE_NONCE_HEX, pairingSecret);
    const response = await handler.handle({
      type: "handshake.verify",
      nonce: HANDSHAKE_NONCE_HEX,
      hmac,
      extensionId: "arlopass-wallet@arlopass.com",
      hostName: TEST_HOST_NAME,
      pairingHandle,
    });

    expect(response).toMatchObject({
      type: "handshake.session",
      extensionId: "arlopass-wallet@arlopass.com",
    });
  });

  it("skips allowlist validation when no allowlist is configured", async () => {
    const handler = buildTestHandler(); // no extensionIdAllowlist

    const pairResp = await handler.handle({
      type: "pairing.auto",
      extensionId: TEST_EXTENSION_ID,
      hostName: TEST_HOST_NAME,
    });
    const pairingHandle = (pairResp as Record<string, string>)["pairingHandle"] ?? "";
    const pairingKeyHex = (pairResp as Record<string, string>)["pairingKeyHex"] ?? "";
    const pairingSecret = Buffer.from(pairingKeyHex, "hex");

    await handler.handle({ type: "handshake.challenge" });
    const hmac = computeExpectedHmac(HANDSHAKE_NONCE_HEX, pairingSecret);
    const response = await handler.handle({
      type: "handshake.verify",
      nonce: HANDSHAKE_NONCE_HEX,
      hmac,
      extensionId: TEST_EXTENSION_ID,
      hostName: TEST_HOST_NAME,
      pairingHandle,
    });

    expect(response).toMatchObject({
      type: "handshake.session",
      extensionId: TEST_EXTENSION_ID,
    });
  });
});

// ---------------------------------------------------------------------------
// Grant sync and revoke
// ---------------------------------------------------------------------------

describe("BridgeHandler â€” grant sync and revoke", () => {
  it("acknowledges grant.sync and makes the grant available for enforcement", async () => {
    const handler = buildTestHandler();
    const sessionToken = await performHandshake(handler);
    const grant = makeGrant();

    const ack = await handler.handle({ type: "grant.sync", sessionToken, grant });

    expect(ack).toMatchObject({ type: "grant.sync.ack", grantId: grant.id });
  });

  it("acknowledges grant.revoke", async () => {
    const handler = buildTestHandler();
    const sessionToken = await performHandshake(handler);

    const ack = await handler.handle({ type: "grant.revoke", sessionToken, grantId: "grant.xyz" });

    expect(ack).toMatchObject({ type: "grant.revoke.ack", grantId: "grant.xyz" });
  });

  it("returns an error for grant.sync with a non-object grant", async () => {
    const handler = buildTestHandler();
    const sessionToken = await performHandshake(handler);

    const response = await handler.handle({ type: "grant.sync", sessionToken, grant: "not-an-object" });

    expect(response).toMatchObject({ type: "error", reasonCode: "request.invalid" });
  });

  it("returns an error for grant.sync with missing required grant fields", async () => {
    const handler = buildTestHandler();
    const sessionToken = await performHandshake(handler);

    const response = await handler.handle({
      type: "grant.sync",
      sessionToken,
      grant: { id: "g1" }, // missing origin, capability, etc.
    });

    expect(response).toMatchObject({ type: "error", reasonCode: "request.invalid" });
  });

  it("returns an error for grant.revoke without a grantId string", async () => {
    const handler = buildTestHandler();
    const sessionToken = await performHandshake(handler);

    const response = await handler.handle({ type: "grant.revoke", sessionToken });

    expect(response).toMatchObject({ type: "error", reasonCode: "request.invalid" });
  });
});

// ---------------------------------------------------------------------------
// Request check â€” success path (connect/consent/request)
// ---------------------------------------------------------------------------

describe("BridgeHandler â€” request.check success path", () => {
  it("allows a request when a matching persistent grant is present", async () => {
    const handler = buildTestHandler();
    const sessionToken = await performHandshake(handler);
    const grant = makeGrant();

    await handler.handle({ type: "grant.sync", sessionToken, grant });

    const response = await handler.handle({
      type: "request.check",
      sessionToken,
      envelope: makeEnvelope("nonce-alpha-success-0001"),
    });

    expect(response).toMatchObject({
      type: "request.allowed",
      grantId: grant.id,
      consumed: false,
    });
  });

  it("allows a wildcard-provider grant to match a concrete request", async () => {
    const handler = buildTestHandler();
    const sessionToken = await performHandshake(handler);
    const grant = makeGrant({
      id: "grant.wildcard.001", providerId: "*", modelId: "*",
      capability: "provider.list"
    });

    await handler.handle({ type: "grant.sync", sessionToken, grant });

    const envelope = makeEnvelope("nonce-wildcard-success-002");
    const envelopeWithCap = { ...envelope, capability: "provider.list" };
    const response = await handler.handle({
      type: "request.check",
      sessionToken,
      envelope: envelopeWithCap,
    });

    expect(response).toMatchObject({ type: "request.allowed", grantId: grant.id });
  });

  it("consumes a one-time grant on the first evaluation", async () => {
    const handler = buildTestHandler();
    const sessionToken = await performHandshake(handler);
    const oneTimeGrant = makeGrant({
      id: "grant.onetime.001",
      grantType: "one-time",
    });

    await handler.handle({ type: "grant.sync", sessionToken, grant: oneTimeGrant });

    const first = await handler.handle({
      type: "request.check",
      sessionToken,
      envelope: makeEnvelope("nonce-onetime-first-0003"),
    });
    expect(first).toMatchObject({ type: "request.allowed", consumed: true });

    // Second evaluation: grant is consumed, must be denied.
    const second = await handler.handle({
      type: "request.check",
      sessionToken,
      envelope: makeEnvelope("nonce-onetime-second-004"),
    });
    expect(second).toMatchObject({ type: "request.denied", reasonCode: "permission.denied" });
  });
});

// ---------------------------------------------------------------------------
// Request check â€” denial paths
// ---------------------------------------------------------------------------

describe("BridgeHandler â€” request.check denial paths", () => {
  it("denies a request when no grant is present (unauthorized origin)", async () => {
    const handler = buildTestHandler();
    const sessionToken = await performHandshake(handler);

    const response = await handler.handle({
      type: "request.check",
      sessionToken,
      envelope: makeEnvelope("nonce-unauth-deny-000005"),
    });

    expect(response).toMatchObject({
      type: "request.denied",
      reasonCode: "permission.denied",
    });
  });

  it("denies a request immediately after the grant is revoked", async () => {
    const handler = buildTestHandler();
    const sessionToken = await performHandshake(handler);
    const grant = makeGrant({ id: "grant.revoke.test.001" });

    await handler.handle({ type: "grant.sync", sessionToken, grant });
    await handler.handle({ type: "grant.revoke", sessionToken, grantId: grant.id });

    const response = await handler.handle({
      type: "request.check",
      sessionToken,
      envelope: makeEnvelope("nonce-revoke-deny-00006"),
    });

    expect(response).toMatchObject({
      type: "request.denied",
      reasonCode: "permission.denied",
    });
  });

  it("denies a request from a different origin than the synced grant", async () => {
    const handler = buildTestHandler();
    const sessionToken = await performHandshake(handler);
    const grant = makeGrant({ id: "grant.origin.mismatch.001" });

    await handler.handle({ type: "grant.sync", sessionToken, grant });

    const response = await handler.handle({
      type: "request.check",
      sessionToken,
      envelope: makeEnvelope("nonce-origin-mismatch-07", "https://other.example.com"),
    });

    expect(response).toMatchObject({
      type: "request.denied",
      reasonCode: "permission.denied",
    });
  });

  it("returns an error for an expired envelope", async () => {
    const handler = buildTestHandler();
    const sessionToken = await performHandshake(handler);
    const grant = makeGrant();

    await handler.handle({ type: "grant.sync", sessionToken, grant });

    // Envelope that expired 1 second before FIXED_NOW.
    const expiredEnvelope = {
      protocolVersion: "1.0.0",
      requestId: "req.expired.001",
      correlationId: "cor.expired.001",
      origin: TEST_ORIGIN,
      sessionId: "ses.test.001",
      capability: "chat.completions",
      providerId: "provider.a",
      modelId: "model.a",
      issuedAt: new Date(FIXED_NOW.getTime() - 120_000).toISOString(),
      expiresAt: new Date(FIXED_NOW.getTime() - 1_000).toISOString(),
      nonce: "nonce-expired-envelope-00008",
      payload: null,
    };

    const response = await handler.handle({
      type: "request.check",
      sessionToken,
      envelope: expiredEnvelope,
    });

    expect(response).toMatchObject({ type: "error", reasonCode: "request.expired" });
  });

  it("returns an error for a replayed request nonce", async () => {
    const handler = buildTestHandler();
    const sessionToken = await performHandshake(handler);
    const grant = makeGrant();

    await handler.handle({ type: "grant.sync", sessionToken, grant });

    const sharedEnvelope = makeEnvelope("nonce-replay-test-000009");
    await handler.handle({ type: "request.check", sessionToken, envelope: sharedEnvelope });
    const replayed = await handler.handle({
      type: "request.check",
      sessionToken,
      envelope: sharedEnvelope,
    });

    expect(replayed).toMatchObject({ type: "error", reasonCode: "request.replay_prone" });
  });

  it("returns an explicit error for an unknown message type", async () => {
    const handler = buildTestHandler();

    const response = await handler.handle({ type: "unknown.command" });

    expect(response).toMatchObject({ type: "error", reasonCode: "auth.required" });
  });
});

// ---------------------------------------------------------------------------
// Wire-protocol integration through NativeHost
// ---------------------------------------------------------------------------

describe("NativeHost wire-protocol integration", () => {
  it("processes grant.sync â†’ request.check â†’ allowed through the wire protocol", async () => {
    let wireCallCount = 0;
    const wireHandshakeBytes = Buffer.from("dd".repeat(32), "hex");
    const wireTokenBytes = Buffer.from("ee".repeat(32), "hex");
    const wireSessionTokenHex = wireTokenBytes.toString("hex");

    const handshakeManager = new HandshakeManager({
      now: () => FIXED_NOW,
      generateBytes: (n: number) => {
        wireCallCount++;
        return wireCallCount % 2 === 1
          ? wireHandshakeBytes.subarray(0, n)
          : wireTokenBytes.subarray(0, n);
      },
    });

    const pairingManager = new PairingManager();
    const handler = new BridgeHandler({
      signingKey: Buffer.alloc(32, 0x01),
      handshakeManager,
      sessionKeyRegistry: new SessionKeyRegistry({ now: () => FIXED_NOW }),
      requestVerifier: new RequestVerifier({ now: () => FIXED_NOW }),
      enforcer: new RuntimeEnforcer({ now: () => FIXED_NOW }),
      pairingManager,
    });

    const pairResp = await handler.handle({
      type: "pairing.auto",
      extensionId: TEST_EXTENSION_ID,
      hostName: TEST_HOST_NAME,
    });
    const pairingHandle = (pairResp as Record<string, string>)["pairingHandle"] ?? "";
    const pairingKeyHex = (pairResp as Record<string, string>)["pairingKeyHex"] ?? "";
    const pairingSecret = Buffer.from(pairingKeyHex, "hex");

    const wireNonceHex = wireHandshakeBytes.toString("hex");
    const wireHmac = computeExpectedHmac(wireNonceHex, pairingSecret);
    const grant = makeGrant({ id: "grant.wire.001" });
    const messages = [
      { type: "handshake.challenge" },
      { type: "handshake.verify", nonce: wireNonceHex, hmac: wireHmac, extensionId: TEST_EXTENSION_ID, hostName: TEST_HOST_NAME, pairingHandle },
      { type: "grant.sync", sessionToken: wireSessionTokenHex, grant },
      { type: "request.check", sessionToken: wireSessionTokenHex, envelope: makeEnvelope("nonce-wire-allowed-0010") },
    ];

    const responses = await runWireScenario(handler, messages);

    expect(responses).toHaveLength(4);
    expect(responses[2]).toMatchObject({ type: "grant.sync.ack", grantId: grant.id });
    expect(responses[3]).toMatchObject({
      type: "request.allowed",
      grantId: grant.id,
      consumed: false,
    });
  });

  it("denies a request.check for an origin with no grant through the wire protocol", async () => {
    const handler = buildTestHandler();
    const sessionToken = await performHandshake(handler);

    const messages = [
      { type: "request.check", sessionToken, envelope: makeEnvelope("nonce-wire-denied-0011") },
    ];

    const responses = await runWireScenario(handler, messages);

    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({
      type: "request.denied",
      reasonCode: "permission.denied",
    });
  });

  it("denies after revocation through the wire protocol", async () => {
    const handler = buildTestHandler();
    const sessionToken = await performHandshake(handler);

    const grant = makeGrant({ id: "grant.wire.revoke.001" });
    const messages = [
      { type: "grant.sync", sessionToken, grant },
      { type: "grant.revoke", sessionToken, grantId: grant.id },
      { type: "request.check", sessionToken, envelope: makeEnvelope("nonce-wire-revoked-0012") },
    ];

    const responses = await runWireScenario(handler, messages);

    expect(responses).toHaveLength(3);
    expect(responses[2]).toMatchObject({
      type: "request.denied",
      reasonCode: "permission.denied",
    });
  });

  it("routes cloud chat execution through cloud.chat.execute wire messages", async () => {
    let receivedRequest: Record<string, unknown> | undefined;
    const cloudChatExecutor = {
      execute: async (request: Record<string, unknown>) => {
        receivedRequest = request;
        return {
          correlationId: "corr.cloud.wire.001",
          providerId: "provider.claude",
          methodId: "anthropic.api_key",
          modelId: "claude-sonnet-4-5",
          region: "us-east-1",
          content: "Cloud bridge response",
        };
      },
    };
    let handshakeByteCallCount = 0;
    const handshakeManager = new HandshakeManager({
      now: () => FIXED_NOW,
      generateBytes: (length: number) => {
        handshakeByteCallCount += 1;
        const source =
          handshakeByteCallCount === 1
            ? HANDSHAKE_NONCE_BYTES
            : SESSION_TOKEN_BYTES;
        return source.subarray(0, length);
      },
    });
    const modelId = "claude-sonnet-4-5";
    const requestMessages = [{ role: "user", content: "hello cloud" }] as const;
    const requestId = "req.cloud.wire.001";
    const nonce = "nonce-cloud-wire-001";
    const payloadHash = computeRequestPayloadHash({
      messages: requestMessages,
      modelId,
    });
    const requestProof = {
      requestId,
      nonce,
      origin: TEST_ORIGIN,
      connectionHandle:
        "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
      payloadHash,
      proof: createRequestProof({
        requestId,
        nonce,
        origin: TEST_ORIGIN,
        connectionHandle:
          "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
        payloadHash,
        sessionKey: SESSION_TOKEN_BYTES,
      }),
    };
    const pairingManager = new PairingManager();
    const handler = new BridgeHandler({
      signingKey: Buffer.alloc(32, 0x01),
      handshakeManager,
      sessionKeyRegistry: new SessionKeyRegistry({ now: () => FIXED_NOW }),
      cloudChatExecutor,
      pairingManager,
      cloudFeatureFlags: {
        cloudBrokerV2Enabled: true,
        cloudMethodAllowlist: {
          "anthropic.api_key": true,
        },
      },
    });

    const pairResp = await handler.handle({
      type: "pairing.auto",
      extensionId: TEST_EXTENSION_ID,
      hostName: TEST_HOST_NAME,
    });
    const pairingHandle = (pairResp as Record<string, string>)["pairingHandle"] ?? "";
    const pairingKeyHex = (pairResp as Record<string, string>)["pairingKeyHex"] ?? "";
    const pairingSecret = Buffer.from(pairingKeyHex, "hex");

    const responses = await runWireScenario(handler, [
      {
        type: "handshake.challenge",
      },
      {
        type: "handshake.verify",
        nonce: HANDSHAKE_NONCE_HEX,
        hmac: computeExpectedHmac(HANDSHAKE_NONCE_HEX, pairingSecret),
        extensionId: TEST_EXTENSION_ID,
        hostName: TEST_HOST_NAME,
        pairingHandle,
      },
      {
        type: "cloud.chat.execute",
        correlationId: "corr.cloud.wire.001",
        tenantId: "tenant-a",
        origin: TEST_ORIGIN,
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        modelId,
        region: "us-east-1",
        extensionId: TEST_EXTENSION_ID,
        handshakeSessionToken: SESSION_TOKEN_BYTES.toString("hex"),
        requestProof,
        connectionHandle:
          "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
        policyVersion: "pol.v2",
        endpointProfileHash: "sha256:endpoint-profile",
        messages: requestMessages,
      },
    ]);

    expect(receivedRequest).toMatchObject({
      correlationId: "corr.cloud.wire.001",
      tenantId: "tenant-a",
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      modelId: "claude-sonnet-4-5",
    });
    expect(responses).toHaveLength(3);
    expect(responses[0]).toMatchObject({
      type: "handshake.challenge",
      nonce: HANDSHAKE_NONCE_HEX,
    });
    expect(responses[1]).toMatchObject({
      type: "handshake.session",
      extensionId: TEST_EXTENSION_ID,
      sessionToken: SESSION_TOKEN_BYTES.toString("hex"),
    });
    expect(responses[2]).toMatchObject({
      type: "cloud.chat.result",
      correlationId: "corr.cloud.wire.001",
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      modelId: "claude-sonnet-4-5",
      region: "us-east-1",
      content: "Cloud bridge response",
    });
  });

  it("propagates auth.expired during cloud.connection.validate over wire protocol", async () => {
    const cloudFeatureFlags: CloudFeatureFlags = {
      cloudBrokerV2Enabled: true,
      cloudMethodAllowlist: {
        "anthropic.api_key": true,
      },
    };
    const cloudConnectionService = {
      beginConnection: async () => ({ challenge: "unused" }),
      completeConnection: async () => ({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        credentialRef: "cred.001",
        connectionHandle:
          "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
        endpointProfileHash: "sha256:endpoint-profile",
      }),
      validateConnection: async () => {
        throw Object.assign(
          new Error("Credential revoked api_key=sk-secret token=abc"),
          { reasonCode: "auth.expired" },
        );
      },
      resolveConnectionBinding: async () => ({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        connectionHandle:
          "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
        extensionId: "ext.runtime.transport",
        origin: "https://app.example.com",
        policyVersion: "pol.v2",
        endpointProfileHash: "sha256:endpoint-profile",
        epoch: 0,
      }),
      revokeConnection: async () => ({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        revoked: true,
      }),
      discoverModels: async () => ({
        providerId: "provider.claude",
        models: [],
        cacheStatus: "hot" as const,
      }),
      discoverCapabilities: async () => ({
        providerId: "provider.claude",
        capabilities: [],
        cacheStatus: "hot" as const,
      }),
      refreshDiscovery: async () => ({
        providerId: "provider.claude",
        models: [],
        capabilities: [],
        cacheStatus: "refreshed" as const,
      }),
    };
    const handler = new BridgeHandler({
      signingKey: Buffer.alloc(32, 0x01),
      cloudConnectionService,
      cloudFeatureFlags,
    });
    const sessionToken = await performHandshake(handler);

    const responses = await runWireScenario(handler, [
      {
        type: "cloud.connection.validate",
        sessionToken,
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        connectionHandle:
          "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
      },
    ]);

    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({
      type: "error",
      reasonCode: "auth.expired",
    });
  });
});

// ---------------------------------------------------------------------------
// Session gate security â€” unauthenticated operations must be rejected
// ---------------------------------------------------------------------------

describe("BridgeHandler â€” session gate rejects unauthenticated operations", () => {
  const sensitiveMessageTypes: readonly { type: string; extra?: Record<string, unknown> }[] = [
    { type: "grant.sync", extra: { grant: makeGrant({ id: "gate-test" }) } },
    { type: "grant.revoke", extra: { grantId: "gate-test" } },
    { type: "request.check", extra: { envelope: makeEnvelope("gate-nonce-001") } },
    { type: "cli.chat.execute", extra: { prompt: "hello" } },
    { type: "cli.models.list" },
    { type: "cloud.connection.begin", extra: { providerId: "p", methodId: "m" } },
    { type: "cloud.connection.complete" },
    { type: "cloud.connection.validate" },
    { type: "cloud.models.discover" },
    { type: "cloud.chat.execute" },
    { type: "pairing.list" },
    { type: "pairing.revoke", extra: { pairingHandle: "pairh.test" } },
  ];

  for (const { type, extra } of sensitiveMessageTypes) {
    it(`rejects ${type} without a session token`, async () => {
      const handler = buildTestHandler();
      const response = await handler.handle({ type, ...extra });
      expect(response).toMatchObject({
        type: "error",
        reasonCode: "auth.required",
      });
    });

    it(`rejects ${type} with an invalid session token`, async () => {
      const handler = buildTestHandler();
      const response = await handler.handle({
        type,
        sessionToken: "ff".repeat(32),
        ...extra,
      });
      expect(response).toMatchObject({
        type: "error",
        reasonCode: "auth.expired",
      });
    });
  }

  it("allows handshake.challenge without a session token", async () => {
    const handler = buildTestHandler();
    const response = await handler.handle({ type: "handshake.challenge" });
    expect(response).toMatchObject({ type: "handshake.challenge" });
  });

  it("allows pairing.begin without a session token", async () => {
    const handler = buildTestHandler();
    const response = await handler.handle({
      type: "pairing.begin",
      extensionId: TEST_EXTENSION_ID,
      hostName: "com.arlopass.bridge",
    });
    // Should not be auth.required â€” pairing.begin doesn't need a session
    expect((response as Record<string, unknown>)["reasonCode"]).not.toBe("auth.required");
  });
});
