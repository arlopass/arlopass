import type { ChatStreamEvent } from "./types.js";

/** JSON Schema subset for tool parameters. */
export type ToolParameterSchema = Readonly<{
  type: "object";
  properties?: Readonly<Record<string, Readonly<{
    type: string;
    description?: string;
    enum?: readonly string[];
  }>>>;
  required?: readonly string[];
}>;

/** A tool definition provided by the developer. */
export type ToolDefinition = Readonly<{
  name: string;
  description: string;
  parameters?: ToolParameterSchema;
  /** If provided, the SDK auto-executes this handler when the model calls the tool. */
  handler?: (args: Record<string, unknown>) => Promise<string> | string;
}>;

/** A parsed tool call from the model's response. */
export type ToolCall = Readonly<{
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** Character range in the original response where this tool call was matched. */
  matchRange: Readonly<{ start: number; end: number }>;
}>;

/** A result returned from a tool execution. */
export type ToolResult = Readonly<{
  toolCallId: string;
  name: string;
  result: string;
}>;

/** Yielded when the model requests a tool call. */
export type ToolCallEvent = Readonly<{
  type: "tool_call";
  toolCallId: string;
  name: string;
  arguments: Record<string, unknown>;
  /** Character range in the model's response where this call was detected. */
  matchRange: Readonly<{ start: number; end: number }>;
}>;

/** Yielded when a tool result is produced (auto or manual). */
export type ToolResultEvent = Readonly<{
  type: "tool_result";
  toolCallId: string;
  name: string;
  result: string;
}>;

/** Yielded when tool priming starts (model is being asked to select tools). */
export type ToolPrimingStartEvent = Readonly<{
  type: "tool_priming_start";
  message: string;
}>;

/** Yielded when priming identifies which tools are relevant. */
export type ToolPrimingMatchEvent = Readonly<{
  type: "tool_priming_match";
  tools: readonly string[];
}>;

/** Yielded when tool priming completes. */
export type ToolPrimingEndEvent = Readonly<{
  type: "tool_priming_end";
}>;

/** Extended event union for ConversationManager.stream(). */
export type ConversationStreamEvent =
  | ChatStreamEvent
  | ToolCallEvent
  | ToolResultEvent
  | ToolPrimingStartEvent
  | ToolPrimingMatchEvent
  | ToolPrimingEndEvent;
