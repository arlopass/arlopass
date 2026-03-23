# BYOM Extension + SDK Examples Web App

This app demonstrates integration scenarios between `@byom-ai/web-sdk` and the BYOM extension transport.

## Run

```powershell
npm run dev -w @byom-ai/examples-web
```

or from repo root:

```powershell
npm run dev:examples
```

Default URL: `http://127.0.0.1:4172`

## Scenarios included

- Connect/disconnect and state transitions
- Provider discovery + provider/model selection
- `chat.send` and `chat.stream`
- Injected extension transport (`window.byom`) with fallback to demo transport
- Error and timeout simulations (policy denial, transient transport failure)
- Integration snippet for embedding in production apps
