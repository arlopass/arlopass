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
import { Header } from "./chat-header.js";
import { Avatar } from "./chat-avatar.js";
import { Bubble } from "./chat-bubble.js";
import { TypingIndicator } from "./chat-typing-indicator.js";
import { StreamCursor } from "./chat-stream-cursor.js";
import { MessageMeta } from "./chat-message-meta.js";
import { ToolPills } from "./chat-tool-pills.js";
import { Footer } from "./chat-footer.js";
import { ContextBar } from "./chat-context-bar.js";
import { ScrollFade } from "./chat-scroll-fade.js";
import { ToolActivity } from "./chat-tool-activity.js";

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
  Header,
  Avatar,
  Bubble,
  TypingIndicator,
  StreamCursor,
  MessageMeta,
  ToolPills,
  Footer,
  ContextBar,
  ScrollFade,
  ToolActivity,
} as const;
