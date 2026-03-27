import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type CloudAdapterContractV2,
  MANIFEST_SCHEMA_VERSION,
} from "@arlopass/adapter-runtime";
import {
  AuthError,
  PermissionError,
  ProviderUnavailableError,
  TimeoutError,
  TransientNetworkError,
  isProtocolError,
} from "@arlopass/protocol";

import { buildAuthHeaders, ClaudeSubscriptionAdapter, CLAUDE_SUBSCRIPTION_MANIFEST } from "../index.js";
import type { ClaudeAuthConfig } from "../auth.js";

const API_KEY_AUTH: ClaudeAuthConfig = { authType: "api_key", apiKey: "test-key" };
const OAUTH_AUTH: ClaudeAuthConfig = { authType: "oauth2", accessToken: "test-token" };

function makeAdapter(auth: ClaudeAuthConfig = API_KEY_AUTH): ClaudeSubscriptionAdapter {
  return new ClaudeSubscriptionAdapter({ auth });
}

function makeCloudAdapter(auth: ClaudeAuthConfig = API_KEY_AUTH): CloudAdapterContractV2 {
  return new ClaudeSubscriptionAdapter({ auth }) as unknown as CloudAdapterContractV2;
}

function makeOkFetch(body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

function makeErrorFetch(status: number, errorType = "api_error", message = "error"): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ type: "error", error: { type: errorType, message } }),
    text: async () => JSON.stringify({ error: { message } }),
  }) as unknown as typeof fetch;
}

function makeNetworkErrorFetch(code: string): typeof fetch {
  const err = Object.assign(new Error(`connect ${code}`), { code });
  return vi.fn().mockRejectedValue(err) as unknown as typeof fetch;
}

describe("ClaudeSubscriptionAdapter – manifest", () => {
  it("has correct schema version", () => {
    expect(CLAUDE_SUBSCRIPTION_MANIFEST.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
  });

  it("has providerId claude-subscription", () => {
    expect(CLAUDE_SUBSCRIPTION_MANIFEST.providerId).toBe("claude-subscription");
  });

  it("uses oauth2 auth type", () => {
    expect(CLAUDE_SUBSCRIPTION_MANIFEST.authType).toBe("oauth2");
  });

  it("includes chat.completions and chat.stream capabilities", () => {
    expect(CLAUDE_SUBSCRIPTION_MANIFEST.capabilities).toContain("chat.completions");
    expect(CLAUDE_SUBSCRIPTION_MANIFEST.capabilities).toContain("chat.stream");
  });

  it("has medium risk level", () => {
    expect(CLAUDE_SUBSCRIPTION_MANIFEST.riskLevel).toBe("medium");
  });

  it("declares additive cloud connection methods metadata", () => {
    const methods = CLAUDE_SUBSCRIPTION_MANIFEST.connectionMethods ?? [];
    expect(methods.map((method) => method.id)).toEqual(
      expect.arrayContaining(["anthropic.oauth_subscription", "anthropic.api_key"]),
    );
  });

  it("egress rules only allow api.anthropic.com", () => {
    const hosts = CLAUDE_SUBSCRIPTION_MANIFEST.egressRules.map((r) => r.host);
    expect(hosts).toContain("api.anthropic.com");
    expect(hosts).not.toContain("*");
  });
});

describe("ClaudeSubscriptionAdapter – auth helpers", () => {
  it("buildAuthHeaders with api_key produces x-api-key header", () => {
    const headers = buildAuthHeaders({ authType: "api_key", apiKey: "sk-test" });
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["anthropic-version"]).toBeDefined();
  });

  it("buildAuthHeaders with oauth2 produces Authorization header", () => {
    const headers = buildAuthHeaders({ authType: "oauth2", accessToken: "tok" });
    expect(headers["Authorization"]).toBe("Bearer tok");
    expect(headers["x-api-key"]).toBeUndefined();
  });

  it("buildAuthHeaders throws AuthError when oauth2 token is missing", () => {
    expect(() => buildAuthHeaders({ authType: "oauth2" })).toThrow(AuthError);
  });

  it("buildAuthHeaders throws AuthError when api_key is missing", () => {
    expect(() => buildAuthHeaders({ authType: "api_key" })).toThrow(AuthError);
  });
});

describe("ClaudeSubscriptionAdapter – interface compliance", () => {
  let adapter: ClaudeSubscriptionAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  it("exposes manifest matching CLAUDE_SUBSCRIPTION_MANIFEST", () => {
    expect(adapter.manifest).toBe(CLAUDE_SUBSCRIPTION_MANIFEST);
  });

  it("implements all AdapterContract methods", () => {
    expect(typeof adapter.describeCapabilities).toBe("function");
    expect(typeof adapter.listModels).toBe("function");
    expect(typeof adapter.createSession).toBe("function");
    expect(typeof adapter.sendMessage).toBe("function");
    expect(typeof adapter.streamMessage).toBe("function");
    expect(typeof adapter.healthCheck).toBe("function");
    expect(typeof adapter.shutdown).toBe("function");
  });
});

describe("ClaudeSubscriptionAdapter – cloud contract v2", () => {
  it("supports subscription oauth and api_key methods", () => {
    const methods = makeCloudAdapter().listConnectionMethods();
    expect(methods.map((method) => method.id)).toEqual(
      expect.arrayContaining(["anthropic.oauth_subscription", "anthropic.api_key"]),
    );
  });

  it("beginConnect returns required fields for selected method", async () => {
    const adapter = makeCloudAdapter();
    const begin = await adapter.beginConnect({
      providerId: CLAUDE_SUBSCRIPTION_MANIFEST.providerId,
      methodId: "anthropic.api_key",
    });
    expect(begin["requiredFields"]).toEqual(expect.arrayContaining(["apiKey"]));
  });

  it("completes, validates, and revokes a credentialRef", async () => {
    const adapter = makeCloudAdapter();
    const complete = await adapter.completeConnect({
      providerId: CLAUDE_SUBSCRIPTION_MANIFEST.providerId,
      methodId: "anthropic.api_key",
      input: {
        apiKey: "sk-test-key",
        endpointProfile: { endpoint: "https://api.anthropic.com" },
      },
    });
    const credentialRef = complete["credentialRef"];
    expect(typeof credentialRef).toBe("string");
    if (typeof credentialRef !== "string") throw new Error("Expected credentialRef string.");

    const valid = await adapter.validateCredentialRef({
      providerId: CLAUDE_SUBSCRIPTION_MANIFEST.providerId,
      methodId: "anthropic.api_key",
      credentialRef,
    });
    expect(valid).toEqual({ ok: true });

    await adapter.revokeCredentialRef({
      providerId: CLAUDE_SUBSCRIPTION_MANIFEST.providerId,
      methodId: "anthropic.api_key",
      credentialRef,
      reason: "test-revoke",
    });

    const revoked = await adapter.validateCredentialRef({
      providerId: CLAUDE_SUBSCRIPTION_MANIFEST.providerId,
      methodId: "anthropic.api_key",
      credentialRef,
    });
    expect(revoked.ok).toBe(false);
    expect(typeof revoked.reason).toBe("string");
  });

  it("discovers live structured models/capabilities for valid refs", async () => {
    const adapter = makeCloudAdapter();
    const complete = await adapter.completeConnect({
      providerId: CLAUDE_SUBSCRIPTION_MANIFEST.providerId,
      methodId: "anthropic.api_key",
      input: {
        apiKey: "sk-test-key",
        endpointProfile: { baseUrl: "https://api.anthropic.com" },
      },
    });
    const credentialRef = complete["credentialRef"];
    expect(typeof credentialRef).toBe("string");
    if (typeof credentialRef !== "string") throw new Error("Expected credentialRef string.");

    const endpointProfile =
      complete["endpointProfile"] && typeof complete["endpointProfile"] === "object"
        ? (complete["endpointProfile"] as Readonly<Record<string, unknown>>)
        : {};

    const discoveryContext = {
      providerId: CLAUDE_SUBSCRIPTION_MANIFEST.providerId,
      methodId: "anthropic.api_key",
      credentialRef,
      endpointProfile,
      correlationId: "corr-test-1",
    };

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5" },
          { id: "claude-opus-4-5" },
        ],
      }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    const models = await adapter.discoverModels(discoveryContext);
    expect(models).toEqual([
      expect.objectContaining({ id: "claude-sonnet-4-5", displayName: "Claude Sonnet 4.5" }),
      expect.objectContaining({ id: "claude-opus-4-5", displayName: "claude-opus-4-5" }),
    ]);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = requestInit?.headers as Record<string, string> | undefined;
    expect(headers?.["x-api-key"]).toBe("sk-test-key");
    expect(headers?.["anthropic-version"]).toBe("2023-06-01");

    const capabilitiesA = await adapter.discoverCapabilities(discoveryContext);
    const capabilitiesB = await adapter.discoverCapabilities(discoveryContext);
    expect(capabilitiesA).toEqual(capabilitiesB);
    expect(capabilitiesA.capabilities.length).toBeGreaterThan(0);
    expect(capabilitiesA).toEqual(
      expect.objectContaining({ capabilities: expect.arrayContaining([expect.any(String)]) }),
    );
  });

  it("discovers models from stateless connection input when credentialRef is unavailable", async () => {
    const adapter = makeAdapter({
      authType: "api_key",
      apiKey: "bridge-control-plane-placeholder",
    });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5" }],
      }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    const models = await adapter.discoverModels({
      providerId: CLAUDE_SUBSCRIPTION_MANIFEST.providerId,
      methodId: "anthropic.api_key",
      credentialRef: "credref.missing",
      endpointProfile: {},
      correlationId: "corr-stateless-discover",
      connectionInput: {
        apiKey: "sk-live",
        endpointProfile: { baseUrl: "https://api.anthropic.com" },
      },
    } as unknown as Parameters<ClaudeSubscriptionAdapter["discoverModels"]>[0]);
    expect(models).toEqual([
      expect.objectContaining({ id: "claude-sonnet-4-5", displayName: "Claude Sonnet 4.5" }),
    ]);
    const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = requestInit?.headers as Record<string, string> | undefined;
    expect(headers?.["x-api-key"]).toBe("sk-live");
  });
});

describe("ClaudeSubscriptionAdapter – describeCapabilities", () => {
  it("returns capabilities matching manifest", () => {
    expect(makeAdapter().describeCapabilities()).toEqual(
      CLAUDE_SUBSCRIPTION_MANIFEST.capabilities,
    );
  });
});

describe("ClaudeSubscriptionAdapter – listModels", () => {
  it("returns a non-empty list of known models", async () => {
    const models = await makeAdapter().listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => typeof m === "string")).toBe(true);
  });

  it("includes at least one claude model", async () => {
    const models = await makeAdapter().listModels();
    expect(models.some((m) => m.includes("claude"))).toBe(true);
  });
});

describe("ClaudeSubscriptionAdapter – healthCheck", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when API is reachable (2xx)", async () => {
    vi.stubGlobal("fetch", makeOkFetch({}));
    expect(await makeAdapter().healthCheck()).toBe(true);
  });

  it("returns false when API is unreachable (ECONNREFUSED)", async () => {
    vi.stubGlobal("fetch", makeNetworkErrorFetch("ECONNREFUSED"));
    expect(await makeAdapter().healthCheck()).toBe(false);
  });

  it("returns false on 5xx response", async () => {
    vi.stubGlobal("fetch", makeErrorFetch(500));
    expect(await makeAdapter().healthCheck()).toBe(false);
  });

  it("returns true on 404 (endpoint not found but service is up)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}), text: async () => "" }),
    );
    expect(await makeAdapter().healthCheck()).toBe(true);
  });
});

describe("ClaudeSubscriptionAdapter – createSession", () => {
  it("returns a non-empty string session ID", async () => {
    const id = await makeAdapter().createSession();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns unique IDs", async () => {
    const adapter = makeAdapter();
    const [a, b] = await Promise.all([adapter.createSession(), adapter.createSession()]);
    expect(a).not.toBe(b);
  });

  it("accepts a model option", async () => {
    const id = await makeAdapter().createSession({ model: "claude-opus-4-5" });
    expect(typeof id).toBe("string");
  });
});

describe("ClaudeSubscriptionAdapter – sendMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns text content from response", async () => {
    const adapter = makeAdapter();
    const sessionId = await adapter.createSession();
    vi.stubGlobal(
      "fetch",
      makeOkFetch({
        content: [{ type: "text", text: "Hi there!" }],
        stop_reason: "end_turn",
      }),
    );
    const reply = await adapter.sendMessage(sessionId, "hello");
    expect(reply).toBe("Hi there!");
  });

  it("uses session connection input auth when provided", async () => {
    const adapter = makeAdapter({
      authType: "api_key",
      apiKey: "bridge-control-plane-placeholder",
    });
    const sessionId = await adapter.createSession({
      model: "claude-sonnet-4-5",
      methodId: "anthropic.api_key",
      connectionInput: {
        apiKey: "sk-live",
        endpointProfile: { baseUrl: "https://api.anthropic.com" },
      },
    });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text: "Hi there!" }],
      }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    await adapter.sendMessage(sessionId, "hello");

    const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = requestInit?.headers as Record<string, string> | undefined;
    expect(headers?.["x-api-key"]).toBe("sk-live");
  });

  it("throws TransientNetworkError for unknown session", async () => {
    await expect(
      makeAdapter().sendMessage("no-session", "hello"),
    ).rejects.toBeInstanceOf(TransientNetworkError);
  });

  it("maps HTTP 401 to AuthError", async () => {
    const adapter = makeAdapter();
    const sessionId = await adapter.createSession();
    vi.stubGlobal("fetch", makeErrorFetch(401, "authentication_error", "invalid api key"));
    await expect(adapter.sendMessage(sessionId, "hello")).rejects.toBeInstanceOf(AuthError);
  });

  it("maps HTTP 403 to PermissionError", async () => {
    const adapter = makeAdapter();
    const sessionId = await adapter.createSession();
    vi.stubGlobal("fetch", makeErrorFetch(403, "permission_error", "forbidden"));
    await expect(adapter.sendMessage(sessionId, "hello")).rejects.toBeInstanceOf(PermissionError);
  });

  it("maps HTTP 429 to TransientNetworkError", async () => {
    const adapter = makeAdapter();
    const sessionId = await adapter.createSession();
    vi.stubGlobal("fetch", makeErrorFetch(429, "rate_limit_error", "rate limit exceeded"));
    await expect(adapter.sendMessage(sessionId, "hello")).rejects.toBeInstanceOf(
      TransientNetworkError,
    );
  });

  it("maps HTTP 500 to ProviderUnavailableError", async () => {
    const adapter = makeAdapter();
    const sessionId = await adapter.createSession();
    vi.stubGlobal("fetch", makeErrorFetch(500, "api_error", "server error"));
    await expect(adapter.sendMessage(sessionId, "hello")).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it("maps HTTP 529 (overloaded) to ProviderUnavailableError", async () => {
    const adapter = makeAdapter();
    const sessionId = await adapter.createSession();
    vi.stubGlobal("fetch", makeErrorFetch(529, "overloaded_error", "overloaded"));
    await expect(adapter.sendMessage(sessionId, "hello")).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it("maps ECONNREFUSED to ProviderUnavailableError", async () => {
    const adapter = makeAdapter();
    const sessionId = await adapter.createSession();
    vi.stubGlobal("fetch", makeNetworkErrorFetch("ECONNREFUSED"));
    await expect(adapter.sendMessage(sessionId, "hello")).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it("maps ETIMEDOUT to TimeoutError", async () => {
    const adapter = makeAdapter();
    const sessionId = await adapter.createSession();
    vi.stubGlobal("fetch", makeNetworkErrorFetch("ETIMEDOUT"));
    await expect(adapter.sendMessage(sessionId, "hello")).rejects.toBeInstanceOf(TimeoutError);
  });

  it("all mapped errors are ProtocolErrors", async () => {
    const adapter = makeAdapter();
    const sessionId = await adapter.createSession();
    vi.stubGlobal("fetch", makeNetworkErrorFetch("ECONNREFUSED"));
    let caught: unknown;
    try {
      await adapter.sendMessage(sessionId, "hello");
    } catch (e) {
      caught = e;
    }
    expect(isProtocolError(caught)).toBe(true);
  });

  it("works with oauth2 auth config", async () => {
    const adapter = makeAdapter(OAUTH_AUTH);
    const sessionId = await adapter.createSession();
    vi.stubGlobal(
      "fetch",
      makeOkFetch({ content: [{ type: "text", text: "Hello OAuth!" }] }),
    );
    const reply = await adapter.sendMessage(sessionId, "hi");
    expect(reply).toBe("Hello OAuth!");
  });
});

describe("ClaudeSubscriptionAdapter – streamMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws TransientNetworkError for unknown session", async () => {
    await expect(
      makeAdapter().streamMessage("no-session", "hi", () => undefined),
    ).rejects.toBeInstanceOf(TransientNetworkError);
  });

  it("calls onChunk with SSE content_block_delta events", async () => {
    const adapter = makeAdapter();
    const sessionId = await adapter.createSession();

    const events = [
      `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } })}\n\n`,
      `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " world" } })}\n\n`,
      `data: ${JSON.stringify({ type: "message_stop" })}\n\n`,
    ].join("");

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(events) })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      releaseLock: vi.fn(),
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: { getReader: () => mockReader },
      }),
    );

    const received: string[] = [];
    await adapter.streamMessage(sessionId, "hello", (c) => received.push(c));
    expect(received).toEqual(["Hello", " world"]);
  });

  it("maps ECONNREFUSED to ProviderUnavailableError during stream", async () => {
    const adapter = makeAdapter();
    const sessionId = await adapter.createSession();
    vi.stubGlobal("fetch", makeNetworkErrorFetch("ECONNREFUSED"));
    await expect(
      adapter.streamMessage(sessionId, "hello", () => undefined),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});

describe("ClaudeSubscriptionAdapter – shutdown", () => {
  it("resolves without throwing", async () => {
    await expect(makeAdapter().shutdown()).resolves.toBeUndefined();
  });

  it("clears sessions so subsequent calls throw TransientNetworkError", async () => {
    const adapter = makeAdapter();
    const sessionId = await adapter.createSession();
    await adapter.shutdown();
    await expect(adapter.sendMessage(sessionId, "test")).rejects.toBeInstanceOf(
      TransientNetworkError,
    );
  });
});
