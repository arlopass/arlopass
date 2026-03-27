import { Stack, Title, Text, Divider } from "@mantine/core";
import { ApiTable, CodeBlock, InlineCode } from "../../../components";

const importLine = `import { ConversationManager } from "@arlopass/web-sdk";`;

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

const constructorOptions = [
  {
    name: "client",
    type: "ArlopassClient",
    required: true,
    description: "Connected ArlopassClient instance.",
  },
  {
    name: "maxTokens",
    type: "number",
    description:
      "Context window limit in tokens. Auto-detected from the selected model if omitted.",
  },
  {
    name: "reserveOutputTokens",
    type: "number",
    default: "1024",
    description: "Tokens reserved for the model's response.",
  },
  {
    name: "systemPrompt",
    type: "string",
    description: "System prompt prepended to every request.",
  },
  {
    name: "summarize",
    type: "boolean",
    default: "false",
    description:
      "Enable automatic summarization when the context window fills.",
  },
  {
    name: "summarizationPrompt",
    type: "string",
    default: '"Summarize the following conversation concisely…"',
    description: "Custom prompt used for summarization.",
  },
  {
    name: "tools",
    type: "ToolDefinition[]",
    default: "[]",
    description: "Tool definitions the model can call.",
  },
  {
    name: "maxToolRounds",
    type: "number",
    default: "5",
    description: "Maximum consecutive tool-call rounds before returning text.",
  },
  {
    name: "primeTools",
    type: "boolean",
    default: "false",
    description: "Enable tool priming for all messages globally.",
  },
  {
    name: "hideToolCalls",
    type: "boolean",
    default: "false",
    description: "Strip tool-call markup from responses globally.",
  },
];

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

const methods = [
  {
    name: "send",
    type: "(content: string, options?: PinOptions) => Promise<ChatMessage>",
    description:
      "Send a user message and receive a complete response. Executes tool calls automatically if handlers are defined.",
  },
  {
    name: "stream",
    type: "(content: string, options?: PinOptions) => AsyncIterable<ConversationStreamEvent>",
    description:
      "Send a user message and stream the response. Yields chunk, done, tool_call, tool_result, and tool_priming_* events.",
  },
  {
    name: "addMessage",
    type: "(message: ChatMessage, options?: PinOptions) => void",
    description: "Manually add a message to the conversation history.",
  },
  {
    name: "getMessages",
    type: "() => readonly ChatMessage[]",
    description: "Get all messages including the system prompt.",
  },
  {
    name: "getContextWindow",
    type: "() => readonly ChatMessage[]",
    description:
      "Get the messages that would be sent in the next request (after summarization/truncation).",
  },
  {
    name: "getTokenCount",
    type: "() => number",
    description: "Estimated total tokens in the current context window.",
  },
  {
    name: "getContextInfo",
    type: "() => ContextWindowInfo",
    description:
      "Returns a snapshot of context window usage: maxTokens, usedTokens, reservedOutputTokens, remainingTokens, and usageRatio (0\u20131).",
  },
  {
    name: "setPin",
    type: "(index: number, pinned: boolean) => void",
    description:
      "Toggle pin status of a message by index. Pinned messages survive summarization.",
  },
  {
    name: "clear",
    type: "() => void",
    description: "Remove all messages from the conversation.",
  },
  {
    name: "submitToolResult",
    type: "(toolCallId: string, result: string) => void",
    description:
      "Submit a result for a manual tool call (tools without a handler).",
  },
];

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

const properties = [
  {
    name: "maxTokens",
    type: "number",
    description: "Configured context window limit (readonly getter).",
  },
];

// ---------------------------------------------------------------------------
// PinOptions
// ---------------------------------------------------------------------------

const pinOptions = [
  {
    name: "pinned",
    type: "boolean",
    description: "Pin the message so it survives context-window summarization.",
  },
  {
    name: "primeTools",
    type: "boolean",
    description:
      "Force tool priming for this message (overrides manager-level setting).",
  },
  {
    name: "hideToolCalls",
    type: "boolean",
    description:
      "Hide tool call markup for this message (overrides manager-level setting).",
  },
];

const streamEventDef = `type ConversationStreamEvent =
  | { type: "chunk"; delta: string; index: number; correlationId: string }
  | { type: "done"; correlationId: string }
  | { type: "tool_call"; toolCallId: string; name: string; arguments: Record<string, unknown>; matchRange: { start: number; end: number } }
  | { type: "tool_result"; toolCallId: string; name: string; result: string }
  | { type: "tool_priming_start"; message: string }
  | { type: "tool_priming_match"; tools: readonly string[] }
  | { type: "tool_priming_end" };`;

const contextWindowInfoDef = `type ContextWindowInfo = Readonly<{
  maxTokens: number;           // Context window size for the model
  usedTokens: number;          // Tokens currently in the context window
  reservedOutputTokens: number; // Tokens reserved for model output
  remainingTokens: number;     // Tokens left for new input
  usageRatio: number;          // 0\u20131 fraction of input budget used
}>;`;

const usageExample = `const manager = new ConversationManager({
  client,
  systemPrompt: "You are a helpful assistant.",
  tools: [{ name: "search", description: "Search", handler: async () => "results" }],
});

// Non-streaming
const reply = await manager.send("What is the weather?");

// Streaming
for await (const event of manager.stream("Tell me more")) {
  if (event.type === "chunk") process.stdout.write(event.delta);
  if (event.type === "tool_call") console.log("Tool:", event.name);
}

// Context window usage
const info = manager.getContextInfo();
console.log(\`\${info.usedTokens}/\${info.maxTokens} tokens (\${Math.round(info.usageRatio * 100)}%)\`);
console.log(\`\${info.remainingTokens} tokens remaining for input\`);`;

export default function ConversationManagerAPI() {
  return (
    <Stack gap="lg">
      <Title order={2}>ConversationManager</Title>
      <Text>
        High-level conversation controller built on top of{" "}
        <InlineCode>ArlopassClient</InlineCode>. Handles context-window
        management, summarization, tool calling, and message pinning.
      </Text>

      <CodeBlock code={importLine} language="tsx" />

      {/* Constructor */}
      <Divider />
      <Title order={3}>Constructor options</Title>
      <ApiTable data={constructorOptions} title="ConversationManagerOptions" />

      {/* Properties */}
      <Divider />
      <Title order={3}>Properties</Title>
      <ApiTable data={properties} />

      {/* Methods */}
      <Divider />
      <Title order={3}>Methods</Title>
      <ApiTable data={methods} />

      {/* PinOptions */}
      <Divider />
      <Title order={3}>PinOptions</Title>
      <Text>
        Options passed to <InlineCode>send</InlineCode>,{" "}
        <InlineCode>stream</InlineCode>, and <InlineCode>addMessage</InlineCode>
        .
      </Text>
      <ApiTable data={pinOptions} />

      {/* ConversationStreamEvent */}
      <Divider />
      <Title order={3}>ConversationStreamEvent</Title>
      <Text>
        Discriminated union yielded by <InlineCode>stream()</InlineCode>.
        Extends the base <InlineCode>ChatStreamEvent</InlineCode> with tool and
        priming events.
      </Text>
      <CodeBlock code={streamEventDef} language="tsx" />

      {/* ContextWindowInfo */}
      <Divider />
      <Title order={3}>ContextWindowInfo</Title>
      <Text>
        Returned by <InlineCode>getContextInfo()</InlineCode>. Provides a
        snapshot of context window usage — useful for building token meters,
        "context full" warnings, and adaptive UI that responds to how much space
        is left.
      </Text>
      <CodeBlock code={contextWindowInfoDef} language="tsx" />

      {/* Example */}
      <Divider />
      <Title order={3}>Example</Title>
      <CodeBlock code={usageExample} language="tsx" />
    </Stack>
  );
}
