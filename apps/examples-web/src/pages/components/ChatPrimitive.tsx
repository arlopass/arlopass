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
    name: "Messages",
    type: "render prop",
    default: "—",
    description:
      "Provides the message list and streaming content via a render-prop child.",
    required: false,
  },
  {
    name: "Message",
    type: "div",
    default: "—",
    description:
      "Wraps a single message inside Messages. Accepts a TrackedChatMessage.",
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
    name: "EmptyState",
    type: "div",
    default: "—",
    description: "Shown when the message list is empty.",
    required: false,
  },
];

const uncontrolledExample = `import { ArlopassProvider } from "@arlopass/react";
import { Chat, Message, StreamingText } from "@arlopass/react-ui";

function MyChat() {
  return (
    <ArlopassProvider>
      <Chat.Root systemPrompt="You are a helpful assistant.">
        <Chat.EmptyState>No messages yet — say hello!</Chat.EmptyState>
        <Chat.Messages>
          {(messages, streamingContent) => (
            <>
              {messages.map((msg) => (
                <Chat.Message key={msg.id} message={msg}>
                  <Message.Root message={msg}>
                    <Message.Content />
                  </Message.Root>
                </Chat.Message>
              ))}
              {streamingContent && (
                <StreamingText content={streamingContent} isStreaming />
              )}
            </>
          )}
        </Chat.Messages>
        <Chat.Input placeholder="Type a message…" />
        <Chat.SendButton>Send</Chat.SendButton>
        <Chat.StopButton>Stop</Chat.StopButton>
      </Chat.Root>
    </ArlopassProvider>
  );
}`;

const controlledExample = `import { useConversation } from "@arlopass/react";
import { Chat, Message, StreamingText } from "@arlopass/react-ui";

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
    >
      <Chat.Messages>
        {(messages, streamingContent) => (
          <>
            {messages.map((msg) => (
              <Chat.Message key={msg.id} message={msg}>
                <Message.Root message={msg}>
                  <Message.Content />
                </Message.Root>
              </Chat.Message>
            ))}
            {streamingContent && (
              <StreamingText content={streamingContent} isStreaming />
            )}
          </>
        )}
      </Chat.Messages>
      <Chat.Input placeholder="Ask anything…" />
      <Chat.SendButton>Send</Chat.SendButton>
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
];

const dataAttributes = [
  {
    name: "data-state",
    type: '"idle" | "streaming" | "sending" | "error"',
    default: '"idle"',
    description: "Set on Chat.Root. Reflects current chat state.",
  },
  {
    name: "data-role",
    type: '"user" | "assistant" | "system"',
    default: "—",
    description: "Set on Chat.Message. The message role.",
  },
  {
    name: "data-streaming",
    type: '"true" | "false"',
    default: '"false"',
    description:
      "Set on Chat.StreamingIndicator. Visible only while streaming.",
  },
];

const stylingExample = `/* Target Chat parts via data attributes */
[data-state="streaming"] {
  opacity: 0.9;
}

[data-state="error"] {
  border-color: red;
}

[data-role="user"] {
  background: #2563eb;
  color: white;
  border-radius: 12px;
  padding: 8px 12px;
}

[data-role="assistant"] {
  background: #f4f4f5;
  border-radius: 12px;
  padding: 8px 12px;
}`;

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
        preview={
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 16,
              maxWidth: 400,
              fontFamily: "system-ui",
            }}
          >
            <div
              style={{
                padding: "12px 0",
                color: "#9ca3af",
                textAlign: "center",
                fontSize: 14,
              }}
            >
              No messages yet — say hello!
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  alignSelf: "flex-end",
                  background: "#2563eb",
                  color: "white",
                  borderRadius: 12,
                  padding: "8px 14px",
                  fontSize: 14,
                  maxWidth: "75%",
                }}
              >
                What is Arlopass?
              </div>
              <div
                style={{
                  alignSelf: "flex-start",
                  background: "#f4f4f5",
                  borderRadius: 12,
                  padding: "8px 14px",
                  fontSize: 14,
                  maxWidth: "75%",
                }}
              >
                Arlopass is an AI wallet for the web. It lets you use your own
                AI providers…
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                borderTop: "1px solid #e5e7eb",
                paddingTop: 12,
              }}
            >
              <input
                disabled
                placeholder="Type a message…"
                style={{
                  flex: 1,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 14,
                  background: "white",
                }}
              />
              <button
                style={{
                  background: "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Send
              </button>
            </div>
          </div>
        }
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
