import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProtocolCapability } from "@arlopass/protocol";
import type { CanonicalEnvelope } from "@arlopass/protocol";

import {
  createTransportMessageHandler,
  registerDefaultTransportStreamPortListener,
  registerDefaultTransportMessageListener,
  type WalletStorageAdapter,
} from "../transport/runtime.js";
import { clearBridgeHandshakeSessionCache } from "../transport/bridge-handshake.js";
import {
  BRIDGE_PAIRING_STATE_STORAGE_KEY,
  wrapPairingKeyMaterial,
} from "../transport/bridge-pairing.js";

const WALLET_KEY_PROVIDERS = "arlopass.wallet.providers.v1";
const WALLET_KEY_ACTIVE = "arlopass.wallet.activeProvider.v1";
const TRANSPORT_MESSAGE_LISTENER_FLAG = "__arlopass.transport.listener.registered.v1";
const TRANSPORT_STREAM_PORT_LISTENER_FLAG =
  "__arlopass.transport.stream-port.listener.registered.v1";

function makeStorageAdapter(
  seed: Record<string, unknown>,
): WalletStorageAdapter & { snapshot: () => Record<string, unknown> } {
  const state: Record<string, unknown> = { ...seed };

  return {
    async get(keys): Promise<Record<string, unknown>> {
      return Object.fromEntries(keys.map((key) => [key, state[key]]));
    },
    async set(items): Promise<void> {
      Object.assign(state, items);
    },
    snapshot(): Record<string, unknown> {
      return { ...state };
    },
  };
}

function makeEnvelope(
  capability: ProtocolCapability,
  payload: unknown,
  providerId = "provider.ollama",
  modelId = "llama3.2",
): CanonicalEnvelope<unknown> {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 60_000);

  return {
    protocolVersion: "1.0.0",
    requestId: "req.test.001",
    correlationId: "corr.test.001",
    origin: "https://app.example.com",
    sessionId: "sess.test.001",
    capability,
    providerId,
    modelId,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    nonce: "AAAAAAAAAAAAAAAAAAAAAA",
    payload,
  };
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 1_000,
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for condition.");
    }
    await Promise.resolve();
    await Promise.resolve();
  }
}

describe("createTransportMessageHandler", () => {
  beforeEach(() => {
    clearBridgeHandshakeSessionCache();
  });

  afterEach(() => {
    clearBridgeHandshakeSessionCache();
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>)[TRANSPORT_MESSAGE_LISTENER_FLAG];
    delete (globalThis as Record<string, unknown>)[TRANSPORT_STREAM_PORT_LISTENER_FLAG];
  });

  it("returns null for unrelated channels", async () => {
    const storage = makeStorageAdapter({});
    const handler = createTransportMessageHandler({ storage });

    const result = await handler({
      channel: "arlopass.wallet",
      action: "wallet.openConnectFlow",
    });

    expect(result).toBeNull();
  });

  it("returns provider.list results from wallet storage", async () => {
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.ollama",
          name: "Ollama Local",
          type: "local",
          status: "connected",
          models: [{ id: "llama3.2", name: "Llama 3.2" }],
        },
        {
          id: "provider.offline",
          name: "Offline",
          type: "local",
          status: "disconnected",
          models: [{ id: "mistral", name: "Mistral" }],
        },
        {
          id: "provider.cloud-validation-only",
          name: "Cloud Validation Only",
          type: "cloud",
          status: "attention",
          models: [{ id: "claude-opus-4-6", name: "Claude Opus 4.6" }],
        },
      ],
    });

    const handler = createTransportMessageHandler({ storage });
    const result = await handler({
      channel: "arlopass.transport",
      action: "request",
      request: {
        envelope: makeEnvelope("provider.list", {}),
      },
    });

    expect(result).not.toBeNull();
    expect(result?.ok).toBe(true);
    if (result?.ok !== true) {
      return;
    }
    const payload = result.envelope?.payload as {
      providers: Array<{ providerId: string }>;
    };
    expect(payload.providers).toHaveLength(1);
    expect(payload.providers[0]?.providerId).toBe("provider.ollama");
  });

  it("rejects session.create for cloud validation-only providers", async () => {
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.cloud-validation-only",
          name: "Cloud Validation Only",
          type: "cloud",
          status: "attention",
          models: [{ id: "claude-opus-4-6", name: "Claude Opus 4.6" }],
        },
      ],
      [WALLET_KEY_ACTIVE]: null,
    });

    const handler = createTransportMessageHandler({ storage });
    const result = await handler({
      channel: "arlopass.transport",
      action: "request",
      request: {
        envelope: makeEnvelope("session.create", {
          providerId: "provider.cloud-validation-only",
          modelId: "claude-opus-4-6",
        }),
      },
    });

    expect(result?.ok).toBe(false);
    if (result?.ok !== false) {
      return;
    }
    expect(result.error.reasonCode).toBe("provider.unavailable");
    expect(result.error.message).toContain("validation-only mode");
  });

  it("handles session.create provider selection and persists active provider", async () => {
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.ollama",
          name: "Ollama Local",
          type: "local",
          status: "connected",
          models: [{ id: "llama3.2", name: "Llama 3.2" }],
        },
      ],
      [WALLET_KEY_ACTIVE]: null,
    });

    const handler = createTransportMessageHandler({ storage });
    const result = await handler({
      channel: "arlopass.transport",
      action: "request",
      request: {
        envelope: makeEnvelope("session.create", {
          providerId: "provider.ollama",
          modelId: "llama3.2",
        }),
      },
    });

    expect(result?.ok).toBe(true);
    if (result?.ok !== true) {
      return;
    }

    const payload = result.envelope?.payload as {
      providerId: string;
      modelId: string;
    };
    expect(payload.providerId).toBe("provider.ollama");
    expect(payload.modelId).toBe("llama3.2");

    const snapshot = storage.snapshot();
    expect(snapshot[WALLET_KEY_ACTIVE]).toEqual({
      providerId: "provider.ollama",
      modelId: "llama3.2",
    });
  });

  it("routes local chat.completions through Ollama metadata endpoint", async () => {
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.ollama",
          name: "Ollama Local",
          type: "local",
          status: "connected",
          models: [{ id: "llama3.2", name: "Llama 3.2" }],
          metadata: { baseUrl: "http://localhost:11434" },
        },
      ],
    });

    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          message: { role: "assistant", content: "Hello from Ollama" },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    const handler = createTransportMessageHandler({
      storage,
      dependencies: { fetchImpl },
    });

    const result = await handler({
      channel: "arlopass.transport",
      action: "request",
      request: {
        envelope: makeEnvelope("chat.completions", {
          messages: [{ role: "user", content: "hello" }],
        }),
      },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result?.ok).toBe(true);
    if (result?.ok !== true) {
      return;
    }
    const payload = result.envelope?.payload as {
      message: { role: string; content: string };
    };
    expect(payload.message.role).toBe("assistant");
    expect(payload.message.content).toBe("Hello from Ollama");
  });

  it("falls back from localhost to 127.0.0.1 for Ollama chat connectivity", async () => {
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.ollama",
          name: "Ollama Local",
          type: "local",
          status: "connected",
          models: [{ id: "llama3.2", name: "Llama 3.2" }],
          metadata: { baseUrl: "http://localhost:11434" },
        },
      ],
    });

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const endpoint = String(input);
      if (endpoint.includes("localhost")) {
        throw new TypeError("Failed to fetch");
      }

      return new Response(
        JSON.stringify({
          message: { role: "assistant", content: "Fallback host worked" },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    const handler = createTransportMessageHandler({
      storage,
      dependencies: { fetchImpl },
    });

    const result = await handler({
      channel: "arlopass.transport",
      action: "request",
      request: {
        envelope: makeEnvelope("chat.completions", {
          messages: [{ role: "user", content: "hello" }],
        }),
      },
    });

    expect(result?.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const calledEndpoints = fetchImpl.mock.calls.map((call) => String(call[0]));
    expect(calledEndpoints[0]).toContain("http://localhost:11434/api/chat");
    expect(calledEndpoints[1]).toContain("http://127.0.0.1:11434/api/chat");
  });

  it("routes cloud chat completion through native cloud.chat.execute", async () => {
    const storedProviderId = "provider.arlopass-cloud-anthropic.test-1";
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: storedProviderId,
          name: "Claude Subscription",
          type: "cloud",
          status: "connected",
          models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }],
          metadata: {
            nativeHostName: "com.arlopass.bridge.cloud-test-1",
            providerId: "claude-subscription",
            methodId: "anthropic.api_key",
            connectionHandle:
              "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
            tenantId: "tenant-cloud-1",
            region: "us-east-1",
            policyVersion: "policy.2026.03.24",
            endpointProfileHash: "sha256:endpoint-profile-cloud-test-1",
          },
        },
      ],
    });

    const sendNativeMessage = vi.fn(
      async (_hostName: string, message: Record<string, unknown>) => {
        if (message["type"] === "handshake.challenge") {
          return {
            type: "handshake.challenge",
            nonce: "11".repeat(32),
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          };
        }
        if (message["type"] === "handshake.verify") {
          return {
            type: "handshake.session",
            sessionToken: "22".repeat(32),
            extensionId: "ext.runtime.transport",
            establishedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          };
        }
        if (message["type"] === "cloud.chat.execute") {
          return {
            type: "cloud.chat.result",
            correlationId: "corr.test.001",
            providerId: "claude-subscription",
            methodId: "anthropic.api_key",
            modelId: "claude-sonnet-4-5",
            region: "us-east-1",
            content: "Cloud bridge output",
          };
        }
        throw new Error(`Unexpected native message type: ${String(message["type"])}`);
      },
    );

    const handler = createTransportMessageHandler({
      storage,
      dependencies: {
        sendNativeMessage,
        extensionId: "ext.runtime.transport",
        resolveBridgeSharedSecret: async () => "ab".repeat(32),
      },
    });
    const result = await handler({
      channel: "arlopass.transport",
      action: "request",
      request: {
        envelope: makeEnvelope(
          "chat.completions",
          { messages: [{ role: "user", content: "hello" }] },
          storedProviderId,
          "claude-sonnet-4-5",
        ),
      },
    });

    expect(sendNativeMessage).toHaveBeenCalled();
    const executeCall = sendNativeMessage.mock.calls.find(
      (call) => call[1]?.["type"] === "cloud.chat.execute",
    );
    const executeMessage = executeCall?.[1] as Record<string, unknown> | undefined;
    expect(executeMessage).toBeDefined();
    expect(executeMessage?.["providerId"]).toBe("claude-subscription");
    expect(executeMessage?.["extensionId"]).toBe("ext.runtime.transport");
    expect(executeMessage?.["origin"]).toBe("https://app.example.com");
    expect(executeMessage?.["policyVersion"]).toBe("policy.2026.03.24");
    expect(executeMessage?.["endpointProfileHash"]).toBe(
      "sha256:endpoint-profile-cloud-test-1",
    );
    expect(executeMessage?.["handshakeSessionToken"]).toBe("22".repeat(32));
    expect(executeMessage?.["timeoutMs"]).toBe(90_000);
    const requestProof = executeMessage?.["requestProof"] as Record<string, unknown> | undefined;
    expect(requestProof?.["requestId"]).toBe("req.test.001");
    expect(requestProof?.["nonce"]).toBe("AAAAAAAAAAAAAAAAAAAAAA");
    expect(requestProof?.["origin"]).toBe("https://app.example.com");
    expect(requestProof?.["connectionHandle"]).toBe(
      "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
    );
    expect(typeof requestProof?.["payloadHash"]).toBe("string");
    expect(String(requestProof?.["payloadHash"] ?? "")).toContain("sha256:");
    expect(typeof requestProof?.["proof"]).toBe("string");
    expect(result?.ok).toBe(true);
    if (result?.ok !== true) {
      return;
    }
    const payload = result.envelope?.payload as {
      message: { role: string; content: string };
    };
    expect(payload.message.role).toBe("assistant");
    expect(payload.message.content).toBe("Cloud bridge output");
  });

  it("forwards request timeout budget to cloud.chat.execute", async () => {
    const storedProviderId = "provider.arlopass-cloud-anthropic.timeout";
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: storedProviderId,
          name: "Claude Subscription",
          type: "cloud",
          status: "connected",
          models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }],
          metadata: {
            nativeHostName: "com.arlopass.bridge.cloud-timeout",
            providerId: "claude-subscription",
            methodId: "anthropic.api_key",
            connectionHandle:
              "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
            tenantId: "tenant-cloud-timeout",
            region: "us-east-1",
            policyVersion: "policy.2026.03.24",
            endpointProfileHash: "sha256:endpoint-profile-cloud-timeout",
          },
        },
      ],
    });

    const sendNativeMessage = vi.fn(
      async (_hostName: string, message: Record<string, unknown>) => {
        if (message["type"] === "handshake.challenge") {
          return {
            type: "handshake.challenge",
            nonce: "13".repeat(32),
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          };
        }
        if (message["type"] === "handshake.verify") {
          return {
            type: "handshake.session",
            sessionToken: "23".repeat(32),
            extensionId: "ext.runtime.transport",
            establishedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          };
        }
        if (message["type"] === "cloud.chat.execute") {
          return {
            type: "cloud.chat.result",
            correlationId: "corr.test.001",
            providerId: "claude-subscription",
            methodId: "anthropic.api_key",
            modelId: "claude-sonnet-4-5",
            region: "us-east-1",
            content: "Cloud bridge output",
          };
        }
        throw new Error(`Unexpected native message type: ${String(message["type"])}`);
      },
    );

    const handler = createTransportMessageHandler({
      storage,
      dependencies: {
        sendNativeMessage,
        extensionId: "ext.runtime.transport",
        resolveBridgeSharedSecret: async () => "ab".repeat(32),
      },
    });
    await handler({
      channel: "arlopass.transport",
      action: "request",
      request: {
        envelope: makeEnvelope(
          "chat.completions",
          { messages: [{ role: "user", content: "hello" }] },
          storedProviderId,
          "claude-sonnet-4-5",
        ),
        timeoutMs: 4_321,
      },
    });

    const executeCall = sendNativeMessage.mock.calls.find(
      (call) => call[1]?.["type"] === "cloud.chat.execute",
    );
    const executeMessage = executeCall?.[1] as Record<string, unknown> | undefined;
    expect(executeMessage?.["timeoutMs"]).toBe(4_321);
  });

  it("hydrates missing cloud binding metadata via cloud.connection.validate before cloud.chat.execute", async () => {
    const storedProviderId = "provider.arlopass-cloud-anthropic.no-policy";
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: storedProviderId,
          name: "Claude Subscription",
          type: "cloud",
          status: "connected",
          models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }],
          metadata: {
            nativeHostName: "com.arlopass.bridge.cloud-no-policy",
            providerId: "claude-subscription",
            methodId: "anthropic.api_key",
            connectionHandle:
              "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000010.0.sig",
            tenantId: "tenant-cloud-no-policy",
            region: "us-east-1",
          },
        },
      ],
    });

    const sendNativeMessage = vi.fn(
      async (_hostName: string, message: Record<string, unknown>) => {
        if (message["type"] === "handshake.challenge") {
          return {
            type: "handshake.challenge",
            nonce: "15".repeat(32),
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          };
        }
        if (message["type"] === "handshake.verify") {
          return {
            type: "handshake.session",
            sessionToken: "25".repeat(32),
            extensionId: "ext.runtime.transport",
            establishedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          };
        }
        if (message["type"] === "cloud.connection.validate") {
          return {
            type: "cloud.connection.validate",
            providerId: "claude-subscription",
            methodId: "anthropic.api_key",
            valid: true,
            policyVersion: "policy.2026.03.24",
            endpointProfileHash: "sha256:endpoint-profile-cloud-no-policy",
          };
        }
        if (message["type"] === "cloud.chat.execute") {
          return {
            type: "cloud.chat.result",
            correlationId: "corr.test.001",
            providerId: "claude-subscription",
            methodId: "anthropic.api_key",
            modelId: "claude-sonnet-4-5",
            region: "us-east-1",
            content: "Cloud bridge output",
          };
        }
        throw new Error(`Unexpected native message type: ${String(message["type"])}`);
      },
    );

    const handler = createTransportMessageHandler({
      storage,
      dependencies: {
        sendNativeMessage,
        extensionId: "ext.runtime.transport",
        resolveBridgeSharedSecret: async () => "ab".repeat(32),
      },
    });
    await handler({
      channel: "arlopass.transport",
      action: "request",
      request: {
        envelope: makeEnvelope(
          "chat.completions",
          { messages: [{ role: "user", content: "hello" }] },
          storedProviderId,
          "claude-sonnet-4-5",
        ),
      },
    });

    const executeCall = sendNativeMessage.mock.calls.find(
      (call) => call[1]?.["type"] === "cloud.chat.execute",
    );
    const executeMessage = executeCall?.[1] as Record<string, unknown> | undefined;
    expect(executeMessage).toBeDefined();
    expect(
      sendNativeMessage.mock.calls.some(
        (call) => call[1]?.["type"] === "cloud.connection.validate",
      ),
    ).toBe(true);
    expect(executeMessage?.["policyVersion"]).toBe("policy.2026.03.24");
    expect(executeMessage?.["endpointProfileHash"]).toBe(
      "sha256:endpoint-profile-cloud-no-policy",
    );
  });

  it("surfaces policy.denied from bridge cloud execution", async () => {
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.claude",
          name: "Claude Subscription",
          type: "cloud",
          status: "connected",
          models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }],
          metadata: {
            nativeHostName: "com.arlopass.bridge.cloud-test-2",
            methodId: "anthropic.api_key",
            connectionHandle:
              "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
            tenantId: "tenant-cloud-2",
            policyVersion: "policy.2026.03.24",
            endpointProfileHash: "sha256:endpoint-profile-cloud-test-2",
          },
        },
      ],
    });

    const sendNativeMessage = vi.fn(
      async (_hostName: string, message: Record<string, unknown>) => {
        if (message["type"] === "handshake.challenge") {
          return {
            type: "handshake.challenge",
            nonce: "33".repeat(32),
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          };
        }
        if (message["type"] === "handshake.verify") {
          return {
            type: "handshake.session",
            sessionToken: "44".repeat(32),
            extensionId: "ext.runtime.transport",
            establishedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          };
        }
        if (message["type"] === "cloud.chat.execute") {
          return {
            type: "error",
            reasonCode: "policy.denied",
            message: "Cloud provider disabled by bridge feature flags.",
          };
        }
        throw new Error(`Unexpected native message type: ${String(message["type"])}`);
      },
    );

    const handler = createTransportMessageHandler({
      storage,
      dependencies: {
        sendNativeMessage,
        extensionId: "ext.runtime.transport",
        resolveBridgeSharedSecret: async () => "cd".repeat(32),
      },
    });
    const result = await handler({
      channel: "arlopass.transport",
      action: "request",
      request: {
        envelope: makeEnvelope(
          "chat.completions",
          { messages: [{ role: "user", content: "hello" }] },
          "provider.claude",
          "claude-sonnet-4-5",
        ),
      },
    });

    expect(result?.ok).toBe(false);
    if (result?.ok !== false) {
      return;
    }
    expect(result.error.reasonCode).toBe("policy.denied");
    expect(result.error.machineCode).toBe("ARLOPASS_POLICY_VIOLATION");
  });

  it("surfaces auth.expired from bridge cloud execution", async () => {
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.claude",
          name: "Claude Subscription",
          type: "cloud",
          status: "connected",
          models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }],
          metadata: {
            nativeHostName: "com.arlopass.bridge.cloud-test-auth-expired",
            methodId: "anthropic.api_key",
            connectionHandle:
              "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
            tenantId: "tenant-cloud-auth-expired",
            policyVersion: "policy.2026.03.24",
            endpointProfileHash: "sha256:endpoint-profile-cloud-test-auth-expired",
          },
        },
      ],
    });

    const sendNativeMessage = vi.fn(
      async (_hostName: string, message: Record<string, unknown>) => {
        if (message["type"] === "handshake.challenge") {
          return {
            type: "handshake.challenge",
            nonce: "41".repeat(32),
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          };
        }
        if (message["type"] === "handshake.verify") {
          return {
            type: "handshake.session",
            sessionToken: "51".repeat(32),
            extensionId: "ext.runtime.transport",
            establishedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          };
        }
        if (message["type"] === "cloud.chat.execute") {
          return {
            type: "error",
            reasonCode: "auth.expired",
            message: "Connection handle is unknown or revoked.",
          };
        }
        throw new Error(`Unexpected native message type: ${String(message["type"])}`);
      },
    );

    const handler = createTransportMessageHandler({
      storage,
      dependencies: {
        sendNativeMessage,
        extensionId: "ext.runtime.transport",
        resolveBridgeSharedSecret: async () => "ef".repeat(32),
      },
    });
    const result = await handler({
      channel: "arlopass.transport",
      action: "request",
      request: {
        envelope: makeEnvelope(
          "chat.completions",
          { messages: [{ role: "user", content: "hello" }] },
          "provider.claude",
          "claude-sonnet-4-5",
        ),
      },
    });

    expect(result?.ok).toBe(false);
    if (result?.ok !== false) {
      return;
    }
    expect(result.error.reasonCode).toBe("auth.expired");
    expect(result.error.machineCode).toBe("ARLOPASS_AUTH_FAILED");
  });

  it("renegotiates handshake once when cloud execution reports unknown or expired handshake token", async () => {
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.claude.rehandshake",
          name: "Claude Subscription",
          type: "cloud",
          status: "connected",
          models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }],
          metadata: {
            nativeHostName: "com.arlopass.bridge.cloud-test-rehandshake",
            providerId: "claude-subscription",
            methodId: "anthropic.api_key",
            connectionHandle:
              "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000099.0.sig",
            tenantId: "tenant-cloud-rehandshake",
            policyVersion: "policy.2026.03.24",
            endpointProfileHash: "sha256:endpoint-profile-cloud-rehandshake",
          },
        },
      ],
    });

    let verifyCallCount = 0;
    let executeCallCount = 0;
    const sessionTokens = ["61".repeat(32), "62".repeat(32)] as const;
    const sendNativeMessage = vi.fn(
      async (_hostName: string, message: Record<string, unknown>) => {
        if (message["type"] === "handshake.challenge") {
          return {
            type: "handshake.challenge",
            nonce: (verifyCallCount === 0 ? "51" : "52").repeat(32),
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          };
        }
        if (message["type"] === "handshake.verify") {
          const token = sessionTokens[Math.min(verifyCallCount, sessionTokens.length - 1)];
          verifyCallCount += 1;
          return {
            type: "handshake.session",
            sessionToken: token,
            extensionId: "ext.runtime.transport",
            establishedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          };
        }
        if (message["type"] === "cloud.chat.execute") {
          executeCallCount += 1;
          if (executeCallCount === 1) {
            return {
              type: "error",
              reasonCode: "auth.invalid",
              message: "Handshake session token is unknown or expired.",
            };
          }
          return {
            type: "cloud.chat.result",
            correlationId: "corr.test.001",
            providerId: "claude-subscription",
            methodId: "anthropic.api_key",
            modelId: "claude-sonnet-4-5",
            region: "global",
            content: "Cloud bridge output after handshake refresh",
          };
        }
        throw new Error(`Unexpected native message type: ${String(message["type"])}`);
      },
    );

    const handler = createTransportMessageHandler({
      storage,
      dependencies: {
        sendNativeMessage,
        extensionId: "ext.runtime.transport",
        resolveBridgeSharedSecret: async () => "aa".repeat(32),
      },
    });
    const result = await handler({
      channel: "arlopass.transport",
      action: "request",
      request: {
        envelope: makeEnvelope(
          "chat.completions",
          { messages: [{ role: "user", content: "hello" }] },
          "provider.claude.rehandshake",
          "claude-sonnet-4-5",
        ),
      },
    });

    expect(result?.ok).toBe(true);
    if (result?.ok !== true) {
      return;
    }
    expect(verifyCallCount).toBe(2);
    expect(executeCallCount).toBe(2);
    const executeCalls = sendNativeMessage.mock.calls.filter(
      (call) => call[1]?.["type"] === "cloud.chat.execute",
    );
    expect(executeCalls).toHaveLength(2);
    const firstExecute = executeCalls[0]?.[1] as Record<string, unknown>;
    const secondExecute = executeCalls[1]?.[1] as Record<string, unknown>;
    expect(firstExecute["handshakeSessionToken"]).toBe(sessionTokens[0]);
    expect(secondExecute["handshakeSessionToken"]).toBe(sessionTokens[1]);
    const payload = result.envelope?.payload as {
      message: { role: string; content: string };
    };
    expect(payload.message.role).toBe("assistant");
    expect(payload.message.content).toContain("handshake refresh");
  });

  it("uses bound global fetch when dependencies.fetchImpl is not provided", async () => {
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.ollama",
          name: "Ollama Local",
          type: "local",
          status: "connected",
          models: [{ id: "llama3.2", name: "Llama 3.2" }],
          metadata: { baseUrl: "http://localhost:11434" },
        },
      ],
    });

    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn(function (this: unknown, input: RequestInfo | URL) {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      void input;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            message: { role: "assistant", content: "Bound fetch works" },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    }) as typeof fetch;

    globalThis.fetch = fetchSpy;
    try {
      const handler = createTransportMessageHandler({ storage });
      const result = await handler({
        channel: "arlopass.transport",
        action: "request",
        request: {
          envelope: makeEnvelope("chat.completions", {
            messages: [{ role: "user", content: "hello" }],
          }),
        },
      });

      expect(result?.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("routes CLI chat.completions through native bridge execution", async () => {
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.cli",
          name: "Local CLI Bridge",
          type: "cli",
          status: "connected",
          models: [{ id: "gpt-5.3-codex", name: "gpt-5.3-codex" }],
          metadata: { nativeHostName: "com.arlopass.bridge.cli-1", cliType: "copilot-cli" },
        },
      ],
    });

    const sendNativeMessage = vi.fn(
      async (...args: [string, Record<string, unknown>]) => {
        const [hostName, message] = args;
        void hostName;
        void message;
        return {
          type: "cli.chat.result",
          correlationId: "corr.test.001",
          providerId: "provider.cli",
          modelId: "gpt-5.3-codex",
          content: "Live bridge output",
        };
      },
    );

    const handler = createTransportMessageHandler({
      storage,
      dependencies: { sendNativeMessage },
    });

    const result = await handler({
      channel: "arlopass.transport",
      action: "request",
      request: {
        envelope: makeEnvelope(
          "chat.completions",
          { messages: [{ role: "user", content: "hello" }] },
          "provider.cli",
          "gpt-5.3-codex",
        ),
      },
    });

    expect(sendNativeMessage).toHaveBeenCalledTimes(1);
    const executeMessage = sendNativeMessage.mock.calls[0]?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(executeMessage?.["type"]).toBe("cli.chat.execute");
    expect(executeMessage?.["cliType"]).toBe("copilot-cli");
    expect(executeMessage?.["sessionId"]).toBe("sess.test.001");
    expect(result?.ok).toBe(true);
    if (result?.ok !== true) {
      return;
    }
    const payload = result.envelope?.payload as {
      message: { role: string; content: string };
    };
    expect(payload.message.role).toBe("assistant");
    expect(payload.message.content).toBe("Live bridge output");
  });

  it("maps native CLI execution timeout error to transport.timeout", async () => {
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.cli",
          name: "Local CLI Bridge",
          type: "cli",
          status: "connected",
          models: [{ id: "gpt-5.3-codex", name: "gpt-5.3-codex" }],
          metadata: { nativeHostName: "com.arlopass.bridge.cli-2" },
        },
      ],
    });

    const sendNativeMessage = vi.fn(
      async (...args: [string, Record<string, unknown>]) => {
        const [hostName, message] = args;
        void hostName;
        void message;
        return {
          type: "error",
          reasonCode: "transport.timeout",
          message: "CLI request timed out.",
          details: { timeoutMs: 30_000 },
        };
      },
    );

    const handler = createTransportMessageHandler({
      storage,
      dependencies: { sendNativeMessage },
    });

    const result = await handler({
      channel: "arlopass.transport",
      action: "request",
      request: {
        envelope: makeEnvelope(
          "chat.completions",
          { messages: [{ role: "user", content: "hello" }] },
          "provider.cli",
          "gpt-5.3-codex",
        ),
      },
    });

    expect(sendNativeMessage).toHaveBeenCalledTimes(1);
    expect(result?.ok).toBe(false);
    if (result?.ok !== false) {
      return;
    }
    expect(result.error.reasonCode).toBe("transport.timeout");
    expect(result.error.machineCode).toBe("ARLOPASS_TIMEOUT");
  });

  it("maps native cloud execution cancellation to transport.cancelled", async () => {
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.claude.cancelled",
          name: "Claude Subscription",
          type: "cloud",
          status: "connected",
          models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }],
          metadata: {
            nativeHostName: "com.arlopass.bridge.cloud-cancelled",
            methodId: "anthropic.api_key",
            connectionHandle:
              "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
            tenantId: "tenant-cloud-cancelled",
            policyVersion: "policy.2026.03.24",
            endpointProfileHash: "sha256:endpoint-profile-cloud-cancelled",
          },
        },
      ],
    });

    const sendNativeMessage = vi.fn(
      async (_hostName: string, message: Record<string, unknown>) => {
        if (message["type"] === "handshake.challenge") {
          return {
            type: "handshake.challenge",
            nonce: "33".repeat(32),
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          };
        }
        if (message["type"] === "handshake.verify") {
          return {
            type: "handshake.session",
            sessionToken: "44".repeat(32),
            extensionId: "ext.runtime.transport",
            establishedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          };
        }
        if (message["type"] === "cloud.chat.execute") {
          return {
            type: "error",
            reasonCode: "transport.cancelled",
            message: "Cloud request cancelled.",
            details: { source: "client_disconnect" },
          };
        }
        throw new Error(`Unexpected native message type: ${String(message["type"])}`);
      },
    );

    const handler = createTransportMessageHandler({
      storage,
      dependencies: {
        sendNativeMessage,
        extensionId: "ext.runtime.transport",
        resolveBridgeSharedSecret: async () => "ff".repeat(32),
      },
    });

    const result = await handler({
      channel: "arlopass.transport",
      action: "request",
      request: {
        envelope: makeEnvelope(
          "chat.completions",
          { messages: [{ role: "user", content: "hello" }] },
          "provider.claude.cancelled",
          "claude-sonnet-4-5",
        ),
      },
    });

    expect(result?.ok).toBe(false);
    if (result?.ok !== false) {
      return;
    }
    expect(result.error.reasonCode).toBe("transport.cancelled");
  });

  it("issues one native execute call per CLI request", async () => {
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.cli",
          name: "Local CLI Bridge",
          type: "cli",
          status: "connected",
          models: [{ id: "gpt-5.3-codex", name: "gpt-5.3-codex" }],
          metadata: { nativeHostName: "com.arlopass.bridge.cli-cache", cliType: "copilot-cli" },
        },
      ],
    });

    let responseIndex = 0;
    const sendNativeMessage = vi.fn(
      async (...args: [string, Record<string, unknown>]) => {
        const [hostName, message] = args;
        void hostName;
        void message;
        responseIndex += 1;
        return {
          type: "cli.chat.result",
          correlationId: "corr.test.001",
          providerId: "provider.cli",
          modelId: "gpt-5.3-codex",
          content: `Live bridge output ${String(responseIndex)}`,
        };
      },
    );

    const handler = createTransportMessageHandler({
      storage,
      dependencies: { sendNativeMessage },
    });

    await handler({
      channel: "arlopass.transport",
      action: "request",
      request: {
        envelope: makeEnvelope(
          "chat.completions",
          { messages: [{ role: "user", content: "first" }] },
          "provider.cli",
          "gpt-5.3-codex",
        ),
      },
    });

    await handler({
      channel: "arlopass.transport",
      action: "request",
      request: {
        envelope: makeEnvelope(
          "chat.completions",
          { messages: [{ role: "user", content: "second" }] },
          "provider.cli",
          "gpt-5.3-codex",
        ),
      },
    });

    const executeCalls = sendNativeMessage.mock.calls.filter(
      (call) => call[1]?.["type"] === "cli.chat.execute",
    );
    expect(executeCalls).toHaveLength(2);
  });

  it("sends cached resumeSessionId for subsequent CLI requests", async () => {
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.cli",
          name: "Local CLI Bridge",
          type: "cli",
          status: "connected",
          models: [{ id: "gpt-5.3-codex", name: "gpt-5.3-codex" }],
          metadata: { nativeHostName: "com.arlopass.bridge.cli-resume", cliType: "copilot-cli" },
        },
      ],
    });

    let responseIndex = 0;
    const sendNativeMessage = vi.fn(
      async (...args: [string, Record<string, unknown>]) => {
        const [hostName, message] = args;
        void hostName;
        void message;
        responseIndex += 1;
        return {
          type: "cli.chat.result",
          correlationId: "corr.test.001",
          providerId: "provider.cli",
          modelId: "gpt-5.3-codex",
          content: `Live bridge output ${String(responseIndex)}`,
          ...(responseIndex === 1 ? { cliSessionId: "copilot-session-cached-001" } : {}),
        };
      },
    );

    const handler = createTransportMessageHandler({
      storage,
      dependencies: { sendNativeMessage },
    });

    await handler({
      channel: "arlopass.transport",
      action: "request",
      request: {
        envelope: makeEnvelope(
          "chat.completions",
          { messages: [{ role: "user", content: "first" }] },
          "provider.cli",
          "gpt-5.3-codex",
        ),
      },
    });

    await handler({
      channel: "arlopass.transport",
      action: "request",
      request: {
        envelope: makeEnvelope(
          "chat.completions",
          { messages: [{ role: "user", content: "second" }] },
          "provider.cli",
          "gpt-5.3-codex",
        ),
      },
    });

    const firstCallMessage = sendNativeMessage.mock.calls[0]?.[1] as
      | Record<string, unknown>
      | undefined;
    const secondCallMessage = sendNativeMessage.mock.calls[1]?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(firstCallMessage?.["resumeSessionId"]).toBeUndefined();
    expect(secondCallMessage?.["resumeSessionId"]).toBe("copilot-session-cached-001");
  });

  it("returns one chunk plus done for non-incremental request-stream chat.stream responses", async () => {
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.ollama",
          name: "Ollama Local",
          type: "local",
          status: "connected",
          models: [{ id: "llama3.2", name: "Llama 3.2" }],
          metadata: { baseUrl: "http://localhost:11434" },
        },
      ],
    });

    const longResponse =
      "Streaming path now routes through request-stream without synthetic chunk slicing. ".repeat(
        4,
      ).trim();
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          message: {
            role: "assistant",
            content: longResponse,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    const handler = createTransportMessageHandler({
      storage,
      dependencies: { fetchImpl },
    });

    const result = await handler({
      channel: "arlopass.transport",
      action: "request-stream",
      request: {
        envelope: makeEnvelope("chat.stream", {
          messages: [{ role: "user", content: "hello" }],
        }),
      },
    });

    expect(result?.ok).toBe(true);
    if (result?.ok !== true) {
      return;
    }

    expect(Array.isArray(result.envelopes)).toBe(true);
    const envelopes = result.envelopes as Array<CanonicalEnvelope<unknown>>;
    expect(envelopes).toHaveLength(2);
    expect(envelopes[0]?.payload).toMatchObject({
      type: "chunk",
      delta: longResponse,
      index: 0,
    });
    expect(envelopes[1]?.payload).toMatchObject({ type: "done" });

    const fetchMock = fetchImpl as unknown as ReturnType<typeof vi.fn>;
    const firstRequestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const firstRequestBody = JSON.parse(String(firstRequestInit?.body ?? "{}")) as Record<
      string,
      unknown
    >;
    expect(firstRequestBody["stream"]).toBe(true);
  });

  it("returns provider-driven incremental deltas for request-stream chat.stream action", async () => {
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.ollama",
          name: "Ollama Local",
          type: "local",
          status: "connected",
          models: [{ id: "llama3.2", name: "Llama 3.2" }],
          metadata: { baseUrl: "http://localhost:11434" },
        },
      ],
    });

    const encoder = new TextEncoder();
    const fetchImpl = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                message: { role: "assistant", content: "Streaming path " },
                done: false,
              }) + "\n",
            ),
          );
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                message: { role: "assistant", content: "now emits provider" },
                done: false,
              }) + "\n",
            ),
          );
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                message: { role: "assistant", content: "-driven deltas." },
                done: true,
              }) + "\n",
            ),
          );
          controller.close();
        },
      });

      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/x-ndjson" },
      });
    }) as unknown as typeof fetch;

    const handler = createTransportMessageHandler({
      storage,
      dependencies: { fetchImpl },
    });

    const result = await handler({
      channel: "arlopass.transport",
      action: "request-stream",
      request: {
        envelope: makeEnvelope("chat.stream", {
          messages: [{ role: "user", content: "hello" }],
        }),
      },
    });

    expect(result?.ok).toBe(true);
    if (result?.ok !== true) {
      return;
    }

    const envelopes = result.envelopes as Array<CanonicalEnvelope<unknown>>;
    expect(envelopes).toHaveLength(4);
    expect(envelopes[0]?.payload).toMatchObject({
      type: "chunk",
      delta: "Streaming path ",
      index: 0,
    });
    expect(envelopes[1]?.payload).toMatchObject({
      type: "chunk",
      delta: "now emits provider",
      index: 1,
    });
    expect(envelopes[2]?.payload).toMatchObject({
      type: "chunk",
      delta: "-driven deltas.",
      index: 2,
    });
    expect(envelopes[3]?.payload).toMatchObject({ type: "done" });
  });

  it("registers default runtime listener with cloud handshake dependencies", async () => {
    const pairingHandle = "pairh.00112233445566778899aabbccddeeff";
    const wrappedPairingState = await wrapPairingKeyMaterial({
      pairingHandle,
      extensionId: "ext.runtime.transport",
      hostName: "com.arlopass.bridge.cloud-default",
      pairingKeyHex: "ab".repeat(32),
      runtimeId: "ext.runtime.transport",
      createdAt: new Date().toISOString(),
    });

    const sendNativeMessage = vi.fn(
      (
        _hostName: string,
        message: Record<string, unknown>,
        callback: (response: unknown) => void,
      ) => {
        if (message["type"] === "handshake.challenge") {
          callback({
            type: "handshake.challenge",
            nonce: "33".repeat(32),
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          });
          return;
        }

        if (message["type"] === "handshake.verify") {
          callback({
            type: "handshake.session",
            sessionToken: "44".repeat(32),
            extensionId: "ext.runtime.transport",
            establishedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          });
          return;
        }

        if (message["type"] === "cloud.chat.execute") {
          callback({
            type: "cloud.chat.result",
            correlationId: "corr.test.001",
            providerId: "provider.claude",
            methodId: "anthropic.api_key",
            modelId: "claude-sonnet-4-5",
            region: "us-east-1",
            content: "Cloud bridge output",
          });
          return;
        }

        callback({
          type: "error",
          reasonCode: "request.invalid",
          message: `Unexpected native message type: ${String(message["type"])}`,
        });
      },
    );

    const storageState: Record<string, unknown> = {
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.claude",
          name: "Claude Subscription",
          type: "cloud",
          status: "connected",
          models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }],
          metadata: {
            nativeHostName: "com.arlopass.bridge.cloud-default",
            methodId: "anthropic.api_key",
            connectionHandle:
              "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
            tenantId: "tenant-cloud-default",
            region: "us-east-1",
            policyVersion: "policy.2026.03.24",
            endpointProfileHash: "sha256:endpoint-profile-cloud-default",
          },
        },
      ],
      [WALLET_KEY_ACTIVE]: { providerId: "provider.claude", modelId: "claude-sonnet-4-5" },
      [BRIDGE_PAIRING_STATE_STORAGE_KEY]: wrappedPairingState,
    };

    const storageGet = vi.fn((keys: readonly string[], callback: (value: unknown) => void) => {
      callback(Object.fromEntries(keys.map((key) => [key, storageState[key]])));
    });

    const runtime = {
      id: "ext.runtime.transport",
      lastError: undefined as { message?: string } | undefined,
      onMessage: {
        addListener: vi.fn(),
      },
      sendNativeMessage,
    };

    vi.stubGlobal("chrome", {
      runtime,
      storage: {
        local: {
          get: storageGet,
          set: vi.fn((_items: Record<string, unknown>, callback: () => void) => callback()),
        },
      },
    });

    registerDefaultTransportMessageListener();
    expect(runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    const listener = runtime.onMessage.addListener.mock.calls[0]?.[0] as
      | ((message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean)
      | undefined;
    expect(listener).toBeDefined();
    if (listener === undefined) {
      return;
    }

    const response = await new Promise<unknown>((resolve) => {
      const handled = listener(
        {
          channel: "arlopass.transport",
          action: "request",
          request: {
            envelope: makeEnvelope(
              "chat.completions",
              { messages: [{ role: "user", content: "hello" }] },
              "provider.claude",
              "claude-sonnet-4-5",
            ),
          },
        },
        {},
        resolve,
      );
      expect(handled).toBe(true);
    });

    const actionResponse = response as { ok: boolean; envelope?: { payload?: unknown } };
    expect(actionResponse.ok).toBe(true);

    const verifyCall = sendNativeMessage.mock.calls.find(
      (call) => call[1]?.["type"] === "handshake.verify",
    );
    expect(verifyCall).toBeDefined();
    const verifyPayload = verifyCall?.[1] as Record<string, unknown> | undefined;
    expect(verifyPayload?.["extensionId"]).toBe("ext.runtime.transport");

    expect(storageGet).toHaveBeenCalledWith(
      expect.arrayContaining([BRIDGE_PAIRING_STATE_STORAGE_KEY]),
      expect.any(Function),
    );
  });

  it("uses wrapped pairing material and pairingHandle in default listener handshake", async () => {
    const pairingHandle = "pairh.00112233445566778899aabbccddeeff";
    const wrappedPairingState = await wrapPairingKeyMaterial({
      pairingHandle,
      extensionId: "ext.runtime.transport",
      hostName: "com.arlopass.bridge.cloud-default",
      pairingKeyHex: "ab".repeat(32),
      runtimeId: "ext.runtime.transport",
      createdAt: new Date().toISOString(),
    });

    const sendNativeMessage = vi.fn(
      (
        _hostName: string,
        message: Record<string, unknown>,
        callback: (response: unknown) => void,
      ) => {
        if (message["type"] === "handshake.challenge") {
          callback({
            type: "handshake.challenge",
            nonce: "77".repeat(32),
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          });
          return;
        }
        if (message["type"] === "handshake.verify") {
          callback({
            type: "handshake.session",
            sessionToken: "88".repeat(32),
            extensionId: "ext.runtime.transport",
            establishedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          });
          return;
        }
        if (message["type"] === "cloud.chat.execute") {
          callback({
            type: "cloud.chat.result",
            correlationId: "corr.test.001",
            providerId: "provider.claude",
            methodId: "anthropic.api_key",
            modelId: "claude-sonnet-4-5",
            region: "us-east-1",
            content: "Cloud bridge output",
          });
          return;
        }
        callback({
          type: "error",
          reasonCode: "request.invalid",
          message: `Unexpected native message type: ${String(message["type"])}`,
        });
      },
    );

    const storageState: Record<string, unknown> = {
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.claude",
          name: "Claude Subscription",
          type: "cloud",
          status: "connected",
          models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }],
          metadata: {
            nativeHostName: "com.arlopass.bridge.cloud-default",
            methodId: "anthropic.api_key",
            connectionHandle:
              "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig",
            tenantId: "tenant-cloud-default",
            region: "us-east-1",
            policyVersion: "policy.2026.03.24",
            endpointProfileHash: "sha256:endpoint-profile-cloud-default",
          },
        },
      ],
      [WALLET_KEY_ACTIVE]: { providerId: "provider.claude", modelId: "claude-sonnet-4-5" },
      [BRIDGE_PAIRING_STATE_STORAGE_KEY]: wrappedPairingState,
    };

    const storageGet = vi.fn((keys: readonly string[], callback: (value: unknown) => void) => {
      callback(Object.fromEntries(keys.map((key) => [key, storageState[key]])));
    });

    const runtime = {
      id: "ext.runtime.transport",
      lastError: undefined as { message?: string } | undefined,
      onMessage: {
        addListener: vi.fn(),
      },
      sendNativeMessage,
    };

    vi.stubGlobal("chrome", {
      runtime,
      storage: {
        local: {
          get: storageGet,
          set: vi.fn((_items: Record<string, unknown>, callback: () => void) => callback()),
        },
      },
    });

    registerDefaultTransportMessageListener();
    const listener = runtime.onMessage.addListener.mock.calls[0]?.[0] as
      | ((message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean)
      | undefined;
    expect(listener).toBeDefined();
    if (listener === undefined) {
      return;
    }

    const response = await new Promise<unknown>((resolve) => {
      const handled = listener(
        {
          channel: "arlopass.transport",
          action: "request",
          request: {
            envelope: makeEnvelope(
              "chat.completions",
              { messages: [{ role: "user", content: "hello" }] },
              "provider.claude",
              "claude-sonnet-4-5",
            ),
          },
        },
        {},
        resolve,
      );
      expect(handled).toBe(true);
    });

    expect((response as { ok: boolean }).ok).toBe(true);
    const verifyCall = sendNativeMessage.mock.calls.find(
      (call) => call[1]?.["type"] === "handshake.verify",
    );
    const verifyPayload = verifyCall?.[1] as Record<string, unknown> | undefined;
    expect(verifyPayload?.["pairingHandle"]).toBe(pairingHandle);
    expect(verifyPayload?.["hostName"]).toBe("com.arlopass.bridge.cloud-default");
  });
});

describe("registerDefaultTransportStreamPortListener", () => {
  type PortMessageListener = (message: unknown) => void;
  type PortDisconnectListener = () => void;

  function createPortHarness(name = "arlopass.transport.stream.v1"): {
    port: {
      name: string;
      onMessage: { addListener: ReturnType<typeof vi.fn> };
      onDisconnect: { addListener: ReturnType<typeof vi.fn> };
      postMessage: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    };
    emitMessage: (message: unknown) => void;
    emitDisconnect: () => void;
    sentMessages: Array<Record<string, unknown>>;
  } {
    const sentMessages: Array<Record<string, unknown>> = [];
    let messageListener: PortMessageListener | undefined;
    let disconnectListener: PortDisconnectListener | undefined;

    const port = {
      name,
      onMessage: {
        addListener: vi.fn((listener: PortMessageListener) => {
          messageListener = listener;
        }),
      },
      onDisconnect: {
        addListener: vi.fn((listener: PortDisconnectListener) => {
          disconnectListener = listener;
        }),
      },
      postMessage: vi.fn((message: unknown) => {
        if (typeof message === "object" && message !== null) {
          sentMessages.push(message as Record<string, unknown>);
        }
      }),
      disconnect: vi.fn(),
    };

    return {
      port,
      emitMessage(message: unknown): void {
        messageListener?.(message);
      },
      emitDisconnect(): void {
        disconnectListener?.();
      },
      sentMessages,
    };
  }

  async function flushPort(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  it("streams start/chunk/done events over runtime port", async () => {
    const storageState: Record<string, unknown> = {
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.ollama",
          name: "Ollama Local",
          type: "local",
          status: "connected",
          models: [{ id: "llama3.2", name: "Llama 3.2" }],
          metadata: { baseUrl: "http://localhost:11434" },
        },
      ],
      [WALLET_KEY_ACTIVE]: {
        providerId: "provider.ollama",
        modelId: "llama3.2",
      },
    };
    const storageGet = vi.fn((keys: readonly string[], callback: (value: unknown) => void) => {
      callback(Object.fromEntries(keys.map((key) => [key, storageState[key]])));
    });

    const encoder = new TextEncoder();
    const fetchImpl = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                message: { role: "assistant", content: "Hello " },
                done: false,
              }) + "\n",
            ),
          );
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                message: { role: "assistant", content: "world" },
                done: true,
              }) + "\n",
            ),
          );
          controller.close();
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/x-ndjson" },
      });
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchImpl);

    const runtime = {
      id: "ext.runtime.transport",
      lastError: undefined as { message?: string } | undefined,
      onConnect: {
        addListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn(),
      },
      sendNativeMessage: vi.fn(),
    };

    vi.stubGlobal("chrome", {
      runtime,
      storage: {
        local: {
          get: storageGet,
          set: vi.fn((_items: Record<string, unknown>, callback: () => void) => callback()),
        },
      },
    });

    delete (globalThis as Record<string, unknown>)[TRANSPORT_STREAM_PORT_LISTENER_FLAG];
    registerDefaultTransportStreamPortListener();
    expect(runtime.onConnect.addListener).toHaveBeenCalledTimes(1);

    const connectListener = runtime.onConnect.addListener.mock.calls[0]?.[0] as
      | ((port: unknown) => void)
      | undefined;
    expect(connectListener).toBeDefined();
    if (connectListener === undefined) {
      return;
    }

    const harness = createPortHarness();
    connectListener(harness.port);

    harness.emitMessage({
      channel: "arlopass.transport.stream",
      action: "start",
      requestId: "req.stream.live.001",
      request: {
        envelope: makeEnvelope("chat.stream", {
          messages: [{ role: "user", content: "hello" }],
        }),
      },
    });

    await flushPort();
    await waitForCondition(() => harness.sentMessages.length >= 4);

    expect(harness.sentMessages[0]).toMatchObject({
      channel: "arlopass.transport.stream",
      requestId: "req.stream.live.001",
      event: "start",
    });
    expect(harness.sentMessages[1]).toMatchObject({
      channel: "arlopass.transport.stream",
      requestId: "req.stream.live.001",
      event: "chunk",
      envelope: {
        payload: {
          type: "chunk",
          delta: "Hello ",
          index: 0,
        },
      },
    });
    expect(harness.sentMessages[2]).toMatchObject({
      channel: "arlopass.transport.stream",
      requestId: "req.stream.live.001",
      event: "chunk",
      envelope: {
        payload: {
          type: "chunk",
          delta: "world",
          index: 1,
        },
      },
    });
    expect(harness.sentMessages[3]).toMatchObject({
      channel: "arlopass.transport.stream",
      requestId: "req.stream.live.001",
      event: "done",
      envelope: {
        payload: {
          type: "done",
        },
      },
    });
  });

  it("emits cancelled when stream receives a cancel action", async () => {
    const storageState: Record<string, unknown> = {
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.cli",
          name: "CLI Bridge",
          type: "cli",
          status: "connected",
          models: [{ id: "gpt-5.3-codex", name: "GPT-5.3 Codex" }],
          metadata: {
            nativeHostName: "com.arlopass.bridge",
            cliType: "copilot-cli",
          },
        },
      ],
      [WALLET_KEY_ACTIVE]: {
        providerId: "provider.cli",
        modelId: "gpt-5.3-codex",
      },
    };
    const storageGet = vi.fn((keys: readonly string[], callback: (value: unknown) => void) => {
      callback(Object.fromEntries(keys.map((key) => [key, storageState[key]])));
    });

    const runtime = {
      id: "ext.runtime.transport",
      lastError: undefined as { message?: string } | undefined,
      onConnect: {
        addListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn(),
      },
      sendNativeMessage: vi.fn(),
    };

    vi.stubGlobal("chrome", {
      runtime,
      storage: {
        local: {
          get: storageGet,
          set: vi.fn((_items: Record<string, unknown>, callback: () => void) => callback()),
        },
      },
    });

    delete (globalThis as Record<string, unknown>)[TRANSPORT_STREAM_PORT_LISTENER_FLAG];
    registerDefaultTransportStreamPortListener();
    expect(runtime.onConnect.addListener).toHaveBeenCalledTimes(1);
    const connectListener = runtime.onConnect.addListener.mock.calls[0]?.[0] as
      | ((port: unknown) => void)
      | undefined;
    expect(connectListener).toBeDefined();
    if (connectListener === undefined) {
      return;
    }

    const harness = createPortHarness();
    connectListener(harness.port);

    harness.emitMessage({
      channel: "arlopass.transport.stream",
      action: "start",
      requestId: "req.stream.cancel.001",
      request: {
        envelope: makeEnvelope(
          "chat.stream",
          {
            messages: [{ role: "user", content: "cancel me" }],
          },
          "provider.cli",
          "gpt-5.3-codex",
        ),
      },
    });
    await flushPort();

    harness.emitMessage({
      channel: "arlopass.transport.stream",
      action: "cancel",
      requestId: "req.stream.cancel.001",
    });

    await flushPort();
    await waitForCondition(() =>
      harness.sentMessages.some(
        (event) =>
          event["requestId"] === "req.stream.cancel.001" &&
          event["event"] === "cancelled",
      ),
    );

    const cancelled = harness.sentMessages.find(
      (event) =>
        event["requestId"] === "req.stream.cancel.001" &&
        event["event"] === "cancelled",
    );
    expect(cancelled).toBeDefined();
  });

  it("aborts and cleans up in-flight stream when posting a chunk to the port fails", async () => {
    const storageState: Record<string, unknown> = {
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.ollama",
          name: "Ollama Local",
          type: "local",
          status: "connected",
          models: [{ id: "llama3.2", name: "Llama 3.2" }],
          metadata: { baseUrl: "http://localhost:11434" },
        },
      ],
      [WALLET_KEY_ACTIVE]: {
        providerId: "provider.ollama",
        modelId: "llama3.2",
      },
    };
    const storageGet = vi.fn((keys: readonly string[], callback: (value: unknown) => void) => {
      callback(Object.fromEntries(keys.map((key) => [key, storageState[key]])));
    });

    const encoder = new TextEncoder();
    const fetchImpl = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                message: { role: "assistant", content: "first chunk" },
                done: false,
              }) + "\n",
            ),
          );
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                message: { role: "assistant", content: "second chunk" },
                done: true,
              }) + "\n",
            ),
          );
          controller.close();
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/x-ndjson" },
      });
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchImpl);

    const runtime = {
      id: "ext.runtime.transport",
      lastError: undefined as { message?: string } | undefined,
      onConnect: {
        addListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn(),
      },
      sendNativeMessage: vi.fn(),
    };

    vi.stubGlobal("chrome", {
      runtime,
      storage: {
        local: {
          get: storageGet,
          set: vi.fn((_items: Record<string, unknown>, callback: () => void) => callback()),
        },
      },
    });

    const reportError = vi.fn();
    delete (globalThis as Record<string, unknown>)[TRANSPORT_STREAM_PORT_LISTENER_FLAG];
    registerDefaultTransportStreamPortListener({ reportError });
    expect(runtime.onConnect.addListener).toHaveBeenCalledTimes(1);

    const connectListener = runtime.onConnect.addListener.mock.calls[0]?.[0] as
      | ((port: unknown) => void)
      | undefined;
    expect(connectListener).toBeDefined();
    if (connectListener === undefined) {
      return;
    }

    const harness = createPortHarness();
    const defaultPostMessage = harness.port.postMessage;
    harness.port.postMessage = vi.fn((message: unknown) => {
      if (
        typeof message === "object" &&
        message !== null &&
        (message as Record<string, unknown>)["event"] === "chunk"
      ) {
        throw new Error("Port write failed while relaying chunk.");
      }
      defaultPostMessage(message);
    });

    connectListener(harness.port);
    harness.emitMessage({
      channel: "arlopass.transport.stream",
      action: "start",
      requestId: "req.stream.portfail.001",
      request: {
        envelope: makeEnvelope("chat.stream", {
          messages: [{ role: "user", content: "hello" }],
        }),
      },
    });

    await waitForCondition(() => reportError.mock.calls.length > 0);
    expect(reportError).toHaveBeenCalledTimes(1);

    await flushPort();
    harness.emitMessage({
      channel: "arlopass.transport.stream",
      action: "start",
      requestId: "req.stream.portfail.001",
      request: {
        envelope: makeEnvelope("chat.stream", {
          messages: [{ role: "user", content: "retry" }],
        }),
      },
    });
    await flushPort();
    await flushPort();

    const streamEvents = harness.sentMessages.filter(
      (event) => event["requestId"] === "req.stream.portfail.001",
    );
    const startEvents = streamEvents.filter((event) => event["event"] === "start");
    expect(startEvents.length).toBeGreaterThanOrEqual(2);
    expect(
      streamEvents.some(
        (event) =>
          event["event"] === "error" &&
          (event["error"] as Record<string, unknown> | undefined)?.["reasonCode"] ===
          "request.invalid",
      ),
    ).toBe(false);
    expect(
      streamEvents.some(
        (event) => event["event"] === "cancelled",
      ),
    ).toBe(false);
    expect(
      streamEvents.some(
        (event) => event["event"] === "chunk" || event["event"] === "done",
      ),
    ).toBe(false);
    expect(reportError.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(
      reportError.mock.calls.every((call) => call[0] instanceof Error),
    );
    expect(reportError.mock.calls[0]?.[0]?.message).toContain("Port write failed");
  });

  it("suppresses stream terminal events after port disconnect teardown", async () => {
    const storageState: Record<string, unknown> = {
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.ollama",
          name: "Ollama Local",
          type: "local",
          status: "connected",
          models: [{ id: "llama3.2", name: "Llama 3.2" }],
          metadata: { baseUrl: "http://localhost:11434" },
        },
      ],
      [WALLET_KEY_ACTIVE]: {
        providerId: "provider.ollama",
        modelId: "llama3.2",
      },
    };
    const storageGet = vi.fn((keys: readonly string[], callback: (value: unknown) => void) => {
      callback(Object.fromEntries(keys.map((key) => [key, storageState[key]])));
    });

    const encoder = new TextEncoder();
    let releaseChunks: (() => void) | undefined;
    const chunkGate = new Promise<void>((resolve) => {
      releaseChunks = resolve;
    });
    const fetchImpl = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          await chunkGate;
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                message: { role: "assistant", content: "late chunk" },
                done: false,
              }) + "\n",
            ),
          );
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                message: { role: "assistant", content: "done" },
                done: true,
              }) + "\n",
            ),
          );
          controller.close();
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/x-ndjson" },
      });
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchImpl);

    const runtime = {
      id: "ext.runtime.transport",
      lastError: undefined as { message?: string } | undefined,
      onConnect: {
        addListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn(),
      },
      sendNativeMessage: vi.fn(),
    };

    vi.stubGlobal("chrome", {
      runtime,
      storage: {
        local: {
          get: storageGet,
          set: vi.fn((_items: Record<string, unknown>, callback: () => void) => callback()),
        },
      },
    });

    const reportError = vi.fn();
    delete (globalThis as Record<string, unknown>)[TRANSPORT_STREAM_PORT_LISTENER_FLAG];
    registerDefaultTransportStreamPortListener({ reportError });
    expect(runtime.onConnect.addListener).toHaveBeenCalledTimes(1);

    const connectListener = runtime.onConnect.addListener.mock.calls[0]?.[0] as
      | ((port: unknown) => void)
      | undefined;
    expect(connectListener).toBeDefined();
    if (connectListener === undefined) {
      return;
    }

    const harness = createPortHarness();
    connectListener(harness.port);

    harness.emitMessage({
      channel: "arlopass.transport.stream",
      action: "start",
      requestId: "req.stream.disconnect.001",
      request: {
        envelope: makeEnvelope("chat.stream", {
          messages: [{ role: "user", content: "hello" }],
        }),
      },
    });
    await waitForCondition(() => harness.sentMessages.length > 0);
    expect(harness.sentMessages[0]).toMatchObject({
      channel: "arlopass.transport.stream",
      requestId: "req.stream.disconnect.001",
      event: "start",
    });

    harness.emitDisconnect();
    releaseChunks?.();
    await flushPort();
    await flushPort();

    const disconnectEvents = harness.sentMessages.filter(
      (event) => event["requestId"] === "req.stream.disconnect.001",
    );
    expect(disconnectEvents).toHaveLength(1);
    expect(disconnectEvents[0]?.["event"]).toBe("start");
    expect(reportError).not.toHaveBeenCalled();
  });
});
