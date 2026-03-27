# @byom-ai/ai-sdk-transport

Use Vercel AI SDK's `useChat` with the BYOM browser extension. No API route, no API keys, no server.

## Install

```bash
npm install @byom-ai/ai-sdk-transport ai @byom-ai/web-sdk
```

> [!IMPORTANT]
> The [BYOM browser extension](https://byomai.com) must be installed for the transport to work. It provides the AI model that powers your app.

## Quick Start

Zero-config — just pass a `BYOMChatTransport` instance to `useChat`:

```tsx
import { useChat } from "@ai-sdk/react";
import { BYOMChatTransport } from "@byom-ai/ai-sdk-transport";

function Chat() {
  const { messages, sendMessage, status } = useChat({
    transport: new BYOMChatTransport(),
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
new BYOMChatTransport({
  appId: "com.acme.copilot",
  appName: "Acme Copilot",
  appDescription: "AI assistant for Acme",
})
```

## Advanced: Pre-connected Client

If you manage the `BYOMClient` lifecycle yourself, pass it directly:

```tsx
import { BYOMClient } from "@byom-ai/web-sdk";

const client = new BYOMClient({ transport: window.byom });
await client.connect({ appId: "my-app" });

useChat({ transport: new BYOMChatTransport({ client }) });
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `appId` | `string` | auto-derived | App identifier shown in the extension |
| `appSuffix` | `string` | — | Suffix for auto-derived app ID |
| `appName` | `string` | — | Human-readable app name |
| `appDescription` | `string` | — | Short description |
| `appIcon` | `string` | — | URL to a square icon |
| `client` | `BYOMClient` | — | Pre-connected client (skips auto-connect) |
| `timeoutMs` | `number` | `120000` | Request timeout in ms |

## How It Works

The transport detects the BYOM browser extension (`window.byom`), auto-connects, and routes `useChat` messages through the extension to whatever AI provider the user has configured. Messages are converted from AI SDK `UIMessage` format to BYOM `ChatMessage` format. Streaming responses are converted back to AI SDK `UIMessageChunk` events that `useChat` consumes natively.

## Links

- [BYOM website](https://byomai.com)
- [GitHub](https://github.com/AltClick/byom-web/tree/main/packages/ai-sdk-transport)
