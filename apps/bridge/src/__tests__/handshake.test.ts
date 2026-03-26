import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  HandshakeError,
  HANDSHAKE_DEFAULT_SESSION_TTL_MS,
  HandshakeManager,
} from "../session/handshake.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeExpectedHmac(nonce: string, secret: Buffer): string {
  return createHmac("sha256", secret).update(nonce).digest("hex");
}

function makeManager(
  opts: {
    nowMs?: number;
    challengeTtlMs?: number;
    sessionTtlMs?: number;
    nonceBytes?: Buffer;
    sessionBytes?: Buffer;
  } = {},
): {
  manager: HandshakeManager;
  now: { value: number };
} {
  const now = { value: opts.nowMs ?? 0 };
  let callCount = 0;
  const nonceBytes = opts.nonceBytes ?? Buffer.alloc(32, 0xaa);
  const sessionBytes = opts.sessionBytes ?? Buffer.alloc(32, 0xbb);

  const manager = new HandshakeManager({
    now: () => new Date(now.value),
    generateBytes: (length: number) => {
      callCount += 1;
      const src = callCount === 1 ? nonceBytes : sessionBytes;
      return src.subarray(0, length);
    },
    ...(opts.challengeTtlMs !== undefined
      ? { challengeTtlMs: opts.challengeTtlMs }
      : {}),
    ...(opts.sessionTtlMs !== undefined ? { sessionTtlMs: opts.sessionTtlMs } : {}),
  });

  return { manager, now };
}

const EXTENSION_ID = "abcdefghijklmnopqrstuvwxyzabcdef"; // 32 a-z chars
const SECRET = Buffer.from("shared-secret-for-tests");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HandshakeManager.createChallenge", () => {
  it("returns a challenge with the correct nonce, issuedAt, and expiresAt", () => {
    const { manager, now } = makeManager({ nowMs: 1_000_000, challengeTtlMs: 60_000 });
    const challenge = manager.createChallenge();

    expect(challenge.nonce).toBe(Buffer.alloc(32, 0xaa).toString("hex"));
    expect(challenge.issuedAt).toBe(new Date(1_000_000).toISOString());
    expect(challenge.expiresAt).toBe(new Date(1_000_000 + 60_000).toISOString());

    // Suppress unused warning — now is mutated in other tests.
    void now;
  });

  it("registers the nonce as pending", () => {
    const { manager } = makeManager({ nowMs: 0 });
    const c1 = manager.createChallenge();
    // A second challenge uses a different buffer but with same bytes here —
    // we verify that verifyResponse accepts the first nonce, meaning it was registered.
    const hmac = computeExpectedHmac(c1.nonce, SECRET);
    expect(() =>
      manager.verifyResponse({ nonce: c1.nonce, hmac, extensionId: EXTENSION_ID }, SECRET),
    ).not.toThrow();
  });
});

describe("HandshakeManager.verifyResponse", () => {
  it("returns a session on valid HMAC", () => {
    const { manager, now } = makeManager({
      nowMs: 1_000_000,
      sessionTtlMs: 90_000,
    });
    const challenge = manager.createChallenge();
    const hmac = computeExpectedHmac(challenge.nonce, SECRET);

    const session = manager.verifyResponse(
      { nonce: challenge.nonce, hmac, extensionId: EXTENSION_ID },
      SECRET,
    );

    expect(session.extensionId).toBe(EXTENSION_ID);
    expect(session.sessionToken).toBe(Buffer.alloc(32, 0xbb).toString("hex"));
    expect(session.establishedAt).toBe(new Date(1_000_000).toISOString());
    expect(session.expiresAt).toBe(new Date(1_000_000 + 90_000).toISOString());

    void now;
  });

  it("defaults session expiry to the handshake session TTL", () => {
    const { manager } = makeManager({ nowMs: 2_000_000 });
    const challenge = manager.createChallenge();
    const hmac = computeExpectedHmac(challenge.nonce, SECRET);

    const session = manager.verifyResponse(
      { nonce: challenge.nonce, hmac, extensionId: EXTENSION_ID },
      SECRET,
    );

    expect(session.expiresAt).toBe(
      new Date(2_000_000 + HANDSHAKE_DEFAULT_SESSION_TTL_MS).toISOString(),
    );
  });

  it("rejects a response with a wrong HMAC (constant-time path)", () => {
    const { manager } = makeManager({ nowMs: 0 });
    const challenge = manager.createChallenge();
    const wrongHmac = computeExpectedHmac(challenge.nonce, Buffer.from("wrong-secret"));

    expect(() =>
      manager.verifyResponse(
        { nonce: challenge.nonce, hmac: wrongHmac, extensionId: EXTENSION_ID },
        SECRET,
      ),
    ).toThrow(HandshakeError);
  });

  it("rejects a replay of an already-consumed nonce", () => {
    const { manager } = makeManager({ nowMs: 0 });
    const challenge = manager.createChallenge();
    const hmac = computeExpectedHmac(challenge.nonce, SECRET);

    // First response succeeds.
    manager.verifyResponse(
      { nonce: challenge.nonce, hmac, extensionId: EXTENSION_ID },
      SECRET,
    );

    // Second attempt with the same nonce must throw with replay error.
    const error = (() => {
      try {
        manager.verifyResponse(
          { nonce: challenge.nonce, hmac, extensionId: EXTENSION_ID },
          SECRET,
        );
        return null;
      } catch (e) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(HandshakeError);
    expect((error as HandshakeError).message).toMatch(/replay/i);
  });

  it("rejects an expired challenge", () => {
    const { manager, now } = makeManager({ nowMs: 0, challengeTtlMs: 5_000 });
    const challenge = manager.createChallenge();
    const hmac = computeExpectedHmac(challenge.nonce, SECRET);

    // Advance past the TTL.
    now.value = 6_000;

    const error = (() => {
      try {
        manager.verifyResponse(
          { nonce: challenge.nonce, hmac, extensionId: EXTENSION_ID },
          SECRET,
        );
        return null;
      } catch (e) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(HandshakeError);
    expect((error as HandshakeError).reasonCode).toBe("auth.expired");
  });

  it("rejects an entirely unknown nonce", () => {
    const { manager } = makeManager({ nowMs: 0 });
    const unknownNonce = "f".repeat(64);
    const hmac = computeExpectedHmac(unknownNonce, SECRET);

    expect(() =>
      manager.verifyResponse(
        { nonce: unknownNonce, hmac, extensionId: EXTENSION_ID },
        SECRET,
      ),
    ).toThrow(HandshakeError);
  });

  it("all HandshakeErrors carry reasonCode", () => {
    const { manager } = makeManager({ nowMs: 0 });
    const challenge = manager.createChallenge();
    const badHmac = "0".repeat(64);

    try {
      manager.verifyResponse(
        { nonce: challenge.nonce, hmac: badHmac, extensionId: EXTENSION_ID },
        SECRET,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(HandshakeError);
      expect((error as HandshakeError).reasonCode).toBe("auth.invalid");
    }
  });
});

describe("HandshakeManager.cleanupExpiredChallenges", () => {
  it("removes expired pending challenges and leaves live ones", () => {
    const { manager, now } = makeManager({
      nowMs: 0,
      challengeTtlMs: 1_000,
      nonceBytes: Buffer.alloc(32, 0x01),
    });

    const expired = manager.createChallenge();

    // Advance past TTL.
    now.value = 2_000;
    manager.cleanupExpiredChallenges();

    // The expired nonce should now be unknown.
    const hmac = computeExpectedHmac(expired.nonce, SECRET);
    expect(() =>
      manager.verifyResponse(
        { nonce: expired.nonce, hmac, extensionId: EXTENSION_ID },
        SECRET,
      ),
    ).toThrow(HandshakeError);
  });
});

describe("HandshakeManager persisted state", () => {
  it("allows challenge verify across manager instances when state persistence is enabled", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "byom-handshake-"));
    const stateFilePath = join(tempRoot, "handshake-state.json");

    try {
      const nowMs = 3_000_000;
      const managerOne = new HandshakeManager({
        now: () => new Date(nowMs),
        generateBytes: (length) => Buffer.alloc(length, 0xaa),
        stateFilePath,
      });
      const challenge = managerOne.createChallenge();

      const managerTwo = new HandshakeManager({
        now: () => new Date(nowMs),
        generateBytes: (length) => Buffer.alloc(length, 0xbb),
        stateFilePath,
      });
      const hmac = computeExpectedHmac(challenge.nonce, SECRET);
      const session = managerTwo.verifyResponse(
        { nonce: challenge.nonce, hmac, extensionId: EXTENSION_ID },
        SECRET,
      );

      expect(session.sessionToken).toBe(Buffer.alloc(32, 0xbb).toString("hex"));
      expect(session.extensionId).toBe(EXTENSION_ID);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
