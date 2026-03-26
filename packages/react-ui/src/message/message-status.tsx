"use client";

import { type HTMLAttributes, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useMessageContext } from "./message-context.js";

type MessageStatusProps = HTMLAttributes<HTMLSpanElement>;

export const Status = createForwardRef<HTMLSpanElement, MessageStatusProps>(
  "Message.Status",
  (props, ref: Ref<HTMLSpanElement>) => {
    const { message } = useMessageContext("Message.Status");

    return (
      <span ref={ref} data-status={message.status} {...props}>
        {message.status}
      </span>
    );
  },
);
