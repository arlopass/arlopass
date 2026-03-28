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
// 2. Extension sends it to the native bridge for vault storage
// 3. Bridge encrypts the key (AES-256-GCM) and writes it to the vault file
// 4. When a request arrives, the bridge reads from the vault and attaches credentials
// 5. SDK sends requests through the transport — never sees keys
//
// This means:
// - Your app code never contains API keys
// - Keys can't leak through your app's JavaScript bundle
// - Keys can't be extracted via browser DevTools on your page
// - A compromised dependency in your app can't steal credentials
// - Keys aren't even in browser storage — they live in an encrypted vault file
//
// Even the Web SDK follows this pattern:
import { ArlopassClient } from "@arlopass/web-sdk";

const client = new ArlopassClient({ transport: window.arlopass });
await client.connect({ appId: "my-app" });

// No API key needed here — the transport handles auth internally
const convo = new ConversationManager({ client });
for await (const event of convo.stream("Hello!")) {
  // Credentials were attached by the bridge vault, not your code
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
// Vault Storage Architecture
// ---------------------------------------------------------------------------

const vaultStorage = `// Credentials are encrypted at rest in a vault file on the native bridge.
// The extension acts as a thin client — all secrets live on the bridge.
//
// Encryption:
//   Algorithm:   AES-256-GCM (authenticated encryption)
//   Key derivation: PBKDF2 with 210,000 iterations (SHA-256)
//
// Two key modes:
//
// 1. Master Password (PBKDF2)
//    User picks a password → PBKDF2 derives a 256-bit key → encrypts vault
//    The password never leaves the machine.
//
// 2. OS Keychain (platform-native)
//    A random 32-byte key is generated and stored in:
//    - Windows: Credential Manager
//    - macOS:   Keychain
//    - Linux:   libsecret (GNOME Keyring / KDE Wallet)
//    The OS protects the key — unlocking the vault is automatic on login.
//
// Cross-browser:
//   The vault is a single file on disk managed by the native bridge.
//   Set it up once — Chrome, Edge, and Firefox all use the same vault.
//   No per-browser credential duplication.`;

const vaultLifecycle = `// Vault lifecycle — what happens at each stage:
//
// ┌─────────────────────────────────────────────────────────┐
// │ FIRST RUN                                               │
// │ Extension detects no vault → shows vault setup screen   │
// │ User chooses: master password or OS keychain             │
// │ Bridge creates an empty encrypted vault file             │
// └──────────────────────┬──────────────────────────────────┘
//                        ▼
// ┌─────────────────────────────────────────────────────────┐
// │ BROWSER OPEN                                            │
// │ Extension sends vault status check to bridge             │
// │ If locked → unlock screen (password prompt)              │
// │ If keychain mode → auto-unlock (OS handles auth)         │
// └──────────────────────┬──────────────────────────────────┘
//                        ▼
// ┌─────────────────────────────────────────────────────────┐
// │ DURING USE                                              │
// │ All provider/credential operations go through vault      │
// │ Single persistent native messaging connection to bridge  │
// │ Extension reads from vault on demand — never caches keys │
// └──────────────────────┬──────────────────────────────────┘
//                        ▼
// ┌─────────────────────────────────────────────────────────┐
// │ AUTO-LOCK (30 min inactivity)                           │
// │ Bridge locks the vault → clears derived key from memory  │
// │ Next operation triggers re-authentication                │
// └──────────────────────┬──────────────────────────────────┘
//                        ▼
// ┌─────────────────────────────────────────────────────────┐
// │ WEB APP TRIGGER                                         │
// │ SDK makes request → vault is locked → extension notified │
// │ Extension popup opens → user unlocks → SDK retries       │
// │ Retry is automatic — the web app doesn't need to handle  │
// │ vault state. Just stream as usual.                       │
// └─────────────────────────────────────────────────────────┘`;

const zeroKnowledge = `// Zero-knowledge design — who sees what:
//
// Web apps:
//   ❌ Never see API keys
//   ❌ Never see vault contents
//   ✅ Send requests through the transport
//   ✅ Receive AI responses
//   The bridge attaches credentials server-side — the web app
//   only sees the conversation, never the auth material.
//
// Extension popup:
//   ❌ Never holds keys in memory long-term
//   ✅ Reads provider list from vault on demand
//   ✅ Writes new credentials to vault (then forgets them)
//   The popup is a thin UI layer — it doesn't cache secrets.
//
// Vault file on disk:
//   ✅ Encrypted at rest (AES-256-GCM)
//   ✅ Authenticated (GCM auth tag prevents tampering)
//   Even if someone copies the vault file, they need the
//   master password or OS keychain access to decrypt it.
//
// Native bridge process:
//   ✅ Holds the derived key in memory while vault is unlocked
//   ✅ Clears the key on lock or exit
//   ✅ Single process — no key duplication across browsers`;

const keyHierarchy = `// Key hierarchy — how vault encryption works:
//
// Password mode:
//   Master Password
//     → PBKDF2 (210,000 iterations, SHA-256, random salt)
//     → 256-bit AES-GCM key
//     → Encrypts vault JSON payload
//
// Keychain mode:
//   OS Keychain
//     → Stores a random 32-byte key (generated once)
//     → 256-bit AES-GCM key
//     → Encrypts vault JSON payload
//
// Vault file format:
//   ┌──────────────────────────────────────────────┐
//   │ Bytes 0–3:    Magic number (0x41524C4F)      │
//   │ Bytes 4–5:    Version (uint16)                │
//   │ Byte  6:      Key mode (0=password, 1=keychain)│
//   │ Bytes 7–22:   Salt (16 bytes, PBKDF2)         │
//   │ Bytes 23–34:  IV (12 bytes, AES-GCM)          │
//   │ Bytes 35–98:  Reserved / alignment (64-byte hdr)│
//   │ Bytes 64+:    Encrypted JSON + 16-byte auth tag│
//   └──────────────────────────────────────────────┘
//
// Properties:
// - Salt is unique per vault → same password yields different keys
// - IV is unique per write → same data yields different ciphertext
// - Auth tag → any file tampering is detected on decrypt`;

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
        extension, which sends them to the native bridge for encrypted vault
        storage. The bridge attaches credentials to requests internally — your
        app code never sees them. Keys don't live in browser storage at all —
        they're in an encrypted vault file on disk.
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

      <Title order={3}>Vault-based credential storage</Title>
      <Text>
        Credentials are encrypted at rest in a vault file managed by the native
        bridge — not in browser storage. The vault uses AES-256-GCM encryption
        with PBKDF2 key derivation (210,000 iterations). Users choose between a
        master password or OS keychain (Windows Credential Manager, macOS
        Keychain, Linux libsecret). The vault is cross-browser: set it up once,
        and Chrome, Edge, and Firefox all share the same credentials.
      </Text>
      <CodeBlock title="Vault encryption" code={vaultStorage} />

      <Title order={3}>Vault lifecycle</Title>
      <Text>
        The vault follows a predictable lifecycle from first run to auto-lock.
        On first launch, the extension walks you through vault setup. On
        subsequent opens, it checks vault status and auto-unlocks if using OS
        keychain. After 30 minutes of inactivity the vault locks automatically.
        If a web app triggers an AI request while the vault is locked, the
        extension popup opens for re-authentication and the SDK retries
        automatically.
      </Text>
      <CodeBlock title="Vault lifecycle" code={vaultLifecycle} />

      <Title order={3}>Zero-knowledge design</Title>
      <Text>
        Web apps never see API keys — the bridge attaches them server-side. The
        extension popup never holds keys in memory — it reads from the vault on
        demand. The vault file is encrypted at rest — even if someone copies it,
        they need the master password or OS keychain access to decrypt it.
      </Text>
      <CodeBlock title="Zero-knowledge boundaries" code={zeroKnowledge} />

      <Title order={3}>Key hierarchy</Title>
      <Text>
        In password mode, the master password is run through PBKDF2 (210K
        iterations, SHA-256) with a random salt to derive an AES-256-GCM key. In
        keychain mode, a random 32-byte key is stored in the OS keychain and
        used directly. The vault file has a 64-byte header containing the magic
        number, version, key mode, salt, and IV, followed by the encrypted JSON
        payload and a GCM authentication tag.
      </Text>
      <CodeBlock
        title="Key derivation &amp; vault format"
        code={keyHierarchy}
      />

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
        never sees keys), vault-based storage (AES-256-GCM encrypted at rest on
        the native bridge), zero-knowledge design (web apps and the extension
        popup never hold secrets), envelope security (replay/expiry protection),
        and safe rendering defaults (no XSS vectors). Your app inherits all of
        this by using the SDK hooks.
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
