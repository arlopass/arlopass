"use client";

import { type HTMLAttributes, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useChatContext } from "./chat-context.js";

type ChatStreamingIndicatorProps = HTMLAttributes<HTMLDivElement>;

export const StreamingIndicator = createForwardRef<
  HTMLDivElement,
  ChatStreamingIndicatorProps
>("Chat.StreamingIndicator", (props, ref: Ref<HTMLDivElement>) => {
  const { streamingContent, isStreaming } =
    useChatContext("Chat.StreamingIndicator");

  if (!isStreaming) return null;

  return (
    <div ref={ref} data-state="streaming" {...props}>
      {streamingContent}
      {"\u258C"}
    </div>
  );
});
