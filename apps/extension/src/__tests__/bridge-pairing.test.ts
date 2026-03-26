import { createECDH } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createPairingCompletionData,
  parsePairingBeginPayload,
  parseBridgePairingState,
  wrapPairingKeyMaterial,
  unwrapPairingKeyMaterial,
  type PairingBeginPayload,
} from "../transport/bridge-pairing.js";

describe("bridge pairing helpers", () => {
  it("creates pairing completion proof and key material", async () => {
    const bridgeEcdh = createECDH("prime256v1");
    const bridgePublicKey = bridgeEcdh.generateKeys("hex", "uncompressed");
    const pairingBegin: PairingBeginPayload = {
      pairingSessionId: "ab".repeat(16),
      extensionId: "ext.runtime.test",
      hostName: "com.byom.bridge",
      curve: "P-256",
      bridgePublicKey,
      salt: "cd".repeat(16),
      iterations: 120_000,
      codeLength: 8,
      maxAttempts: 5,
      backoffBaseMs: 500,
      ttlMs: 120_000,
      createdAt: "2026-03-24T16:00:00.000Z",
      expiresAt: "2026-03-24T16:02:00.000Z",
    };

    const completion = await createPairingCompletionData({
      pairingBegin,
      pairingCode: "ABCDEFGH",
    });

    expect(completion.extensionPublicKey).toMatch(/^04[0-9a-f]{128}$/);
    expect(completion.proof).toMatch(/^[0-9a-f]{64}$/);
    expect(completion.pairingKeyHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("parses optional one-time code in pairing begin payload", () => {
    const bridgeEcdh = createECDH("prime256v1");
    const bridgePublicKey = bridgeEcdh.generateKeys("hex", "uncompressed");
    const parsed = parsePairingBeginPayload({
      pairingSessionId: "ab".repeat(16),
      extensionId: "ext.runtime.test",
      hostName: "com.byom.bridge",
      curve: "P-256",
      bridgePublicKey,
      salt: "cd".repeat(16),
      iterations: 120_000,
      codeLength: 8,
      maxAttempts: 5,
      backoffBaseMs: 500,
      ttlMs: 120_000,
      createdAt: "2026-03-24T16:00:00.000Z",
      expiresAt: "2026-03-24T16:02:00.000Z",
      oneTimeCode: "ab12cd34",
    });
    expect(parsed.oneTimeCode).toBe("AB12CD34");
  });

  it("wraps and unwraps pairing key material bound to runtime and handle", async () => {
    const wrapped = await wrapPairingKeyMaterial({
      pairingHandle: "pairh.abcdefabcdefabcdefabcdefabcdefab",
      extensionId: "ext.runtime.test",
      hostName: "com.byom.bridge",
      pairingKeyHex: "11".repeat(32),
      runtimeId: "ext.runtime.test",
      createdAt: "2026-03-24T16:00:00.000Z",
    });
    const parsed = parseBridgePairingState(wrapped);
    expect(parsed).toBeDefined();
    if (parsed === undefined) {
      return;
    }

    const unwrapped = await unwrapPairingKeyMaterial({
      pairingState: parsed,
      runtimeId: "ext.runtime.test",
    });
    expect(unwrapped).toBeDefined();
    if (unwrapped === undefined) {
      return;
    }
    expect(unwrapped.pairingHandle).toBe(wrapped.pairingHandle);
    expect(unwrapped.pairingKeyHex).toBe("11".repeat(32));

    const wrongRuntime = await unwrapPairingKeyMaterial({
      pairingState: parsed,
      runtimeId: "ext.runtime.other",
    });
    expect(wrongRuntime).toBeUndefined();
  });
});

