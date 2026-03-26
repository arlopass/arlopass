"use client";

import { createComponentContext } from "../utils/create-context.js";
import type { TrackedChatMessage, MessageId, BYOMSDKError } from "../types.js";

export type ChatContextValue = {
  messages: readonly TrackedChatMessage[];
  streamingContent: string;
  streamingMessageId: MessageId | null;
  isStreaming: boolean;
  isSending: boolean;
  error: BYOMSDKError | null;
  send: (content: string) => Promise<MessageId>;
  stream: (content: string) => Promise<MessageId>;
  stop: () => void;
  clearMessages: () => void;
  inputValue: string;
  setInputValue: (value: string) => void;
};

export const [ChatProvider, useChatContext] =
  createComponentContext<ChatContextValue>("Chat");
