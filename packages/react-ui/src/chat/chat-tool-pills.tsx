"use client";

import { type HTMLAttributes, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useMessageContext } from "./chat-message.js";

type ChatToolPillsProps = HTMLAttributes<HTMLDivElement> & {
  formatToolName?: (name: string) => string;
};

const defaultFormatToolName = (name: string) => name.replace(/_/g, " ");

export const ToolPills = createForwardRef<HTMLDivElement, ChatToolPillsProps>(
  "Chat.ToolPills",
  (
    { formatToolName = defaultFormatToolName, ...rest },
    ref: Ref<HTMLDivElement>,
  ) => {
    const { message } = useMessageContext("Chat.ToolPills");

    if (message.role !== "assistant" || !message.usedTools?.length) return null;

    return (
      <div ref={ref} data-part="tool-pills" {...rest}>
        {message.usedTools.map((tool) => (
          <span key={tool} data-part="tool-pill">
            {formatToolName(tool)}
          </span>
        ))}
      </div>
    );
  },
);
