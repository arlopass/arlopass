import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const HANDSHAKE_CHALLENGE_NONCE_BYTE_LENGTH = 32;
export const HANDSHAKE_SESSION_TOKEN_BYTE_LENGTH = 32;
export const HANDSHAKE_DEFAULT_CHALLENGE_TTL_MS = 60_000;

export type HandshakeChallenge = Readonly<{
  /** Hex-encoded random nonce; exactly 64 hex chars for 32-byte nonce. */
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}>;

export type HandshakeChallengeResponse = Readonly<{
  /** Must match the nonce from the challenge. */
  nonce: string;
  /** HMAC-SHA256(nonce, sharedSecret) as hex. */
  hmac: string;
  extensionId: string;
}>;

export type HandshakeSession = Readonly<{
  sessionToken: string;
  extensionId: string;
  establishedAt: string;
}>;

export type HandshakeManagerOptions = Readonly<{
  now?: () => Date;
  /** Injectable for deterministic tests; defaults to crypto.randomBytes. */
  generateBytes?: (length: number) => Buffer;
  challengeTtlMs?: number;
}>;

export class HandshakeError extends Error {
  readonly reasonCode: "auth.invalid" | "auth.expired";

  constructor(
    message: string,
    reasonCode: "auth.invalid" | "auth.expired" = "auth.invalid",
  ) {
    super(message);
    this.name = "HandshakeError";
    this.reasonCode = reasonCode;
  }
}

type PendingChallenge = Readonly<{ expiresAtMs: number }>;

export class HandshakeManager {
  readonly #now: () => Date;
  readonly #generateBytes: (length: number) => Buffer;
  readonly #challengeTtlMs: number;
  readonly #pendingChallenges = new Map<string, PendingChallenge>();
  readonly #consumedNonces = new Set<string>();

  constructor(options: HandshakeManagerOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#generateBytes = options.generateBytes ?? ((n) => randomBytes(n));
    this.#challengeTtlMs =
      options.challengeTtlMs ?? HANDSHAKE_DEFAULT_CHALLENGE_TTL_MS;
  }

  /**
   * Generates and registers a new challenge.  The caller must transmit the
   * returned value to the extension and call verifyResponse within the TTL.
   */
  createChallenge(): HandshakeChallenge {
    const nonce = this.#generateBytes(
      HANDSHAKE_CHALLENGE_NONCE_BYTE_LENGTH,
    ).toString("hex");

    const issuedAt = this.#now();
    const expiresAt = new Date(issuedAt.getTime() + this.#challengeTtlMs);

    this.#pendingChallenges.set(nonce, { expiresAtMs: expiresAt.getTime() });

    return {
      nonce,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Verifies the extension's HMAC response against the pending challenge.
   *
   * Throws HandshakeError when:
   * - The nonce has already been consumed (replay detected).
   * - No pending challenge exists for the nonce (unknown nonce).
   * - The challenge TTL has elapsed.
   * - The HMAC does not match (timing-safe comparison).
   *
   * On success the nonce is consumed and a new ephemeral session token is
   * returned.
   */
  verifyResponse(
    response: HandshakeChallengeResponse,
    sharedSecret: Buffer,
  ): HandshakeSession {
    const { nonce, hmac, extensionId } = response;
    const nowMs = this.#now().getTime();

    if (this.#consumedNonces.has(nonce)) {
      throw new HandshakeError(
        "Nonce has already been consumed (replay detected).",
        "auth.invalid",
      );
    }

    const pending = this.#pendingChallenges.get(nonce);
    if (pending === undefined) {
      throw new HandshakeError(
        "No pending challenge found for this nonce.",
        "auth.invalid",
      );
    }

    if (pending.expiresAtMs <= nowMs) {
      this.#pendingChallenges.delete(nonce);
      throw new HandshakeError(
        "Handshake challenge has expired.",
        "auth.expired",
      );
    }

    const expectedHmacHex = createHmac("sha256", sharedSecret)
      .update(nonce)
      .digest("hex");

    const expected = Buffer.from(expectedHmacHex, "hex");
    const received = Buffer.from(hmac, "hex");

    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new HandshakeError("HMAC verification failed.", "auth.invalid");
    }

    // Consume the nonce — removes it from pending and adds to consumed set.
    this.#pendingChallenges.delete(nonce);
    this.#consumedNonces.add(nonce);

    const sessionToken = this.#generateBytes(
      HANDSHAKE_SESSION_TOKEN_BYTE_LENGTH,
    ).toString("hex");

    return {
      sessionToken,
      extensionId,
      establishedAt: new Date(nowMs).toISOString(),
    };
  }

  /**
   * Purges challenges whose TTL has elapsed.  Call periodically to prevent
   * unbounded growth of the pending-challenge map.
   */
  cleanupExpiredChallenges(): void {
    const nowMs = this.#now().getTime();
    for (const [nonce, pending] of this.#pendingChallenges) {
      if (pending.expiresAtMs <= nowMs) {
        this.#pendingChallenges.delete(nonce);
      }
    }
  }
}
