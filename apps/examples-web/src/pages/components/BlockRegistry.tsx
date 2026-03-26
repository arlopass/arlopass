import { Stack, Title, Text, Table, Code } from "@mantine/core";
import { CodeBlock, Callout, InlineCode } from "../../components";

const addCmd = `npx @byom-ai/ui add chat`;

const cliCommands = `# Add a single block
npx @byom-ai/ui add chat

# Add multiple blocks
npx @byom-ai/ui add chat chatbot provider-picker

# List available blocks
npx @byom-ai/ui list

# Overwrite existing files
npx @byom-ai/ui add chat --force

# Preview without writing files
npx @byom-ai/ui add chat --dry-run

# Custom output directory
npx @byom-ai/ui add chat --out src/ui`;

const configFile = `// byom-ui.json — auto-created on first \`add\`
{
  "outputDir": "src/components/byom",
  "typescript": true
}`;

const chatUsage = `import { BYOMProvider } from "@byom-ai/react";
import { BYOMChat } from "./components/byom/chat";

function App() {
  return (
    <BYOMProvider>
      <BYOMChat
        systemPrompt="You are a helpful assistant."
        placeholder="Ask me anything…"
      />
    </BYOMProvider>
  );
}`;

const chatbotUsage = `import { BYOMChatbot } from "./components/byom/chatbot";

function App() {
  return (
    <div>
      <h1>My App</h1>
      {/* Floating chat widget — renders a bubble in the bottom-right */}
      <BYOMChatbot
        buttonLabel="Ask AI"
        position="bottom-right"
        systemPrompt="You are a customer support agent."
      />
    </div>
  );
}`;

const providerPickerUsage = `import { BYOMProviderPicker } from "./components/byom/provider-picker";

function Settings() {
  return (
    <BYOMProviderPicker
      onSelect={(providerId, modelId) => {
        console.log("Selected:", providerId, modelId);
      }}
    />
  );
}`;

const connectionBannerUsage = `import { BYOMConnectionBanner } from "./components/byom/connection-banner";

function App() {
  return (
    <div>
      <BYOMConnectionBanner installUrl="https://chromewebstore.google.com" />
      {/* rest of your app */}
    </div>
  );
}`;

const blocks = [
  {
    id: "chat",
    name: "Chat",
    description:
      "Complete chat interface with messages, streaming, input, and auto-scroll",
  },
  {
    id: "chatbot",
    name: "Chatbot Widget",
    description:
      "Floating chatbot bubble with expandable chat panel (depends on chat)",
  },
  {
    id: "provider-picker",
    name: "Provider Picker",
    description: "Styled provider and model selection dropdowns",
  },
  {
    id: "connection-banner",
    name: "Connection Banner",
    description: "Connection status banner with install prompt",
  },
];

export default function BlockRegistry() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Block registry</Title>
        <Text c="dimmed" mt={4}>
          Pre-styled Tailwind blocks you copy into your project with a single command
        </Text>
      </div>

      <Text>
        Blocks are complete, styled UI components built on top of the{" "}
        <InlineCode>@byom-ai/react-ui</InlineCode> primitives. Instead of
        installing them as a dependency, the CLI copies the source files into
        your project so you have full control over the code.
      </Text>

      <Title order={3}>Install a block</Title>
      <CodeBlock title="Terminal" code={addCmd} language="bash" />

      <Title order={3}>Available blocks</Title>
      <Table withTableBorder withColumnBorders highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ID</Table.Th>
            <Table.Th>Name</Table.Th>
            <Table.Th>Description</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {blocks.map((b) => (
            <Table.Tr key={b.id}>
              <Table.Td>
                <Code>{b.id}</Code>
              </Table.Td>
              <Table.Td>{b.name}</Table.Td>
              <Table.Td>
                <Text fz="sm">{b.description}</Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Title order={3}>CLI commands</Title>
      <CodeBlock title="Terminal" code={cliCommands} language="bash" />

      <Title order={3}>Configuration</Title>
      <Text>
        On first run, the CLI creates a <InlineCode>byom-ui.json</InlineCode>{" "}
        file in your project root. You can edit it to change the output
        directory or other settings.
      </Text>
      <CodeBlock title="byom-ui.json" code={configFile} language="json" />

      <Title order={3}>Chat block</Title>
      <Text>
        A full chat interface with message list, streaming indicator, input
        field, and send/stop buttons. Wrap it in a{" "}
        <InlineCode>BYOMProvider</InlineCode> and you're ready to go.
      </Text>
      <CodeBlock title="Chat usage" code={chatUsage} language="tsx" />

      <Title order={3}>Chatbot widget block</Title>
      <Text>
        A floating chat widget that renders a toggle bubble in the corner of
        the screen. Opens an expandable panel with the full chat interface.
        It wraps <InlineCode>BYOMProvider</InlineCode> and guard components
        internally — just drop it anywhere.
      </Text>
      <CodeBlock title="Chatbot widget" code={chatbotUsage} language="tsx" />

      <Title order={3}>Provider picker block</Title>
      <Text>
        Styled provider and model selection dropdowns. Fires an{" "}
        <InlineCode>onSelect</InlineCode> callback when the user confirms
        their choice.
      </Text>
      <CodeBlock title="Provider picker" code={providerPickerUsage} language="tsx" />

      <Title order={3}>Connection banner block</Title>
      <Text>
        Shows contextual banners based on the BYOM extension connection state:
        an install prompt when not detected, a reconnect message when
        disconnected, and a success indicator when connected.
      </Text>
      <CodeBlock title="Connection banner" code={connectionBannerUsage} language="tsx" />

      <Callout type="info" title="You own the source">
        After copying, the block source lives in your project. Edit the markup,
        swap Tailwind for your own design system, add props — it's your code
        now. The primitives from <InlineCode>@byom-ai/react-ui</InlineCode>{" "}
        remain as npm dependencies for behaviour and state management.
      </Callout>
    </Stack>
  );
}
