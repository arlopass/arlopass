"use client";

import { type HTMLAttributes, type ReactNode, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useMessageContext } from "./chat-message.js";

type ChatBubbleProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
};

export const Bubble = createForwardRef<HTMLDivElement, ChatBubbleProps>(
  "Chat.Bubble",
  ({ children, ...rest }, ref: Ref<HTMLDivElement>) => {
    const { message } = useMessageContext("Chat.Bubble");

    return (
      <div
        ref={ref}
        data-part="bubble"
        data-role={message.role}
        data-status={message.status}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
