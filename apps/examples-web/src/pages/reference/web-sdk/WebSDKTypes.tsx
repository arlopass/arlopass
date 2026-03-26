import { Stack, Title, Text, Divider } from "@mantine/core";
import { CodeBlock, InlineCode } from "../../../components";

const importLine = `import type {
  ChatMessage,
  ChatRole,
  ClientState,
  ChatInput,
  ChatOperationOptions,
  ChatStreamEvent,
  ChatSendResult,
  ConnectOptions,
  ConnectResult,
  ProviderDescriptor,
  SelectProviderInput,
  SelectProviderResult,
  ListProvidersResult,
  SessionId,
  RequestId,
  CorrelationId,
  TransportRequest,
  TransportResponse,
  TransportStream,
} from "@byom-ai/web-sdk";`;

const toolImport = `import type {
  ToolDefinition,
  ToolParameterSchema,
  ToolCall,
  ToolResult,
  ToolCallEvent,
  ToolResultEvent,
  ToolPrimingStartEvent,
  ToolPrimingMatchEvent,
  ToolPrimingEndEvent,
  ConversationStreamEvent,
} from "@byom-ai/web-sdk";`;

const transportImport = `import type { BYOMTransport } from "@byom-ai/web-sdk";`;

// Core types
const chatRoleDef = `type ChatRole = "system" | "user" | "assistant";`;
const chatMessageDef = `type ChatMessage = Readonly<{
  role: ChatRole;
  content: string;
}>;`;
const clientStateDef = `type ClientState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "degraded"
  | "reconnecting"
  | "failed";`;
const chatInputDef = `type ChatInput = Readonly<{
  messages: readonly ChatMessage[];
}>;`;
const chatOperationOptionsDef = `type ChatOperationOptions = Readonly<{
  timeoutMs?: number;
  signal?: AbortSignal;
}>;`;
const chatStreamEventDef = `type ChatStreamEvent =
  | Readonly<{ type: "chunk"; delta: string; index: number; correlationId: string }>
  | Readonly<{ type: "done"; correlationId: string }>;`;
const chatSendResultDef = `type ChatSendResult = Readonly<{
  message: ChatMessage;
  correlationId: string;
}>;`;

// Connect types
const connectOptionsDef = `type ConnectOptions = Readonly<{
  appId?: string;
  appSuffix?: string;
  appName?: string;
  appDescription?: string;
  appIcon?: string;
  origin?: string;
  timeoutMs?: number;
}>;`;
const connectResultDef = `type ConnectResult = Readonly<{
  sessionId: string;
  capabilities: readonly ProtocolCapability[];
  protocolVersion: string;
  correlationId: string;
}>;`;

// Provider types
const providerDescriptorDef = `type ProviderDescriptor = Readonly<{
  providerId: string;
  providerName: string;
  models: readonly string[];
}>;`;
const selectProviderInputDef = `type SelectProviderInput = Readonly<{
  providerId: string;
  modelId: string;
}>;`;
const selectProviderResultDef = `type SelectProviderResult = Readonly<{
  providerId: string;
  modelId: string;
  correlationId: string;
}>;`;
const listProvidersResultDef = `type ListProvidersResult = Readonly<{
  providers: readonly ProviderDescriptor[];
  correlationId: string;
}>;`;

// Transport types
const transportDef = `interface BYOMTransport {
  request<TReq, TRes>(request: TransportRequest<TReq>): Promise<TransportResponse<TRes>>;
  stream<TReq, TRes>(request: TransportRequest<TReq>): Promise<TransportStream<TRes>>;
  disconnect?(sessionId: string): Promise<void>;
}`;
const transportRequestDef = `type TransportRequest<TPayload = unknown> = Readonly<{
  envelope: ProtocolEnvelopePayload<TPayload>;
  timeoutMs?: number;
  signal?: AbortSignal;
}>;`;
const transportResponseDef = `type TransportResponse<TPayload = unknown> = Readonly<{
  envelope: ProtocolEnvelopePayload<TPayload>;
}>;`;
const transportStreamDef = `type TransportStream<TPayload = unknown> = AsyncIterable<TransportResponse<TPayload>>;`;

// Payload types
const connectPayloadDef = `type ConnectPayload = Readonly<{
  appId: string;
  requestedCapabilities: readonly ProtocolCapability[];
  appName?: string;
  appDescription?: string;
  appIcon?: string;
}>;`;
const chatSendPayloadDef = `type ChatSendPayload = Readonly<{
  messages: readonly ChatMessage[];
}>;`;
const chatSendResponsePayloadDef = `type ChatSendResponsePayload = Readonly<{
  message: ChatMessage;
}>;`;
const chatStreamPayloadDef = `type ChatStreamPayload = ChatSendPayload;`;
const chatStreamChunkPayloadDef = `type ChatStreamChunkPayload = Readonly<{ type: "chunk"; delta: string; index: number }>;`;
const chatStreamDonePayloadDef = `type ChatStreamDonePayload = Readonly<{ type: "done" }>;`;

// Tool types
const toolParameterSchemaDef = `type ToolParameterSchema = Readonly<{
  type: "object";
  properties?: Readonly<Record<string, Readonly<{
    type: string;
    description?: string;
    enum?: readonly string[];
  }>>>;
  required?: readonly string[];
}>;`;
const toolDefinitionDef = `type ToolDefinition = Readonly<{
  name: string;
  description: string;
  parameters?: ToolParameterSchema;
  handler?: (args: Record<string, unknown>) => Promise<string> | string;
}>;`;
const toolCallDef = `type ToolCall = Readonly<{
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  matchRange: Readonly<{ start: number; end: number }>;
}>;`;
const toolResultDef = `type ToolResult = Readonly<{
  toolCallId: string;
  name: string;
  result: string;
}>;`;
const toolCallEventDef = `type ToolCallEvent = Readonly<{
  type: "tool_call";
  toolCallId: string;
  name: string;
  arguments: Record<string, unknown>;
  matchRange: Readonly<{ start: number; end: number }>;
}>;`;
const toolResultEventDef = `type ToolResultEvent = Readonly<{
  type: "tool_result";
  toolCallId: string;
  name: string;
  result: string;
}>;`;
const toolPrimingStartDef = `type ToolPrimingStartEvent = Readonly<{ type: "tool_priming_start"; message: string }>;`;
const toolPrimingMatchDef = `type ToolPrimingMatchEvent = Readonly<{ type: "tool_priming_match"; tools: readonly string[] }>;`;
const toolPrimingEndDef = `type ToolPrimingEndEvent = Readonly<{ type: "tool_priming_end" }>;`;
const conversationStreamEventDef = `type ConversationStreamEvent =
  | ChatStreamEvent
  | ToolCallEvent
  | ToolResultEvent
  | ToolPrimingStartEvent
  | ToolPrimingMatchEvent
  | ToolPrimingEndEvent;`;

// ID types
const idTypesDef = `type RequestId = string;
type CorrelationId = string;
type SessionId = string;`;

export default function WebSDKTypes() {
  return (
    <Stack gap="lg">
      <Title order={2}>Types</Title>
      <Text>
        All types exported from <InlineCode>@byom-ai/web-sdk</InlineCode>.
      </Text>

      <CodeBlock code={importLine} language="tsx" />

      {/* Core types */}
      <Divider />
      <Title order={3}>Core types</Title>

      <Title order={4}>ChatRole</Title>
      <CodeBlock code={chatRoleDef} language="tsx" />

      <Title order={4}>ChatMessage</Title>
      <CodeBlock code={chatMessageDef} language="tsx" />

      <Title order={4}>ClientState</Title>
      <CodeBlock code={clientStateDef} language="tsx" />

      <Title order={4}>ChatInput</Title>
      <CodeBlock code={chatInputDef} language="tsx" />

      <Title order={4}>ChatOperationOptions</Title>
      <CodeBlock code={chatOperationOptionsDef} language="tsx" />

      <Title order={4}>ChatStreamEvent</Title>
      <CodeBlock code={chatStreamEventDef} language="tsx" />

      <Title order={4}>ChatSendResult</Title>
      <CodeBlock code={chatSendResultDef} language="tsx" />

      <Title order={4}>ID types</Title>
      <CodeBlock code={idTypesDef} language="tsx" />

      {/* Connection types */}
      <Divider />
      <Title order={3}>Connection types</Title>

      <Title order={4}>ConnectOptions</Title>
      <CodeBlock code={connectOptionsDef} language="tsx" />

      <Title order={4}>ConnectResult</Title>
      <CodeBlock code={connectResultDef} language="tsx" />

      {/* Provider types */}
      <Divider />
      <Title order={3}>Provider types</Title>

      <Title order={4}>ProviderDescriptor</Title>
      <CodeBlock code={providerDescriptorDef} language="tsx" />

      <Title order={4}>SelectProviderInput</Title>
      <CodeBlock code={selectProviderInputDef} language="tsx" />

      <Title order={4}>SelectProviderResult</Title>
      <CodeBlock code={selectProviderResultDef} language="tsx" />

      <Title order={4}>ListProvidersResult</Title>
      <CodeBlock code={listProvidersResultDef} language="tsx" />

      {/* Transport types */}
      <Divider />
      <Title order={3}>Transport types</Title>

      <CodeBlock code={transportImport} language="tsx" />

      <Title order={4}>BYOMTransport</Title>
      <CodeBlock code={transportDef} language="tsx" />

      <Title order={4}>TransportRequest</Title>
      <CodeBlock code={transportRequestDef} language="tsx" />

      <Title order={4}>TransportResponse</Title>
      <CodeBlock code={transportResponseDef} language="tsx" />

      <Title order={4}>TransportStream</Title>
      <CodeBlock code={transportStreamDef} language="tsx" />

      {/* Payload types */}
      <Divider />
      <Title order={3}>Payload types</Title>

      <Title order={4}>ConnectPayload</Title>
      <CodeBlock code={connectPayloadDef} language="tsx" />

      <Title order={4}>ChatSendPayload</Title>
      <CodeBlock code={chatSendPayloadDef} language="tsx" />

      <Title order={4}>ChatSendResponsePayload</Title>
      <CodeBlock code={chatSendResponsePayloadDef} language="tsx" />

      <Title order={4}>ChatStreamPayload</Title>
      <CodeBlock code={chatStreamPayloadDef} language="tsx" />

      <Title order={4}>ChatStreamChunkPayload / ChatStreamDonePayload</Title>
      <CodeBlock code={chatStreamChunkPayloadDef} language="tsx" />
      <CodeBlock code={chatStreamDonePayloadDef} language="tsx" />

      {/* Tool types */}
      <Divider />
      <Title order={3}>Tool types</Title>

      <CodeBlock code={toolImport} language="tsx" />

      <Title order={4}>ToolParameterSchema</Title>
      <CodeBlock code={toolParameterSchemaDef} language="tsx" />

      <Title order={4}>ToolDefinition</Title>
      <CodeBlock code={toolDefinitionDef} language="tsx" />

      <Title order={4}>ToolCall</Title>
      <CodeBlock code={toolCallDef} language="tsx" />

      <Title order={4}>ToolResult</Title>
      <CodeBlock code={toolResultDef} language="tsx" />

      <Title order={4}>ToolCallEvent</Title>
      <CodeBlock code={toolCallEventDef} language="tsx" />

      <Title order={4}>ToolResultEvent</Title>
      <CodeBlock code={toolResultEventDef} language="tsx" />

      <Title order={4}>ToolPrimingStartEvent</Title>
      <CodeBlock code={toolPrimingStartDef} language="tsx" />

      <Title order={4}>ToolPrimingMatchEvent</Title>
      <CodeBlock code={toolPrimingMatchDef} language="tsx" />

      <Title order={4}>ToolPrimingEndEvent</Title>
      <CodeBlock code={toolPrimingEndDef} language="tsx" />

      <Title order={4}>ConversationStreamEvent</Title>
      <CodeBlock code={conversationStreamEventDef} language="tsx" />
    </Stack>
  );
}
