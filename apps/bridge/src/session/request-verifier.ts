import {
  safeParseEnvelope,
  type CanonicalEnvelope,
  type EnvelopeValidationOptions,
} from "@byom-ai/protocol";

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
  envelopeOptions?: Omit<EnvelopeValidationOptions, "now" | "payloadParser">;
  now?: () => Date;
}>;

/**
 * Stateful envelope verifier for the bridge runtime.
 *
 * Enforces:
 *  - Full envelope schema + cryptographic metadata (via protocol safeParseEnvelope)
 *  - Nonce replay detection (per-instance in-memory set)
 *  - Origin authentication against the set of established sessions
 */
export class RequestVerifier {
  readonly #consumedNonces = new Set<string>();
  readonly #authenticatedOrigins: ReadonlySet<string> | undefined;
  readonly #envelopeOptions: Omit<EnvelopeValidationOptions, "now" | "payloadParser">;
  readonly #now: () => Date;

  constructor(options: RequestVerifierOptions = {}) {
    this.#authenticatedOrigins = options.authenticatedOrigins;
    this.#envelopeOptions = options.envelopeOptions ?? {};
    this.#now = options.now ?? (() => new Date());
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
    const now = this.#now();

    const opts: EnvelopeValidationOptions<TPayload> = {
      ...this.#envelopeOptions,
      now,
      ...(payloadParser !== undefined ? { payloadParser } : {}),
    };

    const parsed = safeParseEnvelope<TPayload>(input, opts);

    if (!parsed.success) {
      return {
        ok: false,
        error: {
          reasonCode: parsed.error.reasonCode,
          message: parsed.error.message,
        },
      };
    }

    const { data: envelope } = parsed;

    if (this.#consumedNonces.has(envelope.nonce)) {
      return {
        ok: false,
        error: {
          reasonCode: "request.replay_prone",
          message: "Nonce has already been consumed.",
        },
      };
    }

    if (
      this.#authenticatedOrigins !== undefined &&
      !this.#authenticatedOrigins.has(envelope.origin)
    ) {
      return {
        ok: false,
        error: {
          reasonCode: "auth.invalid",
          message: `Origin "${envelope.origin}" is not authenticated.`,
        },
      };
    }

    this.#consumedNonces.add(envelope.nonce);

    return { ok: true, envelope };
  }

  /** Clears the consumed-nonce set.  Use only in tests or after session reset. */
  clearNonces(): void {
    this.#consumedNonces.clear();
  }
}
