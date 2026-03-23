import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MANIFEST_SCHEMA_VERSION } from "@byom-ai/adapter-runtime";
import {
  ProviderUnavailableError,
  TimeoutError,
  TransientNetworkError,
} from "@byom-ai/protocol";

import { LocalCliBridgeAdapter, LOCAL_CLI_BRIDGE_MANIFEST } from "../index.js";

// ── Mock process factory ─────────────────────────────────────────────────────

type MockStdin = { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };

type MockProcess = EventEmitter & {
  stdin: MockStdin;
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
};

function createMockProcess(): MockProcess {
  const base = new EventEmitter() as MockProcess;
  base.stdin = {
    write: vi.fn((_data: string, cb?: (err: Error | null) => void) => {
      cb?.(null);
      return true;
    }),
    end: vi.fn(),
  };
  base.stdout = new EventEmitter();
  base.stderr = new EventEmitter();
  base.kill = vi.fn(() => true);
  return base;
}

function sendResponse(proc: MockProcess, msg: object): void {
  proc.stdout.emit("data", Buffer.from(JSON.stringify(msg) + "\n", "utf8"));
}

function makeSpawnFn(proc: MockProcess) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return vi.fn().mockReturnValue(proc) as unknown as typeof import("node:child_process").spawn;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAdapter(proc: MockProcess, opts?: { timeoutMs?: number }): LocalCliBridgeAdapter {
  return new LocalCliBridgeAdapter({
    command: "/fake/cli",
    spawnFn: makeSpawnFn(proc),
    timeoutMs: opts?.timeoutMs ?? 5_000,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("LocalCliBridgeAdapter – manifest", () => {
  it("has correct schema version", () => {
    expect(LOCAL_CLI_BRIDGE_MANIFEST.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
  });

  it("has providerId local-cli-bridge", () => {
    expect(LOCAL_CLI_BRIDGE_MANIFEST.providerId).toBe("local-cli-bridge");
  });

  it("uses local auth type", () => {
    expect(LOCAL_CLI_BRIDGE_MANIFEST.authType).toBe("local");
  });

  it("includes chat.completions and chat.stream capabilities", () => {
    expect(LOCAL_CLI_BRIDGE_MANIFEST.capabilities).toContain("chat.completions");
    expect(LOCAL_CLI_BRIDGE_MANIFEST.capabilities).toContain("chat.stream");
  });

  it("declares process.spawn permission", () => {
    expect(LOCAL_CLI_BRIDGE_MANIFEST.requiredPermissions).toContain("process.spawn");
  });

  it("has empty egress rules (local only)", () => {
    expect(LOCAL_CLI_BRIDGE_MANIFEST.egressRules.length).toBe(0);
  });

  it("has medium risk level", () => {
    expect(LOCAL_CLI_BRIDGE_MANIFEST.riskLevel).toBe("medium");
  });
});

describe("LocalCliBridgeAdapter – interface compliance", () => {
  let proc: MockProcess;
  let adapter: LocalCliBridgeAdapter;

  beforeEach(() => {
    proc = createMockProcess();
    adapter = makeAdapter(proc);
  });

  it("exposes manifest matching LOCAL_CLI_BRIDGE_MANIFEST", () => {
    expect(adapter.manifest).toBe(LOCAL_CLI_BRIDGE_MANIFEST);
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

describe("LocalCliBridgeAdapter – describeCapabilities", () => {
  it("returns capabilities matching manifest", () => {
    const proc = createMockProcess();
    const adapter = makeAdapter(proc);
    expect(adapter.describeCapabilities()).toEqual(LOCAL_CLI_BRIDGE_MANIFEST.capabilities);
  });
});

describe("LocalCliBridgeAdapter – healthCheck", () => {
  it("returns true when process responds with pong", async () => {
    const proc = createMockProcess();
    const adapter = makeAdapter(proc);

    const promise = adapter.healthCheck();
    await vi.waitFor(() => proc.stdin.write.mock.calls.length > 0);
    const written = proc.stdin.write.mock.calls[0]?.[0] as string;
    const msg = JSON.parse(written.trim()) as { id: string; type: string };
    sendResponse(proc, { id: msg.id, type: "pong" });

    expect(await promise).toBe(true);
  });

  it("returns false when process errors", async () => {
    const spawnErr = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
    const adapter = new LocalCliBridgeAdapter({
      command: "/nonexistent",
      spawnFn: vi.fn().mockImplementation(() => { throw spawnErr; }) as unknown as typeof import("node:child_process").spawn,
    });
    expect(await adapter.healthCheck()).toBe(false);
  });

  it("returns false on timeout", async () => {
    const proc = createMockProcess();
    const adapter = makeAdapter(proc, { timeoutMs: 50 });
    // Do not send any response – let it time out
    expect(await adapter.healthCheck()).toBe(false);
  });
});

describe("LocalCliBridgeAdapter – listModels", () => {
  it("returns model list from CLI response", async () => {
    const proc = createMockProcess();
    const adapter = makeAdapter(proc);

    const promise = adapter.listModels();
    await vi.waitFor(() => proc.stdin.write.mock.calls.length > 0);
    const written = proc.stdin.write.mock.calls[0]?.[0] as string;
    const msg = JSON.parse(written.trim()) as { id: string; type: string };
    sendResponse(proc, { id: msg.id, type: "models", models: ["model-a", "model-b"] });

    const models = await promise;
    expect(models).toEqual(["model-a", "model-b"]);
  });

  it("returns empty array when CLI returns no models field", async () => {
    const proc = createMockProcess();
    const adapter = makeAdapter(proc);

    const promise = adapter.listModels();
    await vi.waitFor(() => proc.stdin.write.mock.calls.length > 0);
    const written = proc.stdin.write.mock.calls[0]?.[0] as string;
    const msg = JSON.parse(written.trim()) as { id: string };
    sendResponse(proc, { id: msg.id, type: "models" });

    const models = await promise;
    expect(models).toEqual([]);
  });

  it("maps spawn failure to ProviderUnavailableError", async () => {
    const spawnErr = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
    const adapter = new LocalCliBridgeAdapter({
      command: "/nonexistent",
      spawnFn: vi.fn().mockImplementation(() => { throw spawnErr; }) as unknown as typeof import("node:child_process").spawn,
    });
    await expect(adapter.listModels()).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("maps request timeout to TimeoutError", async () => {
    const proc = createMockProcess();
    const adapter = makeAdapter(proc, { timeoutMs: 50 });
    // Do not send response – let it time out
    await expect(adapter.listModels()).rejects.toBeInstanceOf(TimeoutError);
  });

  it("maps process exit during request to ProviderUnavailableError", async () => {
    const proc = createMockProcess();
    const adapter = makeAdapter(proc);

    const promise = adapter.listModels();
    await vi.waitFor(() => proc.stdin.write.mock.calls.length > 0);
    // Simulate unexpected process exit
    proc.emit("exit", 1, null);

    await expect(promise).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});

describe("LocalCliBridgeAdapter – createSession", () => {
  it("returns sessionId from CLI response", async () => {
    const proc = createMockProcess();
    const adapter = makeAdapter(proc);

    const promise = adapter.createSession();
    await vi.waitFor(() => proc.stdin.write.mock.calls.length > 0);
    const written = proc.stdin.write.mock.calls[0]?.[0] as string;
    const msg = JSON.parse(written.trim()) as { id: string };
    sendResponse(proc, { id: msg.id, type: "session", sessionId: "sess-abc" });

    const sessionId = await promise;
    expect(sessionId).toBe("sess-abc");
  });

  it("falls back to generated UUID when CLI does not return sessionId", async () => {
    const proc = createMockProcess();
    const adapter = makeAdapter(proc);

    const promise = adapter.createSession();
    await vi.waitFor(() => proc.stdin.write.mock.calls.length > 0);
    const written = proc.stdin.write.mock.calls[0]?.[0] as string;
    const msg = JSON.parse(written.trim()) as { id: string };
    sendResponse(proc, { id: msg.id, type: "session" });

    const sessionId = await promise;
    expect(typeof sessionId).toBe("string");
    expect(sessionId.length).toBeGreaterThan(0);
  });

  it("throws TransientNetworkError on CLI error response", async () => {
    const proc = createMockProcess();
    const adapter = makeAdapter(proc);

    const promise = adapter.createSession();
    await vi.waitFor(() => proc.stdin.write.mock.calls.length > 0);
    const written = proc.stdin.write.mock.calls[0]?.[0] as string;
    const msg = JSON.parse(written.trim()) as { id: string };
    sendResponse(proc, { id: msg.id, type: "error", error: "unsupported model" });

    await expect(promise).rejects.toBeInstanceOf(TransientNetworkError);
  });
});

describe("LocalCliBridgeAdapter – sendMessage", () => {
  it("returns content from CLI response", async () => {
    const proc = createMockProcess();
    const adapter = makeAdapter(proc);

    // First, create session
    const sessionPromise = adapter.createSession();
    await vi.waitFor(() => proc.stdin.write.mock.calls.length > 0);
    let written = proc.stdin.write.mock.calls[0]?.[0] as string;
    let msg = JSON.parse(written.trim()) as { id: string };
    sendResponse(proc, { id: msg.id, type: "session", sessionId: "sess-1" });
    const sessionId = await sessionPromise;

    // Then send message
    const msgPromise = adapter.sendMessage(sessionId, "Hello");
    await vi.waitFor(() => proc.stdin.write.mock.calls.length > 1);
    written = proc.stdin.write.mock.calls[1]?.[0] as string;
    msg = JSON.parse(written.trim()) as { id: string };
    sendResponse(proc, { id: msg.id, type: "response", content: "Hi there!" });

    expect(await msgPromise).toBe("Hi there!");
  });

  it("maps process error during send to ProviderUnavailableError", async () => {
    const proc = createMockProcess();
    const adapter = makeAdapter(proc);

    // Create session first
    const sessionPromise = adapter.createSession();
    await vi.waitFor(() => proc.stdin.write.mock.calls.length > 0);
    const written = proc.stdin.write.mock.calls[0]?.[0] as string;
    const msg = JSON.parse(written.trim()) as { id: string };
    sendResponse(proc, { id: msg.id, type: "session", sessionId: "sess-1" });
    const sessionId = await sessionPromise;

    // Now trigger error during sendMessage
    const sendPromise = adapter.sendMessage(sessionId, "hello");
    await vi.waitFor(() => proc.stdin.write.mock.calls.length > 1);
    proc.emit("error", new Error("broken pipe"));

    await expect(sendPromise).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});

describe("LocalCliBridgeAdapter – streamMessage", () => {
  it("calls onChunk for each chunk and resolves on stream_end", async () => {
    const proc = createMockProcess();
    const adapter = makeAdapter(proc);

    // Create session
    const sessionPromise = adapter.createSession();
    await vi.waitFor(() => proc.stdin.write.mock.calls.length > 0);
    let written = proc.stdin.write.mock.calls[0]?.[0] as string;
    let msg = JSON.parse(written.trim()) as { id: string };
    sendResponse(proc, { id: msg.id, type: "session", sessionId: "sess-stream" });
    const sessionId = await sessionPromise;

    // Stream message
    const received: string[] = [];
    const streamPromise = adapter.streamMessage(sessionId, "hi", (c) => received.push(c));
    await vi.waitFor(() => proc.stdin.write.mock.calls.length > 1);
    written = proc.stdin.write.mock.calls[1]?.[0] as string;
    msg = JSON.parse(written.trim()) as { id: string };

    // Send chunks followed by stream_end
    sendResponse(proc, { id: msg.id, type: "chunk", content: "Hello" });
    sendResponse(proc, { id: msg.id, type: "chunk", content: " world" });
    sendResponse(proc, { id: msg.id, type: "stream_end" });

    await streamPromise;
    expect(received).toEqual(["Hello", " world"]);
  });

  it("maps stream timeout to TimeoutError", async () => {
    const proc = createMockProcess();
    const adapter = makeAdapter(proc, { timeoutMs: 50 });

    const sessionPromise = adapter.createSession();
    await vi.waitFor(() => proc.stdin.write.mock.calls.length > 0);
    const written = proc.stdin.write.mock.calls[0]?.[0] as string;
    const msg = JSON.parse(written.trim()) as { id: string };
    sendResponse(proc, { id: msg.id, type: "session", sessionId: "sess-1" });
    const sessionId = await sessionPromise;

    // Do not send stream_end – let it time out
    await expect(
      adapter.streamMessage(sessionId, "hi", () => undefined),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it("maps CLI stream error response to TransientNetworkError", async () => {
    const proc = createMockProcess();
    const adapter = makeAdapter(proc);

    const sessionPromise = adapter.createSession();
    await vi.waitFor(() => proc.stdin.write.mock.calls.length > 0);
    let written = proc.stdin.write.mock.calls[0]?.[0] as string;
    let msg = JSON.parse(written.trim()) as { id: string };
    sendResponse(proc, { id: msg.id, type: "session", sessionId: "sess-1" });
    const sessionId = await sessionPromise;

    const streamPromise = adapter.streamMessage(sessionId, "hi", () => undefined);
    await vi.waitFor(() => proc.stdin.write.mock.calls.length > 1);
    written = proc.stdin.write.mock.calls[1]?.[0] as string;
    msg = JSON.parse(written.trim()) as { id: string };
    sendResponse(proc, { id: msg.id, type: "error", error: "model crashed" });

    await expect(streamPromise).rejects.toBeInstanceOf(TransientNetworkError);
  });
});

describe("LocalCliBridgeAdapter – shutdown", () => {
  it("resolves without throwing", async () => {
    const proc = createMockProcess();
    const adapter = makeAdapter(proc);

    const shutdownPromise = adapter.shutdown();
    // Process exit resolves the shutdown
    proc.emit("exit", 0, null);
    await expect(shutdownPromise).resolves.toBeUndefined();
  });

  it("throws ProviderUnavailableError on subsequent method calls", async () => {
    const proc = createMockProcess();
    const adapter = makeAdapter(proc);

    const shutdownPromise = adapter.shutdown();
    proc.emit("exit", 0, null);
    await shutdownPromise;

    await expect(adapter.listModels()).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});
