# @arlopass/ai-sdk-transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@arlopass/ai-sdk-transport` — a `ChatTransport` for the Vercel AI SDK's `useChat` hook that connects directly to the Arlopass browser extension, requiring no backend.

**Architecture:** Four source files in a new `packages/ai-sdk-transport/` workspace package. `ArlopassChatTransport` implements `ChatTransport<UIMessage>` from the `ai` package. Two pure converters handle message and stream transformation. Peer-depends on `ai` v6+ and `@arlopass/web-sdk`.

**Tech Stack:** TypeScript, Vitest, Vercel AI SDK v6 (`ai` package), `@arlopass/web-sdk`

---

### Task 1: Scaffold the package

**Files:**
- Create: `packages/ai-sdk-transport/package.json`
- Create: `packages/ai-sdk-transport/tsconfig.json`
- Create: `packages/ai-sdk-transport/src/index.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@arlopass/ai-sdk-transport",
  "version": "0.1.0",
  "license": "MIT",
  "type": "module",
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/arlopass/arlopass-web.git",
    "directory": "packages/ai-sdk-transport"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "peerDependencies": {
    "ai": "^6.0.0",
    "@arlopass/web-sdk": "^0.1.0"
  },
  "devDependencies": {
    "ai": "^6.0.0",
    "@arlopass/web-sdk": "0.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Create placeholder `src/index.ts`**

```typescript
// @arlopass/ai-sdk-transport
// Vercel AI SDK ChatTransport for the Arlopass browser extension.
export {};
```

- [ ] **Step 4: Install dependencies**

Run: `cd d:\Projects\arlopass-web && npm install`
Expected: Lock file updates, workspace linked.

- [ ] **Step 5: Verify build**

Run: `npm run build -w @arlopass/ai-sdk-transport`
Expected: Clean compilation, `dist/index.js` + `dist/index.d.ts` created.

- [ ] **Step 6: Commit**

```bash
git add packages/ai-sdk-transport/
git commit -m "feat(ai-sdk-transport): scaffold package"
```

---

### Task 2: Message converter — `convertMessages`

**Files:**
- Create: `packages/ai-sdk-transport/src/convert-messages.ts`
- Create: `packages/ai-sdk-transport/src/__tests__/convert-messages.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from "vitest";
import { convertMessages } from "../convert-messages.js";

describe("convertMessages", () => {
  it("converts a simple user text message", () => {
    const result = convertMessages([
      {
        id: "1",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
      },
    ]);
    expect(result).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("converts a system message", () => {
    const result = convertMessages([
      {
        id: "0",
        role: "system",
        parts: [{ type: "text", text: "You are helpful." }],
      },
    ]);
    expect(result).toEqual([{ role: "system", content: "You are helpful." }]);
  });

  it("converts an assistant message with text", () => {
    const result = convertMessages([
      {
        id: "2",
        role: "assistant",
        parts: [{ type: "text", text: "Hi there!" }],
      },
    ]);
    expect(result).toEqual([{ role: "assistant", content: "Hi there!" }]);
  });

  it("joins multiple text parts with newlines", () => {
    const result = convertMessages([
      {
        id: "1",
        role: "user",
        parts: [
          { type: "text", text: "Part one" },
          { type: "text", text: "Part two" },
        ],
      },
    ]);
    expect(result).toEqual([{ role: "user", content: "Part one\nPart two" }]);
  });

  it("ignores non-text parts", () => {
    const result = convertMessages([
      {
        id: "2",
        role: "assistant",
        parts: [
          { type: "text", text: "Here is the answer" },
          { type: "file", url: "data:image/png;base64,abc", mediaType: "image/png" },
          { type: "reasoning", text: "thinking..." },
        ],
      },
    ] as any);
    expect(result).toEqual([
      { role: "assistant", content: "Here is the answer" },
    ]);
  });

  it("skips messages with no text content", () => {
    const result = convertMessages([
      {
        id: "1",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
      },
      {
        id: "2",
        role: "assistant",
        parts: [{ type: "file", url: "data:image/png;abc", mediaType: "image/png" }],
      },
    ] as any);
    expect(result).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("handles a full conversation", () => {
    const result = convertMessages([
      { id: "0", role: "system", parts: [{ type: "text", text: "Be concise." }] },
      { id: "1", role: "user", parts: [{ type: "text", text: "What is 2+2?" }] },
      { id: "2", role: "assistant", parts: [{ type: "text", text: "4" }] },
      { id: "3", role: "user", parts: [{ type: "text", text: "Thanks" }] },
    ]);
    expect(result).toEqual([
      { role: "system", content: "Be concise." },
      { role: "user", content: "What is 2+2?" },
      { role: "assistant", content: "4" },
      { role: "user", content: "Thanks" },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(convertMessages([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ai-sdk-transport/src/__tests__/convert-messages.test.ts`
Expected: FAIL — `convertMessages` not found.

- [ ] **Step 3: Implement `convert-messages.ts`**

```typescript
import type { ChatMessage } from "@arlopass/web-sdk";

type UIMessageLike = Readonly<{
  id: string;
  role: "system" | "user" | "assistant";
  parts: ReadonlyArray<{ type: string; text?: string }>;
}>;

export function convertMessages(messages: readonly UIMessageLike[]): ChatMessage[] {
  const result: ChatMessage[] = [];

  for (const msg of messages) {
    const textParts: string[] = [];
    for (const part of msg.parts) {
      if (part.type === "text" && typeof part.text === "string" && part.text.length > 0) {
        textParts.push(part.text);
      }
    }
    if (textParts.length === 0) continue;

    result.push({
      role: msg.role,
      content: textParts.join("\n"),
    });
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/ai-sdk-transport/src/__tests__/convert-messages.test.ts`
Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai-sdk-transport/src/convert-messages.ts packages/ai-sdk-transport/src/__tests__/convert-messages.test.ts
git commit -m "feat(ai-sdk-transport): add UIMessage → ChatMessage converter"
```

---

### Task 3: Stream converter — `convertStream`

**Files:**
- Create: `packages/ai-sdk-transport/src/convert-stream.ts`
- Create: `packages/ai-sdk-transport/src/__tests__/convert-stream.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from "vitest";
import { convertStream } from "../convert-stream.js";

async function collectChunks(stream: ReadableStream<any>): Promise<any[]> {
  const reader = stream.getReader();
  const chunks: any[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

async function* yieldEvents(...events: any[]): AsyncIterable<any> {
  for (const e of events) yield e;
}

describe("convertStream", () => {
  it("emits start → text-start → text-delta(s) → text-end → finish for a normal stream", async () => {
    const source = yieldEvents(
      { type: "chunk", delta: "Hello", index: 0, correlationId: "c1" },
      { type: "chunk", delta: " world", index: 1, correlationId: "c1" },
      { type: "done", correlationId: "c1" },
    );

    const chunks = await collectChunks(convertStream(source));
    const types = chunks.map((c: any) => c.type);

    expect(types).toEqual([
      "start",
      "text-start",
      "text-delta",
      "text-delta",
      "text-end",
      "finish",
    ]);
    expect(chunks[2].delta).toBe("Hello");
    expect(chunks[3].delta).toBe(" world");
    expect(chunks[5].finishReason).toBe("stop");
  });

  it("uses the same id for text-start, text-delta, and text-end", async () => {
    const source = yieldEvents(
      { type: "chunk", delta: "Hi", index: 0, correlationId: "c1" },
      { type: "done", correlationId: "c1" },
    );

    const chunks = await collectChunks(convertStream(source));
    const textStart = chunks.find((c: any) => c.type === "text-start");
    const textDelta = chunks.find((c: any) => c.type === "text-delta");
    const textEnd = chunks.find((c: any) => c.type === "text-end");

    expect(textStart.id).toBeDefined();
    expect(textDelta.id).toBe(textStart.id);
    expect(textEnd.id).toBe(textStart.id);
  });

  it("emits error chunk when the source throws", async () => {
    async function* failing(): AsyncIterable<any> {
      yield { type: "chunk", delta: "partial", index: 0, correlationId: "c1" };
      throw new Error("connection lost");
    }

    const chunks = await collectChunks(convertStream(failing()));
    const errorChunk = chunks.find((c: any) => c.type === "error");

    expect(errorChunk).toBeDefined();
    expect(errorChunk.errorText).toBe("connection lost");
  });

  it("emits abort chunk when signal is aborted", async () => {
    const controller = new AbortController();

    async function* slow(): AsyncIterable<any> {
      yield { type: "chunk", delta: "Hi", index: 0, correlationId: "c1" };
      // Simulate delay — abort fires before next yield
      await new Promise((r) => setTimeout(r, 50));
      yield { type: "done", correlationId: "c1" };
    }

    // Abort after 10ms
    setTimeout(() => controller.abort(), 10);

    const chunks = await collectChunks(convertStream(slow(), controller.signal));
    const types = chunks.map((c: any) => c.type);

    expect(types).toContain("abort");
  });

  it("handles empty stream (done immediately)", async () => {
    const source = yieldEvents(
      { type: "done", correlationId: "c1" },
    );

    const chunks = await collectChunks(convertStream(source));
    const types = chunks.map((c: any) => c.type);

    expect(types).toEqual(["start", "finish"]);
    expect(chunks[1].finishReason).toBe("stop");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ai-sdk-transport/src/__tests__/convert-stream.test.ts`
Expected: FAIL — `convertStream` not found.

- [ ] **Step 3: Implement `convert-stream.ts`**

```typescript
type ChatStreamEvent =
  | Readonly<{ type: "chunk"; delta: string; index: number; correlationId: string }>
  | Readonly<{ type: "done"; correlationId: string }>;

type UIMessageChunkLike =
  | { type: "start" }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "finish"; finishReason: string }
  | { type: "error"; errorText: string }
  | { type: "abort"; reason?: string };

function generatePartId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function convertStream(
  source: AsyncIterable<ChatStreamEvent>,
  signal?: AbortSignal,
): ReadableStream<UIMessageChunkLike> {
  return new ReadableStream<UIMessageChunkLike>({
    async start(controller) {
      const partId = generatePartId();
      let textStarted = false;

      try {
        controller.enqueue({ type: "start" });

        for await (const event of source) {
          if (signal?.aborted) {
            if (textStarted) controller.enqueue({ type: "text-end", id: partId });
            controller.enqueue({ type: "abort" });
            controller.close();
            return;
          }

          if (event.type === "chunk") {
            if (!textStarted) {
              controller.enqueue({ type: "text-start", id: partId });
              textStarted = true;
            }
            controller.enqueue({ type: "text-delta", id: partId, delta: event.delta });
          }

          if (event.type === "done") {
            if (textStarted) controller.enqueue({ type: "text-end", id: partId });
            controller.enqueue({ type: "finish", finishReason: "stop" });
            controller.close();
            return;
          }
        }

        // Source exhausted without "done" event
        if (textStarted) controller.enqueue({ type: "text-end", id: partId });
        controller.enqueue({ type: "finish", finishReason: "stop" });
        controller.close();
      } catch (err) {
        if (signal?.aborted) {
          if (textStarted) controller.enqueue({ type: "text-end", id: partId });
          controller.enqueue({ type: "abort" });
        } else {
          if (textStarted) controller.enqueue({ type: "text-end", id: partId });
          const message = err instanceof Error ? err.message : String(err);
          controller.enqueue({ type: "error", errorText: message });
        }
        controller.close();
      }
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/ai-sdk-transport/src/__tests__/convert-stream.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai-sdk-transport/src/convert-stream.ts packages/ai-sdk-transport/src/__tests__/convert-stream.test.ts
git commit -m "feat(ai-sdk-transport): add ChatStreamEvent → UIMessageChunk stream converter"
```

---

### Task 4: ArlopassChatTransport class

**Files:**
- Create: `packages/ai-sdk-transport/src/arlopass-chat-transport.ts`
- Create: `packages/ai-sdk-transport/src/__tests__/arlopass-chat-transport.test.ts`
- Modify: `packages/ai-sdk-transport/src/index.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it, vi } from "vitest";
import { ArlopassChatTransport } from "../arlopass-chat-transport.js";

function createMockClient(overrides: Record<string, any> = {}) {
  return {
    state: "connected",
    selectedProvider: { providerId: "openai", modelId: "gpt-4o" },
    connect: vi.fn().mockResolvedValue({ sessionId: "s1", capabilities: [], protocolVersion: "1.0.0", correlationId: "c1" }),
    chat: {
      stream: vi.fn().mockReturnValue((async function* () {
        yield { type: "chunk", delta: "Hi", index: 0, correlationId: "c1" };
        yield { type: "done", correlationId: "c1" };
      })()),
    },
    ...overrides,
  } as any;
}

const trivialMessages = [
  { id: "1", role: "user" as const, parts: [{ type: "text" as const, text: "Hello" }] },
];

describe("ArlopassChatTransport", () => {
  it("uses the provided client in BYOB mode", async () => {
    const client = createMockClient();
    const transport = new ArlopassChatTransport({ client });

    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat1",
      messageId: undefined,
      messages: trivialMessages,
      abortSignal: undefined,
    } as any);

    expect(client.connect).not.toHaveBeenCalled();
    expect(client.chat.stream).toHaveBeenCalled();
    expect(stream).toBeInstanceOf(ReadableStream);
  });

  it("throws when extension is not installed (auto-connect, no window.arlopass)", async () => {
    const transport = new ArlopassChatTransport({ appId: "test" });

    await expect(
      transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat1",
        messageId: undefined,
        messages: trivialMessages,
        abortSignal: undefined,
      } as any),
    ).rejects.toThrow(/Arlopass extension not detected/);
  });

  it("throws when no provider is selected", async () => {
    const client = createMockClient({ selectedProvider: undefined });
    const transport = new ArlopassChatTransport({ client });

    await expect(
      transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat1",
        messageId: undefined,
        messages: trivialMessages,
        abortSignal: undefined,
      } as any),
    ).rejects.toThrow(/No provider selected/);
  });

  it("reuses the client across multiple calls (BYOB mode)", async () => {
    const client = createMockClient();
    const transport = new ArlopassChatTransport({ client });

    await transport.sendMessages({
      trigger: "submit-message", chatId: "chat1", messageId: undefined,
      messages: trivialMessages, abortSignal: undefined,
    } as any);

    // Second call should reuse
    client.chat.stream.mockReturnValue((async function* () {
      yield { type: "chunk", delta: "Again", index: 0, correlationId: "c2" };
      yield { type: "done", correlationId: "c2" };
    })());

    await transport.sendMessages({
      trigger: "submit-message", chatId: "chat1", messageId: undefined,
      messages: trivialMessages, abortSignal: undefined,
    } as any);

    expect(client.chat.stream).toHaveBeenCalledTimes(2);
    expect(client.connect).not.toHaveBeenCalled();
  });

  it("passes abort signal to the stream", async () => {
    const controller = new AbortController();
    const client = createMockClient();
    const transport = new ArlopassChatTransport({ client });

    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat1",
      messageId: undefined,
      messages: trivialMessages,
      abortSignal: controller.signal,
    } as any);

    expect(stream).toBeInstanceOf(ReadableStream);
    // Verify signal was forwarded to client.chat.stream
    const callArgs = client.chat.stream.mock.calls[0];
    expect(callArgs[1]?.signal).toBe(controller.signal);
  });

  it("reconnectToStream returns null", async () => {
    const transport = new ArlopassChatTransport({ client: createMockClient() });
    const result = await transport.reconnectToStream({ chatId: "chat1" } as any);
    expect(result).toBeNull();
  });

  it("converts UIMessages to ChatMessages before streaming", async () => {
    const client = createMockClient();
    const transport = new ArlopassChatTransport({ client });

    await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat1",
      messageId: undefined,
      messages: [
        { id: "0", role: "system", parts: [{ type: "text", text: "Be brief." }] },
        { id: "1", role: "user", parts: [{ type: "text", text: "Hi" }] },
      ],
      abortSignal: undefined,
    } as any);

    const chatInput = client.chat.stream.mock.calls[0][0];
    expect(chatInput.messages).toEqual([
      { role: "system", content: "Be brief." },
      { role: "user", content: "Hi" },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ai-sdk-transport/src/__tests__/arlopass-chat-transport.test.ts`
Expected: FAIL — `ArlopassChatTransport` not found.

- [ ] **Step 3: Implement `arlopass-chat-transport.ts`**

```typescript
import { ArlopassClient, type ArlopassTransport, type ChatMessage } from "@arlopass/web-sdk";
import { convertMessages } from "./convert-messages.js";
import { convertStream } from "./convert-stream.js";

export type ArlopassChatTransportOptions = Readonly<{
  appId?: string;
  appSuffix?: string;
  appName?: string;
  appDescription?: string;
  appIcon?: string;
  client?: ArlopassClient;
  timeoutMs?: number;
}>;

type SendMessagesOptions = Readonly<{
  trigger: "submit-message" | "regenerate-message";
  chatId: string;
  messageId: string | undefined;
  messages: ReadonlyArray<{
    id: string;
    role: "system" | "user" | "assistant";
    parts: ReadonlyArray<{ type: string; text?: string }>;
  }>;
  abortSignal: AbortSignal | undefined;
}>;

type ReconnectOptions = Readonly<{
  chatId: string;
}>;

type UIMessageChunkLike =
  | { type: "start" }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "finish"; finishReason: string }
  | { type: "error"; errorText: string }
  | { type: "abort"; reason?: string };

function getInjectedTransport(): ArlopassTransport | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { arlopass?: ArlopassTransport }).arlopass;
}

export class ArlopassChatTransport {
  readonly #options: ArlopassChatTransportOptions;
  #client: ArlopassClient | undefined;
  #connectPromise: Promise<ArlopassClient> | undefined;

  constructor(options: ArlopassChatTransportOptions = {}) {
    this.#options = options;
    if (options.client !== undefined) {
      this.#client = options.client;
    }
  }

  async sendMessages(
    options: SendMessagesOptions,
  ): Promise<ReadableStream<UIMessageChunkLike>> {
    const client = await this.#ensureClient();

    if (client.selectedProvider === undefined) {
      throw new Error(
        "No provider selected. Open the Arlopass extension and choose a model.",
      );
    }

    const chatMessages = convertMessages(options.messages as any);
    const signal = options.abortSignal;

    const iterable = client.chat.stream(
      { messages: chatMessages },
      signal !== undefined ? { signal } : undefined,
    );

    return convertStream(iterable, signal ?? undefined);
  }

  async reconnectToStream(
    _options: ReconnectOptions,
  ): Promise<ReadableStream<UIMessageChunkLike> | null> {
    return null;
  }

  async #ensureClient(): Promise<ArlopassClient> {
    if (this.#client !== undefined) return this.#client;

    // Deduplicate concurrent connect attempts
    if (this.#connectPromise !== undefined) return this.#connectPromise;

    this.#connectPromise = this.#autoConnect();
    try {
      const client = await this.#connectPromise;
      this.#client = client;
      return client;
    } finally {
      this.#connectPromise = undefined;
    }
  }

  async #autoConnect(): Promise<ArlopassClient> {
    const transport = getInjectedTransport();
    if (transport === undefined) {
      throw new Error(
        "Arlopass extension not detected. Install it from https://arlopass.com to use AI models.",
      );
    }

    const timeoutMs = this.#options.timeoutMs ?? 120_000;
    const client = new ArlopassClient({
      transport,
      origin: typeof window !== "undefined" ? window.location.origin : undefined,
      timeoutMs,
    });

    await client.connect({
      ...(this.#options.appId !== undefined ? { appId: this.#options.appId } : {}),
      ...(this.#options.appSuffix !== undefined ? { appSuffix: this.#options.appSuffix } : {}),
      ...(this.#options.appName !== undefined ? { appName: this.#options.appName } : {}),
      ...(this.#options.appDescription !== undefined ? { appDescription: this.#options.appDescription } : {}),
      ...(this.#options.appIcon !== undefined ? { appIcon: this.#options.appIcon } : {}),
    });

    return client;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/ai-sdk-transport/src/__tests__/arlopass-chat-transport.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai-sdk-transport/src/arlopass-chat-transport.ts packages/ai-sdk-transport/src/__tests__/arlopass-chat-transport.test.ts
git commit -m "feat(ai-sdk-transport): implement ArlopassChatTransport"
```

---

### Task 5: Wire up exports & final build

**Files:**
- Modify: `packages/ai-sdk-transport/src/index.ts`

- [ ] **Step 1: Update `index.ts` with all exports**

```typescript
export { ArlopassChatTransport } from "./arlopass-chat-transport.js";
export type { ArlopassChatTransportOptions } from "./arlopass-chat-transport.js";
export { convertMessages } from "./convert-messages.js";
export { convertStream } from "./convert-stream.js";
```

- [ ] **Step 2: Build the package**

Run: `npm run build -w @arlopass/ai-sdk-transport`
Expected: Clean compilation.

- [ ] **Step 3: Run all package tests**

Run: `npx vitest run packages/ai-sdk-transport/`
Expected: All tests PASS (message converter + stream converter + transport).

- [ ] **Step 4: Run full workspace test suite for regressions**

Run: `npx vitest run packages/ 2>&1 | Select-String "Test Files|Tests "`
Expected: All existing packages still pass. No regressions.

- [ ] **Step 5: Commit**

```bash
git add packages/ai-sdk-transport/src/index.ts
git commit -m "feat(ai-sdk-transport): wire up exports"
```

---

### Task 6: README

**Files:**
- Create: `packages/ai-sdk-transport/README.md`

- [ ] **Step 1: Write the README**

The README should include:
- One-line description: "Vercel AI SDK ChatTransport for the Arlopass browser extension — use useChat with any AI model, no API route needed."
- Install: `npm install @arlopass/ai-sdk-transport ai @arlopass/web-sdk`
- Prerequisite: Arlopass browser extension installed
- Quick start example (zero-config `useChat`)
- Advanced example (BYOB client mode)
- Options table
- How it works (brief architecture)
- Link to the Arlopass docs app

- [ ] **Step 2: Commit**

```bash
git add packages/ai-sdk-transport/README.md
git commit -m "docs(ai-sdk-transport): add README"
```
