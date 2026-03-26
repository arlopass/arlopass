"use client";

import { type HTMLAttributes, type ReactNode, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useChatContext } from "./chat-context.js";

type ChatEmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
};

export const EmptyState = createForwardRef<HTMLDivElement, ChatEmptyStateProps>(
  "Chat.EmptyState",
  ({ children, ...rest }, ref: Ref<HTMLDivElement>) => {
    const { messages } = useChatContext("Chat.EmptyState");

    if (messages.length > 0) return null;

    return (
      <div ref={ref} {...rest}>
        {children}
      </div>
    );
  },
);
