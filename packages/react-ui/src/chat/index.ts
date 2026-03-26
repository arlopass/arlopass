"use client";

import { Root } from "./chat-root.js";
import { Messages } from "./chat-messages.js";
import { Message } from "./chat-message.js";
import { MessageContent } from "./chat-message-content.js";
import { Input } from "./chat-input.js";
import { SendButton } from "./chat-send-button.js";
import { StopButton } from "./chat-stop-button.js";
import { StreamingIndicator } from "./chat-streaming-indicator.js";
import { EmptyState } from "./chat-empty-state.js";

export const Chat = {
  Root,
  Messages,
  Message,
  MessageContent,
  Input,
  SendButton,
  StopButton,
  StreamingIndicator,
  EmptyState,
} as const;
