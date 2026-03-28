"use client";

import { createComponentContext } from "../utils/create-context.js";
import type { TrackedChatMessage, MessageId, ArlopassSDKError, ToolActivityState, ContextWindowInfo } from "../types.js";

export type ChatContextValue = {
  messages: readonly TrackedChatMessage[];
  streamingContent: string;
  streamingMessageId: MessageId | null;
  isStreaming: boolean;
  isSending: boolean;
  error: ArlopassSDKError | null;
  send: (content: string) => Promise<MessageId>;
  stream: (content: string) => Promise<MessageId>;
  stop: () => void;
  clearMessages: () => void;
  inputValue: string;
  setInputValue: (value: string) => void;
  toolActivity: ToolActivityState;
  contextInfo: ContextWindowInfo;
};

export const [ChatProvider, useChatContext] =
  createComponentContext<ChatContextValue>("Chat");
