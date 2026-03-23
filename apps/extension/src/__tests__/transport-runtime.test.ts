import { describe, expect, it, vi } from "vitest";

import type { ProtocolCapability } from "@byom-ai/protocol";
import type { CanonicalEnvelope } from "@byom-ai/protocol";

import {
  createTransportMessageHandler,
  type WalletStorageAdapter,
} from "../transport/runtime.js";

const WALLET_KEY_PROVIDERS = "byom.wallet.providers.v1";
const WALLET_KEY_ACTIVE = "byom.wallet.activeProvider.v1";

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

describe("createTransportMessageHandler", () => {
  it("returns null for unrelated channels", async () => {
    const storage = makeStorageAdapter({});
    const handler = createTransportMessageHandler({ storage });

    const result = await handler({
      channel: "byom.wallet",
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
      ],
    });

    const handler = createTransportMessageHandler({ storage });
    const result = await handler({
      channel: "byom.transport",
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
      channel: "byom.transport",
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
      channel: "byom.transport",
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
      channel: "byom.transport",
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

  it("returns provider.unavailable for cloud chat completion without runtime broker", async () => {
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.claude",
          name: "Claude Subscription",
          type: "cloud",
          status: "connected",
          models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }],
          metadata: { baseUrl: "https://api.anthropic.com" },
        },
      ],
    });

    const handler = createTransportMessageHandler({ storage });
    const result = await handler({
      channel: "byom.transport",
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
    expect(result.error.reasonCode).toBe("provider.unavailable");
    expect(result.error.machineCode).toBe("BYOM_PROVIDER_UNAVAILABLE");
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
        channel: "byom.transport",
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

  it("returns provider.unavailable for CLI chat completion until bridge execution is implemented", async () => {
    const storage = makeStorageAdapter({
      [WALLET_KEY_PROVIDERS]: [
        {
          id: "provider.cli",
          name: "Local CLI Bridge",
          type: "cli",
          status: "connected",
          models: [{ id: "gpt-5.3-codex", name: "gpt-5.3-codex" }],
          metadata: { nativeHostName: "com.byom.bridge" },
        },
      ],
    });

    const sendNativeMessage = vi.fn(async () => ({
      type: "handshake.challenge",
      nonce: "nonce-1",
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }));

    const handler = createTransportMessageHandler({
      storage,
      dependencies: { sendNativeMessage },
    });

    const result = await handler({
      channel: "byom.transport",
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
    expect(result.error.reasonCode).toBe("provider.unavailable");
    expect(result.error.machineCode).toBe("BYOM_PROVIDER_UNAVAILABLE");
    expect(result.error.message).toContain("not implemented");
  });
});
