# @arlopass/bridge

Local native messaging daemon that routes requests between the Arlopass browser extension and provider adapters.

## Overview

The bridge is the authoritative enforcement point for the Arlopass security model. It runs on the user's machine, communicates with the extension via Chrome's Native Messaging protocol (stdio), and dispatches requests to the appropriate adapter (Ollama, Claude, CLI tools, cloud providers).

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

The bridge generates its own signing key automatically on first run and persists it to `bridge-state.json`. No shared secret is required.

| Variable | Required | Description |
|----------|----------|-------------|
| `ARLOPASS_BRIDGE_PAIRING_STATE_PATH` | No | Override path for pairing state file |
| `ARLOPASS_BRIDGE_HANDSHAKE_STATE_PATH` | No | Override path for handshake state file |

### Native Messaging Host Registration

The bridge must be registered as a Chrome native messaging host:

```bash
npm run dev:register-native-host
```

This creates the `com.arlopass.bridge` host manifest and registers it in the Chrome NativeMessagingHosts registry.

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

- `@arlopass/protocol` — Envelope validation and error taxonomy
- `@arlopass/policy` — Policy bundle evaluation
- `@arlopass/audit` — Audit event recording
- `@arlopass/telemetry` — Request metrics and tracing
