import { Stack, Title, Text } from "@mantine/core";
import { Callout, CodeBlock } from "../../components";
import { navigate } from "../../router";

const transportOnly = `// The BYOM extension injects window.byom — a BYOMTransport instance.
// This is the ONLY way to communicate with AI providers.

// React SDK — automatic detection
import { BYOMProvider } from "@byom-ai/react";

function App() {
  return (
    // BYOMProvider detects window.byom automatically.
    // If it's not present, the app shows a "not installed" state.
    <BYOMProvider appId="my-app">
      <Chat />
    </BYOMProvider>
  );
}

// Web SDK — explicit transport reference
import { BYOMClient } from "@byom-ai/web-sdk";

// The transport comes from the extension — never from user code
const client = new BYOMClient({ transport: window.byom });`;

const originEnforcement = `// The extension verifies the origin of every message.
// It uses window.location.origin — not a configurable value.
//
// This means:
// 1. A malicious page on a different origin cannot access your session
// 2. A rogue iframe cannot impersonate your app
// 3. The origin check is performed by the extension, not the SDK
//
// You don't need to do anything — this is automatic.
// The SDK adds the origin to every request envelope:

// Inside the SDK (you never write this):
const envelope = {
  origin: window.location.origin, // e.g. "https://myapp.com"
  // ... other fields
};`;

const contextIsolation = `// Hooks are the ONLY access path to the BYOM client.
// There is no global state, no static methods, no direct client access.

import { useConversation, useConnection } from "@byom-ai/react";

function Chat() {
  // Each hook call creates an isolated context.
  // Components can only interact with BYOM through these hooks.
  const { messages, stream } = useConversation({
    systemPrompt: "You are a helpful assistant.",
  });
  const { isConnected } = useConnection();

  // There's no way to:
  // - Access the raw transport
  // - Bypass the state machine
  // - Read another component's conversation
  // - Call the client directly
}`;

const credentialIsolation = `// The SDK NEVER handles API keys, tokens, or credentials.
//
// Credential flow:
// 1. User enters API key in the BYOM browser extension popup
// 2. Extension stores it in secure browser storage (encrypted)
// 3. Extension attaches credentials to requests internally
// 4. SDK sends requests through the transport — never sees keys
//
// This means:
// - Your app code never contains API keys
// - Keys can't leak through your app's JavaScript bundle
// - Keys can't be extracted via browser DevTools on your page
// - A compromised dependency in your app can't steal credentials
//
// Even the Web SDK follows this pattern:
import { BYOMClient } from "@byom-ai/web-sdk";

const client = new BYOMClient({ transport: window.byom });
await client.connect({ appId: "my-app" });

// No API key needed here — the transport handles auth internally
const convo = new ConversationManager({ client });
for await (const event of convo.stream("Hello!")) {
  // Credentials were attached by the extension, not your code
}`;

const envelopeSecurity = `// Every message between the SDK and extension uses a secure envelope.
//
// Envelope fields:
// {
//   protocolVersion: "1.0.0",     // Protocol version check
//   requestId:      "uuid",       // Unique per request
//   correlationId:  "uuid",       // Links request/response pairs
//   origin:         "https://...",// Verified origin
//   sessionId:      "uuid",       // Scoped to this session
//   capability:     "chat.stream",// What operation is requested
//   issuedAt:       "ISO-8601",   // Timestamp
//   expiresAt:      "ISO-8601",   // TTL — expired envelopes are rejected
//   nonce:          "random",     // Prevents replay attacks
//   payload:        { ... },      // The actual request data
// }
//
// Security properties:
// - Timestamps + TTL: stale requests are rejected
// - Nonces: replayed requests are detected and rejected
// - Correlation IDs: response spoofing is detected
// - Protocol version: incompatible versions are rejected early`;

const safeDefaults = `// The SDK ships with safe defaults that you don't need to configure:

import { BYOMProvider } from "@byom-ai/react";

// autoConnect: true — connects as soon as the provider mounts
// Timeouts — all operations have built-in timeouts
// Error boundary — wrap with BYOMErrorBoundary for crash protection
// State machine — invalid state transitions throw immediately

// No dangerouslySetInnerHTML anywhere in the SDK.
// All user content is rendered as text nodes, never as HTML.
// AI responses are treated as plain text by default.

function App() {
  return (
    <BYOMProvider appId="my-app" autoConnect>
      {/* autoConnect is actually the default — shown for clarity */}
      <Chat />
    </BYOMProvider>
  );
}`;

export default function SecurityModel() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Security Model</Title>
        <Text c="dimmed" mt={4}>
          You want to understand how BYOM protects credentials and ensures safe
          AI access.
        </Text>
      </div>

      <Title order={3}>Injected transport only</Title>
      <Text>
        The BYOM browser extension injects a <code>BYOMTransport</code> object
        at <code>window.byom</code>. This is the only communication channel
        between your app and AI providers. There is no way to construct an
        arbitrary transport in production — the SDK only accepts what the
        extension provides.
      </Text>
      <CodeBlock title="Transport detection" code={transportOnly} />

      <Title order={3}>Origin enforcement</Title>
      <Text>
        Every request envelope includes <code>window.location.origin</code>.
        The extension verifies this server-side — it's not configurable by app
        code. A page on a different origin cannot access your session, and an
        iframe cannot impersonate your app.
      </Text>
      <CodeBlock title="Origin verification" code={originEnforcement} />

      <Title order={3}>Context isolation</Title>
      <Text>
        In the React SDK, hooks are the only access path to the BYOM client.
        There's no global state, no static methods, and no way to bypass the
        state machine. Each component gets an isolated view of the conversation.
      </Text>
      <CodeBlock title="Hook isolation" code={contextIsolation} />

      <Title order={3}>Credential isolation</Title>
      <Text>
        The SDK never handles API keys. Users enter credentials in the browser
        extension, which stores them in encrypted browser storage. The extension
        attaches credentials to requests internally — your app code never sees
        them. This means keys can't leak through your JavaScript bundle or be
        extracted by a compromised dependency.
      </Text>
      <CodeBlock title="No credentials in app code" code={credentialIsolation} />

      <Title order={3}>Envelope security</Title>
      <Text>
        Every message uses a structured envelope with timestamps, nonces, TTL,
        and correlation IDs. Expired envelopes are rejected. Replayed envelopes
        are detected. Response spoofing is caught by correlation ID matching.
      </Text>
      <CodeBlock title="Envelope format" code={envelopeSecurity} />

      <Title order={3}>Safe defaults</Title>
      <Text>
        The SDK ships with safe defaults: auto-connect, built-in timeouts,
        state machine enforcement, and no <code>dangerouslySetInnerHTML</code>{" "}
        anywhere. AI responses are rendered as plain text nodes — never as raw
        HTML.
      </Text>
      <CodeBlock title="Safe defaults" code={safeDefaults} />

      <Callout type="info" title="Summary">
        BYOM's security is layered: injected transport (no arbitrary
        connections), origin enforcement (no cross-origin access), credential
        isolation (SDK never sees keys), envelope security (replay/expiry
        protection), and safe rendering defaults (no XSS vectors). Your app
        inherits all of this by using the SDK hooks.
      </Callout>

      <Callout type="tip" title="Related">
        See{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("concepts/transport-model")}
        >
          Transport Model
        </Text>{" "}
        for how the extension-to-SDK bridge works, or{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("guides/error-handling")}
        >
          Error Handling
        </Text>{" "}
        for handling security-related errors like auth failures.
      </Callout>
    </Stack>
  );
}
