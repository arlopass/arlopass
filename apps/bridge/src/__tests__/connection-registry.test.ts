import { describe, expect, it } from "vitest";

import {
  ConnectionRegistry,
  ConnectionRegistryError,
} from "../cloud/connection-registry.js";

const SIGNATURE_KEY = Buffer.from("test-connection-registry-signature-key", "utf8");
const UUID_V4_1 = "00000000-0000-4000-8000-000000000001";
const UUID_V4_2 = "00000000-0000-4000-8000-000000000002";

const BINDING_CONTEXT = {
  extensionId: "ext-1",
  origin: "https://app.example.com",
  policyVersion: "pol.v2",
  endpointProfileHash: "sha256:endpoint-profile",
} as const;

function makeRegistry(uuidSequence: readonly string[]): ConnectionRegistry {
  const queue = [...uuidSequence];
  return new ConnectionRegistry({
    signatureKey: SIGNATURE_KEY,
    generateUuid: () => queue.shift() ?? UUID_V4_2,
  });
}

describe("ConnectionRegistry.register/resolve/revoke", () => {
  it("issues canonical connection handles and resolves when binding context matches", async () => {
    const registry = makeRegistry([UUID_V4_1]);

    const created = await registry.register({
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      credentialRef: "cred.ref.001",
      ...BINDING_CONTEXT,
    });

    const prefix = `connh.provider.claude.anthropic.api_key.${UUID_V4_1}.0.`;
    expect(created.connectionHandle.startsWith(prefix)).toBe(true);
    expect(created.connectionHandle.slice(prefix.length)).toMatch(/^[A-Za-z0-9_-]+$/);

    const resolved = await registry.resolve(created.connectionHandle, BINDING_CONTEXT);
    expect(resolved).toMatchObject({
      connectionHandle: created.connectionHandle,
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      credentialRef: "cred.ref.001",
      epoch: 0,
      ...BINDING_CONTEXT,
    });
  });

  it("rejects resolve when extension/origin/policy/endpoint binding mismatches", async () => {
    const registry = makeRegistry([UUID_V4_1]);
    const created = await registry.register({
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      credentialRef: "cred.ref.001",
      ...BINDING_CONTEXT,
    });

    await expect(
      registry.resolve(created.connectionHandle, {
        ...BINDING_CONTEXT,
        extensionId: "ext-2",
      }),
    ).rejects.toThrow(/binding mismatch/i);

    await expect(
      registry.resolve(created.connectionHandle, {
        ...BINDING_CONTEXT,
        origin: "https://other.example.com",
      }),
    ).rejects.toThrow(/binding mismatch/i);

    await expect(
      registry.resolve(created.connectionHandle, {
        ...BINDING_CONTEXT,
        policyVersion: "pol.v3",
      }),
    ).rejects.toThrow(/binding mismatch/i);

    await expect(
      registry.resolve(created.connectionHandle, {
        ...BINDING_CONTEXT,
        endpointProfileHash: "sha256:other-endpoint",
      }),
    ).rejects.toThrow(/binding mismatch/i);
  });

  it("allows extension-origin handles to resolve for web origins within same extension binding", async () => {
    const registry = makeRegistry([UUID_V4_1]);
    const extensionScopedBinding = {
      ...BINDING_CONTEXT,
      origin: "chrome-extension://ext-1",
    } as const;
    const created = await registry.register({
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      credentialRef: "cred.ref.001",
      ...extensionScopedBinding,
    });

    const resolved = await registry.resolve(created.connectionHandle, {
      ...BINDING_CONTEXT,
      origin: "http://localhost:4173",
    });
    expect(resolved.connectionHandle).toBe(created.connectionHandle);
    expect(resolved.origin).toBe("chrome-extension://ext-1");
  });

  it("bumps epoch on revoke and rejects stale handle resolution with revoked/stale error", async () => {
    const registry = makeRegistry([UUID_V4_1, UUID_V4_2]);
    const first = await registry.register({
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      credentialRef: "cred.ref.001",
      ...BINDING_CONTEXT,
    });

    await registry.revoke(first.connectionHandle);

    const staleError = await registry
      .resolve(first.connectionHandle, BINDING_CONTEXT)
      .catch((error: unknown) => error);
    expect(staleError).toBeInstanceOf(ConnectionRegistryError);
    expect((staleError as ConnectionRegistryError).reasonCode).toBe("auth.expired");
    expect((staleError as Error).message).toMatch(/revoked|stale/i);

    const second = await registry.register({
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      credentialRef: "cred.ref.001",
      ...BINDING_CONTEXT,
    });
    expect(second.connectionHandle).toContain(`.${UUID_V4_2}.1.`);

    const resolved = await registry.resolve(second.connectionHandle, BINDING_CONTEXT);
    expect(resolved.epoch).toBe(1);
  });
});

