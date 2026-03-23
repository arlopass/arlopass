/**
 * Version-skew compatibility matrix
 *
 * Validates protocol version negotiation across a matrix of client/server
 * version pairs, ensuring:
 *   1. Same-major versions always negotiate successfully.
 *   2. Different-major versions are always rejected.
 *   3. The negotiated version is the lesser of client and server within
 *      the same major line (backward compatibility).
 *   4. Edge cases: pre-release suffixes, patch-only differences, etc.
 *
 * Uses only `@byom-ai/protocol` — no network or process I/O.
 */
import { describe, it, expect } from "vitest";

import {
  negotiateProtocolVersion,
  parseProtocolVersion,
  isProtocolVersionInRange,
  compareProtocolVersions,
} from "@byom-ai/protocol";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type NegotiationCase = {
  client: string;
  server: string;
  expectOk: boolean;
  expectVersion?: string;
  expectReason?: "unsupported_major" | "no_compatible_version";
};

function runMatrix(cases: NegotiationCase[]): void {
  for (const tc of cases) {
    const result = negotiateProtocolVersion(tc.client, tc.server);
    if (tc.expectOk) {
      expect(result.ok, `Expected ok for ${tc.client} ↔ ${tc.server}`).toBe(
        true,
      );
      if (result.ok && tc.expectVersion !== undefined) {
        expect(
          result.version.raw,
          `Expected version ${tc.expectVersion} for ${tc.client} ↔ ${tc.server}`,
        ).toBe(tc.expectVersion);
      }
    } else {
      expect(result.ok, `Expected failure for ${tc.client} ↔ ${tc.server}`).toBe(
        false,
      );
      if (!result.ok && tc.expectReason !== undefined) {
        expect(result.reason).toBe(tc.expectReason);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SAME_VERSION_CASES: NegotiationCase[] = [
  { client: "1.0.0", server: "1.0.0", expectOk: true, expectVersion: "1.0.0" },
  { client: "2.3.4", server: "2.3.4", expectOk: true, expectVersion: "2.3.4" },
  { client: "0.1.0", server: "0.1.0", expectOk: true, expectVersion: "0.1.0" },
];

const BACKWARD_COMPAT_CASES: NegotiationCase[] = [
  // Older client, newer server → negotiate down to client version
  {
    client: "1.1.0",
    server: "1.2.0",
    expectOk: true,
    expectVersion: "1.1.0",
  },
  {
    client: "1.0.0",
    server: "1.5.3",
    expectOk: true,
    expectVersion: "1.0.0",
  },
  // Newer client, older server → negotiate down to server version
  {
    client: "1.3.0",
    server: "1.1.0",
    expectOk: true,
    expectVersion: "1.1.0",
  },
  {
    client: "2.9.9",
    server: "2.0.1",
    expectOk: true,
    expectVersion: "2.0.1",
  },
];

const MAJOR_MISMATCH_CASES: NegotiationCase[] = [
  {
    client: "1.0.0",
    server: "2.0.0",
    expectOk: false,
    expectReason: "unsupported_major",
  },
  {
    client: "2.0.0",
    server: "1.0.0",
    expectOk: false,
    expectReason: "unsupported_major",
  },
  {
    client: "3.1.0",
    server: "1.0.0",
    expectOk: false,
    expectReason: "unsupported_major",
  },
  {
    client: "0.1.0",
    server: "1.0.0",
    expectOk: false,
    expectReason: "unsupported_major",
  },
];

const PATCH_DIFF_CASES: NegotiationCase[] = [
  {
    client: "1.0.1",
    server: "1.0.0",
    expectOk: true,
    expectVersion: "1.0.0",
  },
  {
    client: "1.0.0",
    server: "1.0.9",
    expectOk: true,
    expectVersion: "1.0.0",
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Version-skew compatibility matrix", () => {
  describe("same version pairs", () => {
    it("negotiates successfully at identical versions", () => {
      runMatrix(SAME_VERSION_CASES);
    });
  });

  describe("backward-compatible minor/patch differences", () => {
    it("negotiates to the lower version within the same major", () => {
      runMatrix(BACKWARD_COMPAT_CASES);
    });
  });

  describe("major version mismatch (breaking change boundary)", () => {
    it("rejects negotiation across major version boundaries", () => {
      runMatrix(MAJOR_MISMATCH_CASES);
    });
  });

  describe("patch-only version differences", () => {
    it("negotiates successfully for patch-only differences", () => {
      runMatrix(PATCH_DIFF_CASES);
    });
  });

  describe("version range membership", () => {
    it("accepts versions within an inclusive range", () => {
      expect(
        isProtocolVersionInRange("1.2.0", { min: "1.0.0", max: "1.5.0" }),
      ).toBe(true);
      expect(
        isProtocolVersionInRange("1.0.0", { min: "1.0.0", max: "1.5.0" }),
      ).toBe(true);
      expect(
        isProtocolVersionInRange("1.5.0", { min: "1.0.0", max: "1.5.0" }),
      ).toBe(true);
    });

    it("rejects versions outside the range", () => {
      expect(
        isProtocolVersionInRange("0.9.9", { min: "1.0.0", max: "1.5.0" }),
      ).toBe(false);
      expect(
        isProtocolVersionInRange("1.5.1", { min: "1.0.0", max: "1.5.0" }),
      ).toBe(false);
      expect(
        isProtocolVersionInRange("2.0.0", { min: "1.0.0", max: "1.5.0" }),
      ).toBe(false);
    });
  });

  describe("version comparison ordering", () => {
    it("orders versions correctly by semver precedence", () => {
      const v = (s: string) => parseProtocolVersion(s);

      expect(compareProtocolVersions(v("1.0.0"), v("1.0.1"))).toBeLessThan(0);
      expect(compareProtocolVersions(v("1.0.1"), v("1.0.0"))).toBeGreaterThan(
        0,
      );
      expect(compareProtocolVersions(v("1.0.0"), v("1.0.0"))).toBe(0);
      expect(compareProtocolVersions(v("1.1.0"), v("1.0.9"))).toBeGreaterThan(
        0,
      );
      expect(compareProtocolVersions(v("2.0.0"), v("1.9.9"))).toBeGreaterThan(
        0,
      );
    });
  });

  describe("full compatibility matrix exhaustion", () => {
    it("validates all combinatorial pairs in a 3×3 version grid", () => {
      const versions = ["1.0.0", "1.1.0", "1.2.0"];
      let okCount = 0;
      let failCount = 0;

      for (const client of versions) {
        for (const server of versions) {
          const result = negotiateProtocolVersion(client, server);
          if (result.ok) {
            okCount += 1;
            // Negotiated version must be within both client and server bounds
            const negotiated = result.version;
            const c = parseProtocolVersion(client);
            const s = parseProtocolVersion(server);
            expect(compareProtocolVersions(negotiated, c)).toBeLessThanOrEqual(
              0,
            );
            expect(compareProtocolVersions(negotiated, s)).toBeLessThanOrEqual(
              0,
            );
          } else {
            failCount += 1;
          }
        }
      }

      // All same-major pairs should succeed (9 pairs from a 3×3 grid)
      expect(okCount).toBe(9);
      expect(failCount).toBe(0);
    });

    it("rejects all cross-major pairs in a 2-major version grid", () => {
      const v1Versions = ["1.0.0", "1.1.0"];
      const v2Versions = ["2.0.0", "2.1.0"];
      let rejectCount = 0;

      for (const client of v1Versions) {
        for (const server of v2Versions) {
          const result = negotiateProtocolVersion(client, server);
          if (!result.ok) rejectCount += 1;
        }
      }
      for (const client of v2Versions) {
        for (const server of v1Versions) {
          const result = negotiateProtocolVersion(client, server);
          if (!result.ok) rejectCount += 1;
        }
      }

      expect(rejectCount).toBe(
        v1Versions.length * v2Versions.length * 2, // both directions
      );
    });
  });
});
