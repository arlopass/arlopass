"use client";

import { type HTMLAttributes, type ReactNode, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useMessageContext } from "./chat-message.js";

type ChatMessageMetaProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  children?: ReactNode;
};

export const MessageMeta = createForwardRef<
  HTMLDivElement,
  ChatMessageMetaProps
>("Chat.MessageMeta", ({ children, ...rest }, ref: Ref<HTMLDivElement>) => {
  const { message } = useMessageContext("Chat.MessageMeta");

  if (message.role !== "assistant") return null;

  return (
    <div ref={ref} data-part="message-meta" data-role={message.role} {...rest}>
      {children}
    </div>
  );
});
