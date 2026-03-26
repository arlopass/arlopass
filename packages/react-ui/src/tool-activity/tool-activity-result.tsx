"use client";

import { type HTMLAttributes, type Ref } from "react";
import type { ToolCallInfo } from "../types.js";
import { createForwardRef } from "../utils/forward-ref.js";

type ToolActivityResultProps = HTMLAttributes<HTMLDivElement> & {
  toolCall: ToolCallInfo;
};

export const Result = createForwardRef<HTMLDivElement, ToolActivityResultProps>(
  "ToolActivity.Result",
  ({ toolCall, ...rest }, ref: Ref<HTMLDivElement>) => {
    return (
      <div
        ref={ref}
        data-status={toolCall.status}
        {...rest}
      >
        {toolCall.result ?? null}
      </div>
    );
  },
);
