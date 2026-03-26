import { Stack, Title, Text, Divider } from "@mantine/core";
import { ApiTable, CodeBlock, InlineCode, Callout } from "../../../components";

const importLine = `import { BYOMClient } from "@byom-ai/web-sdk";`;

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

const clientOptions = [
  { name: "transport", type: "BYOMTransport", required: true, description: "Transport implementation (provided by the browser extension via window.byom)." },
  { name: "origin", type: "string", default: '"https://app.byom.local"', description: "Origin URL for envelope metadata. Auto-set to window.location.origin when in a browser." },
  { name: "timeoutMs", type: "number", default: "5000", description: "Default request timeout in milliseconds." },
  { name: "envelopeTtlMs", type: "number", default: "60000", description: "Time-to-live for protocol envelopes." },
  { name: "protocolVersion", type: "string", default: '"1.0.0"', description: "Protocol version string." },
  { name: "nonce", type: "string", description: "Nonce for envelope signatures." },
  { name: "now", type: "() => Date", description: "Clock function for envelope timestamps. Defaults to () => new Date()." },
  { name: "randomId", type: "() => string", description: "ID generator for request/correlation IDs. Defaults to crypto.randomUUID()." },
  { name: "defaultCapabilities", type: "readonly ProtocolCapability[]", description: "Capabilities to request during connect." },
  { name: "defaultProviderId", type: "string", default: '"provider.system"', description: "Fallback provider ID for envelopes before selection." },
  { name: "defaultModelId", type: "string", default: '"model.default"', description: "Fallback model ID for envelopes before selection." },
  { name: "tracing", type: "TelemetryTracing", description: "Optional tracing hook for observability." },
];

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

const clientProperties = [
  { name: "state", type: "ClientState", description: "Current connection state (readonly getter)." },
  { name: "sessionId", type: "string | undefined", description: "Active session ID after connect, undefined before." },
  { name: "selectedProvider", type: "{ providerId: string; modelId: string } | undefined", description: "Currently selected provider/model pair." },
  { name: "chat", type: "{ send, stream }", description: "Chat operation namespace (see Methods below)." },
];

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

const clientMethods = [
  { name: "connect", type: "(options: ConnectOptions) => Promise<ConnectResult>", description: "Establish connection with the extension. Transitions state: disconnected → connecting → connected." },
  { name: "disconnect", type: "() => Promise<void>", description: "Disconnect and reset state to disconnected." },
  { name: "listProviders", type: "() => Promise<ListProvidersResult>", description: "Fetch available providers and models. Requires connected state." },
  { name: "selectProvider", type: "(input: SelectProviderInput) => Promise<SelectProviderResult>", description: "Select a provider/model pair. Requires connected state." },
  { name: "chat.send", type: "(input: ChatInput, options?: ChatOperationOptions) => Promise<ChatSendResult>", description: "Send messages and receive a complete response. Requires connected state + selected provider." },
  { name: "chat.stream", type: "(input: ChatInput, options?: ChatOperationOptions) => AsyncIterable<ChatStreamEvent>", description: "Send messages and stream the response as chunks. Supports AbortSignal via options.signal." },
];

const connectExample = `const client = new BYOMClient({ transport: window.byom });

await client.connect({ appId: "com.example.myapp" });
const { providers } = await client.listProviders();
await client.selectProvider({ providerId: "openai", modelId: "gpt-4o" });`;

const chatExample = `// Non-streaming
const result = await client.chat.send({
  messages: [{ role: "user", content: "Hello" }],
});
console.log(result.message.content);

// Streaming
for await (const event of client.chat.stream({
  messages: [{ role: "user", content: "Hello" }],
})) {
  if (event.type === "chunk") process.stdout.write(event.delta);
}`;

const stateDiagram = `// State machine transitions:
//
// disconnected ──connect()──→ connecting ──success──→ connected
//                                  │                      │
//                                  └──fail──→ failed      ├──degraded
//                                                         │
// connected ──disconnect()──→ disconnected       reconnecting
//                                                    │
//                                                    └──→ connected | failed`;

export default function WebSDKClient() {
  return (
    <Stack gap="lg">
      <Title order={2}>BYOMClient</Title>
      <Text>
        The core client class. Manages connection state, provider selection, and
        chat operations over the protocol transport.
      </Text>

      <CodeBlock code={importLine} language="tsx" />

      {/* Constructor */}
      <Divider />
      <Title order={3}>Constructor options</Title>
      <ApiTable data={clientOptions} title="BYOMClientOptions" />

      <CodeBlock code={`const client = new BYOMClient({ transport, origin: window.location.origin });`} language="tsx" />

      {/* Properties */}
      <Divider />
      <Title order={3}>Properties</Title>
      <ApiTable data={clientProperties} />

      {/* Methods */}
      <Divider />
      <Title order={3}>Methods</Title>
      <ApiTable data={clientMethods} />

      <CodeBlock code={connectExample} language="tsx" />
      <CodeBlock code={chatExample} language="tsx" />

      {/* State machine */}
      <Divider />
      <Title order={3}>State machine</Title>
      <CodeBlock code={stateDiagram} language="text" />

      <Callout type="info" title="State guards">
        Methods that require a connected state (listProviders, selectProvider, chat.*) throw a{" "}
        <InlineCode>BYOMStateError</InlineCode> if called in an invalid state.
      </Callout>
    </Stack>
  );
}
