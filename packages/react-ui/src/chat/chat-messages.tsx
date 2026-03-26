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
  ({ children, ...rest }, _ref) => {
    const { messages, streamingContent } = useChatContext("Chat.Messages");
    const { ref } = useAutoScroll<HTMLDivElement>([
      messages.length,
      streamingContent,
    ]);

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
