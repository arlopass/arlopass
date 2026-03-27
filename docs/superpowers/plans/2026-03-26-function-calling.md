# Function Calling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SDK-side function/tool calling to `ConversationManager` — the SDK injects tool definitions into the system prompt, parses `<tool_call>` responses, executes handlers (auto or manual), feeds results back, and continues until the model produces a text response.

**Architecture:** Tools are defined as `ToolDefinition[]` on `ConversationManagerOptions`. The SDK builds a tool system prompt, appends it to the developer's system prompt, and parses `<tool_call>` XML tags from the model's response. A loop handles tool execution (auto via handler, or manual via `submitToolResult`) and re-sends with results until the model responds with plain text or `maxToolRounds` is reached.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-03-26-function-calling-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/web-sdk/src/tools.ts` | Types: `ToolDefinition`, `ToolCall`, `ToolResult`, stream event types |
| `packages/web-sdk/src/tool-parser.ts` | `parseToolCalls()`, `buildToolSystemPrompt()`, `formatToolResults()` |
| `packages/web-sdk/src/__tests__/tool-parser.test.ts` | Parser unit tests |
| `packages/web-sdk/src/conversation.ts` (modify) | Add tools to ConversationManager |
| `packages/web-sdk/src/__tests__/conversation-tools.test.ts` | Tool integration tests |
| `packages/web-sdk/src/index.ts` (modify) | Export new types |

---

### Task 1: Tool Types

**Files:**
- Create: `packages/web-sdk/src/tools.ts`

- [ ] **Step 1: Create the types file**

```typescript
// packages/web-sdk/src/tools.ts

import type { ChatStreamEvent } from "./types.js";

/** JSON Schema subset for tool parameters. */
export type ToolParameterSchema = Readonly<{
  type: "object";
  properties?: Readonly<Record<string, Readonly<{
    type: string;
    description?: string;
    enum?: readonly string[];
  }>>>;
  required?: readonly string[];
}>;

/** A tool definition provided by the developer. */
export type ToolDefinition = Readonly<{
  name: string;
  description: string;
  parameters?: ToolParameterSchema;
  /** If provided, the SDK auto-executes this handler when the model calls the tool. */
  handler?: (args: Record<string, unknown>) => Promise<string> | string;
}>;

/** A parsed tool call from the model's response. */
export type ToolCall = Readonly<{
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}>;

/** A result returned from a tool execution. */
export type ToolResult = Readonly<{
  toolCallId: string;
  name: string;
  result: string;
}>;

/** Yielded when the model requests a tool call. */
export type ToolCallEvent = Readonly<{
  type: "tool_call";
  toolCallId: string;
  name: string;
  arguments: Record<string, unknown>;
}>;

/** Yielded when a tool result is produced (auto or manual). */
export type ToolResultEvent = Readonly<{
  type: "tool_result";
  toolCallId: string;
  name: string;
  result: string;
}>;

/** Extended event union for ConversationManager.stream(). */
export type ConversationStreamEvent =
  | ChatStreamEvent
  | ToolCallEvent
  | ToolResultEvent;
```

- [ ] **Step 2: Verify compilation**

Run: `cd packages/web-sdk && npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Commit**

```
git add packages/web-sdk/src/tools.ts
git commit -m "feat(web-sdk): add tool/function calling type definitions"
```

---

### Task 2: Tool Parser

**Files:**
- Create: `packages/web-sdk/src/tool-parser.ts`
- Create: `packages/web-sdk/src/__tests__/tool-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/web-sdk/src/__tests__/tool-parser.test.ts
import { describe, expect, it } from "vitest";
import {
  parseToolCalls,
  buildToolSystemPrompt,
  formatToolResults,
} from "../tool-parser.js";
import type { ToolDefinition, ToolResult } from "../tools.js";

describe("parseToolCalls", () => {
  it("returns no tool calls for plain text", () => {
    const result = parseToolCalls("Hello, this is a normal response.");
    expect(result.toolCalls).toHaveLength(0);
    expect(result.textBefore).toBe("Hello, this is a normal response.");
    expect(result.textAfter).toBe("");
  });

  it("parses a single tool call", () => {
    const text = 'Let me search for that.\n<tool_call>\n{"name": "search", "arguments": {"query": "closures"}}\n</tool_call>';
    const result = parseToolCalls(text);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("search");
    expect(result.toolCalls[0]!.arguments).toEqual({ query: "closures" });
    expect(result.toolCalls[0]!.id).toMatch(/^tc_/);
    expect(result.textBefore.trim()).toBe("Let me search for that.");
  });

  it("parses multiple tool calls", () => {
    const text = '<tool_call>\n{"name": "a", "arguments": {}}\n</tool_call>\n<tool_call>\n{"name": "b", "arguments": {"x": 1}}\n</tool_call>';
    const result = parseToolCalls(text);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0]!.name).toBe("a");
    expect(result.toolCalls[1]!.name).toBe("b");
  });

  it("skips malformed JSON inside tool_call tags", () => {
    const text = '<tool_call>\nnot json\n</tool_call>\n<tool_call>\n{"name": "good", "arguments": {}}\n</tool_call>';
    const result = parseToolCalls(text);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("good");
  });

  it("captures text after tool calls", () => {
    const text = '<tool_call>\n{"name": "a", "arguments": {}}\n</tool_call>\nSome trailing text.';
    const result = parseToolCalls(text);
    expect(result.textAfter.trim()).toBe("Some trailing text.");
  });

  it("generates unique IDs for each call", () => {
    const text = '<tool_call>\n{"name": "a", "arguments": {}}\n</tool_call>\n<tool_call>\n{"name": "b", "arguments": {}}\n</tool_call>';
    const result = parseToolCalls(text);
    expect(result.toolCalls[0]!.id).not.toBe(result.toolCalls[1]!.id);
  });
});

describe("buildToolSystemPrompt", () => {
  it("builds prompt with tool definitions", () => {
    const tools: ToolDefinition[] = [
      {
        name: "search",
        description: "Search documents",
        parameters: {
          type: "object",
          properties: { query: { type: "string", description: "Search query" } },
          required: ["query"],
        },
      },
    ];
    const prompt = buildToolSystemPrompt(tools);
    expect(prompt).toContain("search");
    expect(prompt).toContain("Search documents");
    expect(prompt).toContain("<tool_call>");
    expect(prompt).toContain("<tool");
  });

  it("handles tools without parameters", () => {
    const tools: ToolDefinition[] = [
      { name: "get_time", description: "Get current time" },
    ];
    const prompt = buildToolSystemPrompt(tools);
    expect(prompt).toContain("get_time");
    expect(prompt).toContain("Get current time");
  });

  it("returns empty string for no tools", () => {
    expect(buildToolSystemPrompt([])).toBe("");
  });
});

describe("formatToolResults", () => {
  it("formats a single tool result", () => {
    const results: ToolResult[] = [
      { toolCallId: "tc_001", name: "search", result: '{"found": true}' },
    ];
    const formatted = formatToolResults(results);
    expect(formatted).toContain('<tool_result name="search" tool_call_id="tc_001">');
    expect(formatted).toContain('{"found": true}');
    expect(formatted).toContain("</tool_result>");
  });

  it("formats multiple results", () => {
    const results: ToolResult[] = [
      { toolCallId: "tc_001", name: "a", result: "result_a" },
      { toolCallId: "tc_002", name: "b", result: "result_b" },
    ];
    const formatted = formatToolResults(results);
    expect(formatted).toContain("tc_001");
    expect(formatted).toContain("tc_002");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web-sdk && npx vitest run src/__tests__/tool-parser.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```typescript
// packages/web-sdk/src/tool-parser.ts
import type { ToolCall, ToolDefinition, ToolResult } from "./tools.js";

const TOOL_CALL_PATTERN = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;

let nextToolCallId = 0;

function generateToolCallId(): string {
  return `tc_${String(++nextToolCallId).padStart(4, "0")}_${Date.now().toString(36)}`;
}

export function parseToolCalls(text: string): {
  toolCalls: ToolCall[];
  textBefore: string;
  textAfter: string;
} {
  const toolCalls: ToolCall[] = [];
  let lastIndex = 0;
  let firstMatchIndex = -1;
  let lastMatchEnd = 0;

  const regex = new RegExp(TOOL_CALL_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (firstMatchIndex === -1) {
      firstMatchIndex = match.index;
    }
    lastMatchEnd = match.index + match[0].length;
    const jsonStr = match[1]!.trim();
    try {
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      if (typeof parsed.name === "string") {
        toolCalls.push({
          id: generateToolCallId(),
          name: parsed.name,
          arguments: (typeof parsed.arguments === "object" && parsed.arguments !== null
            ? parsed.arguments
            : {}) as Record<string, unknown>,
        });
      }
    } catch {
      // Skip malformed JSON
    }
  }

  const textBefore = firstMatchIndex >= 0 ? text.slice(0, firstMatchIndex) : text;
  const textAfter = lastMatchEnd > 0 ? text.slice(lastMatchEnd) : "";

  return { toolCalls, textBefore, textAfter };
}

export function buildToolSystemPrompt(tools: readonly ToolDefinition[]): string {
  if (tools.length === 0) return "";

  const toolBlocks = tools.map((tool) => {
    const paramLine = tool.parameters !== undefined
      ? `\nParameters: ${JSON.stringify(tool.parameters)}`
      : "";
    return `<tool name="${tool.name}" description="${tool.description}">${paramLine}\n</tool>`;
  }).join("\n\n");

  return `You have access to the following tools. To use a tool, respond with a tool_call XML block. You may call multiple tools. After tool results are provided, continue your response.

Available tools:

${toolBlocks}

To call a tool, use this exact format:
<tool_call>
{"name": "tool_name", "arguments": {"param": "value"}}
</tool_call>

After receiving tool results, provide your final answer to the user.`;
}

export function formatToolResults(results: readonly ToolResult[]): string {
  return results
    .map(
      (r) => `<tool_result name="${r.name}" tool_call_id="${r.toolCallId}">\n${r.result}\n</tool_result>`,
    )
    .join("\n\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/web-sdk && npx vitest run src/__tests__/tool-parser.test.ts`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**

```
git add packages/web-sdk/src/tool-parser.ts packages/web-sdk/src/__tests__/tool-parser.test.ts
git commit -m "feat(web-sdk): add tool call parser and system prompt builder"
```

---

### Task 3: Integrate Tools into ConversationManager

**Files:**
- Modify: `packages/web-sdk/src/conversation.ts`

This is the most complex task. The ConversationManager needs:
1. Accept `tools` and `maxToolRounds` in options
2. Modify `#buildContextWindow` to include tool system prompt in token budget
3. Modify `send()` to implement the tool call loop (auto-execute only)
4. Modify `stream()` to implement the tool call loop (auto + manual)
5. Add `submitToolResult()` method

- [ ] **Step 1: Read the current conversation.ts file to understand its exact state**

The file was recently modified by the user/formatter. Read it fully before editing.

- [ ] **Step 2: Add imports and update types**

At the top of `conversation.ts`, add:
```typescript
import type { ToolDefinition, ToolCall, ToolCallEvent, ToolResultEvent, ConversationStreamEvent } from "./tools.js";
import { parseToolCalls, buildToolSystemPrompt, formatToolResults } from "./tool-parser.js";
```

Update `ConversationManagerOptions` to add:
```typescript
  /** Tool definitions available to the model. */
  tools?: ToolDefinition[];
  /** Max tool call rounds before returning text. Default: 5. */
  maxToolRounds?: number;
```

- [ ] **Step 3: Update constructor to store tools and build tool prompt**

Add private fields:
```typescript
readonly #tools: readonly ToolDefinition[];
readonly #maxToolRounds: number;
readonly #toolSystemPrompt: string;
#pendingToolResults = new Map<string, { resolve: (result: string) => void }>();
```

In constructor:
```typescript
this.#tools = options.tools ?? [];
this.#maxToolRounds = options.maxToolRounds ?? 5;
this.#toolSystemPrompt = buildToolSystemPrompt(this.#tools);
```

- [ ] **Step 4: Update `#buildContextWindow` to account for tool prompt tokens**

The effective system prompt is: `developerSystemPrompt + "\n\n" + toolSystemPrompt`. Update `#buildContextWindow` to use the combined prompt:

```typescript
#getEffectiveSystemPrompt(): string | undefined {
  if (this.#systemPrompt !== undefined && this.#toolSystemPrompt.length > 0) {
    return `${this.#systemPrompt}\n\n${this.#toolSystemPrompt}`;
  }
  if (this.#toolSystemPrompt.length > 0) {
    return this.#toolSystemPrompt;
  }
  return this.#systemPrompt;
}
```

Then in `#buildContextWindow`, `getMessages`, etc., use `this.#getEffectiveSystemPrompt()` instead of `this.#systemPrompt`.

- [ ] **Step 5: Rewrite `send()` with tool call loop**

```typescript
async send(content: string, options?: PinOptions): Promise<ChatMessage> {
  this.addMessage({ role: "user", content }, options);

  for (let round = 0; round < this.#maxToolRounds; round++) {
    const contextWindow = await this.#prepareContextWindow();
    const result = await this.#client.chat.send({ messages: contextWindow });
    const responseText = result.message.content;

    const parsed = parseToolCalls(responseText);
    if (parsed.toolCalls.length === 0) {
      // No tool calls — final text response
      this.#messages.push({
        message: result.message,
        pinned: false,
        tokenEstimate: estimateTokenCount(result.message.content),
        isSummary: false,
      });
      return result.message;
    }

    // Tool calls found — execute all (send requires handlers)
    this.#messages.push({
      message: { role: "assistant", content: responseText },
      pinned: false,
      tokenEstimate: estimateTokenCount(responseText),
      isSummary: false,
    });

    const toolResults = await this.#executeToolCalls(parsed.toolCalls);
    const resultMessage = formatToolResults(toolResults);
    this.addMessage({ role: "user", content: resultMessage });
  }

  // maxToolRounds exceeded — return last assistant message
  const lastAssistant = [...this.#messages].reverse().find((m) => m.message.role === "assistant");
  return lastAssistant?.message ?? { role: "assistant", content: "" };
}
```

- [ ] **Step 6: Rewrite `stream()` with tool call loop**

```typescript
async *stream(content: string, options?: PinOptions): AsyncIterable<ConversationStreamEvent> {
  this.addMessage({ role: "user", content }, options);

  for (let round = 0; round < this.#maxToolRounds; round++) {
    const contextWindow = await this.#prepareContextWindow();
    let fullContent = "";

    for await (const event of this.#client.chat.stream({ messages: contextWindow })) {
      if (event.type === "chunk") {
        fullContent += event.delta;
      }
      yield event;
    }

    const parsed = parseToolCalls(fullContent);
    if (parsed.toolCalls.length === 0) {
      // No tool calls — done
      if (fullContent.length > 0) {
        this.#messages.push({
          message: { role: "assistant", content: fullContent },
          pinned: false,
          tokenEstimate: estimateTokenCount(fullContent),
          isSummary: false,
        });
      }
      return;
    }

    // Tool calls found
    this.#messages.push({
      message: { role: "assistant", content: fullContent },
      pinned: false,
      tokenEstimate: estimateTokenCount(fullContent),
      isSummary: false,
    });

    // Yield tool_call events and collect results
    const toolResults = await this.#executeToolCallsWithEvents(parsed.toolCalls, yield);
    // ^ This helper yields tool_call and tool_result events, collects results

    const resultMessage = formatToolResults(toolResults);
    this.addMessage({ role: "user", content: resultMessage });
    // Loop continues — next round sends with tool results
  }
}
```

Note: Yielding from within a helper is tricky with generators. The actual implementation should inline the logic or use a different pattern. The implementer should handle this correctly.

- [ ] **Step 7: Add `#executeToolCalls` helper (for send)**

```typescript
async #executeToolCalls(toolCalls: readonly ToolCall[]): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  for (const call of toolCalls) {
    const tool = this.#tools.find((t) => t.name === call.name);
    if (tool?.handler === undefined) {
      results.push({
        toolCallId: call.id,
        name: call.name,
        result: JSON.stringify({ error: `Tool "${call.name}" has no handler. Use stream() for manual tool handling.` }),
      });
      continue;
    }
    try {
      const result = await tool.handler(call.arguments);
      results.push({ toolCallId: call.id, name: call.name, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        toolCallId: call.id,
        name: call.name,
        result: JSON.stringify({ error: `Tool execution failed: ${message}` }),
      });
    }
  }
  return results;
}
```

- [ ] **Step 8: Add `submitToolResult()` method**

```typescript
submitToolResult(toolCallId: string, result: string): void {
  const pending = this.#pendingToolResults.get(toolCallId);
  if (pending !== undefined) {
    pending.resolve(result);
    this.#pendingToolResults.delete(toolCallId);
  }
}
```

- [ ] **Step 9: Run existing conversation tests**

Run: `cd packages/web-sdk && npx vitest run src/__tests__/conversation.test.ts`
Expected: All 16 existing tests still pass (tools are optional, defaults to no tools)

- [ ] **Step 10: Run tsc**

Run: `cd packages/web-sdk && npx tsc --noEmit`
Expected: Clean

- [ ] **Step 11: Commit**

```
git add packages/web-sdk/src/conversation.ts
git commit -m "feat(web-sdk): add tool calling loop to ConversationManager"
```

---

### Task 4: Tool Integration Tests

**Files:**
- Create: `packages/web-sdk/src/__tests__/conversation-tools.test.ts`

- [ ] **Step 1: Write tests for automatic tool execution**

```typescript
// packages/web-sdk/src/__tests__/conversation-tools.test.ts
import { describe, expect, it, vi } from "vitest";
import { ConversationManager } from "../conversation.js";
import type { ToolDefinition } from "../tools.js";
import type { ArlopassClient } from "../client.js";
import type { ChatSendResult, ChatStreamEvent } from "../types.js";

// Mock client that returns configurable responses
function mockToolClient(responses: string[]): ArlopassClient {
  let callIndex = 0;
  return {
    selectedProvider: { providerId: "test", modelId: "test-model" },
    chat: {
      send: async () => {
        const content = responses[callIndex++] ?? "No more responses";
        return { message: { role: "assistant" as const, content }, correlationId: "corr.test" } satisfies ChatSendResult;
      },
      stream: async function* () {
        const content = responses[callIndex++] ?? "No more responses";
        for (const char of content) {
          yield { type: "chunk" as const, delta: char, index: 0, correlationId: "corr.test" };
        }
        yield { type: "done" as const, correlationId: "corr.test" };
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
      const tools: ToolDefinition[] = [{
        name: "loop",
        description: "Loops forever",
        handler: async () => "result",
      }];

      // Model always calls tool — should stop after maxToolRounds
      const responses = Array.from({ length: 10 }, () =>
        '<tool_call>\n{"name": "loop", "arguments": {}}\n</tool_call>',
      );

      const client = mockToolClient(responses);
      const mgr = new ConversationManager({ client, maxTokens: 50_000, tools, maxToolRounds: 3 });
      const reply = await mgr.send("Go");
      // Should have stopped after 3 rounds
      expect(reply).toBeDefined();
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
    });
  });

  describe("no tools", () => {
    it("works normally without tools defined", async () => {
      const client = mockToolClient(["Just a normal response."]);
      const mgr = new ConversationManager({ client, maxTokens: 50_000 });
      const reply = await mgr.send("Hello");
      expect(reply.content).toBe("Just a normal response.");
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd packages/web-sdk && npx vitest run src/__tests__/conversation-tools.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```
git add packages/web-sdk/src/__tests__/conversation-tools.test.ts
git commit -m "test(web-sdk): add tool calling integration tests"
```

---

### Task 5: Exports and Final Verification

**Files:**
- Modify: `packages/web-sdk/src/index.ts`

- [ ] **Step 1: Add exports**

Add to `packages/web-sdk/src/index.ts`:
```typescript
export * from "./tools.js";
export { parseToolCalls, buildToolSystemPrompt, formatToolResults } from "./tool-parser.js";
```

- [ ] **Step 2: Run full test suite**

Run: `cd packages/web-sdk && npx vitest run`
Expected: All tests pass (38 existing + 9 parser + tool integration)

- [ ] **Step 3: TypeScript check**

Run: `cd packages/web-sdk && npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Build**

Run: `cd packages/web-sdk && npm run build`
Expected: Success

- [ ] **Step 5: Check extension tests not broken**

Run: `cd apps/extension && npx vitest run`
Expected: All 192 tests pass

- [ ] **Step 6: Commit**

```
git add packages/web-sdk/src/index.ts
git commit -m "feat(web-sdk): export tool calling types and utilities"
```
