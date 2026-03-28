"use client";

import { type HTMLAttributes, type ReactNode, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";

type ChatHeaderProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
};

export const Header = createForwardRef<HTMLDivElement, ChatHeaderProps>(
  "Chat.Header",
  ({ children, ...rest }, ref: Ref<HTMLDivElement>) => {
    return (
      <div ref={ref} data-part="header" {...rest}>
        {children}
      </div>
    );
  },
);
