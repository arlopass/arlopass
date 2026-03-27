import { Stack, Title, Text } from "@mantine/core";
import { CodeBlock, Callout, CodeComparison } from "../../components";
import { navigate } from "../../router";

const connectionGateExample = `import { ArlopassProvider, ArlopassConnectionGate } from "@arlopass/react";

function App() {
  return (
    <ArlopassProvider appId="my-app">
      <ArlopassConnectionGate
        fallback={<p>Connecting to Arlopass extension...</p>}
        notInstalledFallback={
          <div>
            <h2>Extension Required</h2>
            <p>Install the Arlopass browser extension to use this app.</p>
            <a href="https://arlopass.ai/install">Install Extension</a>
          </div>
        }
        errorFallback={({ error, retry }) => (
          <div>
            <p>Connection failed: {error.message}</p>
            {retry && <button onClick={retry}>Retry</button>}
          </div>
        )}
      >
        <MainApp />
      </ArlopassConnectionGate>
    </ArlopassProvider>
  );
}`;

const providerGateExample = `import { ArlopassProviderGate } from "@arlopass/react";

function ConnectedApp() {
  return (
    <ArlopassProviderGate
      fallback={
        <div>
          <h2>Select a Provider</h2>
          <p>
            Open the Arlopass extension popup and choose an AI provider
            before using the chat.
          </p>
        </div>
      }
    >
      <Chat />
    </ArlopassProviderGate>
  );
}`;

const chatReadyGateExample = `import { ArlopassChatReadyGate } from "@arlopass/react";

// ArlopassChatReadyGate combines connection + provider checks in one gate
function App() {
  return (
    <ArlopassChatReadyGate
      connectingFallback={<p>Connecting...</p>}
      notInstalledFallback={
        <div>
          <p>Arlopass extension not detected.</p>
          <a href="https://arlopass.ai/install">Install</a>
        </div>
      }
      providerFallback={<p>Please select a provider.</p>}
      errorFallback={({ error, retry }) => (
        <div>
          <p>Error: {error.message}</p>
          {retry && <button onClick={retry}>Retry</button>}
        </div>
      )}
    >
      <Chat />
    </ArlopassChatReadyGate>
  );
}`;

const negativeGuardsExample = `import {
  ArlopassNotInstalled,
  ArlopassDisconnected,
  ArlopassConnected,
  ArlopassProviderNotReady,
  ArlopassHasError,
  ArlopassChatNotReady,
  ArlopassChatReady,
} from "@arlopass/react";

function AppHeader() {
  return (
    <header style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <h1>My App</h1>

      {/* Show install prompt when extension is missing */}
      <ArlopassNotInstalled>
        <a href="https://arlopass.ai/install">Install Arlopass</a>
      </ArlopassNotInstalled>

      {/* Show reconnect button when disconnected */}
      <ArlopassDisconnected>
        <span style={{ color: "orange" }}>Disconnected</span>
      </ArlopassDisconnected>

      {/* Show green dot when connected */}
      <ArlopassConnected>
        <span style={{ color: "green" }}>Connected</span>
      </ArlopassConnected>

      {/* Prompt to select provider when none is chosen */}
      <ArlopassProviderNotReady>
        <span>Select a provider →</span>
      </ArlopassProviderNotReady>

      {/* Show errors in the header */}
      <ArlopassHasError>
        {({ error, retry }) => (
          <span style={{ color: "red" }}>
            {error.message}
            {retry && <button onClick={retry}>Retry</button>}
          </span>
        )}
      </ArlopassHasError>
    </header>
  );
}`;

const nestingExample = `import {
  ArlopassProvider,
  ArlopassConnectionGate,
  ArlopassProviderGate,
  ArlopassHasError,
} from "@arlopass/react";

function App() {
  return (
    <ArlopassProvider appId="my-app">
      {/* Layer 1: Connection */}
      <ArlopassConnectionGate
        fallback={<LoadingSpinner />}
        notInstalledFallback={<InstallPrompt />}
        errorFallback={({ error, retry }) => (
          <ErrorPage error={error} retry={retry} />
        )}
      >
        {/* Layer 2: Provider selection */}
        <ArlopassProviderGate fallback={<ProviderPicker />}>
          {/* Now fully ready for chat */}
          <AppLayout>
            <Sidebar>
              <ArlopassHasError>
                {({ error, retry }) => (
                  <ErrorBanner error={error} retry={retry} />
                )}
              </ArlopassHasError>
            </Sidebar>
            <MainContent>
              <Chat />
            </MainContent>
          </AppLayout>
        </ArlopassProviderGate>
      </ArlopassConnectionGate>
    </ArlopassProvider>
  );
}`;

const hasErrorRenderFn = `import { ArlopassHasError } from "@arlopass/react";

function StatusBar() {
  return (
    <div>
      <ArlopassHasError>
        {({ error, retry }) => {
          // Render function receives error and optional retry
          if (error.retryable) {
            return (
              <div style={{ background: "#fff3cd", padding: 8 }}>
                <span>Temporary issue: {error.message}</span>
                {retry && (
                  <button onClick={retry} style={{ marginLeft: 8 }}>
                    Retry
                  </button>
                )}
              </div>
            );
          }

          return (
            <div style={{ background: "#f8d7da", padding: 8 }}>
              <span>Fatal error: {error.message}</span>
              <span> (code: {error.machineCode})</span>
            </div>
          );
        }}
      </ArlopassHasError>
    </div>
  );
}`;

const comparisonReact = `import {
  ArlopassProvider,
  ArlopassChatReadyGate,
  ArlopassHasError,
  useConversation,
} from "@arlopass/react";

function App() {
  return (
    <ArlopassProvider appId="my-app">
      <ArlopassChatReadyGate
        connectingFallback={<p>Connecting...</p>}
        providerFallback={<p>Select a provider.</p>}
        errorFallback={({ error }) => <p>Error: {error.message}</p>}
      >
        <Chat />
      </ArlopassChatReadyGate>
    </ArlopassProvider>
  );
}`;

const comparisonWeb = `import { ArlopassClient } from "@arlopass/web-sdk";

const client = new ArlopassClient({ transport: window.arlopass });

if (!window.arlopass) {
  showInstallPrompt();
} else {
  try {
    await client.connect({ appId: "my-app" });
  } catch (err) {
    showError(err);
  }

  if (!client.selectedProvider) {
    showProviderPicker();
  } else {
    startChat(client);
  }
}`;

const fullExample = `import {
  ArlopassProvider,
  ArlopassConnectionGate,
  ArlopassProviderGate,
  ArlopassHasError,
  ArlopassConnected,
  ArlopassDisconnected,
  ArlopassNotInstalled,
  useConversation,
} from "@arlopass/react";
import { useState } from "react";

function Header() {
  return (
    <header style={{ display: "flex", gap: 12, padding: 16, borderBottom: "1px solid #eee" }}>
      <h2 style={{ margin: 0 }}>Chat App</h2>
      <ArlopassNotInstalled>
        <span style={{ color: "red" }}>Extension not installed</span>
      </ArlopassNotInstalled>
      <ArlopassDisconnected>
        <span style={{ color: "orange" }}>Disconnected</span>
      </ArlopassDisconnected>
      <ArlopassConnected>
        <span style={{ color: "green" }}>Connected</span>
      </ArlopassConnected>
      <ArlopassHasError>
        {({ error, retry }) => (
          <span style={{ color: "red" }}>
            {error.message}
            {error.retryable && retry && (
              <button onClick={retry} style={{ marginLeft: 4 }}>Retry</button>
            )}
          </span>
        )}
      </ArlopassHasError>
    </header>
  );
}

function Chat() {
  const { messages, stream, streamingContent, isStreaming, stop } =
    useConversation({ systemPrompt: "You are a helpful assistant." });
  const [input, setInput] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const text = input;
    setInput("");
    await stream(text);
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ minHeight: 200 }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ padding: "4px 0" }}>
            <strong>{msg.role === "user" ? "You" : "AI"}:</strong> {msg.content}
          </div>
        ))}
        {isStreaming && streamingContent && (
          <div style={{ opacity: 0.7 }}>
            <strong>AI:</strong> {streamingContent}
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isStreaming}
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit" disabled={isStreaming || !input.trim()}>Send</button>
        {isStreaming && <button type="button" onClick={stop}>Stop</button>}
      </form>
    </div>
  );
}

export default function App() {
  return (
    <ArlopassProvider appId="guard-demo">
      <Header />
      <ArlopassConnectionGate
        fallback={<p style={{ padding: 16 }}>Connecting...</p>}
        notInstalledFallback={
          <div style={{ padding: 16 }}>
            <h3>Arlopass Extension Required</h3>
            <p>Install the extension to use this app.</p>
          </div>
        }
        errorFallback={({ error, retry }) => (
          <div style={{ padding: 16 }}>
            <p>Connection failed: {error.message}</p>
            {retry && <button onClick={retry}>Retry</button>}
          </div>
        )}
      >
        <ArlopassProviderGate
          fallback={
            <div style={{ padding: 16 }}>
              <p>Open the Arlopass extension and select an AI provider.</p>
            </div>
          }
        >
          <Chat />
        </ArlopassProviderGate>
      </ArlopassConnectionGate>
    </ArlopassProvider>
  );
}`;

export default function GuardComponents() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Guard Components</Title>
        <Text c="dimmed" mt={4}>
          You want to conditionally render UI based on connection, provider, and
          error states.
        </Text>
      </div>

      <Title order={3}>Positive gates</Title>
      <Text>
        Gates render their children only when a condition is met. They accept
        fallback props for each negative state.
      </Text>

      <Text fw={600}>ArlopassConnectionGate</Text>
      <Text>
        Renders children when connected. Shows <code>fallback</code> while
        connecting, <code>notInstalledFallback</code> if the extension isn't
        detected, and <code>errorFallback</code> on failure.
      </Text>
      <CodeBlock title="ConnectionGate.tsx" code={connectionGateExample} />

      <Text fw={600}>ArlopassProviderGate</Text>
      <Text>
        Renders children when a provider is selected. Shows{" "}
        <code>fallback</code> if no provider is chosen yet.
      </Text>
      <CodeBlock title="ProviderGate.tsx" code={providerGateExample} />

      <Text fw={600}>ArlopassChatReadyGate</Text>
      <Text>
        Combines connection and provider checks in a single gate. This is the
        most common gate for chat UIs — it handles not-installed, connecting,
        no-provider, and error states.
      </Text>
      <CodeBlock title="ChatReadyGate.tsx" code={chatReadyGateExample} />

      <Title order={3}>Negative guards</Title>
      <Text>
        Negative guards render only when a specific negative condition is true.
        Use them in headers, sidebars, or any area outside your main content
        gates.
      </Text>
      <CodeBlock title="NegativeGuards.tsx" code={negativeGuardsExample} />

      <Title order={3}>Nesting gates</Title>
      <Text>
        Compose gates by nesting them. Each layer handles one concern. Put
        negative guards inside the layout for status indicators that always
        show.
      </Text>
      <CodeBlock title="NestedGates.tsx" code={nestingExample} />

      <Title order={3}>Render function on ArlopassHasError</Title>
      <Text>
        <code>ArlopassHasError</code> uses a render function as children. It
        receives the error object and an optional <code>retry</code> function.
        Use it to build different UIs for retryable vs fatal errors.
      </Text>
      <CodeBlock title="HasErrorRender.tsx" code={hasErrorRenderFn} />

      <Title order={3}>Guards vs manual state checking</Title>
      <Text>
        The React SDK guards replace manual if/else checking against connection
        and provider state:
      </Text>
      <CodeComparison
        reactSdk={{ title: "React SDK (guards)", code: comparisonReact }}
        webSdk={{ title: "Web SDK (manual)", code: comparisonWeb }}
      />

      <Title order={3}>Complete example</Title>
      <Text>
        A full app using connection gate, provider gate, negative guards in a
        header, and error handling:
      </Text>
      <CodeBlock title="App.tsx" code={fullExample} />

      <Callout type="tip" title="Related">
        See the{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("reference/react-sdk/guards")}
        >
          Guards API reference
        </Text>{" "}
        for complete props documentation, or the{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("guides/error-handling")}
        >
          Error Handling guide
        </Text>{" "}
        for error-specific patterns.
      </Callout>
    </Stack>
  );
}
