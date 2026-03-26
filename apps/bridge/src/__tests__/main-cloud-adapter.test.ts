import { describe, expect, it, vi } from "vitest";

import { buildCloudControlPlaneAdapter } from "../main.js";

describe("buildCloudControlPlaneAdapter", () => {
  it("executes chat when method state is absent in a fresh process instance", async () => {
    const contract = {
      manifest: { providerId: "claude-subscription" },
      beginConnect: vi.fn(async () => ({})),
      completeConnect: vi.fn(async () => ({
        credentialRef: "credref.claude-subscription.anthropic.api_key.123",
        endpointProfile: { baseUrl: "https://api.anthropic.com" },
      })),
      validateCredentialRef: vi.fn(async () => ({
        ok: false,
        retryable: false,
        reason: "credential_ref_not_found",
      })),
      revokeCredentialRef: vi.fn(async () => {}),
      discoverModels: vi.fn(async () => []),
      discoverCapabilities: vi.fn(async () => ({ capabilities: [] })),
      createSession: vi.fn(async () => "session-1"),
      sendMessage: vi.fn(async () => "ok"),
    };

    const initialAdapter = buildCloudControlPlaneAdapter(contract);
    await initialAdapter.completeConnection({
      providerId: "claude-subscription",
      methodId: "anthropic.api_key",
      input: { apiKey: "sk-test" },
    });

    const freshProcessAdapter = buildCloudControlPlaneAdapter(contract);
    const result = await freshProcessAdapter.executeChat({
      providerId: "claude-subscription",
      methodId: "anthropic.api_key",
      modelId: "claude-sonnet-4-5",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result).toEqual({ content: "ok" });
    expect(contract.createSession).toHaveBeenCalled();
    expect(contract.sendMessage).toHaveBeenCalled();
  });

  it("forwards stateless connection input into session creation", async () => {
    const contract = {
      manifest: { providerId: "claude-subscription" },
      beginConnect: vi.fn(async () => ({})),
      completeConnect: vi.fn(async () => ({
        credentialRef: "credref.claude-subscription.anthropic.api_key.123",
        endpointProfile: { baseUrl: "https://api.anthropic.com" },
      })),
      validateCredentialRef: vi.fn(async () => ({
        ok: false,
        retryable: false,
        reason: "credential_ref_not_found",
      })),
      revokeCredentialRef: vi.fn(async () => {}),
      discoverModels: vi.fn(async () => []),
      discoverCapabilities: vi.fn(async () => ({ capabilities: [] })),
      createSession: vi.fn(async () => "session-1"),
      sendMessage: vi.fn(async () => "ok"),
    };

    const adapter = buildCloudControlPlaneAdapter(contract);
    await adapter.executeChat({
      providerId: "claude-subscription",
      methodId: "anthropic.api_key",
      modelId: "claude-sonnet-4-5",
      messages: [{ role: "user", content: "hello" }],
      connectionInput: {
        apiKey: "sk-live",
        endpointProfile: { baseUrl: "https://api.anthropic.com" },
      },
    });

    expect(contract.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-5",
        methodId: "anthropic.api_key",
        connectionInput: expect.objectContaining({
          apiKey: "sk-live",
        }),
      }),
    );
  });

  it("discovers models with credentialRef when method state is absent in a fresh process instance", async () => {
    const contract = {
      manifest: { providerId: "claude-subscription" },
      beginConnect: vi.fn(async () => ({})),
      completeConnect: vi.fn(async () => ({
        credentialRef: "credref.claude-subscription.anthropic.api_key.123",
        endpointProfile: { baseUrl: "https://api.anthropic.com" },
      })),
      validateCredentialRef: vi.fn(async () => ({
        ok: true,
      })),
      revokeCredentialRef: vi.fn(async () => {}),
      discoverModels: vi.fn(async () => [{ id: "claude-sonnet-4-5" }]),
      discoverCapabilities: vi.fn(async () => ({ capabilities: ["chat.completions"] })),
      createSession: vi.fn(async () => "session-1"),
      sendMessage: vi.fn(async () => "ok"),
    };

    const initialAdapter = buildCloudControlPlaneAdapter(contract);
    await initialAdapter.completeConnection({
      providerId: "claude-subscription",
      methodId: "anthropic.api_key",
      input: { apiKey: "sk-test" },
    });

    const freshProcessAdapter = buildCloudControlPlaneAdapter(contract);
    const discovered = await freshProcessAdapter.discover({
      providerId: "claude-subscription",
      methodId: "anthropic.api_key",
      credentialRef: "credref.claude-subscription.anthropic.api_key.123",
      endpointProfile: { baseUrl: "https://api.anthropic.com" },
    });

    expect(discovered.models).toEqual([{ id: "claude-sonnet-4-5" }]);
    expect(contract.discoverModels).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "claude-subscription",
        methodId: "anthropic.api_key",
        credentialRef: "credref.claude-subscription.anthropic.api_key.123",
      }),
    );
  });

  it("forwards stateless connection input into discoverModels when runtime state is cold", async () => {
    const contract = {
      manifest: { providerId: "claude-subscription" },
      beginConnect: vi.fn(async () => ({})),
      completeConnect: vi.fn(async () => ({
        credentialRef: "credref.claude-subscription.anthropic.api_key.123",
        endpointProfile: { baseUrl: "https://api.anthropic.com" },
      })),
      validateCredentialRef: vi.fn(async () => ({
        ok: false,
        retryable: false,
        reason: "credential_ref_not_found",
      })),
      revokeCredentialRef: vi.fn(async () => {}),
      discoverModels: vi.fn(async () => [{ id: "claude-sonnet-4-5" }]),
      discoverCapabilities: vi.fn(async () => ({ capabilities: ["chat.completions"] })),
      createSession: vi.fn(async () => "session-1"),
      sendMessage: vi.fn(async () => "ok"),
    };

    const adapter = buildCloudControlPlaneAdapter(contract);
    const discovered = await adapter.discover({
      providerId: "claude-subscription",
      methodId: "anthropic.api_key",
      credentialRef: "credref.claude-subscription.anthropic.api_key.123",
      endpointProfile: { baseUrl: "https://api.anthropic.com" },
      connectionInput: {
        apiKey: "sk-live",
        endpointProfile: { baseUrl: "https://api.anthropic.com" },
      },
      correlationId: "corr-stateless-discover",
    });

    expect(discovered.models).toEqual([{ id: "claude-sonnet-4-5" }]);
    expect(contract.discoverModels).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionInput: expect.objectContaining({
          apiKey: "sk-live",
        }),
      }),
    );
  });
});
