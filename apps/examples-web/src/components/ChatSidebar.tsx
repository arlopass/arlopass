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
  ScrollArea,
  Stack,
  Text,
  Textarea,
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
import {
  ArlopassClient,
  ConversationManager,
  type ArlopassTransport,
  type ChatMessage,
  type ContextWindowInfo,
  type ProviderDescriptor,
} from "@arlopass/web-sdk";
import { searchDocs } from "../docs-context";
import { NAVIGATION } from "../navigation";
import { Markdown } from "./Markdown";

type ChatState = "disconnected" | "connecting" | "connected" | "error";

const CHAT_PROV_KEY = "arlopass.examples.chat.lastProvider";
const CHAT_MODEL_KEY = "arlopass.examples.chat.lastModel";

function getInjected(): ArlopassTransport | null {
  return (window as Window & { arlopass?: ArlopassTransport }).arlopass ?? null;
}

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

type ToolActivityState =
  | { phase: "idle" }
  | { phase: "priming" }
  | { phase: "matched"; tools: readonly string[] }
  | { phase: "executing"; name: string; detail?: string | undefined }
  | { phase: "result"; name: string };

const TOOL_IDLE: ToolActivityState = { phase: "idle" };

type DisplayMessage = ChatMessage & {
  /** Tool names that were called to produce this response. */
  usedTools?: readonly string[];
};

export function ChatSidebar({ onClose, onNavigate }: ChatSidebarProps) {
  const clientRef = useRef<ArlopassClient | null>(null);
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const [chatState, setChatState] = useState<ChatState>("connecting");
  const [autoConnectDone, setAutoConnectDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [providers, setProviders] = useState<readonly ProviderDescriptor[]>([]);
  const [selProv, setSelProv] = useState<string | null>(null);
  const [selModel, setSelModel] = useState<string | null>(null);
  const [chatIn, setChatIn] = useState("");
  const [msgs, setMsgs] = useState<DisplayMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [toolState, setToolState] = useState<ToolActivityState>(TOOL_IDLE);
  const usedToolsRef = useRef<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const convRef = useRef<ConversationManager | null>(null);
  const inputHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const draftRef = useRef("");
  const [contextInfo, setContextInfo] = useState<ContextWindowInfo | null>(
    null,
  );

  const refreshContextInfo = useCallback(() => {
    const conv = convRef.current;
    if (conv) setContextInfo(conv.getContextInfo());
  }, []);

  const selProvider = useMemo(
    () => providers.find((p) => p.providerId === selProv) ?? null,
    [providers, selProv],
  );
  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [msgs]);

  // Auto-connect on mount
  useEffect(() => {
    void autoConnect();
  }, []);

  const autoConnect = async () => {
    const transport = getInjected();
    if (!transport) {
      setChatState("disconnected");
      setAutoConnectDone(true);
      return;
    }
    setChatState("connecting");
    try {
      const client = new ArlopassClient({
        transport,
        origin: window.location.origin,
        timeoutMs: 120_000,
      });
      await client.connect({
        appSuffix: "chat",
        appName: "Arlopass Chat",
        appDescription: "Documentation assistant for the examples app",
        origin: window.location.origin,
      });
      clientRef.current = client;
      const { providers: provList } = await client.listProviders();
      setProviders(provList);

      const lastProv = localStorage.getItem(CHAT_PROV_KEY);
      const lastModel = localStorage.getItem(CHAT_MODEL_KEY);
      const matchedProv =
        provList.find((p) => p.providerId === lastProv) ?? provList[0];
      if (matchedProv) {
        setSelProv(matchedProv.providerId);
        const matchedModel =
          lastModel && matchedProv.models.includes(lastModel)
            ? lastModel
            : matchedProv.models[0];
        if (matchedModel) {
          setSelModel(matchedModel);
          await client.selectProvider({
            providerId: matchedProv.providerId,
            modelId: matchedModel,
          });
        }
      }
      setChatState("connected");

      // Initialize ConversationManager with search_docs + navigate tools
      convRef.current = createConversation(client, onNavigateRef);
      setContextInfo(convRef.current.getContextInfo());
    } catch (e) {
      setChatState("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setAutoConnectDone(true);
    }
  };

  const handleConnect = () => void autoConnect();

  const handleProviderChange = useCallback(
    async (providerId: string) => {
      setSelProv(providerId);
      const prov = providers.find((p) => p.providerId === providerId);
      const model = prov?.models[0] ?? null;
      setSelModel(model);
      if (model && clientRef.current) {
        localStorage.setItem(CHAT_PROV_KEY, providerId);
        localStorage.setItem(CHAT_MODEL_KEY, model);
        try {
          await clientRef.current.selectProvider({
            providerId,
            modelId: model,
          });
          convRef.current = createConversation(
            clientRef.current,
            onNavigateRef,
          );
          refreshContextInfo();
        } catch {
          /* ignore */
        }
      }
    },
    [providers, refreshContextInfo],
  );

  const handleModelChange = useCallback(
    async (modelId: string) => {
      setSelModel(modelId);
      if (selProv && clientRef.current) {
        localStorage.setItem(CHAT_MODEL_KEY, modelId);
        try {
          await clientRef.current.selectProvider({
            providerId: selProv,
            modelId,
          });
          // Recreate conversation manager so it picks up new model's context window
          convRef.current = createConversation(
            clientRef.current,
            onNavigateRef,
          );
          refreshContextInfo();
        } catch {
          /* ignore */
        }
      }
    },
    [selProv, refreshContextInfo],
  );

  const handleSend = useCallback(async () => {
    const txt = chatIn.trim();
    if (!txt || streaming) return;
    const conv = convRef.current;
    if (!conv || chatState !== "connected") {
      setMsgs((p) => [
        ...p,
        { role: "user", content: txt },
        { role: "assistant", content: "⚠️ Not connected." },
      ]);
      setChatIn("");
      return;
    }
    setMsgs((p) => [...p, { role: "user", content: txt }]);
    setChatIn("");
    inputHistoryRef.current.push(txt);
    historyIndexRef.current = -1;
    draftRef.current = "";
    setStreaming(true);
    setToolState(TOOL_IDLE);
    usedToolsRef.current = [];
    let full = "";
    let isNewRound = false;
    try {
      for await (const event of conv.stream(txt)) {
        if (event.type === "chunk") {
          if (isNewRound) {
            full = "";
            isNewRound = false;
          }
          full += event.delta;
          // Only create/update the bubble when we have visible content
          if (full.trim().length > 0) {
            setMsgs((p) => {
              const last = p[p.length - 1];
              if (last?.role === "assistant")
                return [
                  ...p.slice(0, -1),
                  { role: "assistant", content: full },
                ];
              return [...p, { role: "assistant", content: full }];
            });
          }
        }
        if (event.type === "tool_priming_start") {
          setToolState({ phase: "priming" });
        }
        if (event.type === "tool_priming_match") {
          setToolState({ phase: "matched", tools: event.tools });
        }
        if (event.type === "tool_priming_end") {
          setToolState(TOOL_IDLE);
        }
        if (event.type === "tool_call") {
          // Remove the in-progress assistant bubble (it has raw tool call markup)
          setMsgs((p) => {
            const last = p[p.length - 1];
            if (last?.role === "assistant") return p.slice(0, -1);
            return p;
          });
          isNewRound = true;
          // Track which tools were used for this response
          if (!usedToolsRef.current.includes(event.name)) {
            usedToolsRef.current.push(event.name);
          }
          const detail =
            event.name === "navigate_to_page"
              ? String(event.arguments.page_id ?? "")
              : event.name === "search_docs"
                ? String(event.arguments.query ?? "")
                : undefined;
          setToolState({ phase: "executing", name: event.name, detail });
        }
        if (event.type === "tool_result") {
          setToolState({ phase: "result", name: event.name });
        }
      }
      // Final cleanup: build the definitive message list
      const tools = [...usedToolsRef.current];
      setMsgs((prev) => {
        // Remove any empty assistant bubbles from tool call stripping
        let cleaned = prev.filter(
          (m) => m.role !== "assistant" || m.content.trim().length > 0,
        );

        if (tools.length > 0) {
          const lastAssistantIdx = cleaned.reduce(
            (acc, m, idx) => (m.role === "assistant" ? idx : acc),
            -1,
          );
          const lastAssistant =
            lastAssistantIdx >= 0 ? cleaned[lastAssistantIdx] : undefined;
          if (
            lastAssistant !== undefined &&
            lastAssistant.content.trim().length > 0
          ) {
            // Tag existing final assistant message with tools used
            cleaned = cleaned.map((m) =>
              m === lastAssistant ? { ...m, usedTools: tools } : m,
            );
          } else {
            // No text response — add a friendly completion message
            const toolNames = tools.map((t) => t.replace(/_/g, " ")).join(", ");
            cleaned.push({
              role: "assistant",
              content: `Done — used ${toolNames}.`,
              usedTools: tools,
            });
          }
        } else if (!full) {
          cleaned.push({ role: "assistant", content: "(empty response)" });
        }

        return cleaned;
      });
    } catch (e) {
      setMsgs((p) => [
        ...p,
        {
          role: "assistant",
          content: `Error: ${e instanceof Error ? e.message : String(e)}`,
        },
      ]);
    } finally {
      setStreaming(false);
      setToolState(TOOL_IDLE);
      refreshContextInfo();
    }
  }, [chatIn, streaming, chatState]);

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
            color={
              chatState === "connected"
                ? "teal"
                : chatState === "connecting"
                  ? "yellow"
                  : "gray"
            }
            variant="dot"
          >
            {chatState}
          </Badge>
        </Group>
        <ActionIcon variant="subtle" size="sm" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      {/* Connection setup — only shown after auto-connect fails */}
      {chatState !== "connected" && autoConnectDone && (
        <Box
          p="md"
          style={{ borderBottom: "1px solid var(--ap-border)" }}
        >
          <Stack gap="sm">
            {chatState === "error" && (
              <Text fz="xs" c="red">
                {errorMsg}
              </Text>
            )}
            {chatState === "disconnected" && !getInjected() && (
              <Text fz="xs" c="dimmed">
                Extension not detected. Load the Arlopass extension first.
              </Text>
            )}
            <Button
              size="xs"
              leftSection={<IconPlugConnected size={14} />}
              onClick={handleConnect}
              loading={chatState === "connecting"}
              disabled={chatState === "connecting"}
              fullWidth
            >
              {chatState === "error"
                ? "Retry connection"
                : "Connect to Arlopass"}
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
          {msgs.length === 0 && (
            <Text fz="sm" c="dimmed" ta="center" py="xl">
              {chatState === "connected"
                ? "Ask anything about Arlopass."
                : "Connect to start chatting."}
            </Text>
          )}
          {msgs.map((m, i) => {
            // Skip empty assistant bubbles
            if (
              m.role === "assistant" &&
              m.content.trim().length === 0 &&
              (m.usedTools === undefined || m.usedTools.length === 0)
            )
              return null;
            return (
              <Box
                key={i}
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
          {streaming && (
            <Box ml="xs" py={4}>
              {toolState.phase === "priming" && (
                <Group gap={6} align="center">
                  <IconSearch size={12} color="var(--ap-brand)" />
                  <Text fz={11} c="blue" fw={500}>
                    Looking for tools...
                  </Text>
                  <Loader size={10} color="blue" />
                </Group>
              )}
              {toolState.phase === "matched" && (
                <Group gap={6} align="center" wrap="nowrap">
                  <IconTool size={12} color="var(--ap-success)" />
                  <Text fz={11} c="teal" fw={500}>
                    Found:
                  </Text>
                  {toolState.tools.map((t) => (
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
              {toolState.phase === "executing" && (
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
                    {toolState.name.replace(/_/g, " ")}
                  </Pill>
                  {toolState.detail && (
                    <Text fz={10} c="dimmed" truncate style={{ maxWidth: 150 }}>
                      {toolState.detail}
                    </Text>
                  )}
                </Group>
              )}
              {toolState.phase === "result" && (
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
                    {toolState.name.replace(/_/g, " ")}
                  </Pill>
                  <Text fz={10} c="teal">
                    done
                  </Text>
                </Group>
              )}
              {toolState.phase === "idle" && <Loader size="xs" />}
            </Box>
          )}
        </Stack>
      </ScrollArea>

      {/* Input area with provider/model dropdowns */}
      <Box
        p="xs"
        style={{ borderTop: "1px solid var(--ap-border)" }}
      >
        {chatState === "connected" && providers.length > 0 && (
          <Group gap={4} mb={6}>
            {/* Provider dropdown */}
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
              <Menu.Dropdown style={{ background: "var(--ap-bg-elevated)", border: "1px solid var(--ap-border)" }}>
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

            {/* Model dropdown */}
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
                  <Text fz={10} fw={500} c="var(--ap-text-secondary)">
                    {selModel ? fmtModel(selModel) : "Model"}
                  </Text>
                  <IconChevronDown size={10} color="var(--ap-text-tertiary)" />
                </Group>
              </Menu.Target>
              <Menu.Dropdown style={{ background: "var(--ap-bg-elevated)", border: "1px solid var(--ap-border)" }}>
                {(selProvider?.models ?? []).map((m) => (
                  <Menu.Item
                    key={m}
                    onClick={() => void handleModelChange(m)}
                    fw={m === selModel ? 600 : 400}
                    fz={11}
                    style={{ color: "var(--ap-text-body)" }}
                  >
                    {fmtModel(m)}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
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
                // Only navigate history when cursor is at the start
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
            disabled={chatState !== "connected"}
          />
          <ActionIcon
            size="lg"
            variant="filled"
            onClick={() => void handleSend()}
            disabled={streaming || !chatIn.trim() || chatState !== "connected"}
          >
            <IconSend size={16} />
          </ActionIcon>
        </Group>

        {/* Context window indicator (Cursor-style) */}
        {chatState === "connected" && contextInfo !== null && (
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

// ─── ConversationManager factory with search_docs tool ───────────────

const CHAT_SYSTEM_PROMPT = `You are a helpful assistant for the Arlopass Wallet documentation website. You answer questions about the Arlopass extension, web SDK, providers, app connections, credentials, and how to integrate with Arlopass.

When the user asks about Arlopass features, SDK usage, providers, or integration, use the search_docs tool to find relevant documentation before answering.
When the user asks to see a specific page, demo, or example, use the navigate_to_page tool to take them there.

Important:
- Be concise and accurate
- Include code examples when relevant
- Reference specific Arlopass concepts (providers, models, vault, app connections)
- If asked about implementation, show @arlopass/web-sdk TypeScript code`;

function createConversation(
  client: ArlopassClient,
  onNavigateRef: React.RefObject<((pageId: string) => void) | undefined>,
): ConversationManager {
  const allPageIds = NAVIGATION.flatMap((cat) =>
    cat.items.map((item) => item.id),
  );
  const allItems = NAVIGATION.flatMap((cat) =>
    cat.items.map((item) => ({ ...item, category: cat.label })),
  );
  const pageList = allItems
    .map((item) => `${item.id}: ${item.label} (${item.category})`)
    .join(", ");

  // Fuzzy match: accept both full path IDs and short names
  function resolvePageId(input: string): string | null {
    // Exact match
    if (allPageIds.includes(input)) return input;
    // Match by last segment (e.g., "welcome" → "getting-started/welcome")
    const bySegment = allPageIds.find((id) => id.endsWith(`/${input}`));
    if (bySegment) return bySegment;
    // Match by label (case-insensitive)
    const lower = input.toLowerCase();
    const byLabel = allItems.find((item) => item.label.toLowerCase() === lower);
    if (byLabel) return byLabel.id;
    // Partial match on label
    const byPartial = allItems.find((item) =>
      item.label.toLowerCase().includes(lower),
    );
    if (byPartial) return byPartial.id;
    return null;
  }

  return new ConversationManager({
    client,
    systemPrompt: CHAT_SYSTEM_PROMPT,
    primeTools: true,
    hideToolCalls: true,
    tools: [
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
    ],
    maxToolRounds: 3,
  });
}
