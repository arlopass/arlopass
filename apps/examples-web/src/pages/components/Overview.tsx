import { Stack, Title, Text, Table, Code, Group, Badge } from "@mantine/core";
import { CodeBlock, Callout, InlineCode } from "../../components";
import { navigate } from "../../router";

const installCmd = `npm install @byom-ai/react-ui`;

const quickExample = `import { Chat, StreamingText, Message } from "@byom-ai/react-ui";

function MyChat() {
  return (
    <Chat.Root systemPrompt="You are a helpful assistant.">
      <Chat.Messages>
        {(messages, streamingContent) => (
          <>
            {messages.map((msg) => (
              <Chat.Message key={msg.id} message={msg}>
                <Message.Root>
                  <Message.Content />
                </Message.Root>
              </Chat.Message>
            ))}
            {streamingContent && <StreamingText content={streamingContent} />}
          </>
        )}
      </Chat.Messages>
      <Chat.Input placeholder="Type a message…" />
      <Chat.SendButton>Send</Chat.SendButton>
    </Chat.Root>
  );
}`;

const dataAttributeExample = `/* Style user messages differently using data attributes */
[data-role="user"] {
  background: #2563eb;
  color: white;
}

[data-role="assistant"] {
  background: #f4f4f5;
}

[data-state="streaming"] {
  opacity: 0.8;
}

[data-status="connected"] {
  color: #22c55e;
}`;

const primitives = [
  {
    name: "Chat",
    id: "components/chat",
    description:
      "Compound component for a full chat interface — manages conversation state, message rendering, input, send/stop buttons, and streaming.",
  },
  {
    name: "Message",
    id: "components/message",
    description:
      "Renders a single message with role-aware layout, markdown content, and tool-call display slots.",
  },
  {
    name: "StreamingText",
    id: "components/streaming-text",
    description:
      "Renders in-progress assistant output with token-by-token display.",
  },
  {
    name: "ProviderPicker",
    id: "components/provider-picker",
    description:
      "Compound component for selecting an AI provider and model from the user's configured list.",
  },
  {
    name: "ToolActivity",
    id: "components/tool-activity",
    description:
      "Displays tool-call invocations and their results inline within a message.",
  },
  {
    name: "ConnectionStatus",
    id: "components/connection-status",
    description:
      "Renders content conditionally based on the BYOM extension connection state (connected / disconnected / not installed).",
  },
];

function NavLink({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Text
      span
      c="blue"
      style={{ cursor: "pointer" }}
      onClick={() => navigate(id)}
    >
      {children}
    </Text>
  );
}

export default function Overview() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Components Library</Title>
        <Text c="dimmed" mt={4}>
          Headless primitives and copy-paste blocks for building AI chat interfaces
        </Text>
      </div>

      <Text>
        BYOM ships two complementary layers for UI development:
      </Text>

      <Table withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Package</Table.Th>
            <Table.Th>What it is</Table.Th>
            <Table.Th>Install</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr>
            <Table.Td>
              <Code>@byom-ai/react-ui</Code>
            </Table.Td>
            <Table.Td>
              Headless compound components — no styles, full control
            </Table.Td>
            <Table.Td>
              <Code>npm install</Code>
            </Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td>
              <Code>@byom-ai/ui</Code>
            </Table.Td>
            <Table.Td>
              Styled Tailwind blocks — copy into your project via CLI
            </Table.Td>
            <Table.Td>
              <Code>npx @byom-ai/ui add</Code>
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>

      <Title order={3}>Install</Title>
      <CodeBlock title="Terminal" code={installCmd} language="bash" />

      <Title order={3}>Quick example</Title>
      <Text>
        A fully functional uncontrolled chat in under 20 lines. The{" "}
        <InlineCode>Chat.Root</InlineCode> manages conversation state
        internally — just drop it in and go.
      </Text>
      <CodeBlock title="Uncontrolled chat" code={quickExample} language="tsx" />

      <Callout type="info" title="Architecture: Primitives + Blocks">
        <Text fz="sm">
          <strong>Primitives</strong> (<InlineCode>@byom-ai/react-ui</InlineCode>)
          are installed from npm and are unstyled. They handle behaviour,
          accessibility, and state — you supply the markup and CSS.
        </Text>
        <Text fz="sm" mt={4}>
          <strong>Blocks</strong> (<InlineCode>@byom-ai/ui</InlineCode>) are
          pre-styled compositions built on the primitives. The CLI copies the
          source directly into your project — you own the code and can customise
          freely. See{" "}
          <NavLink id="components/registry">Block registry</NavLink>.
        </Text>
      </Callout>

      <Title order={3}>Primitives</Title>
      <Text>
        All primitives are exported from <InlineCode>@byom-ai/react-ui</InlineCode>.
        Each is a compound component with dot-notation sub-components
        (e.g. <InlineCode>Chat.Root</InlineCode>, <InlineCode>Chat.Messages</InlineCode>).
      </Text>

      <Table withTableBorder withColumnBorders highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Component</Table.Th>
            <Table.Th>Description</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {primitives.map((p) => (
            <Table.Tr key={p.name}>
              <Table.Td>
                <NavLink id={p.id}>{p.name}</NavLink>
              </Table.Td>
              <Table.Td>
                <Text fz="sm">{p.description}</Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Title order={3}>Data attributes</Title>
      <Text>
        Primitives expose semantic <InlineCode>data-*</InlineCode> attributes on
        their rendered DOM elements so you can style states with plain CSS —
        no JavaScript required.
      </Text>

      <Table withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Attribute</Table.Th>
            <Table.Th>Purpose</Table.Th>
            <Table.Th>Example values</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr>
            <Table.Td><Code>data-role</Code></Table.Td>
            <Table.Td>Message author role</Table.Td>
            <Table.Td>
              <Group gap={4}>
                <Badge size="xs" variant="light">user</Badge>
                <Badge size="xs" variant="light">assistant</Badge>
                <Badge size="xs" variant="light">system</Badge>
              </Group>
            </Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td><Code>data-state</Code></Table.Td>
            <Table.Td>Component state</Table.Td>
            <Table.Td>
              <Group gap={4}>
                <Badge size="xs" variant="light">idle</Badge>
                <Badge size="xs" variant="light">streaming</Badge>
                <Badge size="xs" variant="light">error</Badge>
              </Group>
            </Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td><Code>data-status</Code></Table.Td>
            <Table.Td>Connection status</Table.Td>
            <Table.Td>
              <Group gap={4}>
                <Badge size="xs" variant="light">connected</Badge>
                <Badge size="xs" variant="light">disconnected</Badge>
                <Badge size="xs" variant="light">not-installed</Badge>
              </Group>
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>

      <CodeBlock title="CSS styling example" code={dataAttributeExample} language="css" />

      <Callout type="tip" title="Next steps">
        <Text fz="sm">
          Explore individual primitives:{" "}
          <NavLink id="components/chat">Chat</NavLink>,{" "}
          <NavLink id="components/message">Message</NavLink>,{" "}
          <NavLink id="components/streaming-text">StreamingText</NavLink>,{" "}
          <NavLink id="components/provider-picker">ProviderPicker</NavLink>,{" "}
          <NavLink id="components/tool-activity">ToolActivity</NavLink>,{" "}
          <NavLink id="components/connection-status">ConnectionStatus</NavLink>
          . Or jump to the{" "}
          <NavLink id="components/registry">Block registry</NavLink> for
          pre-styled components you can copy into your project.
        </Text>
      </Callout>
    </Stack>
  );
}
