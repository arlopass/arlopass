"use client";

import { type HTMLAttributes, type ReactNode, type Ref } from "react";
import type { TrackedChatMessage } from "../types.js";
import { createForwardRef } from "../utils/forward-ref.js";
import { MessageProvider } from "./message-context.js";

type MessageRootProps = HTMLAttributes<HTMLDivElement> & {
  message: TrackedChatMessage;
  children?: ReactNode;
};

export const Root = createForwardRef<HTMLDivElement, MessageRootProps>(
  "Message.Root",
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
