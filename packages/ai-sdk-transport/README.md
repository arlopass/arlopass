# @arlopass/ai-sdk-transport

Use Vercel AI SDK's `useChat` with the Arlopass browser extension. No API route, no API keys, no server.

## Install

```bash
npm install @arlopass/ai-sdk-transport ai @arlopass/web-sdk
```

> [!IMPORTANT]
> The [Arlopass browser extension](https://arlopassai.com) must be installed for the transport to work. It provides the AI model that powers your app.

## Quick Start

Zero-config — just pass a `ArlopassChatTransport` instance to `useChat`:

```tsx
import { useChat } from "@ai-sdk/react";
import { ArlopassChatTransport } from "@arlopass/ai-sdk-transport";

function Chat() {
  const { messages, sendMessage, status } = useChat({
    transport: new ArlopassChatTransport(),
  });

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          {m.role}: {m.parts.map(p => p.type === "text" ? p.text : "").join("")}
        </div>
      ))}
      <button onClick={() => sendMessage({ content: "Hello!" })}>Send</button>
    </div>
  );
}
```

## With App Metadata

Identify your app in the extension's connection list:

```tsx
new ArlopassChatTransport({
  appId: "com.acme.copilot",
  appName: "Acme Copilot",
  appDescription: "AI assistant for Acme",
})
```

## Advanced: Pre-connected Client

If you manage the `ArlopassClient` lifecycle yourself, pass it directly:

```tsx
import { ArlopassClient } from "@arlopass/web-sdk";

const client = new ArlopassClient({ transport: window.arlopass });
await client.connect({ appId: "my-app" });

useChat({ transport: new ArlopassChatTransport({ client }) });
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `appId` | `string` | auto-derived | App identifier shown in the extension |
| `appSuffix` | `string` | — | Suffix for auto-derived app ID |
| `appName` | `string` | — | Human-readable app name |
| `appDescription` | `string` | — | Short description |
| `appIcon` | `string` | — | URL to a square icon |
| `client` | `ArlopassClient` | — | Pre-connected client (skips auto-connect) |
| `timeoutMs` | `number` | `120000` | Request timeout in ms |

## How It Works

The transport detects the Arlopass browser extension (`window.arlopass`), auto-connects, and routes `useChat` messages through the extension to whatever AI provider the user has configured. Messages are converted from AI SDK `UIMessage` format to Arlopass `ChatMessage` format. Streaming responses are converted back to AI SDK `UIMessageChunk` events that `useChat` consumes natively.

## Links

- [Arlopass website](https://arlopassai.com)
- [GitHub](https://github.com/AltClick/arlopass/tree/main/packages/ai-sdk-transport)
