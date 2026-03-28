import { Stack, Title, Text } from "@mantine/core";
import { CodeBlock, Callout, StepList, CodeComparison } from "../../components";
import { navigate } from "../../router";

const stepUseProviders = `import { useProviders } from "@arlopass/react";

function ProviderPicker() {
  const {
    providers,         // list of available providers
    selectedProvider,  // { providerId, modelId } or null
    isLoading,
    error,
    selectProvider,    // call to switch provider + model
  } = useProviders();

  // We'll build the UI in the next steps
  return <div>Provider picker</div>;
}`;

const stepConnection = `import { useConnection } from "@arlopass/react";

function ProviderPicker() {
  const { isConnected, isConnecting } = useConnection();
  const { providers, selectedProvider, selectProvider } = useProviders();

  if (isConnecting) return <p>Connecting to extension...</p>;
  if (!isConnected) return <p>Not connected. Is the extension installed?</p>;

  return (
    <div>
      <p>Connected! {providers.length} providers available.</p>
      {/* Dropdowns go here */}
    </div>
  );
}`;

const stepProviderDropdown = `function ProviderPicker() {
  const { isConnected } = useConnection();
  const { providers, selectedProvider, selectProvider } = useProviders();

  if (!isConnected) return <p>Connecting...</p>;

  const currentProviderId = selectedProvider?.providerId ?? "";

  return (
    <div>
      <label htmlFor="provider-select">Provider</label>
      <select
        id="provider-select"
        value={currentProviderId}
        onChange={(e) => {
          const provider = providers.find((p) => p.id === e.target.value);
          if (provider && provider.models.length > 0) {
            selectProvider({
              providerId: provider.id,
              modelId: provider.models[0].id,
            });
          }
        }}
      >
        <option value="">Select a provider...</option>
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}`;

const stepModelDropdown = `// Add below the provider dropdown
const selectedProviderObj = providers.find(
  (p) => p.id === selectedProvider?.providerId,
);
const models = selectedProviderObj?.models ?? [];

<label htmlFor="model-select">Model</label>
<select
  id="model-select"
  value={selectedProvider?.modelId ?? ""}
  onChange={(e) => {
    if (selectedProvider) {
      selectProvider({
        providerId: selectedProvider.providerId,
        modelId: e.target.value,
      });
    }
  }}
  disabled={!selectedProvider}
>
  <option value="">Select a model...</option>
  {models.map((m) => (
    <option key={m.id} value={m.id}>
      {m.name}
    </option>
  ))}
</select>`;

const stepHandleSelection = `async function handleProviderChange(providerId: string) {
  const provider = providers.find((p) => p.id === providerId);
  if (!provider || provider.models.length === 0) return;

  // Select the first model from the new provider
  await selectProvider({
    providerId: provider.id,
    modelId: provider.models[0].id,
  });
}

async function handleModelChange(modelId: string) {
  if (!selectedProvider) return;
  await selectProvider({
    providerId: selectedProvider.providerId,
    modelId,
  });
}`;

const stepGate = `import { ChatReadyGate } from "@arlopass/react";

function App() {
  return (
    <ArlopassProvider appId="provider-demo">
      <ProviderPicker />
      <ChatReadyGate
        connecting={<p>Connecting...</p>}
        noProvider={<p>↑ Pick a provider above to start chatting.</p>}
        error={(err) => <p>Error: {err.message}</p>}
      >
        <Chat />
      </ChatReadyGate>
    </ArlopassProvider>
  );
}`;

const fullExample = `import { useState } from "react";
import {
  ArlopassProvider,
  ChatReadyGate,
  useConnection,
  useProviders,
  useConversation,
} from "@arlopass/react";

function ProviderPicker() {
  const { isConnected } = useConnection();
  const { providers, selectedProvider, selectProvider, isLoading } =
    useProviders();

  if (!isConnected) return <p>Connecting to extension...</p>;

  const selectedProviderObj = providers.find(
    (p) => p.id === selectedProvider?.providerId,
  );
  const models = selectedProviderObj?.models ?? [];

  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
      <select
        value={selectedProvider?.providerId ?? ""}
        onChange={(e) => {
          const provider = providers.find((p) => p.id === e.target.value);
          if (provider && provider.models.length > 0) {
            selectProvider({
              providerId: provider.id,
              modelId: provider.models[0].id,
            });
          }
        }}
        disabled={isLoading}
      >
        <option value="">Select provider...</option>
        {providers.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      <select
        value={selectedProvider?.modelId ?? ""}
        onChange={(e) => {
          if (selectedProvider) {
            selectProvider({
              providerId: selectedProvider.providerId,
              modelId: e.target.value,
            });
          }
        }}
        disabled={!selectedProvider || isLoading}
      >
        <option value="">Select model...</option>
        {models.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    </div>
  );
}

function Chat() {
  const { messages, stream, streamingContent, isStreaming } =
    useConversation();
  const [input, setInput] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const text = input;
    setInput("");
    await stream(text);
  }

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id} style={{ padding: "4px 0" }}>
          <strong>{msg.role}:</strong> {msg.content}
        </div>
      ))}
      {isStreaming && streamingContent && (
        <div style={{ opacity: 0.7 }}>
          <strong>assistant:</strong> {streamingContent}
        </div>
      )}
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isStreaming}
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit" disabled={isStreaming || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

export default function App() {
  return (
    <ArlopassProvider appId="provider-demo">
      <ProviderPicker />
      <ChatReadyGate
        connecting={<p>Connecting...</p>}
        noProvider={<p>Pick a provider above to start chatting.</p>}
        error={(err) => <p>Error: {err.message}</p>}
      >
        <Chat />
      </ChatReadyGate>
    </ArlopassProvider>
  );
}`;

const comparisonReact = `import { useProviders } from "@arlopass/react";

const { providers, selectedProvider, selectProvider } = useProviders();

// Select a provider + model in one call
await selectProvider({
  providerId: "ollama",
  modelId: "llama3",
});`;

const comparisonWeb = `import { ArlopassClient } from "@arlopass/web-sdk";

const client = new ArlopassClient({ transport: window.arlopass });
await client.connect({ appId: "my-app" });

// List providers manually
const { providers } = await client.listProviders();

// Select provider + model
await client.selectProvider({
  providerId: providers[0].id,
  modelId: providers[0].models[0].id,
});`;

export default function ProviderSelection() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Provider Selection UI</Title>
        <Text c="dimmed" mt={4}>
          Let users choose their AI provider and model
        </Text>
      </div>

      <Title order={3}>What you'll build</Title>
      <Text>
        A pair of dropdown selectors that let the user pick from available AI
        providers and models. The chat component stays blocked until a provider
        is selected.
      </Text>

      <Callout type="info" title="Providers come from the vault">
        When you call <code>listProviders()</code>, the extension reads from the
        encrypted vault on the bridge. Adding and removing providers happens
        through the extension popup, which writes to the vault. The SDK never
        has direct access to credentials — it only sees provider names and
        available models.
      </Callout>

      <Callout type="info" title="Prerequisites">
        This tutorial builds on the{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("tutorials/first-chat-app")}
        >
          First Chat App
        </Text>{" "}
        tutorial. You should be familiar with ArlopassProvider and
        ChatReadyGate.
      </Callout>

      <StepList
        steps={[
          {
            title: "Use useProviders",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  The useProviders hook gives you the list of providers, the
                  currently selected provider/model, and a selectProvider
                  function. It automatically fetches providers once connected.
                </Text>
                <CodeBlock title="ProviderPicker.tsx" code={stepUseProviders} />
              </Stack>
            ),
          },
          {
            title: "Wait for connection",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  Use useConnection to check whether the extension is connected
                  before rendering the provider picker. The providers list is
                  empty until connected.
                </Text>
                <CodeBlock title="ProviderPicker.tsx" code={stepConnection} />
              </Stack>
            ),
          },
          {
            title: "Render provider dropdown",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  Map the providers array to select options. When the user picks
                  a provider, auto-select its first model.
                </Text>
                <CodeBlock
                  title="ProviderPicker.tsx"
                  code={stepProviderDropdown}
                />
              </Stack>
            ),
          },
          {
            title: "Render model dropdown",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  Find the selected provider object and list its models. The
                  model dropdown is disabled until a provider is selected.
                </Text>
                <CodeBlock
                  title="ProviderPicker.tsx"
                  code={stepModelDropdown}
                />
              </Stack>
            ),
          },
          {
            title: "Handle selection",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  The selectProvider function takes a providerId and modelId.
                  When switching providers, auto-select the first model.
                </Text>
                <CodeBlock
                  title="ProviderPicker.tsx"
                  code={stepHandleSelection}
                />
              </Stack>
            ),
          },
          {
            title: "Show ChatReadyGate",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  Place ChatReadyGate below the picker. Its noProvider fallback
                  tells the user to pick a provider. The chat only renders once
                  a provider is active.
                </Text>
                <CodeBlock title="App.tsx" code={stepGate} />
              </Stack>
            ),
          },
        ]}
      />

      <Title order={3}>Complete example</Title>
      <Text>
        A full app with provider/model dropdowns and a chat component:
      </Text>
      <CodeBlock title="App.tsx" code={fullExample} />

      <Title order={3}>React SDK vs Web SDK</Title>
      <Text>
        The React SDK auto-fetches providers on connection and tracks selection
        state. Here's the comparison:
      </Text>
      <CodeComparison
        reactSdk={{ title: "ProviderPicker.tsx", code: comparisonReact }}
        webSdk={{ title: "main.ts", code: comparisonWeb }}
      />

      <Callout type="tip" title="What's next">
        Now that users can pick a provider, learn how to{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("tutorials/adding-tool-calling")}
        >
          add tool calling
        </Text>{" "}
        or explore the{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("guides/guard-components")}
        >
          guard components guide
        </Text>
        .
      </Callout>
    </Stack>
  );
}
