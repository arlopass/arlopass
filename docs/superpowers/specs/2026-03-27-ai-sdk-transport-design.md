# @arlopass/ai-sdk-transport — Design Spec

> **Date:** 2026-03-27
> **Status:** Approved
> **Prereq:** [Vercel AI SDK Integration Analysis](../../vercel-ai-sdk-integration-analysis.md)

## Goal

Ship an npm package (`@arlopass/ai-sdk-transport`) that implements the Vercel AI SDK's `ChatTransport` interface, connecting `useChat` directly to the Arlopass browser extension. No API route, no server, no API keys.

## Public API

```typescript
import { ArlopassChatTransport } from "@arlopass/ai-sdk-transport";
import type { ArlopassChatTransportOptions } from "@arlopass/ai-sdk-transport";
```

### `ArlopassChatTransportOptions`

```typescript
type ArlopassChatTransportOptions = {
  // Auto-connect mode (default)
  appId?: string;
  appSuffix?: string;
  appName?: string;
  appDescription?: string;
  appIcon?: string;

  // BYOB mode — pre-connected client, skips auto-connect
  client?: ArlopassClient;

  // Shared
  timeoutMs?: number; // default 120_000
};
```

### Usage

```typescript
// Zero-config
useChat({ transport: new ArlopassChatTransport() });

// With app metadata
useChat({ transport: new ArlopassChatTransport({ appId: "com.acme.app", appName: "Acme" }) });

// Pre-connected client
useChat({ transport: new ArlopassChatTransport({ client: myConnectedClient }) });
```

## Architecture

`ArlopassChatTransport` implements `ChatTransport<UIMessage>` from the `ai` package. Two methods: `sendMessages()` and `reconnectToStream()`.

### Connection lifecycle

On first `sendMessages()` call (auto-connect mode):

1. Detect `window.arlopass`. Throw if missing.
2. Create `ArlopassClient({ transport: window.arlopass, timeoutMs })`.
3. Call `client.connect({ appId, appName, ... })`.
4. Cache client for subsequent calls.
5. If `client.selectedProvider` is `undefined`, throw: "No provider selected."

In BYOB mode (`client` option provided): skip all of the above, use the client directly.

### `sendMessages()` data flow

```
useChat → sendMessages({ messages, trigger, chatId, abortSignal })
  │
  ▼  convertMessages(UIMessage[]) → ChatMessage[]
  │   - Extract text from message.parts (TextUIPart only)
  │   - Flatten multi-part: join text parts with newlines
  │   - Pass through roles: "system" | "user" | "assistant"
  │   - Ignore non-text parts (files, tools, reasoning)
  │
  ▼  client.chat.stream({ messages }, { signal: abortSignal })
  │   - Returns AsyncIterable<ChatStreamEvent>
  │
  ▼  convertStream(iterable) → ReadableStream<UIMessageChunk>
      - Emit: { type: "start" }
      - Emit: { type: "text-start", id }
      - For each { type: "chunk", delta }:
          Emit: { type: "text-delta", id, delta }
      - On { type: "done" }:
          Emit: { type: "text-end", id }
          Emit: { type: "finish", finishReason: "stop" }
      - On error:
          Emit: { type: "error", errorText }
      - On abort:
          Emit: { type: "abort" }
```

### `reconnectToStream()`

Always returns `null`. No persistent server-side stream exists.

## Error handling

| Scenario | Behavior |
|---|---|
| Extension not installed | Throw: "Arlopass extension not detected. Install it from https://arlopassai.com" |
| Connection fails | Throw the `ArlopassSDKError` from `connect()` |
| No provider selected | Throw: "No provider selected. Open the Arlopass extension and choose a model." |
| Stream error mid-response | Emit `{ type: "error", errorText }` chunk, close stream |
| AbortSignal fires | Emit `{ type: "abort" }`, close stream |

## File structure

```
packages/ai-sdk-transport/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts                         # Re-exports
    ├── arlopass-chat-transport.ts           # ChatTransport implementation
    ├── convert-messages.ts              # UIMessage[] → ChatMessage[]
    ├── convert-stream.ts               # AsyncIterable<ChatStreamEvent> → ReadableStream<UIMessageChunk>
    └── __tests__/
        ├── arlopass-chat-transport.test.ts  # Integration tests with mocked client
        ├── convert-messages.test.ts     # Unit tests for message conversion
        └── convert-stream.test.ts       # Unit tests for stream conversion
```

## Dependencies

```json
{
  "peerDependencies": {
    "ai": "^6.0.0",
    "@arlopass/web-sdk": "^0.1.0"
  }
}
```

## Testing strategy

- **convert-messages**: Pure function tests. Text-only messages, multi-part flattening, role mapping, empty parts, assistant messages with tool/reasoning parts (ignored).
- **convert-stream**: Feed mock `ChatStreamEvent` arrays, collect `UIMessageChunk[]` from output `ReadableStream`. Verify event ordering: start → text-start → text-delta(s) → text-end → finish. Test error path and abort path.
- **arlopass-chat-transport**: Mock `ArlopassClient`. Verify: lazy connect on first call, client reuse on second call, BYOB mode bypasses connect, missing extension throws, missing provider throws, abort signal propagation.

## Design decisions

1. **No ConversationManager** — `useChat` manages its own history. We use raw `client.chat.stream()`.
2. **Stateless per-call** — each `sendMessages()` sends the full history provided by `useChat`.
3. **Provider selection is user-driven** — via the extension popup. The transport does not call `selectProvider()`.
4. **Text-only** — non-text parts from `UIMessage.parts` are skipped. Arlopass messages are `{ role, content: string }`.
