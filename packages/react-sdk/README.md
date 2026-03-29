# @arlopass/react

React bindings for Arlopass.

This package provides `ArlopassProvider` and hooks for connection state,
provider selection, chat, and conversation workflows.

## Installation

```bash
pnpm add @arlopass/react @arlopass/web-sdk react react-dom
```

## Quick Start

```tsx
import { ArlopassProvider, useChat } from "@arlopass/react";

function Chat() {
  const { messages, sendMessage } = useChat();
  return (
    <button onClick={() => sendMessage("Hello")}>Send</button>
  );
}

export function App() {
  return (
    <ArlopassProvider appId="com.example.app">
      <Chat />
    </ArlopassProvider>
  );
}
```

## Exports

- `ArlopassProvider`
- `useClient`
- `useConnection`
- `useProviders`
- `useChat`
- `useConversation`
- `useModelAvailability`
- `ArlopassInstallButton`
