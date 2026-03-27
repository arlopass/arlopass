import { Stack, Title, Text, Table, Code } from "@mantine/core";
import { CodeBlock, PreviewCode, Callout, InlineCode } from "../../components";

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
      <PreviewCode
        preview={
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden", maxWidth: 420, fontFamily: "system-ui", background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ borderBottom: "1px solid #f3f4f6", padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "#6b7280" }}>BYOM Chat</div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, minHeight: 180 }}>
              <div style={{ alignSelf: "flex-end", background: "#2563eb", color: "white", borderRadius: "14px 14px 4px 14px", padding: "8px 14px", fontSize: 14, maxWidth: "80%" }}>
                What can you help me with?
              </div>
              <div style={{ alignSelf: "flex-start", background: "#f4f4f5", borderRadius: "14px 14px 14px 4px", padding: "8px 14px", fontSize: 14, maxWidth: "80%", lineHeight: 1.5 }}>
                I can answer questions, search documentation, generate code snippets, and help you integrate BYOM into your app.
              </div>
              <div style={{ alignSelf: "flex-start", background: "#f4f4f5", borderRadius: "14px 14px 14px 4px", padding: "8px 14px", fontSize: 14, maxWidth: "80%", color: "#9ca3af" }}>
                Thinking<span style={{ color: "#2563eb" }}>▌</span>
              </div>
            </div>
            <div style={{ borderTop: "1px solid #e5e7eb", padding: "10px 16px", display: "flex", gap: 8 }}>
              <input disabled placeholder="Type a message…" style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 14px", fontSize: 14, background: "#fafafa", color: "#6b7280" }} />
              <button style={{ background: "#2563eb", color: "white", border: "none", borderRadius: 10, padding: "8px 18px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Send</button>
            </div>
          </div>
        }
        code={chatUsage}
        title="Chat usage"
      />

      <Title order={3}>Chatbot widget block</Title>
      <Text>
        A floating chat widget that renders a toggle bubble in the corner of
        the screen. Opens an expandable panel with the full chat interface.
        It wraps <InlineCode>BYOMProvider</InlineCode> and guard components
        internally — just drop it anywhere.
      </Text>
      <PreviewCode
        preview={
          <div style={{ position: "relative", height: 320, background: "#f9fafb", borderRadius: 12, overflow: "hidden", fontFamily: "system-ui" }}>
            <div style={{ padding: 24 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>My Application</div>
              <div style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>Your main page content goes here.</div>
            </div>
            <div style={{ position: "absolute", bottom: 16, right: 16, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
              <div style={{ width: 280, background: "white", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.12)", overflow: "hidden", border: "1px solid #e5e7eb" }}>
                <div style={{ borderBottom: "1px solid #f3f4f6", padding: "8px 14px", fontSize: 12, fontWeight: 600, color: "#6b7280", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>AI Assistant</span>
                  <span style={{ color: "#9ca3af", cursor: "pointer" }}>✕</span>
                </div>
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, minHeight: 120 }}>
                  <div style={{ alignSelf: "flex-start", background: "#f4f4f5", borderRadius: 10, padding: "6px 12px", fontSize: 13, maxWidth: "85%" }}>
                    Hi! How can I help?
                  </div>
                  <div style={{ alignSelf: "flex-end", background: "#2563eb", color: "white", borderRadius: 10, padding: "6px 12px", fontSize: 13 }}>
                    Show me the docs
                  </div>
                </div>
                <div style={{ borderTop: "1px solid #e5e7eb", padding: 8, display: "flex", gap: 6 }}>
                  <input disabled placeholder="Ask AI…" style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px", fontSize: 13, background: "#fafafa" }} />
                  <button style={{ background: "#2563eb", color: "white", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 500 }}>Send</button>
                </div>
              </div>
              <button style={{ background: "#2563eb", color: "white", border: "none", borderRadius: 999, padding: "12px 20px", fontSize: 14, fontWeight: 500, cursor: "pointer", boxShadow: "0 2px 8px rgba(37,99,235,0.3)", display: "flex", alignItems: "center", gap: 6 }}>
                💬 Ask AI
              </button>
            </div>
          </div>
        }
        code={chatbotUsage}
        title="Chatbot widget"
      />

      <Title order={3}>Provider picker block</Title>
      <Text>
        Styled provider and model selection dropdowns. Fires an{" "}
        <InlineCode>onSelect</InlineCode> callback when the user confirms
        their choice.
      </Text>
      <PreviewCode
        preview={
          <div style={{ maxWidth: 340, fontFamily: "system-ui", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, background: "white" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 16 }}>Select AI Provider</div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>Provider</label>
              <select disabled style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, background: "white", color: "#111827", appearance: "auto" }}>
                <option>Ollama Local</option>
                <option>Claude (Anthropic)</option>
                <option>OpenAI</option>
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>Model</label>
              <select disabled style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, background: "white", color: "#111827", appearance: "auto" }}>
                <option>llama3</option>
                <option>llama3.1</option>
                <option>codellama</option>
              </select>
            </div>
            <button style={{ width: "100%", background: "#2563eb", color: "white", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
              Select Provider
            </button>
          </div>
        }
        code={providerPickerUsage}
        title="Provider picker"
      />

      <Title order={3}>Connection banner block</Title>
      <Text>
        Shows contextual banners based on the BYOM extension connection state:
        an install prompt when not detected, a reconnect message when
        disconnected, and a success indicator when connected.
      </Text>
      <PreviewCode
        preview={
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: "system-ui" }}>
            <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#92400e" }}>Extension not detected</div>
                <div style={{ fontSize: 12, color: "#a16207", marginTop: 2 }}>Install the BYOM browser extension to enable AI features.</div>
              </div>
              <button style={{ background: "#f59e0b", color: "white", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>Install</button>
            </div>
            <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 16px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#991b1b" }}>Disconnected</div>
              <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 2 }}>Not connected to AI provider. Check your extension settings.</div>
            </div>
            <div style={{ background: "#d1fae5", border: "1px solid #6ee7b7", borderRadius: 8, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, background: "#059669" }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#065f46" }}>Connected</div>
                <div style={{ fontSize: 12, color: "#047857", marginTop: 1 }}>AI features are ready to use.</div>
              </div>
            </div>
          </div>
        }
        code={connectionBannerUsage}
        title="Connection banner"
      />

      <Callout type="info" title="You own the source">
        After copying, the block source lives in your project. Edit the markup,
        swap Tailwind for your own design system, add props — it's your code
        now. The primitives from <InlineCode>@byom-ai/react-ui</InlineCode>{" "}
        remain as npm dependencies for behaviour and state management.
      </Callout>
    </Stack>
  );
}
