"use client";

import {
  type TextareaHTMLAttributes,
  type KeyboardEvent,
  type Ref,
} from "react";
import { createForwardRef } from "../utils/forward-ref.js";
import { useChatContext } from "./chat-context.js";

type ChatInputProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "disabled"
>;

export const Input = createForwardRef<HTMLTextAreaElement, ChatInputProps>(
  "Chat.Input",
  (props, ref: Ref<HTMLTextAreaElement>) => {
    const { inputValue, setInputValue, stream, isStreaming, isSending, stop } =
      useChatContext("Chat.Input");

    const busy = isStreaming || isSending;

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        stop();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!busy && inputValue.trim()) {
          const value = inputValue;
          setInputValue("");
          stream(value);
        }
      }
      props.onKeyDown?.(e);
    };

    return (
      <textarea
        ref={ref}
        aria-label="Chat message"
        aria-disabled={busy}
        disabled={busy}
        data-state={busy ? "disabled" : "idle"}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        {...props}
      />
    );
  },
);
