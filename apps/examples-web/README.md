# @byom-ai/examples-web

Interactive demo app showcasing `@byom-ai/web-sdk` integration patterns with the BYOM AI Wallet extension.

Built with React 18, [Mantine](https://mantine.dev/) 7, and Vite.

## Running

```bash
# From repo root
npm run dev:examples

# Or directly
npm run dev -w @byom-ai/examples-web
```

Opens at `http://127.0.0.1:4172`.

> [!TIP]
> Load the BYOM extension in Chrome first for the full experience. The app falls back to a demo transport if the extension is not detected.

## Scenarios

- **Connect/disconnect** — Session lifecycle and state transitions
- **Provider discovery** — List and select providers and models
- **Chat send** — Non-streaming `chat.send` with full response
- **Chat stream** — Real-time `chat.stream` with chunked output
- **Extension transport** — `window.byom` injected by the extension, with demo fallback
- **Error handling** — Policy denial, transient failure, and timeout simulation
- **Integration snippet** — Copy-paste code for embedding BYOM in your own app

## Tech Stack

- [React](https://react.dev/) 18 + [Mantine](https://mantine.dev/) 7 (UI components)
- [Vite](https://vite.dev/) 5 (dev server and build)
- [Tabler Icons](https://tabler.io/icons) (iconography)
- `@byom-ai/web-sdk` (BYOM client SDK)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
