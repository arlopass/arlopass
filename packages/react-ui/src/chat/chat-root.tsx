"use client";

import {
  useState,
  useMemo,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { useConversation } from "@byom-ai/react";
import type {
  TrackedChatMessage,
  MessageId,
  BYOMSDKError,
  ToolDefinition,
} from "../types.js";
import { createForwardRef } from "../utils/forward-ref.js";
import { ChatProvider, type ChatContextValue } from "./chat-context.js";

type UncontrolledProps = {
  systemPrompt?: string;
  tools?: ToolDefinition[];
  maxTokens?: number;
  maxToolRounds?: number;
  primeTools?: boolean;
  hideToolCalls?: boolean;
  initialMessages?: TrackedChatMessage[];
};

type ControlledProps = {
  messages: readonly TrackedChatMessage[];
  streamingContent?: string;
  streamingMessageId?: MessageId | null;
  isStreaming?: boolean;
  isSending?: boolean;
  onSend?: (content: string) => Promise<MessageId>;
  onStop?: () => void;
  error?: BYOMSDKError | null;
};

type ChatRootProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> &
  UncontrolledProps &
  Partial<ControlledProps> & {
    children: ReactNode;
  };

function getDataState(error: BYOMSDKError | null, isStreaming: boolean, isSending: boolean): string {
  if (error) return "error";
  if (isStreaming) return "streaming";
  if (isSending) return "sending";
  return "idle";
}

export const Root = createForwardRef<HTMLDivElement, ChatRootProps>(
  "Chat.Root",
  (
    {
      // Uncontrolled props
      systemPrompt,
      tools,
      maxTokens,
      maxToolRounds,
      primeTools,
      hideToolCalls,
      initialMessages,
      // Controlled props
      messages: messagesProp,
      streamingContent: streamingContentProp,
      streamingMessageId: streamingMessageIdProp,
      isStreaming: isStreamingProp,
      isSending: isSendingProp,
      onSend,
      onStop,
      error: errorProp,
      // Children & rest
      children,
      ...rest
    },
    ref: Ref<HTMLDivElement>,
  ) => {
    const hookOptions = useMemo(() => {
      const opts: Record<string, unknown> = {};
      if (systemPrompt !== undefined) opts.systemPrompt = systemPrompt;
      if (tools !== undefined) opts.tools = tools;
      if (maxTokens !== undefined) opts.maxTokens = maxTokens;
      if (maxToolRounds !== undefined) opts.maxToolRounds = maxToolRounds;
      if (primeTools !== undefined) opts.primeTools = primeTools;
      if (hideToolCalls !== undefined) opts.hideToolCalls = hideToolCalls;
      if (initialMessages !== undefined) opts.initialMessages = initialMessages;
      return opts as Parameters<typeof useConversation>[0];
    }, [systemPrompt, tools, maxTokens, maxToolRounds, primeTools, hideToolCalls, initialMessages]);

    const hook = useConversation(hookOptions);

    const isControlled = messagesProp !== undefined;

    const messages = isControlled ? messagesProp : hook.messages;
    const streamingContent = isControlled
      ? (streamingContentProp ?? "")
      : hook.streamingContent;
    const streamingMessageId = isControlled
      ? (streamingMessageIdProp ?? null)
      : hook.streamingMessageId;
    const isStreaming = isControlled
      ? (isStreamingProp ?? false)
      : hook.isStreaming;
    const isSending = isControlled
      ? (isSendingProp ?? false)
      : hook.isSending;
    const error = isControlled ? (errorProp ?? null) : hook.error;

    const send = isControlled
      ? (onSend ?? (async () => "" as MessageId))
      : hook.send;
    const stream = isControlled
      ? (onSend ?? (async () => "" as MessageId))
      : hook.stream;
    const stop = isControlled ? (onStop ?? (() => {})) : hook.stop;
    const clearMessages = isControlled ? (() => {}) : hook.clearMessages;

    const [inputValue, setInputValue] = useState("");

    const contextValue = useMemo<ChatContextValue>(
      () => ({
        messages,
        streamingContent,
        streamingMessageId,
        isStreaming,
        isSending,
        error,
        send,
        stream,
        stop,
        clearMessages,
        inputValue,
        setInputValue,
      }),
      [
        messages,
        streamingContent,
        streamingMessageId,
        isStreaming,
        isSending,
        error,
        send,
        stream,
        stop,
        clearMessages,
        inputValue,
      ],
    );

    return (
      <div
        ref={ref}
        data-state={getDataState(error, isStreaming, isSending)}
        {...rest}
      >
        <ChatProvider value={contextValue}>{children}</ChatProvider>
      </div>
    );
  },
);
