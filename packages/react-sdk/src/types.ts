"use client";

import type {
    ChatMessage as WebSDKChatMessage,
    ChatRole as WebSDKChatRole,
    ClientState as WebSDKClientState,
    ContextWindowInfo as WebSDKContextWindowInfo,
    ProviderDescriptor as WebSDKProviderDescriptor,
    SelectProviderInput as WebSDKSelectProviderInput,
    ChatOperationOptions as WebSDKChatOperationOptions,
    ChatStreamEvent as WebSDKChatStreamEvent,
} from "@arlopass/web-sdk";

import type {
    ArlopassSDKError as WebSDKArlopassSDKError,
    ArlopassStateError as WebSDKArlopassStateError,
} from "@arlopass/web-sdk";

import type { ArlopassTransport as WebSDKArlopassTransport } from "@arlopass/web-sdk";

import type {
    ToolDefinition as WebSDKToolDefinition,
    ConversationStreamEvent as WebSDKConversationStreamEvent,
    ToolCall as WebSDKToolCall,
    ToolResult as WebSDKToolResult,
    ToolCallEvent as WebSDKToolCallEvent,
    ToolResultEvent as WebSDKToolResultEvent,
} from "@arlopass/web-sdk";

import type {
    ToolPrimingStartEvent as WebSDKToolPrimingStartEvent,
    ToolPrimingMatchEvent as WebSDKToolPrimingMatchEvent,
    ToolPrimingEndEvent as WebSDKToolPrimingEndEvent,
} from "@arlopass/web-sdk";

// Re-export web-sdk types so developers only need @arlopass/react
export type ChatMessage = WebSDKChatMessage;
export type ChatRole = WebSDKChatRole;
export type ClientState = WebSDKClientState;
export type ProviderDescriptor = WebSDKProviderDescriptor;
export type SelectProviderInput = WebSDKSelectProviderInput;
export type ChatOperationOptions = WebSDKChatOperationOptions;
export type ChatStreamEvent = WebSDKChatStreamEvent;
export type ContextWindowInfo = WebSDKContextWindowInfo;
export type { WebSDKArlopassSDKError as ArlopassSDKError };
export type { WebSDKArlopassStateError as ArlopassStateError };
export type { WebSDKArlopassTransport as ArlopassTransport };
export type { WebSDKToolDefinition as ToolDefinition };
export type { WebSDKConversationStreamEvent as ConversationStreamEvent };
export type { WebSDKToolCall as ToolCall };
export type { WebSDKToolResult as ToolResult };
export type { WebSDKToolCallEvent as ToolCallEvent };
export type { WebSDKToolResultEvent as ToolResultEvent };
export type { WebSDKToolPrimingStartEvent as ToolPrimingStartEvent };
export type { WebSDKToolPrimingMatchEvent as ToolPrimingMatchEvent };
export type { WebSDKToolPrimingEndEvent as ToolPrimingEndEvent };

// React SDK specific types

export type MessageId = string;

export type ToolCallInfo = Readonly<{
    toolCallId: string;
    name: string;
    arguments: Record<string, unknown>;
    result?: string;
    status: "pending" | "executing" | "complete" | "error";
}>;

export type TrackedChatMessage = Readonly<{
    id: MessageId;
    role: ChatRole;
    content: string;
    inResponseTo?: MessageId;
    status: "pending" | "streaming" | "complete" | "error";
    pinned: boolean;
    toolCalls?: readonly ToolCallInfo[];
}>;

export type SubscriptionEvent =
    | "response"
    | "stream"
    | "error"
    | "tool_call"
    | "tool_result"
    | "tool_priming_start"
    | "tool_priming_match"
    | "tool_priming_end";

export type ChatSubscribe = {
    (
        event: "response",
        messageId: MessageId,
        handler: (msg: TrackedChatMessage) => void,
    ): () => void;
    (
        event: "response",
        handler: (msg: TrackedChatMessage) => void,
    ): () => void;
    (
        event: "stream",
        messageId: MessageId,
        handler: (delta: string, accumulated: string) => void,
    ): () => void;
    (
        event: "error",
        handler: (
            error: WebSDKArlopassSDKError,
            messageId: MessageId | null,
        ) => void,
    ): () => void;
    (
        event: "error",
        messageId: MessageId,
        handler: (error: WebSDKArlopassSDKError) => void,
    ): () => void;
    (
        event: "tool_call",
        handler: (
            toolCallId: string,
            name: string,
            args: Record<string, unknown>,
            messageId: MessageId,
        ) => void,
    ): () => void;
    (
        event: "tool_call",
        messageId: MessageId,
        handler: (
            toolCallId: string,
            name: string,
            args: Record<string, unknown>,
        ) => void,
    ): () => void;
    (
        event: "tool_result",
        handler: (
            toolCallId: string,
            name: string,
            result: string,
            messageId: MessageId,
        ) => void,
    ): () => void;
    (
        event: "tool_result",
        messageId: MessageId,
        handler: (toolCallId: string, name: string, result: string) => void,
    ): () => void;
    (
        event: "tool_priming_start",
        handler: (message: string) => void,
    ): () => void;
    (
        event: "tool_priming_match",
        handler: (tools: readonly string[]) => void,
    ): () => void;
    (
        event: "tool_priming_end",
        handler: () => void,
    ): () => void;
};

export type ArlopassProviderProps = Readonly<{
    /** Full appId. Auto-derived from origin if omitted. */
    appId?: string;
    /** Suffix appended to the auto-derived domain prefix. Ignored if appId is set. */
    appSuffix?: string;
    /** Human-readable app name. */
    appName?: string;
    /** Short app description. */
    appDescription?: string;
    /** URL to square icon/logo (https:// or data: URI). */
    appIcon?: string;
    defaultProvider?: string;
    defaultModel?: string;
    autoConnect?: boolean;
    onError?: (error: WebSDKArlopassSDKError) => void;
    children: React.ReactNode;
}>;

// Restricted subscribe type for useChat (no tool events)
export type ChatSubscribeNoTools = {
    (
        event: "response",
        messageId: MessageId,
        handler: (msg: TrackedChatMessage) => void,
    ): () => void;
    (
        event: "response",
        handler: (msg: TrackedChatMessage) => void,
    ): () => void;
    (
        event: "stream",
        messageId: MessageId,
        handler: (delta: string, accumulated: string) => void,
    ): () => void;
    (
        event: "error",
        handler: (
            error: WebSDKArlopassSDKError,
            messageId: MessageId | null,
        ) => void,
    ): () => void;
    (
        event: "error",
        messageId: MessageId,
        handler: (error: WebSDKArlopassSDKError) => void,
    ): () => void;
};
