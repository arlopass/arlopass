import {
  DEFAULT_MAX_CLOCK_SKEW_MS,
  DEFAULT_MAX_ENVELOPE_LIFETIME_MS,
  EnvelopeValidationError,
  parseCloudConnectionHandle,
  parseCloudRequestProof,
  safeParseEnvelope,
  type CanonicalEnvelope,
  type CloudConnectionHandle,
  type CloudRequestProof,
  type EnvelopeValidationOptions,
} from "@arlopass/protocol";

import {
  computeRequestPayloadHash,
  verifyRequestProof,
} from "../cloud/request-proof.js";

export type RequestVerifySuccess<TPayload = unknown> = Readonly<{
  ok: true;
  envelope: CanonicalEnvelope<TPayload>;
}>;

export type RequestVerifyFailure = Readonly<{
  ok: false;
  error: Readonly<{ reasonCode: string; message: string }>;
}>;

export type RequestVerifyResult<TPayload = unknown> =
  | RequestVerifySuccess<TPayload>
  | RequestVerifyFailure;

export type ResolvedSessionKey = Readonly<{
  extensionId: string;
  sessionKey: Buffer;
}>;

export type SessionKeyResolver = (
  sessionToken: string,
) => ResolvedSessionKey | undefined;

export type RequestProofVerificationInput<TPayload = unknown> = Readonly<{
  sessionToken: string;
  proof: unknown;
  connectionHandle: unknown;
  extensionId?: string;
  origin?: string;
  policyVersion?: string;
  endpointProfileHash?: string;
  payloadParser?: (payload: unknown) => TPayload;
  allowConsumedNonce?: boolean;
}>;

/**
 * Options for RequestVerifier.  payloadParser is intentionally excluded from
 * the stored options because the per-call generic TPayload cannot be captured
 * at construction time.  Pass a payloadParser directly to verify() if needed.
 */
export type RequestVerifierOptions = Readonly<{
  /**
   * When set, only envelopes whose origin field is present in this set
   * are accepted.  If undefined, origin is not checked beyond envelope
   * schema validation.
     */
  authenticatedOrigins?: ReadonlySet<string>;
  /**
   * Optional dynamic origin matcher. Use this when trusted origins are
   * policy-based (for example, loopback origins on arbitrary dev ports).
   */
  authenticatedOriginMatcher?: (origin: string) => boolean;
  envelopeOptions?: Omit<EnvelopeValidationOptions, "now" | "payloadParser">;
  sessionKeyResolver?: SessionKeyResolver;
  now?: () => Date;
  consumedNonceTtlMs?: number;
  maxConsumedNonces?: number;
}>;

export const REQUEST_VERIFIER_DEFAULT_CONSUMED_NONCE_TTL_MS =
  DEFAULT_MAX_ENVELOPE_LIFETIME_MS + DEFAULT_MAX_CLOCK_SKEW_MS;
export const REQUEST_VERIFIER_DEFAULT_MAX_CONSUMED_NONCES = 4096;

type CloudHandleBindingMetadata = Readonly<{
  policyVersion?: string;
  endpointProfileHash?: string;
}>;

function fail(reasonCode: string, message: string): RequestVerifyFailure {
  return {
    ok: false,
    error: {
      reasonCode,
      message,
    },
  };
}

function replayFailure(message: string): RequestVerifyFailure {
  return fail("request.replay_prone", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOptionalNonEmptyString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

/**
 * Stateful envelope verifier for the bridge runtime.
 *
 * Enforces:
 *  - Full envelope schema + cryptographic metadata (via protocol safeParseEnvelope)
 *  - Nonce replay detection (per-instance in-memory set)
 *  - Origin authentication against the set of established sessions
 */
export class RequestVerifier {
  readonly #consumedNonces = new Map<string, number>();
  readonly #authenticatedOrigins: ReadonlySet<string> | undefined;
  readonly #authenticatedOriginMatcher: ((origin: string) => boolean) | undefined;
  readonly #envelopeOptions: Omit<EnvelopeValidationOptions, "now" | "payloadParser">;
  readonly #sessionKeyResolver: SessionKeyResolver | undefined;
  readonly #now: () => Date;
  readonly #consumedNonceTtlMs: number;
  readonly #maxConsumedNonces: number;

  constructor(options: RequestVerifierOptions = {}) {
    this.#authenticatedOrigins = options.authenticatedOrigins;
    this.#authenticatedOriginMatcher = options.authenticatedOriginMatcher;
    this.#envelopeOptions = options.envelopeOptions ?? {};
    this.#sessionKeyResolver = options.sessionKeyResolver;
    this.#now = options.now ?? (() => new Date());
    this.#consumedNonceTtlMs =
      options.consumedNonceTtlMs ??
      REQUEST_VERIFIER_DEFAULT_CONSUMED_NONCE_TTL_MS;
    this.#maxConsumedNonces =
      options.maxConsumedNonces ?? REQUEST_VERIFIER_DEFAULT_MAX_CONSUMED_NONCES;

    if (!Number.isFinite(this.#consumedNonceTtlMs) || this.#consumedNonceTtlMs <= 0) {
      throw new RangeError("consumedNonceTtlMs must be a positive finite number.");
    }
    if (!Number.isFinite(this.#maxConsumedNonces) || this.#maxConsumedNonces <= 0) {
      throw new RangeError("maxConsumedNonces must be a positive finite number.");
    }
  }

  /**
   * Parses and validates a raw message against the canonical envelope schema,
   * checks for nonce replay, and validates the authenticated-origin constraint.
   *
   * On success the nonce is consumed.  The method is intentionally synchronous
   * so that callers can enforce a strict gate without await overhead.
   */
  verify<TPayload = unknown>(
    input: unknown,
    payloadParser?: (payload: unknown) => TPayload,
  ): RequestVerifyResult<TPayload> {
    return this.#verifyEnvelope(input, payloadParser, true);
  }

  verifyWithProof<TPayload = unknown>(
    input: unknown,
    proofInput: RequestProofVerificationInput<TPayload>,
  ): RequestVerifyResult<TPayload> {
    const allowConsumedNonce = proofInput.allowConsumedNonce === true;
    const verifiedEnvelope = this.#verifyEnvelope(
      input,
      proofInput.payloadParser,
      false,
      allowConsumedNonce,
    );
    if (!verifiedEnvelope.ok) {
      return verifiedEnvelope;
    }

    if (this.#sessionKeyResolver === undefined) {
      return fail(
        "auth.invalid",
        "Request proof verification is unavailable (session key resolver missing).",
      );
    }

    const sessionToken = proofInput.sessionToken.trim();
    if (sessionToken.length === 0) {
      return fail("request.invalid", "Request proof requires a non-empty sessionToken.");
    }

    const resolvedSession = this.#resolveSessionKey(sessionToken);
    if (resolvedSession === undefined) {
      return fail("auth.invalid", "Handshake session token is unknown or expired.");
    }
    const sessionKey = resolvedSession.sessionKey;

    const normalizedExtensionId = normalizeOptionalNonEmptyString(proofInput.extensionId);
    if (normalizedExtensionId === undefined) {
      return replayFailure(
        "Request proof verification requires extensionId to enforce handshake session binding.",
      );
    }
    if (resolvedSession.extensionId !== normalizedExtensionId) {
      return replayFailure(
        "Handshake session token extensionId binding does not match verification context.",
      );
    }

    const parsedProof = this.#parseCloudProofPayload(proofInput.proof);
    if (!parsedProof.ok) {
      return parsedProof;
    }

    const parsedHandle = this.#parseCloudConnectionHandle(proofInput.connectionHandle);
    if (!parsedHandle.ok) {
      return parsedHandle;
    }

    const handleBinding = this.#parseOptionalHandleBindingMetadata(
      proofInput.connectionHandle,
    );
    if (!handleBinding.ok) {
      return handleBinding;
    }

    const envelope = verifiedEnvelope.envelope;
    const proof = parsedProof.proof;
    const handle = parsedHandle.handle;

    if (proof.requestId !== envelope.requestId) {
      return replayFailure("Request proof requestId does not match the request envelope.");
    }
    if (proof.nonce !== envelope.nonce) {
      return replayFailure("Request proof nonce does not match the request envelope.");
    }
    if (proof.origin !== envelope.origin) {
      return replayFailure("Request proof origin does not match the request envelope.");
    }
    if (proof.connectionHandle !== handle.connectionHandle) {
      return replayFailure("Request proof connectionHandle does not match the provided handle.");
    }
    if (handle.origin !== envelope.origin) {
      return replayFailure("Connection handle origin does not match the request envelope.");
    }

    const expectedPayloadHash = computeRequestPayloadHash(envelope.payload);
    if (proof.payloadHash !== expectedPayloadHash) {
      return replayFailure("Request proof payload hash does not match the request envelope payload.");
    }

    if (handle.extensionId !== normalizedExtensionId) {
      return replayFailure("Connection handle extensionId binding does not match verification context.");
    }

    const normalizedOrigin = normalizeOptionalNonEmptyString(proofInput.origin);
    if (normalizedOrigin !== undefined && handle.origin !== normalizedOrigin) {
      return replayFailure("Connection handle origin binding does not match verification context.");
    }

    const normalizedPolicyVersion = normalizeOptionalNonEmptyString(
      proofInput.policyVersion,
    );
    if (normalizedPolicyVersion !== undefined) {
      if (handleBinding.binding.policyVersion === undefined) {
        return replayFailure(
          "Connection handle policyVersion binding metadata is missing for verification.",
        );
      }
      if (handleBinding.binding.policyVersion !== normalizedPolicyVersion) {
        return replayFailure(
          "Connection handle policyVersion binding does not match verification context.",
        );
      }
    }

    const normalizedEndpointProfileHash = normalizeOptionalNonEmptyString(
      proofInput.endpointProfileHash,
    );
    if (normalizedEndpointProfileHash !== undefined) {
      if (handleBinding.binding.endpointProfileHash === undefined) {
        return replayFailure(
          "Connection handle endpointProfileHash binding metadata is missing for verification.",
        );
      }
      if (
        handleBinding.binding.endpointProfileHash !== normalizedEndpointProfileHash
      ) {
        return replayFailure(
          "Connection handle endpointProfileHash binding does not match verification context.",
        );
      }
    }

    const verifiedProof = verifyRequestProof({
      requestId: proof.requestId,
      nonce: proof.nonce,
      origin: proof.origin,
      connectionHandle: proof.connectionHandle,
      payloadHash: proof.payloadHash,
      proof: proof.proof,
      sessionKey,
    });
    if (!verifiedProof.ok) {
      return verifiedProof;
    }

    const nonceAlreadyConsumed = this.#consumedNonces.has(envelope.nonce);
    if (!nonceAlreadyConsumed) {
      const consumeError = this.#consumeNonce(envelope.nonce);
      if (consumeError !== undefined) {
        return consumeError;
      }
    }

    return verifiedEnvelope;
  }

  /** Clears the consumed-nonce set.  Use only in tests or after session reset. */
  clearNonces(): void {
    this.#consumedNonces.clear();
  }

  #verifyEnvelope<TPayload>(
    input: unknown,
    payloadParser: ((payload: unknown) => TPayload) | undefined,
    consumeNonce: boolean,
    allowConsumedNonce: boolean = false,
  ): RequestVerifyResult<TPayload> {
    const now = this.#now();
    const nowMs = now.getTime();
    this.#cleanupExpiredNonces(nowMs);

    const opts: EnvelopeValidationOptions<TPayload> = {
      ...this.#envelopeOptions,
      now,
      ...(payloadParser !== undefined ? { payloadParser } : {}),
    };

    const parsed = safeParseEnvelope<TPayload>(input, opts);

    if (!parsed.success) {
      return fail(parsed.error.reasonCode, parsed.error.message);
    }

    const { data: envelope } = parsed;

    if (!allowConsumedNonce && this.#consumedNonces.has(envelope.nonce)) {
      return replayFailure("Nonce has already been consumed.");
    }

    const hasAuthenticatedOriginGate =
      this.#authenticatedOrigins !== undefined ||
      this.#authenticatedOriginMatcher !== undefined;
    if (hasAuthenticatedOriginGate) {
      const setMatched =
        this.#authenticatedOrigins?.has(envelope.origin) ?? false;
      let matcherMatched = false;
      if (this.#authenticatedOriginMatcher !== undefined) {
        try {
          matcherMatched = this.#authenticatedOriginMatcher(envelope.origin);
        } catch {
          return fail(
            "auth.invalid",
            "Authenticated origin matcher failed while validating request origin.",
          );
        }
      }
      if (!setMatched && !matcherMatched) {
        return fail("auth.invalid", `Origin "${envelope.origin}" is not authenticated.`);
      }
    }

    if (consumeNonce) {
      const consumeError = this.#consumeNonce(envelope.nonce, nowMs);
      if (consumeError !== undefined) {
        return consumeError;
      }
    }

    return { ok: true, envelope };
  }

  #consumeNonce(
    nonce: string,
    nowMs: number = this.#now().getTime(),
  ): RequestVerifyFailure | undefined {
    if (this.#consumedNonces.has(nonce)) {
      return replayFailure("Nonce has already been consumed.");
    }
    this.#cleanupExpiredNonces(nowMs);
    if (this.#consumedNonces.size >= this.#maxConsumedNonces) {
      return replayFailure(
        "Nonce retention capacity exceeded; cannot safely verify replay protection.",
      );
    }
    this.#consumedNonces.set(nonce, nowMs);
    return undefined;
  }

  #cleanupExpiredNonces(nowMs: number): void {
    const cutoffMs = nowMs - this.#consumedNonceTtlMs;
    for (const [nonce, consumedAtMs] of this.#consumedNonces) {
      if (consumedAtMs <= cutoffMs) {
        this.#consumedNonces.delete(nonce);
      }
    }
  }

  #resolveSessionKey(sessionToken: string): ResolvedSessionKey | undefined {
    let resolved: ResolvedSessionKey | undefined;
    try {
      resolved = this.#sessionKeyResolver?.(sessionToken);
    } catch {
      return undefined;
    }
    if (resolved === undefined) {
      return undefined;
    }

    if (
      typeof resolved.extensionId !== "string" ||
      resolved.extensionId.trim().length === 0 ||
      !Buffer.isBuffer(resolved.sessionKey)
    ) {
      return undefined;
    }

    return {
      extensionId: resolved.extensionId.trim(),
      sessionKey: Buffer.from(resolved.sessionKey),
    };
  }

  #parseCloudProofPayload(
    input: unknown,
  ): Readonly<{ ok: true; proof: CloudRequestProof }> | RequestVerifyFailure {
    try {
      return { ok: true, proof: parseCloudRequestProof(input) };
    } catch (error) {
      if (error instanceof EnvelopeValidationError) {
        return fail(error.reasonCode, error.message);
      }
      return fail("request.invalid", "Failed to parse cloud request proof payload.");
    }
  }

  #parseCloudConnectionHandle(
    input: unknown,
  ): Readonly<{ ok: true; handle: CloudConnectionHandle }> | RequestVerifyFailure {
    try {
      return { ok: true, handle: parseCloudConnectionHandle(input) };
    } catch (error) {
      if (error instanceof EnvelopeValidationError) {
        return fail(error.reasonCode, error.message);
      }
      return fail("request.invalid", "Failed to parse cloud connection handle payload.");
    }
  }

  #parseOptionalHandleBindingMetadata(
    input: unknown,
  ): Readonly<{ ok: true; binding: CloudHandleBindingMetadata }> | RequestVerifyFailure {
    if (!isRecord(input)) {
      return fail("request.invalid", "Cloud connection handle payload must be an object.");
    }

    const policyVersion = input["policyVersion"];
    if (policyVersion !== undefined && typeof policyVersion !== "string") {
      return fail(
        "request.invalid",
        'Cloud connection handle field "policyVersion" must be a string when present.',
      );
    }

    const endpointProfileHash = input["endpointProfileHash"];
    if (
      endpointProfileHash !== undefined &&
      typeof endpointProfileHash !== "string"
    ) {
      return fail(
        "request.invalid",
        'Cloud connection handle field "endpointProfileHash" must be a string when present.',
      );
    }

    const normalizedPolicyVersion = normalizeOptionalNonEmptyString(policyVersion);
    const normalizedEndpointProfileHash = normalizeOptionalNonEmptyString(
      endpointProfileHash,
    );

    return {
      ok: true,
      binding: {
        ...(normalizedPolicyVersion !== undefined
          ? {
            policyVersion: normalizedPolicyVersion,
          }
          : {}),
        ...(normalizedEndpointProfileHash !== undefined
          ? {
            endpointProfileHash: normalizedEndpointProfileHash,
          }
          : {}),
      },
    };
  }
}
