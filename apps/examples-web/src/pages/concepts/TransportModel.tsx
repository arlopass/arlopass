import { Stack, Title, Text } from "@mantine/core";
import { Callout, CodeBlock } from "../../components";
import { navigate } from "../../router";

const transportInterface = `// The BYOMTransport interface — two methods, that's it.

export interface BYOMTransport {
  // Send a request, get a single response
  request<TRequestPayload, TResponsePayload>(
    request: TransportRequest<TRequestPayload>,
  ): Promise<TransportResponse<TResponsePayload>>;

  // Send a request, get a stream of responses
  stream<TRequestPayload, TResponsePayload>(
    request: TransportRequest<TRequestPayload>,
  ): Promise<TransportStream<TResponsePayload>>;

  // Optional — called on disconnect
  disconnect?(sessionId: string): Promise<void>;
}`;

const injectedTransport = `// The extension's content script injects window.byom.
// This happens before your app code runs.

// React SDK — detects it automatically
import { BYOMProvider } from "@byom-ai/react";

<BYOMProvider appId="my-app">
  {/* BYOMProvider checks window.byom on mount */}
  {/* If missing → transportAvailable: false */}
  <App />
</BYOMProvider>

// Web SDK — you reference it explicitly
import { BYOMClient } from "@byom-ai/web-sdk";
const client = new BYOMClient({ transport: window.byom });`;

const envelopeFormat = `// Every request/response is wrapped in a CanonicalEnvelope.
// The SDK builds this automatically — you never construct one manually.

const envelope = {
  protocolVersion: "1.0.0",       // Must match — version mismatch rejects early
  requestId:       "uuid-1234",   // Unique per request
  correlationId:   "uuid-5678",   // Links request → response pairs
  origin:          "https://myapp.com", // From window.location.origin
  sessionId:       "uuid-abcd",   // Scoped to this connect() session
  capability:      "chat.stream", // What operation is requested
  issuedAt:        "2025-03-26T...",  // When the envelope was created
  expiresAt:       "2025-03-26T...",  // TTL — expired envelopes are rejected
  nonce:           "random-value",    // Prevents replay attacks
  payload:         { /* request data */ },
};`;

const envelopeValidation = `// The extension validates every envelope before processing:

// 1. Protocol version must match
if (envelope.protocolVersion !== SUPPORTED_VERSION) reject();

// 2. Timestamp check — is issuedAt recent?
if (Date.now() - Date.parse(envelope.issuedAt) > TTL) reject();

// 3. Expiry check — has the envelope expired?
if (Date.now() > Date.parse(envelope.expiresAt)) reject();

// 4. Nonce check — has this nonce been seen before?
if (nonceStore.has(envelope.nonce)) reject(); // replay detected
nonceStore.add(envelope.nonce);

// 5. Correlation ID — response must reference the original request
if (response.correlationId !== request.requestId) reject();`;

const mockTransport = `// For testing, use the mock transport from the React SDK test utilities.
// It implements BYOMTransport without needing the extension.

import { createMockTransport } from "@byom-ai/react/testing";

const transport = createMockTransport({
  providers: [
    { providerId: "mock-provider", models: [{ modelId: "mock-model" }] },
  ],
});

// Use it in tests exactly like the real transport
const client = new BYOMClient({ transport });
await client.connect({ appId: "test-app" });`;

export default function TransportModel() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Transport Model</Title>
        <Text c="dimmed" mt={4}>
          How the SDK communicates with the extension
        </Text>
      </div>

      <Title order={3}>What is a transport?</Title>
      <Text>
        A transport is the communication layer between the SDK and the BYOM
        extension. The <code>BYOMTransport</code> interface is intentionally
        minimal: <code>request()</code> for single request-response operations
        (like listing providers), and <code>stream()</code> for streaming
        operations (like chat). That's the entire surface area.
      </Text>
      <CodeBlock title="BYOMTransport interface" code={transportInterface} />

      <Title order={3}>Injected transport</Title>
      <Text>
        The extension's content script injects a <code>BYOMTransport</code>{" "}
        implementation at <code>window.byom</code> before your app code
        executes. The React SDK's <code>BYOMProvider</code> detects this
        automatically and exposes a <code>transportAvailable</code> flag. The
        Web SDK accepts it as a constructor argument.
      </Text>
      <CodeBlock title="Transport detection" code={injectedTransport} />

      <Title order={3}>Why injected-only?</Title>
      <Text>
        You might wonder why the SDK doesn't let you construct your own
        transport — say, a WebSocket to your own backend. The reason is
        security. The entire BYOM trust model depends on the extension
        controlling the communication channel. If arbitrary transports were
        allowed, any code in the page could bypass the extension's consent
        flow, credential management, and rate limiting. The injected transport
        is the extension's guarantee that it mediates every interaction.
      </Text>

      <Callout type="warning" title="No arbitrary transports">
        Constructing a custom <code>BYOMTransport</code> in production code
        bypasses the extension trust boundary. The SDK accepts{" "}
        <code>window.byom</code> — nothing else. For testing, use the mock
        transport from <code>@byom-ai/react/testing</code>.
      </Callout>

      <Title order={3}>The envelope protocol</Title>
      <Text>
        Every message — request or response — is wrapped in a{" "}
        <code>CanonicalEnvelope</code>. The SDK constructs these automatically;
        you never build one by hand. The envelope carries metadata that enables
        security validation, request correlation, and protocol versioning.
      </Text>
      <CodeBlock title="Envelope structure" code={envelopeFormat} />

      <Title order={3}>Envelope validation</Title>
      <Text>
        The extension validates every incoming envelope before processing it.
        This is where BYOM's replay resistance, expiry enforcement, and
        correlation checking happen. A stale envelope is rejected. A replayed
        nonce is rejected. A response that doesn't match the original request's
        correlation ID is rejected.
      </Text>
      <CodeBlock title="Validation pipeline" code={envelopeValidation} />

      <Title order={3}>Testing with mock transport</Title>
      <Text>
        In tests, you don't have a browser extension. The React SDK ships a{" "}
        <code>createMockTransport</code> utility that implements{" "}
        <code>BYOMTransport</code> with configurable providers and responses.
        It lets you test your components against the full SDK without needing
        the extension installed.
      </Text>
      <CodeBlock title="Mock transport for tests" code={mockTransport} />

      <Callout type="tip" title="Related">
        See{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("concepts/how-byom-works")}
        >
          How BYOM Works
        </Text>{" "}
        for the full architecture overview, or{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("guides/security")}
        >
          Security Model
        </Text>{" "}
        for how envelope security protects against attacks.
      </Callout>
    </Stack>
  );
}
