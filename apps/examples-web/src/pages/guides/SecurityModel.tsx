import { Stack, Title, Text, Divider } from "@mantine/core";
import { Callout, CodeBlock } from "../../components";
import { navigate } from "../../router";

const transportOnly = `// The Arlopass extension injects window.arlopass — a ArlopassTransport instance.
// This is the ONLY way to communicate with AI providers.

// React SDK — automatic detection
import { ArlopassProvider } from "@arlopass/react";

function App() {
  return (
    // ArlopassProvider detects window.arlopass automatically.
    // If it's not present, the app shows a "not installed" state.
    <ArlopassProvider appId="my-app">
      <Chat />
    </ArlopassProvider>
  );
}

// Web SDK — explicit transport reference
import { ArlopassClient } from "@arlopass/web-sdk";

// The transport comes from the extension — never from user code
const client = new ArlopassClient({ transport: window.arlopass });`;

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

const contextIsolation = `// Hooks are the ONLY access path to the Arlopass client.
// There is no global state, no static methods, no direct client access.

import { useConversation, useConnection } from "@arlopass/react";

function Chat() {
  // Each hook call creates an isolated context.
  // Components can only interact with Arlopass through these hooks.
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
// 1. User enters API key in the Arlopass browser extension popup
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
import { ArlopassClient } from "@arlopass/web-sdk";

const client = new ArlopassClient({ transport: window.arlopass });
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

// ---------------------------------------------------------------------------
// AppId Security
// ---------------------------------------------------------------------------

const appIdAutoDerivation = `// The SDK auto-derives an appId from the page origin using reverse-domain notation.
// You don't need to provide one explicitly — it's generated for you.

// Examples:
// https://myapp.com        → "com.myapp"
// https://chat.example.org → "org.example.chat"
// http://localhost:5173    → "localhost"           (dev origin — no prefix required)

// React SDK — auto-derived, no appId needed:
<ArlopassProvider appSuffix="chat">   {/* → "com.myapp.chat" on myapp.com */}
  <App />
</ArlopassProvider>

// Web SDK — auto-derived:
const client = new ArlopassClient({ transport: window.arlopass });
await client.connect({ appSuffix: "chat" }); // → "com.myapp.chat"

// Explicit override (must match your domain):
await client.connect({ appId: "com.myapp.dashboard" });`;

const appIdValidation = `// The extension validates the appId against the page's actual origin.
// Production apps MUST use the correct reverse-domain prefix.
//
// ✅ On https://myapp.com:
//    appId: "com.myapp"           → valid
//    appId: "com.myapp.chat"      → valid (suffix ok)
//
// ❌ On https://myapp.com:
//    appId: "com.otherapp"        → REJECTED (wrong domain)
//    appId: "com.myappx"          → REJECTED (must be dot-separated)
//
// Dev origins (localhost, 127.0.0.1, [::1], *.local) skip this check.
// Any appId is accepted during local development.`;

const appMetadata = `// Pass app metadata during connect for richer extension UI.
// The extension shows this info in the connection approval popup.

// React SDK:
<ArlopassProvider
  appSuffix="chat"
  appName="My Chat App"
  appDescription="AI-powered customer support"
  appIcon="https://myapp.com/icon.png"
>
  <App />
</ArlopassProvider>

// Web SDK:
await client.connect({
  appSuffix: "chat",
  appName: "My Chat App",
  appDescription: "AI-powered customer support",
  appIcon: "https://myapp.com/icon.png",
});

// Icon URL rules:
// ✅ https://... — always accepted
// ✅ data:image/... — always accepted
// ✅ http://... — accepted on dev origins only (localhost, etc.)
// ❌ http://... on production — rejected (must be HTTPS)`;

const safeDefaults = `// The SDK ships with safe defaults that you don't need to configure:

import { ArlopassProvider } from "@arlopass/react";

// autoConnect: true — connects as soon as the provider mounts
// Timeouts — all operations have built-in timeouts
// Error boundary — wrap with ArlopassErrorBoundary for crash protection
// State machine — invalid state transitions throw immediately

// No dangerouslySetInnerHTML anywhere in the SDK.
// All user content is rendered as text nodes, never as HTML.
// AI responses are treated as plain text by default.

function App() {
  return (
    <ArlopassProvider appId="my-app" autoConnect>
      {/* autoConnect is actually the default — shown for clarity */}
      <Chat />
    </ArlopassProvider>
  );
}`;

export default function SecurityModel() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Security Model</Title>
        <Text c="dimmed" mt={4}>
          You want to understand how Arlopass protects credentials and ensures
          safe AI access.
        </Text>
      </div>

      <Title order={3}>Injected transport only</Title>
      <Text>
        The Arlopass browser extension injects a <code>ArlopassTransport</code>{" "}
        object at <code>window.arlopass</code>. This is the only communication
        channel between your app and AI providers. There is no way to construct
        an arbitrary transport in production — the SDK only accepts what the
        extension provides.
      </Text>
      <CodeBlock title="Transport detection" code={transportOnly} />

      <Title order={3}>Origin enforcement</Title>
      <Text>
        Every request envelope includes <code>window.location.origin</code>. The
        extension verifies this server-side — it's not configurable by app code.
        A page on a different origin cannot access your session, and an iframe
        cannot impersonate your app.
      </Text>
      <CodeBlock title="Origin verification" code={originEnforcement} />

      <Title order={3}>Context isolation</Title>
      <Text>
        In the React SDK, hooks are the only access path to the Arlopass client.
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
      <CodeBlock
        title="No credentials in app code"
        code={credentialIsolation}
      />

      <Title order={3}>Envelope security</Title>
      <Text>
        Every message uses a structured envelope with timestamps, nonces, TTL,
        and correlation IDs. Expired envelopes are rejected. Replayed envelopes
        are detected. Response spoofing is caught by correlation ID matching.
      </Text>
      <CodeBlock title="Envelope format" code={envelopeSecurity} />

      <Divider my="xl" />

      <Title order={3}>App identity &amp; validation</Title>
      <Text>
        Every app that connects to the extension is identified by an{" "}
        <code>appId</code> — a reverse-domain string derived from the page
        origin (e.g. <code>com.myapp.chat</code>). The SDK generates this
        automatically, and the extension validates it against the actual origin
        to prevent spoofing.
      </Text>
      <CodeBlock title="Auto-derived appId" code={appIdAutoDerivation} />

      <Title order={4}>Origin validation</Title>
      <Text>
        On production domains, the extension checks that the appId starts with
        the correct reverse-domain prefix. A page on{" "}
        <code>https://myapp.com</code> can only claim an appId starting with{" "}
        <code>com.myapp</code>. Dev origins (localhost, 127.0.0.1, etc.) are
        exempt from this check for local development convenience.
      </Text>
      <CodeBlock title="Validation rules" code={appIdValidation} />

      <Title order={4}>App metadata</Title>
      <Text>
        You can pass optional metadata — name, description, and icon — that the
        extension displays in its connection approval popup. Icon URLs must use
        HTTPS or a <code>data:</code> URI on production; HTTP is only allowed on
        dev origins.
      </Text>
      <CodeBlock title="App metadata" code={appMetadata} />

      <Title order={3}>Safe defaults</Title>
      <Text>
        The SDK ships with safe defaults: auto-connect, built-in timeouts, state
        machine enforcement, and no <code>dangerouslySetInnerHTML</code>{" "}
        anywhere. AI responses are rendered as plain text nodes — never as raw
        HTML.
      </Text>
      <CodeBlock title="Safe defaults" code={safeDefaults} />

      <Callout type="info" title="Summary">
        Arlopass's security is layered: injected transport (no arbitrary
        connections), origin enforcement (no cross-origin access), app identity
        validation (reverse-domain appId matching), credential isolation (SDK
        never sees keys), envelope security (replay/expiry protection), and safe
        rendering defaults (no XSS vectors). Your app inherits all of this by
        using the SDK hooks.
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
