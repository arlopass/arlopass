import { Stack, Title, Text, Divider } from "@mantine/core";
import { ApiTable, CodeBlock, InlineCode, Callout } from "../../../components";

// ---------------------------------------------------------------------------
// useConnection
// ---------------------------------------------------------------------------

const useConnectionReturn = [
  {
    name: "state",
    type: "ClientState",
    description:
      'Current connection state: "disconnected" | "connecting" | "connected" | "degraded" | "reconnecting" | "failed".',
  },
  {
    name: "sessionId",
    type: "string | null",
    description: "Active session ID, or null when disconnected.",
  },
  {
    name: "isConnected",
    type: "boolean",
    description: 'True when state is "connected" or "degraded".',
  },
  {
    name: "isConnecting",
    type: "boolean",
    description: 'True when state is "connecting" or "reconnecting".',
  },
  {
    name: "error",
    type: "ArlopassSDKError | null",
    description: "Most recent connection error, or null.",
  },
  {
    name: "connect",
    type: "() => Promise<void>",
    description: "Initiate a connection. Throws on failure.",
  },
  {
    name: "disconnect",
    type: "() => Promise<void>",
    description: "Disconnect the client and reset state.",
  },
  {
    name: "retry",
    type: "(() => Promise<void>) | null",
    description:
      "Retry function when the last error is retryable. Null otherwise.",
  },
];

const useConnectionExample = `import { useConnection } from "@arlopass/react";

const { state, isConnected, connect, retry } = useConnection();`;

// ---------------------------------------------------------------------------
// useProviders
// ---------------------------------------------------------------------------

const useProvidersReturn = [
  {
    name: "providers",
    type: "readonly ProviderDescriptor[]",
    description: "List of available providers and their models.",
  },
  {
    name: "selectedProvider",
    type: "{ providerId: string; modelId: string } | null",
    description: "Currently selected provider/model pair, or null.",
  },
  {
    name: "isLoading",
    type: "boolean",
    description: "True while listing or selecting a provider.",
  },
  {
    name: "error",
    type: "ArlopassSDKError | null",
    description: "Error from the last provider operation.",
  },
  {
    name: "listProviders",
    type: "() => Promise<void>",
    description:
      "Fetch providers from the extension. Called automatically on connect.",
  },
  {
    name: "selectProvider",
    type: "(input: SelectProviderInput) => Promise<void>",
    description: "Select a provider and model.",
  },
  {
    name: "retry",
    type: "(() => Promise<void>) | null",
    description: "Retry last operation when the error is retryable.",
  },
];

const useProvidersExample = `import { useProviders } from "@arlopass/react";

const { providers, selectedProvider, selectProvider } = useProviders();`;

// ---------------------------------------------------------------------------
// useChat
// ---------------------------------------------------------------------------

const useChatOptions = [
  {
    name: "initialMessages",
    type: "TrackedChatMessage[]",
    description: "Seed the message list (e.g. restored from storage).",
  },
  {
    name: "systemPrompt",
    type: "string",
    description: "Prepended as a system message to every request.",
  },
];

const useChatReturn = [
  {
    name: "messages",
    type: "readonly TrackedChatMessage[]",
    description: "All tracked messages (user + assistant).",
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
    name: "error",
    type: "ArlopassSDKError | null",
    description: "Error from the last chat operation.",
  },
  {
    name: "contextInfo",
    type: "ContextWindowInfo",
    description:
      "Context window usage info: maxTokens, usedTokens, reservedOutputTokens, remainingTokens, usageRatio. Recomputed when messages change.",
  },
  {
    name: "send",
    type: "(content: string) => Promise<MessageId>",
    description:
      "Send a message and wait for the full response. Returns the user message ID.",
  },
  {
    name: "stream",
    type: "(content: string) => Promise<MessageId>",
    description:
      "Send a message and stream the response token-by-token. Returns the user message ID.",
  },
  {
    name: "stop",
    type: "() => void",
    description: "Abort the current stream. Partial content is kept.",
  },
  {
    name: "clearMessages",
    type: "() => void",
    description: "Clear all messages and reset state.",
  },
  {
    name: "retry",
    type: "(() => Promise<void>) | null",
    description: "Retry the last failed operation when the error is retryable.",
  },
  {
    name: "subscribe",
    type: "ChatSubscribeNoTools",
    description: 'Subscribe to chat events: "response", "stream", "error".',
  },
];

const useChatExample = `import { useChat } from "@arlopass/react";

const { messages, stream, isStreaming, stop, contextInfo } = useChat({
  systemPrompt: "You are a helpful assistant.",
});

// contextInfo.usageRatio is 0–1, useful for progress bars
console.log(\`Context: \${contextInfo.usedTokens}/\${contextInfo.maxTokens}\`);`;

// ---------------------------------------------------------------------------
// useConversation
// ---------------------------------------------------------------------------

const useConversationOptions = [
  {
    name: "initialMessages",
    type: "TrackedChatMessage[]",
    description: "Seed the message list.",
  },
  {
    name: "systemPrompt",
    type: "string",
    description: "System prompt prepended to every request.",
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
];

const useConversationReturn = [
  {
    name: "messages",
    type: "readonly TrackedChatMessage[]",
    description: "All tracked messages (user + assistant).",
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
    name: "error",
    type: "ArlopassSDKError | null",
    description: "Error from the last operation.",
  },
  {
    name: "tokenCount",
    type: "number",
    description: "Estimated tokens currently used by the context window.",
  },
  {
    name: "contextWindow",
    type: "readonly ChatMessage[]",
    description:
      "Messages that will be sent in the next request (post-summarization).",
  },
  {
    name: "contextInfo",
    type: "ContextWindowInfo",
    description:
      "Context window usage: maxTokens, usedTokens, reservedOutputTokens, remainingTokens, usageRatio. Updates after each send/stream/clear.",
  },
  {
    name: "send",
    type: "(content: string, options?: { pinned?: boolean }) => Promise<MessageId>",
    description: "Send a message. Optionally pin it to survive summarization.",
  },
  {
    name: "stream",
    type: "(content: string, options?: { pinned?: boolean }) => Promise<MessageId>",
    description: "Stream a response. Optionally pin the user message.",
  },
  {
    name: "stop",
    type: "() => void",
    description: "Abort the current stream.",
  },
  {
    name: "clearMessages",
    type: "() => void",
    description:
      "Clear all messages, reset token count, and clear the ConversationManager.",
  },
  {
    name: "pinMessage",
    type: "(messageId: MessageId, pinned: boolean) => void",
    description:
      "Toggle pin status for a message. Pinned messages survive context-window summarization.",
  },
  {
    name: "submitToolResult",
    type: "(toolCallId: string, result: string) => void",
    description:
      "Submit a result for a manual tool call (tools without a handler).",
  },
  {
    name: "retry",
    type: "(() => Promise<void>) | null",
    description: "Retry the last failed operation. Null when not retryable.",
  },
  {
    name: "subscribe",
    type: "ChatSubscribe",
    description:
      'Subscribe to events: "response", "stream", "error", "tool_call", "tool_result", "tool_priming_start", "tool_priming_match", "tool_priming_end".',
  },
];

const useConversationExample = `import { useConversation } from "@arlopass/react";

const { messages, stream, tokenCount, contextInfo, pinMessage } = useConversation({
  systemPrompt: "You are a helpful assistant.",
  tools: [{ name: "search", description: "Search the web", handler: async (args) => "results" }],
});

// Build a usage meter from contextInfo
const pct = Math.round(contextInfo.usageRatio * 100);
console.log(\`\${pct}% of context used (\${contextInfo.remainingTokens} tokens left)\`);`;

// ---------------------------------------------------------------------------
// useClient
// ---------------------------------------------------------------------------

const useClientReturn = [
  {
    name: "(return)",
    type: "ArlopassClient | null",
    description:
      "The underlying ArlopassClient instance, or null if the transport is unavailable or the client is disconnected/failed.",
  },
];

const useClientExample = `import { useClient } from "@arlopass/react";

const client = useClient();
// Use for advanced operations not covered by other hooks`;

export default function HooksAPI() {
  return (
    <Stack gap="lg">
      <Title order={2}>Hooks</Title>
      <Text>
        All hooks must be called inside a{" "}
        <InlineCode>{"<ArlopassProvider>"}</InlineCode>. They are re-exported
        from <InlineCode>@arlopass/react</InlineCode>.
      </Text>

      {/* ----------------------------------------------------------------- */}
      <Divider />
      <Title order={3}>useConnection</Title>
      <Text>
        Manages the WebSocket-like connection to the Arlopass browser extension.
      </Text>
      <CodeBlock
        code={`import { useConnection } from "@arlopass/react";`}
        language="tsx"
      />
      <ApiTable data={useConnectionReturn} title="Return value" />
      <CodeBlock code={useConnectionExample} language="tsx" />

      {/* ----------------------------------------------------------------- */}
      <Divider />
      <Title order={3}>useProviders</Title>
      <Text>
        Lists available AI providers and selects a provider/model pair.
        Automatically fetches providers when the connection reaches{" "}
        <InlineCode>"connected"</InlineCode> or{" "}
        <InlineCode>"degraded"</InlineCode>.
      </Text>
      <CodeBlock
        code={`import { useProviders } from "@arlopass/react";`}
        language="tsx"
      />
      <ApiTable data={useProvidersReturn} title="Return value" />
      <CodeBlock code={useProvidersExample} language="tsx" />

      {/* ----------------------------------------------------------------- */}
      <Divider />
      <Title order={3}>useChat</Title>
      <Text>
        Stateful chat with message tracking, streaming, and abort. Does not
        support tools or context-window management — use{" "}
        <InlineCode>useConversation</InlineCode> for that.
      </Text>
      <CodeBlock
        code={`import { useChat } from "@arlopass/react";`}
        language="tsx"
      />
      <ApiTable data={useChatOptions} title="Options" />
      <ApiTable data={useChatReturn} title="Return value" />
      <CodeBlock code={useChatExample} language="tsx" />

      <Callout type="info" title="One operation at a time">
        Calling <InlineCode>send</InlineCode> or <InlineCode>stream</InlineCode>{" "}
        while another is in flight throws. Call <InlineCode>stop()</InlineCode>{" "}
        first to abort the current operation.
      </Callout>

      {/* ----------------------------------------------------------------- */}
      <Divider />
      <Title order={3}>useConversation</Title>
      <Text>
        Full-featured conversation hook built on{" "}
        <InlineCode>ConversationManager</InlineCode>. Adds tool calling,
        context-window management, token counting, message pinning, and
        summarization.
      </Text>
      <CodeBlock
        code={`import { useConversation } from "@arlopass/react";`}
        language="tsx"
      />
      <ApiTable data={useConversationOptions} title="Options" />
      <ApiTable data={useConversationReturn} title="Return value" />
      <CodeBlock code={useConversationExample} language="tsx" />

      {/* ----------------------------------------------------------------- */}
      <Divider />
      <Title order={3}>useClient</Title>
      <Text>
        Escape hatch to the underlying <InlineCode>ArlopassClient</InlineCode>{" "}
        instance. Returns <InlineCode>null</InlineCode> when the transport is
        unavailable or the client is in a{" "}
        <InlineCode>"disconnected"</InlineCode> or{" "}
        <InlineCode>"failed"</InlineCode> state.
      </Text>
      <CodeBlock
        code={`import { useClient } from "@arlopass/react";`}
        language="tsx"
      />
      <ApiTable data={useClientReturn} title="Return value" />
      <CodeBlock code={useClientExample} language="tsx" />
    </Stack>
  );
}
