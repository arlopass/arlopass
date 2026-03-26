"use client";

import { useMemo, type HTMLAttributes, type ReactNode, type Ref } from "react";
import type { ToolCallInfo } from "../types.js";
import { createForwardRef } from "../utils/forward-ref.js";
import { ToolActivityProvider } from "./tool-activity-context.js";

type ToolActivityRootProps = HTMLAttributes<HTMLDivElement> & {
  toolCalls?: readonly ToolCallInfo[];
  children?: ReactNode;
};

export const Root = createForwardRef<HTMLDivElement, ToolActivityRootProps>(
  "ToolActivity.Root",
  ({ toolCalls, children, ...rest }, ref: Ref<HTMLDivElement>) => {
    const isActive = useMemo(
      () =>
        toolCalls != null &&
        toolCalls.some((tc) => tc.status !== "complete"),
      [toolCalls],
    );

    return (
      <ToolActivityProvider value={{ isActive }}>
        <div
          ref={ref}
          data-state={isActive ? "active" : "idle"}
          {...rest}
        >
          {children}
        </div>
      </ToolActivityProvider>
    );
  },
);
