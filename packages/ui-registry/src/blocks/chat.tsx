"use client";

import { useRef, useEffect, type ReactNode } from "react";
import { Chat, StreamingText, Message, ToolActivity } from "@byom-ai/react-ui";

export type BYOMChatProps = {
  /** System prompt for the conversation */
  systemPrompt?: string;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Content shown when there are no messages */
  emptyState?: ReactNode;
  /** Max tokens per response */
  maxTokens?: number;
  /** CSS class for the root element */
  className?: string;
};

export function BYOMChat({
  systemPrompt,
  placeholder = "Type a message…",
  emptyState,
  maxTokens,
  className,
}: BYOMChatProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  return (
    <Chat.Root
      systemPrompt={systemPrompt}
      maxTokens={maxTokens}
      className={`flex flex-col h-full ${className ?? ""}`}
    >
      <Chat.Messages className="flex-1 overflow-y-auto p-4 space-y-4">
        {(messages, streamingContent, streamingMessageId) => (
          <>
            {messages.length === 0 && !streamingContent && (
              <Chat.EmptyState className="flex items-center justify-center h-full text-zinc-400">
                {emptyState ?? <p>Send a message to get started.</p>}
              </Chat.EmptyState>
            )}

            {messages.map((msg) => (
              <Chat.Message key={msg.id} message={msg}>
                <Message.Root
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    }`}
                  >
                    <Message.Content className="prose prose-sm dark:prose-invert max-w-none" />

                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <ToolActivity.Root
                        toolCalls={msg.toolCalls}
                        className="mt-2 space-y-1"
                      >
                        <ToolActivity.Call className="text-xs opacity-70" />
                        <ToolActivity.Result className="text-xs opacity-60" />
                      </ToolActivity.Root>
                    )}
                  </div>
                </Message.Root>
              </Chat.Message>
            ))}

            {streamingContent && (
              <div className="flex gap-3 justify-start">
                <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                  <StreamingText
                    content={streamingContent}
                    className="prose prose-sm dark:prose-invert max-w-none"
                  />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
            <AutoScroll target={bottomRef} />
          </>
        )}
      </Chat.Messages>

      <Chat.StreamingIndicator className="px-4 py-1 text-xs text-zinc-400">
        AI is typing…
      </Chat.StreamingIndicator>

      <div className="border-t border-zinc-200 dark:border-zinc-700 p-4 flex gap-2">
        <Chat.Input
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Chat.SendButton className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          Send
        </Chat.SendButton>
        <Chat.StopButton className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600">
          Stop
        </Chat.StopButton>
      </div>
    </Chat.Root>
  );
}

function AutoScroll({ target }: { target: React.RefObject<HTMLDivElement | null> }) {
  useEffect(() => {
    target.current?.scrollIntoView({ behavior: "smooth" });
  });
  return null;
}
