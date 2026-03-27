# @arlopass/adapter-local-cli-bridge

Bridge local CLI tools — GitHub Copilot CLI, Claude Desktop, or any stdio-based AI tool — through the Arlopass wallet.

Spawns a CLI process, communicates via JSON-line stdio protocol, and translates Arlopass protocol messages into CLI-compatible requests.

```ts
import { LocalCliBridgeAdapter } from "@arlopass/adapter-local-cli-bridge";

const adapter = new LocalCliBridgeAdapter({
  command: "/usr/local/bin/my-ai-cli",
  args: ["--mode", "chat"],
});

const models = await adapter.listModels();
const sessionId = await adapter.createSession({ model: models[0] });

const response = await adapter.sendMessage(sessionId, "Hello");
console.log(response);

await adapter.streamMessage(sessionId, "Explain Arlopass", (chunk) => {
  process.stdout.write(chunk);
});

await adapter.shutdown();
```

---

## API Reference

### `LocalCliBridgeAdapter`

Implements `AdapterContract`.

```ts
const adapter = new LocalCliBridgeAdapter(options: LocalCliBridgeOptions);
```

#### Constructor Options (`LocalCliBridgeOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `command` | `string` | — | Required. Path to the CLI executable |
| `args` | `readonly string[]` | `[]` | Arguments passed to the CLI process |
| `timeoutMs` | `number` | `30000` | Request timeout in milliseconds |
| `spawnFn` | `typeof spawn` | `child_process.spawn` | Custom spawn function (for testing) |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `describeCapabilities()` | `readonly ProtocolCapability[]` | Supported capabilities |
| `listModels()` | `Promise<readonly string[]>` | Spawn CLI with `{ type: "list_models" }` |
| `createSession(options?)` | `Promise<string>` | Initialize a session |
| `sendMessage(sessionId, message)` | `Promise<string>` | Non-streaming JSON request/response |
| `streamMessage(sessionId, message, onChunk)` | `Promise<void>` | Streaming JSON line protocol |
| `healthCheck()` | `Promise<boolean>` | Check if CLI process is reachable |
| `shutdown()` | `Promise<void>` | Kill spawned processes |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `manifest` | `AdapterManifest` | Read-only adapter manifest |

---

### CLI Protocol

The adapter communicates with the CLI process via JSON lines on stdin/stdout:

| Direction | Message | Description |
|-----------|---------|-------------|
| stdin → CLI | `{ "type": "list_models" }` | Request available models |
| stdin → CLI | `{ "type": "chat", "sessionId": "...", "message": "..." }` | Send a chat message |
| CLI → stdout | `{ "type": "models", "models": [...] }` | Models response |
| CLI → stdout | `{ "type": "response", "content": "..." }` | Chat response |
| CLI → stdout | `{ "type": "chunk", "delta": "..." }` | Streaming chunk |
| CLI → stdout | `{ "type": "done" }` | Stream complete |

---

### `LOCAL_CLI_BRIDGE_MANIFEST`

```ts
const LOCAL_CLI_BRIDGE_MANIFEST: AdapterManifest = {
  schemaVersion: "1.0.0",
  providerId: "local-cli-bridge",
  version: "0.1.0",
  displayName: "Local CLI Bridge",
  authType: "local",
  capabilities: ["chat.completions", "chat.stream", "provider.list", "session.create"],
  requiredPermissions: ["process.spawn", "filesystem.read", "env.read"],
  egressRules: [],
  riskLevel: "medium",
  signingKeyId: "arlopass-first-party-v1",
}
```

---

### Dependencies

- `@arlopass/adapter-runtime` — Adapter contract and manifest validation
- `@arlopass/protocol` — Envelope and error types
