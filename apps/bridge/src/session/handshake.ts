import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export const HANDSHAKE_CHALLENGE_NONCE_BYTE_LENGTH = 32;
export const HANDSHAKE_SESSION_TOKEN_BYTE_LENGTH = 32;
export const HANDSHAKE_DEFAULT_CHALLENGE_TTL_MS = 60_000;
export const HANDSHAKE_DEFAULT_SESSION_TTL_MS = 5 * 60_000;

export function isFixedLengthHex(value: string, byteLength: number): boolean {
  return (
    value.length === byteLength * 2 && new RegExp(`^[0-9a-f]{${String(byteLength * 2)}}$`, "i").test(value)
  );
}

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
  expiresAt: string;
}>;

export type HandshakeManagerOptions = Readonly<{
  now?: () => Date;
  /** Injectable for deterministic tests; defaults to crypto.randomBytes. */
  generateBytes?: (length: number) => Buffer;
  challengeTtlMs?: number;
  sessionTtlMs?: number;
  stateFilePath?: string;
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
type PersistedPendingChallenge = Readonly<{
  nonce: string;
  expiresAtMs: number;
}>;
type PersistedHandshakeState = Readonly<{
  version: 1;
  pendingChallenges: readonly PersistedPendingChallenge[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPersistedPendingChallenge(
  value: unknown,
): value is PersistedPendingChallenge {
  if (!isRecord(value)) {
    return false;
  }
  if (
    typeof value["nonce"] !== "string" ||
    !isFixedLengthHex(value["nonce"], HANDSHAKE_CHALLENGE_NONCE_BYTE_LENGTH) ||
    !isFiniteNumber(value["expiresAtMs"])
  ) {
    return false;
  }
  return true;
}

export class HandshakeManager {
  readonly #now: () => Date;
  readonly #generateBytes: (length: number) => Buffer;
  readonly #challengeTtlMs: number;
  readonly #sessionTtlMs: number;
  readonly #stateFilePath: string | undefined;
  readonly #pendingChallenges = new Map<string, PendingChallenge>();
  readonly #consumedNonces = new Set<string>();

  constructor(options: HandshakeManagerOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#generateBytes = options.generateBytes ?? ((n) => randomBytes(n));
    this.#challengeTtlMs =
      options.challengeTtlMs ?? HANDSHAKE_DEFAULT_CHALLENGE_TTL_MS;
    this.#sessionTtlMs =
      options.sessionTtlMs ?? HANDSHAKE_DEFAULT_SESSION_TTL_MS;
    this.#stateFilePath =
      typeof options.stateFilePath === "string" &&
      options.stateFilePath.trim().length > 0
        ? options.stateFilePath.trim()
        : undefined;
    this.#loadStateFromDisk();
    this.cleanupExpiredChallenges();
    this.#persistState();
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
    this.#persistState();

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
      this.#persistState();
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
    this.#persistState();

    const sessionToken = this.#generateBytes(
      HANDSHAKE_SESSION_TOKEN_BYTE_LENGTH,
    ).toString("hex");
    const expiresAt = new Date(nowMs + this.#sessionTtlMs).toISOString();

    return {
      sessionToken,
      extensionId,
      establishedAt: new Date(nowMs).toISOString(),
      expiresAt,
    };
  }

  /**
   * Purges challenges whose TTL has elapsed.  Call periodically to prevent
   * unbounded growth of the pending-challenge map.
   */
  cleanupExpiredChallenges(): void {
    const nowMs = this.#now().getTime();
    let changed = false;
    for (const [nonce, pending] of this.#pendingChallenges) {
      if (pending.expiresAtMs <= nowMs) {
        this.#pendingChallenges.delete(nonce);
        changed = true;
      }
    }
    if (changed) {
      this.#persistState();
    }
  }

  #loadStateFromDisk(): void {
    if (this.#stateFilePath === undefined) {
      return;
    }
    if (!existsSync(this.#stateFilePath)) {
      return;
    }

    try {
      const raw = readFileSync(this.#stateFilePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!isRecord(parsed) || parsed["version"] !== 1) {
        return;
      }
      const pendingChallenges = Array.isArray(parsed["pendingChallenges"])
        ? parsed["pendingChallenges"]
        : [];
      for (const entry of pendingChallenges) {
        if (!isPersistedPendingChallenge(entry)) {
          continue;
        }
        this.#pendingChallenges.set(entry.nonce.toLowerCase(), {
          expiresAtMs: entry.expiresAtMs,
        });
      }
    } catch {
      // Fail closed to in-memory handshake state if persisted state is unreadable.
    }
  }

  #persistState(): void {
    if (this.#stateFilePath === undefined) {
      return;
    }
    const state: PersistedHandshakeState = {
      version: 1,
      pendingChallenges: [...this.#pendingChallenges.entries()].map(
        ([nonce, pending]) => ({
          nonce,
          expiresAtMs: pending.expiresAtMs,
        }),
      ),
    };

    try {
      const directoryPath = dirname(this.#stateFilePath);
      mkdirSync(directoryPath, { recursive: true });
      const tempPath = `${this.#stateFilePath}.tmp`;
      writeFileSync(tempPath, JSON.stringify(state), { encoding: "utf8" });
      renameSync(tempPath, this.#stateFilePath);
    } catch {
      // Persist failure should not break live handshake flow.
    }
  }
}
