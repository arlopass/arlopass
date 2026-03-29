import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Menu,
  Pill,
  Popover,
  ScrollArea,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconChevronDown,
  IconPlugConnected,
  IconSearch,
  IconSend,
  IconTool,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { useConnection, useProviders, useConversation } from "@arlopass/react";
import type { ContextWindowInfo, ToolDefinition } from "@arlopass/react";
import { searchDocs } from "./docs-search";
import { DOCS_NAV as NAVIGATION } from "../../data/docs-nav";
import { Markdown } from "./Markdown";

const CHAT_PROV_KEY = "arlopass.examples.chat.lastProvider";
const CHAT_MODEL_KEY = "arlopass.examples.chat.lastModel";

function fmtModel(m: string): string {
  return m
    .split(/[-_.]/g)
    .filter(Boolean)
    .map((p) =>
      p.length <= 3 ? p.toUpperCase() : p[0]!.toUpperCase() + p.slice(1),
    )
    .join(" ");
}

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

function buildTools(
  onNavigateRef: React.RefObject<((pageId: string) => void) | undefined>,
): ToolDefinition[] {
  const allPageIds = NAVIGATION.flatMap((cat) =>
    cat.items.map((item) => item.slug),
  );
  const allItems = NAVIGATION.flatMap((cat) =>
    cat.items.map((item) => ({ ...item, category: cat.label })),
  );
  const pageList = allItems
    .map((item) => `${item.slug}: ${item.label} (${item.category})`)
    .join(", ");

  function resolvePageId(input: string): string | null {
    if (allPageIds.includes(input)) return input;
    const bySegment = allPageIds.find((id) => id.endsWith(`/${input}`));
    if (bySegment) return bySegment;
    const lower = input.toLowerCase();
    const byLabel = allItems.find((item) => item.label.toLowerCase() === lower);
    if (byLabel) return byLabel.slug;
    const byPartial = allItems.find((item) =>
      item.label.toLowerCase().includes(lower),
    );
    if (byPartial) return byPartial.slug;
    return null;
  }

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
    {
      name: "navigate_to_page",
      description: `Navigate the user to a specific page in the docs. Available pages: ${pageList}. Use this when the user asks to see a demo, example, or specific page.`,
      parameters: {
        type: "object",
        properties: {
          page_id: {
            type: "string",
            description: "The page slug to navigate to",
            enum: allPageIds,
          },
        },
        required: ["page_id"],
      },
      handler: async (args) => {
        const raw = typeof args.page_id === "string" ? args.page_id : "";
        const pageId = resolvePageId(raw);
        if (!pageId) {
          return JSON.stringify({
            success: false,
            error: `Unknown page: ${raw}. Available: ${allPageIds.join(", ")}`,
          });
        }
        onNavigateRef.current?.(pageId);
        const label = allItems.find((i) => i.slug === pageId)?.label ?? pageId;
        return JSON.stringify({ success: true, navigated_to: pageId, label });
      },
    },
  ];
}

// ─── Model Dropdown ──────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────

export function ChatSidebar({ onClose, onNavigate }: ChatSidebarProps) {
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  // React SDK hooks
  const {
    state: connState,
    isConnected,
    isConnecting,
    error: connError,
    connect,
    retry: connRetry,
  } = useConnection();
  const { providers, selectedProvider, selectProvider } = useProviders();

  // Stable tools ref (built once)
  const toolsRef = useRef<ToolDefinition[] | null>(null);
  if (toolsRef.current === null) {
    toolsRef.current = buildTools(onNavigateRef);
  }

  const {
    messages: trackedMessages,
    streamingContent,
    isStreaming,
    toolActivity,
    contextInfo,
    stream: convStream,
    clearMessages,
  } = useConversation({
    systemPrompt: CHAT_SYSTEM_PROMPT,
    tools: toolsRef.current,
    primeTools: false,
    hideToolCalls: true,
    maxToolRounds: 3,
  });

  // Local UI state
  const [chatIn, setChatIn] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const draftRef = useRef("");

  // Track which provider/model was active for each assistant message
  const msgMetaRef = useRef<Map<string, { provider: string; model: string }>>(
    new Map(),
  );

  // Provider/model selection with localStorage persistence
  const [selProv, setSelProv] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? localStorage.getItem(CHAT_PROV_KEY)
      : null,
  );
  const [selModel, setSelModel] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? localStorage.getItem(CHAT_MODEL_KEY)
      : null,
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
      // Provider was removed — pick next available
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

    // Provider exists but selected model was removed
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

  // Auto-scroll: pin to bottom during streaming via rAF loop
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      const el = scrollRef.current;
      if (el && isStreamingRef.current) {
        el.scrollTop = el.scrollHeight;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Smooth scroll for non-streaming changes (new completed messages)
  useEffect(() => {
    if (isStreaming) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [trackedMessages, isStreaming]);

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

  const handleSend = useCallback(async () => {
    const txt = chatIn.trim();
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
  }, [chatIn, isStreaming, isConnected, convStream]);

  // Derive tool activity detail for display
  const toolDetail = useMemo(() => {
    if (toolActivity.phase !== "executing") return undefined;
    const args = toolActivity.arguments;
    if (!args) return undefined;
    if (toolActivity.name === "navigate_to_page")
      return String(args.page_id ?? "");
    if (toolActivity.name === "search_docs") return String(args.query ?? "");
    return undefined;
  }, [toolActivity]);

  // Scroll fade gradient visibility
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);

  useEffect(() => {
    const el = chatAreaRef.current;
    if (!el) return;
    const onScroll = () => setShowFade(el.scrollTop > 4);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────

  const modelLabel = selModel ? fmtModel(selModel) : null;
  const providerLabel = selProvider?.providerName ?? null;

  return (
    <div className="chat-sidebar">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="chat-header">
        <span className="chat-header-title">Documentation Assistant</span>
        <div style={{ flex: 1 }} />
        <ActionIcon
          variant="subtle"
          size="xs"
          onClick={onClose}
          style={{ color: "var(--ap-text-tertiary)" }}
        >
          <IconX size={12} />
        </ActionIcon>
      </div>

      {/* ── Connection fallback ─────────────────────────────────── */}
      {!isConnected && !isConnecting && (
        <div className="chat-connect-banner">
          {connError !== null && (
            <Text fz={11} c="var(--ap-danger)" mb={4}>
              {connError.message}
            </Text>
          )}
          {connState === "disconnected" && (
            <Text fz={11} c="var(--ap-text-tertiary)" mb={6}>
              Extension not detected. Load the Arlopass extension first.
            </Text>
          )}
          <Button
            size="xs"
            leftSection={<IconPlugConnected size={14} />}
            onClick={() => void (connRetry ?? connect)()}
            fullWidth
            styles={{
              root: {
                background: "var(--ap-brand)",
                border: "none",
                "&:hover": { background: "var(--ap-brand-hover)" },
              },
            }}
          >
            {connError ? "Retry connection" : "Connect to Arlopass"}
          </Button>
        </div>
      )}

      {/* ── Chat messages area ──────────────────────────────────── */}
      <div className="chat-messages-wrapper">
        {/* Scroll fade gradient */}
        <div className="chat-fade-top" style={{ opacity: showFade ? 1 : 0 }} />

        <div
          className="chat-messages"
          ref={(node) => {
            (
              chatAreaRef as React.MutableRefObject<HTMLDivElement | null>
            ).current = node;
            (
              scrollRef as React.MutableRefObject<HTMLDivElement | null>
            ).current = node;
          }}
        >
          {/* Empty state */}
          {trackedMessages.length === 0 && !streamingContent && (
            <div className="chat-empty">
              {isConnected
                ? "Ask anything about Arlopass."
                : "Connect to start chatting."}
            </div>
          )}

          {/* Messages */}
          {trackedMessages.map((m) => {
            if (
              m.role === "assistant" &&
              m.content.trim().length === 0 &&
              (m.usedTools === undefined || m.usedTools.length === 0)
            )
              return null;

            return (
              <div key={m.id} className="chat-msg chat-msg-enter">
                {/* Avatar */}
                <div
                  className={
                    m.role === "user" ? "chat-avatar-user" : "chat-avatar-ai"
                  }
                >
                  {m.role === "user" ? (
                    <IconUser size={10} color="var(--ap-text-tertiary)" />
                  ) : (
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--ap-text-tertiary)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                  )}
                </div>

                {/* Bubble */}
                <div>
                  <div
                    className={
                      m.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"
                    }
                  >
                    {m.role === "assistant" ? (
                      <Markdown content={m.content} className="chat-markdown" />
                    ) : (
                      <span>{m.content}</span>
                    )}
                  </div>
                  {/* Provider & model attribution */}
                  {m.role === "assistant" &&
                    (() => {
                      const meta = msgMetaRef.current.get(m.id);
                      if (!meta) return null;
                      const label = [
                        meta.model ? fmtModel(meta.model) : null,
                        meta.provider,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      if (!label) return null;
                      return <div className="chat-msg-meta">{label}</div>;
                    })()}
                  {/* Tool pills */}
                  {m.role === "assistant" &&
                    m.usedTools !== undefined &&
                    m.usedTools.length > 0 && (
                      <div className="chat-tool-pills">
                        <IconTool size={9} color="var(--ap-text-tertiary)" />
                        {m.usedTools.map((t) => (
                          <span key={t} className="chat-tool-pill">
                            {t.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {isStreaming &&
            streamingContent.trim().length === 0 &&
            toolActivity.phase === "idle" && (
              <div className="chat-msg chat-msg-enter">
                <div className="chat-avatar-ai">
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--ap-text-tertiary)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                </div>
                <div className="chat-bubble-ai chat-typing-dots">
                  <span
                    className="chat-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="chat-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="chat-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            )}

          {/* Tool activity indicators */}
          {isStreaming && toolActivity.phase !== "idle" && (
            <div className="chat-msg chat-msg-enter">
              <div className="chat-avatar-ai">
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--ap-text-tertiary)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <div className="chat-bubble-ai">
                {toolActivity.phase === "priming" && (
                  <div className="chat-tool-activity">
                    <IconSearch size={11} color="var(--ap-brand)" />
                    <span
                      style={{
                        color: "var(--ap-text-secondary)",
                        fontWeight: 500,
                      }}
                    >
                      Looking for tools…
                    </span>
                    <span
                      className="chat-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="chat-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="chat-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                )}
                {toolActivity.phase === "matched" && (
                  <div className="chat-tool-activity">
                    <IconTool size={11} color="var(--ap-text-tertiary)" />
                    <span
                      style={{
                        color: "var(--ap-text-secondary)",
                        fontWeight: 500,
                      }}
                    >
                      Found:
                    </span>
                    {toolActivity.tools.map((t) => (
                      <span key={t} className="chat-tool-pill">
                        {t.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}
                {toolActivity.phase === "executing" && (
                  <div className="chat-tool-activity">
                    <span
                      className="chat-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="chat-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="chat-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                    <span className="chat-tool-pill chat-tool-pill-brand">
                      {toolActivity.name.replace(/_/g, " ")}
                    </span>
                    {toolDetail && (
                      <span
                        style={{
                          color: "var(--ap-text-tertiary)",
                          maxWidth: 120,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {toolDetail}
                      </span>
                    )}
                  </div>
                )}
                {toolActivity.phase === "result" && (
                  <div className="chat-tool-activity">
                    <span style={{ color: "var(--ap-text-tertiary)" }}>
                      ✓
                    </span>
                    <span className="chat-tool-pill">
                      {toolActivity.name.replace(/_/g, " ")}
                    </span>
                    <span style={{ color: "var(--ap-text-tertiary)" }}>
                      done
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Streaming content bubble */}
          {isStreaming && streamingContent.trim().length > 0 && (
            <div className="chat-msg chat-msg-enter">
              <div className="chat-avatar-ai">
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--ap-text-tertiary)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <div className="chat-bubble-ai">
                <Markdown
                  content={streamingContent}
                  className="chat-markdown"
                />
                <span className="chat-stream-cursor" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Input area ──────────────────────────────────────────── */}
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
                  <IconChevronDown size={10} color="var(--ap-text-tertiary)" />
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

        <div className="chat-input-row">
          <Textarea
            placeholder="Ask about Arlopass..."
            value={chatIn}
            onChange={(e) => setChatIn(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
                return;
              }
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
            }}
            minRows={1}
            maxRows={4}
            autosize
            size="sm"
            disabled={!isConnected}
            styles={{
              root: { flex: 1 },
              input: {
                fontSize: 12,
                background: "var(--ap-bg-base)",
                border: "1px solid var(--ap-border)",
                color: "var(--ap-text-body)",
                borderRadius: 8,
                padding: "7px 10px",
                lineHeight: 1.4,
                "&:focus": { borderColor: "var(--ap-brand)" },
              },
            }}
          />
          <ActionIcon
            size={32}
            variant="filled"
            onClick={() => void handleSend()}
            disabled={isStreaming || !chatIn.trim() || !isConnected}
            styles={{
              root: {
                background: "var(--ap-brand)",
                border: "none",
                borderRadius: 8,
                color: "var(--mantine-color-brand-filled)",
                "&:hover": { background: "var(--ap-brand-hover)" },
                "&[data-disabled]": {
                  background: "var(--ap-bg-elevated)",
                  color: "var(--ap-text-tertiary)",
                  opacity: 1,
                },
              },
            }}
          >
            <IconSend size={14} />
          </ActionIcon>
        </div>
      </div>

      {/* ── Footer status bar ───────────────────────────────────── */}
      <div className="chat-footer">
        {isStreaming ? (
          /* Streaming state */
          <div className="chat-footer-row">
            <div className="chat-footer-dots">
              <span className="chat-bounce" style={{ animationDelay: "0ms" }} />
              <span
                className="chat-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="chat-bounce"
                style={{ animationDelay: "300ms" }}
              />
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
          /* Idle state */
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
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatTokenCount(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}

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
