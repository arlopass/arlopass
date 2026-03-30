import { describe, expect, it } from "vitest";

import {
  createAuthenticatedOriginPolicyFromEnv,
  isLoopbackOrigin,
} from "../config/authenticated-origin-policy.js";

describe("authenticated-origin-policy", () => {
  it("allows all origins by default (extension handles consent)", () => {
    const policy = createAuthenticatedOriginPolicyFromEnv({});

    expect(policy.authenticatedOriginMatcher("http://127.0.0.1:4172")).toBe(true);
    expect(policy.authenticatedOriginMatcher("http://localhost:3000")).toBe(true);
    expect(policy.authenticatedOriginMatcher("http://[::1]:5173")).toBe(true);
    expect(policy.authenticatedOriginMatcher("https://app.example.com")).toBe(true);
  });

  it("restricts to explicit origins when ARLOPASS_BRIDGE_AUTHENTICATED_ORIGINS is set", () => {
    const policy = createAuthenticatedOriginPolicyFromEnv({
      ARLOPASS_BRIDGE_AUTHENTICATED_ORIGINS: "https://app.example.com, https://staging.example.com",
    });

    expect(policy.authenticatedOriginMatcher("https://app.example.com")).toBe(true);
    expect(policy.authenticatedOriginMatcher("https://staging.example.com")).toBe(true);
    expect(policy.authenticatedOriginMatcher("https://unknown.example.com")).toBe(false);
  });

  it("derives chrome-extension origins from explicit extension IDs", () => {
    const extensionId = "abcdefghijklmnopabcdefghijklmnop";
    const policy = createAuthenticatedOriginPolicyFromEnv({
      ARLOPASS_BRIDGE_AUTHENTICATED_EXTENSION_IDS: extensionId,
    });

    expect(policy.authenticatedOrigins.has(`chrome-extension://${extensionId}`)).toBe(
      true,
    );
    expect(
      policy.authenticatedOriginMatcher(`chrome-extension://${extensionId}`),
    ).toBe(true);
  });

  it("does not implicitly trust wildcard origin entries", () => {
    const policy = createAuthenticatedOriginPolicyFromEnv({
      ARLOPASS_BRIDGE_AUTHENTICATED_ORIGINS: "*",
    });

    // Wildcard is not a valid origin, so the policy has entries but none match
    expect(policy.authenticatedOriginMatcher("https://app.example.com")).toBe(false);
  });

  it("supports disabling default loopback allowances when policy is set", () => {
    const policy = createAuthenticatedOriginPolicyFromEnv({
      ARLOPASS_BRIDGE_AUTHENTICATED_ORIGINS: "https://only-this.example.com",
      ARLOPASS_BRIDGE_ALLOW_LOOPBACK_ORIGINS: "false",
    });

    expect(policy.authenticatedOriginMatcher("http://127.0.0.1:4172")).toBe(false);
    expect(policy.authenticatedOriginMatcher("https://only-this.example.com")).toBe(true);
  });
});

describe("isLoopbackOrigin", () => {
  it("accepts localhost and loopback IPs for http(s)", () => {
    expect(isLoopbackOrigin("http://localhost:3000")).toBe(true);
    expect(isLoopbackOrigin("https://127.0.0.1:8443")).toBe(true);
    expect(isLoopbackOrigin("http://[::1]:5173")).toBe(true);
  });

  it("rejects non-loopback hosts and non-http(s) origins", () => {
    expect(isLoopbackOrigin("https://app.example.com")).toBe(false);
    expect(
      isLoopbackOrigin("chrome-extension://abcdefghijklmnopabcdefghijklmnop"),
    ).toBe(false);
  });
});
