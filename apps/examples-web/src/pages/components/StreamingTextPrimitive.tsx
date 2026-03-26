import { Stack, Title, Text, Divider } from "@mantine/core";
import { CodeBlock, InlineCode, ApiTable } from "../../components";
import { navigate } from "../../router";

const props = [
  { name: "content", type: "string", description: "The text content to display.", required: true },
  { name: "isStreaming", type: "boolean", description: "Whether the text is currently being streamed.", required: true },
  { name: "cursor", type: "string", default: '"▌"', description: "Cursor character shown while streaming." },
];

const usageExample = `import { StreamingText } from "@byom-ai/react-ui";

function StreamingDemo({ content, isStreaming }) {
  return (
    <StreamingText
      content={content}
      isStreaming={isStreaming}
      cursor="▌"
    />
  );
}`;

const withChatExample = `import { Chat, StreamingText } from "@byom-ai/react-ui";

<Chat.Root systemPrompt="You are helpful.">
  <Chat.Messages>
    {(messages, streamingContent, isStreaming) => (
      <>
        {messages.map((msg) => (
          <div key={msg.id}>{msg.content}</div>
        ))}
        {streamingContent && (
          <StreamingText content={streamingContent} isStreaming={isStreaming} />
        )}
      </>
    )}
  </Chat.Messages>
  <Chat.Input />
  <Chat.SendButton>Send</Chat.SendButton>
</Chat.Root>`;

const dataAttributes = [
  { name: "data-state", type: '"streaming" | "idle"', default: '"idle"', description: "Reflects whether text is currently being streamed." },
];

const stylingExample = `/* Animate the cursor while streaming */
[data-state="streaming"] {
  /* Cursor blinks */
}

[data-state="streaming"]::after {
  animation: blink 1s steps(2) infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

[data-state="idle"] {
  /* Final state — no cursor visible */
}`;

export default function StreamingTextPrimitive() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>StreamingText</Title>
        <Text c="dimmed" mt={4}>
          Streaming text renderer with typing cursor
        </Text>
      </div>

      <CodeBlock code={`import { StreamingText } from "@byom-ai/react-ui";`} language="tsx" />

      <Title order={3}>Props</Title>
      <ApiTable data={props} />

      <Divider />
      <Title order={3}>Usage</Title>
      <CodeBlock title="Basic" code={usageExample} language="tsx" />

      <Title order={3}>With Chat</Title>
      <Text>
        Commonly used inside <InlineCode>Chat.Messages</InlineCode> to render
        the in-progress assistant response.
      </Text>
      <CodeBlock title="Inside Chat" code={withChatExample} language="tsx" />

      <Divider />
      <Title order={3}>Data attributes</Title>
      <ApiTable data={dataAttributes} />

      <Title order={3}>Styling</Title>
      <Text>
        The component renders a <InlineCode>{"<span>"}</InlineCode> element.
        The cursor character is appended as a text node while streaming.
      </Text>
      <CodeBlock title="CSS" code={stylingExample} language="css" />
    </Stack>
  );
}
