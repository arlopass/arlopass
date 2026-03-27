# @arlopass/adapter-ollama

Run local [Ollama](https://ollama.com) models (Llama, Mistral, Gemma, etc.) through the Arlopass wallet.

Requires Ollama running locally with at least one pulled model (`ollama pull llama3.2`).

```ts
import { OllamaAdapter } from "@arlopass/adapter-ollama";

const adapter = new OllamaAdapter({ baseUrl: "http://localhost:11434" });

const models = await adapter.listModels();
console.log(models); // ["llama3.2", "mistral", ...]

const sessionId = await adapter.createSession({ model: "llama3.2" });

const response = await adapter.sendMessage(sessionId, "Summarize secure coding in 5 bullets.");
console.log(response);

await adapter.streamMessage(sessionId, "Explain Arlopass", (chunk) => {
  process.stdout.write(chunk);
});

const healthy = await adapter.healthCheck();
console.log(healthy); // true

await adapter.shutdown();
```

---

## API Reference

### `OllamaAdapter`

Implements `AdapterContract`.

```ts
const adapter = new OllamaAdapter(options?: OllamaAdapterOptions);
```

#### Constructor Options (`OllamaAdapterOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | `"http://localhost:11434"` | Ollama API endpoint |
| `model` | `string` | `"llama3.2"` | Default model |
| `timeoutMs` | `number` | `30000` | Request timeout in milliseconds |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `describeCapabilities()` | `readonly ProtocolCapability[]` | Returns supported capabilities |
| `listModels()` | `Promise<readonly string[]>` | Fetch models from Ollama `/api/tags` |
| `createSession(options?)` | `Promise<string>` | Initialize a chat session |
| `sendMessage(sessionId, message)` | `Promise<string>` | Non-streaming chat completion |
| `streamMessage(sessionId, message, onChunk)` | `Promise<void>` | Streaming chat with per-chunk callback |
| `healthCheck()` | `Promise<boolean>` | Check if Ollama is reachable |
| `shutdown()` | `Promise<void>` | Clean up resources |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `manifest` | `AdapterManifest` | Read-only adapter manifest |

---

### `OLLAMA_MANIFEST`

```ts
const OLLAMA_MANIFEST: AdapterManifest = {
  schemaVersion: "1.0.0",
  providerId: "ollama",
  version: "0.1.0",
  displayName: "Ollama",
  authType: "none",
  capabilities: ["chat.completions", "chat.stream", "provider.list", "session.create"],
  requiredPermissions: ["network.egress"],
  egressRules: [{ host: "localhost", port: 11434, protocol: "http" }],
  riskLevel: "low",
  signingKeyId: "arlopass-first-party-v1",
}
```

---

### Dependencies

- `@arlopass/adapter-runtime` — Adapter contract and manifest validation
- `@arlopass/protocol` — Envelope and error types
