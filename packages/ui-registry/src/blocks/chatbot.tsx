"use client";

import { useState } from "react";
import { ArlopassProvider } from "@arlopass/react";
import { ArlopassChat, type ArlopassChatProps } from "./chat";

export type ArlopassChatbotProps = ArlopassChatProps & {
  /** Label text for the toggle button */
  buttonLabel?: string;
  /** Position of the widget */
  position?: "bottom-right" | "bottom-left";
};

export function ArlopassChatbot({
  buttonLabel = "Chat",
  position = "bottom-right",
  ...chatProps
}: ArlopassChatbotProps) {
  const [open, setOpen] = useState(false);

  const positionClasses =
    position === "bottom-right" ? "right-4 bottom-4" : "left-4 bottom-4";

  return (
    <div
      className={`fixed ${positionClasses} z-50 flex flex-col items-end gap-3`}
    >
      {open && (
        <div className="w-[380px] h-[560px] rounded-xl shadow-2xl border border-stone-200 dark:border-stone-700/80 bg-stone-50 dark:bg-stone-900 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-stone-200 dark:border-stone-700/80">
            <span className="text-xs font-semibold text-stone-900 dark:text-stone-100">
              {chatProps.title ?? "Chat"}
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300 text-xs"
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>
          <ArlopassProvider>
            <ArlopassChat {...chatProps} className="flex-1" />
          </ArlopassProvider>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-full bg-stone-800 dark:bg-stone-200 px-5 py-3 text-white dark:text-stone-900 font-medium text-sm shadow-lg hover:bg-stone-700 dark:hover:bg-stone-300 transition-colors"
        aria-label={open ? "Close chat" : "Open chat"}
      >
        {open ? "✕" : buttonLabel}
      </button>
    </div>
  );
}
