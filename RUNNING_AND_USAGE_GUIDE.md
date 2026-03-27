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
- `full` — dependency sync (unless skipped) + watchers + bridge

PowerShell `full` mode also auto-registers the native messaging host for Chrome/Edge
using the extension manifest key. You can run that step explicitly with:

```powershell
npm run dev:register-native-host
```

In PowerShell `watch` / `full` mode, pressing `Ctrl+C` in the main runner now
stops watcher process trees and closes watcher terminals automatically.
In PowerShell `full` mode, dependency sync is incremental (`npm install`) when
`node_modules` already exists, which avoids common Windows lock churn during
restart loops. If a clean install path still hits transient `EPERM` locks
(`npm ci`), the script falls back to `npm install`.

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
npm run dev:register-native-host
npm run dev:examples
npm run build:examples
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

The bridge generates its own signing key on first run and persists it to `%LOCALAPPDATA%\BYOM\bridge\state\bridge-state.json`. No shared secret or manual configuration is needed.

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

### 4.4 Run the examples web app (extension + SDK showcase)

The repository now includes a Mantine-based examples app:

- Workspace: `apps\examples-web`
- Start command: `npm run dev:examples`
- Build command: `npm run build:examples`

Run it:

```powershell
npm run dev:examples
```

Open the printed local URL (default `http://127.0.0.1:4172`).

The app demonstrates:

- Connect/list/select/send/stream BYOM SDK flows
- Extension injected transport (`window.byom`) vs mock fallback transport
- Provider/model switching scenarios
- Typed SDK error handling (policy denial, transient failure, timeout simulation)
- Integration snippet for real app embedding

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

Then open extension options and run **Pair Bridge (One Click)**:

1. Click **Pair Bridge**.
2. If one-click auto-completion succeeds, pairing is done immediately.
3. If manual fallback is required, read the one-time code from bridge output.
   - If the bridge is launched as the background native host on Windows dev setup, read it from:
     `"%LOCALAPPDATA%\BYOM\bridge\logs\pairing-code.log"`
4. Enter the code in **One-time Pairing Code** and click **Complete Pairing**.

Pairing sessions/handles are persisted by the bridge at:
`"%LOCALAPPDATA%\BYOM\bridge\state\pairing-state.json"` (dev native-host launcher default).

Handshake challenges are persisted by the bridge at:
`"%LOCALAPPDATA%\BYOM\bridge\state\handshake-state.json"` (dev native-host launcher default).
This is required because `sendNativeMessage` can invoke a fresh native host process per request.

Cloud connection-handle epoch state is persisted by the bridge at:
`"%LOCALAPPDATA%\BYOM\bridge\state\cloud-connection-state.json"` (dev native-host launcher default).
This keeps cloud chat execution resumable across native host process restarts in development.

The extension stores a pairing handle plus wrapped key material; raw shared secrets are no longer entered manually.

### 5.3 Cloud rollout flags, canary, and rollback controls

Bridge cloud execution is fail-closed by default. Configure rollout through environment variables:

```powershell
# Global on/off gate (default false)
$env:BYOM_CLOUD_BROKER_V2_ENABLED = "true"

# Optional per-provider gates (default false)
$env:BYOM_CLOUD_PROVIDER_ANTHROPIC_API_KEY_ENABLED = "true"
$env:BYOM_CLOUD_PROVIDER_ANTHROPIC_OAUTH_ENABLED = "true"
$env:BYOM_CLOUD_PROVIDER_FOUNDRY_ENABLED = "true"
$env:BYOM_CLOUD_PROVIDER_VERTEX_ENABLED = "true"
$env:BYOM_CLOUD_PROVIDER_BEDROCK_ENABLED = "true"
$env:BYOM_CLOUD_PROVIDER_OPENAI_ENABLED = "true"
$env:BYOM_CLOUD_PROVIDER_PERPLEXITY_ENABLED = "true"
$env:BYOM_CLOUD_PROVIDER_GEMINI_ENABLED = "true"

# Optional explicit method allowlist CSV (in addition to provider gates)
$env:BYOM_CLOUD_METHOD_ALLOWLIST = "anthropic.api_key,foundry.api_key,vertex.api_key,vertex.service_account,vertex.workload_identity_federation,bedrock.api_key,bedrock.assume_role,bedrock.aws_access_key,openai.api_key,perplexity.api_key,gemini.api_key,gemini.oauth_access_token"

# Optional canary allowlists (CSV). If either list is non-empty, unknown values are denied.
$env:BYOM_CLOUD_CANARY_EXTENSION_IDS = "abcdefghijklmnopabcdefghijklmnop"
$env:BYOM_CLOUD_CANARY_ORIGINS = "https://app.example.com,https://staging.example.com"

# Authenticated-origin policy for signed bridge requests:
# - loopback origins are trusted by default for local dev
# - non-loopback origins are denied unless explicitly allowlisted
$env:BYOM_BRIDGE_AUTHENTICATED_ORIGINS = "https://app.example.com,https://staging.example.com"
$env:BYOM_BRIDGE_AUTHENTICATED_EXTENSION_IDS = "abcdefghijklmnopabcdefghijklmnop"

# Optional: disable default loopback trust if your environment requires fully explicit origin auth
$env:BYOM_BRIDGE_ALLOW_LOOPBACK_ORIGINS = "false"
```

For backward compatibility with older env settings, `foundry.aad_client_credentials` in `BYOM_CLOUD_METHOD_ALLOWLIST` is normalized to `foundry.api_key` at runtime.

Dev note: `scripts\dev\native-host\byom-bridge-native-host.cmd` now defaults these flags to enabled when they are unset, and sets `BYOM_BRIDGE_PREFER_WORKSPACE_ADAPTER_SOURCE=true` by default. This prevents stale workspace `dist` outputs from masking newer adapter source changes during local development.

Rollback order:

1. Disable provider-level flag(s) first (smallest blast radius).
2. Disable `BYOM_CLOUD_BROKER_V2_ENABLED` for immediate global cloud deny.

### 5.4 Extension package in production

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
- The extension now auto-injects `window.byom` on `http(s)` pages through its content-script bridge.
- If `window.byom` is still missing, reload the unpacked extension, refresh the target tab, and verify the extension has site access for that origin.

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

If you do not rely on extension injection in your deployment, pass your own transport implementation:

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
- Options page now includes a full provider connection flow (test + save + activate + remove).
- Wallet data shape is enforced by `apps\extension\src\ui\popup-state.ts`.
- Wallet message handler is auto-registered by background runtime bootstrap.
- Cloud provider state chips now support:
  - `connected`, `disconnected`, `attention`
  - `reconnecting`, `failed`, `revoked`, `degraded`
- For cloud providers, `metadata.discoveryRegionStatus` containing `stale` / `partial` / `unavailable` now normalizes to `degraded` with fallback detail text in popup rendering.
- Bridge cloud error responses preserve `reasonCode` while redacting sensitive credential/token material from user-visible messages.

Storage keys used by popup:

- `byom.wallet.providers.v1`
- `byom.wallet.activeProvider.v1`
- `byom.wallet.ui.lastError.v1`

The options page writes to storage keys:

- `byom.wallet.providers.v1`
- `byom.wallet.activeProvider.v1`

If needed, you can still seed demo state from extension service worker console:

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
      status: "degraded",
      models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }],
      lastSyncedAt: Date.now(),
      metadata: {
        discoveryRegionStatus: "us-east-1:stale,us-west-2:healthy",
        statusDetail: "Fallback region us-west-2 in use."
      }
    }
  ],
  "byom.wallet.activeProvider.v1": {
    providerId: "ollama",
    modelId: "llama3.2"
  }
});
```

Then open extension popup to inspect state rendering and actions.

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
npm run test -- .\ops\tests\release-gates
npm run test -- .\ops\tests\version-skew
npm run test -- .\ops\tests\soak
```

Operational docs:

- SLOs: `ops\slo\slo-definitions.md`
- Alert rules: `ops\slo\alert-rules.md`
- Runbooks: `ops\runbooks\*.md`

---

## 10) Security checklist for running this safely

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
- Verify the extension has an active pairing handle for the selected bridge host.
- Run `npm run dev:register-native-host`, then reload the extension.

### `auth.invalid` during handshake

- Pairing key mismatch, stale pairing handle, or stale challenge nonce.
- Re-run **Pair Bridge** and complete with a fresh one-time code.
- If needed, revoke old handle and rotate pairing in extension options.
- If the bridge runs as background native host, fetch latest code lines with:
  `Get-Content "$env:LOCALAPPDATA\BYOM\bridge\logs\pairing-code.log" -Tail 50`

### Bridge warns cloud adapter package `dist/index.js` is missing

- Bridge now falls back to workspace adapter source entries when package `dist` artifacts are absent.
- If warnings persist after pull/reload, run:
  `npm run build -w @byom-ai/adapter-openai && npm run build -w @byom-ai/adapter-perplexity && npm run build -w @byom-ai/adapter-gemini`

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

- Wire end-to-end SDK request mediation through native messaging (beyond provider setup).
- Persist provider secret material in OS secure storage via bridge/keychain integration.
- Add bridge service installation scripts (Windows/macOS/Linux) and signed release artifacts.
- Add example web app demonstrating `BYOMClient` + extension transport end-to-end.

