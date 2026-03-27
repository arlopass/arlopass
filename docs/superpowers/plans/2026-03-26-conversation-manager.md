# ConversationManager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `ConversationManager` class to `@arlopass/web-sdk` that provides automatic conversation history management with token-aware truncation, message pinning, and optional auto-summarization.

**Architecture:** The `ConversationManager` wraps a `ArlopassClient` instance, maintains an internal `ManagedMessage[]` array, and uses token estimation to build an optimal context window before each `send()`/`stream()` call. A static model context window lookup table provides default token limits.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-03-26-conversation-manager-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/web-sdk/src/token-estimation.ts` | `estimateTokenCount()` for the SDK |
| `packages/web-sdk/src/model-context-windows.ts` | Static model → context window lookup + `resolveModelContextWindow()` |
| `packages/web-sdk/src/conversation.ts` | `ConversationManager` class |
| `packages/web-sdk/src/__tests__/token-estimation.test.ts` | Unit tests for SDK token estimation |
| `packages/web-sdk/src/__tests__/model-context-windows.test.ts` | Unit tests for model lookup |
| `packages/web-sdk/src/__tests__/conversation.test.ts` | Unit tests for ConversationManager |
| `packages/web-sdk/src/index.ts` (modify) | Add exports |

---

### Task 1: SDK Token Estimation

**Files:**
- Create: `packages/web-sdk/src/token-estimation.ts`
- Create: `packages/web-sdk/src/__tests__/token-estimation.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/web-sdk/src/__tests__/token-estimation.test.ts
import { describe, expect, it } from "vitest";
import { estimateTokenCount } from "../token-estimation.js";

describe("estimateTokenCount", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokenCount("")).toBe(0);
  });

  it("returns 1 for short text", () => {
    expect(estimateTokenCount("hi")).toBe(1);
  });

  it("estimates based on character length / 4", () => {
    expect(estimateTokenCount("a".repeat(100))).toBe(25);
  });

  it("rounds up for non-divisible lengths", () => {
    expect(estimateTokenCount("hello")).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web-sdk && npx vitest run src/__tests__/token-estimation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// packages/web-sdk/src/token-estimation.ts
const CHARS_PER_TOKEN = 4;

export function estimateTokenCount(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web-sdk && npx vitest run src/__tests__/token-estimation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web-sdk/src/token-estimation.ts packages/web-sdk/src/__tests__/token-estimation.test.ts
git commit -m "feat(web-sdk): add token estimation utility"
```

---

### Task 2: Model Context Window Lookup

**Files:**
- Create: `packages/web-sdk/src/model-context-windows.ts`
- Create: `packages/web-sdk/src/__tests__/model-context-windows.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/web-sdk/src/__tests__/model-context-windows.test.ts
import { describe, expect, it } from "vitest";
import { resolveModelContextWindow, DEFAULT_CONTEXT_WINDOW } from "../model-context-windows.js";

describe("resolveModelContextWindow", () => {
  it("returns exact match for known model", () => {
    expect(resolveModelContextWindow("gpt-4o")).toBe(128_000);
  });

  it("returns prefix match for versioned model", () => {
    expect(resolveModelContextWindow("claude-sonnet-4-20250514")).toBe(200_000);
  });

  it("returns prefix match for Ollama tagged model", () => {
    expect(resolveModelContextWindow("llama3.2:latest")).toBe(131_072);
  });

  it("returns default for unknown model", () => {
    expect(resolveModelContextWindow("totally-unknown-model")).toBe(DEFAULT_CONTEXT_WINDOW);
  });

  it("picks longest prefix match when multiple match", () => {
    // "llama3.2" should match over "llama3"
    expect(resolveModelContextWindow("llama3.2:7b")).toBe(131_072);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web-sdk && npx vitest run src/__tests__/model-context-windows.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```typescript
// packages/web-sdk/src/model-context-windows.ts

const MODEL_CONTEXT_WINDOWS: Readonly<Record<string, number>> = {
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

export const DEFAULT_CONTEXT_WINDOW = 4_096;

export function resolveModelContextWindow(modelId: string): number {
  // Exact match first
  const exact = MODEL_CONTEXT_WINDOWS[modelId];
  if (exact !== undefined) {
    return exact;
  }
  // Prefix match (longest match wins)
  let bestLength = 0;
  let bestSize = DEFAULT_CONTEXT_WINDOW;
  for (const [prefix, size] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (modelId.startsWith(prefix) && prefix.length > bestLength) {
      bestLength = prefix.length;
      bestSize = size;
    }
  }
  return bestSize;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web-sdk && npx vitest run src/__tests__/model-context-windows.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web-sdk/src/model-context-windows.ts packages/web-sdk/src/__tests__/model-context-windows.test.ts
git commit -m "feat(web-sdk): add static model context window lookup table"
```

---

### Task 3: ConversationManager Core — Construction, addMessage, getMessages, clear

**Files:**
- Create: `packages/web-sdk/src/conversation.ts`
- Create: `packages/web-sdk/src/__tests__/conversation.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/web-sdk/src/__tests__/conversation.test.ts
import { describe, expect, it } from "vitest";
import { ConversationManager } from "../conversation.js";
import type { ArlopassClient } from "../client.js";
import type { ChatMessage } from "../types.js";

// Minimal mock client — only needs selectedProvider for maxTokens resolution
function mockClient(modelId = "gpt-4o"): ArlopassClient {
  return {
    selectedProvider: { providerId: "test-provider", modelId },
  } as unknown as ArlopassClient;
}

describe("ConversationManager", () => {
  describe("construction", () => {
    it("uses developer-provided maxTokens", () => {
      const mgr = new ConversationManager({ client: mockClient(), maxTokens: 2048 });
      expect(mgr.maxTokens).toBe(2048);
    });

    it("falls back to static model lookup when maxTokens not provided", () => {
      const mgr = new ConversationManager({ client: mockClient("gpt-4o") });
      expect(mgr.maxTokens).toBe(128_000);
    });

    it("falls back to default for unknown models", () => {
      const mgr = new ConversationManager({ client: mockClient("unknown-model") });
      expect(mgr.maxTokens).toBe(4_096);
    });
  });

  describe("addMessage + getMessages", () => {
    it("stores messages in order", () => {
      const mgr = new ConversationManager({ client: mockClient(), maxTokens: 10_000 });
      mgr.addMessage({ role: "user", content: "Hello" });
      mgr.addMessage({ role: "assistant", content: "Hi there!" });
      const messages = mgr.getMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0]?.role).toBe("user");
      expect(messages[1]?.role).toBe("assistant");
    });

    it("includes system prompt as first message", () => {
      const mgr = new ConversationManager({
        client: mockClient(),
        maxTokens: 10_000,
        systemPrompt: "You are helpful.",
      });
      mgr.addMessage({ role: "user", content: "Hello" });
      const messages = mgr.getMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ role: "system", content: "You are helpful." });
    });
  });

  describe("clear", () => {
    it("removes all messages", () => {
      const mgr = new ConversationManager({ client: mockClient(), maxTokens: 10_000 });
      mgr.addMessage({ role: "user", content: "Hello" });
      mgr.clear();
      expect(mgr.getMessages()).toHaveLength(0);
    });

    it("preserves system prompt after clear", () => {
      const mgr = new ConversationManager({
        client: mockClient(),
        maxTokens: 10_000,
        systemPrompt: "System",
      });
      mgr.addMessage({ role: "user", content: "Hello" });
      mgr.clear();
      const messages = mgr.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]?.role).toBe("system");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web-sdk && npx vitest run src/__tests__/conversation.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

Create `packages/web-sdk/src/conversation.ts` with:

```typescript
import type { ArlopassClient } from "./client.js";
import type { ChatMessage, ChatStreamEvent } from "./types.js";
import { estimateTokenCount } from "./token-estimation.js";
import { resolveModelContextWindow } from "./model-context-windows.js";

type ManagedMessage = {
  message: ChatMessage;
  pinned: boolean;
  tokenEstimate: number;
  isSummary: boolean;
};

export type PinOptions = {
  pinned?: boolean;
};

export type ConversationManagerOptions = {
  client: ArlopassClient;
  maxTokens?: number;
  reserveOutputTokens?: number;
  systemPrompt?: string;
  summarize?: boolean;
  summarizationPrompt?: string;
};

const DEFAULT_RESERVE_OUTPUT_TOKENS = 1024;

export class ConversationManager {
  readonly #client: ArlopassClient;
  readonly #maxTokens: number;
  readonly #reserveOutputTokens: number;
  readonly #systemPrompt: string | undefined;
  readonly #summarize: boolean;
  readonly #summarizationPrompt: string;
  #messages: ManagedMessage[] = [];

  constructor(options: ConversationManagerOptions) {
    this.#client = options.client;
    this.#reserveOutputTokens = options.reserveOutputTokens ?? DEFAULT_RESERVE_OUTPUT_TOKENS;
    this.#systemPrompt = options.systemPrompt;
    this.#summarize = options.summarize ?? false;
    this.#summarizationPrompt = options.summarizationPrompt
      ?? "Summarize the following conversation concisely, preserving key facts, decisions, and context. Be brief.";

    // Resolve maxTokens: developer override > model lookup > default
    if (options.maxTokens !== undefined) {
      this.#maxTokens = options.maxTokens;
    } else {
      const modelId = options.client.selectedProvider?.modelId ?? "";
      this.#maxTokens = resolveModelContextWindow(modelId);
    }
  }

  get maxTokens(): number {
    return this.#maxTokens;
  }

  addMessage(message: ChatMessage, options?: PinOptions): void {
    this.#messages.push({
      message,
      pinned: options?.pinned ?? false,
      tokenEstimate: estimateTokenCount(message.content),
      isSummary: false,
    });
  }

  getMessages(): readonly ChatMessage[] {
    const result: ChatMessage[] = [];
    if (this.#systemPrompt !== undefined) {
      result.push({ role: "system", content: this.#systemPrompt });
    }
    for (const m of this.#messages) {
      result.push(m.message);
    }
    return result;
  }

  getContextWindow(): readonly ChatMessage[] {
    return this.#buildContextWindow();
  }

  getTokenCount(): number {
    const window = this.#buildContextWindow();
    let total = 0;
    for (const m of window) {
      total += estimateTokenCount(m.content);
    }
    return total;
  }

  setPin(index: number, pinned: boolean): void {
    // Index is relative to getMessages() which includes system prompt
    const offset = this.#systemPrompt !== undefined ? index - 1 : index;
    if (offset >= 0 && offset < this.#messages.length) {
      this.#messages[offset]!.pinned = pinned;
    }
  }

  clear(): void {
    this.#messages = [];
  }

  async send(content: string, options?: PinOptions): Promise<ChatMessage> {
    this.addMessage({ role: "user", content }, options);
    const contextWindow = await this.#prepareContextWindow();
    const result = await this.#client.chat.send({ messages: contextWindow });
    this.#messages.push({
      message: result.message,
      pinned: false,
      tokenEstimate: estimateTokenCount(result.message.content),
      isSummary: false,
    });
    return result.message;
  }

  async *stream(content: string, options?: PinOptions): AsyncIterable<ChatStreamEvent> {
    this.addMessage({ role: "user", content }, options);
    const contextWindow = await this.#prepareContextWindow();
    let fullContent = "";
    for await (const event of this.#client.chat.stream({ messages: contextWindow })) {
      if (event.type === "chunk") {
        fullContent += event.delta;
      }
      yield event;
    }
    if (fullContent.length > 0) {
      this.#messages.push({
        message: { role: "assistant", content: fullContent },
        pinned: false,
        tokenEstimate: estimateTokenCount(fullContent),
        isSummary: false,
      });
    }
  }

  #buildContextWindow(): ChatMessage[] {
    const budget = this.#maxTokens - this.#reserveOutputTokens;
    let remaining = budget;
    const result: ChatMessage[] = [];

    // 1. System prompt — always included
    if (this.#systemPrompt !== undefined) {
      const tokens = estimateTokenCount(this.#systemPrompt);
      remaining -= tokens;
      result.push({ role: "system", content: this.#systemPrompt });
    }

    // 2. Collect pinned and non-pinned
    const pinned: ManagedMessage[] = [];
    const nonPinned: ManagedMessage[] = [];
    for (const m of this.#messages) {
      if (m.pinned) {
        pinned.push(m);
      } else {
        nonPinned.push(m);
      }
    }

    // 3. Pinned messages — always included (deducted from budget)
    for (const m of pinned) {
      remaining -= m.tokenEstimate;
      // Include even if over budget — developer's responsibility
    }

    // 4. Non-pinned from most-recent to oldest
    const includedNonPinned: ManagedMessage[] = [];
    for (let i = nonPinned.length - 1; i >= 0; i--) {
      const m = nonPinned[i]!;
      if (remaining - m.tokenEstimate >= 0) {
        remaining -= m.tokenEstimate;
        includedNonPinned.unshift(m);
      } else {
        break; // All older messages are evicted
      }
    }

    // 5. Rebuild in original order: system + (pinned + included non-pinned interleaved by original order)
    const includedSet = new Set<ManagedMessage>([...pinned, ...includedNonPinned]);
    for (const m of this.#messages) {
      if (includedSet.has(m)) {
        result.push(m.message);
      }
    }

    return result;
  }

  async #prepareContextWindow(): Promise<readonly ChatMessage[]> {
    if (!this.#summarize) {
      return this.#buildContextWindow();
    }

    // Check if there are evicted messages
    const contextWindow = this.#buildContextWindow();
    const allMessages = this.getMessages();
    if (contextWindow.length >= allMessages.length) {
      return contextWindow; // Nothing evicted
    }

    // Find evicted non-pinned, non-summary messages
    const contextSet = new Set(contextWindow.map((m) => m.content));
    const evicted: ManagedMessage[] = [];
    for (const m of this.#messages) {
      if (!m.pinned && !m.isSummary && !contextSet.has(m.message.content)) {
        evicted.push(m);
      }
    }

    if (evicted.length === 0) {
      return contextWindow;
    }

    // Build summarization input
    const evictedText = evicted
      .map((m) => `${m.message.role}: ${m.message.content}`)
      .join("\n");

    try {
      const summaryResult = await this.#client.chat.send({
        messages: [
          { role: "system", content: this.#summarizationPrompt },
          { role: "user", content: evictedText },
        ],
      });

      // Remove old summary if present
      this.#messages = this.#messages.filter((m) => !m.isSummary);
      // Remove evicted messages
      const evictedSet = new Set(evicted);
      this.#messages = this.#messages.filter((m) => !evictedSet.has(m));

      // Insert summary at the beginning
      this.#messages.unshift({
        message: { role: "assistant", content: summaryResult.message.content },
        pinned: true,
        tokenEstimate: estimateTokenCount(summaryResult.message.content),
        isSummary: true,
      });

      return this.#buildContextWindow();
    } catch {
      // Summarization failed — fall back to simple truncation
      return contextWindow;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/web-sdk && npx vitest run src/__tests__/conversation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web-sdk/src/conversation.ts packages/web-sdk/src/__tests__/conversation.test.ts
git commit -m "feat(web-sdk): add ConversationManager core — construction, messages, clear"
```

---

### Task 4: ConversationManager — Context Window & Truncation Tests

**Files:**
- Modify: `packages/web-sdk/src/__tests__/conversation.test.ts`

- [ ] **Step 1: Add truncation tests**

Append to the existing test file:

```typescript
describe("getContextWindow truncation", () => {
  it("includes all messages when they fit within budget", () => {
    const mgr = new ConversationManager({ client: mockClient(), maxTokens: 10_000 });
    mgr.addMessage({ role: "user", content: "short" });
    mgr.addMessage({ role: "assistant", content: "also short" });
    const window = mgr.getContextWindow();
    expect(window).toHaveLength(2);
  });

  it("evicts oldest non-pinned messages when over budget", () => {
    // Budget: 100 tokens, reserve: 20. Available = 80 tokens ≈ 320 chars
    const mgr = new ConversationManager({ client: mockClient(), maxTokens: 100, reserveOutputTokens: 20 });
    mgr.addMessage({ role: "user", content: "a".repeat(200) }); // 50 tokens
    mgr.addMessage({ role: "assistant", content: "b".repeat(200) }); // 50 tokens
    mgr.addMessage({ role: "user", content: "c".repeat(100) }); // 25 tokens
    // Total: 125 tokens, budget: 80. Should evict oldest first.
    const window = mgr.getContextWindow();
    // Last two messages (75 tokens) fit, first doesn't with them
    expect(window).toHaveLength(2);
    expect(window[0]?.content).toBe("b".repeat(200));
    expect(window[1]?.content).toBe("c".repeat(100));
  });

  it("pins system prompt at position 0 and never evicts it", () => {
    const mgr = new ConversationManager({
      client: mockClient(),
      maxTokens: 50,
      reserveOutputTokens: 10,
      systemPrompt: "a".repeat(40), // 10 tokens
    });
    mgr.addMessage({ role: "user", content: "b".repeat(80) }); // 20 tokens
    mgr.addMessage({ role: "user", content: "c".repeat(40) }); // 10 tokens
    // Budget: 40. System=10, recent "c"=10, "b"=20 → "b" fits: 10+20+10=40
    const window = mgr.getContextWindow();
    expect(window[0]?.role).toBe("system");
    expect(window.length).toBeGreaterThanOrEqual(2); // system + at least recent
  });

  it("keeps pinned messages even when over budget", () => {
    const mgr = new ConversationManager({ client: mockClient(), maxTokens: 30, reserveOutputTokens: 0 });
    mgr.addMessage({ role: "user", content: "a".repeat(60) }, { pinned: true }); // 15 tokens
    mgr.addMessage({ role: "user", content: "b".repeat(60) }, { pinned: true }); // 15 tokens
    mgr.addMessage({ role: "user", content: "c".repeat(60) }); // 15 tokens — won't fit
    const window = mgr.getContextWindow();
    // Both pinned included (30 tokens = full budget), non-pinned evicted
    expect(window).toHaveLength(2);
    expect(window[0]?.content).toBe("a".repeat(60));
    expect(window[1]?.content).toBe("b".repeat(60));
  });

  it("preserves original message order in context window", () => {
    const mgr = new ConversationManager({ client: mockClient(), maxTokens: 200, reserveOutputTokens: 0 });
    mgr.addMessage({ role: "user", content: "first" });
    mgr.addMessage({ role: "assistant", content: "second" }, { pinned: true });
    mgr.addMessage({ role: "user", content: "third" });
    const window = mgr.getContextWindow();
    expect(window.map((m) => m.content)).toEqual(["first", "second", "third"]);
  });
});

describe("setPin", () => {
  it("pins a message by index", () => {
    const mgr = new ConversationManager({ client: mockClient(), maxTokens: 30, reserveOutputTokens: 0 });
    mgr.addMessage({ role: "user", content: "a".repeat(40) }); // 10 tokens
    mgr.addMessage({ role: "user", content: "b".repeat(40) }); // 10 tokens
    mgr.addMessage({ role: "user", content: "c".repeat(40) }); // 10 tokens
    // Pin first message
    mgr.setPin(0, true);
    // Budget is 30 → all fit. Now reduce budget:
    // Actually just verify the pin state by checking truncation behavior
    const mgr2 = new ConversationManager({ client: mockClient(), maxTokens: 25, reserveOutputTokens: 0 });
    mgr2.addMessage({ role: "user", content: "a".repeat(40) }); // 10 tokens
    mgr2.addMessage({ role: "user", content: "b".repeat(40) }); // 10 tokens
    mgr2.addMessage({ role: "user", content: "c".repeat(40) }); // 10 tokens
    // Without pin: keeps b+c (20 tokens)
    expect(mgr2.getContextWindow()).toHaveLength(2);
    // Pin first message
    mgr2.setPin(0, true);
    // With pin: a(pinned)=10 + c(recent)=10 = 20, fits in 25
    const window = mgr2.getContextWindow();
    expect(window).toHaveLength(2);
    expect(window[0]?.content).toBe("a".repeat(40));
    expect(window[1]?.content).toBe("c".repeat(40));
  });
});

describe("getTokenCount", () => {
  it("returns estimated token count for context window", () => {
    const mgr = new ConversationManager({ client: mockClient(), maxTokens: 10_000 });
    mgr.addMessage({ role: "user", content: "a".repeat(100) }); // 25 tokens
    expect(mgr.getTokenCount()).toBe(25);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/web-sdk && npx vitest run src/__tests__/conversation.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web-sdk/src/__tests__/conversation.test.ts
git commit -m "test(web-sdk): add context window truncation and pinning tests"
```

---

### Task 5: ConversationManager — send() and stream() Tests

**Files:**
- Modify: `packages/web-sdk/src/__tests__/conversation.test.ts`

These tests use the `MockTransport` and test helpers from the existing test infrastructure.

- [ ] **Step 1: Add send/stream tests**

Append to the test file. These tests require a fully connected `ArlopassClient`. Use the existing `setupConnectedClient` helper or build a minimal mock:

```typescript
import {
  MockTransport,
  setupConnectedClient,
  createResponseEnvelope,
} from "./test-helpers.js";
import type { ChatSendPayload, ChatSendResponsePayload, ChatStreamPayload, ChatStreamResponsePayload } from "../types.js";

describe("send()", () => {
  it("sends messages via client and appends response to history", async () => {
    const transport = new MockTransport();
    const { client } = await setupConnectedClient(transport);

    // Configure chat response
    transport.requestHandler = async (req) => {
      const capability = req.envelope.capability;
      if (capability === "chat.completions") {
        const payload: ChatSendResponsePayload = {
          message: { role: "assistant", content: "I am helpful." },
        };
        return { envelope: createResponseEnvelope(req, payload) };
      }
      throw new Error(`Unexpected capability: ${capability}`);
    };

    const mgr = new ConversationManager({ client, maxTokens: 10_000 });
    const response = await mgr.send("Hello");
    expect(response.content).toBe("I am helpful.");
    expect(mgr.getMessages()).toHaveLength(2); // user + assistant
    expect(mgr.getMessages()[0]?.role).toBe("user");
    expect(mgr.getMessages()[1]?.role).toBe("assistant");
  });
});

describe("stream()", () => {
  it("streams response and appends to history when done", async () => {
    const transport = new MockTransport();
    const { client } = await setupConnectedClient(transport);

    transport.streamHandler = async (req) => {
      const chunks: ChatStreamResponsePayload[] = [
        { type: "chunk", delta: "Hello ", index: 0 },
        { type: "chunk", delta: "world!", index: 1 },
        { type: "done" },
      ];
      return (async function* () {
        for (const chunk of chunks) {
          yield { envelope: createResponseEnvelope(req, chunk) };
        }
      })();
    };

    const mgr = new ConversationManager({ client, maxTokens: 10_000 });
    let full = "";
    for await (const event of mgr.stream("Hi")) {
      if (event.type === "chunk") full += event.delta;
    }
    expect(full).toBe("Hello world!");
    expect(mgr.getMessages()).toHaveLength(2);
    expect(mgr.getMessages()[1]?.content).toBe("Hello world!");
  });
});
```

Note: The `setupConnectedClient` helper handles connect + selectProvider. Check the existing helpers to make sure the mock is compatible. If `setupConnectedClient` doesn't exist or has a different shape, build a minimal connected client setup inline.

- [ ] **Step 2: Run tests**

Run: `cd packages/web-sdk && npx vitest run src/__tests__/conversation.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web-sdk/src/__tests__/conversation.test.ts
git commit -m "test(web-sdk): add ConversationManager send/stream integration tests"
```

---

### Task 6: Export ConversationManager from SDK

**Files:**
- Modify: `packages/web-sdk/src/index.ts`

- [ ] **Step 1: Add exports**

Add to `packages/web-sdk/src/index.ts`:

```typescript
export { ConversationManager, type ConversationManagerOptions, type PinOptions } from "./conversation.js";
export { resolveModelContextWindow, DEFAULT_CONTEXT_WINDOW } from "./model-context-windows.js";
export { estimateTokenCount } from "./token-estimation.js";
```

- [ ] **Step 2: Run full test suite**

Run: `cd packages/web-sdk && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: TypeScript check**

Run: `cd packages/web-sdk && npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Build**

Run: `cd packages/web-sdk && npm run build`
Expected: Success

- [ ] **Step 5: Commit**

```bash
git add packages/web-sdk/src/index.ts
git commit -m "feat(web-sdk): export ConversationManager and utilities"
```

---

### Task 7: Final Integration — Verify Cross-Package

- [ ] **Step 1: Run full web-sdk tests**

Run: `cd packages/web-sdk && npx vitest run`
Expected: All tests pass (13 existing + new)

- [ ] **Step 2: Run extension tests (ensure no breakage)**

Run: `cd apps/extension && npx vitest run`
Expected: All 192 tests pass

- [ ] **Step 3: TypeScript check all**

Run: `cd packages/web-sdk && npx tsc --noEmit && cd ../../apps/extension && npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Build extension**

Run: `cd apps/extension && npm run build`
Expected: Success (or pre-existing AppConnectWizard error only)
