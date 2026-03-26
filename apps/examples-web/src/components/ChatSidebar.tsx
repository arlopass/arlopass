import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Menu,
  ScrollArea,
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import {
  IconChevronDown,
  IconMessage,
  IconPlugConnected,
  IconSend,
  IconX,
} from "@tabler/icons-react";
import {
  BYOMClient,
  type BYOMTransport,
  type ChatMessage,
  type ProviderDescriptor,
} from "@byom-ai/web-sdk";
import { buildSystemPrompt } from "../docs-context";
import { Markdown } from "./Markdown";

type ChatState = "disconnected" | "connecting" | "connected" | "error";

const CHAT_PROV_KEY = "byom.examples.chat.lastProvider";
const CHAT_MODEL_KEY = "byom.examples.chat.lastModel";

function getInjected(): BYOMTransport | null {
  return (window as Window & { byom?: BYOMTransport }).byom ?? null;
}

function fmtModel(m: string): string {
  return m.split(/[-_.]/g).filter(Boolean).map((p) => p.length <= 3 ? p.toUpperCase() : p[0]!.toUpperCase() + p.slice(1)).join(" ");
}

export type ChatSidebarProps = {
  onClose: () => void;
};

export function ChatSidebar({ onClose }: ChatSidebarProps) {
  const clientRef = useRef<BYOMClient | null>(null);
  const [chatState, setChatState] = useState<ChatState>("connecting"); // start as connecting to avoid flash
  const [autoConnectDone, setAutoConnectDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [providers, setProviders] = useState<readonly ProviderDescriptor[]>([]);
  const [selProv, setSelProv] = useState<string | null>(null);
  const [selModel, setSelModel] = useState<string | null>(null);
  const [chatIn, setChatIn] = useState("");
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selProvider = useMemo(() => providers.find((p) => p.providerId === selProv) ?? null, [providers, selProv]);
  const provOpts = useMemo(() => providers.map((p) => ({ value: p.providerId, label: p.providerName })), [providers]);
  const modelOpts = useMemo(() => (selProvider?.models ?? []).map((m) => ({ value: m, label: fmtModel(m) })), [selProvider]);

  // Auto-scroll on new messages
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [msgs]);

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
      const client = new BYOMClient({ transport, origin: window.location.origin, timeoutMs: 120_000 });
      await client.connect({ appId: "com.byom.examples.chat", origin: window.location.origin });
      clientRef.current = client;
      const { providers: provList } = await client.listProviders();
      setProviders(provList);

      const lastProv = localStorage.getItem(CHAT_PROV_KEY);
      const lastModel = localStorage.getItem(CHAT_MODEL_KEY);
      const matchedProv = provList.find((p) => p.providerId === lastProv) ?? provList[0];
      if (matchedProv) {
        setSelProv(matchedProv.providerId);
        const matchedModel = lastModel && matchedProv.models.includes(lastModel) ? lastModel : matchedProv.models[0];
        if (matchedModel) {
          setSelModel(matchedModel);
          await client.selectProvider({ providerId: matchedProv.providerId, modelId: matchedModel });
        }
      }
      setChatState("connected");
    } catch (e) {
      setChatState("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setAutoConnectDone(true);
    }
  };

  const handleConnect = () => void autoConnect();

  const handleProviderChange = useCallback(async (providerId: string) => {
    setSelProv(providerId);
    const prov = providers.find((p) => p.providerId === providerId);
    const model = prov?.models[0] ?? null;
    setSelModel(model);
    if (model && clientRef.current) {
      localStorage.setItem(CHAT_PROV_KEY, providerId);
      localStorage.setItem(CHAT_MODEL_KEY, model);
      try { await clientRef.current.selectProvider({ providerId, modelId: model }); } catch { /* ignore */ }
    }
  }, [providers]);

  const handleModelChange = useCallback(async (modelId: string) => {
    setSelModel(modelId);
    if (selProv && clientRef.current) {
      localStorage.setItem(CHAT_MODEL_KEY, modelId);
      try { await clientRef.current.selectProvider({ providerId: selProv, modelId }); } catch { /* ignore */ }
    }
  }, [selProv]);

  const handleSend = useCallback(async () => {
    const txt = chatIn.trim();
    if (!txt || streaming) return;
    const c = clientRef.current;
    if (!c || chatState !== "connected") {
      setMsgs((p) => [...p, { role: "user", content: txt }, { role: "assistant", content: "⚠️ Not connected." }]);
      setChatIn(""); return;
    }
    setMsgs((p) => [...p, { role: "user", content: txt }]);
    setChatIn("");
    setStreaming(true);
    let full = "";
    try {
      const systemPrompt = buildSystemPrompt(txt);
      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...msgs.slice(-10),
        { role: "user", content: txt },
      ];
      const stream = await c.chat.stream({ messages });
      for await (const ch of stream) {
        if (ch.type === "chunk") {
          full += ch.delta;
          setMsgs((p) => {
            const last = p[p.length - 1];
            if (last?.role === "assistant") return [...p.slice(0, -1), { role: "assistant", content: full }];
            return [...p, { role: "assistant", content: full }];
          });
        }
        if (ch.type === "done") break;
      }
      if (!full) setMsgs((p) => [...p, { role: "assistant", content: "(empty response)" }]);
    } catch (e) {
      setMsgs((p) => [...p, { role: "assistant", content: `Error: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setStreaming(false);
    }
  }, [chatIn, msgs, streaming, chatState]);

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <Stack h="100%" gap={0}>
      {/* Header */}
      <Group h={52} px="md" justify="space-between" style={{ borderBottom: "1px solid var(--mantine-color-gray-3)" }}>
        <Group gap="xs">
          <IconMessage size={16} />
          <Text fw={600} fz="sm">AI Chat</Text>
          <Badge size="xs" color={chatState === "connected" ? "teal" : chatState === "connecting" ? "yellow" : "gray"} variant="dot">
            {chatState}
          </Badge>
        </Group>
        <ActionIcon variant="subtle" size="sm" onClick={onClose}><IconX size={14} /></ActionIcon>
      </Group>

      {/* Connection setup — only shown after auto-connect fails */}
      {chatState !== "connected" && autoConnectDone && (
        <Box p="md" style={{ borderBottom: "1px solid var(--mantine-color-gray-3)" }}>
          <Stack gap="sm">
            {chatState === "error" && (
              <Text fz="xs" c="red">{errorMsg}</Text>
            )}
            {chatState === "disconnected" && !getInjected() && (
              <Text fz="xs" c="dimmed">Extension not detected. Load the BYOM extension first.</Text>
            )}
            <Button
              size="xs"
              leftSection={<IconPlugConnected size={14} />}
              onClick={handleConnect}
              loading={chatState === "connecting"}
              disabled={chatState === "connecting"}
              fullWidth
            >
              {chatState === "error" ? "Retry connection" : "Connect to BYOM"}
            </Button>
          </Stack>
        </Box>
      )}

      {/* Messages */}
      <ScrollArea style={{ flex: 1 }} p="xs" type="scroll" viewportRef={scrollRef}>
        <Stack gap="xs">
          {msgs.length === 0 && (
            <Text fz="sm" c="dimmed" ta="center" py="xl">
              {chatState === "connected" ? "Ask anything about BYOM." : "Connect to start chatting."}
            </Text>
          )}
          {msgs.map((m, i) => (
            <Box
              key={i}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: m.role === "user" ? "var(--mantine-color-blue-0)" : "var(--mantine-color-gray-0)",
                maxWidth: "90%",
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              {m.role === "assistant" ? (
                <Markdown content={m.content} className="chat-markdown" />
              ) : (
                <Text fz="sm" style={{ whiteSpace: "pre-wrap" }}>{m.content}</Text>
              )}
            </Box>
          ))}
          {streaming && <Loader size="xs" ml="xs" />}
        </Stack>
      </ScrollArea>

      {/* Input area with provider/model dropdowns */}
      <Box p="xs" style={{ borderTop: "1px solid var(--mantine-color-gray-3)" }}>
        {chatState === "connected" && providers.length > 0 && (
          <Group gap={4} mb={6}>
            {/* Provider dropdown */}
            <Menu shadow="sm" position="top-start" withinPortal>
              <Menu.Target>
                <Group gap={2} style={{ cursor: "pointer", padding: "2px 8px", borderRadius: 4, background: "var(--mantine-color-gray-1)" }}>
                  <Text fz={10} fw={600}>{selProvider?.providerName ?? "Provider"}</Text>
                  <IconChevronDown size={10} />
                </Group>
              </Menu.Target>
              <Menu.Dropdown>
                {providers.map((p) => (
                  <Menu.Item key={p.providerId} onClick={() => void handleProviderChange(p.providerId)} fw={p.providerId === selProv ? 600 : 400} fz="sm">
                    {p.providerName}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>

            {/* Model dropdown */}
            <Menu shadow="sm" position="top-start" withinPortal>
              <Menu.Target>
                <Group gap={2} style={{ cursor: "pointer", padding: "2px 8px", borderRadius: 4, background: "var(--mantine-color-gray-1)" }}>
                  <Text fz={10} fw={500}>{selModel ? fmtModel(selModel) : "Model"}</Text>
                  <IconChevronDown size={10} color="gray" />
                </Group>
              </Menu.Target>
              <Menu.Dropdown>
                {(selProvider?.models ?? []).map((m) => (
                  <Menu.Item key={m} onClick={() => void handleModelChange(m)} fw={m === selModel ? 600 : 400} fz="sm">
                    {fmtModel(m)}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          </Group>
        )}

        <Group gap="xs" align="flex-end">
          <Textarea
            placeholder="Ask about BYOM..."
            value={chatIn}
            onChange={(e) => setChatIn(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
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
      </Box>
    </Stack>
  );
}
