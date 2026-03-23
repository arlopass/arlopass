import { describe, expect, it } from "vitest";

import {
  isReasonCode,
  normalizeReasonCode,
  REASON_CODE_CATALOG,
} from "../reason-codes.js";

describe("reason code normalization", () => {
  it("keeps canonical reason codes unchanged", () => {
    for (const reasonCode of REASON_CODE_CATALOG) {
      expect(normalizeReasonCode(reasonCode)).toBe(reasonCode);
    }
  });

  it("normalizes aliases and formatting variants", () => {
    expect(normalizeReasonCode("policy_blocked")).toBe("policy.denied");
    expect(normalizeReasonCode("request malformed")).toBe("request.invalid");
    expect(normalizeReasonCode("TIMEOUT")).toBe("transport.timeout");
  });

  it("maps unsupported reason codes to a deterministic fallback", () => {
    expect(normalizeReasonCode("does.not.exist")).toBe("request.invalid");
    expect(normalizeReasonCode("")).toBe("request.invalid");
    expect(normalizeReasonCode(null)).toBe("request.invalid");
  });

  it("detects whether a value is a catalog reason code", () => {
    expect(isReasonCode("allow")).toBe(true);
    expect(isReasonCode("policy.denied")).toBe(true);
    expect(isReasonCode("unknown.reason")).toBe(false);
  });
});
