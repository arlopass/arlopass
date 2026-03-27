import { createECDH, createHmac, pbkdf2Sync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { BridgeHandler } from "../bridge-handler.js";
import { PairingManager } from "../session/pairing.js";
import { obtainSessionToken } from "./test-session-helper.js";

function buildTranscript(input: Readonly<{
  pairingSessionId: string;
  extensionId: string;
  hostName: string;
  bridgePublicKey: string;
  extensionPublicKey: string;
}>): string {
  return [
    "arlopass.bridge.pairing.v1",
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
      pairingManager,
    });
    const sessionToken = await obtainSessionToken(handler);

    const begin = await handler.handle({
      type: "pairing.begin",
      extensionId: "ext.runtime.transport",
      hostName: "com.arlopass.bridge",
    });
    expect(begin).toMatchObject({
      type: "pairing.begin",
      extensionId: "ext.runtime.transport",
      hostName: "com.arlopass.bridge",
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
      hostName: "com.arlopass.bridge",
    });

    const pairingHandle = (complete as Record<string, string>)["pairingHandle"] ?? "";
    expect(pairingHandle).toMatch(/^pairh\.[0-9a-f]{32}$/);

    const listed = await handler.handle({
      type: "pairing.list",
      sessionToken,
      extensionId: "ext.runtime.transport",
      hostName: "com.arlopass.bridge",
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
      sessionToken,
      pairingHandle,
      extensionId: "ext.runtime.transport",
      hostName: "com.arlopass.bridge",
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
      pairingManager,
      pairingCodeRetrievalHint:
        "Bridge pairing code log: C:\\Users\\example\\AppData\\Local\\Arlopass\\bridge\\logs\\pairing-code.log",
    });

    const begin = await handler.handle({
      type: "pairing.begin",
      extensionId: "ext.runtime.transport",
      hostName: "com.arlopass.bridge",
    });
    expect(begin).toMatchObject({
      type: "pairing.begin",
      codeRetrievalHint:
        "Bridge pairing code log: C:\\Users\\example\\AppData\\Local\\Arlopass\\bridge\\logs\\pairing-code.log",
    });
    expect((begin as Record<string, unknown>)["oneTimeCode"]).toBeUndefined();
  });

  it("returns one-time code when includeOneTimeCode is explicitly requested", async () => {
    const pairingManager = new PairingManager({
      generateBytes: (length: number) =>
        length === 8 ? Buffer.from(pairingCodeBytes) : Buffer.alloc(length, 0x77),
    });
    const handler = new BridgeHandler({
      pairingManager,
    });

    const begin = await handler.handle({
      type: "pairing.begin",
      extensionId: "ext.runtime.transport",
      hostName: "com.arlopass.bridge",
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
      pairingManager,
    });

    const begin = await handler.handle({
      type: "pairing.begin",
      extensionId: "ext.runtime.transport",
      hostName: "com.arlopass.bridge",
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
        hostName: "com.arlopass.bridge",
      }) ?? Buffer.alloc(32, 0),
    )
      .update(nonce)
      .digest("hex");
    const verify = await handler.handle({
      type: "handshake.verify",
      nonce,
      hmac,
      extensionId: "ext.runtime.transport",
      hostName: "com.arlopass.bridge",
      pairingHandle,
    });

    expect(verify).toMatchObject({
      type: "handshake.session",
      extensionId: "ext.runtime.transport",
    });
  });
});

describe("PairingManager.createAutoPairing", () => {
  it("returns a valid pairing handle and key hex", () => {
    const pairingManager = new PairingManager({
      generateBytes: (length: number) => Buffer.alloc(length, 0xab),
    });

    const result = pairingManager.createAutoPairing({
      extensionId: "ext.auto.test",
      hostName: "com.arlopass.bridge",
    });

    expect(result.pairingHandle).toMatch(/^pairh\.[0-9a-f]{32}$/);
    expect(result.pairingKeyHex).toHaveLength(64);
    expect(result.extensionId).toBe("ext.auto.test");
    expect(result.hostName).toBe("com.arlopass.bridge");
    expect(result.createdAt).toBeDefined();
  });

  it("works with resolvePairingSecret", () => {
    const pairingManager = new PairingManager({
      generateBytes: (length: number) => Buffer.alloc(length, 0xcd),
    });

    const result = pairingManager.createAutoPairing({
      extensionId: "ext.resolve.test",
      hostName: "com.arlopass.bridge",
    });

    const resolved = pairingManager.resolvePairingSecret({
      pairingHandle: result.pairingHandle,
      extensionId: "ext.resolve.test",
      hostName: "com.arlopass.bridge",
    });

    expect(resolved).toBeDefined();
    expect(resolved!.toString("hex")).toBe(result.pairingKeyHex);
  });

  it("is idempotent — second call with same extensionId+hostName returns same pairing", () => {
    let callCount = 0;
    const pairingManager = new PairingManager({
      generateBytes: (length: number) => {
        callCount += 1;
        return Buffer.alloc(length, callCount);
      },
    });

    const first = pairingManager.createAutoPairing({
      extensionId: "ext.idempotent",
      hostName: "com.arlopass.bridge",
    });
    const second = pairingManager.createAutoPairing({
      extensionId: "ext.idempotent",
      hostName: "com.arlopass.bridge",
    });

    expect(second.pairingHandle).toBe(first.pairingHandle);
    expect(second.pairingKeyHex).toBe(first.pairingKeyHex);
    expect(second.createdAt).toBe(first.createdAt);
  });

  it("returns a different pairing for a different extensionId", () => {
    const pairingManager = new PairingManager({
      generateBytes: (length: number) =>
        Buffer.from(Array.from({ length }, () => Math.floor(Math.random() * 256))),
    });

    const first = pairingManager.createAutoPairing({
      extensionId: "ext.alpha",
      hostName: "com.arlopass.bridge",
    });
    const second = pairingManager.createAutoPairing({
      extensionId: "ext.beta",
      hostName: "com.arlopass.bridge",
    });

    expect(second.pairingHandle).not.toBe(first.pairingHandle);
    expect(second.pairingKeyHex).not.toBe(first.pairingKeyHex);
  });
});

describe("BridgeHandler pairing.auto dispatch", () => {
  it("returns a valid pairing.auto response", async () => {
    const pairingManager = new PairingManager({
      generateBytes: (length: number) => Buffer.alloc(length, 0xee),
    });
    const handler = new BridgeHandler({
      pairingManager,
    });

    const response = await handler.handle({
      type: "pairing.auto",
      extensionId: "ext.auto.dispatch",
      hostName: "com.arlopass.bridge",
    });

    expect(response).toMatchObject({
      type: "pairing.auto",
      extensionId: "ext.auto.dispatch",
      hostName: "com.arlopass.bridge",
    });
    const payload = response as Record<string, string>;
    expect(payload["pairingHandle"]).toMatch(/^pairh\.[0-9a-f]{32}$/);
    expect(payload["pairingKeyHex"]).toHaveLength(64);
    expect(payload["createdAt"]).toBeDefined();
  });

  it("returns error when extensionId is missing", async () => {
    const handler = new BridgeHandler({});

    const response = await handler.handle({
      type: "pairing.auto",
      hostName: "com.arlopass.bridge",
    });

    expect(response).toMatchObject({
      type: "error",
      reasonCode: "request.invalid",
    });
  });

  it("returns error when hostName is missing", async () => {
    const handler = new BridgeHandler({});

    const response = await handler.handle({
      type: "pairing.auto",
      extensionId: "ext.auto.dispatch",
    });

    expect(response).toMatchObject({
      type: "error",
      reasonCode: "request.invalid",
    });
  });

  it("subsequent handshake.verify with auto-pairing secret succeeds", async () => {
    const pairingManager = new PairingManager({
      generateBytes: (length: number) => Buffer.alloc(length, 0xdd),
    });
    const handler = new BridgeHandler({
      pairingManager,
    });

    // Create auto-pairing
    const autoPairing = await handler.handle({
      type: "pairing.auto",
      extensionId: "ext.handshake.auto",
      hostName: "com.arlopass.bridge",
    });
    const autoPayload = autoPairing as Record<string, string>;
    const pairingHandle = autoPayload["pairingHandle"] ?? "";
    const pairingKeyHex = autoPayload["pairingKeyHex"] ?? "";

    // Perform handshake with pairing secret
    const challenge = await handler.handle({ type: "handshake.challenge" });
    const nonce = (challenge as Record<string, string>)["nonce"] ?? "";
    const hmac = createHmac("sha256", Buffer.from(pairingKeyHex, "hex"))
      .update(nonce)
      .digest("hex");
    const verify = await handler.handle({
      type: "handshake.verify",
      nonce,
      hmac,
      extensionId: "ext.handshake.auto",
      hostName: "com.arlopass.bridge",
      pairingHandle,
    });

    expect(verify).toMatchObject({
      type: "handshake.session",
      extensionId: "ext.handshake.auto",
    });
  });
});

