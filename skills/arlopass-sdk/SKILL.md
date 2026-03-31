---
name: arlopass-sdk
description: |
  Integrate Arlopass into any web app so users bring their own AI providers
  (Ollama, Claude, GPT, Bedrock, Gemini) without ever sharing API keys with
  the app. Covers the full integration: installing packages, setting up the
  React provider, wiring hooks for chat/streaming, handling connection states,
  and building the model selector UI. Use this skill when the user wants to
  add AI chat to a web app without managing API keys, when they mention
  "bring your own model", "BYOM", "Arlopass", "user-owned AI", "let users
  pick their own model", "no API key management", or when building any
  AI-powered web feature where the user — not the app — controls which
  provider runs the inference. Also use when someone asks how to avoid
  hardcoding OpenAI/Anthropic keys in their frontend, or wants a
  privacy-first AI integration where credentials never leave the browser.
---

# Arlopass SDK Integration

Let users bring their own AI to your web app. No API keys in your code, no
backend proxy, no vendor lock-in. The user installs the Arlopass browser
extension, connects their providers (Ollama, Claude, GPT, Bedrock), and your
app gets streaming AI through a 10-line integration.

## How it works

```
Your Web App  ──SDK──▶  Arlopass Extension  ──Bridge──▶  User's AI Provider
                              │
                        User approves each
                        request with a click
```

The SDK talks to the browser extension via an injected transport. The extension
holds the user's credentials in an OS-level keychain (never in localStorage,
never on a server). When your app calls `chat.stream()`, the extension shows
the user a permission prompt, routes the request to the provider they chose,
and streams the response back. Your app never sees an API key.

## Packages

| Package              | What                                                 | Install                    |
| -------------------- | ---------------------------------------------------- | -------------------------- |
| `@arlopass/web-sdk`  | Core SDK — transport, state machine, chat, streaming | `npm i @arlopass/web-sdk`  |
| `@arlopass/react`    | React hooks + provider component (wraps web-sdk)     | `npm i @arlopass/react`    |
| `@arlopass/protocol` | Wire format, envelope types, error codes (zero deps) | `npm i @arlopass/protocol` |

Most apps only need `@arlopass/react`. It re-exports all types from web-sdk.

## React integration (recommended path)

### 1. Wrap your app

```tsx
// src/main.tsx
import { ArlopassProvider } from "@arlopass/react";

function App() {
  return (
    <ArlopassProvider
      appId="com.yourcompany.yourapp"
      appName="Your App"
      appDescription="AI-powered writing assistant"
      appIcon="https://yourapp.com/icon.png"
      supportedModels={["gpt-4", "claude-3-sonnet", "llama3"]}
      onError={(err) => console.error("Arlopass:", err)}
    >
      <YourRoutes />
    </ArlopassProvider>
  );
}
```

`ArlopassProvider` auto-connects to the extension on mount. If the extension
is not installed, hooks return a disconnected state you can use to show an
install prompt.

**Provider props:**

| Prop              | Type            | Default             | Purpose                                      |
| ----------------- | --------------- | ------------------- | -------------------------------------------- |
| `appId`           | `string`        | derived from origin | Unique app identifier                        |
| `appSuffix`       | `string`        | —                   | Suffix added to auto-derived appId           |
| `appName`         | `string`        | —                   | Human-readable name shown in extension popup |
| `appDescription`  | `string`        | —                   | Short description shown to user              |
| `appIcon`         | `string`        | —                   | Square icon URL (https or data URI)          |
| `defaultProvider` | `string`        | —                   | Auto-select this provider after connect      |
| `defaultModel`    | `string`        | —                   | Auto-select this model after connect         |
| `supportedModels` | `string[]`      | —                   | At least one must be available               |
| `requiredModels`  | `string[]`      | —                   | All must be available                        |
| `autoConnect`     | `boolean`       | `true`              | Connect to extension on mount                |
| `onError`         | `(err) => void` | —                   | Global error callback                        |

### 2. Build the chat UI

```tsx
// src/components/Chat.tsx
import { useChat, useConnection } from "@arlopass/react";

export function Chat() {
  const { isConnected, isConnecting } = useConnection();
  const { messages, streamingContent, isStreaming, error, stream, stop } =
    useChat({ systemPrompt: "You are a helpful assistant." });

  if (isConnecting) return <p>Connecting to Arlopass...</p>;
  if (!isConnected) return <InstallPrompt />;

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id} className={msg.role}>
          {msg.content}
        </div>
      ))}

      {isStreaming && <div className="assistant">{streamingContent}</div>}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem(
            "msg",
          ) as HTMLInputElement;
          await stream(input.value);
          input.value = "";
        }}
      >
        <input
          name="msg"
          placeholder="Ask anything..."
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button type="button" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit">Send</button>
        )}
      </form>

      {error && <p className="error">{error.message}</p>}
    </div>
  );
}
```

### 3. Add a model picker

```tsx
// src/components/ModelPicker.tsx
import { useProviders } from "@arlopass/react";

export function ModelPicker() {
  const { providers, selectedProvider, selectProvider, isLoading } =
    useProviders();

  if (isLoading) return <p>Loading providers...</p>;
  if (providers.length === 0) return <p>No providers connected.</p>;

  return (
    <div>
      <h3>Choose your model</h3>
      {providers.map((p) =>
        p.models.map((model) => (
          <button
            key={`${p.providerId}-${model}`}
            onClick={() =>
              selectProvider({ providerId: p.providerId, modelId: model })
            }
            data-selected={
              selectedProvider?.providerId === p.providerId &&
              selectedProvider?.modelId === model
            }
          >
            {p.providerName} — {model}
          </button>
        )),
      )}
    </div>
  );
}
```

### 4. Handle "extension not installed"

```tsx
import { useConnection } from "@arlopass/react";
import { ArlopassInstallButton } from "@arlopass/react";

function InstallPrompt() {
  return (
    <div>
      <h3>This app uses your own AI</h3>
      <p>Install the Arlopass extension to connect your providers.</p>
      <ArlopassInstallButton>Get Arlopass — it's free</ArlopassInstallButton>
    </div>
  );
}
```

## All hooks at a glance

| Hook                     | Returns                                                                                                                                | When to use                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `useConnection()`        | `{ state, isConnected, isConnecting, error, connect, disconnect, retry }`                                                              | Connection lifecycle                           |
| `useProviders()`         | `{ providers, selectedProvider, isLoading, error, selectProvider, listProviders }`                                                     | Provider/model selection                       |
| `useChat()`              | `{ messages, streamingContent, isStreaming, error, send, stream, stop, clearMessages }`                                                | Simple chat without tools                      |
| `useConversation()`      | `{ messages, streamingContent, isStreaming, tokenCount, contextInfo, toolActivity, send, stream, stop, submitToolResult, pinMessage }` | Full chat with tool calling + context tracking |
| `useClient()`            | `ArlopassClient \| null`                                                                                                               | Raw SDK access for advanced use                |
| `useModelAvailability()` | `{ satisfied, missingRequired, availableSupported, ... }`                                                                              | Check if user has required models              |

## Advanced: useConversation with tool calling

When your app needs the AI to call functions (weather lookups, database queries,
calculations), use `useConversation` instead of `useChat`:

```tsx
import { useConversation } from "@arlopass/react";

function AgentChat() {
  const {
    messages,
    streamingContent,
    isStreaming,
    toolActivity,
    stream,
    submitToolResult,
  } = useConversation({
    systemPrompt: "You help users check the weather.",
    tools: [
      {
        name: "get_weather",
        description: "Get current weather for a city",
        inputSchema: {
          type: "object",
          properties: {
            city: { type: "string", description: "City name" },
          },
          required: ["city"],
        },
      },
    ],
    maxTokens: 8000,
    primeTools: true,
  });

  // When the model calls a tool, execute it and return the result
  // (toolActivity tracks the current phase: idle → priming → matched → executing → result)
  // submitToolResult(toolCallId, JSON.stringify({ temp: 72, unit: "F" }));

  return (/* same rendering pattern as useChat */);
}
```

## Vanilla JS / non-React

Use `@arlopass/web-sdk` directly:

```ts
import { ArlopassClient } from "@arlopass/web-sdk";

const client = new ArlopassClient({
  transport: window.arlopass, // injected by extension
});

// Connect
await client.connect({ appId: "com.yourcompany.app" });

// Pick a provider
const { providers } = await client.listProviders();
await client.selectProvider({
  providerId: providers[0].providerId,
  modelId: providers[0].models[0],
});

// Stream a response
for await (const event of client.chat.stream({
  messages: [{ role: "user", content: "Hello!" }],
})) {
  if (event.type === "chunk") process.stdout.write(event.delta);
  if (event.type === "done") console.log("\n[done]");
}

// Disconnect
await client.disconnect();
```

**Client states:** `disconnected → connecting → connected → degraded → reconnecting → failed`

All operations check state before executing. Calling `chat.stream()` when
disconnected throws `ArlopassStateError`. The state machine is strict — you
always know where you stand.

## Error handling

Every error extends `ArlopassSDKError` with structured fields:

```ts
try {
  await client.chat.send({ messages });
} catch (err) {
  if (err instanceof ArlopassSDKError) {
    console.log(err.machineCode); // "ARLOPASS_PROVIDER_UNAVAILABLE"
    console.log(err.reasonCode); // "provider.unavailable"
    console.log(err.retryable); // true
    console.log(err.correlationId); // "corr.abc123" — for debugging
  }
}
```

| Error class                     | When                                | Retryable |
| ------------------------------- | ----------------------------------- | --------- |
| `ArlopassStateError`            | Operation called in wrong state     | No        |
| `ArlopassProtocolBoundaryError` | Extension/bridge returned an error  | Depends   |
| `ArlopassTransportError`        | Communication with extension failed | Yes       |
| `ArlopassTimeoutError`          | Request exceeded timeout            | Yes       |

The React hooks surface errors through their `error` property and provide a
`retry` function when the error is retryable.

## Security model

1. **Credentials never leave the extension.** Your app cannot read API keys.
2. **User approves every request.** The extension shows what app is asking, which provider will handle it, and the user clicks approve.
3. **Envelope signing.** Every message wraps in a `CanonicalEnvelope` with nonce (replay protection), TTL (expiry), and origin (permission scoping).
4. **OS keychain storage.** Keys stored via platform keychain APIs, not localStorage.
5. **Session isolation.** Each `connect()` creates a unique session ID.

## Integration checklist

When integrating Arlopass into a web app, follow this sequence:

1. Install `@arlopass/react` (or `@arlopass/web-sdk` for non-React)
2. Wrap the app root in `<ArlopassProvider>` with `appId`, `appName`, and `supportedModels`
3. Add a connection status indicator using `useConnection()`
4. Build a model picker using `useProviders()` — users see only their connected providers
5. Build the chat UI using `useChat()` (simple) or `useConversation()` (with tools)
6. Handle the "no extension" state with `ArlopassInstallButton`
7. Handle errors — check `error` from hooks, use `retry` when available
8. Test with the Arlopass extension installed and at least one provider connected

## Starter template

Clone the React + Vite template for a working example:

```bash
npx degit arlopass/arlopass/templates/react-vite my-ai-app
cd my-ai-app
npm install
npm run dev
```

The template includes `ArlopassProvider` setup, connection state, provider
selection, and streaming chat — all wired and working.

## When NOT to use Arlopass

- **Server-side AI calls** — Arlopass is browser-only. If your backend needs to call AI directly, use the provider SDKs with your own keys.
- **Batch processing** — Arlopass requires a user in the browser to approve requests. Automated pipelines should use provider APIs directly.
- **Single-provider apps** — If you only ever use one specific provider and manage keys server-side, Arlopass adds unnecessary indirection.

Arlopass shines when your app is user-facing, browser-based, and you want the
user to choose and pay for their own AI — or when you want zero credential
liability.
