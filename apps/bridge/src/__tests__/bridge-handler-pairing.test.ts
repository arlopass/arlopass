import { createECDH, createHmac, pbkdf2Sync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { BridgeHandler } from "../bridge-handler.js";
import { PairingManager } from "../session/pairing.js";

function buildTranscript(input: Readonly<{
  pairingSessionId: string;
  extensionId: string;
  hostName: string;
  bridgePublicKey: string;
  extensionPublicKey: string;
}>): string {
  return [
    "byom.bridge.pairing.v1",
    input.pairingSessionId,
    input.extensionId,
    input.hostName,
    input.bridgePublicKey.toLowerCase(),
    input.extensionPublicKey.toLowerCase(),
  ].join("|");
}

describe("BridgeHandler pairing dispatch", () => {
  const pairingCodeBytes = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]);
  const pairingCode = "ABCDEFGH";

  it("supports pairing begin/complete/list/revoke lifecycle", async () => {
    const nowMs = { value: Date.parse("2026-03-24T16:00:00.000Z") };
    const pairingManager = new PairingManager({
      now: () => new Date(nowMs.value),
      generateBytes: (length: number) =>
        length === 8 ? Buffer.from(pairingCodeBytes) : Buffer.alloc(length, 0x44),
    });
    const handler = new BridgeHandler({
      sharedSecret: Buffer.alloc(32, 0x01),
      pairingManager,
    });

    const begin = await handler.handle({
      type: "pairing.begin",
      extensionId: "ext.runtime.transport",
      hostName: "com.byom.bridge",
    });
    expect(begin).toMatchObject({
      type: "pairing.begin",
      extensionId: "ext.runtime.transport",
      hostName: "com.byom.bridge",
    });
    expect((begin as Record<string, unknown>)["oneTimeCode"]).toBeUndefined();

    const beginPayload = begin as Record<string, string>;
    const extensionEcdh = createECDH("prime256v1");
    const extensionPublicKey = extensionEcdh.generateKeys("hex", "uncompressed");
    const transcript = buildTranscript({
      pairingSessionId: beginPayload["pairingSessionId"] ?? "",
      extensionId: beginPayload["extensionId"] ?? "",
      hostName: beginPayload["hostName"] ?? "",
      bridgePublicKey: beginPayload["bridgePublicKey"] ?? "",
      extensionPublicKey,
    });
    const codeKey = pbkdf2Sync(
      Buffer.from(pairingCode, "utf8"),
      Buffer.from(beginPayload["salt"] ?? "", "hex"),
      Number(beginPayload["iterations"] ?? "0"),
      32,
      "sha256",
    );
    const proof = createHmac("sha256", codeKey).update(transcript, "utf8").digest("hex");

    const complete = await handler.handle({
      type: "pairing.complete",
      pairingSessionId: beginPayload["pairingSessionId"],
      extensionId: beginPayload["extensionId"],
      hostName: beginPayload["hostName"],
      extensionPublicKey,
      proof,
    });
    expect(complete).toMatchObject({
      type: "pairing.complete",
      extensionId: "ext.runtime.transport",
      hostName: "com.byom.bridge",
    });

    const pairingHandle = (complete as Record<string, string>)["pairingHandle"] ?? "";
    expect(pairingHandle).toMatch(/^pairh\.[0-9a-f]{32}$/);

    const listed = await handler.handle({
      type: "pairing.list",
      extensionId: "ext.runtime.transport",
      hostName: "com.byom.bridge",
    });
    expect(listed).toMatchObject({
      type: "pairing.list",
    });
    const listPayload = listed as Record<string, unknown>;
    const pairings = Array.isArray(listPayload["pairings"])
      ? listPayload["pairings"] as Array<Record<string, string>>
      : [];
    expect(pairings[0]?.["pairingHandle"]).toBe(pairingHandle);

    const revoked = await handler.handle({
      type: "pairing.revoke",
      pairingHandle,
      extensionId: "ext.runtime.transport",
      hostName: "com.byom.bridge",
    });
    expect(revoked).toMatchObject({
      type: "pairing.revoke",
      pairingHandle,
      revoked: true,
    });
  });

  it("returns pairing code retrieval hint without exposing raw one-time code", async () => {
    const pairingManager = new PairingManager({
      generateBytes: (length: number) =>
        length === 8 ? Buffer.from(pairingCodeBytes) : Buffer.alloc(length, 0x66),
    });
    const handler = new BridgeHandler({
      sharedSecret: Buffer.alloc(32, 0x01),
      pairingManager,
      pairingCodeRetrievalHint:
        "Bridge pairing code log: C:\\Users\\example\\AppData\\Local\\BYOM\\bridge\\logs\\pairing-code.log",
    });

    const begin = await handler.handle({
      type: "pairing.begin",
      extensionId: "ext.runtime.transport",
      hostName: "com.byom.bridge",
    });
    expect(begin).toMatchObject({
      type: "pairing.begin",
      codeRetrievalHint:
        "Bridge pairing code log: C:\\Users\\example\\AppData\\Local\\BYOM\\bridge\\logs\\pairing-code.log",
    });
    expect((begin as Record<string, unknown>)["oneTimeCode"]).toBeUndefined();
  });

  it("returns one-time code when includeOneTimeCode is explicitly requested", async () => {
    const pairingManager = new PairingManager({
      generateBytes: (length: number) =>
        length === 8 ? Buffer.from(pairingCodeBytes) : Buffer.alloc(length, 0x77),
    });
    const handler = new BridgeHandler({
      sharedSecret: Buffer.alloc(32, 0x01),
      pairingManager,
    });

    const begin = await handler.handle({
      type: "pairing.begin",
      extensionId: "ext.runtime.transport",
      hostName: "com.byom.bridge",
      includeOneTimeCode: true,
    });
    expect(begin).toMatchObject({
      type: "pairing.begin",
      oneTimeCode: "ABCDEFGH",
    });
  });

  it("uses pairing secret for handshake.verify when pairingHandle is provided", async () => {
    const nowMs = { value: Date.parse("2026-03-24T16:10:00.000Z") };
    const pairingManager = new PairingManager({
      now: () => new Date(nowMs.value),
      generateBytes: (length: number) =>
        length === 8 ? Buffer.from(pairingCodeBytes) : Buffer.alloc(length, 0x55),
    });
    const handler = new BridgeHandler({
      sharedSecret: Buffer.alloc(32, 0x7f),
      pairingManager,
    });

    const begin = await handler.handle({
      type: "pairing.begin",
      extensionId: "ext.runtime.transport",
      hostName: "com.byom.bridge",
    });
    const beginPayload = begin as Record<string, string>;
    const extensionEcdh = createECDH("prime256v1");
    const extensionPublicKey = extensionEcdh.generateKeys("hex", "uncompressed");
    const transcript = buildTranscript({
      pairingSessionId: beginPayload["pairingSessionId"] ?? "",
      extensionId: beginPayload["extensionId"] ?? "",
      hostName: beginPayload["hostName"] ?? "",
      bridgePublicKey: beginPayload["bridgePublicKey"] ?? "",
      extensionPublicKey,
    });
    const codeKey = pbkdf2Sync(
      Buffer.from(pairingCode, "utf8"),
      Buffer.from(beginPayload["salt"] ?? "", "hex"),
      Number(beginPayload["iterations"] ?? "0"),
      32,
      "sha256",
    );
    const pairingProof = createHmac("sha256", codeKey).update(transcript, "utf8").digest("hex");
    const complete = await handler.handle({
      type: "pairing.complete",
      pairingSessionId: beginPayload["pairingSessionId"],
      extensionId: beginPayload["extensionId"],
      hostName: beginPayload["hostName"],
      extensionPublicKey,
      proof: pairingProof,
    });
    const pairingHandle = (complete as Record<string, string>)["pairingHandle"] ?? "";

    const challenge = await handler.handle({ type: "handshake.challenge" });
    const nonce = (challenge as Record<string, string>)["nonce"] ?? "";
    const hmac = createHmac(
      "sha256",
      pairingManager.resolvePairingSecret({
        pairingHandle,
        extensionId: "ext.runtime.transport",
        hostName: "com.byom.bridge",
      }) ?? Buffer.alloc(32, 0),
    )
      .update(nonce)
      .digest("hex");
    const verify = await handler.handle({
      type: "handshake.verify",
      nonce,
      hmac,
      extensionId: "ext.runtime.transport",
      hostName: "com.byom.bridge",
      pairingHandle,
    });

    expect(verify).toMatchObject({
      type: "handshake.session",
      extensionId: "ext.runtime.transport",
    });
  });
});

