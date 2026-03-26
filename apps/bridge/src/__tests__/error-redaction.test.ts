import { describe, expect, it } from "vitest";

import {
  redactProviderPayload,
  toSafeUserError,
} from "../cloud/error-redaction.js";

describe("error redaction", () => {
  it("redacts secrets in provider payloads", () => {
    const redacted = redactProviderPayload({
      apiKey: "sk-secret",
      token: "abc",
      nested: {
        Authorization: "Bearer hello-world-token",
      },
      safeValue: "keep-me",
    });

    expect(redacted).toMatchObject({
      apiKey: "[REDACTED]",
      token: "[REDACTED]",
      nested: {
        Authorization: "Bearer [REDACTED]",
      },
      safeValue: "keep-me",
    });
  });

  it("removes secrets from user-safe error messages while preserving reasonCode", () => {
    const safe = toSafeUserError({
      providerError: "401 invalid api_key=sk-secret token=abc Authorization: Bearer xyz",
      reasonCode: "auth.invalid",
    });

    expect(safe.reasonCode).toBe("auth.invalid");
    expect(safe.message).not.toContain("sk-secret");
    expect(safe.message).not.toContain("token=abc");
    expect(safe.message).not.toContain("Bearer xyz");
    expect(safe.message).toContain("[REDACTED]");
  });
});

