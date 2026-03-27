import { createECDH, createHmac, hkdfSync, pbkdf2Sync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  PairingError,
  PairingManager,
} from "../session/pairing.js";

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

describe("PairingManager", () => {
  it("completes pairing and resolves a bound pairing secret", () => {
    const nowMs = { value: Date.parse("2026-03-24T16:00:00.000Z") };
    const manager = new PairingManager({
      now: () => new Date(nowMs.value),
      generateBytes: (length: number) => Buffer.alloc(length, 0x11),
    });

    const begin = manager.beginPairing({
      extensionId: "ext.runtime.test",
      hostName: "com.arlopass.bridge",
    });
    const extensionEcdh = createECDH("prime256v1");
    const extensionPublicKey = extensionEcdh.generateKeys("hex", "uncompressed");
    const transcript = buildTranscript({
      pairingSessionId: begin.pairingSessionId,
      extensionId: begin.extensionId,
      hostName: begin.hostName,
      bridgePublicKey: begin.bridgePublicKey,
      extensionPublicKey,
    });
    const codeKey = pbkdf2Sync(
      Buffer.from(begin.oneTimeCode, "utf8"),
      Buffer.from(begin.salt, "hex"),
      begin.iterations,
      32,
      "sha256",
    );
    const proof = createHmac("sha256", codeKey).update(transcript, "utf8").digest("hex");

    const complete = manager.completePairing({
      pairingSessionId: begin.pairingSessionId,
      extensionId: begin.extensionId,
      hostName: begin.hostName,
      extensionPublicKey,
      proof,
    });

    expect(complete.pairingHandle).toMatch(/^pairh\.[0-9a-f]{32}$/);

    const resolved = manager.resolvePairingSecret({
      pairingHandle: complete.pairingHandle,
      extensionId: begin.extensionId,
      hostName: begin.hostName,
    });
    expect(resolved).toBeDefined();
    if (resolved === undefined) {
      return;
    }

    const sharedSecret = extensionEcdh.computeSecret(Buffer.from(begin.bridgePublicKey, "hex"));
    const expectedPairingKey = Buffer.from(
      hkdfSync(
        "sha256",
        sharedSecret,
        codeKey,
        Buffer.from(transcript, "utf8"),
        32,
      ),
    );
    expect(Buffer.compare(resolved, expectedPairingKey)).toBe(0);
  });

  it("enforces throttle and max attempts on invalid proof", () => {
    const nowMs = { value: Date.parse("2026-03-24T16:00:00.000Z") };
    const manager = new PairingManager({
      now: () => new Date(nowMs.value),
      generateBytes: (length: number) => Buffer.alloc(length, 0x22),
      maxAttempts: 3,
      backoffBaseMs: 500,
    });

    const begin = manager.beginPairing({
      extensionId: "ext.runtime.test",
      hostName: "com.arlopass.bridge",
    });
    const extensionEcdh = createECDH("prime256v1");
    const extensionPublicKey = extensionEcdh.generateKeys("hex", "uncompressed");

    expect(() =>
      manager.completePairing({
        pairingSessionId: begin.pairingSessionId,
        extensionId: begin.extensionId,
        hostName: begin.hostName,
        extensionPublicKey,
        proof: "00".repeat(32),
      }),
    ).toThrow(PairingError);

    const throttled = (() => {
      try {
        manager.completePairing({
          pairingSessionId: begin.pairingSessionId,
          extensionId: begin.extensionId,
          hostName: begin.hostName,
          extensionPublicKey,
          proof: "00".repeat(32),
        });
        return undefined;
      } catch (error) {
        return error;
      }
    })();
    expect(throttled).toBeInstanceOf(PairingError);
    expect((throttled as PairingError).reasonCode).toBe("auth.throttled");

    nowMs.value += 500;
    expect(() =>
      manager.completePairing({
        pairingSessionId: begin.pairingSessionId,
        extensionId: begin.extensionId,
        hostName: begin.hostName,
        extensionPublicKey,
        proof: "00".repeat(32),
      }),
    ).toThrow(PairingError);

    nowMs.value += 1_000;
    const exceeded = (() => {
      try {
        manager.completePairing({
          pairingSessionId: begin.pairingSessionId,
          extensionId: begin.extensionId,
          hostName: begin.hostName,
          extensionPublicKey,
          proof: "00".repeat(32),
        });
        return undefined;
      } catch (error) {
        return error;
      }
    })();
    expect(exceeded).toBeInstanceOf(PairingError);
    expect((exceeded as PairingError).reasonCode).toBe("auth.invalid");
    expect((exceeded as PairingError).message).toMatch(/maximum attempts/i);
  });

  it("supports listing, revoking, and rotating pairings", () => {
    const nowMs = { value: Date.parse("2026-03-24T16:00:00.000Z") };
    const manager = new PairingManager({
      now: () => new Date(nowMs.value),
      generateBytes: (length: number) => Buffer.alloc(length, 0x33),
    });

    const begin = manager.beginPairing({
      extensionId: "ext.runtime.test",
      hostName: "com.arlopass.bridge",
    });
    const extensionEcdh = createECDH("prime256v1");
    const extensionPublicKey = extensionEcdh.generateKeys("hex", "uncompressed");
    const transcript = buildTranscript({
      pairingSessionId: begin.pairingSessionId,
      extensionId: begin.extensionId,
      hostName: begin.hostName,
      bridgePublicKey: begin.bridgePublicKey,
      extensionPublicKey,
    });
    const codeKey = pbkdf2Sync(
      Buffer.from(begin.oneTimeCode, "utf8"),
      Buffer.from(begin.salt, "hex"),
      begin.iterations,
      32,
      "sha256",
    );
    const proof = createHmac("sha256", codeKey).update(transcript, "utf8").digest("hex");
    const complete = manager.completePairing({
      pairingSessionId: begin.pairingSessionId,
      extensionId: begin.extensionId,
      hostName: begin.hostName,
      extensionPublicKey,
      proof,
    });

    const listed = manager.listPairings({ extensionId: begin.extensionId });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.pairingHandle).toBe(complete.pairingHandle);

    const rotateBegin = manager.rotatePairing({
      pairingHandle: complete.pairingHandle,
      extensionId: begin.extensionId,
      hostName: begin.hostName,
    });
    expect(rotateBegin.supersedesPairingHandle).toBe(complete.pairingHandle);

    expect(
      manager.revokePairing({
        pairingHandle: complete.pairingHandle,
        extensionId: begin.extensionId,
        hostName: begin.hostName,
      }),
    ).toBe(true);
    expect(
      manager.revokePairing({
        pairingHandle: complete.pairingHandle,
        extensionId: begin.extensionId,
        hostName: begin.hostName,
      }),
    ).toBe(false);
  });

  it("expires pending sessions", () => {
    const nowMs = { value: Date.parse("2026-03-24T16:00:00.000Z") };
    const manager = new PairingManager({
      now: () => new Date(nowMs.value),
      codeTtlMs: 120_000,
    });
    const begin = manager.beginPairing({
      extensionId: "ext.runtime.test",
      hostName: "com.arlopass.bridge",
    });
    nowMs.value += 121_000;
    expect(() =>
      manager.completePairing({
        pairingSessionId: begin.pairingSessionId,
        extensionId: begin.extensionId,
        hostName: begin.hostName,
        extensionPublicKey: "04" + "00".repeat(64),
        proof: "00".repeat(32),
      }),
    ).toThrow(PairingError);
  });

  it("persists pending sessions and pairing handles across manager instances", () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "arlopass-pairing-test-"));
    const stateFilePath = join(tmpRoot, "pairing-state.json");
    const nowMs = { value: Date.parse("2026-03-24T16:00:00.000Z") };
    try {
      const managerA = new PairingManager({
        now: () => new Date(nowMs.value),
        stateFilePath,
        generateBytes: (length: number) => Buffer.alloc(length, 0x44),
      });
      const begin = managerA.beginPairing({
        extensionId: "ext.runtime.test",
        hostName: "com.arlopass.bridge",
      });

      const extensionEcdh = createECDH("prime256v1");
      const extensionPublicKey = extensionEcdh.generateKeys("hex", "uncompressed");
      const transcript = buildTranscript({
        pairingSessionId: begin.pairingSessionId,
        extensionId: begin.extensionId,
        hostName: begin.hostName,
        bridgePublicKey: begin.bridgePublicKey,
        extensionPublicKey,
      });
      const codeKey = pbkdf2Sync(
        Buffer.from(begin.oneTimeCode, "utf8"),
        Buffer.from(begin.salt, "hex"),
        begin.iterations,
        32,
        "sha256",
      );
      const proof = createHmac("sha256", codeKey).update(transcript, "utf8").digest("hex");

      const managerB = new PairingManager({
        now: () => new Date(nowMs.value),
        stateFilePath,
        generateBytes: (length: number) => Buffer.alloc(length, 0x55),
      });
      const complete = managerB.completePairing({
        pairingSessionId: begin.pairingSessionId,
        extensionId: begin.extensionId,
        hostName: begin.hostName,
        extensionPublicKey,
        proof,
      });
      expect(complete.pairingHandle).toMatch(/^pairh\.[0-9a-f]{32}$/);

      const managerC = new PairingManager({
        now: () => new Date(nowMs.value),
        stateFilePath,
      });
      const resolved = managerC.resolvePairingSecret({
        pairingHandle: complete.pairingHandle,
        extensionId: begin.extensionId,
        hostName: begin.hostName,
      });
      expect(resolved).toBeDefined();
      expect(managerC.listPairings({ extensionId: begin.extensionId })).toHaveLength(1);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

