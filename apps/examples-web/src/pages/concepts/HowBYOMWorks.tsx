import { Stack, Title, Text, List } from "@mantine/core";
import { Callout, CodeBlock } from "../../components";
import { navigate } from "../../router";

const sdkUsage = `// React SDK — the extension is detected automatically
import { BYOMProvider } from "@byom-ai/react";

function App() {
  return (
    <BYOMProvider appId="my-app">
      <Chat />
    </BYOMProvider>
  );
}

// Web SDK — you pass the injected transport explicitly
import { BYOMClient } from "@byom-ai/web-sdk";

const client = new BYOMClient({ transport: window.byom });
await client.connect({ appId: "my-app" });`;

const dataFlow = `// 1. Connect — establish a session with the extension
await client.connect({ appId: "my-app" });
// state: disconnected → connecting → connected

// 2. List providers — discover what's available
const providers = await client.listProviders();
// [{ providerId: "ollama", models: [...] }, { providerId: "claude", ... }]

// 3. Select a provider
await client.selectProvider({ providerId: "ollama", modelId: "llama3" });

// 4. Chat — send messages, stream responses
for await (const event of convo.stream("Explain monads")) {
  // token-by-token streaming
}

// 5. Disconnect — clean up
await client.disconnect();
// state: connected → disconnected`;

const sessionLifecycle = `// Sessions are scoped and ephemeral.
// connect() creates a new session with a unique sessionId.
// All operations are tied to that sessionId.
// disconnect() ends the session — the extension cleans up.

// The state machine enforces this:
//   disconnected → connecting → connected → disconnected
//                                ↓
//                            degraded → reconnecting → connected
//                                ↓
//                              failed → reconnecting | disconnected`;

export default function HowBYOMWorks() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>How BYOM Works</Title>
        <Text c="dimmed" mt={4}>
          Understanding the architecture — extension, SDK, bridge, and adapters
        </Text>
      </div>

      <Title order={3}>The problem</Title>
      <Text>
        Web applications increasingly want AI capabilities — chat, summarization,
        code generation. But connecting directly to AI providers from frontend
        code means embedding API keys in JavaScript bundles, managing credentials
        in localStorage, and trusting every dependency in your supply chain with
        those secrets. That's not viable.
      </Text>

      <Title order={3}>The wallet analogy</Title>
      <Text>
        BYOM works like MetaMask does for Ethereum. MetaMask sits between your
        web app and the blockchain — it holds your private keys, mediates every
        transaction, and asks for consent. Your app never touches the keys
        directly.
      </Text>
      <Text>
        BYOM does the same for AI. The browser extension holds API credentials,
        mediates every request, and the web application never sees a single key.
        Your app talks to the SDK. The SDK talks to the extension. The extension
        talks to providers.
      </Text>

      <Callout type="info" title="Key insight">
        The extension is the trust boundary. Everything on the web app side is
        untrusted. Everything on the extension side is controlled by the user.
      </Callout>

      <Title order={3}>Architecture layers</Title>
      <Text>
        The system has five layers, each with a clear responsibility:
      </Text>
      <List type="ordered" spacing="sm">
        <List.Item>
          <Text fw={600} span>Web App</Text> — your application, using the React
          SDK (<code>@byom-ai/react</code>) or Web SDK (<code>@byom-ai/web-sdk</code>).
          It calls hooks or client methods. It never manages credentials.
        </List.Item>
        <List.Item>
          <Text fw={600} span>SDK → Extension</Text> — the SDK communicates via{" "}
          <code>window.byom</code>, a <code>BYOMTransport</code> object injected
          by the extension's content script. Every message is wrapped in a
          canonical envelope with timestamps, nonces, and correlation IDs.
        </List.Item>
        <List.Item>
          <Text fw={600} span>Extension</Text> — mediates consent, manages
          sessions, validates origins, attaches credentials, and enforces rate
          limits. This is where the user's API keys live.
        </List.Item>
        <List.Item>
          <Text fw={600} span>Bridge</Text> — the extension routes requests to
          the appropriate provider adapter. The bridge handles protocol
          translation and connection management.
        </List.Item>
        <List.Item>
          <Text fw={600} span>Providers</Text> — Ollama, Claude, OpenAI, Gemini,
          Amazon Bedrock, Azure, Perplexity, and more. Each has an adapter that
          normalizes its API into the BYOM protocol.
        </List.Item>
      </List>
      <CodeBlock title="SDK usage at each layer" code={sdkUsage} />

      <Title order={3}>Data flow</Title>
      <Text>
        A typical BYOM session follows a connect → discover → select → chat →
        disconnect flow. The state machine enforces this order — you can't chat
        before connecting, and you can't connect twice.
      </Text>
      <CodeBlock title="Typical session flow" code={dataFlow} />

      <Title order={3}>The security boundary</Title>
      <Text>
        Credentials never touch the web application. The SDK sends a request
        envelope through <code>window.byom</code>. The extension validates the
        envelope, attaches credentials from its secure storage, and forwards the
        request. The response comes back through the same channel — stripped of
        any credential material. Even if your web app is compromised, the
        attacker gets access to nothing beyond what the user has already
        consented to in the current session.
      </Text>

      <Title order={3}>Session lifecycle</Title>
      <Text>
        Calling <code>connect()</code> creates a session with a unique{" "}
        <code>sessionId</code>. All subsequent operations — listing providers,
        selecting a model, sending messages — are scoped to that session.
        Calling <code>disconnect()</code> ends it. The extension cleans up
        resources, and the state machine returns to <code>disconnected</code>.
      </Text>
      <Text>
        If the connection degrades (e.g., the bridge goes down), the state
        machine transitions through <code>degraded</code> and{" "}
        <code>reconnecting</code> states automatically. If recovery fails, it
        lands in <code>failed</code>, which can either attempt reconnection or
        disconnect cleanly.
      </Text>
      <CodeBlock title="Session and state machine" code={sessionLifecycle} />

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
        for how the SDK-to-extension communication works, or{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("guides/security")}
        >
          Security Model
        </Text>{" "}
        for a deep dive into credential isolation and envelope security.
      </Callout>
    </Stack>
  );
}
