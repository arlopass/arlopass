# SDK-Side Function Calling Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Scope:** `@byom-ai/web-sdk` — tool/function calling via `ConversationManager`

---

## 1. Problem Statement

The SDK has no mechanism for function/tool calling. Web apps cannot let the model dynamically invoke functions (e.g., search a database, call an API, query a page) during a conversation. All context must be injected upfront in the prompt.

This spec defines SDK-side function calling that works with ALL providers (Ollama, Anthropic, CLI) without adapter changes. The SDK manages the tool-call → execute → tool-result loop by injecting tool definitions into the system prompt and parsing the model's structured responses.

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where tool loop runs | SDK-side (ConversationManager) | Works with all providers immediately; no adapter changes |
| Tool communication | System prompt injection + XML tag parsing | Most reliable across LLMs; XML tags parsed well by all models |
| Handler model | Both automatic + manual | Auto-execute for simple cases; event-based for apps that need control |
| Integration point | Extend existing ConversationManager | Tools are conversation features; avoids new class |

---

## 3. Tool Definition Types

```typescript
// packages/web-sdk/src/tools.ts

/** JSON Schema subset for tool parameters */
type ToolParameterSchema = Readonly<{
  type: "object";
  properties?: Readonly<Record<string, Readonly<{
    type: string;
    description?: string;
    enum?: readonly string[];
  }>>>;
  required?: readonly string[];
}>;

type ToolDefinition = Readonly<{
  name: string;
  description: string;
  parameters?: ToolParameterSchema;
  /** Auto-execute handler. If provided, the SDK calls it automatically. */
  handler?: (args: Record<string, unknown>) => Promise<string> | string;
}>;

type ToolCall = Readonly<{
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}>;

type ToolResult = Readonly<{
  toolCallId: string;
  name: string;
  result: string;
}>;
```

---

## 4. Extended ConversationManager Options

```typescript
type ConversationManagerOptions = {
  client: BYOMClient;
  maxTokens?: number;
  reserveOutputTokens?: number;
  systemPrompt?: string;
  summarize?: boolean;
  summarizationPrompt?: string;
  /** Tool definitions available to the model. */
  tools?: ToolDefinition[];
  /** Max tool call rounds before forcing a text response. Default: 5. */
  maxToolRounds?: number;
};
```

---

## 5. Stream Event Types

```typescript
type ToolCallEvent = Readonly<{
  type: "tool_call";
  toolCallId: string;
  name: string;
  arguments: Record<string, unknown>;
}>;

type ToolResultEvent = Readonly<{
  type: "tool_result";
  toolCallId: string;
  name: string;
  result: string;
}>;

type ConversationStreamEvent =
  | ChatStreamEvent        // existing: chunk, done
  | ToolCallEvent
  | ToolResultEvent;
```

---

## 6. System Prompt Injection

When tools are defined, the SDK appends a tool description block to the system prompt:

```
You have access to the following tools. To use a tool, respond with a tool_call XML block. You may call multiple tools. After tool results are provided, continue your response.

Available tools:

<tool name="search_docs" description="Search the documentation for relevant pages">
Parameters: {"type":"object","properties":{"query":{"type":"string","description":"Search query"}},"required":["query"]}
</tool>

To call a tool, use this exact format:
<tool_call>
{"name": "search_docs", "arguments": {"query": "your search query"}}
</tool_call>

After receiving tool results, provide your final answer to the user.
```

This is appended after the developer's system prompt (or becomes the system prompt if none is set).

---

## 7. Tool Call Parsing

```typescript
function parseToolCalls(text: string): {
  toolCalls: ToolCall[];
  textBefore: string;
  textAfter: string;
}
```

- Pattern: `/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g`
- Each match is parsed as JSON → `{ name, arguments }`
- A unique `toolCallId` is generated per call (`tc_<random>`)
- Text before/after tool calls is captured separately
- Invalid JSON inside tags is skipped with a warning

---

## 8. Tool Result Formatting

Results are fed back to the model as a user message:

```
<tool_result name="search_docs" tool_call_id="tc_001">
{"results": [{"title": "Closures in JS", "url": "/docs/closures"}]}
</tool_result>
```

Multiple results are concatenated in a single message.

---

## 9. The Tool Call Loop

### send() (non-streaming):

```
1. Build context window (system prompt with tools + messages)
2. Send to model via client.chat.send()
3. Parse response for <tool_call> tags
4. If no tool calls → return text response
5. If tool calls found:
   a. For each call: handler must exist (send() requires all tools have handlers)
   b. Execute each handler
   c. Append assistant message (with tool calls) to history
   d. Append tool result user message to history
   e. Go to step 1 — up to maxToolRounds
6. If maxToolRounds exceeded → return last text response
```

### stream() (streaming):

```
1. Build context window
2. Stream from model via client.chat.stream()
3. Yield chunk events to consumer as they arrive
4. Accumulate full response from deltas
5. After stream completes, parse for <tool_call> tags
6. If no tool calls → done
7. If tool calls found:
   a. Yield tool_call events for each call
   b. For tools WITH handlers → auto-execute, yield tool_result events
   c. For tools WITHOUT handlers → pause, wait for submitToolResult()
   d. Once all results collected:
      - Append messages to history
      - Start new stream from step 1
8. maxToolRounds limit applies
```

---

## 10. Manual Tool Result Submission

```typescript
class ConversationManager {
  /** Submit a result for a tool call from manual mode (no handler). */
  submitToolResult(toolCallId: string, result: string): void;
}
```

- Resolves the pending tool result promise
- The stream loop continues once all pending results are submitted
- Timeout: if no result submitted within `timeoutMs`, the stream errors

---

## 11. Usage Examples

### Automatic mode:
```typescript
const conversation = new ConversationManager({
  client,
  systemPrompt: "You are a research assistant.",
  tools: [{
    name: "search_docs",
    description: "Search documentation",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
    },
    handler: async (args) => JSON.stringify(await searchDocs(args.query as string)),
  }],
});

// Fully automatic: tool called, result fed back, final answer returned
const reply = await conversation.send("Find docs about closures");
```

### Manual mode:
```typescript
const conversation = new ConversationManager({
  client,
  tools: [{
    name: "get_weather",
    description: "Get current weather",
    parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    // No handler — manual mode
  }],
});

for await (const event of conversation.stream("Weather in Paris?")) {
  if (event.type === "tool_call") {
    const weather = await fetchWeather(event.arguments.city as string);
    conversation.submitToolResult(event.toolCallId, weather);
  }
  if (event.type === "chunk") process.stdout.write(event.delta);
}
```

### Mixed mode:
```typescript
const conversation = new ConversationManager({
  client,
  tools: [
    {
      name: "search_docs",
      description: "Search docs",
      parameters: { type: "object", properties: { query: { type: "string" } } },
      handler: async (args) => JSON.stringify(await searchDocs(args.query as string)),
    },
    {
      name: "confirm_action",
      description: "Ask user to confirm an action",
      parameters: { type: "object", properties: { action: { type: "string" } } },
      // No handler — requires user confirmation via UI
    },
  ],
});
```

---

## 12. File Structure

| File | Responsibility |
|------|----------------|
| `packages/web-sdk/src/tools.ts` | Types: `ToolDefinition`, `ToolCall`, `ToolResult`, `ToolCallEvent`, `ToolResultEvent`, `ConversationStreamEvent` |
| `packages/web-sdk/src/tool-parser.ts` | `parseToolCalls()`, `buildToolSystemPrompt()`, `formatToolResults()` |
| `packages/web-sdk/src/conversation.ts` (modify) | Add tools to ConversationManager: tool loop in send/stream, submitToolResult |
| `packages/web-sdk/src/__tests__/tool-parser.test.ts` | Parser unit tests |
| `packages/web-sdk/src/__tests__/conversation-tools.test.ts` | Tool integration tests |
| `packages/web-sdk/src/index.ts` (modify) | Export new types |

---

## 13. Constraints & Edge Cases

- **`send()` with handler-less tools:** Throws error. All tools must have handlers for non-streaming. Use `stream()` for manual mode.
- **Malformed tool calls:** Invalid JSON inside `<tool_call>` is skipped with warning. Valid calls in the same response still execute.
- **Tool handler throws:** Catch, send `{"error": "Tool execution failed: <message>"}` as the result. Model handles the error.
- **`maxToolRounds` exceeded:** Return model's last text response. No infinite loops.
- **Unknown tool name:** If model calls a tool not in the definitions, skip it and include an error result: `{"error": "Unknown tool: <name>"}`.
- **Streaming partial tags:** Chunks may split `<tool_call>` tags. The SDK accumulates full response before parsing. Partial tag text appears in chunk events (cosmetic only — the follow-up round produces the clean response).
- **Tool definitions in token budget:** The tool system prompt counts toward the context window token budget. ConversationManager accounts for it during truncation.

---

## 14. Future Extensions (Out of Scope)

- **Native provider tool calling** — Use Anthropic's `tool_use` API, Ollama's `tools` parameter instead of system prompt injection
- **Parallel tool execution** — Execute multiple tool calls concurrently
- **Tool call streaming** — Parse tool calls incrementally during streaming instead of after completion
- **Tool schemas validation** — Validate tool arguments against the JSON schema before executing
