import { describe, expect, it } from "vitest";

import {
  RUNTIME_ERROR_CODES,
  SandboxViolationError,
  SandboxContext,
  assertEgressAllowed,
  assertPermission,
  buildSandboxPolicy,
  checkEgressAttempt,
  checkPermission,
  type AdapterManifest,
  type EgressAttempt,
  type SandboxPolicy,
} from "../index.js";

function makeSandboxPolicy(
  overrides: Partial<{
    permissions: string[];
    egressRules: AdapterManifest["egressRules"];
  }> = {},
): SandboxPolicy {
  return buildSandboxPolicy({
    schemaVersion: "1.0.0",
    providerId: "test-provider",
    version: "1.0.0",
    displayName: "Test Provider",
    authType: "none",
    capabilities: ["chat.completions"],
    requiredPermissions: overrides.permissions ?? ["network.egress", "filesystem.read"],
    egressRules: overrides.egressRules ?? [
      { host: "api.example.com", protocol: "https" },
      { host: "localhost", protocol: "http", port: 8080 },
    ],
    riskLevel: "low",
    signingKeyId: "key.adapter.primary",
  } as AdapterManifest);
}

describe("buildSandboxPolicy", () => {
  it("extracts allowed permissions from manifest", () => {
    const policy = makeSandboxPolicy({ permissions: ["network.egress", "filesystem.read"] });
    expect(policy.allowedPermissions.has("network.egress")).toBe(true);
    expect(policy.allowedPermissions.has("filesystem.read")).toBe(true);
    expect(policy.allowedPermissions.has("filesystem.write")).toBe(false);
  });

  it("ignores unknown permission strings", () => {
    const policy = makeSandboxPolicy({ permissions: ["network.egress", "some.unknown.perm"] });
    expect(policy.allowedPermissions.has("network.egress")).toBe(true);
    expect(policy.allowedPermissions.size).toBe(1);
  });

  it("copies egress rules from manifest", () => {
    const policy = makeSandboxPolicy({
      egressRules: [{ host: "api.example.com", protocol: "https" }],
    });
    expect(policy.allowedEgressRules).toHaveLength(1);
    expect(policy.allowedEgressRules[0]?.host).toBe("api.example.com");
  });
});

describe("checkPermission", () => {
  it("allows a declared permission", () => {
    const policy = makeSandboxPolicy({ permissions: ["network.egress"] });
    const result = checkPermission(policy, "network.egress");
    expect(result.allowed).toBe(true);
  });

  it("denies an undeclared permission", () => {
    const policy = makeSandboxPolicy({ permissions: ["network.egress"] });
    const result = checkPermission(policy, "filesystem.write");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("filesystem.write");
  });

  it("denies everything when policy is undefined", () => {
    const result = checkPermission(undefined, "network.egress");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
  });
});

describe("checkEgressAttempt", () => {
  it("allows egress matching declared rule", () => {
    const policy = makeSandboxPolicy({
      permissions: ["network.egress"],
      egressRules: [{ host: "api.example.com", protocol: "https" }],
    });
    const result = checkEgressAttempt(policy, { host: "api.example.com", protocol: "https" });
    expect(result.allowed).toBe(true);
  });

  it("allows egress matching rule with port", () => {
    const policy = makeSandboxPolicy({
      permissions: ["network.egress"],
      egressRules: [{ host: "localhost", protocol: "http", port: 8080 }],
    });
    const result = checkEgressAttempt(policy, { host: "localhost", protocol: "http", port: 8080 });
    expect(result.allowed).toBe(true);
  });

  it("denies egress to undeclared host", () => {
    const policy = makeSandboxPolicy({
      permissions: ["network.egress"],
      egressRules: [{ host: "api.example.com", protocol: "https" }],
    });
    const result = checkEgressAttempt(policy, { host: "evil.attacker.com", protocol: "https" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("evil.attacker.com");
  });

  it("denies egress when network.egress permission is missing", () => {
    const policy = makeSandboxPolicy({
      permissions: ["filesystem.read"],
      egressRules: [{ host: "api.example.com", protocol: "https" }],
    });
    const result = checkEgressAttempt(policy, { host: "api.example.com", protocol: "https" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("network.egress");
  });

  it("denies egress when policy is undefined", () => {
    const result = checkEgressAttempt(undefined, { host: "api.example.com", protocol: "https" });
    expect(result.allowed).toBe(false);
  });

  it("allows egress to wildcard host rule", () => {
    const policy = makeSandboxPolicy({
      permissions: ["network.egress"],
      egressRules: [{ host: "*", protocol: "https" }],
    });
    const result = checkEgressAttempt(policy, { host: "any.random.host.com", protocol: "https" });
    expect(result.allowed).toBe(true);
  });

  it("denies egress when protocol does not match rule", () => {
    const policy = makeSandboxPolicy({
      permissions: ["network.egress"],
      egressRules: [{ host: "api.example.com", protocol: "https" }],
    });
    const result = checkEgressAttempt(policy, { host: "api.example.com", protocol: "http" });
    expect(result.allowed).toBe(false);
  });

  it("denies egress when port does not match rule", () => {
    const policy = makeSandboxPolicy({
      permissions: ["network.egress"],
      egressRules: [{ host: "localhost", protocol: "http", port: 8080 }],
    });
    const result = checkEgressAttempt(policy, { host: "localhost", protocol: "http", port: 9000 });
    expect(result.allowed).toBe(false);
  });
});

describe("assertPermission", () => {
  it("does not throw when permission is allowed", () => {
    const policy = makeSandboxPolicy({ permissions: ["network.egress"] });
    expect(() => assertPermission(policy, "network.egress")).not.toThrow();
  });

  it("throws SandboxViolationError when permission is denied", () => {
    const policy = makeSandboxPolicy({ permissions: ["network.egress"] });
    expect(() => assertPermission(policy, "filesystem.write")).toThrow(SandboxViolationError);
    try {
      assertPermission(policy, "filesystem.write");
    } catch (error) {
      expect(error).toBeInstanceOf(SandboxViolationError);
      if (error instanceof SandboxViolationError) {
        expect(error.code).toBe(RUNTIME_ERROR_CODES.SANDBOX_PERMISSION_DENIED);
      }
    }
  });

  it("throws SandboxViolationError when policy is missing", () => {
    expect(() => assertPermission(undefined, "network.egress")).toThrow(SandboxViolationError);
  });
});

describe("assertEgressAllowed", () => {
  it("does not throw for allowed egress", () => {
    const policy = makeSandboxPolicy({
      permissions: ["network.egress"],
      egressRules: [{ host: "api.example.com", protocol: "https" }],
    });
    expect(() =>
      assertEgressAllowed(policy, { host: "api.example.com", protocol: "https" }),
    ).not.toThrow();
  });

  it("throws SandboxViolationError for denied egress", () => {
    const policy = makeSandboxPolicy({
      permissions: ["network.egress"],
      egressRules: [{ host: "api.example.com", protocol: "https" }],
    });
    try {
      assertEgressAllowed(policy, { host: "evil.attacker.com", protocol: "https" });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SandboxViolationError);
      if (error instanceof SandboxViolationError) {
        expect(error.code).toBe(RUNTIME_ERROR_CODES.SANDBOX_EGRESS_DENIED);
      }
    }
  });
});

describe("SandboxContext", () => {
  it("wraps policy checks with provider context", () => {
    const policy = makeSandboxPolicy({
      permissions: ["network.egress"],
      egressRules: [{ host: "api.example.com", protocol: "https" }],
    });
    const ctx = new SandboxContext("test-provider", policy);

    expect(ctx.providerId).toBe("test-provider");
    expect(ctx.policy).toBe(policy);

    expect(ctx.checkPermission("network.egress").allowed).toBe(true);
    expect(ctx.checkPermission("filesystem.write").allowed).toBe(false);
    expect(
      ctx.checkEgress({ host: "api.example.com", protocol: "https" }).allowed,
    ).toBe(true);
    expect(
      ctx.checkEgress({ host: "evil.com", protocol: "https" }).allowed,
    ).toBe(false);
  });

  it("assertPermission and assertEgress delegates to helpers", () => {
    const policy = makeSandboxPolicy({
      permissions: ["network.egress"],
      egressRules: [{ host: "api.example.com", protocol: "https" }],
    });
    const ctx = new SandboxContext("test-provider", policy);

    expect(() => ctx.assertPermission("network.egress")).not.toThrow();
    expect(() => ctx.assertPermission("filesystem.write")).toThrow(SandboxViolationError);
    expect(() =>
      ctx.assertEgressAllowed({ host: "api.example.com", protocol: "https" }),
    ).not.toThrow();
    expect(() =>
      ctx.assertEgressAllowed({ host: "evil.com", protocol: "https" } satisfies EgressAttempt),
    ).toThrow(SandboxViolationError);
  });
});
