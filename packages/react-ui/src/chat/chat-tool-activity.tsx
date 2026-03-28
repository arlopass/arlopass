"use client";

import { type HTMLAttributes, type ReactNode, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useChatContext } from "./chat-context.js";

type ChatToolActivityProps = HTMLAttributes<HTMLDivElement> & {
  formatToolName?: (name: string) => string;
  children?: ReactNode;
};

const defaultFormatToolName = (name: string) => name.replace(/_/g, " ");

export const ToolActivity = createForwardRef<
  HTMLDivElement,
  ChatToolActivityProps
>(
  "Chat.ToolActivity",
  (
    { formatToolName = defaultFormatToolName, children, ...rest },
    ref: Ref<HTMLDivElement>,
  ) => {
    const { isStreaming, toolActivity } = useChatContext("Chat.ToolActivity");

    if (!isStreaming || toolActivity.phase === "idle") return null;

    return (
      <div
        ref={ref}
        data-part="tool-activity"
        data-phase={toolActivity.phase}
        {...rest}
      >
        {toolActivity.phase === "priming" && (
          <span data-part="tool-activity-label">
            {children ?? "Looking for tools\u2026"}
          </span>
        )}
        {toolActivity.phase === "matched" && (
          <>
            {toolActivity.tools.map((tool) => (
              <span key={tool} data-part="tool-activity-match">
                {formatToolName(tool)}
              </span>
            ))}
          </>
        )}
        {toolActivity.phase === "executing" && (
          <>
            <span data-part="tool-activity-name">
              {formatToolName(toolActivity.name)}
            </span>
            {toolActivity.arguments &&
              Object.keys(toolActivity.arguments).length > 0 && (
                <span data-part="tool-activity-detail">
                  {String(Object.values(toolActivity.arguments)[0])}
                </span>
              )}
          </>
        )}
        {toolActivity.phase === "result" && (
          <>
            <span data-part="tool-activity-check">{"\u2713"}</span>
            <span data-part="tool-activity-name">
              {formatToolName(toolActivity.name)}
            </span>
            <span data-part="tool-activity-status">done</span>
          </>
        )}
      </div>
    );
  },
);
