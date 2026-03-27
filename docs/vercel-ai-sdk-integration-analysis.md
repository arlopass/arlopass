# Vercel AI SDK Integration — Feasibility Analysis & Implementation Plan

> **Date:** 2026-03-27
> **Status:** Research & Analysis
> **Objective:** Provide a plug-and-play drop-in Arlopass provider for the Vercel AI SDK so that developers can use the user's own models (configured in the Arlopass extension) with `generateText`, `streamText`, `useChat`, and the full AI SDK ecosystem.

---

## Executive Summary

**Verdict: Highly feasible. Two complementary integration surfaces exist.**

The Vercel AI SDK (v6) has a well-documented, stable **Language Model Specification (V3)** and a **Transport** system that are both designed for custom integrations. Arlopass can integrate at two levels:

1. **`@arlopass/ai-sdk-provider`** — A custom `LanguageModelV3` provider that runs server-side (Next.js API routes, Node.js servers). Implements `doGenerate()` and `doStream()` by forwarding to the Arlopass bridge/extension via native transport.

2. **`@arlopass/ai-sdk-transport`** — A custom `ChatTransport` for `useChat` that runs client-side, connecting directly to `window.arlopass` (the extension's injected transport). This is the **zero-config, zero-backend** integration that makes Arlopass unique — no API route needed.

Both can ship as npm packages and be listed as official Vercel AI SDK Community Providers.

---

## Part 1: Architecture Mapping

### Arlopass → Vercel AI SDK Concept Map

| Arlopass Concept | AI SDK Equivalent | Gap Analysis |
|---|---|---|
| `ArlopassClient` | Custom `LanguageModelV3` class | Need to implement `doGenerate` + `doStream` |
| `connect()` + `selectProvider()` | Provider initialization / model factory | Lazy initialization in model constructor |
| `chat.send()` → `ChatSendResult` | `doGenerate()` → `LanguageModelV3GenerateResult` | Arlopass returns `{ message, correlationId }`, need to map to `{ content[], finishReason, usage }` |
| `chat.stream()` → `AsyncIterable<ChatStreamEvent>` | `doStream()` → `ReadableStream<LanguageModelV3StreamPart>` | Convert `{ type: "chunk", delta }` to `{ type: "text", text }` stream parts |
| `ChatMessage { role, content: string }` | `LanguageModelV3Prompt` (multi-part: text, file, tool-call) | Arlopass is text-only today — need content flattening |
| `ProviderDescriptor` | Provider's model ID registry | Dynamic — models discovered at runtime via extension |
| `window.arlopass` transport | `ChatTransport` for `useChat` | Map directly to AI SDK transport interface |
| `ConversationManager` tools | `LanguageModelV3FunctionTool` | Arlopass uses XML-based tool calls; AI SDK uses structured tool protocol |
| `estimateTokenCount()` | `LanguageModelV3Usage` | Expose as usage metadata |
| `contextWindowSize` | Not in AI SDK provider interface | Expose via `providerMetadata` |

### Key Architectural Differences

1. **Arlopass is browser-first; AI SDK is server-first.** The AI SDK's `generateText`/`streamText` functions expect providers to make HTTP calls to APIs. Arlopass's transport goes through the browser extension via `window.postMessage`. This means:
   - The **provider integration** (Approach 1) needs a server-side bridge adapter that communicates with the Arlopass bridge daemon directly, OR it can work via a Next.js API route that relays to the extension.
   - The **transport integration** (Approach 2) works purely client-side — no server needed.

2. **Arlopass messages are text-only.** AI SDK prompt messages are multi-part (text, files, tool calls, reasoning). The provider must flatten multi-part content to text strings.

3. **Arlopass tools use XML parsing.** AI SDK uses structured JSON tool calls in the protocol. The provider's `doGenerate`/`doStream` would need to detect Arlopass's `<tool_call>` responses and map them to `LanguageModelV3ToolCall` content objects.

4. **Arlopass requires connection lifecycle.** Before using the client, you must `connect()` and `selectProvider()`. The AI SDK expects stateless providers — call `doGenerate()` and it just works. The Arlopass provider must handle lazy connection internally.

---

## Part 2: Integration Approach 1 — `@arlopass/ai-sdk-provider`

### What it is

A `LanguageModelV3`-compliant provider package that wraps `ArlopassClient`. Developers use it with `generateText()`, `streamText()`, and any AI SDK function.

### Usage (developer experience)

```typescript
// Server-side (Next.js API route)
import { arlopass } from "@arlopass/ai-sdk-provider";
import { generateText, streamText } from "ai";

// The provider connects to the Arlopass bridge daemon (not the extension)
const model = arlopass("claude-sonnet-4"); // or arlopass("ollama:llama3.2")

// Non-streaming
const { text } = await generateText({
  model,
  prompt: "Explain quantum computing",
});

// Streaming
const result = streamText({
  model,
  messages: [{ role: "user", content: "Hello!" }],
});
return result.toUIMessageStreamResponse(); // for useChat consumption
```

### Architecture

```
┌─────────────────────────────────────────────────────┐
│  Next.js API Route (/api/chat)                      │
│                                                      │
│  streamText({                                        │
│    model: arlopass("claude-sonnet-4"),  ◄── LanguageModelV3  │
│    messages: [...],                                  │
│  })                                                  │
│       │                                              │
│       ▼                                              │
│  ArlopassLanguageModel.doStream()                        │
│       │                                              │
│       ▼                                              │
│  ArlopassClient (connected to bridge daemon via stdio)   │
│       │                                              │
│       ▼                                              │
│  Arlopass Bridge ──► User's configured provider          │
│  (Ollama, OpenAI, Claude, etc.)                      │
└─────────────────────────────────────────────────────┘
```

### Implementation Details

**Provider Entry Point (`provider.ts`):**
```typescript
interface ArlopassProvider extends ProviderV3 {
  (modelId: string): ArlopassLanguageModel;
  languageModel(modelId: string): ArlopassLanguageModel;
}

interface ArlopassProviderOptions {
  bridgeHost?: string;     // default: "localhost"
  bridgePort?: number;     // default: determined by bridge config
  sharedSecret?: string;   // HMAC auth for bridge handshake
  extensionId?: string;    // for native messaging
}
```

**Language Model (`arlopass-language-model.ts`):**

Must implement:
- `specificationVersion: 'V3'`
- `provider: 'arlopass'`
- `modelId: string` (e.g., `"claude-sonnet-4"` or `"ollama/llama3.2"`)
- `supportedUrls: {}` (Arlopass doesn't support URL-based file inputs today)
- `doGenerate(options)` → maps AI SDK prompt to Arlopass `ChatMessage[]`, calls `client.chat.send()`, maps result to `LanguageModelV3GenerateResult`
- `doStream(options)` → calls `client.chat.stream()`, wraps in `ReadableStream<LanguageModelV3StreamPart>` with proper lifecycle events

**Prompt Conversion:**
```
LanguageModelV3Prompt → ChatMessage[]

system → { role: "system", content: text }
user (text parts) → { role: "user", content: parts.map(p => p.text).join("") }
user (file parts) → flatten to text description or skip with warning
assistant (text parts) → { role: "assistant", content: text }
assistant (tool-call parts) → serialize to text format
tool (result parts) → { role: "user", content: formatted tool results }
```

**Stream Mapping:**
```
Arlopass ChatStreamEvent → LanguageModelV3StreamPart

Before first chunk:
  → { type: "stream-start", warnings: [] }

{ type: "chunk", delta } → { type: "text", text: delta }

{ type: "done" }
  → { type: "finish", finishReason: { unified: "stop", raw: undefined },
       usage: { inputTokens: estimated, outputTokens: estimated, totalTokens } }
```

### Gaps & Limitations

| Feature | Status | Mitigation |
|---|---|---|
| Tool calling | ⚠️ Partial | Arlopass uses XML-based tool calls. Can detect and convert to structured `tool-call` content, but requires model cooperation |
| Multi-part content (images, files) | ❌ Not supported | Return warning if file parts present. Text-only initially |
| Usage (token counts) | ⚠️ Estimated | Use `estimateTokenCount()` from web SDK. Not exact |
| Server-side transport | ⚠️ Needs work | Bridge daemon communication needs a Node.js transport (native messaging or HTTP adapter) |
| Embeddings | ❌ Not supported | Arlopass doesn't have embedding endpoints |
| Image generation | ❌ Not supported | Outside Arlopass scope |

### Server-Side Transport Challenge

The biggest challenge for Approach 1 is that Arlopass's transport layer (`window.arlopass`) is browser-only. For server-side usage, we need:

**Option A: HTTP Bridge Adapter** — The Arlopass bridge exposes an HTTP endpoint that the Node.js provider can call. This is the cleanest but requires extending the bridge.

**Option B: Native Messaging from Node.js** — The provider communicates with the bridge binary via stdio/native messaging, the same way the extension does. Achievable since we already have `NativeHost`.

**Option C: Proxy through the Extension** — The Next.js API route proxies to the client-side extension via WebSocket/SSE. This defeats the purpose of server-side rendering but works.

**Recommendation:** Option B (native messaging) for self-hosted setups. Option A (HTTP adapter) for cloud deployments.

---

## Part 3: Integration Approach 2 — `@arlopass/ai-sdk-transport` (Recommended first)

### What it is

A custom `ChatTransport` for the AI SDK's `useChat` hook that connects directly to the Arlopass extension's injected `window.arlopass` transport. **No backend needed.**

### Why this is the killer integration

This is what makes Arlopass fundamentally different from every other AI SDK provider. Every other provider requires:
1. An API key stored server-side
2. A Next.js API route (`/api/chat`)  
3. Server-side `streamText()` call

With Arlopass + AI SDK Transport:
1. No API keys on the server
2. No API route needed
3. Models run through the user's own credentials via the extension

### Usage (developer experience)

```typescript
// Client-side only — no API route needed!
import { useChat } from "@ai-sdk/react";
import { ArlopassChatTransport } from "@arlopass/ai-sdk-transport";

function Chat() {
  const { messages, sendMessage, status } = useChat({
    transport: new ArlopassChatTransport({
      appId: "com.example.myapp",
      // Auto-connects to extension, uses selected provider
    }),
  });

  return (
    <div>
      {messages.map(m => <div key={m.id}>{m.role}: {m.content}</div>)}
      <button onClick={() => sendMessage({ content: "Hello!" })}>
        Send
      </button>
    </div>
  );
}
```

### Architecture

```
┌──────────────────────────────────────────────────────┐
│  Browser                                              │
│                                                       │
│  useChat({                                            │
│    transport: new ArlopassChatTransport()  ◄── ChatTransport │
│  })                                                   │
│       │                                               │
│       ▼                                               │
│  ArlopassChatTransport.sendMessages()                     │
│       │                                               │
│       ▼                                               │
│  window.arlopass (injected by extension)                  │
│       │  window.postMessage                           │
│       ▼                                               │
│  Content Script → Background Script → Native Host     │
│       │                                               │
│       ▼                                               │
│  Arlopass Bridge ──► User's provider (Ollama, Claude...)  │
└──────────────────────────────────────────────────────┘
```

### Implementation Details

The AI SDK's `ChatTransport` interface (from `ai` package):

```typescript
interface ChatTransport {
  sendMessages(options: {
    messages: UIMessage[];
    // ... additional options
  }): Promise<{
    stream: ReadableStream<UIMessageStreamPart>;
    // ...
  }>;
}
```

**`ArlopassChatTransport` implementation:**

```typescript
class ArlopassChatTransport implements ChatTransport {
  #client: ArlopassClient | null = null;
  #appId: string;
  
  constructor(options: { appId: string; /* ... */ }) {
    this.#appId = options.appId;
  }

  async sendMessages(options) {
    // 1. Lazy-connect to extension
    if (!this.#client) {
      const transport = (window as any).arlopass;
      if (!transport) throw new Error("Arlopass extension not installed");
      this.#client = new ArlopassClient({ transport });
      await this.#client.connect({ appId: this.#appId });
    }

    // 2. Convert UIMessage[] → ChatMessage[]
    const chatMessages = options.messages.map(m => ({
      role: m.role as "user" | "assistant" | "system",
      content: extractTextContent(m),
    }));

    // 3. Stream via Arlopass and convert to UIMessageStream
    const arlopassStream = this.#client.chat.stream({ messages: chatMessages });
    
    return {
      stream: convertToUIMessageStream(arlopassStream),
    };
  }
}
```

**Stream conversion** (Arlopass → AI SDK UI Message Stream):
```
Arlopass ChatStreamEvent → UIMessageStreamPart

{ type: "chunk", delta }
  → { type: "text", text: delta }

{ type: "done" }
  → { type: "finish", finishReason: "stop", usage: { ... } }
```

### How `useChat` works without a backend

The AI SDK's `useChat` hook is transport-agnostic. It calls `transport.sendMessages()` and consumes the returned stream. If we provide a `ArlopassChatTransport` that talks to the extension directly, the hook works exactly the same — all the message management, streaming UI updates, and tool calling features work out of the box.

This is the **exact same pattern** as `DirectChatTransport` which the AI SDK already supports for in-process agents.

---

## Part 4: Feature Parity Matrix

| AI SDK Feature | Approach 1 (Provider) | Approach 2 (Transport) | Notes |
|---|---|---|---|
| `generateText()` | ✅ Full | ❌ N/A | Transport is for `useChat` only |
| `streamText()` | ✅ Full | ❌ N/A | Same |
| `useChat` (React) | ✅ Via API route | ✅ Direct | Transport is simpler |
| `useCompletion` | ⚠️ Would need work | ❌ N/A | Different protocol |
| Tool calling | ⚠️ Partial (XML-based) | ⚠️ Partial | Depends on model's tool call format |
| Image input | ❌ | ❌ | Arlopass is text-only currently |
| Streaming | ✅ | ✅ | Both support streaming |
| Provider registry | ✅ | ❌ N/A | Can register Arlopass in `createProviderRegistry` |
| Middleware | ✅ | ❌ N/A | Standard AI SDK middleware works |
| Custom headers | ❌ N/A | ❌ N/A | No HTTP involved |
| Multi-provider | ✅ Dynamic | ✅ Dynamic | Arlopass discovers providers at runtime |
| Token usage | ⚠️ Estimated | ⚠️ Estimated | Using char/4 heuristic |
| Context window | ✅ Via providerMetadata | ✅ Via custom events | From model-context-windows.ts |
| AbortSignal | ✅ | ✅ | Arlopass supports cancellation |
| Error mapping | ✅ | ✅ | Map to AI SDK error types |
| No-backend mode | ❌ Needs server | ✅ Client-only | Transport approach is unique |

---

## Part 5: Implementation Plan

### Phase 1: `@arlopass/ai-sdk-transport` (Client-side, 1-2 weeks)

**Ship first because:**
- Zero infrastructure needed (no server, no API route)
- This is Arlopass's unique selling point — "bring your own model to any AI SDK app"
- Smaller surface area, faster to build and test
- Immediately works with existing `useChat` applications

**Deliverables:**
1. New package: `packages/ai-sdk-transport/`
2. `ArlopassChatTransport` class implementing `ChatTransport`
3. Message conversion: `UIMessage` ↔ `ChatMessage`
4. Stream conversion: `ChatStreamEvent` → `UIMessageStreamPart`
5. Lazy connection management with retry
6. Extension detection and graceful fallback
7. Tests (unit + integration with mock transport)
8. Documentation page in the examples app
9. npm publish as `@arlopass/ai-sdk-transport`

### Phase 2: `@arlopass/ai-sdk-provider` (Server-side, 2-3 weeks)

**Depends on:**
- Bridge having a Node.js-accessible transport (native messaging or HTTP)
- Phase 1 validates the core message/stream conversion logic

**Deliverables:**
1. New package: `packages/ai-sdk-provider/`
2. `ArlopassLanguageModel` implementing `LanguageModelV3`
3. `arlopass()` factory function + `ProviderV3`
4. `doGenerate()` mapping (prompt → send → result)
5. `doStream()` mapping with `ReadableStream` adapter
6. Node.js transport to Arlopass bridge (via native messaging)
7. Tool call detection and mapping (XML `<tool_call>` → structured)
8. Provider registry support (`createProviderRegistry({ arlopass })`)
9. Tests + documentation
10. npm publish as `@arlopass/ai-sdk-provider`

### Phase 3: Enhanced Features (Ongoing)

- Multi-modal support (images via file parts)
- Structured output (`useObject` support)
- Embedding model support
- Exact token counting from provider responses
- Provider metadata (context window, capabilities)
- Submit as Vercel AI SDK Community Provider
- Example: "Add Arlopass to any Next.js AI app in 30 seconds"

---

## Part 6: Developer Experience Vision

### Before Arlopass (standard AI SDK)
```typescript
// 1. Server: API route with hardcoded provider + API key
// app/api/chat/route.ts
import { openai } from "@ai-sdk/openai";  // locked to one provider
import { streamText } from "ai";

export async function POST(req) {
  const { messages } = await req.json();
  const result = streamText({
    model: openai("gpt-4o"),  // API key in env var
    messages,
  });
  return result.toUIMessageStreamResponse();
}

// 2. Client: useChat pointed at API route
import { useChat } from "@ai-sdk/react";
const { messages, sendMessage } = useChat(); // POST /api/chat
```

### After Arlopass (drop-in replacement)
```typescript
// No API route needed! Client-only:
import { useChat } from "@ai-sdk/react";
import { ArlopassChatTransport } from "@arlopass/ai-sdk-transport";

const { messages, sendMessage } = useChat({
  transport: new ArlopassChatTransport({ appId: "my-app" }),
  // Uses whatever model the user selected in the Arlopass extension
  // No API keys, no server, no vendor lock-in
});
```

### The pitch to developers
> "Remove your `/api/chat` route. Delete your `OPENAI_API_KEY` env var. Install `@arlopass/ai-sdk-transport`, add one line of code, and your users bring their own AI — any provider, any model, their keys, their choice."

---

## Part 7: Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| AI SDK V3 spec changes to V4+ | Breaking changes in provider interface | Pin to V3, use `asLanguageModelV3` adapter. Monitor AI SDK releases |
| `ChatTransport` is not yet stable | API could change | It's already used by `DirectChatTransport` in production. Follow upstream |
| Extension not installed | Transport fails | Graceful detection with helpful error message and install prompt |
| Arlopass text-only messages | Can't handle multi-modal prompts | Flatten to text with warnings. Add multi-modal support in Phase 3 |
| Token estimation inaccuracy | Usage stats are approximate | Clearly document as "estimated". Improve with provider-specific tokenizers |
| Tool calling format mismatch | AI SDK expects structured JSON; Arlopass uses XML | Implement bidirectional conversion in the provider layer |
| Performance overhead | Extra message conversion layer | Negligible — conversion is synchronous string manipulation |

---

## Part 8: Competitive Analysis

| Product | AI SDK Integration | User's Own Keys | No Backend Required | Extension-based |
|---|---|---|---|---|
| **Arlopass (proposed)** | ✅ Provider + Transport | ✅ | ✅ | ✅ |
| OpenRouter | ✅ Community provider | ❌ (their proxy) | ❌ | ❌ |
| Portkey | ✅ Community provider | ⚠️ (their vault) | ❌ | ❌ |
| LM Studio | ✅ OpenAI-compatible | ✅ (local) | ❌ (needs server) | ❌ |
| Ollama | ✅ Community provider | ✅ (local) | ❌ (needs server) | ❌ |
| Browser AI | ✅ Community provider | ✅ (in-browser) | ✅ | ❌ |

**Arlopass's unique position:** The only integration that gives users access to ALL their providers (cloud + local) through a single extension, with no server-side code required. No one else offers the "custom ChatTransport that routes through a browser extension" pattern.

---

## Appendix: Vercel AI SDK Version Reference

- **AI SDK v6** (current, March 2026)
- **Language Model Spec V3** (stable, used by all official providers)
- **Language Model Spec V4** (in development, on main branch)
- **`@ai-sdk/provider`** — types and interfaces
- **`@ai-sdk/provider-utils`** — helpers (postJsonToApi, loadApiKey, etc.)
- **`ChatTransport`** — interface for `useChat` communication layer
- **`DirectChatTransport`** — in-process agent transport (precedent for our approach)
- **Community Providers** — 40+ third-party providers, published separately

## Appendix: Reference Implementations to Study

1. **Mistral Provider** — [github.com/vercel/ai/tree/main/packages/mistral](https://github.com/vercel/ai/tree/main/packages/mistral) — official reference for custom providers
2. **Browser AI Provider** — [github.com/nichochar/browser-ai](https://github.com/nichochar/browser-ai) — closest analog (browser-side, no API keys)
3. **OpenRouter Provider** — [github.com/openrouter/ai-sdk-provider](https://github.com/openrouter/ai-sdk-provider) — multi-provider proxy pattern
4. **DirectChatTransport** — [github.com/vercel/ai/blob/main/packages/ai/src/ui/direct-chat-transport.ts](https://github.com/vercel/ai/blob/main/packages/ai/src/ui/direct-chat-transport.ts) — direct model transport without HTTP
