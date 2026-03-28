"use client";

import { type HTMLAttributes, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useChatContext } from "./chat-context.js";

type ChatContextBarProps = HTMLAttributes<HTMLDivElement> & {
  formatTokens?: (n: number) => string;
};

const defaultFormatTokens = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}k`
      : String(n);

export const ContextBar = createForwardRef<HTMLDivElement, ChatContextBarProps>(
  "Chat.ContextBar",
  (
    { formatTokens = defaultFormatTokens, ...rest },
    ref: Ref<HTMLDivElement>,
  ) => {
    const { contextInfo } = useChatContext("Chat.ContextBar");

    if (contextInfo.maxTokens <= 0) return null;

    const pct = Math.round(contextInfo.usageRatio * 100);
    const usage = pct > 90 ? "critical" : pct > 70 ? "warning" : "normal";

    return (
      <div ref={ref} data-part="context-bar" data-usage={usage} {...rest}>
        <span data-part="context-used">
          {formatTokens(contextInfo.usedTokens)}
        </span>
        <span data-part="context-separator">/</span>
        <span data-part="context-max">
          {formatTokens(contextInfo.maxTokens)}
        </span>
        <span data-part="context-percent">({pct}%)</span>
      </div>
    );
  },
);
