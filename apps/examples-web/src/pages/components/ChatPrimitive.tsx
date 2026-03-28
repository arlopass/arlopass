import { Stack, Title, Text, Table, Code, Divider } from "@mantine/core";
import {
  CodeBlock,
  Callout,
  InlineCode,
  ApiTable,
  PreviewCode,
} from "../../components";

const parts = [
  {
    name: "Root",
    type: "div",
    default: "—",
    description:
      "Manages conversation state (uncontrolled) or accepts external state (controlled). Renders the outermost wrapper.",
    required: false,
  },
  {
    name: "Header",
    type: "div",
    default: "—",
    description:
      'Container for the chat header area (title, controls). Sets data-part="header".',
    required: false,
  },
  {
    name: "Messages",
    type: "render prop",
    default: "—",
    description:
      "Provides the message list via a render-prop child. Auto-scrolls with rAF pinning during streaming.",
    required: false,
  },
  {
    name: "Message",
    type: "div",
    default: "—",
    description:
      "Wraps a single message inside Messages. Accepts a TrackedChatMessage. Provides context to child parts.",
    required: false,
  },
  {
    name: "Avatar",
    type: "div",
    default: "—",
    description:
      'Avatar circle for a message. Accepts a role prop ("user" | "assistant"). Sets data-part="avatar".',
    required: false,
  },
  {
    name: "Bubble",
    type: "div",
    default: "—",
    description:
      'Message bubble container. Reads role from Message context. Sets data-part="bubble".',
    required: false,
  },
  {
    name: "MessageContent",
    type: "div",
    default: "—",
    description: "Renders the text content of the current Chat.Message.",
    required: false,
  },
  {
    name: "MessageMeta",
    type: "div",
    default: "—",
    description:
      'Slot for provider/model attribution below assistant messages. Sets data-part="message-meta".',
    required: false,
  },
  {
    name: "ToolPills",
    type: "div",
    default: "—",
    description:
      'Renders tool usage pills for assistant messages. Accepts formatToolName prop. Sets data-part="tool-pills".',
    required: false,
  },
  {
    name: "Input",
    type: "textarea",
    default: "—",
    description: "Auto-growing text input wired to Chat.Root state.",
    required: false,
  },
  {
    name: "SendButton",
    type: "button",
    default: "—",
    description: "Sends the current input. Disabled when empty or streaming.",
    required: false,
  },
  {
    name: "StopButton",
    type: "button",
    default: "—",
    description: "Aborts the active stream. Hidden when not streaming.",
    required: false,
  },
  {
    name: "StreamingIndicator",
    type: "span",
    default: "—",
    description: "Visible only while a response is being streamed.",
    required: false,
  },
  {
    name: "TypingIndicator",
    type: "div",
    default: "—",
    description:
      "Bouncing dots shown when streaming starts before any content arrives. Accepts dotCount prop (default 3).",
    required: false,
  },
  {
    name: "StreamCursor",
    type: "span",
    default: "—",
    description:
      'Pulsing cursor bar at the end of streaming content. Sets data-part="stream-cursor".',
    required: false,
  },
  {
    name: "ToolActivity",
    type: "div",
    default: "—",
    description:
      "Live tool execution phases (priming, matched, executing, result). Sets data-phase attribute.",
    required: false,
  },
  {
    name: "EmptyState",
    type: "div",
    default: "—",
    description: "Shown when the message list is empty.",
    required: false,
  },
  {
    name: "ScrollFade",
    type: "div",
    default: "—",
    description:
      "Gradient fade overlay at the top of the messages area. Controlled via visible prop.",
    required: false,
  },
  {
    name: "Footer",
    type: "div",
    default: "—",
    description:
      'Footer status bar container. Sets data-state to "streaming" or "idle".',
    required: false,
  },
  {
    name: "ContextBar",
    type: "div",
    default: "—",
    description:
      "Context window usage indicator with usage levels (normal/warning/critical). Accepts formatTokens prop.",
    required: false,
  },
];

const uncontrolledExample = `import { ArlopassProvider } from "@arlopass/react";
import { Chat } from "@arlopass/react-ui";

function MyChat() {
  return (
    <ArlopassProvider>
      <Chat.Root systemPrompt="You are a helpful assistant.">
        <Chat.Header>
          <span>Documentation Assistant</span>
        </Chat.Header>

        <Chat.ScrollFade visible={hasScrolled} />
        <Chat.EmptyState>No messages yet — say hello!</Chat.EmptyState>
        <Chat.Messages>
          {(messages) => (
            <>
              {messages.map((msg) => (
                <Chat.Message key={msg.id} message={msg}>
                  <Chat.Avatar role={msg.role}>{/* icon */}</Chat.Avatar>
                  <div>
                    <Chat.Bubble>
                      <Chat.MessageContent />
                    </Chat.Bubble>
                    <Chat.MessageMeta>Claude 3.5 · Anthropic</Chat.MessageMeta>
                    <Chat.ToolPills />
                  </div>
                </Chat.Message>
              ))}
            </>
          )}
        </Chat.Messages>

        <Chat.TypingIndicator />
        <Chat.ToolActivity />

        <Chat.Input placeholder="Type a message…" />
        <Chat.SendButton>Send</Chat.SendButton>
        <Chat.StopButton>Stop</Chat.StopButton>

        <Chat.Footer>
          <Chat.ContextBar />
        </Chat.Footer>
      </Chat.Root>
    </ArlopassProvider>
  );
}`;

const controlledExample = `import { useConversation } from "@arlopass/react";
import { Chat } from "@arlopass/react-ui";

function ControlledChat() {
  const conv = useConversation({ systemPrompt: "Be concise." });

  return (
    <Chat.Root
      messages={conv.messages}
      streamingContent={conv.streamingContent}
      streamingMessageId={conv.streamingMessageId}
      isStreaming={conv.isStreaming}
      isSending={conv.isSending}
      onSend={(text) => conv.stream(text)}
      onStop={conv.stop}
      error={conv.error}
      toolActivity={conv.toolActivity}
      contextInfo={conv.contextInfo}
    >
      <Chat.Header>AI Chat</Chat.Header>
      <Chat.Messages>
        {(messages) => messages.map(msg => (
          <Chat.Message key={msg.id} message={msg}>
            <Chat.Avatar role={msg.role} />
            <div>
              <Chat.Bubble>
                <Chat.MessageContent />
                {msg.role === "assistant" && conv.isStreaming && (
                  <Chat.StreamCursor />
                )}
              </Chat.Bubble>
              <Chat.MessageMeta>Model info here</Chat.MessageMeta>
              <Chat.ToolPills formatToolName={(n) => n.replace(/_/g, " ")} />
            </div>
          </Chat.Message>
        ))}
      </Chat.Messages>
      <Chat.TypingIndicator dotCount={3} />
      <Chat.ToolActivity />
      <Chat.Input placeholder="Ask anything…" />
      <Chat.SendButton>Send</Chat.SendButton>
      <Chat.Footer>
        <Chat.ContextBar />
      </Chat.Footer>
    </Chat.Root>
  );
}`;

const uncontrolledProps = [
  {
    name: "systemPrompt",
    type: "string",
    description: "Prepended as a system message to every request.",
  },
  {
    name: "tools",
    type: "ToolDefinition[]",
    description: "Tool definitions the model can call.",
  },
  {
    name: "maxTokens",
    type: "number",
    description:
      "Context window limit in tokens. Auto-detected from model if omitted.",
  },
  {
    name: "maxToolRounds",
    type: "number",
    default: "5",
    description: "Maximum tool-call rounds before returning text.",
  },
  {
    name: "primeTools",
    type: "boolean",
    default: "false",
    description: "Enable tool priming for all messages.",
  },
  {
    name: "hideToolCalls",
    type: "boolean",
    default: "false",
    description: "Strip tool-call markup from streamed/returned text.",
  },
  {
    name: "initialMessages",
    type: "TrackedChatMessage[]",
    description: "Seed the message list (e.g. restored from storage).",
  },
];

const controlledProps = [
  {
    name: "messages",
    type: "readonly TrackedChatMessage[]",
    description:
      "Full message list. When provided, Chat.Root becomes controlled.",
    required: true,
  },
  {
    name: "streamingContent",
    type: "string",
    description: "Accumulated text of the current streaming response.",
  },
  {
    name: "streamingMessageId",
    type: "MessageId | null",
    description: "ID of the message currently being streamed.",
  },
  {
    name: "isStreaming",
    type: "boolean",
    description: "True while a stream is in progress.",
  },
  {
    name: "isSending",
    type: "boolean",
    description: "True while a non-streaming send is in progress.",
  },
  {
    name: "onSend",
    type: "(content: string) => Promise<MessageId>",
    description: "Called when the user submits input.",
  },
  {
    name: "onStop",
    type: "() => void",
    description: "Called when the user clicks Stop.",
  },
  {
    name: "error",
    type: "ArlopassSDKError | null",
    description: "Error from the last operation.",
  },
  {
    name: "toolActivity",
    type: "ToolActivityState",
    description:
      "Current tool execution state (priming, matched, executing, result, idle).",
  },
  {
    name: "contextInfo",
    type: "ContextWindowInfo",
    description:
      "Context window usage info (maxTokens, usedTokens, usageRatio).",
  },
];

const dataAttributes = [
  {
    name: "data-state",
    type: '"idle" | "streaming" | "sending" | "error"',
    default: '"idle"',
    description:
      "Set on Chat.Root and Chat.Footer. Reflects current chat state.",
  },
  {
    name: "data-role",
    type: '"user" | "assistant" | "system"',
    default: "—",
    description:
      "Set on Chat.Message, Chat.Avatar, Chat.Bubble, Chat.MessageMeta.",
  },
  {
    name: "data-status",
    type: '"pending" | "streaming" | "complete" | "error"',
    default: "—",
    description: "Set on Chat.Message and Chat.Bubble.",
  },
  {
    name: "data-part",
    type: "string",
    default: "—",
    description:
      'Identifies the component: "header", "avatar", "bubble", "typing-indicator", "typing-dot", "stream-cursor", "message-meta", "tool-pills", "tool-pill", "footer", "context-bar", "scroll-fade", "tool-activity".',
  },
  {
    name: "data-phase",
    type: '"priming" | "matched" | "executing" | "result"',
    default: "—",
    description:
      "Set on Chat.ToolActivity. Reflects the current tool execution phase.",
  },
  {
    name: "data-usage",
    type: '"normal" | "warning" | "critical"',
    default: '"normal"',
    description: "Set on Chat.ContextBar. Reflects context window usage level.",
  },
];

const stylingExample = `/* Target Chat parts via data attributes */

/* Message bubbles by role */
[data-part="bubble"][data-role="user"] {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 10px;
}

[data-part="bubble"][data-role="assistant"] {
  background: var(--surface-accent);
  border: 1px solid var(--border-accent);
  border-radius: 8px;
  padding: 6px 10px;
}

/* Avatars */
[data-part="avatar"] {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
[data-part="avatar"][data-role="user"] {
  background: var(--surface);
  border: 1px solid var(--border);
}
[data-part="avatar"][data-role="assistant"] {
  background: var(--surface-accent);
}

/* Typing dots with bounce animation */
[data-part="typing-dot"] {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: bounce 0.8s ease-in-out infinite;
}

/* Streaming cursor */
[data-part="stream-cursor"] {
  display: inline-block;
  width: 2px;
  height: 14px;
  background: var(--accent);
  animation: pulse 1s ease-in-out infinite;
}

/* Context bar usage levels */
[data-part="context-bar"][data-usage="warning"] { color: var(--warning); }
[data-part="context-bar"][data-usage="critical"] { color: var(--danger); }

/* Tool activity phases */
[data-part="tool-activity"][data-phase="executing"] {
  opacity: 0.8;
}

/* Scroll fade gradient */
[data-part="scroll-fade"][data-state="visible"] {
  opacity: 1;
  background: linear-gradient(to bottom, var(--surface), transparent);
}
[data-part="scroll-fade"][data-state="hidden"] {
  opacity: 0;
}

/* Footer states */
[data-part="footer"][data-state="streaming"] {
  border-top-color: var(--accent);
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  [data-part="typing-dot"],
  [data-part="stream-cursor"] {
    animation: none;
  }
}`;

// ─── Preview mock shared styles ─────────────────────────────────────

const S = {
  root: {
    background: "var(--ap-bg-surface, #292524)",
    border: "1px solid var(--ap-border, #44403c)",
    borderRadius: 12,
    maxWidth: 340,
    fontFamily: "system-ui",
    overflow: "hidden",
    fontSize: 12,
    color: "var(--ap-text-body, #d6d3d1)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderBottom: "1px solid var(--ap-border, #44403c)",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ap-text-primary, #fafaf9)",
  },
  messages: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
    padding: "12px 14px",
    minHeight: 140,
  },
  msgRow: {
    display: "flex",
    gap: 8,
    alignItems: "flex-start" as const,
  },
  avatarUser: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "var(--ap-bg-base, #1c1917)",
    border: "1px solid var(--ap-border, #44403c)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: 9,
    color: "var(--ap-text-tertiary, #78716c)",
  },
  avatarAi: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "var(--ap-bg-elevated, #3d3835)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: 9,
    color: "var(--ap-text-tertiary, #78716c)",
  },
  bubbleUser: {
    background: "var(--ap-bg-base, #1c1917)",
    border: "1px solid var(--ap-border, #44403c)",
    borderRadius: 8,
    padding: "6px 10px",
    lineHeight: 1.5,
    maxWidth: 220,
  },
  bubbleAi: {
    background: "var(--ap-bg-elevated, #3d3835)",
    border: "1px solid rgba(120,113,108,0.15)",
    borderRadius: 8,
    padding: "6px 10px",
    lineHeight: 1.5,
    maxWidth: 220,
  },
  meta: {
    fontSize: 9,
    color: "var(--ap-text-tertiary, #78716c)",
    marginTop: 3,
    marginLeft: 2,
    opacity: 0.7,
  },
  toolPill: {
    display: "inline-block",
    fontSize: 9,
    fontWeight: 500,
    padding: "1px 6px",
    borderRadius: 4,
    background: "var(--ap-bg-elevated, #3d3835)",
    color: "var(--ap-text-tertiary, #78716c)",
    marginTop: 3,
    marginLeft: 2,
  },
  dots: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    padding: "8px 10px",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: "50%",
    background: "var(--ap-text-tertiary, #78716c)",
  },
  cursor: {
    display: "inline-block",
    width: 2,
    height: 13,
    background: "var(--ap-text-tertiary, #78716c)",
    marginLeft: 2,
    verticalAlign: "middle",
    opacity: 0.8,
  },
  inputArea: {
    padding: "8px 14px",
    borderTop: "1px solid var(--ap-border, #44403c)",
  },
  selectors: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginBottom: 6,
  },
  selectorPill: {
    padding: "2px 8px",
    borderRadius: 4,
    background: "var(--ap-bg-elevated, #3d3835)",
    fontSize: 10,
    fontWeight: 500,
    color: "var(--ap-text-secondary, #a8a29e)",
  },
  inputRow: {
    display: "flex",
    alignItems: "flex-end" as const,
    gap: 6,
  },
  input: {
    flex: 1,
    border: "1px solid var(--ap-border, #44403c)",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    background: "var(--ap-bg-base, #1c1917)",
    color: "var(--ap-text-body, #d6d3d1)",
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "var(--ap-text-tertiary, #78716c)",
    border: "none",
    color: "white",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
  },
  footer: {
    padding: "8px 14px",
    borderTop: "1px solid var(--ap-border, #44403c)",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  footerDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#4d7c0f",
    flexShrink: 0,
  },
  footerLabel: {
    fontSize: 10,
    color: "var(--ap-text-tertiary, #78716c)",
    flex: 1,
  },
  footerModel: {
    fontSize: 10,
    fontFamily: "monospace",
    color: "var(--ap-text-tertiary, #78716c)",
  },
  ctxBar: {
    fontSize: 10,
    fontFamily: "monospace",
    color: "var(--ap-text-tertiary, #78716c)",
    marginLeft: "auto",
  },
} as const;

function ChatPreviewMock() {
  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>Documentation Assistant</div>

      {/* Messages */}
      <div style={S.messages}>
        {/* User message */}
        <div style={S.msgRow}>
          <div style={S.avatarUser}>U</div>
          <div style={S.bubbleUser}>What is Arlopass?</div>
        </div>

        {/* AI message */}
        <div style={S.msgRow}>
          <div style={S.avatarAi}>AI</div>
          <div>
            <div style={S.bubbleAi}>
              Arlopass is an AI wallet for the web. It lets you use your own
              providers with any app…
            </div>
            <div style={S.meta}>Claude 3.5 Sonnet · Anthropic</div>
            <span style={S.toolPill}>search docs</span>
          </div>
        </div>

        {/* Streaming message */}
        <div style={S.msgRow}>
          <div style={S.avatarAi}>AI</div>
          <div style={S.bubbleAi}>
            Here's how to get started
            <span style={S.cursor} />
          </div>
        </div>
      </div>

      {/* Input area */}
      <div style={S.inputArea}>
        <div style={S.selectors}>
          <span style={S.selectorPill}>Anthropic ▾</span>
          <span style={S.selectorPill}>Claude 3.5 ▾</span>
          <span style={S.ctxBar}>0.2k/200k (0%)</span>
        </div>
        <div style={S.inputRow}>
          <input disabled placeholder="Ask about Arlopass…" style={S.input} />
          <button style={S.sendBtn}>↑</button>
        </div>
      </div>

      {/* Footer */}
      <div style={S.footer}>
        <div style={S.footerDot} />
        <span style={S.footerLabel}>Connected via Arlopass</span>
        <span style={S.footerModel}>Claude 3.5</span>
      </div>
    </div>
  );
}

export default function ChatPrimitive() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Chat</Title>
        <Text c="dimmed" mt={4}>
          Compound chat interface with messages, streaming, input, and tool
          support
        </Text>
      </div>

      <CodeBlock
        code={`import { Chat } from "@arlopass/react-ui";`}
        language="tsx"
      />

      <Title order={3}>Parts</Title>
      <Table withTableBorder withColumnBorders striped fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Element</Table.Th>
            <Table.Th>Purpose</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {parts.map((p) => (
            <Table.Tr key={p.name}>
              <Table.Td>
                <Code fz="xs">Chat.{p.name}</Code>
              </Table.Td>
              <Table.Td>
                <Code fz="xs">{p.type}</Code>
              </Table.Td>
              <Table.Td>
                <Text fz="xs">{p.description}</Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Divider />
      <Title order={3}>Uncontrolled usage</Title>
      <Text>
        Wrap in a <InlineCode>{"<ArlopassProvider>"}</InlineCode> and{" "}
        <InlineCode>Chat.Root</InlineCode> manages all conversation state
        internally via <InlineCode>useConversation</InlineCode>.
      </Text>
      <PreviewCode
        preview={<ChatPreviewMock />}
        code={uncontrolledExample}
        title="Uncontrolled chat"
      />

      <Divider />
      <Title order={3}>Controlled usage</Title>
      <Text>
        Pass <InlineCode>messages</InlineCode> and callbacks to manage state
        yourself. Useful when you need access to the conversation outside the
        Chat tree.
      </Text>
      <CodeBlock
        title="Controlled chat"
        code={controlledExample}
        language="tsx"
      />

      <Divider />
      <Title order={3}>Chat.Root — uncontrolled props</Title>
      <ApiTable data={uncontrolledProps} />

      <Title order={3}>Chat.Root — controlled props</Title>
      <ApiTable data={controlledProps} />

      <Divider />
      <Title order={3}>Data attributes</Title>
      <ApiTable data={dataAttributes} />

      <Title order={3}>Styling</Title>
      <Text>
        All parts render plain HTML elements with data attributes. Use CSS
        attribute selectors to style each state:
      </Text>
      <CodeBlock title="CSS" code={stylingExample} language="css" />

      <Divider />
      <Title order={3}>Accessibility</Title>
      <Callout type="info" title="Keyboard & ARIA">
        <Text fz="sm">
          <InlineCode>Chat.Input</InlineCode> supports <strong>Enter</strong> to
          send and <strong>Shift+Enter</strong> for new lines.{" "}
          <InlineCode>Chat.SendButton</InlineCode> and{" "}
          <InlineCode>Chat.StopButton</InlineCode> are native{" "}
          <InlineCode>{"<button>"}</InlineCode> elements with{" "}
          <InlineCode>aria-label</InlineCode> attributes. The message list uses{" "}
          <InlineCode>role="log"</InlineCode> so screen readers announce new
          messages automatically.
        </Text>
      </Callout>
    </Stack>
  );
}
