"use client";

import { type HTMLAttributes, type ReactNode, type Ref } from "react";
import type { ToolCallInfo } from "../types.js";
import { createForwardRef } from "../utils/forward-ref.js";

type ToolActivityCallProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  toolCall: ToolCallInfo;
  children?: ((toolCall: ToolCallInfo) => ReactNode) | ReactNode;
};

export const Call = createForwardRef<HTMLDivElement, ToolActivityCallProps>(
  "ToolActivity.Call",
  ({ toolCall, children, ...rest }, ref: Ref<HTMLDivElement>) => {
    return (
      <div
        ref={ref}
        data-status={toolCall.status}
        {...rest}
      >
        {typeof children === "function"
          ? children(toolCall)
          : children ?? toolCall.name}
      </div>
    );
  },
);
