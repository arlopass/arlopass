# @arlopass/react — React SDK Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Package:** `@arlopass/react`
**Location:** `packages/react-sdk/`

---

## 1. Overview

A React SDK built on `@arlopass/web-sdk` that provides hooks, providers, guard components, error boundaries, and testing utilities for integrating Arlopass into React applications.

**Dependency chain:**
```
@arlopass/react  →  @arlopass/web-sdk  →  @arlopass/protocol
     (React layer)      (Core client)       (Envelope types)
```

**Four pillars:** robustness, reliability, extensibility, airtight security.

**Target:** React 18+ (peer dependency `^18.0.0 || ^19.0.0`).

**Client-only SDK.** This package uses browser APIs (`window.arlopass`, `requestAnimationFrame`, `AbortController`) and cannot run on a server. All entry points include `'use client'` directives for React Server Component compatibility. In Next.js, wrap `<ArlopassProvider>` at the route/layout level — do not use Arlopass hooks inside server components.

---

## 2. Architecture

**Pattern:** Adapter + Store + Hooks

```
┌─────────────────────────────────────────────────────────┐
│  Developer's React App                                   │
│                                                          │
│  <ArlopassProvider appId="my-app">                          │
│    <ArlopassChatReadyGate ...>                              │
│      <ChatUI />  ← useChat(), useConnection()           │
│    </ArlopassChatReadyGate>                                 │
│  </ArlopassProvider>                                         │
│                                                          │
├─────────────────────────────────────────────────────────┤
│  @arlopass/react                                          │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐              │
│  │ Provider  │  │  Hooks   │  │  Guards   │              │
│  │ Context   │  │          │  │           │              │
│  │          │  │ useChat   │  │ Arlopass*Gate │              │
│  │ Client   │  │ useConn   │  │ Arlopass*     │              │
│  │ Store    │  │ useProvs  │  │ (pos/neg) │              │
│  │ Adapter  │  │ useClient │  │           │              │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘              │
│       │              │              │                    │
│  ┌────┴──────────────┴──────────────┴─────┐              │
│  │  ClientStore (useSyncExternalStore)     │              │
│  │  - subscribe/getSnapshot adapter        │              │
│  │  - state, sessionId, provider, errors   │              │
│  └────────────────┬───────────────────────┘              │
│                   │                                      │
├───────────────────┼──────────────────────────────────────┤
│  @arlopass/web-sdk │                                      │
│  ┌────────────────┴───────────────────┐                  │
│  │  ArlopassClient                         │                  │
│  │  - connect/disconnect               │                  │
│  │  - listProviders/selectProvider     │                  │
│  │  - chat.send / chat.stream          │                  │
│  └────────────────┬───────────────────┘                  │
│                   │                                      │
│  ┌────────────────┴───────────────────┐                  │
│  │  InjectedTransport (window.arlopass)    │                  │
│  └────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────┘
```

**Key principles:**
- Single source of truth: `ArlopassClient` owns state; React subscribes via `useSyncExternalStore`
- Injected transport only: production path is `window.arlopass` from browser extension
- Zero-config defaults: `<ArlopassProvider appId="x">` is the minimum viable setup
- Concurrent-mode safe: `useSyncExternalStore` guarantees tear-free reads

---

## 3. Transport Strategy

**Production:** Injected transport only — `window.arlopass` set by the Arlopass browser extension. Other connection methods (bridge, demo) are local development concerns, not exposed in the React SDK. Allowing arbitrary transport targets from web apps would bypass the extension's trust boundary.

**Testing:** `createMockTransport()` from `@arlopass/react/testing` subpath. Never bundled into production.

**Detection logic:**
```ts
function getInjectedTransport(): ArlopassTransport | null {
  if (typeof window !== "undefined" && window.arlopass &&
      typeof window.arlopass.request === "function") {
    return window.arlopass as ArlopassTransport
  }
  return null
}
```

Runtime shape validation — checks `request` method exists, not just `window.arlopass` presence.

### TypeScript declaration

The SDK ships a `global.d.ts` that augments the `Window` interface:

```ts
import type { ArlopassTransport } from '@arlopass/web-sdk';

declare global {
  interface Window {
    arlopass?: ArlopassTransport;
  }
}
```

Developers do not need to add their own type augmentation — importing from `@arlopass/react` is sufficient.

---

## 4. ClientStore — State Synchronization Layer

The internal bridge between `ArlopassClient` and React.

### Snapshot type

```ts
type ClientSnapshot = Readonly<{
  state: ClientState              // "disconnected" | "connecting" | "connected" | ...
  sessionId: string | null
  selectedProvider: { providerId: string; modelId: string } | null
  providers: readonly ProviderDescriptor[]
  error: ArlopassSDKError | null
}>
```

### How it works

- Holds a `ArlopassClient` instance and a mutable snapshot
- **Primary sync path:** every SDK operation (`connect`, `disconnect`, `listProviders`, `selectProvider`, `chat.send`, `chat.stream`) is wrapped by the `ClientStore`. After each operation completes (or fails), the store reads the client's current state via getters (`.state`, `.sessionId`, `.selectedProvider`), builds a new snapshot, and synchronously notifies all subscribers. This is the main mechanism — React is always notified within the same microtask as the state change.
- **Safety-net polling:** `ArlopassClient` has no event emitter (only getter properties). To detect external state changes not triggered by SDK operations (e.g., extension unloads, transport drops), the store runs a lightweight polling interval (every 500ms) that compares `client.state` against the last-known snapshot. If different, it builds a new snapshot and notifies. This adds at most 500ms latency for externally-triggered disconnects — acceptable for a safety net. The polling interval is stopped on unmount.
- **Future optimization:** if `ArlopassClient` adds an `on('stateChange', cb)` event emitter in a future version, the polling can be removed entirely. The `ClientStore` is designed to support both patterns.
- `subscribe(callback)` and `getSnapshot()` conform to `useSyncExternalStore` contract
- Snapshot objects are immutable — only replaced when values actually change (referential equality check prevents unnecessary React re-renders)

### Lifecycle

```
ArlopassProvider mounts
  → creates ArlopassClient + ClientStore
  → store holds client ref + initial snapshot
  → hooks subscribe via useSyncExternalStore

SDK operation (e.g. connect)
  → store calls client.connect()
  → on success/failure: builds new snapshot
  → notifies subscribers → React re-renders

External disconnect (extension unloads)
  → polling heartbeat (500ms) detects client.state ≠ snapshot.state
  → builds new snapshot → notifies subscribers → React re-renders
  → (max 500ms latency for externally-triggered changes)

ArlopassProvider unmounts
  → store calls client.disconnect()
  → clears snapshot, unsubscribes all
```

---

## 5. Provider Component

### `<ArlopassProvider>`

```tsx
<ArlopassProvider
  appId="my-app"                              // Required
  defaultProvider="provider.ollama"            // Optional: auto-select on connect
  defaultModel="model.llama3"                 // Optional: auto-select on connect
  autoConnect={true}                          // Optional: default true
  onError={(error) => reportToSentry(error)}  // Optional: global error callback
>
  {children}
</ArlopassProvider>
```

**Mount sequence:**
1. Checks `window.arlopass` for injected transport
2. If not found → state = `"disconnected"` with descriptive error (extension not installed)
3. If found → creates `ArlopassClient` with injected transport
4. If `autoConnect={true}` → calls `client.connect({ appId })`
5. If `defaultProvider` + `defaultModel` set and connect succeeds → calls `client.selectProvider()` automatically. On failure (e.g., provider not in list, model not available), the error is set in the store's `error` field — the app can render error UI or fall back to `useProviders().selectProvider()` for manual selection. The connection remains active.
6. Stores `ClientStore` in React context

**Unmount:** calls `client.disconnect()`, clears store, cancels in-flight operations.

### Cleanup & unmount during active operations

When `<ArlopassProvider>` unmounts:
1. All active `AbortController` instances are aborted
2. In-progress `chat.stream()` and `conversationManager.stream()` generators receive abort signal and stop iteration
3. `useChat()` and `useConversation()` set `error` to an abort error (retryable) if a stream was in progress
4. The `messages` array is **preserved in local hook state** — if the parent component persists, messages survive. If `useChat` also unmounts, messages are lost unless the developer saves them (e.g., to context, localStorage, or parent state)
5. Polling heartbeat interval is cleared
6. `client.disconnect()` is called as fire-and-forget (best-effort cleanup)

**Developer responsibility:**
- To persist messages across navigation, lift message state or save to localStorage
- To resume streams after remount, implement retry logic using the `retry()` function

**Context shape (internal, not exported):**
```ts
type ArlopassContextValue = Readonly<{
  store: ClientStore
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  listProviders: () => Promise<readonly ProviderDescriptor[]>
  selectProvider: (input: SelectProviderInput) => Promise<SelectProviderResult>
  sendChat: (input: ChatInput, options?: ChatOperationOptions) => Promise<ChatSendResult>
  streamChat: (input: ChatInput, options?: ChatOperationOptions) => AsyncIterable<ChatStreamEvent>
}>
```

---

## 6. Hooks API

All hooks throw if used outside `<ArlopassProvider>`.

### `useConnection()`

```ts
const {
  state,          // ClientState
  sessionId,      // string | null
  isConnected,    // boolean (derived)
  isConnecting,   // boolean (derived)
  error,          // ArlopassSDKError | null
  connect,        // () => Promise<void>
  disconnect,     // () => Promise<void>
  retry,          // (() => Promise<void>) | null — when error.retryable
} = useConnection()
```

Uses `useSyncExternalStore` to subscribe to `state`, `sessionId`, `error` from the store.

### `useProviders()`

```ts
const {
  providers,        // readonly ProviderDescriptor[]
  selectedProvider, // { providerId, modelId } | null
  isLoading,        // boolean
  error,            // ArlopassSDKError | null
  listProviders,    // () => Promise<readonly ProviderDescriptor[]>
  selectProvider,   // (input: SelectProviderInput) => Promise<SelectProviderResult>
  retry,            // (() => Promise<void>) | null
} = useProviders()
```

Auto-fetches provider list when connection becomes `"connected"`.

**Auto-fetch behavior:**
- Triggers once when `connection.state` transitions to `"connected"`
- Developer can manually call `listProviders()` at any time
- If both auto-fetch and manual call are in flight, last-write-wins — the result of whichever call completes last is stored
- `isLoading` is `true` if any call is in progress (auto or manual)
- Recommendation: either rely on auto-fetch alone, or set `autoConnect={false}` and manage manually

### Shared types (used by both `useChat` and `useConversation`)

```ts
type MessageId = string  // "msg.<random>"

type ToolCallInfo = Readonly<{
  toolCallId: string
  name: string
  arguments: Record<string, unknown>
  result?: string
  status: "pending" | "executing" | "complete" | "error"
}>

type TrackedChatMessage = Readonly<{
  id: MessageId
  role: ChatRole
  content: string
  inResponseTo?: MessageId   // On assistant messages, points to user message
  status: "pending" | "streaming" | "complete" | "error"
  pinned: boolean             // Whether message is pinned (ConversationManager)
  toolCalls?: readonly ToolCallInfo[]  // If model requested tool calls
}>

type SubscriptionEvent = 'response' | 'stream' | 'error' | 'tool_call' | 'tool_result';

type ChatSubscribe = {
  (event: 'response', messageId: MessageId, handler: (msg: TrackedChatMessage) => void): () => void;
  (event: 'response', handler: (msg: TrackedChatMessage) => void): () => void;
  (event: 'stream', messageId: MessageId, handler: (delta: string, accumulated: string) => void): () => void;
  (event: 'error', handler: (error: ArlopassSDKError, messageId: MessageId | null) => void): () => void;
  (event: 'error', messageId: MessageId, handler: (error: ArlopassSDKError) => void): () => void;
  (event: 'tool_call', handler: (toolCallId: string, name: string, args: Record<string, unknown>, messageId: MessageId) => void): () => void;
  (event: 'tool_call', messageId: MessageId, handler: (toolCallId: string, name: string, args: Record<string, unknown>) => void): () => void;
  (event: 'tool_result', handler: (toolCallId: string, name: string, result: string, messageId: MessageId) => void): () => void;
  (event: 'tool_result', messageId: MessageId, handler: (toolCallId: string, name: string, result: string) => void): () => void;
};
```

### `useConversation()` — recommended primary chat hook

Wraps `ConversationManager` for context window management, token tracking, message pinning, auto-summarization, and tool calling.

```ts
const {
  messages,            // readonly TrackedChatMessage[]
  streamingContent,    // string | null
  streamingMessageId,  // MessageId | null
  isStreaming,         // boolean
  isSending,           // boolean
  error,               // ArlopassSDKError | null
  tokenCount,          // number — current context window token usage
  contextWindow,       // readonly ChatMessage[] — what's actually sent to the model
  
  send,                // (content: string, options?: { pinned?: boolean }) => Promise<MessageId>
  stream,              // (content: string, options?: { pinned?: boolean }) => Promise<MessageId>
  stop,                // () => void
  clearMessages,       // () => void
  pinMessage,          // (messageId: MessageId, pinned: boolean) => void
  submitToolResult,    // (toolCallId: string, result: string) => void
  retry,               // (() => Promise<MessageId>) | null
  subscribe,           // ChatSubscribe
} = useConversation(options?: {
  systemPrompt?: string
  initialMessages?: ChatMessage[]
  maxTokens?: number                    // Auto-resolves from model if not set
  reserveOutputTokens?: number          // Default: 1024
  summarize?: boolean                   // Auto-summarize evicted messages
  summarizationPrompt?: string
  tools?: ToolDefinition[]              // Tool definitions
  maxToolRounds?: number                // Default: 5
  onMessage?: (message: TrackedChatMessage) => void
  onDelta?: (delta: string, accumulated: string, messageId: MessageId) => void
  onToolCall?: (toolCallId: string, name: string, args: Record<string, unknown>) => void
  onToolResult?: (toolCallId: string, name: string, result: string) => void
  onError?: (error: ArlopassSDKError, messageId: MessageId) => void
})
```

**Tool calling modes:**

1. **Auto-execute** — tool has a `handler` function. When the model requests this tool, the handler runs automatically and the result is fed back to the model.
2. **Manual** — tool has no `handler`. When the model requests this tool, `onToolCall` fires and the developer must call `submitToolResult(toolCallId, result)` to continue the conversation.
3. **Mixed** — some tools auto-execute, some are manual. Both patterns work in the same conversation.

**`stream()` with tools:**
```ts
const { stream, subscribe } = useConversation({
  tools: [
    { name: "search", handler: async (args) => await searchAPI(args) },  // Auto
    { name: "confirm_delete", description: "Confirm deletion" },         // Manual
  ],
  maxToolRounds: 5,
  onToolCall: (toolCallId, name, args) => {
    // Fires for manual tools only (no handler)
    showConfirmDialog(name, args).then(confirmed => {
      submitToolResult(toolCallId, JSON.stringify({ confirmed }))
    })
  },
  onToolResult: (toolCallId, name, result) => {
    // Fires for ALL tools (auto + manual) after execution
  },
})
```

**Context window management:**
- `tokenCount` updates after every `send()`/`stream()` call and after message pinning changes
- `contextWindow` reflects what will actually be sent to the model (after truncation/eviction)
- Oldest non-pinned messages are evicted first when the context window fills
- If `summarize: true`, evicted messages are summarized into a pinned recap before being dropped
- System prompt is always position 0, always pinned, never evicted

**`pinMessage()` behavior:**
- Pinned messages are never evicted during context window truncation
- Pinning a message that would overflow the budget throws a `ArlopassStateError`
- System prompt is implicitly pinned

**`submitToolResult()` behavior:**
- Calling with an unknown `toolCallId` throws a `ArlopassStateError`
- The result is fed back to the model, which may respond with text or more tool calls
- Tool call loops are capped at `maxToolRounds` (default: 5)

### `useChat()` — low-level chat hook

Wraps raw `client.chat.send()` / `client.chat.stream()` directly. No context window management, no token tracking, no tool calling. Use this when you want full manual control or don't need ConversationManager features.

```ts
const {
  messages,           // readonly TrackedChatMessage[]
  streamingContent,   // string | null
  streamingMessageId, // MessageId | null
  isStreaming,        // boolean
  isSending,          // boolean
  error,              // ArlopassSDKError | null
  send,               // (content: string) => Promise<MessageId>
  stream,             // (content: string) => Promise<MessageId>
  stop,               // () => void
  clearMessages,      // () => void
  retry,              // (() => Promise<MessageId>) | null
  subscribe,          // ChatSubscribe (response, stream, error events only — no tool events)
} = useChat(options?: {
  systemPrompt?: string
  initialMessages?: ChatMessage[]
  onMessage?: (message: TrackedChatMessage) => void
  onDelta?: (delta: string, accumulated: string, messageId: MessageId) => void
  onError?: (error: ArlopassSDKError, messageId: MessageId) => void
})
```

**Message ID flow (both hooks):**
```
const userMsgId = await stream("Explain quantum computing")
// userMsgId = "msg.a1b2c3" (user message)
// Assistant message created: "msg.d4e5f6"
// streamingMessageId = "msg.d4e5f6"
// Each onDelta fires with messageId = "msg.d4e5f6"
// On completion: onMessage fires with { id: "msg.d4e5f6", inResponseTo: "msg.a1b2c3" }
```

**Event subscription API (both hooks):**

Subscription overload signatures are defined in the shared `ChatSubscribe` type above. `useChat()` only fires `response`, `stream`, and `error` events (no tool events). `useConversation()` fires all five event types.

**Usage:**
```ts
// Specific message response
const unsub = subscribe("response", userMsgId, (message) => { ... })

// All responses
const unsub = subscribe("response", (message) => { ... })

// Specific message stream chunks
const unsub = subscribe("stream", userMsgId, (delta, accumulated) => { ... })

// All errors
const unsub = subscribe("error", (error, messageId) => { ... })

unsub() // cleanup
```

**Subscription behavior:**
- All subscriptions return an `unsubscribe()` function (idempotent — calling twice is safe)
- Subscribing the same handler reference twice is deduplicated
- Subscribing to a non-existent `messageId` — handler never fires (no error thrown)
- Unsubscribing after message completes — safe (no-op)
- Invalid event names are caught by TypeScript at compile time (`SubscriptionEvent` union)

**`stream()` internals (both hooks):**
1. Appends user message → `messages` state
2. Sets `isStreaming = true`, `streamingContent = ""`
3. `useChat`: calls `client.chat.stream({ messages })`. `useConversation`: calls `conversationManager.stream(content)`
4. `for await` loop: accumulates `delta` into `streamingContent`, fires `onDelta`
5. `useConversation` only: if `tool_call` event received → fires `onToolCall` (manual tools) or auto-executes (handler tools). `tool_result` events fire `onToolResult`. Tool call loop continues until model responds with text or `maxToolRounds` exceeded.
6. On `"done"`: appends complete assistant message to `messages`, clears `streamingContent`
7. On error: sets `error`, exposes `retry()` if retryable
8. `stop()` calls `AbortController.abort()`

**`send()` internals (both hooks):**
1. Appends user message → `messages`
2. Sets `isSending = true`
3. `useChat`: calls `client.chat.send({ messages })`. `useConversation`: calls `conversationManager.send(content)` — tool call loops may execute transparently before returning.
4. Appends response to `messages`, sets `isSending = false`
5. `useConversation` only: updates `tokenCount` and `contextWindow` after the response

Message state is local to each `useChat()` instance — multiple chats on one page have independent history.

**Message order guarantee:** `messages` are appended in order: (1) user message, (2) assistant response. Order never changes retroactively. Use `messages[messages.length - 1]` for the latest message.

**`stop()` behavior:** Calling `stop()` mid-stream aborts the `AbortController`. If the stream was incomplete, the assistant message status is set to `"error"` and `error` is set to an abort error (`retryable: true`). The partial `streamingContent` is discarded (not appended to `messages`). `retry()` is exposed to re-run the same request.

**Concurrency:** `send()` and `stream()` cannot be called concurrently within the same `useChat()` instance. Calling `stream()` while `isSending` is `true` (or vice versa) throws a `ArlopassStateError`. Multiple `useChat()` instances can operate concurrently.

**`isStreaming` / `isSending` semantics:**
- `isStreaming` = `true` only during an active `stream()` call with `AsyncIterable` in progress
- `isSending` = `true` only during an active `send()` call waiting for response
- Both are `false` at rest; at most one is `true` at a time

### `useClient()`

```ts
const client = useClient()  // ArlopassClient | null
```

Escape hatch for advanced use cases. Returns `null` if not connected.

---

## 7. Guard Components

### Positive gates (block until condition met)

| Component | Renders children when | Fallback props |
|---|---|---|
| `<ArlopassConnectionGate>` | Connected | `fallback`, `errorFallback`, `notInstalledFallback` |
| `<ArlopassProviderGate>` | Provider selected | `fallback`, `loadingFallback` |
| `<ArlopassChatReadyGate>` | Connected + provider selected | `connectingFallback`, `notInstalledFallback`, `providerFallback`, `errorFallback` |

### Negative guards (render when condition NOT met)

| Component | Renders children when | Passes props |
|---|---|---|
| `<ArlopassNotInstalled>` | No `window.arlopass` | No |
| `<ArlopassDisconnected>` | Not connected | No |
| `<ArlopassConnected>` | Connected | No |
| `<ArlopassProviderNotReady>` | No provider selected | No |
| `<ArlopassHasError>` | Active error exists | `{ error, retry }` |
| `<ArlopassChatNotReady>` | Not ready to chat | No |
| `<ArlopassChatReady>` | Ready to chat | No |

**Design:**
- No fallback props on negative guards — pure conditional renderers
- Children can be `ReactNode` or render function
- Composable anywhere in the tree — header, sidebar, toast, footer
- All prefixed with `Arlopass` to avoid import collisions

---

## 8. Error Boundary

### `<ArlopassErrorBoundary>`

```tsx
<ArlopassErrorBoundary
  fallback={({ error, resetErrorBoundary }) => <ErrorPanel error={error} reset={resetErrorBoundary} />}
  onError={(error) => reportToSentry(error)}
>
  {children}
</ArlopassErrorBoundary>
```

**Error routing:**

| Error type | `retryable` | Surfaces in |
|---|---|---|
| Timeout, transient network | `true` | Hook `error` state + `retry()` |
| Provider unavailable | `true` | Hook `error` state + `retry()` |
| Auth failed, permission denied | `false` | Thrown → `<ArlopassErrorBoundary>` |
| Policy violation | `false` | Thrown → `<ArlopassErrorBoundary>` |
| Protocol version mismatch | `false` | Thrown → `<ArlopassErrorBoundary>` |

Rule: retryable → local in hooks. Non-retryable fatal → error boundary.

Override: if `onError` callback is provided on a hook and doesn't re-throw, the error stays in hook state.

**`resetErrorBoundary` behavior:**
- Clears the error state and re-mounts children
- Does **not** automatically reconnect — `<ArlopassProvider>` will re-run its mount sequence (check `window.arlopass`, auto-connect if enabled), which effectively retries the connection
- For non-retryable errors (policy violation, protocol mismatch): re-mounting may hit the same error if the underlying cause hasn't been resolved upstream. This is by design — the developer or user must fix the issue (e.g., update extension, change policy)
- If `onError` callback is provided on a hook and doesn't re-throw, the error stays in hook state and does **not** propagate to the boundary

---

## 9. Testing Utilities (`@arlopass/react/testing`)

Separate subpath export — never ships in production.

### `createMockTransport(options)`

```ts
createMockTransport({
  providers: [{ providerId: "provider.mock", providerName: "Mock AI", models: ["model.test"] }],
  chatResponse: "Hello!" | (messages) => `Echo: ${messages.at(-1)?.content}`,
  streamResponse: "Streamed word by word" | undefined,
  streamChunks: ["Hello", " world"] | undefined,
  failOn: { connect: false, chat: false, stream: false },
  chatError: ArlopassTimeoutError | undefined,
  latency: { connect: 50, chat: 100, stream: 20 },
})
```

### `<MockArlopassProvider>`

```tsx
<MockArlopassProvider
  appId="test-app"
  mockTransport={transport}
  initialState="connected"
  initialProvider={{ providerId: "provider.mock", modelId: "model.test" }}
>
  <ComponentUnderTest />
</MockArlopassProvider>
```

### Async helpers

```ts
waitForChat(screen)       // Wait for non-streaming response
waitForStream(screen)     // Wait for streaming to finish
waitForState(screen, "connected")  // Wait for connection state
```

### Window mock

```ts
mockWindowArlopass(transport)   // Sets window.arlopass
cleanupWindowArlopass()         // Removes window.arlopass
```

### Store testing helpers

```ts
// Verify store subscription and snapshot changes
waitForSnapshot(store, (snapshot) => snapshot.state === "connected", { timeout: 1000 })

// Simulate external disconnect for testing heartbeat detection
simulateExternalDisconnect(transport)  // Makes transport.request() reject
```

---

## 10. Performance Optimizations

### Re-render prevention
- Selective subscriptions per hook via selector functions
- Stable callback references via `useCallback` with ref deps
- Derived booleans computed during render, not stored
- Immutable snapshot identity — new object only when values change

### Streaming performance
- `streamingContent` accumulated in ref, flushed via microbatching: schedules a `requestAnimationFrame` with a 16ms `setTimeout` fallback. Whichever fires first triggers the React state update and cancels the other. This guarantees ~60 updates/s on standard displays and works correctly on low-refresh-rate displays (where RAF may fire less frequently)
- `onDelta` fires synchronously per chunk, independent of React render cycle
- `AbortController` per stream for immediate cancellation

### Transport & connection
- `window.arlopass` checked once on mount, cached in ref
- Auto-connect fires in `useEffect` (after first paint)
- Provider auto-select pipelined in same microtask chain as connect

### Bundle size
- Zero third-party runtime deps beyond `@arlopass/web-sdk`
- Subpath exports for guards and testing
- Tree-shakeable — unused hooks eliminated

**Estimated sizes (minified):**

| Import | Size |
|---|---|
| `@arlopass/react` (core) | ~8-12 KB |
| `@arlopass/react/guards` | ~3-5 KB |
| `@arlopass/react/testing` | ~4-6 KB (dev only) |

---

## 11. Security Design

### Transport trust boundary
- Injected-only enforcement — no prop to pass arbitrary transport in production
- Runtime shape validation on `window.arlopass` before use
- Origin always `window.location.origin`, not developer-configurable

### Context isolation
- React context not exported — hooks are the only access path
- `useClient()` is documented escape hatch
- Per-hook conversation isolation — independent message arrays

### Input validation
- All hook inputs validated at call site before reaching SDK
- No `dangerouslySetInnerHTML` anywhere in the SDK
- AI response rendering is app's responsibility (documented)

### Safe defaults
- `autoConnect={true}` (extension shows consent prompt)
- Timeouts from web-sdk: 5s request, 60s envelope TTL
- Fatal errors propagate to error boundary

### Dependency security
- Zero third-party runtime dependencies
- React as `peerDependency` — uses app's instance
- `@arlopass/web-sdk` version-locked for protocol compatibility

---

## 12. File Structure

```
packages/react-sdk/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts                    # Main entry
│   ├── types.ts                    # All public types + re-exports from web-sdk
│   ├── global.d.ts                 # Window.arlopass type augmentation
│   ├── guards/
│   │   ├── index.ts
│   │   ├── arlopass-connection-gate.tsx
│   │   ├── arlopass-provider-gate.tsx
│   │   ├── arlopass-chat-ready-gate.tsx
│   │   ├── arlopass-not-installed.tsx
│   │   ├── arlopass-disconnected.tsx
│   │   ├── arlopass-connected.tsx
│   │   ├── arlopass-provider-not-ready.tsx
│   │   ├── arlopass-has-error.tsx
│   │   ├── arlopass-chat-not-ready.tsx
│   │   ├── arlopass-chat-ready.tsx
│   │   └── arlopass-error-boundary.tsx
│   ├── testing/
│   │   ├── index.ts
│   │   ├── mock-transport.ts
│   │   ├── mock-provider.tsx
│   │   ├── test-helpers.ts
│   │   └── window-mock.ts
│   ├── provider/
│   │   ├── arlopass-provider.tsx
│   │   └── arlopass-context.ts
│   ├── hooks/
│   │   ├── use-connection.ts
│   │   ├── use-providers.ts
│   │   ├── use-conversation.ts     # Primary hook: ConversationManager + tools
│   │   ├── use-chat.ts             # Low-level hook: raw client.chat.*
│   │   ├── use-client.ts
│   │   └── use-store.ts
│   ├── store/
│   │   ├── client-store.ts
│   │   ├── snapshot.ts
│   │   └── subscriptions.ts
│   └── transport/
│       └── injected.ts
└── src/__tests__/
    ├── client-store.test.ts
    ├── arlopass-provider.test.tsx
    ├── use-connection.test.tsx
    ├── use-providers.test.tsx
    ├── use-conversation.test.tsx
    ├── use-chat.test.tsx
    ├── guards.test.tsx
    ├── error-boundary.test.tsx
    └── injected-transport.test.ts
```

### Package exports

```json
{
  "name": "@arlopass/react",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./guards": { "types": "./dist/guards/index.d.ts", "import": "./dist/guards/index.js" },
    "./testing": { "types": "./dist/testing/index.d.ts", "import": "./dist/testing/index.js" }
  },
  "peerDependencies": { "react": "^18.0.0 || ^19.0.0" },
  "dependencies": { "@arlopass/web-sdk": "0.1.0" }
}
```

### Developer import patterns

```ts
// Core — provider + hooks + types
import { ArlopassProvider, useConversation, useChat, useConnection, useProviders, useClient } from '@arlopass/react'

// Guards — gate components
import { ArlopassChatReadyGate, ArlopassNotInstalled, ArlopassHasError } from '@arlopass/react/guards'

// Testing — never in production
import { MockArlopassProvider, createMockTransport } from '@arlopass/react/testing'

// Types — re-exported from web-sdk so developers don't need a second install
import type {
  ChatMessage,
  ChatRole,
  ClientState,
  ProviderDescriptor,
  SelectProviderInput,
  ChatOperationOptions,
  ArlopassSDKError,
  ArlopassTransport,
  ToolDefinition,
  ConversationStreamEvent,
  TrackedChatMessage,
  MessageId,
  ToolCallInfo,
} from '@arlopass/react'
```

All common web-sdk types that developers need are re-exported from `@arlopass/react`. Developers should never need to `npm install @arlopass/web-sdk` directly.

---

## 13. Decisions Record

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Transport strategy | Injected only (`window.arlopass`) | Extension controls trust boundary; other methods are dev-only |
| 2 | Streaming UX | Accumulated string + onDelta callback | Covers 90% case + power users |
| 3 | Error handling | Hook state + Error Boundary + retry helpers | Matches SDK retryable/non-retryable classification |
| 4 | Provider selection | Manual + auto-select + ProviderGate | Three complexity levels for different app needs |
| 5 | Bundle strategy | Multi-entry granular subpath exports | Single npm install, tree-shakeable |
| 6 | React version | React 18+ | Covers ~95% of active React apps |
| 7 | State sync | `useSyncExternalStore` | Concurrent-mode safe, canonical React 18 pattern |
| 8 | Component prefix | `Arlopass` prefix on all components | Avoids import collisions |
| 9 | Message tracking | MessageId per send/stream + subscribe API | Correlation for multi-message UIs |
| 10 | Conversation management | `useConversation()` wraps `ConversationManager` | Context window, token tracking, pinning, summarization |
| 11 | Tool calling | Integrated into `useConversation()` with auto/manual/mixed modes | Three execution modes via handler presence |
| 12 | Hook layering | `useConversation()` (recommended) + `useChat()` (low-level) | ConversationManager for most apps, raw access for advanced |
