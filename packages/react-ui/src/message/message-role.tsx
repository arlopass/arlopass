"use client";

import { type HTMLAttributes, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useMessageContext } from "./message-context.js";

const ROLE_LABELS: Record<string, string> = {
  user: "User",
  assistant: "Assistant",
  system: "System",
};

type MessageRoleProps = HTMLAttributes<HTMLSpanElement>;

export const Role = createForwardRef<HTMLSpanElement, MessageRoleProps>(
  "Message.Role",
  (props, ref: Ref<HTMLSpanElement>) => {
    const { message } = useMessageContext("Message.Role");

    return (
      <span ref={ref} data-role={message.role} {...props}>
        {ROLE_LABELS[message.role] ?? message.role}
      </span>
    );
  },
);
