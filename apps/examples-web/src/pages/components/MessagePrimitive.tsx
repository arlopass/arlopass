import { Stack, Title, Text, Table, Code, Divider } from "@mantine/core";
import { CodeBlock, InlineCode, ApiTable } from "../../components";
import { navigate } from "../../router";

const parts = [
  { name: "Root", type: "div", description: "Outermost wrapper. Provides message context to children." },
  { name: "Content", type: "div", description: "Renders the text/markdown content of the message." },
  { name: "Role", type: "span", description: "Displays the message role (user, assistant, system)." },
  { name: "Timestamp", type: "time", description: "Renders the message timestamp." },
  { name: "Status", type: "span", description: "Shows message delivery status (pending, sent, error)." },
  { name: "ToolCalls", type: "div", description: "Slot for rendering tool-call information within the message." },
];

const rootProps = [
  { name: "message", type: "TrackedChatMessage", description: "The message object to display.", required: true },
  { name: "children", type: "ReactNode", description: "Sub-components to render inside the message." },
];

const standaloneExample = `import { Message } from "@byom-ai/react-ui";

function SingleMessage({ msg }) {
  return (
    <Message.Root message={msg}>
      <Message.Role />
      <Message.Content />
      <Message.Timestamp />
      <Message.Status />
      <Message.ToolCalls />
    </Message.Root>
  );
}`;

const insideChatExample = `import { Chat, Message } from "@byom-ai/react-ui";

<Chat.Root systemPrompt="You are helpful.">
  <Chat.Messages>
    {(messages) =>
      messages.map((msg) => (
        <Chat.Message key={msg.id} message={msg}>
          <Message.Root message={msg}>
            <Message.Role />
            <Message.Content />
          </Message.Root>
        </Chat.Message>
      ))
    }
  </Chat.Messages>
  <Chat.Input />
  <Chat.SendButton>Send</Chat.SendButton>
</Chat.Root>`;

const dataAttributes = [
  { name: "data-role", type: '"user" | "assistant" | "system"', default: "—", description: "Set on Message.Root. The message role." },
  { name: "data-status", type: '"pending" | "sent" | "error"', default: "—", description: "Set on Message.Root. Delivery status of the message." },
];

const stylingExample = `/* Role-based message styling */
[data-role="user"] {
  justify-content: flex-end;
}

[data-role="assistant"] {
  justify-content: flex-start;
}

[data-status="error"] {
  border-left: 3px solid red;
}`;

export default function MessagePrimitive() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Message</Title>
        <Text c="dimmed" mt={4}>
          Standalone message display component
        </Text>
      </div>

      <CodeBlock code={`import { Message } from "@byom-ai/react-ui";`} language="tsx" />

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
              <Table.Td><Code fz="xs">Message.{p.name}</Code></Table.Td>
              <Table.Td><Code fz="xs">{p.type}</Code></Table.Td>
              <Table.Td><Text fz="xs">{p.description}</Text></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Divider />
      <Title order={3}>Message.Root props</Title>
      <ApiTable data={rootProps} />

      <Divider />
      <Title order={3}>Standalone usage</Title>
      <Text>
        Use <InlineCode>Message</InlineCode> on its own to render a single
        message outside of a <InlineCode>Chat</InlineCode> context.
      </Text>
      <CodeBlock title="Standalone message" code={standaloneExample} language="tsx" />

      <Title order={3}>Inside Chat.Messages</Title>
      <Text>
        Compose with <InlineCode>Chat.Message</InlineCode> inside the{" "}
        <InlineCode>Chat.Messages</InlineCode> render prop for full chat
        integration.
      </Text>
      <CodeBlock title="Inside Chat" code={insideChatExample} language="tsx" />

      <Divider />
      <Title order={3}>Data attributes</Title>
      <ApiTable data={dataAttributes} />

      <Title order={3}>Styling</Title>
      <CodeBlock title="CSS" code={stylingExample} language="css" />
    </Stack>
  );
}
