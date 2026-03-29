# @arlopass/web-sdk

Connect web applications to a user's own AI providers without handling their credentials.

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

The Arlopass extension injects a transport at `window.arlopass`. Install with:

```bash
pnpm add @arlopass/web-sdk
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

### `ArlopassClient`

Manages the full lifecycle: connect, select provider, chat, stream, disconnect.

```ts
const client = new ArlopassClient(options: ArlopassClientOptions);
```

#### Constructor Options (`ArlopassClientOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `transport` | `ArlopassTransport` | — | Required. Transport implementation |
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

Establish a session with the Arlopass wallet.

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

### `ArlopassStateMachine`

Tracks client connection state with validated transitions.

```ts
import { ArlopassStateMachine } from "@arlopass/web-sdk";

const sm = new ArlopassStateMachine("disconnected");
sm.canTransition("connecting"); // true
sm.transition("connecting");    // "connecting"
sm.state;                       // "connecting"
sm.history;                     // [{ from: "disconnected", to: "connecting", timestamp }]
```

**States (`ClientState`):**

`"disconnected"` | `"connecting"` | `"connected"` | `"degraded"` | `"reconnecting"` | `"failed"`

---

### `ArlopassTransport`

Interface for routing requests to the Arlopass wallet. The extension injects one at `window.arlopass`.

```ts
interface ArlopassTransport {
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

All errors extend `ArlopassSDKError`:

```ts
class ArlopassSDKError extends Error {
  machineCode: SDKMachineCode;
  reasonCode: ProtocolReasonCode;
  retryable: boolean;
  correlationId: string | undefined;
  details: SDKErrorDetails | undefined;
}
```

| Class | When thrown |
|-------|------------|
| `ArlopassStateError` | Operating in wrong state (e.g., `chat.send` before `connect`) |
| `ArlopassInvalidStateTransitionError` | Invalid state transition attempted |
| `ArlopassProtocolBoundaryError` | Protocol-level failures from wallet/bridge |
| `ArlopassTransportError` | Transport layer failures |
| `ArlopassTimeoutError` | Request or stream exceeded timeout |

**SDK Machine Codes (`SDK_MACHINE_CODES`):**

| Code | Meaning |
|------|---------|
| `ARLOPASS_SDK_INVALID_STATE_TRANSITION` | Attempted illegal state change |
| `ARLOPASS_SDK_INVALID_STATE_OPERATION` | Operation not valid for current state |
| `ARLOPASS_SDK_MISSING_PROVIDER_SELECTION` | Chat called without selecting provider |
| `ARLOPASS_SDK_PROTOCOL_VIOLATION` | Protocol envelope violated constraints |
| `ARLOPASS_SDK_TRANSPORT_ERROR` | Transport request failed |

---

### Helper Functions

**`withTimeout<T>(operation: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T>`**

Race a promise against a timeout. Throws `ArlopassTimeoutError` on expiry.

**`withStreamTimeout<T>(stream: TransportStream<T>, timeoutMs: number, timeoutMessage: string): AsyncIterable<TransportResponse<T>>`**

Wrap an async iterable with per-chunk timeout enforcement.

**`normalizeSDKError(error: unknown, fallback: SDKErrorFallback): ArlopassSDKError`**

Wrap any thrown value in the appropriate `ArlopassSDKError` subclass based on protocol error codes.

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

- `@arlopass/protocol` — Envelope, capability model, error taxonomy
- `@arlopass/telemetry` — Request metrics and trace propagation
