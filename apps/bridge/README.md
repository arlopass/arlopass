# @byom-ai/bridge

Local native messaging daemon that routes requests between the BYOM AI browser extension and provider adapters.

## Overview

The bridge is the authoritative enforcement point for the BYOM security model. It runs on the user's machine, communicates with the extension via Chrome's Native Messaging protocol (stdio), and dispatches requests to the appropriate adapter (Ollama, Claude, CLI tools, cloud providers).

## Responsibilities

- **Handshake authentication** — HMAC challenge/response with ephemeral session keys
- **Session management** — Session key lifecycle, grant synchronization
- **Policy enforcement** — Runtime policy checks (authoritative, not just UX preflight)
- **Request routing** — Envelope validation and dispatch to the correct executor
- **Provider connections** — Cloud provider discovery, token management, model listing
- **Audit logging** — Decision recording for compliance

## Message Types

| Category | Messages |
|----------|----------|
| Handshake | `handshake.challenge`, `handshake.verify` |
| Grants | `grant.sync`, `grant.revoke` |
| Requests | `request.check` |
| CLI | `cli.models.list`, `cli.thinking-levels.list`, `cli.chat.execute` |
| Cloud | `cloud.connection.*`, `cloud.chat.execute`, `cloud.models.discover` |

## Running the Bridge

### Development

```bash
# Using the dev runner (recommended)
npm run dev:bridge

# Or manually
node --loader ./scripts/dev/ts-js-specifier-loader.mjs ./apps/bridge/src/main.ts
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BYOM_BRIDGE_SHARED_SECRET` | Yes | 32-byte hex string (64 characters) for HMAC authentication |

Generate a secret:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$env:BYOM_BRIDGE_SHARED_SECRET = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
```

### Native Messaging Host Registration

The bridge must be registered as a Chrome native messaging host:

```bash
npm run dev:register-native-host
```

This creates the `com.byom.bridge` host manifest and registers it in the Chrome NativeMessagingHosts registry.

## Project Structure

```
src/
├── bridge-handler.ts     # Main request router
├── main.ts               # Entry point
├── native-host.ts        # Native messaging protocol
├── native-host-manifest.ts
├── audit/                # Audit event emission
├── cli/                  # CLI execution logic
├── cloud/                # Cloud provider connections
├── permissions/          # Permission evaluation
├── policy/               # Runtime policy enforcement
├── secrets/              # OS keychain integration
└── session/              # Session state management
```

## Dependencies

- `@byom-ai/protocol` — Envelope validation and error taxonomy
- `@byom-ai/policy` — Policy bundle evaluation
- `@byom-ai/audit` — Audit event recording
- `@byom-ai/telemetry` — Request metrics and tracing
