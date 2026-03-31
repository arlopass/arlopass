# Arlopass React Starter

A minimal React + Vite chat app powered by [Arlopass](https://arlopass.com). Demonstrates connecting to a user's AI providers without managing API keys.

## Prerequisites

1. [Arlopass browser extension](https://arlopass.com/install) installed
2. [Arlopass Bridge](https://github.com/arlopass/arlopass/releases) running locally
3. At least one AI provider configured (e.g., [Ollama](https://ollama.com))

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, approve the connection in the Arlopass extension popup, and start chatting.

## How It Works

- `ArlopassProvider` wraps the app and auto-connects to the Arlopass extension
- `useConnection()` tracks connection state
- `useProviders()` lists available providers and the user's selection
- `useChat()` manages message history and streaming

Your app never touches API keys. The user controls which AI provider and model to use.

## Learn More

- [Arlopass Documentation](https://arlopass.com/docs)
- [React SDK Reference](https://arlopass.com/docs/reference/react/hooks)
- [Web SDK Reference](https://arlopass.com/docs/reference/web-sdk/client)
