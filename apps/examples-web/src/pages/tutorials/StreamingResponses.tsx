import { Stack, Title, Text } from "@mantine/core";
import { CodeBlock, Callout, StepList, CodeComparison } from "../../components";
import { navigate } from "../../router";

const stepStream = `import { useConversation } from "@byom-ai/react";

function Chat() {
  const { messages, stream, isStreaming } = useConversation();

  async function handleSend(text: string) {
    // stream() sends the message and streams the response token-by-token.
    // The response is automatically appended to the messages array when done.
    await stream(text);
  }

  // send() waits for the full response before updating messages.
  // Use it when you don't need real-time output.
  // await send(text);
}`;

const stepStreamingContent = `import { useConversation } from "@byom-ai/react";

function Chat() {
  const { messages, stream, streamingContent, isStreaming } = useConversation();

  return (
    <div>
      {/* Completed messages */}
      {messages.map((msg) => (
        <div key={msg.id}>
          <strong>{msg.role}:</strong> {msg.content}
        </div>
      ))}

      {/* Partial response while streaming */}
      {isStreaming && streamingContent && (
        <div style={{ opacity: 0.7 }}>
          <strong>assistant:</strong> {streamingContent}
        </div>
      )}
    </div>
  );
}`;

const stepIsStreaming = `function ChatInput({ onSend }: { onSend: (text: string) => void }) {
  const { isStreaming } = useConversation();

  return (
    <div>
      <input placeholder="Type a message..." disabled={isStreaming} />
      <button disabled={isStreaming}>
        {isStreaming ? "Generating..." : "Send"}
      </button>
    </div>
  );
}`;

const stepStop = `import { useConversation } from "@byom-ai/react";

function ChatControls() {
  const { isStreaming, stop } = useConversation();

  return (
    <div>
      {isStreaming && (
        <button onClick={() => stop()}>
          ⏹ Stop generating
        </button>
      )}
    </div>
  );
}`;

const stepOnDelta = `import { useConversation } from "@byom-ai/react";
import { useRef } from "react";

function Chat() {
  const wordCount = useRef(0);

  const { messages, stream, subscribe } = useConversation();

  // Subscribe to stream events for custom processing
  function handleSend(text: string) {
    wordCount.current = 0;

    // Subscribe to stream deltas for this response
    const unsub = subscribe("stream", (delta: string) => {
      // Count words as they arrive
      const words = delta.split(/\\s+/).filter(Boolean);
      wordCount.current += words.length;
      console.log("Words so far:", wordCount.current);
    });

    stream(text).finally(unsub);
  }

  return /* your UI */;
}`;

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
    systemPrompt: "You are a helpful assistant.",
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
          <div style={{ padding: "8px 0", opacity: 0.7, fontStyle: "italic" }}>
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
        {isStreaming ? (
          <button type="button" onClick={() => stop()}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()}>
            Send
          </button>
        )}
      </form>
    </div>
  );
}

export default function App() {
  return (
    <BYOMProvider appId="streaming-demo">
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

const { messages, stream, streamingContent, isStreaming, stop } =
  useConversation();

// Stream a message — UI updates automatically
await stream("Explain React hooks");

// Stop mid-stream
stop();`;

const comparisonWeb = `import { BYOMClient, ConversationManager } from "@byom-ai/web-sdk";

const client = new BYOMClient({ transport: window.byom });
await client.connect({ appId: "streaming-demo" });

const convo = new ConversationManager({ client });

// Stream token-by-token
for await (const event of convo.stream("Explain React hooks")) {
  if (event.type === "delta") {
    document.getElementById("output")!.textContent += event.content;
  }
}

// To abort: call convo.stop()`;

export default function StreamingResponses() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Streaming Responses</Title>
        <Text c="dimmed" mt={4}>
          Add real-time streaming to see AI responses as they're generated
        </Text>
      </div>

      <Title order={3}>What you'll build</Title>
      <Text>
        A chat interface that shows AI responses word-by-word as they arrive,
        with a streaming indicator and the ability to stop generation
        mid-stream.
      </Text>

      <Callout type="info" title="Prerequisites">
        This tutorial builds on the{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("tutorials/first-chat-app")}
        >
          First Chat App
        </Text>
        {" "}tutorial. Complete that first if you haven't already.
      </Callout>

      <StepList
        steps={[
          {
            title: "Use stream() instead of send()",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  The useConversation hook provides two methods for sending
                  messages: stream() delivers tokens in real time, while
                  send() waits for the complete response. Use stream() for
                  interactive chat.
                </Text>
                <CodeBlock title="Chat.tsx" code={stepStream} />
              </Stack>
            ),
          },
          {
            title: "Show streamingContent",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  While a response is being generated, streamingContent holds
                  the partial text. Render it below the completed messages so
                  the user sees the AI "typing" in real time.
                </Text>
                <CodeBlock title="Chat.tsx" code={stepStreamingContent} />
              </Stack>
            ),
          },
          {
            title: "Track streaming state",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  isStreaming is true while a response is being generated.
                  Use it to disable inputs and show loading indicators.
                </Text>
                <CodeBlock title="ChatInput.tsx" code={stepIsStreaming} />
              </Stack>
            ),
          },
          {
            title: "Add a stop button",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  Call stop() to abort the current stream. The partial
                  response is preserved in the messages array — nothing is lost.
                </Text>
                <CodeBlock title="ChatControls.tsx" code={stepStop} />
              </Stack>
            ),
          },
          {
            title: "Handle the onDelta callback",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  For custom token processing (word counting, syntax
                  highlighting, etc.), subscribe to "stream" events. Each
                  delta gives you the latest chunk of text.
                </Text>
                <CodeBlock title="Chat.tsx" code={stepOnDelta} />
              </Stack>
            ),
          },
        ]}
      />

      <Title order={3}>Complete example</Title>
      <Text>
        Here's a full streaming chat app with a send/stop toggle button:
      </Text>
      <CodeBlock title="App.tsx" code={fullExample} />

      <Title order={3}>React SDK vs Web SDK</Title>
      <Text>
        The React SDK manages streaming state automatically. Here's the
        comparison:
      </Text>
      <CodeComparison
        reactSdk={{ title: "Chat.tsx", code: comparisonReact }}
        webSdk={{ title: "main.ts", code: comparisonWeb }}
      />

      <Callout type="tip" title="What's next">
        Build a{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("tutorials/provider-selection")}
        >
          provider selection UI
        </Text>{" "}
        or add{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("tutorials/adding-tool-calling")}
        >
          tool calling
        </Text>{" "}
        to your chat.
      </Callout>
    </Stack>
  );
}
