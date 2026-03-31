import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Menu,
  Popover,
  ScrollArea,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown, IconDownload, IconSearch } from "@tabler/icons-react";
import { useConnection, useProviders, useConversation } from "@arlopass/react";
import type { ContextWindowInfo, ToolDefinition } from "@arlopass/react";
import { searchDocs } from "./docs-search";

// AI Elements components
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "../ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageMeta,
  MessageResponse,
} from "../ai-elements/message";
import { Persona } from "../ai-elements/persona";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from "../ai-elements/prompt-input";
import {
  ToolActivity,
  ToolPill,
  BounceDots,
  StreamingCursor,
} from "../ai-elements/tool";

// ─── Constants ───────────────────────────────────────────────────────

const CHAT_PROV_KEY = "arlopass.examples.chat.lastProvider";
const CHAT_MODEL_KEY = "arlopass.examples.chat.lastModel";

// ─── Helpers ─────────────────────────────────────────────────────────

function fmtModel(m: string): string {
  return m
    .split(/[-_.]/g)
    .filter(Boolean)
    .map((p) =>
      p.length <= 3 ? p.toUpperCase() : p[0]!.toUpperCase() + p.slice(1),
    )
    .join(" ");
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}

// ─── Types ───────────────────────────────────────────────────────────

export type ChatSidebarProps = {
  onClose: () => void;
  onNavigate?: ((pageId: string) => void) | undefined;
};

// ─── Tool definitions ────────────────────────────────────────────────

const CHAT_SYSTEM_PROMPT = `You are a helpful assistant for the Arlopass Wallet documentation website. You answer questions about the Arlopass extension, web SDK, providers, app connections, credentials, and how to integrate with Arlopass.

When the user asks about Arlopass features, SDK usage, providers, or integration, use the search_docs tool to find relevant documentation before answering.
When the user asks to see a specific page, demo, or example, use the navigate_to_page tool to take them there.

Important:
- Be concise and accurate
- Include code examples when relevant
- Reference specific Arlopass concepts (providers, models, vault, app connections)
- If asked about implementation, show @arlopass/web-sdk TypeScript code`;

function buildTools(): ToolDefinition[] {
  return [
    {
      name: "search_docs",
      description:
        "Search Arlopass documentation for relevant pages about the SDK, extension, providers, apps, credentials, or integration patterns. Use this when the user asks about Arlopass features.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query about Arlopass",
          },
        },
        required: ["query"],
      },
      handler: async (args) => {
        const query = typeof args.query === "string" ? args.query : "";
        const results = searchDocs(query);
        if (results.length === 0)
          return JSON.stringify({
            found: false,
            message: "No relevant docs found.",
          });
        return JSON.stringify(
          results.slice(0, 3).map((r) => ({
            title: r.label,
            slug: r.slug,
            category: r.category,
          })),
        );
      },
    },
  ];
}

// ─── ModelDropdown ────────────────────────────────────────────────────

function ModelDropdown({
  models,
  selected,
  onSelect,
}: {
  models: readonly string[];
  selected: string | null;
  onSelect: (modelId: string) => void;
}) {
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (search.trim().length === 0) return models;
    const lower = search.toLowerCase();
    return models.filter(
      (m) =>
        m.toLowerCase().includes(lower) ||
        fmtModel(m).toLowerCase().includes(lower),
    );
  }, [models, search]);

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="top-start"
      shadow="sm"
      withinPortal
      width={240}
    >
      <Popover.Target>
        <UnstyledButton
          onClick={() => {
            setOpened((o) => !o);
            setSearch("");
          }}
          style={{
            padding: "2px 8px",
            borderRadius: 4,
            background: "var(--ap-bg-elevated)",
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <Text fz={10} fw={500} c="var(--ap-text-secondary)">
            {selected ? fmtModel(selected) : "Model"}
          </Text>
          <IconChevronDown size={10} color="var(--ap-text-tertiary)" />
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown
        style={{
          background: "var(--ap-bg-elevated)",
          border: "1px solid var(--ap-border)",
          padding: 4,
        }}
      >
        <TextInput
          size="xs"
          placeholder="Search models..."
          leftSection={<IconSearch size={12} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          styles={{
            input: {
              fontSize: 11,
              background: "var(--ap-bg-surface)",
              border: "1px solid var(--ap-border)",
            },
          }}
          mb={4}
          autoFocus
        />
        <ScrollArea.Autosize
          mah={200}
          type="scroll"
          offsetScrollbars
          scrollbarSize={4}
        >
          {filtered.length === 0 && (
            <Text fz={11} c="var(--ap-text-tertiary)" ta="center" py={8}>
              No models match
            </Text>
          )}
          {filtered.map((m) => (
            <UnstyledButton
              key={m}
              onClick={() => {
                onSelect(m);
                setOpened(false);
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "4px 8px",
                borderRadius: 3,
                fontSize: 11,
                fontWeight: m === selected ? 600 : 400,
                color: "var(--ap-text-body)",
                background:
                  m === selected ? "var(--ap-bg-surface)" : "transparent",
              }}
            >
              {fmtModel(m)}
            </UnstyledButton>
          ))}
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}

// ─── ContextBar ──────────────────────────────────────────────────────

function ContextBar({ info }: { info: ContextWindowInfo }) {
  const pct = Math.round(info.usageRatio * 100);
  const color =
    pct > 90
      ? "var(--ap-danger)"
      : pct > 70
        ? "var(--ap-warning)"
        : "var(--ap-text-tertiary)";

  return (
    <div className="chat-context-bar">
      <span style={{ color, fontVariantNumeric: "tabular-nums" }}>
        {formatTokenCount(info.usedTokens)}/{formatTokenCount(info.maxTokens)} (
        {pct}%)
      </span>
    </div>
  );
}

// ─── ConnectionEmptyState ────────────────────────────────────────────

function ConnectionEmptyState({
  error,
  onRetry,
}: {
  error: { message: string } | null;
  onRetry: () => void;
}) {
  return (
    <ConversationEmptyState className="flex-1">
      <div className="chat-connect-icon">
        <img src="/ArlopassIcon.svg" alt="Arlopass" width="28" height="28" />
      </div>
      <span className="chat-connect-title">Arlopass Extension Required</span>
      <span className="chat-connect-subtitle">
        Install the browser extension to chat with any AI model — your keys,
        your choice.
      </span>
      {error !== null && (
        <span className="chat-connect-error">{error.message}</span>
      )}
      <a href="/install" className="chat-connect-install-btn">
        <IconDownload size={14} />
        Install Extension
      </a>
      <button className="chat-connect-retry" onClick={onRetry} type="button">
        Already installed? Try again
      </button>
    </ConversationEmptyState>
  );
}

// ─── ToolActivityBubble ──────────────────────────────────────────────

const ToolIcon = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--ap-text-tertiary)"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

function ToolActivityBubble({
  phase,
  tools,
  name,
  detail,
}: {
  phase: string;
  tools?: readonly string[];
  name?: string;
  detail: string | undefined;
}) {
  return (
    <div className="flex gap-2 items-start chat-msg-enter">
      <Persona role="assistant" />
      <div className="rounded-lg px-2.5 py-1.5 bg-[var(--ap-brand-subtle,#2c1a0e)] border border-[color-mix(in_srgb,var(--ap-brand,#db4d12)_10%,transparent)]">
        {phase === "priming" && (
          <ToolActivity>
            <IconSearch size={11} color="var(--ap-brand)" />
            <span className="text-[var(--ap-text-secondary)] font-medium">
              Looking for tools…
            </span>
            <BounceDots />
          </ToolActivity>
        )}
        {phase === "matched" && (
          <ToolActivity>
            <ToolIcon />
            <span className="text-[var(--ap-text-secondary)] font-medium">
              Found:
            </span>
            {tools?.map((t) => (
              <ToolPill key={t}>{t.replace(/_/g, " ")}</ToolPill>
            ))}
          </ToolActivity>
        )}
        {phase === "executing" && (
          <ToolActivity>
            <BounceDots />
            <ToolPill variant="brand">
              {(name ?? "").replace(/_/g, " ")}
            </ToolPill>
            {detail && (
              <span className="text-[var(--ap-text-tertiary)] max-w-[120px] truncate">
                {detail}
              </span>
            )}
          </ToolActivity>
        )}
        {phase === "result" && (
          <ToolActivity>
            <span className="text-[var(--ap-text-tertiary)]">✓</span>
            <ToolPill>{(name ?? "").replace(/_/g, " ")}</ToolPill>
            <span className="text-[var(--ap-text-tertiary)]">done</span>
          </ToolActivity>
        )}
      </div>
    </div>
  );
}

// ─── CloseButton ─────────────────────────────────────────────────────

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center w-5 h-5 rounded text-[var(--ap-text-tertiary)] hover:text-[var(--ap-text-secondary)] hover:bg-[var(--ap-bg-elevated)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ap-brand)] focus-visible:ring-offset-1"
      aria-label="Close chat"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 6L6 18" />
        <path d="M6 6l12 12" />
      </svg>
    </button>
  );
}

// ─── ChatSidebar ─────────────────────────────────────────────────────

export function ChatSidebar({ onClose }: ChatSidebarProps) {
  // ── Arlopass React SDK hooks ───────────────────────────────────────
  const {
    isConnected,
    isConnecting,
    error: connError,
    connect,
    retry: connRetry,
  } = useConnection();
  const { providers, selectedProvider, selectProvider } = useProviders();

  // Stable tools ref (built once, never changes)
  const toolsRef = useRef<ToolDefinition[] | null>(null);
  if (toolsRef.current === null) {
    toolsRef.current = buildTools();
  }

  const {
    messages: trackedMessages,
    streamingContent,
    isStreaming,
    toolActivity,
    contextInfo,
    stream: convStream,
  } = useConversation({
    systemPrompt: CHAT_SYSTEM_PROMPT,
    tools: toolsRef.current,
    primeTools: false,
    hideToolCalls: true,
    maxToolRounds: 3,
  });

  // ── Local UI state ─────────────────────────────────────────────────
  const [chatIn, setChatIn] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const draftRef = useRef("");

  // Track which message IDs were streamed in (skip the enter animation)
  const streamedMsgIdsRef = useRef<Set<string>>(new Set());
  const prevStreamingRef = useRef(isStreaming);
  if (prevStreamingRef.current && !isStreaming) {
    const lastMsg = trackedMessages[trackedMessages.length - 1];
    if (lastMsg?.role === "assistant") {
      streamedMsgIdsRef.current.add(lastMsg.id);
    }
  }
  prevStreamingRef.current = isStreaming;

  // Track provider/model per assistant message for attribution labels
  const msgMetaRef = useRef<Map<string, { provider: string; model: string }>>(
    new Map(),
  );

  // ── Provider/model selection with localStorage persistence ─────────
  const [selProv, setSelProv] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(CHAT_PROV_KEY) : null,
  );
  const [selModel, setSelModel] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(CHAT_MODEL_KEY) : null,
  );

  const selProvider = useMemo(
    () => providers.find((p) => p.providerId === selProv) ?? null,
    [providers, selProv],
  );

  // Auto-select last-used or first provider on connect
  useEffect(() => {
    if (!isConnected || providers.length === 0) return;
    if (selectedProvider !== null) return;

    const lastProv = localStorage.getItem(CHAT_PROV_KEY);
    const lastModel = localStorage.getItem(CHAT_MODEL_KEY);
    const matched =
      providers.find((p) => p.providerId === lastProv) ?? providers[0];
    if (matched) {
      const model =
        lastModel && matched.models.includes(lastModel)
          ? lastModel
          : matched.models[0];
      if (model) {
        setSelProv(matched.providerId);
        setSelModel(model);
        void selectProvider({ providerId: matched.providerId, modelId: model });
      }
    }
  }, [isConnected, providers, selectedProvider, selectProvider]);

  // Invalidate selection when the selected provider/model is removed
  useEffect(() => {
    if (!isConnected || providers.length === 0) return;
    if (selProv === null) return;

    const currentProvider = providers.find((p) => p.providerId === selProv);
    if (!currentProvider) {
      const fallback = providers[0];
      if (fallback) {
        const model = fallback.models[0];
        if (model) {
          setSelProv(fallback.providerId);
          setSelModel(model);
          localStorage.setItem(CHAT_PROV_KEY, fallback.providerId);
          localStorage.setItem(CHAT_MODEL_KEY, model);
          void selectProvider({
            providerId: fallback.providerId,
            modelId: model,
          });
        }
      } else {
        setSelProv(null);
        setSelModel(null);
      }
      return;
    }

    if (selModel !== null && !currentProvider.models.includes(selModel)) {
      const model = currentProvider.models[0] ?? null;
      setSelModel(model);
      if (model) {
        localStorage.setItem(CHAT_MODEL_KEY, model);
        void selectProvider({ providerId: selProv, modelId: model });
      }
    }
  }, [isConnected, providers, selProv, selModel, selectProvider]);

  // Capture provider/model metadata for new assistant messages
  useEffect(() => {
    for (const m of trackedMessages) {
      if (m.role === "assistant" && !msgMetaRef.current.has(m.id)) {
        const prov = selProvider?.providerName ?? selProv ?? "";
        const model = selModel ?? "";
        if (prov || model) {
          msgMetaRef.current.set(m.id, { provider: prov, model });
        }
      }
    }
  }, [trackedMessages, selProvider, selProv, selModel]);

  // ── Auto-scroll (rAF loop for streaming, smooth for completions) ───
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!isStreaming) return;
    const tick = () => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isStreaming]);

  useEffect(() => {
    if (isStreaming) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [trackedMessages, isStreaming]);

  // ── Scroll fade gradient ───────────────────────────────────────────
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);

  useEffect(() => {
    const el = chatAreaRef.current;
    if (!el) return;
    const onScroll = () => setShowFade(el.scrollTop > 4);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────

  const handleProviderChange = useCallback(
    async (providerId: string) => {
      setSelProv(providerId);
      const prov = providers.find((p) => p.providerId === providerId);
      const model = prov?.models[0] ?? null;
      setSelModel(model);
      if (model) {
        localStorage.setItem(CHAT_PROV_KEY, providerId);
        localStorage.setItem(CHAT_MODEL_KEY, model);
        try {
          await selectProvider({ providerId, modelId: model });
        } catch {
          /* ignore */
        }
      }
    },
    [providers, selectProvider],
  );

  const handleModelChange = useCallback(
    async (modelId: string) => {
      setSelModel(modelId);
      if (selProv) {
        localStorage.setItem(CHAT_MODEL_KEY, modelId);
        try {
          await selectProvider({ providerId: selProv, modelId });
        } catch {
          /* ignore */
        }
      }
    },
    [selProv, selectProvider],
  );

  const handleSend = useCallback(
    async (text?: string) => {
      const txt = (text ?? chatIn).trim();
      if (!txt || isStreaming || !isConnected) return;
      setChatIn("");
      inputHistoryRef.current.push(txt);
      historyIndexRef.current = -1;
      draftRef.current = "";
      try {
        await convStream(txt);
      } catch {
        /* error exposed via hook */
      }
    },
    [chatIn, isStreaming, isConnected, convStream],
  );

  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter is handled by PromptInputTextarea → form submit
      const history = inputHistoryRef.current;
      if (history.length === 0) return;

      if (e.key === "ArrowUp") {
        const el = e.currentTarget;
        if (el.selectionStart !== 0 || el.selectionEnd !== 0) return;
        e.preventDefault();
        if (historyIndexRef.current === -1) {
          draftRef.current = chatIn;
          historyIndexRef.current = history.length - 1;
        } else if (historyIndexRef.current > 0) {
          historyIndexRef.current -= 1;
        }
        setChatIn(history[historyIndexRef.current] ?? "");
      }
      if (e.key === "ArrowDown") {
        if (historyIndexRef.current === -1) return;
        e.preventDefault();
        if (historyIndexRef.current < history.length - 1) {
          historyIndexRef.current += 1;
          setChatIn(history[historyIndexRef.current] ?? "");
        } else {
          historyIndexRef.current = -1;
          setChatIn(draftRef.current);
        }
      }
    },
    [chatIn],
  );

  // ── Derived values for render ──────────────────────────────────────

  const toolDetail = useMemo(() => {
    if (toolActivity.phase !== "executing") return undefined;
    const args = toolActivity.arguments;
    if (!args) return undefined;
    if (toolActivity.name === "navigate_to_page")
      return String(args.page_id ?? "");
    if (toolActivity.name === "search_docs") return String(args.query ?? "");
    return undefined;
  }, [toolActivity]);

  const modelLabel = selModel ? fmtModel(selModel) : null;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="chat-sidebar">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="chat-header">
        <span className="chat-header-title">Documentation Assistant</span>
        <div style={{ flex: 1 }} />
        <CloseButton onClick={onClose} />
      </div>

      {/* ── Connection fallback ───────────────────────────────── */}
      {!isConnected && !isConnecting && (
        <ConnectionEmptyState
          error={connError}
          onRetry={() => void (connRetry ?? connect)()}
        />
      )}

      {/* ── Chat messages area ────────────────────────────────── */}
      {(isConnected || isConnecting) && (
        <div className="chat-messages-wrapper">
          <div
            className="chat-fade-top"
            style={{ opacity: showFade ? 1 : 0 }}
          />

          <Conversation
            ref={(node) => {
              (
                chatAreaRef as React.MutableRefObject<HTMLDivElement | null>
              ).current = node;
              (
                scrollRef as React.MutableRefObject<HTMLDivElement | null>
              ).current = node;
            }}
            className="chat-messages"
          >
            <ConversationContent className="gap-2.5 p-3.5">
              {/* Empty state */}
              {trackedMessages.length === 0 && !streamingContent && (
                <ConversationEmptyState
                  title={
                    isConnected ? "Ask anything about Arlopass." : "Connecting…"
                  }
                  className="h-[120px]"
                />
              )}

              {/* Completed messages */}
              {trackedMessages.map((m) => {
                if (
                  m.role === "assistant" &&
                  m.content.trim().length === 0 &&
                  (m.usedTools === undefined || m.usedTools.length === 0)
                )
                  return null;

                const wasStreamed = streamedMsgIdsRef.current.has(m.id);
                const meta = msgMetaRef.current.get(m.id);
                const metaLabel = meta
                  ? [meta.model ? fmtModel(meta.model) : null, meta.provider]
                      .filter(Boolean)
                      .join(" · ")
                  : null;

                return (
                  <div
                    key={m.id}
                    className={wasStreamed ? undefined : "chat-msg-enter"}
                  >
                    <div
                      className={
                        m.role === "user"
                          ? "flex gap-2 items-start flex-row-reverse"
                          : "flex gap-2 items-start"
                      }
                    >
                      <Persona role={m.role as "user" | "assistant"} />
                      <div className="min-w-0 flex-1">
                        <Message from={m.role as "user" | "assistant"}>
                          <MessageContent>
                            {m.role === "assistant" ? (
                              <MessageResponse>{m.content}</MessageResponse>
                            ) : (
                              <span className="text-[12px] text-[var(--ap-text-body)]">
                                {m.content}
                              </span>
                            )}
                          </MessageContent>
                        </Message>

                        {/* Provider & model attribution */}
                        {m.role === "assistant" && metaLabel && (
                          <MessageMeta>{metaLabel}</MessageMeta>
                        )}

                        {/* Tool pills */}
                        {m.role === "assistant" &&
                          m.usedTools !== undefined &&
                          m.usedTools.length > 0 && (
                            <div className="flex items-center gap-1 mt-0.5 ml-0.5">
                              <ToolIcon />
                              {m.usedTools.map((t) => (
                                <ToolPill key={t}>
                                  {t.replace(/_/g, " ")}
                                </ToolPill>
                              ))}
                            </div>
                          )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Typing indicator (streaming, no content yet, no tool activity) */}
              {isStreaming &&
                streamingContent.trim().length === 0 &&
                toolActivity.phase === "idle" && (
                  <div
                    className="flex gap-2 items-start chat-msg-enter"
                    aria-live="polite"
                  >
                    <Persona role="assistant" />
                    <div className="rounded-lg px-2.5 py-2 bg-[var(--ap-brand-subtle,#2c1a0e)] border border-[color-mix(in_srgb,var(--ap-brand,#db4d12)_10%,transparent)]">
                      <BounceDots />
                    </div>
                  </div>
                )}

              {/* Tool activity indicators */}
              {isStreaming && toolActivity.phase !== "idle" && (
                <ToolActivityBubble
                  phase={toolActivity.phase}
                  tools={
                    toolActivity.phase === "matched"
                      ? toolActivity.tools
                      : undefined
                  }
                  name={
                    toolActivity.phase === "executing" ||
                    toolActivity.phase === "result"
                      ? toolActivity.name
                      : undefined
                  }
                  detail={toolDetail}
                />
              )}

              {/* Streaming content */}
              {isStreaming && streamingContent.trim().length > 0 && (
                <div
                  className="flex gap-2 items-start chat-msg-enter"
                  aria-live="polite"
                >
                  <Persona role="assistant" />
                  <div className="min-w-0 flex-1">
                    <Message from="assistant">
                      <MessageContent>
                        <MessageResponse>{streamingContent}</MessageResponse>
                        <StreamingCursor />
                      </MessageContent>
                    </Message>
                  </div>
                </div>
              )}
            </ConversationContent>
          </Conversation>
        </div>
      )}

      {/* ── Input area ────────────────────────────────────────── */}
      {(isConnected || isConnecting) && (
        <div className="chat-input-area">
          {/* Provider/model selectors */}
          {isConnected && providers.length > 0 && (
            <div className="chat-selectors">
              <Menu shadow="sm" position="top-start" withinPortal>
                <Menu.Target>
                  <UnstyledButton
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: "var(--ap-bg-elevated)",
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <Text fz={10} fw={500} c="var(--ap-text-secondary)">
                      {selProvider?.providerName ?? "Provider"}
                    </Text>
                    <IconChevronDown
                      size={10}
                      color="var(--ap-text-tertiary)"
                    />
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown
                  style={{
                    background: "var(--ap-bg-elevated)",
                    border: "1px solid var(--ap-border)",
                  }}
                >
                  {providers.map((p) => (
                    <Menu.Item
                      key={p.providerId}
                      onClick={() => void handleProviderChange(p.providerId)}
                      fw={p.providerId === selProv ? 600 : 400}
                      fz={11}
                      style={{ color: "var(--ap-text-body)" }}
                    >
                      {p.providerName}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>

              <ModelDropdown
                models={selProvider?.models ?? []}
                selected={selModel}
                onSelect={(m) => void handleModelChange(m)}
              />

              {contextInfo.maxTokens > 0 && <ContextBar info={contextInfo} />}
            </div>
          )}

          <PromptInput
            onSubmit={(text) => void handleSend(text)}
            disabled={!isConnected}
          >
            <PromptInputTextarea
              ref={textareaRef}
              value={chatIn}
              onChange={(e) => setChatIn(e.currentTarget.value)}
              onKeyDown={handleTextareaKeyDown}
            />
            <PromptInputSubmit
              isStreaming={isStreaming}
              disabled={isStreaming || !chatIn.trim() || !isConnected}
            />
          </PromptInput>
        </div>
      )}

      {/* ── Footer status bar ─────────────────────────────────── */}
      {(isConnected || isConnecting) && (
        <div className="chat-footer">
          {isStreaming ? (
            <div className="chat-footer-row">
              <div className="chat-footer-dots">
                <BounceDots />
              </div>
              <span className="chat-footer-label">Streaming via Arlopass</span>
              {contextInfo.maxTokens > 0 && (
                <span className="chat-footer-ctx">
                  {formatTokenCount(contextInfo.usedTokens)}/
                  {formatTokenCount(contextInfo.maxTokens)} context
                </span>
              )}
            </div>
          ) : (
            <div className="chat-footer-row">
              <span
                className="chat-footer-dot-status"
                style={{
                  background: isConnected
                    ? "var(--ap-success)"
                    : "var(--ap-text-tertiary)",
                }}
              />
              <span className="chat-footer-label">
                {isConnected ? "Connected via Arlopass" : "Disconnected"}
              </span>
              {modelLabel && (
                <span className="chat-footer-model">{modelLabel}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
