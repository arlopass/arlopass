import { describe, expect, it, vi } from "vitest";
import { ConversationManager } from "../conversation.js";
import type { ToolDefinition } from "../tools.js";
import type { ArlopassClient } from "../client.js";
import type { ChatSendResult, ChatStreamEvent } from "../types.js";

function mockToolClient(responses: string[]): ArlopassClient {
  let callIndex = 0;
  return {
    selectedProvider: { providerId: "test", modelId: "test-model" },
    chat: {
      send: async () => {
        const content = responses[callIndex++] ?? "No more responses";
        return {
          message: { role: "assistant" as const, content },
          correlationId: "corr.test",
        } satisfies ChatSendResult;
      },
      stream: async function* () {
        const content = responses[callIndex++] ?? "No more responses";
        for (let i = 0; i < content.length; i += 10) {
          yield {
            type: "chunk" as const,
            delta: content.slice(i, i + 10),
            index: Math.floor(i / 10),
            correlationId: "corr.test",
          } satisfies ChatStreamEvent;
        }
        yield { type: "done" as const, correlationId: "corr.test" } satisfies ChatStreamEvent;
      },
    },
  } as unknown as ArlopassClient;
}

describe("ConversationManager with tools", () => {
  describe("send() with auto-execute", () => {
    it("executes tool and returns final text response", async () => {
      const searchHandler = vi.fn().mockResolvedValue('{"results": ["doc1"]}');
      const tools: ToolDefinition[] = [{
        name: "search",
        description: "Search docs",
        parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
        handler: searchHandler,
      }];

      const client = mockToolClient([
        '<tool_call>\n{"name": "search", "arguments": {"query": "closures"}}\n</tool_call>',
        "Based on the search results, closures are...",
      ]);

      const mgr = new ConversationManager({ client, maxTokens: 50_000, tools });
      const reply = await mgr.send("What are closures?");

      expect(searchHandler).toHaveBeenCalledWith({ query: "closures" });
      expect(reply.content).toBe("Based on the search results, closures are...");
    });

    it("handles tool handler errors gracefully", async () => {
      const tools: ToolDefinition[] = [{
        name: "fail",
        description: "Always fails",
        handler: async () => { throw new Error("boom"); },
      }];

      const client = mockToolClient([
        '<tool_call>\n{"name": "fail", "arguments": {}}\n</tool_call>',
        "Sorry, the tool failed. Here is my answer without it.",
      ]);

      const mgr = new ConversationManager({ client, maxTokens: 50_000, tools });
      const reply = await mgr.send("Try the tool");
      expect(reply.content).toBe("Sorry, the tool failed. Here is my answer without it.");
    });

    it("respects maxToolRounds", async () => {
      let callCount = 0;
      const tools: ToolDefinition[] = [{
        name: "loop",
        description: "Loops forever",
        handler: async () => { callCount++; return "result"; },
      }];

      const responses = Array.from({ length: 10 }, () =>
        '<tool_call>\n{"name": "loop", "arguments": {}}\n</tool_call>',
      );

      const client = mockToolClient(responses);
      const mgr = new ConversationManager({ client, maxTokens: 50_000, tools, maxToolRounds: 3 });
      const reply = await mgr.send("Go");
      expect(callCount).toBeLessThanOrEqual(3);
      expect(reply).toBeDefined();
    });

    it("handles unknown tool names", async () => {
      const tools: ToolDefinition[] = [{
        name: "known",
        description: "Known tool",
        handler: async () => "ok",
      }];

      const client = mockToolClient([
        '<tool_call>\n{"name": "unknown_tool", "arguments": {}}\n</tool_call>',
        "I see the tool was not available.",
      ]);

      const mgr = new ConversationManager({ client, maxTokens: 50_000, tools });
      const reply = await mgr.send("Call unknown");
      expect(reply.content).toBe("I see the tool was not available.");
    });
  });

  describe("stream() with auto-execute", () => {
    it("yields chunks, tool events, and continues after tool execution", async () => {
      const tools: ToolDefinition[] = [{
        name: "search",
        description: "Search",
        handler: async () => '{"found": true}',
      }];

      const client = mockToolClient([
        '<tool_call>\n{"name": "search", "arguments": {"q": "test"}}\n</tool_call>',
        "Here are the results.",
      ]);

      const mgr = new ConversationManager({ client, maxTokens: 50_000, tools });
      const events: { type: string }[] = [];
      for await (const event of mgr.stream("Search for test")) {
        events.push({ type: event.type });
      }

      expect(events.some((e) => e.type === "tool_call")).toBe(true);
      expect(events.some((e) => e.type === "tool_result")).toBe(true);
      expect(events.some((e) => e.type === "chunk")).toBe(true);
      expect(events.some((e) => e.type === "done")).toBe(true);
    });
  });

  describe("no tools", () => {
    it("works normally without tools defined", async () => {
      const client = mockToolClient(["Just a normal response."]);
      const mgr = new ConversationManager({ client, maxTokens: 50_000 });
      const reply = await mgr.send("Hello");
      expect(reply.content).toBe("Just a normal response.");
    });

    it("does not parse tool_call tags when no tools configured", async () => {
      const client = mockToolClient(['<tool_call>\n{"name": "x", "arguments": {}}\n</tool_call>']);
      const mgr = new ConversationManager({ client, maxTokens: 50_000 });
      const reply = await mgr.send("Hello");
      // Response returned as-is since no tools are configured
      expect(reply.content).toContain("<tool_call>");
    });
  });

  describe("system prompt integration", () => {
    it("includes tool instructions in effective system prompt", () => {
      const tools: ToolDefinition[] = [{
        name: "test_tool",
        description: "A test tool",
      }];

      const client = mockToolClient(["response"]);
      const mgr = new ConversationManager({
        client,
        maxTokens: 50_000,
        systemPrompt: "You are helpful.",
        tools,
      });

      const messages = mgr.getMessages();
      expect(messages[0]?.role).toBe("system");
      expect(messages[0]?.content).toContain("You are helpful.");
      expect(messages[0]?.content).toContain("test_tool");
      expect(messages[0]?.content).toContain("<tool_call>");
    });
  });
});
