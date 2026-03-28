"use client";

import { type HTMLAttributes, type ReactNode, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useChatContext } from "./chat-context.js";

type ChatFooterProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
};

export const Footer = createForwardRef<HTMLDivElement, ChatFooterProps>(
  "Chat.Footer",
  ({ children, ...rest }, ref: Ref<HTMLDivElement>) => {
    const { isStreaming } = useChatContext("Chat.Footer");

    return (
      <div
        ref={ref}
        data-part="footer"
        data-state={isStreaming ? "streaming" : "idle"}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
