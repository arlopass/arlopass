---
name: arlopass-integrate
description: |
  Add user-owned AI to any web app with Arlopass. Users bring their own providers
  (Ollama, Claude, GPT, Bedrock, Gemini) without sharing API keys with the app.
  10-line integration. Streaming chat, model picker, tool calling. Zero credential
  liability for the developer.
  Use when the user wants to add AI to a web app without managing API keys, when
  they mention "bring your own model", "BYOM", "Arlopass", "user-owned AI",
  "let users pick their model", or "no API key management". Also use when building
  any AI-powered web feature where the user — not the app — controls which provider
  runs the inference. Use when someone asks how to avoid hardcoding OpenAI/Anthropic
  keys in their frontend, or wants privacy-first AI where credentials never leave
  the browser. Use when building chat UIs, AI assistants, or tool-calling agents
  in React apps. Even if the user just says "add AI chat to my app" — this skill
  applies if the app is browser-based and user-facing.
---

# Arlopass SDK Integration

Let users bring their own AI to your web app. No API keys in your code, no
backend proxy, no vendor lock-in. The user installs the Arlopass browser
extension, connects their providers, and your app gets streaming AI through
a 10-line integration.

## How it works

```
Your Web App  ──SDK──▶  Arlopass Extension  ──Bridge──▶  User's AI Provider
                              │
                        User approves each
                        request with a click
```

The SDK talks to the browser extension via an injected transport. The extension
holds the user's credentials in an OS-level keychain (never in localStorage,
never on a server). When your app calls `stream()`, the extension shows a
permission prompt, routes the request to the chosen provider, and streams the
response back. Your app never sees an API key.

## Packages

| Package              | What                                                 | Install                    |
| -------------------- | ---------------------------------------------------- | -------------------------- |
| `@arlopass/react`    | React hooks + provider (wraps web-sdk)               | `npm i @arlopass/react`    |
| `@arlopass/web-sdk`  | Core SDK — transport, state machine, chat, streaming | `npm i @arlopass/web-sdk`  |
| `@arlopass/protocol` | Wire format, envelope types, error codes (zero deps) | `npm i @arlopass/protocol` |

Most apps only need `@arlopass/react`. It re-exports all types from web-sdk.

## Integration: React (recommended)

### Step 1: Wrap your app

```tsx
import { ArlopassProvider } from "@arlopass/react";

function App() {
  return (
    <ArlopassProvider
      appId="com.yourcompany.yourapp"
      appName="Your App"
      appDescription="AI-powered writing assistant"
      supportedModels={["gpt-4", "claude-3-sonnet", "llama3"]}
    >
      <YourRoutes />
    </ArlopassProvider>
  );
}
```

`ArlopassProvider` auto-connects to the extension on mount. If the extension
is not installed, hooks return a disconnected state — use it to show an
install prompt.

**Provider props:**

| Prop              | Type            | Default             | Purpose                               |
| ----------------- | --------------- | ------------------- | ------------------------------------- |
| `appId`           | `string`        | derived from origin | Unique app identifier                 |
| `appSuffix`       | `string`        | —                   | Suffix appended to auto-derived appId |
| `appName`         | `string`        | —                   | Name shown in extension popup         |
| `appDescription`  | `string`        | —                   | Description shown to user             |
| `appIcon`         | `string`        | —                   | Square icon URL (https or data URI)   |
| `defaultProvider` | `string`        | —                   | Auto-select this provider             |
| `defaultModel`    | `string`        | —                   | Auto-select this model                |
| `supportedModels` | `string[]`      | —                   | At least one must be available        |
| `requiredModels`  | `string[]`      | —                   | All must be available                 |
| `autoConnect`     | `boolean`       | `true`              | Connect on mount                      |
| `onError`         | `(err) => void` | —                   | Global error callback                 |

### Step 2: Build the chat UI

```tsx
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

### Step 3: Model picker

```tsx
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

### Step 4: Handle "extension not installed"

```tsx
import { useConnection } from "@arlopass/react";
import { ArlopassInstallButton } from "@arlopass/react";

function InstallPrompt() {
  return (
    <div>
      <h3>This app uses your own AI</h3>
      <p>Install the Arlopass extension to connect your providers.</p>
      <ArlopassInstallButton>Get Arlopass — free</ArlopassInstallButton>
    </div>
  );
}
```

## All hooks

| Hook                     | Returns                                                                                                                            | When to use                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `useConnection()`        | `state, isConnected, isConnecting, error, connect, disconnect, retry`                                                              | Connection lifecycle                      |
| `useProviders()`         | `providers, selectedProvider, isLoading, error, selectProvider, listProviders`                                                     | Provider/model selection                  |
| `useChat()`              | `messages, streamingContent, isStreaming, error, send, stream, stop, clearMessages`                                                | Simple chat                               |
| `useConversation()`      | `messages, streamingContent, isStreaming, tokenCount, contextInfo, toolActivity, send, stream, stop, submitToolResult, pinMessage` | Chat with tool calling + context tracking |
| `useClient()`            | `ArlopassClient \| null`                                                                                                           | Raw SDK access                            |
| `useModelAvailability()` | `satisfied, missingRequired, availableSupported`                                                                                   | Check model requirements                  |

## Tool calling with useConversation

When your app needs the AI to call functions (weather, database, calculations):

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

  // toolActivity tracks: idle → priming → matched → executing → result
  // When the model calls a tool, execute it and return the result:
  // submitToolResult(toolCallId, JSON.stringify({ temp: 72, unit: "F" }));

  return (/* same rendering pattern as useChat */);
}
```

## Integration: Vanilla JS / non-React

```ts
import { ArlopassClient } from "@arlopass/web-sdk";

const client = new ArlopassClient({
  transport: window.arlopass, // injected by the extension
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

await client.disconnect();
```

Client states: `disconnected → connecting → connected → degraded → reconnecting → failed`

All operations check state before executing. `chat.stream()` when disconnected
throws `ArlopassStateError`. The state machine is strict.

## Error handling

Every error extends `ArlopassSDKError`:

```ts
try {
  await client.chat.send({ messages });
} catch (err) {
  if (err instanceof ArlopassSDKError) {
    err.machineCode; // "ARLOPASS_PROVIDER_UNAVAILABLE"
    err.reasonCode; // "provider.unavailable"
    err.retryable; // true
    err.correlationId; // "corr.abc123"
  }
}
```

| Error class                     | When                      | Retryable |
| ------------------------------- | ------------------------- | --------- |
| `ArlopassStateError`            | Wrong state for operation | No        |
| `ArlopassProtocolBoundaryError` | Extension returned error  | Depends   |
| `ArlopassTransportError`        | Communication failed      | Yes       |
| `ArlopassTimeoutError`          | Request timed out         | Yes       |

React hooks surface errors through their `error` property and provide `retry`
when the error is retryable.

## Security model

1. **Credentials never leave the extension.** Your app cannot read API keys.
2. **User approves every request.** The extension shows what app is asking, which provider handles it, and the user clicks approve.
3. **Envelope signing.** Every message wraps in a `CanonicalEnvelope` with nonce (replay protection), TTL (expiry), origin (permission scoping).
4. **OS keychain storage.** Keys stored via platform keychain, not localStorage.
5. **Session isolation.** Each `connect()` creates a unique session.

## Integration checklist

Follow this sequence when wiring Arlopass into a web app:

1. `npm i @arlopass/react` (or `@arlopass/web-sdk` for non-React)
2. Wrap app root in `<ArlopassProvider>` with `appId`, `appName`, `supportedModels`
3. Connection status indicator via `useConnection()`
4. Model picker via `useProviders()`
5. Chat UI via `useChat()` (simple) or `useConversation()` (with tools)
6. "No extension" fallback with `ArlopassInstallButton`
7. Error handling: check `error` from hooks, use `retry` when available
8. Test with extension installed and at least one provider connected

## Starter template

```bash
npx degit arlopass/arlopass/templates/react-vite my-ai-app
cd my-ai-app && npm install && npm run dev
```

Working example with provider setup, connection state, model picker, streaming chat.

## When NOT to use Arlopass

- **Server-side AI calls** — Arlopass is browser-only.
- **Batch processing** — requires a user in the browser to approve.
- **Single-provider apps** — if you manage keys server-side, Arlopass adds indirection.

Arlopass works when your app is user-facing, browser-based, and you want users
to choose and pay for their own AI — or when you want zero credential liability.

## Links

- **Docs:** https://arlopass.com/docs
- **GitHub:** https://github.com/arlopass/arlopass
- **Extension:** Chrome Web Store — search "Arlopass"
- **npm:** `@arlopass/react` | `@arlopass/web-sdk` | `@arlopass/protocol`
