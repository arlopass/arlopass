# @byom-ai/web-sdk

Connect web applications to a user's own AI providers without handling their credentials.

```ts
import { BYOMClient } from "@byom-ai/web-sdk";

const client = new BYOMClient({ transport: window.byom, origin: location.origin });

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

The BYOM extension injects a transport at `window.byom`. Install with:

```bash
npm install @byom-ai/web-sdk
```

## Streaming

```ts
for await (const event of client.chat.stream({
  messages: [{ role: "user", content: "Explain zero-trust architecture" }],
})) {
  if (event.type === "chunk") process.stdout.write(event.delta);
  if (event.type === "done") console.log("\n[done]");
}
```

---

## API Reference

### `BYOMClient`

Manages the full lifecycle: connect, select provider, chat, stream, disconnect.

```ts
const client = new BYOMClient(options: BYOMClientOptions);
```

#### Constructor Options (`BYOMClientOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `transport` | `BYOMTransport` | — | Required. Transport implementation |
| `origin` | `string` | — | Page origin for permission scoping |
| `protocolVersion` | `string` | `"1.0.0"` | Protocol version to negotiate |
| `timeoutMs` | `number` | `5000` | Request timeout in milliseconds |
| `envelopeTtlMs` | `number` | `60000` | Envelope time-to-live |
| `nonce` | `string` | — | Override nonce (testing) |
| `now` | `() => Date` | `() => new Date()` | Clock override (testing) |
| `randomId` | `() => string` | — | ID generator override (testing) |
| `defaultCapabilities` | `readonly ProtocolCapability[]` | All capabilities | Capabilities to request on connect |
| `defaultProviderId` | `string` | — | Auto-select provider on connect |
| `defaultModelId` | `string` | — | Auto-select model on connect |
| `tracing` | `TelemetryTracing` | — | Trace span propagation |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `state` | `ClientState` | Current connection state |
| `sessionId` | `SessionId \| undefined` | Active session ID |
| `selectedProvider` | `{ providerId: string; modelId: string } \| undefined` | Active provider/model |

#### Methods

**`connect(options: ConnectOptions): Promise<ConnectResult>`**

Establish a session with the BYOM wallet.

```ts
type ConnectOptions = { appId: string; origin?: string; timeoutMs?: number }
type ConnectResult = { sessionId: SessionId; capabilities: readonly ProtocolCapability[]; protocolVersion: string; correlationId: CorrelationId }
```

**`listProviders(): Promise<ListProvidersResult>`**

Discover available providers and their models. Requires connected state.

```ts
type ListProvidersResult = { providers: readonly ProviderDescriptor[]; correlationId: CorrelationId }
type ProviderDescriptor = { providerId: string; providerName: string; models: readonly string[] }
```

**`selectProvider(input: SelectProviderInput): Promise<SelectProviderResult>`**

Set the active provider and model for chat operations.

```ts
type SelectProviderInput = { providerId: string; modelId: string }
type SelectProviderResult = { providerId: string; modelId: string; correlationId: CorrelationId }
```

**`chat.send(input: ChatInput, options?: ChatOperationOptions): Promise<ChatSendResult>`**

Send a message and receive a complete response.

```ts
type ChatInput = { messages: readonly ChatMessage[] }
type ChatMessage = { role: ChatRole; content: string }
type ChatRole = "system" | "user" | "assistant"
type ChatSendResult = { message: ChatMessage; correlationId: CorrelationId }
```

**`chat.stream(input: ChatInput, options?: ChatOperationOptions): AsyncIterable<ChatStreamEvent>`**

Stream a response with real-time chunks.

```ts
type ChatStreamEvent =
  | { type: "chunk"; delta: string; index: number; correlationId: CorrelationId }
  | { type: "done"; correlationId: CorrelationId }
```

**`disconnect(): Promise<void>`**

Tear down the session and reset state.

---

### `BYOMStateMachine`

Tracks client connection state with validated transitions.

```ts
import { BYOMStateMachine } from "@byom-ai/web-sdk";

const sm = new BYOMStateMachine("disconnected");
sm.canTransition("connecting"); // true
sm.transition("connecting");    // "connecting"
sm.state;                       // "connecting"
sm.history;                     // [{ from: "disconnected", to: "connecting", timestamp }]
```

**States (`ClientState`):**

`"disconnected"` | `"connecting"` | `"connected"` | `"degraded"` | `"reconnecting"` | `"failed"`

---

### `BYOMTransport`

Interface for routing requests to the BYOM wallet. The extension injects one at `window.byom`.

```ts
interface BYOMTransport {
  request<TReq, TRes>(request: TransportRequest<TReq>): Promise<TransportResponse<TRes>>;
  stream<TReq, TRes>(request: TransportRequest<TReq>): Promise<TransportStream<TRes>>;
  disconnect?(sessionId: string): Promise<void>;
}

type TransportRequest<TPayload> = { envelope: ProtocolEnvelopePayload<TPayload>; timeoutMs?: number }
type TransportResponse<TPayload> = { envelope: ProtocolEnvelopePayload<TPayload> }
type TransportStream<TPayload> = AsyncIterable<TransportResponse<TPayload>>
```

---

### Error Classes

All errors extend `BYOMSDKError`:

```ts
class BYOMSDKError extends Error {
  machineCode: SDKMachineCode;
  reasonCode: ProtocolReasonCode;
  retryable: boolean;
  correlationId: string | undefined;
  details: SDKErrorDetails | undefined;
}
```

| Class | When thrown |
|-------|------------|
| `BYOMStateError` | Operating in wrong state (e.g., `chat.send` before `connect`) |
| `BYOMInvalidStateTransitionError` | Invalid state transition attempted |
| `BYOMProtocolBoundaryError` | Protocol-level failures from wallet/bridge |
| `BYOMTransportError` | Transport layer failures |
| `BYOMTimeoutError` | Request or stream exceeded timeout |

**SDK Machine Codes (`SDK_MACHINE_CODES`):**

| Code | Meaning |
|------|---------|
| `BYOM_SDK_INVALID_STATE_TRANSITION` | Attempted illegal state change |
| `BYOM_SDK_INVALID_STATE_OPERATION` | Operation not valid for current state |
| `BYOM_SDK_MISSING_PROVIDER_SELECTION` | Chat called without selecting provider |
| `BYOM_SDK_PROTOCOL_VIOLATION` | Protocol envelope violated constraints |
| `BYOM_SDK_TRANSPORT_ERROR` | Transport request failed |

---

### Helper Functions

**`withTimeout<T>(operation: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T>`**

Race a promise against a timeout. Throws `BYOMTimeoutError` on expiry.

**`withStreamTimeout<T>(stream: TransportStream<T>, timeoutMs: number, timeoutMessage: string): AsyncIterable<TransportResponse<T>>`**

Wrap an async iterable with per-chunk timeout enforcement.

**`normalizeSDKError(error: unknown, fallback: SDKErrorFallback): BYOMSDKError`**

Wrap any thrown value in the appropriate `BYOMSDKError` subclass based on protocol error codes.

---

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `SDK_PROTOCOL_VERSION` | `"1.0.0"` | Protocol version the SDK implements |
| `DEFAULT_REQUEST_TIMEOUT_MS` | `5000` | Default request timeout |
| `DEFAULT_ENVELOPE_TTL_MS` | `60000` | Default envelope time-to-live |
| `SDK_ENVELOPE_NONCE` | `"AQIDBAUGBwgJCgsMDQ4PEA"` | Default nonce |

---

### Dependencies

- `@byom-ai/protocol` — Envelope, capability model, error taxonomy
- `@byom-ai/telemetry` — Request metrics and trace propagation
