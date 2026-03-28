"use client";

import { type HTMLAttributes, type ReactNode } from "react";
import type { TrackedChatMessage } from "../types.js";
import { createForwardRef } from "../utils/forward-ref.js";
import { useAutoScroll } from "../utils/use-auto-scroll.js";
import { useChatContext } from "./chat-context.js";

type ChatMessagesProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  children: (messages: readonly TrackedChatMessage[]) => ReactNode;
};

export const Messages = createForwardRef<HTMLDivElement, ChatMessagesProps>(
  "Chat.Messages",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- ref is managed internally by useAutoScroll
  ({ children, ...rest }, _forwardedRef) => {
    const { messages, streamingContent, isStreaming } =
      useChatContext("Chat.Messages");
    const { ref } = useAutoScroll<HTMLDivElement>(
      [messages.length, streamingContent],
      isStreaming,
    );

    return (
      <div
        ref={ref}
        role="log"
        aria-live="polite"
        data-state={messages.length === 0 ? "empty" : "filled"}
        {...rest}
      >
        {children(messages)}
      </div>
    );
  },
);
