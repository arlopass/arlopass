# @byom-ai/adapter-claude-subscription

Connect to [Anthropic Claude](https://www.anthropic.com/) via API key or OAuth2 device flow through the BYOM wallet.

```ts
import { ClaudeSubscriptionAdapter } from "@byom-ai/adapter-claude-subscription";

const adapter = new ClaudeSubscriptionAdapter({
  auth: { authType: "api_key", apiKey: process.env.ANTHROPIC_API_KEY! },
});

const methods = adapter.listConnectionMethods();
console.log(methods); // OAuth2 device flow + API key

const models = await adapter.listModels();
console.log(models); // ["claude-opus-4-5", "claude-sonnet-4-5", ...]

const sessionId = await adapter.createSession({ model: "claude-sonnet-4-5" });
const response = await adapter.sendMessage(sessionId, "Hello from BYOM");
console.log(response);
```

> [!NOTE]
> Auth flow implementation is in progress. Core adapter structure and cloud connection contract are defined.

---

## API Reference

### `ClaudeSubscriptionAdapter`

Implements `CloudAdapterContractV2`.

```ts
const adapter = new ClaudeSubscriptionAdapter(options: ClaudeAdapterOptions);
```

#### Constructor Options

```ts
type ClaudeAdapterOptions = {
  auth: ClaudeAuthConfig;
  defaultModel?: string;
  timeoutMs?: number;
  baseUrl?: string;
}

type ClaudeAuthConfig = {
  authType: "api_key" | "oauth2";
  apiKey?: string;
  accessToken?: string;
}
```

#### `AdapterContract` Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `describeCapabilities()` | `readonly ProtocolCapability[]` | Supported capabilities |
| `listModels()` | `Promise<readonly string[]>` | Known Anthropic models |
| `createSession(options?)` | `Promise<string>` | Initialize a chat session |
| `sendMessage(sessionId, message)` | `Promise<string>` | Non-streaming chat completion |
| `streamMessage(sessionId, message, onChunk)` | `Promise<void>` | Streaming chat |
| `healthCheck()` | `Promise<boolean>` | Check API reachability |
| `shutdown()` | `Promise<void>` | Clean up resources |

#### `CloudAdapterContractV2` Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `listConnectionMethods()` | `readonly ConnectionMethodDescriptor[]` | OAuth2 device + API key |
| `beginConnect(input)` | `Promise<BeginConnectResult>` | Start connection flow |
| `completeConnect(input)` | `Promise<CompleteConnectResult>` | Finish connection |
| `validateCredentialRef(input)` | `Promise<ValidationResult>` | Validate stored credentials |
| `revokeCredentialRef(input)` | `Promise<void>` | Revoke credentials |
| `discoverModels(ctx)` | `Promise<readonly ModelDescriptor[]>` | Discover models via API |
| `discoverCapabilities(ctx)` | `Promise<CapabilityDescriptor>` | Discover provider capabilities |

---

### Auth Utilities

**`buildAuthHeaders(config: ClaudeAuthConfig): ClaudeAuthHeaders`** — Build HTTP headers for Anthropic API requests.

```ts
type ClaudeAuthHeaders = {
  "anthropic-version": string;
  "content-type": string;
  "x-api-key"?: string;
  Authorization?: string;
}
```

**`isAuthConfig(value: unknown): boolean`** — Type guard for auth config.

**`isClaudeConnectionMethodId(value: string): boolean`** — Type guard for connection method IDs.

---

### Connection Methods

| Method ID | Auth Fields |
|-----------|------------|
| `anthropic.oauth_subscription` | `accessToken`, `refreshToken`, `endpointProfile` |
| `anthropic.api_key` | `apiKey`, `endpointProfile` |

---

### Constants

| Constant | Value |
|----------|-------|
| `CLAUDE_API_BASE` | `"https://api.anthropic.com"` |
| `CLAUDE_API_VERSION` | `"2023-06-01"` |
| `ANTHROPIC_KNOWN_MODELS` | `["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5", ...]` |

### `CLAUDE_SUBSCRIPTION_MANIFEST`

Provider ID `claude-subscription`, auth type `oauth2`, risk level `medium`, egress to `api.anthropic.com` (HTTPS).

---

### Dependencies

- `@byom-ai/adapter-runtime` — Adapter contract and cloud connection types
- `@byom-ai/protocol` — Envelope and error types
