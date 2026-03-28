"use client";

import { type HTMLAttributes, type ReactNode, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";

type ChatAvatarProps = HTMLAttributes<HTMLDivElement> & {
  role: "user" | "assistant";
  children?: ReactNode;
};

export const Avatar = createForwardRef<HTMLDivElement, ChatAvatarProps>(
  "Chat.Avatar",
  ({ role, children, ...rest }, ref: Ref<HTMLDivElement>) => {
    return (
      <div ref={ref} data-part="avatar" data-role={role} {...rest}>
        {children}
      </div>
    );
  },
);
