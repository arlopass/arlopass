import { Stack, Title, Text, Table, Code, Divider } from "@mantine/core";
import { CodeBlock, InlineCode, ApiTable, PreviewCode } from "../../components";

const parts = [
  {
    name: "Root",
    type: "div",
    description:
      "Wraps tool-call display. Tracks whether any call is still in progress.",
  },
  {
    name: "Call",
    type: "div",
    description:
      "Renders a single tool-call invocation. Supports render-prop children.",
  },
  {
    name: "Result",
    type: "div",
    description: "Renders the result of a tool call.",
  },
];

const rootProps = [
  {
    name: "toolCalls",
    type: "readonly ToolCallInfo[]",
    description: "Array of tool calls to display.",
  },
  {
    name: "children",
    type: "ReactNode",
    description: "Sub-components to render inside the activity wrapper.",
  },
];

const callProps = [
  {
    name: "toolCall",
    type: "ToolCallInfo",
    description: "The tool call to display.",
    required: true,
  },
  {
    name: "children",
    type: "((toolCall: ToolCallInfo) => ReactNode) | ReactNode",
    description: "Render-prop or static content. Defaults to the tool name.",
  },
];

const resultProps = [
  {
    name: "toolCall",
    type: "ToolCallInfo",
    description: "The tool call whose result to display.",
    required: true,
  },
];

const usageExample = `import { ToolActivity } from "@byom-ai/react-ui";

function ToolCalls({ toolCalls }) {
  return (
    <ToolActivity.Root toolCalls={toolCalls}>
      {toolCalls.map((tc) => (
        <div key={tc.id}>
          <ToolActivity.Call toolCall={tc}>
            {(call) => (
              <span>
                🔧 {call.name}({JSON.stringify(call.arguments)})
              </span>
            )}
          </ToolActivity.Call>
          <ToolActivity.Result toolCall={tc} />
        </div>
      ))}
    </ToolActivity.Root>
  );
}`;

const withMessageExample = `import { Chat, Message, ToolActivity } from "@byom-ai/react-ui";

<Chat.Messages>
  {(messages) =>
    messages.map((msg) => (
      <Chat.Message key={msg.id} message={msg}>
        <Message.Root message={msg}>
          <Message.Content />
          {msg.toolCalls && (
            <ToolActivity.Root toolCalls={msg.toolCalls}>
              {msg.toolCalls.map((tc) => (
                <ToolActivity.Call key={tc.id} toolCall={tc} />
              ))}
            </ToolActivity.Root>
          )}
        </Message.Root>
      </Chat.Message>
    ))
  }
</Chat.Messages>`;

const dataAttributes = [
  {
    name: "data-state",
    type: '"active" | "idle"',
    default: '"idle"',
    description:
      "Set on ToolActivity.Root. Active while any tool call is in progress.",
  },
  {
    name: "data-status",
    type: '"pending" | "running" | "complete" | "error"',
    default: "—",
    description:
      "Set on ToolActivity.Call and ToolActivity.Result. Status of the individual tool call.",
  },
];

export default function ToolActivityPrimitive() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>ToolActivity</Title>
        <Text c="dimmed" mt={4}>
          Tool call execution display
        </Text>
      </div>

      <CodeBlock
        code={`import { ToolActivity } from "@byom-ai/react-ui";`}
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
                <Code fz="xs">ToolActivity.{p.name}</Code>
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
      <Title order={3}>ToolActivity.Root props</Title>
      <ApiTable data={rootProps} />

      <Title order={3}>ToolActivity.Call props</Title>
      <ApiTable data={callProps} />

      <Title order={3}>ToolActivity.Result props</Title>
      <ApiTable data={resultProps} />

      <Divider />
      <Title order={3}>Usage</Title>
      <PreviewCode
        preview={
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              fontFamily: "system-ui",
              fontSize: 13,
            }}
          >
            <div
              style={{
                background: "#fef3c7",
                border: "1px solid #fcd34d",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              <strong>search_docs</strong> — executing…
              <div style={{ color: "#92400e", fontSize: 12, marginTop: 2 }}>
                {'{"query":"authentication"}'}
              </div>
            </div>
            <div
              style={{
                background: "#d1fae5",
                border: "1px solid #6ee7b7",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              <strong>search_docs</strong> — complete
              <div style={{ color: "#065f46", fontSize: 12, marginTop: 2 }}>
                Found 3 results
              </div>
            </div>
          </div>
        }
        code={usageExample}
        title="ToolActivity"
      />

      <Title order={3}>Inside a Chat message</Title>
      <Text>
        Compose with <InlineCode>Message</InlineCode> to show tool activity
        inline within conversation messages.
      </Text>
      <CodeBlock
        title="With Chat.Messages"
        code={withMessageExample}
        language="tsx"
      />

      <Divider />
      <Title order={3}>Data attributes</Title>
      <ApiTable data={dataAttributes} />
    </Stack>
  );
}
