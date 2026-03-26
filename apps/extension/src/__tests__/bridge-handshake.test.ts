import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearBridgeHandshakeSessionCache,
  ensureBridgeHandshakeSession,
} from "../transport/bridge-handshake.js";

const HOST_NAME = "com.byom.bridge";
const EXTENSION_ID = "ext.runtime.test";
const SECRET_HEX = "ab".repeat(32);
const NOW_MS = Date.parse("2026-03-24T15:00:00.000Z");

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function hexToBytes(hexValue: string): Uint8Array {
  const normalized = hexValue.trim().toLowerCase();
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

describe("ensureBridgeHandshakeSession", () => {
  beforeEach(() => {
    clearBridgeHandshakeSessionCache();
  });

  it("acquires handshake session key once and reuses it until expiry", async () => {
    const sendNativeMessage = vi.fn(async (hostName: string, message: Record<string, unknown>) => {
      if (hostName !== HOST_NAME) {
        throw new Error("unexpected host");
      }
      if (message["type"] === "handshake.challenge") {
        return {
          type: "handshake.challenge",
          nonce: "11".repeat(32),
          issuedAt: iso(NOW_MS),
          expiresAt: iso(NOW_MS + 60_000),
        };
      }
      if (message["type"] === "handshake.verify") {
        return {
          type: "handshake.session",
          sessionToken: "22".repeat(32),
          extensionId: EXTENSION_ID,
          establishedAt: iso(NOW_MS),
          expiresAt: iso(NOW_MS + 300_000),
        };
      }
      throw new Error("unexpected message");
    });
    const resolveBridgeSharedSecret = vi.fn(async () => SECRET_HEX);

    const first = await ensureBridgeHandshakeSession({
      hostName: HOST_NAME,
      extensionId: EXTENSION_ID,
      sendNativeMessage,
      resolveBridgeSharedSecret,
      now: () => new Date(NOW_MS),
    });

    const second = await ensureBridgeHandshakeSession({
      hostName: HOST_NAME,
      extensionId: EXTENSION_ID,
      sendNativeMessage,
      resolveBridgeSharedSecret,
      now: () => new Date(NOW_MS + 1_000),
    });

    expect(first.sessionToken).toBe("22".repeat(32));
    expect(bytesEqual(first.sessionKey, hexToBytes("22".repeat(32)))).toBe(true);
    expect(second.sessionToken).toBe(first.sessionToken);
    expect(bytesEqual(second.sessionKey, first.sessionKey)).toBe(true);
    expect(sendNativeMessage).toHaveBeenCalledTimes(2);
    expect(resolveBridgeSharedSecret).toHaveBeenCalledTimes(1);
  });

  it("refreshes handshake session on auth.expired and replaces cache", async () => {
    const sendNativeMessage = vi.fn(
      async (_hostName: string, message: Record<string, unknown>) => {
        if (message["type"] === "handshake.challenge") {
          const nonce = sendNativeMessage.mock.calls.length <= 1 ? "33".repeat(32) : "55".repeat(32);
          return {
            type: "handshake.challenge",
            nonce,
            issuedAt: iso(NOW_MS),
            expiresAt: iso(NOW_MS + 60_000),
          };
        }
        if (message["type"] === "handshake.verify") {
          const nonce = message["nonce"];
          if (nonce === "33".repeat(32)) {
            return {
              type: "handshake.session",
              sessionToken: "44".repeat(32),
              extensionId: EXTENSION_ID,
              establishedAt: iso(NOW_MS),
              expiresAt: iso(NOW_MS + 10_000),
            };
          }
          return {
            type: "handshake.session",
            sessionToken: "66".repeat(32),
            extensionId: EXTENSION_ID,
            establishedAt: iso(NOW_MS + 12_000),
            expiresAt: iso(NOW_MS + 300_000),
          };
        }
        throw new Error("unexpected message");
      },
    );
    const resolveBridgeSharedSecret = vi.fn(async () => SECRET_HEX);

    const first = await ensureBridgeHandshakeSession({
      hostName: HOST_NAME,
      extensionId: EXTENSION_ID,
      sendNativeMessage,
      resolveBridgeSharedSecret,
      now: () => new Date(NOW_MS),
    });
    expect(first.sessionToken).toBe("44".repeat(32));

    const refreshed = await ensureBridgeHandshakeSession({
      hostName: HOST_NAME,
      extensionId: EXTENSION_ID,
      sendNativeMessage,
      resolveBridgeSharedSecret,
      now: () => new Date(NOW_MS + 12_000),
    });

    expect(refreshed.sessionToken).toBe("66".repeat(32));
    expect(refreshed.sessionToken).not.toBe(first.sessionToken);
    expect(sendNativeMessage).toHaveBeenCalledTimes(4);
  });

  it("retries once when handshake.verify returns auth.expired/auth.invalid", async () => {
    const sendNativeMessage = vi.fn(
      async (_hostName: string, message: Record<string, unknown>) => {
        if (message["type"] === "handshake.challenge") {
          const firstAttempt = sendNativeMessage.mock.calls.length <= 1;
          return {
            type: "handshake.challenge",
            nonce: firstAttempt ? "77".repeat(32) : "99".repeat(32),
            issuedAt: iso(NOW_MS),
            expiresAt: iso(NOW_MS + 60_000),
          };
        }
        if (message["type"] === "handshake.verify") {
          if (message["nonce"] === "77".repeat(32)) {
            return {
              type: "error",
              reasonCode: "auth.expired",
              message: "challenge expired",
            };
          }
          return {
            type: "handshake.session",
            sessionToken: "aa".repeat(32),
            extensionId: EXTENSION_ID,
            establishedAt: iso(NOW_MS),
            expiresAt: iso(NOW_MS + 300_000),
          };
        }
        throw new Error("unexpected message");
      },
    );

    const result = await ensureBridgeHandshakeSession({
      hostName: HOST_NAME,
      extensionId: EXTENSION_ID,
      sendNativeMessage,
      resolveBridgeSharedSecret: async () => SECRET_HEX,
      now: () => new Date(NOW_MS),
    });

    expect(result.sessionToken).toBe("aa".repeat(32));
    expect(sendNativeMessage).toHaveBeenCalledTimes(4);
  });

  it("fails closed when shared secret resolver returns missing/invalid secret", async () => {
    const sendNativeMessage = vi.fn();

    await expect(
      ensureBridgeHandshakeSession({
        hostName: HOST_NAME,
        extensionId: EXTENSION_ID,
        sendNativeMessage,
        resolveBridgeSharedSecret: async () => undefined,
      }),
    ).rejects.toThrow(/shared secret/i);

    await expect(
      ensureBridgeHandshakeSession({
        hostName: HOST_NAME,
        extensionId: EXTENSION_ID,
        sendNativeMessage,
        resolveBridgeSharedSecret: async () => "not-hex",
      }),
    ).rejects.toThrow(/shared secret/i);

    expect(sendNativeMessage).not.toHaveBeenCalled();
  });

  it("never persists handshake session/token to storage", async () => {
    const sendNativeMessage = vi.fn(async (_hostName: string, message: Record<string, unknown>) => {
      if (message["type"] === "handshake.challenge") {
        return {
          type: "handshake.challenge",
          nonce: "bb".repeat(32),
          issuedAt: iso(NOW_MS),
          expiresAt: iso(NOW_MS + 60_000),
        };
      }
      return {
        type: "handshake.session",
        sessionToken: "cc".repeat(32),
        extensionId: EXTENSION_ID,
        establishedAt: iso(NOW_MS),
        expiresAt: iso(NOW_MS + 300_000),
      };
    });

    const session = await ensureBridgeHandshakeSession({
      hostName: HOST_NAME,
      extensionId: EXTENSION_ID,
      sendNativeMessage,
      resolveBridgeSharedSecret: async () => SECRET_HEX,
      now: () => new Date(NOW_MS),
    });

    expect(Object.keys(session)).not.toContain("persisted");
    expect(sendNativeMessage).toHaveBeenCalledTimes(2);
  });
});
