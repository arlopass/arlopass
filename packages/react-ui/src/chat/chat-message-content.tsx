"use client";

import { type HTMLAttributes, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useMessageContext } from "./chat-message.js";

type ChatMessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = createForwardRef<
  HTMLDivElement,
  ChatMessageContentProps
>("Chat.MessageContent", (props, ref: Ref<HTMLDivElement>) => {
  const { message } = useMessageContext("Chat.MessageContent");

  return (
    <div ref={ref} data-role={message.role} {...props}>
      {message.content}
    </div>
  );
});
