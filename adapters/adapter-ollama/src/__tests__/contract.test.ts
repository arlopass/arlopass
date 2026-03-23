import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MANIFEST_SCHEMA_VERSION } from "@byom-ai/adapter-runtime";
import {
  AuthError,
  ProviderUnavailableError,
  TimeoutError,
  TransientNetworkError,
  isProtocolError,
} from "@byom-ai/protocol";

import { OllamaAdapter, OLLAMA_MANIFEST } from "../index.js";

function makeOkFetch(body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

function makeErrorFetch(status: number, body = ""): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
  }) as unknown as typeof fetch;
}

function makeNetworkErrorFetch(code: string): typeof fetch {
  const err = Object.assign(new Error(`connect ${code}`), { code });
  return vi.fn().mockRejectedValue(err) as unknown as typeof fetch;
}

describe("OllamaAdapter – manifest", () => {
  it("exports OLLAMA_MANIFEST with correct schema version", () => {
    expect(OLLAMA_MANIFEST.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
  });

  it("has providerId ollama", () => {
    expect(OLLAMA_MANIFEST.providerId).toBe("ollama");
  });

  it("uses auth type none", () => {
    expect(OLLAMA_MANIFEST.authType).toBe("none");
  });

  it("includes chat.completions and chat.stream capabilities", () => {
    expect(OLLAMA_MANIFEST.capabilities).toContain("chat.completions");
    expect(OLLAMA_MANIFEST.capabilities).toContain("chat.stream");
  });

  it("declares network.egress permission", () => {
    expect(OLLAMA_MANIFEST.requiredPermissions).toContain("network.egress");
  });

  it("has low risk level", () => {
    expect(OLLAMA_MANIFEST.riskLevel).toBe("low");
  });
});

describe("OllamaAdapter – interface compliance", () => {
  let adapter: OllamaAdapter;

  beforeEach(() => {
    adapter = new OllamaAdapter();
  });

  it("exposes manifest property matching OLLAMA_MANIFEST", () => {
    expect(adapter.manifest).toBe(OLLAMA_MANIFEST);
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

describe("OllamaAdapter – describeCapabilities", () => {
  it("returns the same capabilities as manifest", () => {
    const adapter = new OllamaAdapter();
    expect(adapter.describeCapabilities()).toEqual(OLLAMA_MANIFEST.capabilities);
  });

  it("returns at least one capability", () => {
    const caps = new OllamaAdapter().describeCapabilities();
    expect(caps.length).toBeGreaterThan(0);
  });
});

describe("OllamaAdapter – healthCheck", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when server responds ok", async () => {
    vi.stubGlobal("fetch", makeOkFetch({ version: "0.1.0" }));
    const result = await new OllamaAdapter().healthCheck();
    expect(result).toBe(true);
  });

  it("returns false when server is unreachable (ECONNREFUSED)", async () => {
    vi.stubGlobal("fetch", makeNetworkErrorFetch("ECONNREFUSED"));
    const result = await new OllamaAdapter().healthCheck();
    expect(result).toBe(false);
  });

  it("returns false when server returns a non-ok status", async () => {
    vi.stubGlobal("fetch", makeErrorFetch(500));
    const result = await new OllamaAdapter().healthCheck();
    expect(result).toBe(false);
  });
});

describe("OllamaAdapter – listModels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns model names from response", async () => {
    vi.stubGlobal(
      "fetch",
      makeOkFetch({ models: [{ name: "llama3.2" }, { name: "mistral" }] }),
    );
    const models = await new OllamaAdapter().listModels();
    expect(models).toEqual(["llama3.2", "mistral"]);
  });

  it("returns empty array when models field is absent", async () => {
    vi.stubGlobal("fetch", makeOkFetch({}));
    const models = await new OllamaAdapter().listModels();
    expect(models).toEqual([]);
  });

  it("maps ECONNREFUSED to ProviderUnavailableError", async () => {
    vi.stubGlobal("fetch", makeNetworkErrorFetch("ECONNREFUSED"));
    await expect(new OllamaAdapter().listModels()).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it("maps ENOTFOUND to ProviderUnavailableError", async () => {
    vi.stubGlobal("fetch", makeNetworkErrorFetch("ENOTFOUND"));
    await expect(new OllamaAdapter().listModels()).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it("maps ETIMEDOUT to TimeoutError", async () => {
    vi.stubGlobal("fetch", makeNetworkErrorFetch("ETIMEDOUT"));
    await expect(new OllamaAdapter().listModels()).rejects.toBeInstanceOf(TimeoutError);
  });

  it("maps HTTP 500 to ProviderUnavailableError", async () => {
    vi.stubGlobal("fetch", makeErrorFetch(500, "Internal Server Error"));
    await expect(new OllamaAdapter().listModels()).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it("maps HTTP 401 to AuthError", async () => {
    vi.stubGlobal("fetch", makeErrorFetch(401, "Unauthorized"));
    await expect(new OllamaAdapter().listModels()).rejects.toBeInstanceOf(AuthError);
  });

  it("maps HTTP 429 to TransientNetworkError", async () => {
    vi.stubGlobal("fetch", makeErrorFetch(429, "Too Many Requests"));
    await expect(new OllamaAdapter().listModels()).rejects.toBeInstanceOf(
      TransientNetworkError,
    );
  });

  it("all mapped errors are ProtocolErrors", async () => {
    vi.stubGlobal("fetch", makeNetworkErrorFetch("ECONNREFUSED"));
    let caught: unknown;
    try {
      await new OllamaAdapter().listModels();
    } catch (e) {
      caught = e;
    }
    expect(isProtocolError(caught)).toBe(true);
  });
});

describe("OllamaAdapter – createSession", () => {
  it("returns a non-empty string session ID", async () => {
    const id = await new OllamaAdapter().createSession();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns unique IDs for multiple sessions", async () => {
    const adapter = new OllamaAdapter();
    const [a, b] = await Promise.all([adapter.createSession(), adapter.createSession()]);
    expect(a).not.toBe(b);
  });

  it("accepts a model option", async () => {
    const id = await new OllamaAdapter().createSession({ model: "mistral" });
    expect(typeof id).toBe("string");
  });
});

describe("OllamaAdapter – sendMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns assistant content from response", async () => {
    const adapter = new OllamaAdapter();
    const sessionId = await adapter.createSession();
    vi.stubGlobal("fetch", makeOkFetch({ message: { content: "Hello!" } }));
    const reply = await adapter.sendMessage(sessionId, "hi");
    expect(reply).toBe("Hello!");
  });

  it("throws TransientNetworkError for unknown session", async () => {
    await expect(
      new OllamaAdapter().sendMessage("nonexistent-session", "hello"),
    ).rejects.toBeInstanceOf(TransientNetworkError);
  });

  it("maps ECONNREFUSED to ProviderUnavailableError", async () => {
    const adapter = new OllamaAdapter();
    const sessionId = await adapter.createSession();
    vi.stubGlobal("fetch", makeNetworkErrorFetch("ECONNREFUSED"));
    await expect(adapter.sendMessage(sessionId, "hello")).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it("maps HTTP 401 to AuthError", async () => {
    const adapter = new OllamaAdapter();
    const sessionId = await adapter.createSession();
    vi.stubGlobal("fetch", makeErrorFetch(401));
    await expect(adapter.sendMessage(sessionId, "hello")).rejects.toBeInstanceOf(AuthError);
  });

  it("maps HTTP 503 to ProviderUnavailableError", async () => {
    const adapter = new OllamaAdapter();
    const sessionId = await adapter.createSession();
    vi.stubGlobal("fetch", makeErrorFetch(503));
    await expect(adapter.sendMessage(sessionId, "hello")).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });
});

describe("OllamaAdapter – streamMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws TransientNetworkError for unknown session", async () => {
    await expect(
      new OllamaAdapter().streamMessage("no-such-session", "hi", () => undefined),
    ).rejects.toBeInstanceOf(TransientNetworkError);
  });

  it("calls onChunk with each streamed token", async () => {
    const adapter = new OllamaAdapter();
    const sessionId = await adapter.createSession();

    const chunks = ["Hello", " world", "!"];
    const ndjson = [
      ...chunks.map((c) => JSON.stringify({ message: { content: c }, done: false })),
      JSON.stringify({ done: true }),
    ].join("\n");

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(ndjson + "\n") })
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
    expect(received).toEqual(chunks);
  });

  it("maps ECONNREFUSED to ProviderUnavailableError during stream", async () => {
    const adapter = new OllamaAdapter();
    const sessionId = await adapter.createSession();
    vi.stubGlobal("fetch", makeNetworkErrorFetch("ECONNREFUSED"));
    await expect(
      adapter.streamMessage(sessionId, "hello", () => undefined),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});

describe("OllamaAdapter – shutdown", () => {
  it("resolves without throwing", async () => {
    await expect(new OllamaAdapter().shutdown()).resolves.toBeUndefined();
  });

  it("clears sessions so subsequent sendMessage throws TransientNetworkError", async () => {
    const adapter = new OllamaAdapter();
    const sessionId = await adapter.createSession();
    await adapter.shutdown();
    await expect(adapter.sendMessage(sessionId, "test")).rejects.toBeInstanceOf(
      TransientNetworkError,
    );
  });
});
