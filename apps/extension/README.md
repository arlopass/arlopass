# @byom-ai/extension

Chrome Manifest V3 browser extension — the trusted wallet UI surface for BYOM AI.

## Overview

The BYOM AI Wallet extension provides the user-facing consent layer between web applications and provider adapters. It injects a transport (`window.byom`) into web pages, manages per-origin permission grants, evaluates policy preflight, and communicates with the local bridge via Chrome's Native Messaging API.

## Components

| Component | File | Description |
|-----------|------|-------------|
| Service worker | `background.ts` | Message routing, tab management, grants state |
| Content script | `content-script.ts` | Injected into web pages; bridges page ↔ extension |
| Inpage provider | `inpage-provider.ts` | Exposes `window.byom` transport in page context |
| Popup | `popup.ts` | Extension toolbar popup (provider status, active model) |
| Options page | `options.ts` | Full provider connection flow (test, save, activate, remove) |

## Key Features

- **MetaMask-style consent prompts** — Clear human-readable permission dialogs showing app, provider, model, and capabilities
- **Per-origin permission store** — Grants scoped by origin and capability, with one-time, session, and persistent options
- **Policy preflight** — Enterprise policy evaluation before requests reach the bridge
- **Transport injection** — Auto-injects `window.byom` on HTTP/HTTPS pages

## Building

```bash
npm run build -w @byom-ai/extension
```

Uses esbuild for fast bundling. Output goes to `dist/`.

## Loading in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this directory (`apps/extension`)

After changes, rebuild and click **Reload** on the extension card.

## Storage Keys

| Key | Description |
|-----|-------------|
| `byom.wallet.providers.v1` | Connected provider list |
| `byom.wallet.activeProvider.v1` | Currently selected provider and model |
| `byom.wallet.ui.lastError.v1` | Last error for UI display |

## Manifest Details

- **Manifest version:** 3
- **Minimum Chrome:** 120
- **Permissions:** `storage`, `nativeMessaging`
- **Host permissions:** `http://*/*`, `https://*/*`
- **CSP:** `script-src 'self'; object-src 'self'; connect-src 'self' http: https:`

## Dependencies

- `@byom-ai/protocol` — Envelope and capability types
- `@byom-ai/policy` — Policy preflight evaluation
- `@byom-ai/audit` — Consent decision auditing
- `@byom-ai/web-sdk` — Transport type definitions
