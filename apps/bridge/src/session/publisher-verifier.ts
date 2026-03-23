/**
 * Publisher verification: bridge binary code-signature and install-path pinning.
 *
 * The BinarySignatureVerifier interface is intentionally injectable so that
 * production code can back it with the OS-level codesign/signtool mechanism
 * while tests supply a deterministic mock.
 */

export type PublisherVerificationOutcome =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: string }>;

export interface BinarySignatureVerifier {
  verify(binaryPath: string): Promise<PublisherVerificationOutcome>;
}

export type PublisherVerifierConfig = Readonly<{
  /** Exact filesystem paths that are permitted for the host binary. */
  pinnedHostPaths: readonly string[];
  /** Backend that performs the OS-level code-signature check. */
  binarySignatureVerifier: BinarySignatureVerifier;
  /** Absolute path to the currently running binary. */
  currentBinaryPath: string;
}>;

export class PublisherVerificationError extends Error {
  readonly reasonCode = "auth.invalid" as const;

  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
    this.name = "PublisherVerificationError";
  }
}

export class PublisherVerifier {
  readonly #pinnedHostPaths: ReadonlySet<string>;
  readonly #binarySignatureVerifier: BinarySignatureVerifier;
  readonly #currentBinaryPath: string;

  constructor(config: PublisherVerifierConfig) {
    this.#pinnedHostPaths = new Set(config.pinnedHostPaths);
    this.#binarySignatureVerifier = config.binarySignatureVerifier;
    this.#currentBinaryPath = config.currentBinaryPath;
  }

  /**
   * Asserts that hostPath is in the pinned install-path set.
   * Throws PublisherVerificationError when the check fails.
   */
  assertPathPinned(hostPath: string): void {
    if (!this.#pinnedHostPaths.has(hostPath)) {
      throw new PublisherVerificationError(
        `Host binary path "${hostPath}" is not in the pinned path list.`,
      );
    }
  }

  /**
   * Verifies the code signature of the currently running binary via the
   * injected backend.  Throws PublisherVerificationError on any failure.
   */
  async verifyCurrentBinarySignature(): Promise<void> {
    const outcome = await this.#binarySignatureVerifier.verify(
      this.#currentBinaryPath,
    );

    if (!outcome.ok) {
      throw new PublisherVerificationError(
        `Binary signature verification failed: ${outcome.reason}`,
      );
    }
  }
}
