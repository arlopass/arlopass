"use client";

import { type HTMLAttributes, type ReactNode, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useMessageContext } from "./message-context.js";

type MessageToolCallsProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
};

export const ToolCalls = createForwardRef<HTMLDivElement, MessageToolCallsProps>(
  "Message.ToolCalls",
  ({ children, ...rest }, ref: Ref<HTMLDivElement>) => {
    const { message } = useMessageContext("Message.ToolCalls");
    const hasTools = message.toolCalls != null && message.toolCalls.length > 0;

    return (
      <div
        ref={ref}
        data-state={hasTools ? "has-tools" : "empty"}
        {...rest}
      >
        {hasTools ? children : null}
      </div>
    );
  },
);
