import { describe, expect, it } from "vitest";

import {
  compareProtocolVersions,
  isProtocolVersionInRange,
  negotiateProtocolVersion,
  parseProtocolVersion,
} from "../versioning.js";

describe("version negotiation", () => {
  it("parses semver protocol versions", () => {
    expect(parseProtocolVersion("1.2.3")).toEqual({
      raw: "1.2.3",
      major: 1,
      minor: 2,
      patch: 3,
    });
  });

  it("negotiates to the lower compatible version on matching major", () => {
    const result = negotiateProtocolVersion("1.3.4", "1.2.9");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.version.raw).toBe("1.2.9");
    }
  });

  it("rejects unsupported major version mismatches deterministically", () => {
    const result = negotiateProtocolVersion("2.0.0", "1.8.0");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unsupported_major");
      expect(result.client.major).toBe(2);
      expect(result.server.major).toBe(1);
    }
  });

  it("supports direct version ordering and range checks", () => {
    const left = parseProtocolVersion("1.2.0");
    const right = parseProtocolVersion("1.3.0");
    expect(compareProtocolVersions(left, right)).toBeLessThan(0);
    expect(
      isProtocolVersionInRange("1.2.5", {
        min: "1.2.0",
        max: "1.3.0",
      }),
    ).toBe(true);
  });
});
