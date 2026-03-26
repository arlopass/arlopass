import { describe, expect, it } from "vitest";

import {
  ADAPTER_AUTH_TYPES,
  ADAPTER_RISK_LEVELS,
  MANIFEST_SCHEMA_VERSION,
  isAdapterManifest,
  parseAdapterManifest,
  safeParseAdapterManifest,
} from "../manifest-schema.js";
import { ManifestValidationError, RUNTIME_ERROR_CODES } from "../errors.js";

function validManifestInput(): Record<string, unknown> {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    providerId: "ollama",
    version: "1.0.0",
    displayName: "Ollama Local",
    authType: "none",
    capabilities: ["provider.list", "chat.completions"],
    requiredPermissions: ["network.egress"],
    egressRules: [{ host: "localhost", protocol: "http", port: 11434 }],
    riskLevel: "low",
    signingKeyId: "key.adapter.primary",
  };
}

function expectManifestError(error: unknown, code: string, field?: string): void {
  expect(error).toBeInstanceOf(ManifestValidationError);
  if (error instanceof ManifestValidationError) {
    expect(error.code).toBe(code);
    if (field !== undefined) {
      expect(error.field).toBe(field);
    }
  }
}

describe("parseAdapterManifest", () => {
  it("parses a valid manifest successfully", () => {
    const manifest = parseAdapterManifest(validManifestInput());
    expect(manifest.providerId).toBe("ollama");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.displayName).toBe("Ollama Local");
    expect(manifest.authType).toBe(ADAPTER_AUTH_TYPES.NONE);
    expect(manifest.capabilities).toEqual(["chat.completions", "provider.list"]);
    expect(manifest.requiredPermissions).toEqual(["network.egress"]);
    expect(manifest.riskLevel).toBe(ADAPTER_RISK_LEVELS.LOW);
    expect(manifest.signingKeyId).toBe("key.adapter.primary");
    expect(manifest.egressRules).toHaveLength(1);
    expect(manifest.egressRules[0]).toMatchObject({ host: "localhost", protocol: "http", port: 11434 });
  });

  it("parses manifest with all auth types", () => {
    for (const authType of Object.values(ADAPTER_AUTH_TYPES)) {
      const manifest = parseAdapterManifest({ ...validManifestInput(), authType });
      expect(manifest.authType).toBe(authType);
    }
  });

  it("parses manifest with all risk levels", () => {
    for (const riskLevel of Object.values(ADAPTER_RISK_LEVELS)) {
      const manifest = parseAdapterManifest({ ...validManifestInput(), riskLevel });
      expect(manifest.riskLevel).toBe(riskLevel);
    }
  });

  it("parses manifest with empty egress rules (no network access)", () => {
    const manifest = parseAdapterManifest({
      ...validManifestInput(),
      egressRules: [],
      requiredPermissions: [],
    });
    expect(manifest.egressRules).toHaveLength(0);
  });

  it("parses optional metadata", () => {
    const manifest = parseAdapterManifest({
      ...validManifestInput(),
      metadata: { owner: "team-ai", env: "prod" },
    });
    expect(manifest.metadata).toEqual({ env: "prod", owner: "team-ai" });
  });

  it("accepts additive connectionMethods manifest field", () => {
    const manifest = parseAdapterManifest({
      ...validManifestInput(),
      connectionMethods: [{ id: "anthropic.api_key", authFlow: "api-key" }],
    });
    expect(manifest.connectionMethods).toEqual([
      { id: "anthropic.api_key", authFlow: "api-key" },
    ]);
  });

  it("rejects connectionMethods entries with missing required fields", () => {
    expect(() =>
      parseAdapterManifest({
        ...validManifestInput(),
        connectionMethods: [{ id: "anthropic.api_key" }],
      }),
    ).toThrow(ManifestValidationError);
  });

  it("rejects duplicate connectionMethods ids", () => {
    try {
      parseAdapterManifest({
        ...validManifestInput(),
        connectionMethods: [
          { id: "anthropic.api_key", authFlow: "api-key" },
          { id: "anthropic.api_key", authFlow: "oauth2-device" },
        ],
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expectManifestError(error, RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD, "connectionMethods");
      if (error instanceof ManifestValidationError) {
        expect(error.details).toMatchObject({
          index: 1,
          id: "anthropic.api_key",
          firstIndex: 0,
        });
      }
    }
  });

  it("rejects non-object input", () => {
    expect(() => parseAdapterManifest("not an object")).toThrow(ManifestValidationError);
    expect(() => parseAdapterManifest(null)).toThrow(ManifestValidationError);
    expect(() => parseAdapterManifest(42)).toThrow(ManifestValidationError);
    expect(() => parseAdapterManifest([])).toThrow(ManifestValidationError);
  });

  it("rejects wrong schemaVersion", () => {
    try {
      parseAdapterManifest({ ...validManifestInput(), schemaVersion: "9.9.9" });
      expect.fail("Should have thrown");
    } catch (error) {
      expectManifestError(error, RUNTIME_ERROR_CODES.MANIFEST_UNSUPPORTED_SCHEMA_VERSION, "schemaVersion");
    }
  });

  it("rejects missing required fields", () => {
    const requiredFields: (keyof ReturnType<typeof validManifestInput>)[] = [
      "providerId",
      "version",
      "displayName",
      "authType",
      "capabilities",
      "requiredPermissions",
      "egressRules",
      "riskLevel",
      "signingKeyId",
    ];
    for (const field of requiredFields) {
      const input = { ...validManifestInput() };
      delete (input as Record<string, unknown>)[field];
      expect(() => parseAdapterManifest(input), `should reject missing "${field}"`).toThrow(
        ManifestValidationError,
      );
    }
  });

  it("rejects empty string for required string fields", () => {
    for (const field of ["providerId", "version", "displayName", "signingKeyId"]) {
      expect(() =>
        parseAdapterManifest({ ...validManifestInput(), [field]: "  " }),
      ).toThrow(ManifestValidationError);
    }
  });

  it("rejects invalid authType", () => {
    try {
      parseAdapterManifest({ ...validManifestInput(), authType: "kerberos" });
      expect.fail("Should have thrown");
    } catch (error) {
      expectManifestError(error, RUNTIME_ERROR_CODES.MANIFEST_UNSUPPORTED_AUTH_TYPE, "authType");
    }
  });

  it("rejects unsupported capabilities", () => {
    try {
      parseAdapterManifest({ ...validManifestInput(), capabilities: ["chat.completions", "some.unknown"] });
      expect.fail("Should have thrown");
    } catch (error) {
      expectManifestError(error, RUNTIME_ERROR_CODES.MANIFEST_UNSUPPORTED_CAPABILITY);
    }
  });

  it("rejects empty capabilities array", () => {
    expect(() => parseAdapterManifest({ ...validManifestInput(), capabilities: [] })).toThrow(
      ManifestValidationError,
    );
  });

  it("rejects non-array capabilities", () => {
    expect(() =>
      parseAdapterManifest({ ...validManifestInput(), capabilities: "chat.completions" }),
    ).toThrow(ManifestValidationError);
  });

  it("rejects invalid riskLevel", () => {
    try {
      parseAdapterManifest({ ...validManifestInput(), riskLevel: "extreme" });
      expect.fail("Should have thrown");
    } catch (error) {
      expectManifestError(error, RUNTIME_ERROR_CODES.MANIFEST_UNSUPPORTED_RISK_LEVEL, "riskLevel");
    }
  });

  it("rejects invalid egress rule host", () => {
    expect(() =>
      parseAdapterManifest({
        ...validManifestInput(),
        egressRules: [{ host: "not a valid hostname!!", protocol: "https" }],
      }),
    ).toThrow(ManifestValidationError);
  });

  it("rejects invalid egress rule protocol", () => {
    expect(() =>
      parseAdapterManifest({
        ...validManifestInput(),
        egressRules: [{ host: "api.example.com", protocol: "ftp" }],
      }),
    ).toThrow(ManifestValidationError);
  });

  it("rejects out-of-range egress port", () => {
    expect(() =>
      parseAdapterManifest({
        ...validManifestInput(),
        egressRules: [{ host: "api.example.com", protocol: "https", port: 99999 }],
      }),
    ).toThrow(ManifestValidationError);
  });

  it("rejects invalid egress rule non-object entry", () => {
    expect(() =>
      parseAdapterManifest({
        ...validManifestInput(),
        egressRules: ["api.example.com"],
      }),
    ).toThrow(ManifestValidationError);
  });

  it("rejects duplicate capabilities", () => {
    try {
      parseAdapterManifest({
        ...validManifestInput(),
        capabilities: ["chat.stream", "provider.list", "chat.stream"],
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expectManifestError(error, RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD, "capabilities");
      if (error instanceof ManifestValidationError) {
        expect(error.details).toMatchObject({
          index: 2,
          value: "chat.stream",
          firstIndex: 0,
        });
      }
    }
  });

  it("rejects duplicate requiredPermissions", () => {
    try {
      parseAdapterManifest({
        ...validManifestInput(),
        requiredPermissions: ["network.egress", "network.egress"],
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expectManifestError(error, RUNTIME_ERROR_CODES.MANIFEST_INVALID_FIELD, "requiredPermissions");
      if (error instanceof ManifestValidationError) {
        expect(error.details).toMatchObject({
          index: 1,
          value: "network.egress",
          firstIndex: 0,
        });
      }
    }
  });

  it("allows wildcard egress host", () => {
    const manifest = parseAdapterManifest({
      ...validManifestInput(),
      egressRules: [{ host: "*", protocol: "https" }],
    });
    expect(manifest.egressRules[0]?.host).toBe("*");
  });
});

describe("safeParseAdapterManifest", () => {
  it("returns success for valid input", () => {
    const result = safeParseAdapterManifest(validManifestInput());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.providerId).toBe("ollama");
    }
  });

  it("returns failure for invalid input without throwing", () => {
    const result = safeParseAdapterManifest({ schemaVersion: MANIFEST_SCHEMA_VERSION });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ManifestValidationError);
    }
  });

  it("returns failure with error code for wrong auth type", () => {
    const result = safeParseAdapterManifest({ ...validManifestInput(), authType: "bad" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(RUNTIME_ERROR_CODES.MANIFEST_UNSUPPORTED_AUTH_TYPE);
    }
  });
});

describe("isAdapterManifest", () => {
  it("returns true for valid manifest", () => {
    expect(isAdapterManifest(validManifestInput())).toBe(true);
  });

  it("returns false for invalid input", () => {
    expect(isAdapterManifest(null)).toBe(false);
    expect(isAdapterManifest({ schemaVersion: MANIFEST_SCHEMA_VERSION })).toBe(false);
    expect(isAdapterManifest({ ...validManifestInput(), authType: "bad" })).toBe(false);
  });
});
