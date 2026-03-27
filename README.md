# Arlopass

Let web applications use your AI providers — local models, paid subscriptions, CLI tools — without exposing your credentials.

```ts
import { ArlopassClient } from "@arlopass/web-sdk";

const client = new ArlopassClient({ transport: window.arlopass, origin: location.origin });

await client.connect({ appId: "com.acme.app" });

const { providers } = await client.listProviders();
await client.selectProvider({
  providerId: providers[0].providerId,
  modelId: providers[0].models[0],
});

const reply = await client.chat.send({
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(reply.message.content);

await client.disconnect();
```

The Arlopass extension injects a transport at `window.arlopass`. The web app never sees your API keys or tokens — they stay on your machine, routed through a local bridge to your chosen provider.

[![Build Status](https://img.shields.io/github/actions/workflow/status/arlopass/arlopass/build.yml?style=flat-square&label=Build)](https://github.com/arlopass/arlopass/actions)
[![Node.js](https://img.shields.io/badge/Node.js->=20-3c873a?style=flat-square)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

---

[How it works](#how-it-works) · [Streaming](#streaming) · [Adapters](#using-adapters-directly) · [Setup](#getting-started) · [Packages](#packages) · [Development](#development)

## How it works

1. A web app requests AI capabilities through `@arlopass/web-sdk`
2. The Arlopass browser extension prompts the user for consent
3. The user selects a provider and model from their connected accounts
4. Requests route through a local bridge to the chosen provider
5. Policy, audit, and telemetry are enforced at every trust boundary

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Web Application                      │
│                     @arlopass/web-sdk                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ window.arlopass (injected transport)
┌──────────────────────────▼──────────────────────────────────┐
│                   Arlopass Wallet Extension                  │
│        Consent UI · Permission Store · Policy Preflight     │
└──────────────────────────┬──────────────────────────────────┘
                           │ Chrome Native Messaging (stdio)
┌──────────────────────────▼──────────────────────────────────┐
│                      Local Bridge Daemon                    │
│     Adapter Host · Session Management · Policy Enforcement  │
├─────────┬──────────┬────────────┬───────────────────────────┤
│ Ollama  │  Claude  │  CLI Bridge│  Amazon Bedrock / GCP /   │
│ Adapter │  Adapter │  Adapter   │  Azure (planned)          │
└─────────┴──────────┴────────────┴───────────────────────────┘
```

**Trust boundaries are enforced at every layer:**

| Boundary | Protection |
|----------|-----------|
| Web app ↔ Extension | Origin isolation, explicit user consent, capability-scoped permissions |
| Extension ↔ Bridge | HMAC challenge/response handshake, ephemeral session keys, anti-replay nonces |
| Bridge ↔ Adapters | Sandboxed execution, manifest-declared capabilities, egress restrictions |
| Adapter ↔ Provider | Least-privilege auth, OS keychain credential storage, request timeouts |

## Getting Started

Requires [Node.js 20+](https://nodejs.org/download/) and [Chrome](https://www.google.com/chrome/) (or Chromium).

```bash
git clone https://github.com/arlopass/arlopass.git
cd arlopass
npm ci
```

Verify the build:

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

### Dev Environment

```bash
# PowerShell (Windows)
.\scripts\dev\run-dev.ps1 -Mode full

# Bash (macOS/Linux)
./scripts/dev/run-dev.sh full
```

This installs dependencies, starts build watchers, launches the bridge, and registers the native messaging host.

> [!TIP]
> NPM aliases: `npm run dev:full`, `npm run dev:setup`, `npm run dev:validate`, `npm run dev:watch`, `npm run dev:bridge`.

### Load the Extension

1. Build: `npm run build -w @arlopass/extension`
2. Open `chrome://extensions`, enable **Developer mode**
3. Click **Load unpacked**, select `apps/extension`

### Examples App

```bash
npm run dev:examples
```

Opens at `http://127.0.0.1:4172` — demonstrates connect/disconnect, provider selection, chat, streaming, and error handling.

## Streaming

```ts
for await (const event of client.chat.stream({
  messages: [{ role: "user", content: "Explain zero-trust architecture" }],
})) {
  if (event.type === "chunk") process.stdout.write(event.delta);
}
```

## Using Adapters Directly

Skip the extension and talk to a provider directly:

```ts
import { OllamaAdapter } from "@arlopass/adapter-ollama";

const adapter = new OllamaAdapter({ baseUrl: "http://localhost:11434" });
const models = await adapter.listModels();
const sessionId = await adapter.createSession({ model: "llama3.2" });
const output = await adapter.sendMessage(sessionId, "Summarize secure coding in 5 bullets.");
console.log(output);
await adapter.shutdown();
```

## Custom Transport

If you don't use the browser extension, supply your own `ArlopassTransport`:

```ts
import { ArlopassClient, type ArlopassTransport } from "@arlopass/web-sdk";

const transport: ArlopassTransport = {
  async request(req) {
    const res = await fetch("/api/arlopass", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    return { envelope: await res.json() };
  },
  async stream(req) {
    const res = await fetch("/api/arlopass/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    return {
      async *[Symbol.asyncIterator]() {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield { envelope: JSON.parse(decoder.decode(value)) };
        }
      },
    };
  },
};

const client = new ArlopassClient({ transport, origin: location.origin });

## Packages

This monorepo is organized into three workspace groups:

### Core Packages (`packages/`)

| Package | Description |
|---------|-------------|
| [`@arlopass/protocol`](packages/protocol/) | Envelope format, capability model, version negotiation, error codes |
| [`@arlopass/web-sdk`](packages/web-sdk/) | `ArlopassClient` — connect, chat, stream, state machine |
| [`@arlopass/policy`](packages/policy/) | Policy evaluation — allow/deny rules, signed bundles, ed25519 verification |
| [`@arlopass/audit`](packages/audit/) | Audit events, JSONL and OTLP exporters, field redaction |
| [`@arlopass/telemetry`](packages/telemetry/) | Metrics, tracing, and sensitive-data redaction |

### Adapters (`adapters/`)

| Package | Provider | Status |
|---------|----------|--------|
| [`@arlopass/adapter-ollama`](adapters/adapter-ollama/) | Local Ollama models | Implemented |
| [`@arlopass/adapter-claude-subscription`](adapters/adapter-claude-subscription/) | Anthropic Claude API | Auth in progress |
| [`@arlopass/adapter-local-cli-bridge`](adapters/adapter-local-cli-bridge/) | Local CLI tools (Copilot CLI, Claude Desktop) | Implemented |
| [`@arlopass/adapter-amazon-bedrock`](adapters/adapter-amazon-bedrock/) | Amazon Bedrock | Planned |
| [`@arlopass/adapter-google-vertex-ai`](adapters/adapter-google-vertex-ai/) | Google Vertex AI | Planned |
| [`@arlopass/adapter-microsoft-foundry`](adapters/adapter-microsoft-foundry/) | Azure AI Foundry | Planned |
| [`@arlopass/adapter-runtime`](adapters/runtime/) | Adapter host lifecycle, sandbox, health checks, manifest validation |
| [`@arlopass/adapter-tooling`](adapters/tooling/) | Development utilities for building adapters |

### Applications (`apps/`)

| Package | Description |
|---------|-------------|
| [`@arlopass/bridge`](apps/bridge/) | Native messaging daemon — routes requests between extension and adapters |
| [`@arlopass/extension`](apps/extension/) | Chrome Manifest V3 extension — consent UI, permissions, provider selection |
| [`@arlopass/examples-web`](apps/examples-web/) | React + Mantine demo app with all SDK integration patterns |

### Operations (`ops/`)

[SLO definitions](ops/slo/slo-definitions.md), [alert rules](ops/slo/alert-rules.md), [runbooks](ops/runbooks/), and test suites ([chaos](ops/tests/chaos/), [release-gates](ops/tests/release-gates/), [soak](ops/tests/soak/), [version-skew](ops/tests/version-skew/)).

## Development

### Project Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:full` | Full dev environment (deps + watchers + bridge) |
| `npm run dev:setup` | Install dependencies |
| `npm run dev:validate` | Run lint + typecheck + tests |
| `npm run dev:watch` | Watch builds for bridge + extension |
| `npm run dev:bridge` | Build and run the bridge |
| `npm run dev:examples` | Start the examples web app |
| `npm run dev:register-native-host` | Register Chrome native messaging host |
| `npm test` | Run all tests with Vitest |
| `npm run build` | Build all workspaces |
| `npm run lint` | Lint all workspaces |
| `npm run typecheck` | Type-check all workspaces |

### Running Tests

```bash
# All tests
npm test

# Specific workspace
npm run test -w @arlopass/web-sdk

# Watch mode
npx vitest --workspace vitest.workspace.ts

# Reliability suites
npm run test -- ./ops/tests/chaos
npm run test -- ./ops/tests/release-gates
npm run test -- ./ops/tests/soak
npm run test -- ./ops/tests/version-skew
```

### Building for Production

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

> [!IMPORTANT]
> The bridge and extension pair automatically on first connection. No shared secret or manual configuration is needed.

### Native Messaging Host Registration

For the extension to communicate with the local bridge, register the native messaging host:

```bash
npm run dev:register-native-host
```

Or manually create a `com.arlopass.bridge.json` manifest pointing to your bridge executable and register it in the Chrome NativeMessagingHosts registry key.

## Security

- **Per-origin permissions** — Each web app must be explicitly approved
- **Capability-scoped grants** — `provider.list`, `session.create`, `chat.completions`, `chat.stream`
- **Dual enforcement** — Preflight in extension + authoritative check in bridge
- **OS keychain storage** — Windows Credential Manager, macOS Keychain, Linux Secret Service
- **Signed artifacts** — Ed25519 signing for policy bundles and adapters
- **Anti-replay** — Nonce expiry and strict request TTL on bridge communications
- **Default-deny** — No auto-connect, no wildcard origins, sensitive fields redacted from logs

> [!NOTE]
> For security vulnerabilities, please see our [SECURITY.md](SECURITY.md) for responsible disclosure guidelines.

## Troubleshooting

| Problem | Solution |
|---------|---------|
| Extension can't connect to bridge | Verify `com.arlopass.bridge` native host is registered. Run `npm run dev:register-native-host` and reload the extension. |
| `auth.invalid` during handshake | Extension and bridge may have stale pairing state — delete `%LOCALAPPDATA%\Arlopass\bridge\state` and re-pair. |
| Popup shows no providers | Seed demo providers via the extension options page or service worker console. See the [usage guide](RUNNING_AND_USAGE_GUIDE.md#7-how-to-use-current-extension-wallet-ui). |
| `window.arlopass` is undefined | Reload the unpacked extension, refresh the target tab, and verify the extension has site access for that origin. |

For detailed setup, production deployment, and advanced usage patterns, see the [Running & Usage Guide](RUNNING_AND_USAGE_GUIDE.md).

## Project Status

| Component | Status |
|-----------|--------|
| Protocol & Envelope | Complete |
| Web SDK (ArlopassClient) | Core API complete |
| Policy Engine | Schema ready, evaluator in progress |
| Audit & Telemetry | Core schema and metrics defined |
| Adapter Runtime | Host lifecycle, sandbox, loader ready |
| Ollama Adapter | Complete |
| Claude Adapter | Auth flow in progress |
| CLI Bridge Adapter | Complete |
| Cloud Adapters (AWS, GCP, Azure) | Planned |
| Bridge Daemon | Message routing + native host ready |
| Wallet Extension | UI, content scripts, service worker implemented |
| Examples App | Runnable |
