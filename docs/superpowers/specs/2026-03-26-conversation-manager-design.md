# ConversationManager Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Scope:** `@byom-ai/web-sdk` — new `ConversationManager` class

---

## 1. Problem Statement

The current SDK requires web apps to manually manage conversation history. There is no built-in context window awareness — apps must track messages, estimate token counts, and truncate history themselves. This leads to:

- History capped at arbitrary message counts (e.g., last 10) regardless of model capacity
- No token-aware truncation — large messages waste context, small ones under-utilize it
- No way to pin important context messages that should survive truncation
- No mechanism to preserve evicted context through summarization
- Every app reimplements the same history management logic

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Location | Inside `@byom-ai/web-sdk` | Natural extension of client; needs `client.chat.send()` for summarization |
| Opt-in model | `ConversationManager` helper class | Apps that want manual control keep passing `messages[]` directly |
| Context window limits | Hybrid: developer override → provider-reported → static table → default 4096 | Maximum reliability across known and unknown models |
| Truncation strategy | Priority-based sliding window + optional summarization | Pinning gives control; summarization is opt-in to avoid surprise LLM costs |
| Token estimation | Reuse `estimateTokenCount()` (chars/4 ceiling) | Already implemented in extension; good enough for budget management |

---

## 3. ConversationManager API

### 3.1 Construction

```typescript
type ConversationManagerOptions = {
  client: BYOMClient;
  /** Max tokens for the context window. Overrides provider-reported and static defaults. */
  maxTokens?: number;
  /** Reserve tokens for the model's response (excluded from context budget). Default: 1024. */
  reserveOutputTokens?: number;
  /** System prompt pinned at position 0. Always included, never evicted. */
  systemPrompt?: string;
  /** Enable auto-summarization of evicted messages. Default: false. */
  summarize?: boolean;
  /** Custom summarization prompt. Used when summarize=true. */
  summarizationPrompt?: string;
};
```

### 3.2 Public Methods

```typescript
class ConversationManager {
  /** Add a user message and get the assistant response (non-streaming). */
  async send(content: string, options?: PinOptions): Promise<ChatMessage>;

  /** Add a user message and stream the assistant response. */
  stream(content: string, options?: PinOptions): AsyncIterable<ChatStreamEvent>;

  /** Add a message to history without sending (e.g., inject context). */
  addMessage(message: ChatMessage, options?: PinOptions): void;

  /** Get the current conversation history (all messages, including evicted-but-summarized). */
  getMessages(): readonly ChatMessage[];

  /** Get the messages that would be sent in the next request (after truncation). */
  getContextWindow(): readonly ChatMessage[];

  /** Get estimated token count for the current context window. */
  getTokenCount(): number;

  /** Pin/unpin an existing message by index. */
  setPin(index: number, pinned: boolean): void;

  /** Clear all history. */
  clear(): void;

  /** The resolved max token budget (after provider/static/override resolution). */
  readonly maxTokens: number;
}

type PinOptions = {
  /** Pinned messages survive truncation. */
  pinned?: boolean;
};
```

### 3.3 Usage Examples

**Basic chat with auto-managed history:**
```typescript
const conversation = new ConversationManager({
  client,
  systemPrompt: "You are a helpful coding assistant.",
  maxTokens: 8192,
});

const response = await conversation.send("What is a closure?");
console.log(response.content);
// History: [system, user, assistant] — managed automatically
```

**Pinning important context:**
```typescript
conversation.addMessage(
  { role: "user", content: "The codebase uses React 19 with TypeScript." },
  { pinned: true },
);
// This message survives truncation even when older messages are evicted
```

**Streaming:**
```typescript
for await (const event of conversation.stream("Explain useEffect cleanup.")) {
  if (event.type === "chunk") process.stdout.write(event.delta);
}
```

**With auto-summarization:**
```typescript
const conversation = new ConversationManager({
  client,
  systemPrompt: "You are a code reviewer.",
  summarize: true,
  summarizationPrompt: "Summarize focusing on code decisions and variable names.",
});
// When context overflows, evicted messages are summarized instead of dropped
```

---

## 4. Token Budget Resolution

Priority order (highest wins):

1. **`options.maxTokens`** — Developer override
2. **Provider-reported** — From `ProviderDescriptor` metadata (future extension; not implemented in v1)
3. **Static lookup table** — Built-in map of known model context windows
4. **Default: `4096`** — Conservative fallback for unknown models

### 4.1 Static Model Context Window Table

```typescript
// packages/web-sdk/src/model-context-windows.ts

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Ollama / local
  "llama3.2": 131_072,
  "llama3.1": 131_072,
  "llama3": 8_192,
  "mistral": 32_768,
  "qwen2.5": 32_768,
  "gemma2": 8_192,
  "phi3": 4_096,
  "codellama": 16_384,
  "deepseek-coder": 16_384,
  // Anthropic
  "claude-sonnet-4": 200_000,
  "claude-haiku-4": 200_000,
  "claude-opus-4": 200_000,
  // OpenAI
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "gpt-4-turbo": 128_000,
  "gpt-4": 8_192,
  "gpt-3.5-turbo": 16_385,
  "o1": 200_000,
  "o1-mini": 128_000,
  // Google
  "gemini-2.0-flash": 1_048_576,
  "gemini-1.5-pro": 2_097_152,
  "gemini-1.5-flash": 1_048_576,
  // Perplexity
  "sonar": 127_072,
};

const DEFAULT_CONTEXT_WINDOW = 4_096;
```

Model IDs are matched with `startsWith` so `"llama3.2:latest"` matches `"llama3.2"`, and `"claude-sonnet-4-20250514"` matches `"claude-sonnet-4"`.

### 4.2 Lookup Function

```typescript
function resolveModelContextWindow(modelId: string): number {
  // Exact match first
  if (MODEL_CONTEXT_WINDOWS[modelId] !== undefined) {
    return MODEL_CONTEXT_WINDOWS[modelId];
  }
  // Prefix match (longest match wins)
  let bestMatch = "";
  let bestSize = DEFAULT_CONTEXT_WINDOW;
  for (const [prefix, size] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (modelId.startsWith(prefix) && prefix.length > bestMatch.length) {
      bestMatch = prefix;
      bestSize = size;
    }
  }
  return bestSize;
}
```

---

## 5. Truncation Algorithm

### 5.1 Priority-Based Sliding Window

```
Input: managedMessages[], systemPrompt, maxTokens, reserveOutputTokens

1. budget = maxTokens - reserveOutputTokens
2. Build ordered list:
   a. [systemPrompt] (if set) — always slot 0, always included
   b. All pinned messages (in original order)
   c. Non-pinned messages from most-recent to oldest
3. Walk the ordered list, accumulating token estimates:
   - System prompt: always included (deducted from budget)
   - Pinned messages: always included (deducted from budget)
   - If pinned content alone exceeds budget: warn but include anyway (don't break)
   - Non-pinned from recent→oldest: include while budget allows, stop when exceeded
4. The included messages, in original conversation order, form the context window
5. Messages not included are "evicted"
```

### 5.2 Auto-Summarization (opt-in)

When `summarize: true` and messages are evicted:

1. Collect all evicted non-pinned messages
2. If there's an existing summary message, include its content as prior context
3. Send a summarization request via `client.chat.send()`:
   ```
   System: [summarizationPrompt ?? "Summarize the following conversation concisely, preserving key facts, decisions, and context. Be brief."]
   User: [formatted evicted messages as "role: content" pairs]
   ```
4. The summary response becomes a `ManagedMessage` with `isSummary: true` and `pinned: true`
5. It replaces any previous summary message
6. Recalculate the context window with the new summary included

**Cost control:** Summarization only triggers when the context window actually overflows AND there are evicted messages that haven't been summarized yet. Re-summarization only occurs when new messages are evicted beyond the existing summary boundary.

---

## 6. Internal Data Model

```typescript
type ManagedMessage = {
  message: ChatMessage;
  pinned: boolean;
  tokenEstimate: number;
  isSummary: boolean;
};
```

The `ConversationManager` stores `ManagedMessage[]` internally. The `message` property is the standard `ChatMessage` that gets passed to the SDK.

---

## 7. Token Estimation

Reuse the `estimateTokenCount(text)` function: `Math.ceil(text.length / 4)`.

This function is currently in the extension at `apps/extension/src/usage/token-estimation.ts`. For the SDK, we'll add a copy in the web-sdk package (no cross-package dependency needed; it's 3 lines of code).

---

## 8. File Structure

| File | Responsibility |
|------|----------------|
| `packages/web-sdk/src/conversation.ts` | `ConversationManager` class with all methods |
| `packages/web-sdk/src/model-context-windows.ts` | Static model → context window lookup table + `resolveModelContextWindow()` |
| `packages/web-sdk/src/token-estimation.ts` | `estimateTokenCount()` for the SDK (standalone copy) |
| `packages/web-sdk/src/__tests__/conversation.test.ts` | Unit tests for ConversationManager |
| `packages/web-sdk/src/__tests__/model-context-windows.test.ts` | Tests for model lookup |
| `packages/web-sdk/src/index.ts` (modify) | Export `ConversationManager` |

---

## 9. Constraints & Edge Cases

- **System prompt alone exceeds budget:** Include it anyway (never drop), log a warning. The request will likely fail at the provider level, which is the correct behavior.
- **Pinned messages alone exceed budget:** Include them all anyway. Budget violation is the developer's responsibility when they pin too much.
- **Empty conversation:** `getContextWindow()` returns `[systemPrompt]` if set, `[]` otherwise.
- **Summarization failure:** If the summarization LLM call fails, fall back to simple truncation (drop evicted messages). Log the error but don't break the conversation.
- **Thread safety:** The manager is not re-entrant. Concurrent `send()`/`stream()` calls are developer error. The manager does not guard against this (YAGNI).

---

## 10. Future Extensions (Out of Scope)

- **Provider-reported context windows** via `ProviderDescriptor` metadata (requires protocol extension)
- **Tokenizer-accurate counting** (e.g., tiktoken) instead of char/4 estimation
- **Persistent conversation storage** (save/restore conversations across sessions)
- **Multi-turn summarization chains** (re-summarize summaries for very long conversations)
