"use client";

import { type HTMLAttributes, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";

type ChatScrollFadeProps = HTMLAttributes<HTMLDivElement> & {
  visible?: boolean;
};

export const ScrollFade = createForwardRef<HTMLDivElement, ChatScrollFadeProps>(
  "Chat.ScrollFade",
  ({ visible, ...rest }, ref: Ref<HTMLDivElement>) => {
    return (
      <div
        ref={ref}
        data-part="scroll-fade"
        data-state={visible ? "visible" : "hidden"}
        aria-hidden="true"
        {...rest}
      />
    );
  },
);
