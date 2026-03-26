import { Stack, Title, Text } from "@mantine/core";
import { CodeBlock, Callout, StepList, CodeComparison } from "../../components";
import { navigate } from "../../router";

const stepProvider = `import { BYOMProvider } from "@byom-ai/react";

function App() {
  return (
    <BYOMProvider appId="my-chat-app" defaultProvider="ollama" defaultModel="llama3">
      <ChatApp />
    </BYOMProvider>
  );
}`;

const stepGate = `import { ChatReadyGate } from "@byom-ai/react";

function ChatApp() {
  return (
    <ChatReadyGate
      connecting={<p>Connecting to BYOM extension...</p>}
      noProvider={<p>Please select a provider in the extension.</p>}
      error={(err) => <p>Something went wrong: {err.message}</p>}
    >
      <Chat />
    </ChatReadyGate>
  );
}`;

const stepHook = `import { useConversation } from "@byom-ai/react";

function Chat() {
  const {
    messages,
    streamingContent,
    isStreaming,
    stream,
    stop,
  } = useConversation({
    systemPrompt: "You are a helpful assistant. Be concise.",
  });

  // We'll build the UI in the next steps
  return <div>Chat component</div>;
}`;

const stepMessages = `{messages.map((msg) => (
  <div key={msg.id} style={{ padding: "8px 0" }}>
    <strong>{msg.role === "user" ? "You" : "AI"}:</strong>{" "}
    {msg.content}
  </div>
))}`;

const stepStreaming = `{isStreaming && streamingContent && (
  <div style={{ padding: "8px 0", opacity: 0.7 }}>
    <strong>AI:</strong> {streamingContent}
  </div>
)}`;

const stepInput = `const [input, setInput] = useState("");

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!input.trim() || isStreaming) return;
  const text = input;
  setInput("");
  await stream(text);
}

// In your JSX:
<form onSubmit={handleSubmit}>
  <input
    value={input}
    onChange={(e) => setInput(e.target.value)}
    placeholder="Type a message..."
    disabled={isStreaming}
  />
  <button type="submit" disabled={isStreaming || !input.trim()}>
    Send
  </button>
</form>`;

const stepStop = `{isStreaming && (
  <button onClick={() => stop()}>
    Stop generating
  </button>
)}`;

const fullExample = `import { useState } from "react";
import {
  BYOMProvider,
  ChatReadyGate,
  useConversation,
} from "@byom-ai/react";

function Chat() {
  const {
    messages,
    streamingContent,
    isStreaming,
    stream,
    stop,
  } = useConversation({
    systemPrompt: "You are a helpful assistant. Be concise.",
  });
  const [input, setInput] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const text = input;
    setInput("");
    await stream(text);
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <div style={{ minHeight: 300, padding: 16 }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ padding: "8px 0" }}>
            <strong>{msg.role === "user" ? "You" : "AI"}:</strong>{" "}
            {msg.content}
          </div>
        ))}
        {isStreaming && streamingContent && (
          <div style={{ padding: "8px 0", opacity: 0.7 }}>
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
        <button type="submit" disabled={isStreaming || !input.trim()}>
          Send
        </button>
        {isStreaming && (
          <button type="button" onClick={() => stop()}>
            Stop
          </button>
        )}
      </form>
    </div>
  );
}

export default function App() {
  return (
    <BYOMProvider appId="my-chat-app">
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
  const { messages, stream, streamingContent, isStreaming, stop } =
    useConversation({ systemPrompt: "You are a helpful assistant." });

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>{msg.role}: {msg.content}</div>
      ))}
      {isStreaming && <div>AI: {streamingContent}</div>}
      <button onClick={() => stream("Hello!")}>Send</button>
      {isStreaming && <button onClick={stop}>Stop</button>}
    </div>
  );
}`;

const comparisonWeb = `import { BYOMClient, ConversationManager } from "@byom-ai/web-sdk";

const client = new BYOMClient({ transport: window.byom });
await client.connect({ appId: "my-chat-app" });

const convo = new ConversationManager({
  client,
  systemPrompt: "You are a helpful assistant.",
});

for await (const event of convo.stream("Hello!")) {
  if (event.type === "delta") {
    process.stdout.write(event.content);
  }
}`;

export default function FirstChatApp() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Build Your First Chat App</Title>
        <Text c="dimmed" mt={4}>
          Create a complete AI chat interface with React in 15 minutes
        </Text>
      </div>

      <Title order={3}>What you'll build</Title>
      <Text>
        A fully functional chat UI with message history, real-time streaming
        responses, a text input, and a stop button — all powered by any AI
        provider through the BYOM extension.
      </Text>

      <Callout type="info" title="Prerequisites">
        Make sure you've installed the React SDK and the BYOM browser extension.
        See the{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("getting-started/quickstart-react")}
        >
          React Quickstart
        </Text>{" "}
        if you haven't done that yet.
      </Callout>

      <StepList
        steps={[
          {
            title: "Set up the provider",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  Wrap your app in BYOMProvider. This connects to the browser
                  extension and manages the AI client lifecycle. You can
                  optionally set a default provider and model.
                </Text>
                <CodeBlock title="App.tsx" code={stepProvider} />
              </Stack>
            ),
          },
          {
            title: "Add the chat ready gate",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  ChatReadyGate renders fallback UIs for connecting,
                  missing-provider, and error states. Your chat component only
                  mounts once everything is ready.
                </Text>
                <CodeBlock title="ChatApp.tsx" code={stepGate} />
              </Stack>
            ),
          },
          {
            title: "Create the chat component",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  The useConversation hook manages messages, streaming, and
                  tool calls. Pass a systemPrompt to set the AI's behaviour.
                </Text>
                <CodeBlock title="Chat.tsx" code={stepHook} />
              </Stack>
            ),
          },
          {
            title: "Render messages",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  Map over the messages array. Each message has an id, role
                  ("user" or "assistant"), and content string.
                </Text>
                <CodeBlock title="Chat.tsx (JSX)" code={stepMessages} />
              </Stack>
            ),
          },
          {
            title: "Add streaming indicator",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  While isStreaming is true, streamingContent holds the
                  partial response text. Render it below your message list
                  so the user sees the AI typing in real time.
                </Text>
                <CodeBlock title="Chat.tsx (JSX)" code={stepStreaming} />
              </Stack>
            ),
          },
          {
            title: "Add input form",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  Create a controlled input and call stream() on submit.
                  Clear the input immediately so the user can keep typing.
                  Disable the input while streaming.
                </Text>
                <CodeBlock title="Chat.tsx" code={stepInput} />
              </Stack>
            ),
          },
          {
            title: "Add stop button",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  Call stop() to abort the current stream. The partial
                  response is kept in the messages array.
                </Text>
                <CodeBlock title="Chat.tsx (JSX)" code={stepStop} />
              </Stack>
            ),
          },
        ]}
      />

      <Title order={3}>Complete example</Title>
      <Text>
        Here's the full working app — copy it into your project and you're
        ready to chat:
      </Text>
      <CodeBlock title="App.tsx" code={fullExample} />

      <Title order={3}>React SDK vs Web SDK</Title>
      <Text>
        The React SDK wraps the Web SDK in hooks and components. Here's the
        same chat in both approaches:
      </Text>
      <CodeComparison
        reactSdk={{ title: "Chat.tsx", code: comparisonReact }}
        webSdk={{ title: "main.ts", code: comparisonWeb }}
      />

      <Callout type="tip" title="What's next">
        Learn how to{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("tutorials/streaming-responses")}
        >
          customise streaming behaviour
        </Text>
        , build a{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("tutorials/provider-selection")}
        >
          provider selection UI
        </Text>
        , or{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("tutorials/adding-tool-calling")}
        >
          add tool calling
        </Text>
        .
      </Callout>
    </Stack>
  );
}
