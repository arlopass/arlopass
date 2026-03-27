import { Stack, Title, Text } from "@mantine/core";
import { CodeBlock, Callout, CodeComparison } from "../../components";
import { navigate } from "../../router";

const createConversationReact = `import { useConversation } from "@byom-ai/react";

function Chat() {
  const {
    messages,
    streamingContent,
    isStreaming,
    tokenCount,
    contextWindow,
    stream,
    stop,
    clearMessages,
    pinMessage,
  } = useConversation({
    systemPrompt: "You are a helpful assistant.",
    maxTokens: 8192,
  });

  return (
    <div>
      <p>Tokens used: {tokenCount} / 8192</p>
      <p>Messages in context window: {contextWindow.length}</p>
      {messages.map((msg) => (
        <div key={msg.id}>{msg.role}: {msg.content}</div>
      ))}
      {isStreaming && <div>AI: {streamingContent}</div>}
    </div>
  );
}`;

const createConversationWeb = `import { BYOMClient, ConversationManager } from "@byom-ai/web-sdk";

const client = new BYOMClient({ transport: window.byom });
await client.connect({ appId: "my-app" });

const convo = new ConversationManager({
  client,
  systemPrompt: "You are a helpful assistant.",
  maxTokens: 8192,
});

// Send a message and stream the response
for await (const event of convo.stream("Hello!")) {
  if (event.type === "delta") {
    process.stdout.write(event.content);
  }
}

console.log("Tokens used:", convo.getTokenCount());
console.log("Context window:", convo.getContextWindow());`;

const pinExample = `import { useConversation } from "@byom-ai/react";

function Chat() {
  const { messages, stream, pinMessage } = useConversation({
    systemPrompt: "You are a helpful assistant.",
    maxTokens: 4096,
  });

  async function handleSendPinned() {
    // Send a message and pin it so it's never evicted
    const msgId = await stream("My name is Alice. Remember this.", {
      pinned: true,
    });
    // You can also pin/unpin after the fact:
    // pinMessage(msgId, true);
  }

  async function handleUnpin(messageId: string) {
    pinMessage(messageId, false);
  }

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>
          {msg.role}: {msg.content}
          {msg.pinned && <span> 📌</span>}
          <button onClick={() => pinMessage(msg.id, !msg.pinned)}>
            {msg.pinned ? "Unpin" : "Pin"}
          </button>
        </div>
      ))}
      <button onClick={handleSendPinned}>
        Send pinned message
      </button>
    </div>
  );
}`;

const summarizeReact = `const { messages, tokenCount } = useConversation({
  systemPrompt: "You are a helpful assistant.",
  maxTokens: 4096,
  summarize: true, // auto-summarize evicted messages
});

// When the context window fills up, older unpinned messages
// are evicted and replaced with a summary message.
// The summary preserves key facts, decisions, and context.`;

const summarizeWeb = `const convo = new ConversationManager({
  client,
  systemPrompt: "You are a helpful assistant.",
  maxTokens: 4096,
  summarize: true,
  summarizationPrompt: "Summarize preserving key facts and decisions.",
});

// Evicted messages are summarized automatically.
// The summary is added as a system-level message in the context.`;

const tokenMonitoring = `import { useConversation } from "@byom-ai/react";

function ChatWithTokenDisplay() {
  const {
    messages,
    stream,
    contextInfo,
    contextWindow,
    isStreaming,
    streamingContent,
  } = useConversation({
    systemPrompt: "You are a helpful assistant.",
    maxTokens: 8192,
  });

  const pct = Math.round(contextInfo.usageRatio * 100);

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <span>
          Tokens: {contextInfo.usedTokens} / {contextInfo.maxTokens} ({pct}%)
        </span>
        <span>{contextInfo.remainingTokens} remaining</span>
        <span>Context messages: {contextWindow.length}</span>
        <span>Total messages: {messages.length}</span>
      </div>

      {/* Simple progress bar */}
      <div style={{ height: 4, background: "#eee", borderRadius: 2 }}>
        <div
          style={{
            width: pct + "%",
            height: "100%",
            background: pct > 80 ? "orange" : "#2563eb",
            borderRadius: 2,
            transition: "width 200ms",
          }}
        />
      </div>

      {pct > 80 && (
        <p style={{ color: "orange" }}>
          Context window is {pct}% full. Older messages will be
          evicted soon.
        </p>
      )}

      {messages.map((msg) => (
        <div key={msg.id}>
          <strong>{msg.role}:</strong> {msg.content}
        </div>
      ))}
      {isStreaming && <div>AI: {streamingContent}</div>}
    </div>
  );
}`;

const clearExample = `import { useConversation } from "@byom-ai/react";

function Chat() {
  const { messages, stream, clearMessages, isStreaming } = useConversation({
    systemPrompt: "You are a helpful assistant.",
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={clearMessages} disabled={isStreaming}>
          New conversation
        </button>
      </div>

      {messages.map((msg) => (
        <div key={msg.id}>
          <strong>{msg.role}:</strong> {msg.content}
        </div>
      ))}
    </div>
  );
}`;

const fullExample = `import { useState } from "react";
import { BYOMProvider, ChatReadyGate, useConversation } from "@byom-ai/react";

function Chat() {
  const {
    messages,
    streamingContent,
    isStreaming,
    tokenCount,
    contextWindow,
    stream,
    stop,
    clearMessages,
    pinMessage,
  } = useConversation({
    systemPrompt: "You are a helpful assistant.",
    maxTokens: 8192,
    summarize: true,
  });
  const [input, setInput] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const text = input;
    setInput("");
    await stream(text);
  }

  const usage = Math.round((tokenCount / 8192) * 100);

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
        <span>Tokens: {tokenCount} / 8192 ({usage}%)</span>
        <span>Context: {contextWindow.length} msgs</span>
        <button onClick={clearMessages} disabled={isStreaming}>
          Clear
        </button>
      </div>

      <div style={{ minHeight: 300, padding: 16 }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ padding: "8px 0" }}>
            <strong>{msg.role === "user" ? "You" : "AI"}:</strong>{" "}
            {msg.content}
            <button
              onClick={() => pinMessage(msg.id, !msg.pinned)}
              style={{ marginLeft: 8, fontSize: 12 }}
            >
              {msg.pinned ? "Unpin" : "Pin"}
            </button>
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
          <button type="button" onClick={() => stop()}>Stop</button>
        )}
      </form>
    </div>
  );
}

export default function App() {
  return (
    <BYOMProvider appId="managed-chat">
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

export default function ConversationManagement() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Conversation Management</Title>
        <Text c="dimmed" mt={4}>
          You want to manage conversation history with automatic context window
          truncation.
        </Text>
      </div>

      <Title order={3}>Create a managed conversation</Title>
      <Text>
        The <code>useConversation</code> hook wraps a{" "}
        <code>ConversationManager</code> from the web SDK. Pass{" "}
        <code>maxTokens</code> to set the context window size — the manager
        automatically evicts the oldest unpinned messages when the window fills
        up.
      </Text>
      <CodeComparison
        reactSdk={{ title: "Chat.tsx", code: createConversationReact }}
        webSdk={{ title: "main.ts", code: createConversationWeb }}
      />

      <Title order={3}>Pin messages that should never be evicted</Title>
      <Text>
        Pinned messages survive context window truncation. Use them for critical
        user facts, instructions, or system context that the AI must always see.
        Pin on send with <code>{"{ pinned: true }"}</code> or toggle later with{" "}
        <code>pinMessage()</code>.
      </Text>
      <CodeBlock title="PinnedMessages.tsx" code={pinExample} />

      <Title order={3}>Auto-summarize evicted messages</Title>
      <Text>
        When <code>summarize: true</code> is set, evicted messages aren't just
        dropped — they're replaced with a summary that preserves key facts and
        context. This keeps the AI aware of earlier conversation even after
        truncation.
      </Text>
      <CodeComparison
        reactSdk={{ title: "React SDK", code: summarizeReact }}
        webSdk={{ title: "Web SDK", code: summarizeWeb }}
      />

      <Title order={3}>Monitor token usage</Title>
      <Text>
        The <code>contextInfo</code> object gives a complete snapshot of context
        window usage: <code>usedTokens</code>, <code>maxTokens</code>,{" "}
        <code>remainingTokens</code>, and a <code>usageRatio</code> (0–1) that's
        perfect for progress bars. On the web SDK, call{" "}
        <code>convo.getContextInfo()</code> for the same data.
      </Text>
      <CodeBlock title="TokenMonitoring.tsx" code={tokenMonitoring} />

      <Title order={3}>Clear conversation</Title>
      <Text>
        Call <code>clearMessages()</code> to reset the conversation. On the web
        SDK, use <code>convo.clear()</code>. The system prompt is preserved.
      </Text>
      <CodeBlock title="ClearConversation.tsx" code={clearExample} />

      <Title order={3}>Complete example</Title>
      <Text>
        A full chat UI with token monitoring, pinning, summarization, and clear:
      </Text>
      <CodeBlock title="App.tsx" code={fullExample} />

      <Callout type="tip" title="Related">
        See the{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("reference/react-sdk/hooks")}
        >
          Hooks API reference
        </Text>{" "}
        for all <code>useConversation</code> options, or the{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("reference/web-sdk/conversation-manager")}
        >
          ConversationManager reference
        </Text>{" "}
        for the web SDK API.
      </Callout>
    </Stack>
  );
}
