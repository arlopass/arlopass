"use client";

import { type HTMLAttributes, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useChatContext } from "./chat-context.js";

type ChatTypingIndicatorProps = HTMLAttributes<HTMLDivElement> & {
  dotCount?: number;
};

export const TypingIndicator = createForwardRef<
  HTMLDivElement,
  ChatTypingIndicatorProps
>(
  "Chat.TypingIndicator",
  ({ dotCount = 3, ...rest }, ref: Ref<HTMLDivElement>) => {
    const { isStreaming, streamingContent } = useChatContext(
      "Chat.TypingIndicator",
    );

    if (!isStreaming || streamingContent.trim().length > 0) return null;

    return (
      <div
        ref={ref}
        data-part="typing-indicator"
        data-state="visible"
        {...rest}
      >
        {Array.from({ length: dotCount }, (_, i) => (
          <span
            key={i}
            data-part="typing-dot"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    );
  },
);
