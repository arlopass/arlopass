"use client";

import { type ButtonHTMLAttributes, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useChatContext } from "./chat-context.js";

type ChatStopButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const StopButton = createForwardRef<
  HTMLButtonElement,
  ChatStopButtonProps
>("Chat.StopButton", (props, ref: Ref<HTMLButtonElement>) => {
  const { stop, isStreaming } = useChatContext("Chat.StopButton");

  return (
    <button
      ref={ref}
      type="button"
      aria-label="Stop generation"
      aria-hidden={!isStreaming}
      data-state={isStreaming ? "visible" : "hidden"}
      onClick={() => stop()}
      {...props}
    />
  );
});
