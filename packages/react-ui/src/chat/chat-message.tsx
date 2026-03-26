"use client";

import { type HTMLAttributes, type ReactNode, type Ref } from "react";
import type { TrackedChatMessage } from "../types.js";
import { createComponentContext } from "../utils/create-context.js";
import { createForwardRef } from "../utils/forward-ref.js";

export type MessageContextValue = {
  message: TrackedChatMessage;
};

export const [MessageProvider, useMessageContext] =
  createComponentContext<MessageContextValue>("Chat.Message");

type ChatMessageProps = HTMLAttributes<HTMLDivElement> & {
  message: TrackedChatMessage;
  children?: ReactNode;
};

export const Message = createForwardRef<HTMLDivElement, ChatMessageProps>(
  "Chat.Message",
  ({ message, children, ...rest }, ref: Ref<HTMLDivElement>) => {
    return (
      <MessageProvider value={{ message }}>
        <div
          ref={ref}
          data-role={message.role}
          data-status={message.status}
          {...rest}
        >
          {children}
        </div>
      </MessageProvider>
    );
  },
);
