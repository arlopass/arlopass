import { EventEmitter } from "node:events";
import type { ChildProcess, spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import { CopilotCliChatExecutor } from "../cli/copilot-chat-executor.js";

type MockChildProcess = ChildProcess & {
  stdout: PassThrough;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
  exitCode: number | null;
};

function createMockChildProcess(): MockChildProcess {
  const child = new EventEmitter() as unknown as MockChildProcess;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn(() => true);
  child.exitCode = null;
  return child;
}

function makeRequest(overrides: Partial<{
  correlationId: string;
  providerId: string;
  modelId: string;
  sessionId: string;
  cliType: string;
  thinkingLevel: string;
  timeoutMs: number;
}> = {}) {
  return {
    correlationId: overrides.correlationId ?? "corr.test.001",
    providerId: overrides.providerId ?? "provider.cli",
    modelId: overrides.modelId ?? "gpt-5.3-codex",
    ...(overrides.sessionId !== undefined ? { sessionId: overrides.sessionId } : {}),
    ...(overrides.cliType !== undefined ? { cliType: overrides.cliType } : {}),
    ...(overrides.thinkingLevel !== undefined ? { thinkingLevel: overrides.thinkingLevel } : {}),
    messages: [{ role: "user", content: "hello" }] as const,
    ...(overrides.timeoutMs !== undefined ? { timeoutMs: overrides.timeoutMs } : {}),
  };
}

describe("CopilotCliChatExecutor", () => {
  it("executes CLI and returns assistant content from JSONL output", async () => {
    const child = createMockChildProcess();
    const spawnFn = vi.fn(() => child) as unknown as typeof spawn;
    const executor = new CopilotCliChatExecutor({ spawnFn, command: "copilot" });

    const execution = executor.execute(makeRequest());
    await vi.waitFor(() => (spawnFn as unknown as { mock: { calls: unknown[] } }).mock.calls.length === 1);
    const args = (spawnFn as unknown as { mock: { calls: Array<[string, string[]]> } }).mock.calls[0]?.[1] ?? [];
    expect(args).toContain("--available-tools");
    expect(args).toContain("--disable-builtin-mcps");
    expect(args).toContain("--model");
    expect(args).toContain("gpt-5.3-codex");

    child.stdout.emit("data", Buffer.from('{"type":"assistant.message","data":{"content":"Bridge reply"}}\n'));
    child.emit("close", 0, null);

    const result = await execution;
    expect(result.content).toBe("Bridge reply");
    expect(result.correlationId).toBe("corr.test.001");
  });

  it("returns provider.unavailable when output has no assistant message", async () => {
    const child = createMockChildProcess();
    const spawnFn = vi.fn(() => child) as unknown as typeof spawn;
    const executor = new CopilotCliChatExecutor({ spawnFn });

    const execution = executor.execute(makeRequest());
    child.stdout.emit("data", Buffer.from('{"type":"session.mcp_servers_loaded","data":{}}\n'));
    child.emit("close", 0, null);

    await expect(execution).rejects.toMatchObject({
      reasonCode: "provider.unavailable",
    });
  });

  it("returns transport.timeout when CLI execution exceeds timeout", async () => {
    vi.useFakeTimers();
    try {
      const child = createMockChildProcess();
      const spawnFn = vi.fn(() => child) as unknown as typeof spawn;
      const executor = new CopilotCliChatExecutor({ spawnFn });

      const execution = executor.execute(makeRequest({ timeoutMs: 5_000 }));
      const assertion = expect(execution).rejects.toMatchObject({
        reasonCode: "transport.timeout",
      });
      await vi.advanceTimersByTimeAsync(5_001);
      await assertion;
      expect(child.kill).toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("enforces concurrency cap with transient failure", async () => {
    const child = createMockChildProcess();
    const spawnFn = vi.fn(() => child) as unknown as typeof spawn;
    const executor = new CopilotCliChatExecutor({
      spawnFn,
      maxConcurrent: 1,
    });

    const firstExecution = executor.execute(makeRequest());
    await vi.waitFor(() => (spawnFn as unknown as { mock: { calls: unknown[] } }).mock.calls.length === 1);

    await expect(
      executor.execute(makeRequest({ correlationId: "corr.test.002" })),
    ).rejects.toMatchObject({
      reasonCode: "transport.transient_failure",
    });

    child.stdout.emit("data", Buffer.from('{"type":"assistant.message","data":{"content":"done"}}\n'));
    child.emit("close", 0, null);
    await firstExecution;
    expect((spawnFn as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
  });

  it("routes claude-code requests to claude command profile", async () => {
    const child = createMockChildProcess();
    const spawnFn = vi.fn(() => child) as unknown as typeof spawn;
    const executor = new CopilotCliChatExecutor({
      spawnFn,
      command: "copilot",
      claudeCommand: "claude",
      resolveCommandFromPath: () => undefined,
    });

    const execution = executor.execute(
      makeRequest({
        cliType: "claude-code",
        modelId: "claude-sonnet-4-5",
      }),
    );
    await vi.waitFor(() => (spawnFn as unknown as { mock: { calls: unknown[] } }).mock.calls.length === 1);
    const spawnCommand = (spawnFn as unknown as { mock: { calls: Array<[string, string[]]> } }).mock.calls[0]?.[0];
    const args = (spawnFn as unknown as { mock: { calls: Array<[string, string[]]> } }).mock.calls[0]?.[1] ?? [];
    expect(spawnCommand).toBe("claude");
    expect(args).toContain("--model");
    expect(args).toContain("claude-sonnet-4-5");
    expect(args).not.toContain("--disable-builtin-mcps");

    child.stdout.emit("data", Buffer.from('{"result":"Claude response"}\n'));
    child.emit("close", 0, null);

    const result = await execution;
    expect(result.content).toBe("Claude response");
  });

  it("passes thinking-level flag for copilot requests when provided", async () => {
    const child = createMockChildProcess();
    const spawnFn = vi.fn(() => child) as unknown as typeof spawn;
    const executor = new CopilotCliChatExecutor({
      spawnFn,
      command: "copilot",
    });

    const execution = executor.execute(
      makeRequest({
        thinkingLevel: "xhigh",
      }),
    );
    await vi.waitFor(() => (spawnFn as unknown as { mock: { calls: unknown[] } }).mock.calls.length === 1);
    const args = (spawnFn as unknown as { mock: { calls: Array<[string, string[]]> } }).mock.calls[0]?.[1] ?? [];
    expect(args).toContain("--thinking-level");
    expect(args).toContain("xhigh");
    expect(args).toContain("--disable-builtin-mcps");

    child.stdout.emit("data", Buffer.from('{"type":"assistant.message","data":{"content":"done"}}\n'));
    child.emit("close", 0, null);
    await execution;
  });

  it("uses --continue for subsequent requests within the same session", async () => {
    const firstChild = createMockChildProcess();
    const secondChild = createMockChildProcess();
    const spawnFn = vi
      .fn()
      .mockReturnValueOnce(firstChild)
      .mockReturnValueOnce(secondChild) as unknown as typeof spawn;
    const executor = new CopilotCliChatExecutor({
      spawnFn,
      command: "copilot",
    });

    const firstExecution = executor.execute(
      makeRequest({
        sessionId: "sess.cli.001",
      }),
    );
    await vi.waitFor(
      () => (spawnFn as unknown as { mock: { calls: unknown[] } }).mock.calls.length === 1,
    );
    const firstArgs = (spawnFn as unknown as { mock: { calls: Array<[string, string[]]> } })
      .mock.calls[0]?.[1] ?? [];
    expect(firstArgs).not.toContain("--continue");
    firstChild.stdout.emit("data", Buffer.from('{"type":"assistant.message","data":{"content":"done"}}\n'));
    firstChild.emit("close", 0, null);
    await firstExecution;

    const secondExecution = executor.execute(
      makeRequest({
        correlationId: "corr.test.002",
        sessionId: "sess.cli.001",
      }),
    );
    await vi.waitFor(
      () => (spawnFn as unknown as { mock: { calls: unknown[] } }).mock.calls.length === 2,
    );
    const secondArgs = (spawnFn as unknown as { mock: { calls: Array<[string, string[]]> } })
      .mock.calls[1]?.[1] ?? [];
    expect(secondArgs).toContain("--continue");
    secondChild.stdout.emit("data", Buffer.from('{"type":"assistant.message","data":{"content":"done2"}}\n'));
    secondChild.emit("close", 0, null);
    await secondExecution;
  });

  it("uses --resume=<sessionId> when session metadata is available", async () => {
    const firstChild = createMockChildProcess();
    const secondChild = createMockChildProcess();
    const spawnFn = vi
      .fn()
      .mockReturnValueOnce(firstChild)
      .mockReturnValueOnce(secondChild) as unknown as typeof spawn;
    const executor = new CopilotCliChatExecutor({
      spawnFn,
      command: "copilot",
    });

    const firstExecution = executor.execute(
      makeRequest({
        sessionId: "sess.cli.resume.001",
      }),
    );
    await vi.waitFor(
      () => (spawnFn as unknown as { mock: { calls: unknown[] } }).mock.calls.length === 1,
    );
    firstChild.stdout.emit(
      "data",
      Buffer.from(
        '{"type":"assistant.message","data":{"content":"done"}}\n{"type":"result","sessionId":"copilot-session-abc"}\n',
      ),
    );
    firstChild.emit("close", 0, null);
    await firstExecution;

    const secondExecution = executor.execute(
      makeRequest({
        correlationId: "corr.test.resume.002",
        sessionId: "sess.cli.resume.001",
      }),
    );
    await vi.waitFor(
      () => (spawnFn as unknown as { mock: { calls: unknown[] } }).mock.calls.length === 2,
    );
    const secondArgs = (spawnFn as unknown as { mock: { calls: Array<[string, string[]]> } })
      .mock.calls[1]?.[1] ?? [];
    expect(secondArgs.some((arg) => arg.startsWith("--resume="))).toBe(true);
    expect(secondArgs).not.toContain("--continue");
    secondChild.stdout.emit("data", Buffer.from('{"type":"assistant.message","data":{"content":"done2"}}\n'));
    secondChild.emit("close", 0, null);
    await secondExecution;
  });

  it("retries without --continue when CLI rejects the flag", async () => {
    const spawnFn = vi.fn((_command: string, args: string[]) => {
      const child = createMockChildProcess();
      queueMicrotask(() => {
        if (args.includes("--continue")) {
          child.stderr.emit(
            "data",
            Buffer.from("error: unknown option '--continue'\n"),
          );
          child.emit("close", 1, null);
          return;
        }

        child.stdout.emit(
          "data",
          Buffer.from('{"type":"assistant.message","data":{"content":"fallback"}}\n'),
        );
        child.emit("close", 0, null);
      });
      return child;
    }) as unknown as typeof spawn;
    const executor = new CopilotCliChatExecutor({
      spawnFn,
      command: "copilot",
    });

    await executor.execute(
      makeRequest({
        correlationId: "corr.seed.001",
        sessionId: "sess.cli.002",
      }),
    );
    const result = await executor.execute(
      makeRequest({
        correlationId: "corr.test.003",
        sessionId: "sess.cli.002",
      }),
    );
    const calls = (spawnFn as unknown as { mock: { calls: Array<[string, string[]]> } }).mock.calls;
    const firstAttemptArgs = calls[1]?.[1] ?? [];
    expect(firstAttemptArgs).toContain("--continue");
    const fallbackArgs = calls[2]?.[1] ?? [];
    expect(fallbackArgs).not.toContain("--continue");
    expect(result.content).toBe("fallback");
  });

  it("resolves Windows command extension fallback after ENOENT", async () => {
    if (process.platform !== "win32") {
      return;
    }

    const spawnFn = vi.fn((command: string) => {
      const child = createMockChildProcess();
      queueMicrotask(() => {
        if (command === "claude") {
          const error = new Error("spawn claude ENOENT") as NodeJS.ErrnoException;
          error.code = "ENOENT";
          child.emit("error", error);
          return;
        }
        child.stdout.emit("data", Buffer.from('{"result":"Claude response"}\n'));
        child.emit("close", 0, null);
      });
      return child;
    }) as unknown as typeof spawn;

    const executor = new CopilotCliChatExecutor({
      spawnFn,
      claudeCommand: "claude",
      resolveCommandFromPath: () => undefined,
    });

    const result = await executor.execute(
      makeRequest({
        cliType: "claude-code",
        modelId: "claude-sonnet-4-5",
      }),
    );
    expect(result.content).toBe("Claude response");
    const calls = (spawnFn as unknown as { mock: { calls: Array<[string, string[]]> } }).mock.calls;
    const commands = calls.map((call) => call[0]);
    expect(commands[0]).toBe("claude");
    expect(commands[1]).toBe("cmd.exe");
    expect(calls[1]?.[1]?.join(" ")).toContain("claude.cmd");
  });

  it("resolves bare claude command via custom resolver before adding suffixes", async () => {
    if (process.platform !== "win32") {
      return;
    }

    const spawnFn = vi.fn((command: string) => {
      const child = createMockChildProcess();
      queueMicrotask(() => {
        if (command === "claude") {
          const error = new Error("spawn claude ENOENT") as NodeJS.ErrnoException;
          error.code = "ENOENT";
          child.emit("error", error);
          return;
        }

        child.stdout.emit("data", Buffer.from('{"result":"Claude response"}\n'));
        child.emit("close", 0, null);
      });
      return child;
    }) as unknown as typeof spawn;

    const executor = new CopilotCliChatExecutor({
      spawnFn,
      claudeCommand: "claude",
      resolveCommandFromPath: () => "C:\\mock-bin\\claude.cmd",
    });

    const result = await executor.execute(
      makeRequest({
        cliType: "claude-code",
        modelId: "claude-sonnet-4-5",
      }),
    );
    expect(result.content).toBe("Claude response");
    const calls = (spawnFn as unknown as { mock: { calls: Array<[string, string[]]> } }).mock.calls;
    expect(calls[0]?.[0]).toBe("cmd.exe");
    expect(calls[0]?.[1]?.join(" ")).toContain("C:\\mock-bin\\claude.cmd");
  });

  it("prefers discovered copilot model catalog when available", async () => {
    const child = createMockChildProcess();
    const spawnFn = vi.fn(() => child) as unknown as typeof spawn;
    const executor = new CopilotCliChatExecutor({
      spawnFn,
      command: "copilot",
    });

    const listing = executor.listModels({ cliType: "copilot-cli" });
    await vi.waitFor(() => (spawnFn as unknown as { mock: { calls: unknown[] } }).mock.calls.length === 1);
    child.stdout.emit("data", Buffer.from('{"models":[{"id":"gpt-5.3-codex"},{"id":"gpt-5.2"}]}\n'));
    child.emit("close", 0, null);

    const result = await listing;
    expect(result.source).toBe("discovered");
    expect(result.models.some((model) => model.id === "gpt-5.3-codex")).toBe(true);
  });

  it("lists discovered models for claude profile", async () => {
    const child = createMockChildProcess();
    const spawnFn = vi.fn(() => child) as unknown as typeof spawn;
    const executor = new CopilotCliChatExecutor({
      spawnFn,
      claudeCommand: "claude",
    });

    const listing = executor.listModels({ cliType: "claude-code" });
    await vi.waitFor(() => (spawnFn as unknown as { mock: { calls: unknown[] } }).mock.calls.length === 1);
    child.stdout.emit("data", Buffer.from('{"models":[{"id":"claude-sonnet-4-5"}]}\n'));
    child.emit("close", 0, null);

    const result = await listing;
    expect(result.cliType).toBe("claude-code");
    expect(result.source).toBe("discovered");
    expect(result.models.some((model) => model.id === "claude-sonnet-4-5")).toBe(true);
  });

  it("returns thinking levels discovered from CLI help output", async () => {
    const child = createMockChildProcess();
    const spawnFn = vi.fn(() => child) as unknown as typeof spawn;
    const executor = new CopilotCliChatExecutor({
      spawnFn,
      command: "copilot",
    });

    const listing = executor.listThinkingLevels({
      cliType: "copilot-cli",
      modelId: "gpt-5.3-codex",
    });
    await vi.waitFor(() => (spawnFn as unknown as { mock: { calls: unknown[] } }).mock.calls.length === 1);
    child.stdout.emit(
      "data",
      Buffer.from("  --thinking-level <low|med|high|xhigh>  Set reasoning depth\n"),
    );
    child.emit("close", 0, null);

    const result = await listing;
    expect(["discovered", "inferred"]).toContain(result.source);
    expect(result.thinkingLevels).toEqual(["low", "med", "high", "xhigh"]);
  });

  it("falls back to curated model list when discovery fails", async () => {
    const spawnFn = vi.fn(() => {
      const child = createMockChildProcess();
      queueMicrotask(() => {
        child.stderr.emit("data", Buffer.from("unknown command"));
        child.emit("close", 1, null);
      });
      return child;
    }) as unknown as typeof spawn;

    const executor = new CopilotCliChatExecutor({
      spawnFn,
      command: "copilot",
    });
    const result = await executor.listModels({ cliType: "copilot-cli" });

    expect(result.source).toBe("fallback");
    expect(result.models.some((model) => model.id === "gpt-5.3-codex")).toBe(true);
  });

  it("returns no thinking levels for unsupported CLI profiles", async () => {
    const executor = new CopilotCliChatExecutor();
    const result = await executor.listThinkingLevels({
      cliType: "claude-code",
      modelId: "claude-sonnet-4-5",
    });

    expect(result.source).toBe("none");
    expect(result.thinkingLevels).toEqual([]);
  });
});

