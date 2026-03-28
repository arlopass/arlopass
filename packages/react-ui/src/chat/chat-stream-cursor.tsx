"use client";

import { type HTMLAttributes, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useChatContext } from "./chat-context.js";

type ChatStreamCursorProps = HTMLAttributes<HTMLSpanElement>;

export const StreamCursor = createForwardRef<
  HTMLSpanElement,
  ChatStreamCursorProps
>("Chat.StreamCursor", (props, ref: Ref<HTMLSpanElement>) => {
  const { isStreaming, streamingContent } = useChatContext("Chat.StreamCursor");

  if (!isStreaming || streamingContent.trim().length === 0) return null;

  return (
    <span
      ref={ref}
      data-part="stream-cursor"
      data-state="streaming"
      {...props}
    />
  );
});
