"use client";

import { useState } from "react";
import { ArlopassProvider } from "@arlopass/react";
import { ArlopassChatReadyGate } from "@arlopass/react/guards";
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
        <div className="w-[400px] h-[600px] rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Chat
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>
          <ArlopassProvider>
            <ArlopassChatReadyGate
              fallback={
                <div className="flex-1 flex items-center justify-center text-sm text-zinc-400">
                  Connecting…
                </div>
              }
            >
              <ArlopassChat {...chatProps} className="flex-1" />
            </ArlopassChatReadyGate>
          </ArlopassProvider>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-full bg-blue-600 px-5 py-3 text-white font-medium shadow-lg hover:bg-blue-700 transition-colors"
        aria-label={open ? "Close chat" : "Open chat"}
      >
        {open ? "✕" : buttonLabel}
      </button>
    </div>
  );
}
