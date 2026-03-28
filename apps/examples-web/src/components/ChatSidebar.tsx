import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Menu,
  Pill,
  Popover,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconChevronDown,
  IconMessage,
  IconPlugConnected,
  IconSearch,
  IconSend,
  IconTool,
  IconX,
} from "@tabler/icons-react";
import { useConnection, useProviders, useConversation } from "@arlopass/react";
import type { ContextWindowInfo, ToolDefinition } from "@arlopass/react";
import { searchDocs } from "../docs-context";
import { NAVIGATION } from "../navigation";
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
    cat.items.map((item) => item.id),
  );
  const allItems = NAVIGATION.flatMap((cat) =>
    cat.items.map((item) => ({ ...item, category: cat.label })),
  );
  const pageList = allItems
    .map((item) => `${item.id}: ${item.label} (${item.category})`)
    .join(", ");

  function resolvePageId(input: string): string | null {
    if (allPageIds.includes(input)) return input;
    const bySegment = allPageIds.find((id) => id.endsWith(`/${input}`));
    if (bySegment) return bySegment;
    const lower = input.toLowerCase();
    const byLabel = allItems.find((item) => item.label.toLowerCase() === lower);
    if (byLabel) return byLabel.id;
    const byPartial = allItems.find((item) =>
      item.label.toLowerCase().includes(lower),
    );
    if (byPartial) return byPartial.id;
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
        const results = searchDocs(query, 3);
        if (results.length === 0)
          return JSON.stringify({
            found: false,
            message: "No relevant docs found.",
          });
        return JSON.stringify(
          results.map((r) => ({ title: r.title, content: r.content })),
        );
      },
    },
    {
      name: "navigate_to_page",
      description: `Navigate the user to a specific page in the examples app. Available pages: ${pageList}. Use this when the user asks to see a demo, example, or specific page.`,
      parameters: {
        type: "object",
        properties: {
          page_id: {
            type: "string",
            description: "The page ID to navigate to",
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
        const label = allItems.find((i) => i.id === pageId)?.label ?? pageId;
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
    return models.filter((m) => m.toLowerCase().includes(lower) || fmtModel(m).toLowerCase().includes(lower));
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
          onClick={() => { setOpened((o) => !o); setSearch(""); }}
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
          styles={{ input: { fontSize: 11, background: "var(--ap-bg-surface)", border: "1px solid var(--ap-border)" } }}
          mb={4}
          autoFocus
        />
        <ScrollArea.Autosize mah={200} type="scroll" offsetScrollbars scrollbarSize={4}>
          {filtered.length === 0 && (
            <Text fz={11} c="var(--ap-text-tertiary)" ta="center" py={8}>
              No models match
            </Text>
          )}
          {filtered.map((m) => (
            <UnstyledButton
              key={m}
              onClick={() => { onSelect(m); setOpened(false); }}
              style={{
                display: "block",
                width: "100%",
                padding: "4px 8px",
                borderRadius: 3,
                fontSize: 11,
                fontWeight: m === selected ? 600 : 400,
                color: "var(--ap-text-body)",
                background: m === selected ? "var(--ap-bg-surface)" : "transparent",
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
    primeTools: true,
    hideToolCalls: true,
    maxToolRounds: 3,
  });

  // Local UI state
  const [chatIn, setChatIn] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const draftRef = useRef("");

  // Provider/model selection with localStorage persistence
  const [selProv, setSelProv] = useState<string | null>(() =>
    localStorage.getItem(CHAT_PROV_KEY),
  );
  const [selModel, setSelModel] = useState<string | null>(() =>
    localStorage.getItem(CHAT_MODEL_KEY),
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
          void selectProvider({ providerId: fallback.providerId, modelId: model });
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

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [trackedMessages, streamingContent]);

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

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <Stack h="100%" gap={0}>
      {/* Header */}
      <Group
        h={52}
        px="md"
        justify="space-between"
        style={{ borderBottom: "1px solid var(--ap-border)" }}
      >
        <Group gap="xs">
          <IconMessage size={16} />
          <Text fw={600} fz="sm">
            AI Chat
          </Text>
          <Badge
            size="xs"
            color={isConnected ? "teal" : isConnecting ? "yellow" : "gray"}
            variant="dot"
          >
            {connState}
          </Badge>
        </Group>
        <ActionIcon variant="subtle" size="sm" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      {/* Connection fallback */}
      {!isConnected && !isConnecting && (
        <Box p="md" style={{ borderBottom: "1px solid var(--ap-border)" }}>
          <Stack gap="sm">
            {connError !== null && (
              <Text fz="xs" c="red">
                {connError.message}
              </Text>
            )}
            {connState === "disconnected" && (
              <Text fz="xs" c="dimmed">
                Extension not detected. Load the Arlopass extension first.
              </Text>
            )}
            <Button
              size="xs"
              leftSection={<IconPlugConnected size={14} />}
              onClick={() => void (connRetry ?? connect)()}
              fullWidth
            >
              {connError ? "Retry connection" : "Connect to Arlopass"}
            </Button>
          </Stack>
        </Box>
      )}

      {/* Messages */}
      <ScrollArea
        style={{ flex: 1 }}
        p="xs"
        type="scroll"
        viewportRef={scrollRef}
      >
        <Stack gap="xs">
          {trackedMessages.length === 0 && !streamingContent && (
            <Text fz="sm" c="dimmed" ta="center" py="xl">
              {isConnected
                ? "Ask anything about Arlopass."
                : "Connect to start chatting."}
            </Text>
          )}
          {trackedMessages.map((m) => {
            if (
              m.role === "assistant" &&
              m.content.trim().length === 0 &&
              (m.usedTools === undefined || m.usedTools.length === 0)
            )
              return null;
            return (
              <Box
                key={m.id}
                style={{
                  maxWidth: "90%",
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <Box
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    background:
                      m.role === "user"
                        ? "var(--ap-brand-subtle-dark)"
                        : "var(--ap-bg-surface)",
                  }}
                >
                  {m.role === "assistant" ? (
                    <Markdown content={m.content} className="chat-markdown" />
                  ) : (
                    <Text fz="sm" style={{ whiteSpace: "pre-wrap" }}>
                      {m.content}
                    </Text>
                  )}
                </Box>
                {m.role === "assistant" &&
                  m.usedTools !== undefined &&
                  m.usedTools.length > 0 && (
                    <Group gap={4} mt={3} ml={4}>
                      <IconTool size={10} color="var(--ap-text-tertiary)" />
                      {m.usedTools.map((t) => (
                        <Pill
                          key={t}
                          size="xs"
                          style={{
                            background: "var(--ap-bg-elevated)",
                            color: "var(--ap-text-tertiary)",
                            fontSize: 9,
                            fontWeight: 500,
                          }}
                        >
                          {t.replace(/_/g, " ")}
                        </Pill>
                      ))}
                    </Group>
                  )}
              </Box>
            );
          })}

          {/* Streaming content bubble */}
          {isStreaming && streamingContent.trim().length > 0 && (
            <Box style={{ maxWidth: "90%", alignSelf: "flex-start" }}>
              <Box
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "var(--ap-bg-surface)",
                  opacity: 0.85,
                }}
              >
                <Markdown
                  content={streamingContent}
                  className="chat-markdown"
                />
              </Box>
            </Box>
          )}

          {/* Tool activity indicators */}
          {isStreaming && (
            <Box ml="xs" py={4}>
              {toolActivity.phase === "priming" && (
                <Group gap={6} align="center">
                  <IconSearch size={12} color="var(--ap-brand)" />
                  <Text fz={11} c="blue" fw={500}>
                    Looking for tools...
                  </Text>
                  <Loader size={10} color="blue" />
                </Group>
              )}
              {toolActivity.phase === "matched" && (
                <Group gap={6} align="center" wrap="nowrap">
                  <IconTool size={12} color="var(--ap-success)" />
                  <Text fz={11} c="teal" fw={500}>
                    Found:
                  </Text>
                  {toolActivity.tools.map((t) => (
                    <Pill
                      key={t}
                      size="xs"
                      style={{
                        background: "var(--ap-success-subtle)",
                        color: "var(--ap-success)",
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      {t.replace(/_/g, " ")}
                    </Pill>
                  ))}
                </Group>
              )}
              {toolActivity.phase === "executing" && (
                <Group gap={6} align="center" wrap="nowrap">
                  <Loader size={10} color="violet" />
                  <Pill
                    size="xs"
                    style={{
                      background: "var(--ap-brand-subtle-dark)",
                      color: "var(--ap-brand)",
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    {toolActivity.name.replace(/_/g, " ")}
                  </Pill>
                  {toolDetail && (
                    <Text fz={10} c="dimmed" truncate style={{ maxWidth: 150 }}>
                      {toolDetail}
                    </Text>
                  )}
                </Group>
              )}
              {toolActivity.phase === "result" && (
                <Group gap={6} align="center">
                  <Text fz={11} c="teal" fw={500}>
                    ✓
                  </Text>
                  <Pill
                    size="xs"
                    style={{
                      background: "var(--ap-success-subtle)",
                      color: "var(--ap-success)",
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    {toolActivity.name.replace(/_/g, " ")}
                  </Pill>
                  <Text fz={10} c="teal">
                    done
                  </Text>
                </Group>
              )}
              {toolActivity.phase === "idle" && !streamingContent && (
                <Loader size="xs" />
              )}
            </Box>
          )}
        </Stack>
      </ScrollArea>

      {/* Input area with provider/model dropdowns */}
      <Box p="xs" style={{ borderTop: "1px solid var(--ap-border)" }}>
        {isConnected && providers.length > 0 && (
          <Group gap={4} mb={6}>
            <Menu shadow="sm" position="top-start" withinPortal>
              <Menu.Target>
                <Group
                  gap={2}
                  style={{
                    cursor: "pointer",
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: "var(--ap-bg-elevated)",
                  }}
                >
                  <Text fz={10} fw={600} c="var(--ap-text-body)">
                    {selProvider?.providerName ?? "Provider"}
                  </Text>
                  <IconChevronDown size={10} color="var(--ap-text-secondary)" />
                </Group>
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
          </Group>
        )}

        <Group gap="xs" align="flex-end">
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
            style={{ flex: 1 }}
            size="sm"
            disabled={!isConnected}
          />
          <ActionIcon
            size="lg"
            variant="filled"
            onClick={() => void handleSend()}
            disabled={isStreaming || !chatIn.trim() || !isConnected}
          >
            <IconSend size={16} />
          </ActionIcon>
        </Group>

        {/* Context window indicator */}
        {isConnected && contextInfo.maxTokens > 0 && (
          <ContextBar info={contextInfo} />
        )}
      </Box>
    </Stack>
  );
}

// ─── Context window bar (Cursor-style) ───────────────────────────────

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
    <Group gap={6} mt={6} justify="center">
      <Text
        fz={10}
        c={color}
        fw={500}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        Context: {formatTokenCount(info.usedTokens)}/
        {formatTokenCount(info.maxTokens)} ({pct}%)
      </Text>
    </Group>
  );
}
