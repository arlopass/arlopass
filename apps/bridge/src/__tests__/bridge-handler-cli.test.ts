import { describe, expect, it, vi } from "vitest";

import { BridgeHandler } from "../bridge-handler.js";
import { CliChatExecutionError } from "../cli/copilot-chat-executor.js";
import { obtainSessionToken } from "./test-session-helper.js";

describe("BridgeHandler CLI execution dispatch", () => {
  it("returns cli.chat.result when executor succeeds", async () => {
    const cliChatExecutor = {
      execute: vi.fn(async () => ({
        correlationId: "corr.test.001",
        providerId: "provider.cli",
        modelId: "gpt-5.3-codex",
        content: "Bridge execution response",
        cliSessionId: "copilot-session-xyz",
      })),
      listModels: vi.fn(async () => ({
        cliType: "copilot-cli",
        source: "discovered" as const,
        models: [{ id: "gpt-5.3-codex", name: "GPT-5.3 Codex" }],
      })),
      listThinkingLevels: vi.fn(async () => ({
        cliType: "copilot-cli",
        modelId: "gpt-5.3-codex",
        source: "discovered" as const,
        thinkingLevels: ["low", "med", "high", "xhigh"],
      })),
    };
    const handler = new BridgeHandler({
      cliChatExecutor,
    });
    const sessionToken = await obtainSessionToken(handler);

    const response = await handler.handle({
      type: "cli.chat.execute",
      sessionToken,
      correlationId: "corr.test.001",
      providerId: "provider.cli",
      modelId: "gpt-5.3-codex",
      sessionId: "sess.test.001",
      resumeSessionId: "copilot-session-xyz",
      cliType: "copilot-cli",
      messages: [{ role: "user", content: "hello" }],
      timeoutMs: 10_000,
    });

    expect(cliChatExecutor.execute).toHaveBeenCalledTimes(1);
    expect(cliChatExecutor.execute).toHaveBeenCalledWith({
      correlationId: "corr.test.001",
      providerId: "provider.cli",
      modelId: "gpt-5.3-codex",
      sessionId: "sess.test.001",
      resumeSessionId: "copilot-session-xyz",
      cliType: "copilot-cli",
      messages: [{ role: "user", content: "hello" }],
      timeoutMs: 10_000,
    });
    expect(response).toMatchObject({
      type: "cli.chat.result",
      correlationId: "corr.test.001",
      providerId: "provider.cli",
      modelId: "gpt-5.3-codex",
      content: "Bridge execution response",
      cliSessionId: "copilot-session-xyz",
    });
  });

  it("maps executor errors to native error payload with reasonCode", async () => {
    const cliChatExecutor = {
      execute: vi.fn(async () => {
        throw new CliChatExecutionError("CLI timed out", {
          reasonCode: "transport.timeout",
          details: { timeoutMs: 30_000 },
        });
      }),
      listModels: vi.fn(async () => ({
        cliType: "copilot-cli",
        source: "discovered" as const,
        models: [{ id: "gpt-5.3-codex", name: "GPT-5.3 Codex" }],
      })),
      listThinkingLevels: vi.fn(async () => ({
        cliType: "copilot-cli",
        modelId: "gpt-5.3-codex",
        source: "discovered" as const,
        thinkingLevels: ["low", "med", "high", "xhigh"],
      })),
    };
    const handler = new BridgeHandler({
      cliChatExecutor,
    });
    const sessionToken = await obtainSessionToken(handler);

    const response = await handler.handle({
      type: "cli.chat.execute",
      sessionToken,
      correlationId: "corr.test.002",
      providerId: "provider.cli",
      modelId: "gpt-5.3-codex",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(response).toMatchObject({
      type: "error",
      reasonCode: "transport.timeout",
      message: "CLI timed out",
      correlationId: "corr.test.002",
    });
  });

  it("returns request.invalid for malformed cli.chat.execute payload", async () => {
    const cliChatExecutor = {
      execute: vi.fn(async () => ({
        correlationId: "corr.test.003",
        providerId: "provider.cli",
        modelId: "gpt-5.3-codex",
        content: "unused",
      })),
      listModels: vi.fn(async () => ({
        cliType: "copilot-cli",
        source: "discovered" as const,
        models: [{ id: "gpt-5.3-codex", name: "GPT-5.3 Codex" }],
      })),
      listThinkingLevels: vi.fn(async () => ({
        cliType: "copilot-cli",
        modelId: "gpt-5.3-codex",
        source: "discovered" as const,
        thinkingLevels: ["low", "med", "high", "xhigh"],
      })),
    };
    const handler = new BridgeHandler({
      cliChatExecutor,
    });
    const sessionToken = await obtainSessionToken(handler);

    const response = await handler.handle({
      type: "cli.chat.execute",
      sessionToken,
      correlationId: "corr.test.003",
      providerId: "provider.cli",
      modelId: "gpt-5.3-codex",
      // missing messages
    });

    expect(response).toMatchObject({
      type: "error",
      reasonCode: "request.invalid",
      correlationId: "corr.test.003",
    });
    expect(cliChatExecutor.execute).not.toHaveBeenCalled();
  });

  it("returns cli.models.list for requested cli type", async () => {
    const cliChatExecutor = {
      execute: vi.fn(),
      listModels: vi.fn(async () => ({
        cliType: "claude-code",
        source: "discovered" as const,
        models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }],
      })),
      listThinkingLevels: vi.fn(async () => ({
        cliType: "claude-code",
        modelId: "claude-sonnet-4-5",
        source: "none" as const,
        thinkingLevels: [],
      })),
    };
    const handler = new BridgeHandler({
      cliChatExecutor,
    });
    const sessionToken = await obtainSessionToken(handler);

    const response = await handler.handle({
      type: "cli.models.list",
      sessionToken,
      cliType: "claude-code",
    });

    expect(cliChatExecutor.listModels).toHaveBeenCalledWith({
      cliType: "claude-code",
    });
    expect(response).toMatchObject({
      type: "cli.models.list",
      cliType: "claude-code",
      source: "discovered",
      models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }],
    });
  });

  it("returns cli.thinking-levels.list for requested model", async () => {
    const cliChatExecutor = {
      execute: vi.fn(),
      listModels: vi.fn(async () => ({
        cliType: "copilot-cli",
        source: "discovered" as const,
        models: [{ id: "gpt-5.3-codex", name: "GPT-5.3 Codex" }],
      })),
      listThinkingLevels: vi.fn(async () => ({
        cliType: "copilot-cli",
        modelId: "gpt-5.3-codex",
        source: "discovered" as const,
        thinkingLevels: ["low", "med", "high", "xhigh"],
      })),
    };
    const handler = new BridgeHandler({
      cliChatExecutor,
    });
    const sessionToken = await obtainSessionToken(handler);

    const response = await handler.handle({
      type: "cli.thinking-levels.list",
      sessionToken,
      cliType: "copilot-cli",
      modelId: "gpt-5.3-codex",
    });

    expect(cliChatExecutor.listThinkingLevels).toHaveBeenCalledWith({
      cliType: "copilot-cli",
      modelId: "gpt-5.3-codex",
    });
    expect(response).toMatchObject({
      type: "cli.thinking-levels.list",
      cliType: "copilot-cli",
      modelId: "gpt-5.3-codex",
      source: "discovered",
      thinkingLevels: ["low", "med", "high", "xhigh"],
    });
  });
});

