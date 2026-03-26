import { Stack, Title, Text } from "@mantine/core";
import { CodeBlock, Callout, StepList, CodeComparison } from "../../components";
import { navigate } from "../../router";

const stepInstall = `npm install @byom-ai/react`;

const stepProvider = `import { BYOMProvider } from "@byom-ai/react";

function App() {
  return (
    <BYOMProvider appId="my-app">
      <YourApp />
    </BYOMProvider>
  );
}`;

const stepGate = `import { ChatReadyGate } from "@byom-ai/react";

function YourApp() {
  return (
    <ChatReadyGate
      connecting={<p>Connecting to extension...</p>}
      noProvider={<p>Please select a provider in the extension.</p>}
      error={(err) => <p>Error: {err.message}</p>}
    >
      <Chat />
    </ChatReadyGate>
  );
}`;

const stepHook = `import { useConversation } from "@byom-ai/react";

function Chat() {
  const { messages, stream, isStreaming } = useConversation();

  async function handleSend(text: string) {
    await stream({
      messages: [...messages, { role: "user", content: text }],
    });
  }

  return /* your UI */;
}`;

const stepUI = `import { useState } from "react";
import { useConversation } from "@byom-ai/react";

function Chat() {
  const { messages, stream, isStreaming } = useConversation();
  const [input, setInput] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const text = input;
    setInput("");
    await stream({
      messages: [...messages, { role: "user", content: text }],
    });
  }

  return (
    <div>
      <div>
        {messages.map((msg, i) => (
          <div key={i}>
            <strong>{msg.role}:</strong> {msg.content}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isStreaming}
        />
        <button type="submit" disabled={isStreaming}>
          Send
        </button>
      </form>
    </div>
  );
}`;

const fullExample = `import { useState } from "react";
import { BYOMProvider, ChatReadyGate, useConversation } from "@byom-ai/react";

function Chat() {
  const { messages, stream, isStreaming } = useConversation();
  const [input, setInput] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const text = input;
    setInput("");
    await stream({
      messages: [...messages, { role: "user", content: text }],
    });
  }

  return (
    <div>
      <div>
        {messages.map((msg, i) => (
          <div key={i}>
            <strong>{msg.role}:</strong> {msg.content}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isStreaming}
        />
        <button type="submit" disabled={isStreaming}>
          Send
        </button>
      </form>
    </div>
  );
}

export default function App() {
  return (
    <BYOMProvider appId="my-app">
      <ChatReadyGate
        connecting={<p>Connecting...</p>}
        noProvider={<p>Select a provider in the BYOM extension.</p>}
        error={(err) => <p>Error: {err.message}</p>}
      >
        <Chat />
      </ChatReadyGate>
    </BYOMProvider>
  );
}`;

const comparisonReact = `import { useConversation } from "@byom-ai/react";

function Chat() {
  const { messages, stream, isStreaming } = useConversation();

  async function send(text: string) {
    await stream({
      messages: [...messages, { role: "user", content: text }],
    });
  }
}`;

const comparisonWeb = `import { BYOMClient } from "@byom-ai/web-sdk";

const client = new BYOMClient({ transport: window.byom });
await client.connect({ appId: "my-app" });

const providers = await client.listProviders();
await client.selectProvider(providers[0].id);

const response = await client.chat.send({
  messages: [{ role: "user", content: "Hello!" }],
});`;

export default function QuickstartReact() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Quickstart: React SDK</Title>
        <Text c="dimmed" mt={4}>
          Build your first AI-powered React component in 5 minutes
        </Text>
      </div>

      <StepList
        steps={[
          {
            title: "Install the React SDK",
            content: (
              <CodeBlock title="Terminal" code={stepInstall} language="bash" />
            ),
          },
          {
            title: "Wrap your app in BYOMProvider",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  The provider connects to the browser extension and manages
                  the AI client lifecycle.
                </Text>
                <CodeBlock title="App.tsx" code={stepProvider} />
              </Stack>
            ),
          },
          {
            title: "Add ChatReadyGate",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  The gate handles loading, missing-provider, and error states
                  so your chat component only renders when everything is ready.
                </Text>
                <CodeBlock title="YourApp.tsx" code={stepGate} />
              </Stack>
            ),
          },
          {
            title: "Use the useConversation hook",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  The hook gives you the message list, a streaming send
                  function, and status flags. No manual state management
                  needed.
                </Text>
                <CodeBlock title="Chat.tsx" code={stepHook} />
              </Stack>
            ),
          },
          {
            title: "Build the UI",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  Wire up an input and a message list. The hook handles the
                  rest.
                </Text>
                <CodeBlock title="Chat.tsx" code={stepUI} />
              </Stack>
            ),
          },
        ]}
      />

      <Title order={3}>Complete example</Title>
      <Text>
        Here's a full working chat component you can drop into any React app:
      </Text>
      <CodeBlock title="App.tsx" code={fullExample} />

      <Title order={3}>React SDK vs Web SDK</Title>
      <Text>
        The React SDK wraps the same Web SDK calls in hooks and components.
        Here's the same "send a message" feature in both:
      </Text>
      <CodeComparison
        reactSdk={{ title: "Chat.tsx", code: comparisonReact }}
        webSdk={{ title: "main.ts", code: comparisonWeb }}
      />

      <Callout type="info" title="Next steps">
        Explore{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("tutorials/first-chat-app")}
        >
          building a full chat app
        </Text>
        ,{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("guides/guard-components")}
        >
          guard components
        </Text>
        , and{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("guides/tool-calling")}
        >
          tool calling
        </Text>
        .
      </Callout>
    </Stack>
  );
}
