import { describe, expect, it } from "vitest";

import {
  loadAdapter,
  parseAdapterManifest,
  MANIFEST_SCHEMA_VERSION,
  isCloudAdapterContractV2,
  parseConnectionMethodDescriptor,
  parseConnectionMethods,
  type AdapterManifest,
} from "../index.js";

function validManifestInput(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    providerId: "provider.claude",
    version: "1.0.0",
    displayName: "Anthropic",
    authType: "api_key",
    capabilities: ["chat.completions"],
    requiredPermissions: ["network.egress"],
    egressRules: [{ host: "api.anthropic.com", protocol: "https" }],
    riskLevel: "medium",
    signingKeyId: "key.adapter.primary",
    ...overrides,
  };
}

function makeAdapterContract(manifest: AdapterManifest): Record<string, unknown> {
  return {
    manifest,
    describeCapabilities: () => manifest.capabilities,
    listModels: async () => ["claude-sonnet-4.5"],
    createSession: async () => "session-1",
    sendMessage: async () => "ok",
    streamMessage: async (_sid: string, _message: string, onChunk: (chunk: string) => void) => {
      onChunk("ok");
    },
    healthCheck: async () => true,
    shutdown: async () => undefined,
  };
}

function makeCloudAdapterContractV2(manifest: AdapterManifest): Record<string, unknown> {
  return {
    ...makeAdapterContract(manifest),
    listConnectionMethods: () => [{ id: "anthropic.api_key", authFlow: "api-key" }],
    beginConnect: async () => ({ phase: "pending" }),
    completeConnect: async () => ({ status: "connected" }),
    validateCredentialRef: async () => ({ ok: true }),
    revokeCredentialRef: async () => undefined,
    discoverModels: async () => [{ id: "claude-sonnet-4.5" }],
    discoverCapabilities: async () => ({ capabilities: ["chat.completions"] }),
  };
}

describe("connection method parser helpers", () => {
  it("parses a connection method descriptor", () => {
    expect(
      parseConnectionMethodDescriptor({
        id: "  anthropic.api_key ",
        authFlow: " api-key ",
      }),
    ).toEqual({
      id: "anthropic.api_key",
      authFlow: "api-key",
    });
  });

  it("rejects descriptor missing authFlow", () => {
    expect(() => parseConnectionMethodDescriptor({ id: "anthropic.api_key" })).toThrow();
  });

  it("parses a list of connection methods", () => {
    expect(
      parseConnectionMethods([
        { id: "anthropic.api_key", authFlow: "api-key" },
        { id: "anthropic.oauth_subscription", authFlow: "oauth2-device" },
      ]),
    ).toEqual([
      { id: "anthropic.api_key", authFlow: "api-key" },
      { id: "anthropic.oauth_subscription", authFlow: "oauth2-device" },
    ]);
  });

  it("rejects duplicate connection method ids", () => {
    expect(() =>
      parseConnectionMethods([
        { id: "anthropic.api_key", authFlow: "api-key" },
        { id: "anthropic.api_key", authFlow: "oauth2-device" },
      ]),
    ).toThrow();
  });
});

describe("isCloudAdapterContractV2", () => {
  it("returns true when all required v2 methods exist", () => {
    const manifest = parseAdapterManifest(validManifestInput());
    const candidate = makeCloudAdapterContractV2(manifest);
    expect(isCloudAdapterContractV2(candidate)).toBe(true);
    expect(typeof candidate.discoverModels).toBe("function");
    expect(typeof candidate.discoverCapabilities).toBe("function");
  });

  it("returns false when discovery hooks are missing", () => {
    const manifest = parseAdapterManifest(validManifestInput());
    const candidate = {
      ...makeCloudAdapterContractV2(manifest),
      discoverModels: undefined,
    };
    expect(isCloudAdapterContractV2(candidate)).toBe(false);
  });
});

describe("loadAdapter cloud contract detection", () => {
  it("keeps backward compatibility for legacy contracts", async () => {
    const loaded = await loadAdapter(
      validManifestInput(),
      () => {
        const manifest = parseAdapterManifest(validManifestInput());
        return makeAdapterContract(manifest);
      },
      { requireSignatureVerification: false },
    );

    expect(loaded.providerId).toBe("provider.claude");
  });

  it("rejects adapters that declare connectionMethods without cloud contract v2 hooks", async () => {
    await expect(
      loadAdapter(
        validManifestInput({
          connectionMethods: [{ id: "anthropic.api_key", authFlow: "api-key" }],
        }),
        () => {
          const manifest = parseAdapterManifest(validManifestInput());
          return makeAdapterContract(manifest);
        },
        { requireSignatureVerification: false },
      ),
    ).rejects.toThrow();
  });

  it("does not enforce cloud contract v2 hooks when connectionMethods is explicitly empty", async () => {
    const loaded = await loadAdapter(
      validManifestInput({
        connectionMethods: [],
      }),
      () => {
        const manifest = parseAdapterManifest(validManifestInput());
        return makeAdapterContract(manifest);
      },
      { requireSignatureVerification: false },
    );

    expect(loaded.providerId).toBe("provider.claude");
    expect(loaded.manifest.connectionMethods).toEqual([]);
  });

  it("accepts cloud contract v2 adapters when connectionMethods are declared", async () => {
    const manifest = parseAdapterManifest(
      validManifestInput({
        connectionMethods: [{ id: "anthropic.api_key", authFlow: "api-key" }],
      }),
    );

    const loaded = await loadAdapter(
      validManifestInput({
        connectionMethods: [{ id: "anthropic.api_key", authFlow: "api-key" }],
      }),
      () => makeCloudAdapterContractV2(manifest),
      { requireSignatureVerification: false },
    );

    expect(isCloudAdapterContractV2(loaded.contract)).toBe(true);
  });

  it("rejects declared connectionMethods when contract listConnectionMethods output is invalid", async () => {
    await expect(
      loadAdapter(
        validManifestInput({
          connectionMethods: [{ id: "anthropic.api_key", authFlow: "api-key" }],
        }),
        () => {
          const manifest = parseAdapterManifest(
            validManifestInput({
              connectionMethods: [{ id: "anthropic.api_key", authFlow: "api-key" }],
            }),
          );
          return {
            ...makeCloudAdapterContractV2(manifest),
            listConnectionMethods: () => [{ id: "anthropic.api_key" }],
          };
        },
        { requireSignatureVerification: false },
      ),
    ).rejects.toThrow(/listConnectionMethods/i);
  });

  it("rejects declared connectionMethods when contract and manifest descriptors diverge", async () => {
    await expect(
      loadAdapter(
        validManifestInput({
          connectionMethods: [{ id: "anthropic.api_key", authFlow: "api-key" }],
        }),
        () => {
          const manifest = parseAdapterManifest(
            validManifestInput({
              connectionMethods: [{ id: "anthropic.api_key", authFlow: "api-key" }],
            }),
          );
          return {
            ...makeCloudAdapterContractV2(manifest),
            listConnectionMethods: () => [{ id: "anthropic.oauth_subscription", authFlow: "oauth2-device" }],
          };
        },
        { requireSignatureVerification: false },
      ),
    ).rejects.toThrow(/connectionMethods/i);
  });
});
