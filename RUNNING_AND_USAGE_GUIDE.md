# BYOM AI Wallet — Run & Usage Guide

This guide explains how to run the project in **development** and **production-like** modes, and how to use the current v0.1.0 components.

It is written for the current monorepo state (`byom-web`) and reflects what is implemented today.

---

## 1) What this repository contains

BYOM is split into focused workspaces:

- `packages\protocol` — canonical envelope, reason codes, version negotiation.
- `packages\web-sdk` — app-facing `BYOMClient` API.
- `packages\policy`, `packages\audit`, `packages\telemetry` — enterprise controls.
- `apps\bridge` — native messaging host core (handshake, grant sync/revoke, request checks).
- `apps\extension` — browser extension wallet surface (popup/options UI + extension primitives).
- `adapters\*` — provider adapters (Ollama, Claude subscription, local CLI bridge) + runtime host.
- `ops\` — reliability tests, SLOs, and runbooks.

---

## 2) Prerequisites

- **Node.js 20+** (CI uses Node 20).
- **npm** (workspaces are configured in root `package.json`).
- **Google Chrome/Chromium** for extension testing.
- Optional providers:
  - Ollama (local) for `@byom-ai/adapter-ollama`
  - Anthropic credentials for `@byom-ai/adapter-claude-subscription`
  - Local CLI bridge executable for `@byom-ai/adapter-local-cli-bridge`

---

## 3) Initial setup

From repo root:

```powershell
npm ci
```

Sanity check everything:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

### 3.1 Cross-platform dev runner scripts

The repository now includes ready-to-use development runner scripts:

- PowerShell: `scripts\dev\run-dev.ps1`
- Bash: `scripts/dev/run-dev.sh`

Supported modes for both scripts:

- `setup` — install dependencies (`npm ci`)
- `validate` — run `lint`, `typecheck`, `test`
- `watch` — watch builds for bridge + extension
- `bridge` — build and run the bridge
- `full` — setup (unless skipped) + watchers + bridge

PowerShell examples:

```powershell
.\scripts\dev\run-dev.ps1 -Mode setup
.\scripts\dev\run-dev.ps1 -Mode validate
.\scripts\dev\run-dev.ps1 -Mode full
```

Bash examples:

```bash
./scripts/dev/run-dev.sh setup
./scripts/dev/run-dev.sh validate
./scripts/dev/run-dev.sh full
```

NPM aliases are also available:

```powershell
npm run dev:setup
npm run dev:validate
npm run dev:watch
npm run dev:bridge
npm run dev:full
```

---

## 4) Development mode

### 4.1 Fast inner-loop commands

Run all tests once:

```powershell
npm run test
```

Run a specific workspace:

```powershell
npm run test -w @byom-ai/web-sdk
npm run test -w @byom-ai/bridge
npm run test -w @byom-ai/extension
```

Watch mode (root):

```powershell
npx vitest --workspace vitest.workspace.ts
```

Watch mode (workspace build):

```powershell
npm run build -w @byom-ai/bridge -- --watch
npm run build -w @byom-ai/extension -- --watch
```

### 4.2 Run the bridge locally

Build bridge:

```powershell
npm run typecheck -w @byom-ai/bridge
```

Set a 32-byte hex shared secret (64 hex chars):

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$env:BYOM_BRIDGE_SHARED_SECRET = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
```

Run:

```powershell
node --loader .\scripts\dev\ts-js-specifier-loader.mjs .\apps\bridge\src\main.ts
```

### 4.3 Load extension in Chrome

Build extension:

```powershell
npm run build -w @byom-ai/extension
```

Then:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select folder: `D:\projects\byom-web\apps\extension`

After TS changes, rebuild (or keep `--watch`) and click **Reload** on the extension card.

---

## 5) Production-like mode

The repo is currently source-first (TypeScript + dist outputs), so production rollout is typically:

1. Build and gate in CI
2. Publish dist artifacts
3. Deploy bridge host
4. Deploy extension package

### 5.1 CI/release gate (recommended)

```powershell
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

Reliability workflow reference: `.github\workflows\reliability-gates.yml`.

### 5.2 Bridge native messaging host registration (Windows)

Host name is fixed: `com.byom.bridge`.

Create `com.byom.bridge.json`:

```json
{
  "name": "com.byom.bridge",
  "description": "BYOM AI Bridge — Secure native messaging host",
  "path": "C:\\BYOM\\bridge\\byom-bridge.cmd",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://<your-extension-id>/"
  ]
}
```

`path` should point to your launcher (`.cmd`/`.exe`) that starts the built bridge.

Register manifest path in registry:

```powershell
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.byom.bridge" /ve /t REG_SZ /d "C:\BYOM\bridge\com.byom.bridge.json" /f
```

Also ensure `BYOM_BRIDGE_SHARED_SECRET` is set in the bridge process environment.

### 5.3 Extension package in production

Package from `apps\extension` with built `dist\` and static files:

- `manifest.json`
- `popup.html`
- `popup.css`
- `options.html`
- `dist\*.js`

---

## 6) How to use the SDK in a web app

At app level, use `BYOMClient` with any object implementing `BYOMTransport`.

Important for current v0.1.0 state:

- `@byom-ai/web-sdk` is fully usable as a library.
- Extension transport injection utility exists (`injectProvider`), but auto-injection bootstrap is not yet wired by default; `window.byom` may be undefined until you wire that path.

If your app already has a BYOM transport on `window.byom`, you can do:

```ts
import { BYOMClient, type BYOMTransport } from "@byom-ai/web-sdk";

const transport = (window as Window & { byom?: BYOMTransport }).byom;
if (transport === undefined) {
  throw new Error("BYOM transport not available");
}

const client = new BYOMClient({
  transport,
  origin: window.location.origin,
});

await client.connect({ appId: "com.acme.app" });

const providers = await client.listProviders();
const selected = providers.providers[0];
if (!selected || !selected.models[0]) throw new Error("No provider/model available");

await client.selectProvider({
  providerId: selected.providerId,
  modelId: selected.models[0],
});

const reply = await client.chat.send({
  messages: [{ role: "user", content: "Hello" }],
});

console.log(reply.message.content);
await client.disconnect();
```

### Streaming usage

```ts
for await (const event of client.chat.stream({
  messages: [{ role: "user", content: "Explain zero-trust architecture" }],
})) {
  if (event.type === "chunk") console.log(event.delta);
}
```

If you do not rely on extension injection yet, pass your own transport implementation:

```ts
import type { BYOMTransport } from "@byom-ai/web-sdk";

const transport: BYOMTransport = {
  async request(req) {
    // Call your backend/bridge transport here
    return fetch("/api/byom/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    }).then((r) => r.json());
  },
  async stream(_req) {
    throw new Error("Implement stream transport for your environment");
  },
};
```

---

## 7) How to use current extension wallet UI

### Current state in v0.1.0

- Popup and options UI are implemented.
- Connect flow page is currently a placeholder screen.
- Wallet data shape is enforced by `apps\extension\src\ui\popup-state.ts`.
- Wallet message handler utility exists (`createWalletMessageHandler`) but is not auto-registered in a runtime bootstrap by default.

Storage keys used by popup:

- `byom.wallet.providers.v1`
- `byom.wallet.activeProvider.v1`
- `byom.wallet.ui.lastError.v1`

You can seed demo state from extension service worker console:

```js
chrome.storage.local.set({
  "byom.wallet.providers.v1": [
    {
      id: "ollama",
      name: "Ollama",
      type: "local",
      status: "connected",
      models: [{ id: "llama3.2", name: "Llama 3.2" }],
      lastSyncedAt: Date.now()
    },
    {
      id: "claude-subscription",
      name: "Claude",
      type: "cloud",
      status: "connected",
      models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }],
      lastSyncedAt: Date.now()
    }
  ],
  "byom.wallet.activeProvider.v1": {
    providerId: "ollama",
    modelId: "llama3.2"
  }
});
```

Then open extension popup to inspect state rendering. If action buttons do not persist changes, add a background bootstrap that wires the wallet message handler:

```ts
import { createWalletMessageHandler } from "./background.js";

const storage = {
  get: (keys: readonly string[]) =>
    new Promise<Record<string, unknown>>((resolve) => {
      chrome.storage.local.get(keys, (result) => resolve(result as Record<string, unknown>));
    }),
  set: (items: Record<string, unknown>) =>
    new Promise<void>((resolve) => {
      chrome.storage.local.set(items, () => resolve());
    }),
};

const handleWallet = createWalletMessageHandler({
  storage,
  openOptionsPage: () => chrome.runtime.openOptionsPage(),
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleWallet(message).then((result) => {
    if (result !== null) {
      sendResponse(result);
    }
  });
  return true;
});
```

---

## 8) Using adapter packages directly

### Ollama adapter

```ts
import { OllamaAdapter } from "@byom-ai/adapter-ollama";

const adapter = new OllamaAdapter({ baseUrl: "http://localhost:11434" });
const models = await adapter.listModels();
const sessionId = await adapter.createSession({ model: models[0] ?? "llama3.2" });
const output = await adapter.sendMessage(sessionId, "Summarize secure coding in 5 bullets.");
console.log(output);
await adapter.shutdown();
```

### Claude subscription adapter

```ts
import { ClaudeSubscriptionAdapter } from "@byom-ai/adapter-claude-subscription";

const adapter = new ClaudeSubscriptionAdapter({
  auth: { authType: "api_key", apiKey: process.env.ANTHROPIC_API_KEY! },
});
```

### Local CLI bridge adapter

```ts
import { LocalCliBridgeAdapter } from "@byom-ai/adapter-local-cli-bridge";

const adapter = new LocalCliBridgeAdapter({
  command: "C:\\BYOM\\cli-bridge\\bridge.exe",
  args: [],
});
```

---

## 9) Reliability and operations commands

Targeted reliability suites:

```powershell
npm run test -- .\ops\tests\chaos
npm run test -- .\ops\tests\version-skew
npm run test -- .\ops\tests\soak
```

Operational docs:

- SLOs: `ops\slo\slo-definitions.md`
- Alert rules: `ops\slo\alert-rules.md`
- Runbooks: `ops\runbooks\*.md`

---

## 10) Security checklist for running this safely

- Always set a strong `BYOM_BRIDGE_SHARED_SECRET` (32-byte random hex).
- Keep secrets out of source control and CI logs.
- Use explicit extension allowlists in native host manifest.
- Enable signature verification for policy/adapters in production paths.
- Treat missing/invalid keychain lookups as deny (already defaulted in bridge keychain store).
- Run `lint`, `typecheck`, `test`, and reliability suites before release.

---

## 11) Troubleshooting

### Bridge starts but extension cannot connect

- Verify native messaging host registration key exists.
- Verify manifest `name` is exactly `com.byom.bridge`.
- Verify extension ID is present in `allowed_origins`.
- Verify `BYOM_BRIDGE_SHARED_SECRET` alignment.

### `auth.invalid` during handshake

- Secret mismatch or stale challenge nonce.
- Regenerate secret and restart bridge + extension.

### Popup shows no providers

- Check `chrome.storage.local` keys listed above.
- Seed demo providers as shown in section 7.

### CI or local gates fail

Run in order and fix first failing stage:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
```

---

## 12) Recommended next hardening steps

- Add explicit extension background bootstrap wiring for wallet message handling.
- Implement end-to-end provider connect flow in `options.html`.
- Add bridge service installation scripts (Windows/macOS/Linux) and signed release artifacts.
- Add example web app demonstrating `BYOMClient` + extension transport end-to-end.

