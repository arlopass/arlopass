"use client";

import { type ButtonHTMLAttributes, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useChatContext } from "./chat-context.js";

type ChatSendButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const SendButton = createForwardRef<
  HTMLButtonElement,
  ChatSendButtonProps
>("Chat.SendButton", (props, ref: Ref<HTMLButtonElement>) => {
  const { inputValue, setInputValue, stream, isStreaming, isSending } =
    useChatContext("Chat.SendButton");

  const busy = isStreaming || isSending;
  const disabled = !inputValue.trim() || busy;

  const dataState = isStreaming ? "streaming" : busy || !inputValue.trim() ? "disabled" : "idle";

  const handleClick = () => {
    if (disabled) return;
    const value = inputValue;
    setInputValue("");
    stream(value);
  };

  return (
    <button
      ref={ref}
      type="button"
      aria-label="Send message"
      disabled={disabled}
      data-state={dataState}
      onClick={handleClick}
      {...props}
    />
  );
});
