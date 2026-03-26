"use client";

import { type HTMLAttributes, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";

type StreamingTextProps = HTMLAttributes<HTMLSpanElement> & {
  content: string;
  isStreaming: boolean;
  cursor?: string;
};

export const StreamingText = createForwardRef<HTMLSpanElement, StreamingTextProps>(
  "StreamingText",
  ({ content, isStreaming, cursor = "▌", ...rest }, ref: Ref<HTMLSpanElement>) => {
    return (
      <span
        ref={ref}
        data-state={isStreaming ? "streaming" : "idle"}
        {...rest}
      >
        {content}
        {isStreaming ? cursor : null}
      </span>
    );
  },
);
