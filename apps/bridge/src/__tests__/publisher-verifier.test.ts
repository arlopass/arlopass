import { describe, expect, it } from "vitest";

import {
  PublisherVerificationError,
  PublisherVerifier,
  type BinarySignatureVerifier,
} from "../session/publisher-verifier.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PINNED_PATHS = ["/opt/byom/bridge", "/usr/local/bin/byom-bridge"] as const;
const CURRENT_PATH = "/opt/byom/bridge";

function makeVerifier(
  opts: {
    pinnedHostPaths?: readonly string[];
    sigVerifier?: BinarySignatureVerifier;
    currentBinaryPath?: string;
  } = {},
): PublisherVerifier {
  return new PublisherVerifier({
    pinnedHostPaths: opts.pinnedHostPaths ?? PINNED_PATHS,
    binarySignatureVerifier: opts.sigVerifier ?? {
      verify: async () => ({ ok: true }),
    },
    currentBinaryPath: opts.currentBinaryPath ?? CURRENT_PATH,
  });
}

// ---------------------------------------------------------------------------
// assertPathPinned
// ---------------------------------------------------------------------------

describe("PublisherVerifier.assertPathPinned", () => {
  it("does not throw when the path is in the pinned list", () => {
    const verifier = makeVerifier();
    expect(() => verifier.assertPathPinned("/opt/byom/bridge")).not.toThrow();
    expect(() =>
      verifier.assertPathPinned("/usr/local/bin/byom-bridge"),
    ).not.toThrow();
  });

  it("throws PublisherVerificationError for a path not in the pinned list", () => {
    const verifier = makeVerifier();

    expect(() => verifier.assertPathPinned("/tmp/evil-bridge")).toThrow(
      PublisherVerificationError,
    );
  });

  it("throws for an empty string path", () => {
    const verifier = makeVerifier();
    expect(() => verifier.assertPathPinned("")).toThrow(
      PublisherVerificationError,
    );
  });

  it("throws for a path that is a substring of a pinned path", () => {
    const verifier = makeVerifier();
    // "/opt/byom" is not in the set; only the full "/opt/byom/bridge" is.
    expect(() => verifier.assertPathPinned("/opt/byom")).toThrow(
      PublisherVerificationError,
    );
  });

  it("error carries reasonCode auth.invalid", () => {
    const verifier = makeVerifier();
    try {
      verifier.assertPathPinned("/bad/path");
    } catch (error) {
      expect(error).toBeInstanceOf(PublisherVerificationError);
      expect((error as PublisherVerificationError).reasonCode).toBe("auth.invalid");
    }
  });
});

// ---------------------------------------------------------------------------
// verifyCurrentBinarySignature
// ---------------------------------------------------------------------------

describe("PublisherVerifier.verifyCurrentBinarySignature", () => {
  it("resolves when the backend reports ok: true", async () => {
    const verifier = makeVerifier({
      sigVerifier: { verify: async () => ({ ok: true }) },
    });

    await expect(verifier.verifyCurrentBinarySignature()).resolves.toBeUndefined();
  });

  it("rejects with PublisherVerificationError when backend reports ok: false", async () => {
    const verifier = makeVerifier({
      sigVerifier: {
        verify: async () => ({ ok: false, reason: "signature mismatch" }),
      },
    });

    await expect(verifier.verifyCurrentBinarySignature()).rejects.toBeInstanceOf(
      PublisherVerificationError,
    );
  });

  it("error message contains the backend reason string", async () => {
    const reason = "certificate chain untrusted";
    const verifier = makeVerifier({
      sigVerifier: { verify: async () => ({ ok: false, reason }) },
    });

    const error = await verifier.verifyCurrentBinarySignature().catch((e: unknown) => e);
    expect((error as Error).message).toContain(reason);
  });

  it("passes the currentBinaryPath from config to the backend", async () => {
    const observed: string[] = [];
    const verifier = makeVerifier({
      currentBinaryPath: "/custom/path/bridge",
      sigVerifier: {
        verify: async (p) => {
          observed.push(p);
          return { ok: true };
        },
      },
    });

    await verifier.verifyCurrentBinarySignature();
    expect(observed).toEqual(["/custom/path/bridge"]);
  });

  it("propagates unexpected errors from the backend", async () => {
    const verifier = makeVerifier({
      sigVerifier: {
        verify: async () => {
          throw new Error("unexpected backend failure");
        },
      },
    });

    await expect(verifier.verifyCurrentBinarySignature()).rejects.toThrow(
      "unexpected backend failure",
    );
  });
});
