import { Stack, Title, Text, Divider } from "@mantine/core";
import { CodeBlock, InlineCode } from "../../../components";

const reactImport = `import type {
  MessageId,
  TrackedChatMessage,
  ToolCallInfo,
  SubscriptionEvent,
  ChatSubscribe,
  ChatSubscribeNoTools,
  ArlopassProviderProps,
} from "@arlopass/react";`;

const reExportImport = `// Re-exported from @arlopass/web-sdk — no need to install web-sdk separately
import type {
  ChatMessage,
  ChatRole,
  ClientState,
  ProviderDescriptor,
  SelectProviderInput,
  ChatOperationOptions,
  ChatStreamEvent,
  ArlopassSDKError,
  ArlopassStateError,
  ArlopassTransport,
  ToolDefinition,
  ConversationStreamEvent,
  ToolCall,
  ToolResult,
  ToolCallEvent,
  ToolResultEvent,
  ToolPrimingStartEvent,
  ToolPrimingMatchEvent,
  ToolPrimingEndEvent,
} from "@arlopass/react";`;

const messageIdDef = `type MessageId = string;`;

const trackedChatMessageDef = `type TrackedChatMessage = Readonly<{
  id: MessageId;
  role: ChatRole;
  content: string;
  inResponseTo?: MessageId;
  status: "pending" | "streaming" | "complete" | "error";
  pinned: boolean;
  toolCalls?: readonly ToolCallInfo[];
}>;`;

const toolCallInfoDef = `type ToolCallInfo = Readonly<{
  toolCallId: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  status: "pending" | "executing" | "complete" | "error";
}>;`;

const subscriptionEventDef = `type SubscriptionEvent =
  | "response"
  | "stream"
  | "error"
  | "tool_call"
  | "tool_result"
  | "tool_priming_start"
  | "tool_priming_match"
  | "tool_priming_end";`;

const chatSubscribeDef = `type ChatSubscribe = {
  (event: "response", messageId: MessageId, handler: (msg: TrackedChatMessage) => void): () => void;
  (event: "response", handler: (msg: TrackedChatMessage) => void): () => void;
  (event: "stream", messageId: MessageId, handler: (delta: string, accumulated: string) => void): () => void;
  (event: "error", handler: (error: ArlopassSDKError, messageId: MessageId | null) => void): () => void;
  (event: "error", messageId: MessageId, handler: (error: ArlopassSDKError) => void): () => void;
  (event: "tool_call", handler: (toolCallId: string, name: string, args: Record<string, unknown>, messageId: MessageId) => void): () => void;
  (event: "tool_call", messageId: MessageId, handler: (toolCallId: string, name: string, args: Record<string, unknown>) => void): () => void;
  (event: "tool_result", handler: (toolCallId: string, name: string, result: string, messageId: MessageId) => void): () => void;
  (event: "tool_result", messageId: MessageId, handler: (toolCallId: string, name: string, result: string) => void): () => void;
  (event: "tool_priming_start", handler: (message: string) => void): () => void;
  (event: "tool_priming_match", handler: (tools: readonly string[]) => void): () => void;
  (event: "tool_priming_end", handler: () => void): () => void;
};`;

const chatSubscribeNoToolsDef = `type ChatSubscribeNoTools = {
  (event: "response", messageId: MessageId, handler: (msg: TrackedChatMessage) => void): () => void;
  (event: "response", handler: (msg: TrackedChatMessage) => void): () => void;
  (event: "stream", messageId: MessageId, handler: (delta: string, accumulated: string) => void): () => void;
  (event: "error", handler: (error: ArlopassSDKError, messageId: MessageId | null) => void): () => void;
  (event: "error", messageId: MessageId, handler: (error: ArlopassSDKError) => void): () => void;
};`;

const providerPropsDef = `type ArlopassProviderProps = Readonly<{
  appId?: string;
  appSuffix?: string;
  appName?: string;
  appDescription?: string;
  appIcon?: string;
  defaultProvider?: string;
  defaultModel?: string;
  autoConnect?: boolean;
  onError?: (error: ArlopassSDKError) => void;
  children: React.ReactNode;
}>;`;

const clientSnapshotDef = `type ClientSnapshot = Readonly<{
  state: ClientState;
  sessionId: string | null;
  selectedProvider: Readonly<{ providerId: string; modelId: string }> | null;
  providers: readonly ProviderDescriptor[];
  error: ArlopassSDKError | null;
}>;`;

// Re-exported types (summarised)
const chatMessageDef = `type ChatMessage = Readonly<{ role: ChatRole; content: string }>;`;
const chatRoleDef = `type ChatRole = "system" | "user" | "assistant";`;
const clientStateDef = `type ClientState = "disconnected" | "connecting" | "connected" | "degraded" | "reconnecting" | "failed";`;
const providerDescriptorDef = `type ProviderDescriptor = Readonly<{
  providerId: string;
  providerName: string;
  models: readonly string[];
}>;`;
const selectProviderInputDef = `type SelectProviderInput = Readonly<{ providerId: string; modelId: string }>;`;
const toolDefinitionDef = `type ToolDefinition = Readonly<{
  name: string;
  description: string;
  parameters?: ToolParameterSchema;
  handler?: (args: Record<string, unknown>) => Promise<string> | string;
}>;`;

export default function ReactTypes() {
  return (
    <Stack gap="lg">
      <Title order={2}>Types</Title>
      <Text>
        All types are importable from <InlineCode>@arlopass/react</InlineCode>.
        This includes React-specific types and re-exports from{" "}
        <InlineCode>@arlopass/web-sdk</InlineCode>.
      </Text>

      <CodeBlock code={reactImport} language="tsx" />

      {/* React-specific types */}
      <Divider />
      <Title order={3}>React SDK types</Title>

      <Title order={4}>MessageId</Title>
      <CodeBlock code={messageIdDef} language="tsx" />
      <Text fz="sm">
        Opaque string identifier for tracked messages (UUID v4).
      </Text>

      <Title order={4}>TrackedChatMessage</Title>
      <CodeBlock code={trackedChatMessageDef} language="tsx" />
      <Text fz="sm">
        Immutable message object returned by <InlineCode>useChat</InlineCode>{" "}
        and <InlineCode>useConversation</InlineCode>. Extends the base{" "}
        <InlineCode>ChatMessage</InlineCode> with tracking metadata.
      </Text>

      <Title order={4}>ToolCallInfo</Title>
      <CodeBlock code={toolCallInfoDef} language="tsx" />
      <Text fz="sm">
        Attached to a <InlineCode>TrackedChatMessage</InlineCode> when the
        assistant invokes tools.
      </Text>

      <Title order={4}>SubscriptionEvent</Title>
      <CodeBlock code={subscriptionEventDef} language="tsx" />

      <Title order={4}>ChatSubscribe</Title>
      <CodeBlock code={chatSubscribeDef} language="tsx" />
      <Text fz="sm">
        Overloaded subscribe function returned by{" "}
        <InlineCode>useConversation</InlineCode>. Supports targeted
        subscriptions by message ID.
      </Text>

      <Title order={4}>ChatSubscribeNoTools</Title>
      <CodeBlock code={chatSubscribeNoToolsDef} language="tsx" />
      <Text fz="sm">
        Restricted subscribe type returned by <InlineCode>useChat</InlineCode>{" "}
        (no tool events).
      </Text>

      <Title order={4}>ArlopassProviderProps</Title>
      <CodeBlock code={providerPropsDef} language="tsx" />

      <Title order={4}>ClientSnapshot</Title>
      <CodeBlock code={clientSnapshotDef} language="tsx" />
      <Text fz="sm">
        Internal store snapshot exposed by the provider context.
      </Text>

      {/* Re-exported types */}
      <Divider />
      <Title order={3}>Re-exported from @arlopass/web-sdk</Title>
      <Text>
        These types are re-exported so you only need the{" "}
        <InlineCode>@arlopass/react</InlineCode> package.
      </Text>

      <CodeBlock code={reExportImport} language="tsx" />

      <Title order={4}>ChatMessage</Title>
      <CodeBlock code={chatMessageDef} language="tsx" />

      <Title order={4}>ChatRole</Title>
      <CodeBlock code={chatRoleDef} language="tsx" />

      <Title order={4}>ClientState</Title>
      <CodeBlock code={clientStateDef} language="tsx" />

      <Title order={4}>ProviderDescriptor</Title>
      <CodeBlock code={providerDescriptorDef} language="tsx" />

      <Title order={4}>SelectProviderInput</Title>
      <CodeBlock code={selectProviderInputDef} language="tsx" />

      <Title order={4}>ToolDefinition</Title>
      <CodeBlock code={toolDefinitionDef} language="tsx" />
    </Stack>
  );
}
