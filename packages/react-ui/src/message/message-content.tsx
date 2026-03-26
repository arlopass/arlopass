"use client";

import { type HTMLAttributes, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useMessageContext } from "./message-context.js";

type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const Content = createForwardRef<HTMLDivElement, MessageContentProps>(
  "Message.Content",
  (props, ref: Ref<HTMLDivElement>) => {
    const { message } = useMessageContext("Message.Content");

    return (
      <div ref={ref} data-role={message.role} {...props}>
        {message.content}
      </div>
    );
  },
);
