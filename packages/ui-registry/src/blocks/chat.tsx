"use client";

import { useRef, useEffect, type ReactNode } from "react";
import { Chat, StreamingText, Message, ToolActivity } from "@arlopass/react-ui";
import { useProviders, useConnection } from "@arlopass/react";

// ─── Reusable sub-components ────────────────────────────────────────

/** Avatar circle for a chat message. */
export function ChatAvatar({
  role,
  label,
  className,
}: {
  role: "user" | "assistant" | string;
  label?: string | undefined;
  className?: string | undefined;
}) {
  const isUser = role === "user";
  return (
    <div
      className={`ap-chat-avatar w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[9px] ${
        isUser
          ? "bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400"
          : "bg-stone-200 dark:bg-stone-700 text-stone-500 dark:text-stone-400"
      } ${className ?? ""}`}
    >
      {label ?? (isUser ? "U" : "AI")}
    </div>
  );
}

/** Message bubble container. */
export function ChatBubble({
  role,
  children,
  className,
}: {
  role: "user" | "assistant" | string;
  children: ReactNode;
  className?: string | undefined;
}) {
  const isUser = role === "user";
  return (
    <div
      className={`ap-chat-bubble rounded-lg px-2.5 py-1.5 text-xs leading-relaxed max-w-[260px] break-words ${
        isUser
          ? "bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200"
          : "bg-stone-50 dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-600/20 text-stone-800 dark:text-stone-200"
      } ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

/** Tool-usage pills shown below assistant messages. */
export function ChatToolPills({ tools }: { tools: readonly string[] }) {
  if (tools.length === 0) return null;
  return (
    <div className="flex items-center gap-1 mt-1 ml-0.5">
      {tools.map((t) => (
        <span
          key={t}
          className="inline-block text-[9px] font-medium px-1.5 py-px rounded bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500"
        >
          {t.replace(/_/g, " ")}
        </span>
      ))}
    </div>
  );
}

/** Animated typing dots. */
export function ChatTypingDots({
  className,
}: {
  className?: string | undefined;
}) {
  return (
    <div className={`flex items-center gap-[3px] ${className ?? ""}`}>
      <span className="w-1 h-1 rounded-full bg-stone-400 dark:bg-stone-500 animate-bounce [animation-delay:0ms]" />
      <span className="w-1 h-1 rounded-full bg-stone-400 dark:bg-stone-500 animate-bounce [animation-delay:150ms]" />
      <span className="w-1 h-1 rounded-full bg-stone-400 dark:bg-stone-500 animate-bounce [animation-delay:300ms]" />
    </div>
  );
}

/** Pulsing streaming cursor. */
export function ChatStreamCursor() {
  return (
    <span className="inline-block w-0.5 h-3.5 bg-stone-400 dark:bg-stone-500 ml-0.5 align-middle animate-pulse" />
  );
}

/** Inline provider/model selector row. */
export function ChatProviderSelector({
  className,
}: {
  className?: string | undefined;
}) {
  const { providers, selectedProvider, selectProvider } = useProviders();

  if (providers.length === 0) return null;

  const currentProvider = providers.find(
    (p) => p.providerId === selectedProvider?.providerId,
  );

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <select
        value={selectedProvider?.providerId ?? ""}
        onChange={(e) => {
          const prov = providers.find((p) => p.providerId === e.target.value);
          const model = prov?.models[0];
          if (prov && model)
            void selectProvider({
              providerId: prov.providerId,
              modelId: model,
            });
        }}
        className="ap-chat-selector rounded px-1.5 py-0.5 text-[10px] font-medium bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 outline-none cursor-pointer"
      >
        {providers.map((p) => (
          <option key={p.providerId} value={p.providerId}>
            {p.providerName}
          </option>
        ))}
      </select>

      {currentProvider && currentProvider.models.length > 0 && (
        <select
          value={selectedProvider?.modelId ?? ""}
          onChange={(e) => {
            if (selectedProvider) {
              void selectProvider({
                providerId: selectedProvider.providerId,
                modelId: e.target.value,
              });
            }
          }}
          className="ap-chat-selector rounded px-1.5 py-0.5 text-[10px] font-medium bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 outline-none cursor-pointer"
        >
          {currentProvider.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// ─── Main Chat component ────────────────────────────────────────────

export type ArlopassChatProps = {
  /** System prompt for the conversation */
  systemPrompt?: string;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Content shown when there are no messages */
  emptyState?: ReactNode;
  /** Max tokens per response */
  maxTokens?: number;
  /** Title shown in the chat header */
  title?: string;
  /** Show provider/model selectors above the input */
  showProviderSelector?: boolean;
  /** CSS class for the root element */
  className?: string;
};

export function ArlopassChat({
  systemPrompt,
  placeholder = "Type a message…",
  emptyState,
  maxTokens,
  title = "Chat",
  showProviderSelector = true,
  className,
}: ArlopassChatProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { isConnected } = useConnection();

  return (
    <Chat.Root
      systemPrompt={systemPrompt}
      maxTokens={maxTokens}
      className={`ap-chat flex flex-col h-full ${className ?? ""}`}
    >
      {/* Header */}
      <Chat.Header className="ap-chat-header flex items-center gap-2 px-3.5 py-2.5 border-b border-stone-200 dark:border-stone-700/80">
        <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 flex-1">
          {title}
        </span>
      </Chat.Header>

      {/* Messages */}
      <Chat.Messages className="ap-chat-messages flex-1 overflow-y-auto p-3 space-y-2.5 scroll-smooth [scrollbar-width:thin]">
        {(messages, streamingContent) => (
          <>
            {messages.length === 0 && !streamingContent && (
              <Chat.EmptyState className="flex items-center justify-center h-32 text-xs text-stone-400 dark:text-stone-500">
                {emptyState ?? <p>Send a message to get started.</p>}
              </Chat.EmptyState>
            )}

            {messages.map((msg) => (
              <Chat.Message key={msg.id} message={msg}>
                <div className="ap-chat-msg flex gap-2 items-start">
                  <ChatAvatar role={msg.role} />
                  <div className="min-w-0">
                    <ChatBubble role={msg.role}>
                      <Message.Root message={msg}>
                        <Message.Content className="prose prose-sm prose-stone dark:prose-invert max-w-none [&_p]:m-0 [&_p:last-child]:mb-0" />
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <ToolActivity.Root
                            toolCalls={msg.toolCalls}
                            className="mt-1.5 space-y-1"
                          >
                            <ToolActivity.Call className="text-[9px] text-stone-400 dark:text-stone-500" />
                            <ToolActivity.Result className="text-[9px] text-stone-400 dark:text-stone-500" />
                          </ToolActivity.Root>
                        )}
                      </Message.Root>
                    </ChatBubble>
                    {msg.role === "assistant" &&
                      msg.usedTools &&
                      msg.usedTools.length > 0 && (
                        <ChatToolPills tools={msg.usedTools} />
                      )}
                  </div>
                </div>
              </Chat.Message>
            ))}

            {/* Streaming bubble */}
            {streamingContent && (
              <div className="ap-chat-msg flex gap-2 items-start">
                <ChatAvatar role="assistant" />
                <ChatBubble role="assistant">
                  <StreamingText
                    content={streamingContent}
                    cursor=""
                    className="prose prose-sm prose-stone dark:prose-invert max-w-none [&_p]:m-0"
                  />
                  <ChatStreamCursor />
                </ChatBubble>
              </div>
            )}

            {/* Typing dots (no content yet) */}
            {!streamingContent && (
              <Chat.StreamingIndicator className="ap-chat-msg flex gap-2 items-start">
                <ChatAvatar role="assistant" />
                <ChatBubble role="assistant" className="!py-2">
                  <ChatTypingDots />
                </ChatBubble>
              </Chat.StreamingIndicator>
            )}

            <div ref={bottomRef} />
            <AutoScroll target={bottomRef} />
          </>
        )}
      </Chat.Messages>

      {/* Input area */}
      <div className="ap-chat-input-area px-3.5 py-2 border-t border-stone-200 dark:border-stone-700/80">
        {/* Provider/model selectors + context bar */}
        {showProviderSelector && isConnected && (
          <div className="flex items-center gap-1 mb-1.5">
            <ChatProviderSelector />
            <Chat.ContextBar className="ml-auto text-[10px] font-mono text-stone-400 dark:text-stone-500" />
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <Chat.Input
            placeholder={placeholder}
            className="flex-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-2.5 py-1.5 text-xs text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-500 placeholder:text-stone-400 dark:placeholder:text-stone-500 resize-none"
          />
          <Chat.SendButton className="h-8 w-8 rounded-lg bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 text-xs flex items-center justify-center hover:bg-stone-700 dark:hover:bg-stone-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            ↑
          </Chat.SendButton>
        </div>
      </div>

      {/* Footer */}
      <Chat.Footer className="ap-chat-footer px-3.5 py-2 border-t border-stone-200 dark:border-stone-700/80 flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${isConnected ? "bg-emerald-600 dark:bg-emerald-500" : "bg-stone-400 dark:bg-stone-500"}`}
        />
        <span className="text-[10px] text-stone-400 dark:text-stone-500 flex-1">
          {isConnected ? "Connected" : "Disconnected"}
        </span>
      </Chat.Footer>
    </Chat.Root>
  );
}

function AutoScroll({
  target,
}: {
  target: React.RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    target.current?.scrollIntoView({ behavior: "smooth" });
  });
  return null;
}
