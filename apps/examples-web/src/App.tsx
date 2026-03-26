import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  AppShell,
  Badge,
  Box,
  Burger,
  Button,
  Card,
  Code,
  Group,
  List,
  Loader,
  NavLink,
  ScrollArea,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconMessage } from "@tabler/icons-react";
import {
  BYOMClient,
  BYOMSDKError,
  ConversationManager,
  type BYOMTransport,
  type ChatMessage,
  type ProviderDescriptor,
  type ConversationStreamEvent,
} from "@byom-ai/web-sdk";

import { createDemoTransport, getInjectedTransport, type DemoTransportMode } from "./demo-transport";
import { EXTENSION_SNIPPET, SCENARIO_CATALOG } from "./scenario-catalog";
import { NAVIGATION } from "./navigation";
import { CodeBlock, PreviewCode, TabGroup, Callout, InlineCode, ChatSidebar } from "./components";

/* ─── Types ─────────────────────────────────────────────────────────── */

type TransportProfile = "auto" | "injected" | DemoTransportMode;
type Feedback = Readonly<{ kind: "success" | "error" | "info"; title: string; message: string }>;
type LogEntry = Readonly<{ id: string; at: string; level: "info" | "success" | "error"; message: string; details?: string }>;

const TRANSPORT_OPTIONS: readonly { value: TransportProfile; label: string }[] = [
  { value: "auto", label: "Auto (Injected → Mock)" },
  { value: "injected", label: "Injected extension transport" },
  { value: "mock", label: "Mock bridge transport" },
  { value: "slow", label: "Slow transport (timeout demo)" },
  { value: "failure", label: "Failure transport (typed error demo)" },
];

/* ─── Helpers ───────────────────────────────────────────────────────── */

const logId = () => typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `l.${Date.now()}.${Math.random().toString(36).slice(2)}`;
const ts = () => new Date().toLocaleTimeString();
const fmtModel = (m: string) => m.split(/[-_.]/g).filter(Boolean).map((p) => p.length <= 3 ? p.toUpperCase() : p[0]!.toUpperCase() + p.slice(1)).join(" ");
const errStr = (e: unknown) => e instanceof BYOMSDKError ? `${e.machineCode} | ${e.reasonCode} | retryable=${String(e.retryable)}` : e instanceof Error ? e.message : String(e);
const errFb = (ctx: string, e: unknown): Feedback => ({ kind: "error", title: `${ctx} failed`, message: e instanceof BYOMSDKError ? `${e.message} (${e.reasonCode})` : e instanceof Error ? e.message : String(e) });

function resolve(profile: TransportProfile): { transport: BYOMTransport; source: string; warning?: string } {
  const inj = getInjectedTransport();
  if (profile === "injected") { if (!inj) throw new Error("window.byom not found."); return { transport: inj, source: "Injected extension" }; }
  if (profile === "auto") { if (inj) return { transport: inj, source: "Injected extension" }; return { transport: createDemoTransport("mock"), source: "Demo mock", warning: "window.byom unavailable — using demo transport." }; }
  return { transport: createDemoTransport(profile), source: `Demo ${profile}` };
}

/* ─── App ───────────────────────────────────────────────────────────── */

export default function App() {
  const [navOpen, { toggle: toggleNav }] = useDisclosure(true);
  const [chatOpen, { toggle: toggleChat }] = useDisclosure(true);
  const [page, setPage] = useState("welcome");

  const clientRef = useRef<BYOMClient | null>(null);
  const [tp, setTp] = useState<TransportProfile>("auto");
  const [appId, setAppId] = useState("com.byom.examples.app");
  const [originOv, setOriginOv] = useState("");
  const [fb, setFb] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tpSrc, setTpSrc] = useState("Not connected");
  const [sid, setSid] = useState<string | null>(null);
  const [state, setState] = useState("disconnected");
  const [caps, setCaps] = useState<readonly string[]>([]);
  const [provs, setProvs] = useState<readonly ProviderDescriptor[]>([]);
  const [selProv, setSelProv] = useState<string | null>(null);
  const [selModel, setSelModel] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("Explain how BYOM protects provider credentials.");
  const [history, setHistory] = useState<readonly ChatMessage[]>([]);
  const [preview, setPreview] = useState("");
  const [logs, setLogs] = useState<readonly LogEntry[]>([]);
  const [convHistory, setConvHistory] = useState<readonly ChatMessage[]>([]);
  const [convTokens, setConvTokens] = useState(0);
  const [toolLog, setToolLog] = useState<string[]>([]);
  const [injAvail, setInjAvail] = useState(() => getInjectedTransport() !== null);

  useEffect(() => {
    const r = () => setInjAvail(getInjectedTransport() !== null);
    r(); window.addEventListener("byom:injected", r as EventListener); window.addEventListener("focus", r);
    return () => { window.removeEventListener("byom:injected", r as EventListener); window.removeEventListener("focus", r); };
  }, []);

  const isBusy = busy !== null;
  const sp = useMemo(() => provs.find((p) => p.providerId === selProv) ?? null, [provs, selProv]);
  const modelOpts = useMemo(() => (sp?.models ?? []).map((m) => ({ value: m, label: `${fmtModel(m)} (${m})` })), [sp]);
  const provOpts = useMemo(() => provs.map((p) => ({ value: p.providerId, label: `${p.providerName} · ${p.models.length} model(s)` })), [provs]);

  const log = (level: LogEntry["level"], msg: string, det?: string) => setLogs((p) => [{ id: logId(), at: ts(), level, message: msg, ...(det ? { details: det } : {}) }, ...p].slice(0, 120));
  const syncState = () => setState(clientRef.current?.state ?? "disconnected");

  const run = async (name: string, op: () => Promise<void>) => {
    if (busy) return; setBusy(name);
    try { await op(); } catch (e) { setFb(errFb(name, e)); log("error", `${name} failed`, errStr(e)); }
    finally { setBusy(null); syncState(); setInjAvail(getInjectedTransport() !== null); }
  };

  /* operations */
  const doConnect = async () => {
    await clientRef.current?.disconnect().catch(() => {});
    const r = resolve(tp);
    const origin = originOv.trim() || window.location.origin;
    const tMs = tp === "slow" ? 1500 : tp === "injected" || tp === "auto" ? 120000 : 6000;
    const c = new BYOMClient({ transport: r.transport, origin, timeoutMs: tMs });
    const res = await c.connect({ appId, origin });
    clientRef.current = c; setSid(res.sessionId); setCaps(res.capabilities); setTpSrc(r.source);
    setFb({ kind: "success", title: "Connected", message: `Session ${res.sessionId}` });
    log("success", `Connected via ${r.source}`);
    if (r.warning) { setFb({ kind: "info", title: "Fallback", message: r.warning }); log("info", "Fallback", r.warning); }
  };

  const doList = async () => {
    const c = clientRef.current; if (!c) throw new Error("Connect first.");
    const r = await c.listProviders(); setProvs(r.providers);
    const f = r.providers[0]; setSelProv(f?.providerId ?? null); setSelModel(f?.models[0] ?? null);
    log("success", `${r.providers.length} providers`); setFb({ kind: "success", title: "Providers listed", message: `${r.providers.length} available` });
    return f && f.models[0] ? { providerId: f.providerId, modelId: f.models[0] } : null;
  };

  const doSelect = async (pId?: string, mId?: string) => {
    const c = clientRef.current; if (!c) throw new Error("Connect first.");
    const p = pId ?? selProv, m = mId ?? selModel; if (!p || !m) throw new Error("Select provider/model.");
    const r = await c.selectProvider({ providerId: p, modelId: m });
    setFb({ kind: "success", title: "Selected", message: `${r.providerId}/${r.modelId}` }); log("success", `Selected ${r.providerId}/${r.modelId}`);
  };

  const doSend = async (msgs?: ChatMessage[]) => {
    const c = clientRef.current; if (!c) throw new Error("Connect first.");
    const m = msgs ?? [...history, { role: "user" as const, content: prompt }]; if (!msgs) setHistory(m);
    const r = await c.chat.send({ messages: m }); setHistory((p) => [...p, r.message]);
    log("success", `Response (${r.message.content.length} chars)`);
  };

  const doStream = async (msgs?: ChatMessage[]) => {
    const c = clientRef.current; if (!c) throw new Error("Connect first.");
    const m = msgs ?? [...history, { role: "user" as const, content: prompt }]; if (!msgs) setHistory(m);
    setPreview(""); let full = "";
    const s = await c.chat.stream({ messages: m });
    for await (const ch of s) { if (ch.type === "chunk") { full += ch.delta; setPreview(full); } if (ch.type === "done") break; }
    if (full) { setHistory((p) => [...p, { role: "assistant", content: full }]); log("success", "Stream done"); }
  };

  const doDisconnect = async () => {
    await clientRef.current?.disconnect(); clientRef.current = null;
    setSid(null); setCaps([]); setProvs([]); setSelProv(null); setSelModel(null); setHistory([]); setPreview("");
    setFb({ kind: "info", title: "Disconnected", message: "Session ended." }); log("info", "Disconnected");
  };

  const happyPath = () => run("Happy path", async () => {
    await doConnect(); const s = await doList();
    if (s) { await doSelect(s.providerId, s.modelId); await doSend([{ role: "user", content: "Summarize BYOM in one paragraph." }]); }
  });

  /* chat sidebar */
  /* ─── Render ───────────────────────────────────────────────────── */
  return (
    <AppShell
      header={{ height: 52 }}
      navbar={{ width: 240, breakpoint: "sm", collapsed: { mobile: !navOpen, desktop: !navOpen } }}
      aside={{ width: chatOpen ? 340 : 0, breakpoint: "sm", collapsed: { mobile: !chatOpen, desktop: !chatOpen } }}
      padding={0}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={navOpen} onClick={toggleNav} size="sm" />
            <Title order={4} fw={700}>BYOM Examples</Title>
            <Badge size="sm" color={state === "connected" ? "teal" : "gray"} variant="light">{state}</Badge>
          </Group>
          <Group gap="xs">
            {injAvail && <Badge size="xs" color="teal" variant="dot">Extension</Badge>}
            <Tooltip label={chatOpen ? "Close chat" : "Open AI chat"}>
              <ActionIcon variant="subtle" onClick={toggleChat} size="lg"><IconMessage size={20} /></ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      {/* Left nav */}
      <AppShell.Navbar p="xs">
        <AppShell.Section grow component={ScrollArea} type="scroll" scrollbarSize={6}>
          {NAVIGATION.map((cat) => (
            <Box key={cat.label} mb="xs">
              <Text fz="xs" fw={700} c="dimmed" tt="uppercase" mb={4} px="xs">{cat.label}</Text>
              {cat.items.map((item) => (
                <NavLink key={item.id} label={item.label} active={page === item.id} onClick={() => setPage(item.id)} variant="light" fz="sm" py={6} />
              ))}
            </Box>
          ))}
        </AppShell.Section>
      </AppShell.Navbar>

      {/* Main content */}
      <AppShell.Main>
        <ScrollArea h="calc(100vh - 52px)" p="lg" type="scroll">
          <Box maw={800} mx="auto">
            {fb && (
              <Alert color={fb.kind === "success" ? "teal" : fb.kind === "error" ? "red" : "blue"} mb="md" withCloseButton onClose={() => setFb(null)}>
                <Text fw={600}>{fb.title}</Text><Text fz="sm">{fb.message}</Text>
              </Alert>
            )}

            {page === "welcome" && (
              <Stack gap="lg">
                <Title order={2}>BYOM Examples</Title>
                <Text c="dimmed">Interactive examples for the BYOM AI Wallet extension and web SDK.</Text>
                <Callout type="tip" title="Quick Start">
                  <List spacing="xs" fz="sm">
                    <List.Item>Install the BYOM extension</List.Item>
                    <List.Item>Go to Connection and click Connect</List.Item>
                    <List.Item>List providers, select one</List.Item>
                    <List.Item>Try chat or streaming</List.Item>
                  </List>
                </Callout>

                <PreviewCode
                  preview={
                    <Stack gap="sm">
                      <Text fz="sm">Click the button to run the full SDK happy-path: connect → list providers → select → chat.</Text>
                      <Button onClick={happyPath} loading={isBusy}>Run happy-path demo</Button>
                      {sid && <Badge color="teal" variant="light">Connected: {sid}</Badge>}
                    </Stack>
                  }
                  code={`import { BYOMClient } from "@byom-ai/web-sdk";

const client = new BYOMClient({
  transport: window.byom,
  origin: window.location.origin,
});

// Connect
await client.connect({ appId: "com.byom.examples.app" });

// List and select provider
const { providers } = await client.listProviders();
await client.selectProvider({
  providerId: providers[0].providerId,
  modelId: providers[0].models[0],
});

// Send a chat message
const reply = await client.chat.send({
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(reply.message.content);`}
                  title="happy-path.ts"
                  onRun={happyPath}
                />
              </Stack>
            )}

            {page === "quickstart" && (
              <Stack gap="lg">
                <Title order={2}>Quickstart</Title>
                <Text>The fastest way to integrate BYOM into your web app. The extension injects <InlineCode>window.byom</InlineCode> as a transport layer.</Text>
                <CodeBlock
                  title="quickstart.ts"
                  variants={[
                    { sdkId: "web-sdk-ts", code: EXTENSION_SNIPPET },
                  ]}
                />
                <Callout type="info">
                  The <InlineCode>BYOMClient</InlineCode> handles session management, provider selection, and chat routing automatically.
                </Callout>
              </Stack>
            )}

            {page === "connection" && (
              <Stack gap="lg"><Title order={2}>Connection</Title>
                <Card withBorder><Stack gap="sm">
                  <Select label="Transport" data={TRANSPORT_OPTIONS as any} value={tp} onChange={(v) => v && setTp(v as TransportProfile)} />
                  <TextInput label="App ID" value={appId} onChange={(e) => setAppId(e.currentTarget.value)} />
                  <TextInput label="Origin (optional)" value={originOv} onChange={(e) => setOriginOv(e.currentTarget.value)} placeholder={window.location.origin} />
                  <Group gap="xs">
                    <Button onClick={() => run("Connect", doConnect)} loading={busy === "Connect"} disabled={isBusy}>Connect</Button>
                    <Button variant="outline" onClick={() => run("Disconnect", doDisconnect)} disabled={!sid || isBusy}>Disconnect</Button>
                  </Group>
                  {sid && <Stack gap={4}><Text fz="xs" c="dimmed">Session: {sid}</Text><Text fz="xs" c="dimmed">Transport: {tpSrc}</Text><Group gap={4}>{caps.map((c) => <Badge key={c} size="xs" variant="light">{c}</Badge>)}</Group></Stack>}
                </Stack></Card>
              </Stack>
            )}

            {page === "playground" && (
              <Stack gap="lg"><Title order={2}>Playground</Title>
                <Card withBorder><Stack gap="sm">
                  <Textarea label="Prompt" value={prompt} onChange={(e) => setPrompt(e.currentTarget.value)} minRows={3} autosize />
                  <Group gap="xs">
                    <Button onClick={() => run("Send", () => doSend())} loading={busy === "Send"} disabled={isBusy || !sid}>Send</Button>
                    <Button variant="light" onClick={() => run("Stream", () => doStream())} loading={busy === "Stream"} disabled={isBusy || !sid}>Stream</Button>
                  </Group>
                  {preview && <Card withBorder bg="gray.0" p="xs"><Text fz="sm" style={{ whiteSpace: "pre-wrap" }}>{preview}</Text></Card>}
                </Stack></Card>
              </Stack>
            )}

            {page === "chat" && (
              <Stack gap="lg"><Title order={2}>Chat Transcript</Title>
                {history.length === 0 && <Text c="dimmed">No messages. Use Playground.</Text>}
                <Stack gap="xs">{history.map((m, i) => <Card key={i} withBorder p="xs"><Badge size="xs" color={m.role === "user" ? "blue" : "green"} mb={4}>{m.role}</Badge><Text fz="sm" style={{ whiteSpace: "pre-wrap" }}>{m.content}</Text></Card>)}</Stack>
                {history.length > 0 && <Button variant="subtle" size="xs" onClick={() => setHistory([])}>Clear</Button>}
              </Stack>
            )}

            {page === "streaming" && (
              <Stack gap="lg"><Title order={2}>Streaming</Title><Text c="dimmed">Real-time chunked responses.</Text>
                <Card withBorder><Stack gap="sm">
                  <Textarea label="Prompt" value={prompt} onChange={(e) => setPrompt(e.currentTarget.value)} minRows={2} autosize />
                  <Button onClick={() => run("Stream", () => doStream())} loading={busy === "Stream"} disabled={isBusy || !sid}>Stream</Button>
                  {preview && <Card withBorder bg="gray.0" p="xs"><ScrollArea h={200}><Text fz="sm" style={{ whiteSpace: "pre-wrap" }}>{preview}</Text></ScrollArea></Card>}
                </Stack></Card>
              </Stack>
            )}

            {page === "providers" && (
              <Stack gap="lg"><Title order={2}>Providers</Title>
                <Card withBorder><Stack gap="sm">
                  <Button onClick={() => run("List", async () => { await doList(); })} loading={busy === "List"} disabled={isBusy || !sid}>List Providers</Button>
                  <Select label="Provider" data={provOpts as any} value={selProv} onChange={(v) => { setSelProv(v); setSelModel(null); }} />
                  <Select label="Model" data={modelOpts as any} value={selModel} onChange={(v) => setSelModel(v)} />
                  <Button onClick={() => run("Select", () => doSelect())} disabled={isBusy || !selProv || !selModel}>Select</Button>
                </Stack></Card>
              </Stack>
            )}

            {page === "conversation-manager" && (
              <Stack gap="lg">
                <Title order={2}>Conversation Manager</Title>
                <Text c="dimmed">
                  Automatic conversation history management with token-aware truncation, message pinning, and optional auto-summarization.
                </Text>

                <Callout type="info" title="What it does">
                  <List spacing="xs" fz="sm">
                    <List.Item>Tracks conversation history automatically across send/stream calls</List.Item>
                    <List.Item>Truncates oldest messages when context window fills up</List.Item>
                    <List.Item>Pins important messages so they survive truncation</List.Item>
                    <List.Item>Optionally summarizes evicted messages instead of dropping them</List.Item>
                    <List.Item>Resolves model context window from a built-in lookup table or developer override</List.Item>
                  </List>
                </Callout>

                <CodeBlock
                  title="conversation-manager-basic.ts"
                  code={`import { BYOMClient, ConversationManager } from "@byom-ai/web-sdk";

const client = new BYOMClient({ transport: window.byom, origin: location.origin });
await client.connect({ appId: "com.example.app" });
await client.selectProvider({ providerId: "...", modelId: "..." });

// Create manager — auto-resolves context window for the selected model
const conversation = new ConversationManager({
  client,
  systemPrompt: "You are a helpful coding assistant.",
  // maxTokens: 8192,  // optional override
});

// Send messages — history managed automatically
const reply1 = await conversation.send("What is a closure?");
console.log(reply1.content);

// Conversation continues with full context
const reply2 = await conversation.send("Show me an example.");
console.log(reply2.content);

// Pin important context that should never be evicted
conversation.addMessage(
  { role: "user", content: "We are using React 19 + TypeScript." },
  { pinned: true },
);

// Check what would be sent in the next request
console.log("Context window:", conversation.getContextWindow());
console.log("Token usage:", conversation.getTokenCount());`}
                />

                <CodeBlock
                  title="conversation-manager-streaming.ts"
                  code={`// Streaming works the same way
for await (const event of conversation.stream("Explain useEffect.")) {
  if (event.type === "chunk") process.stdout.write(event.delta);
}
// History updated automatically after stream completes`}
                />

                <CodeBlock
                  title="conversation-manager-summarization.ts"
                  code={`// Enable auto-summarization — evicted messages get summarized
const conversation = new ConversationManager({
  client,
  systemPrompt: "You are a code reviewer.",
  summarize: true,
  summarizationPrompt: "Summarize focusing on code decisions and variable names.",
});

// After many messages, old ones are summarized into a pinned recap
// instead of being silently dropped`}
                />

                <PreviewCode
                  preview={
                    <Stack gap="sm">
                      <Text fz="sm">Try the ConversationManager live (requires connection).</Text>
                      <Textarea
                        label="Message"
                        value={prompt}
                        onChange={(e) => setPrompt(e.currentTarget.value)}
                        minRows={2}
                        autosize
                      />
                      <Group gap="xs">
                        <Button
                          disabled={isBusy || !sid}
                          loading={busy === "ConvSend"}
                          onClick={() => run("ConvSend", async () => {
                            const c = clientRef.current;
                            if (!c) throw new Error("Connect first.");
                            const conv = new ConversationManager({ client: c, maxTokens: 8192, systemPrompt: "You are helpful." });
                            // Replay existing history
                            for (const m of convHistory) conv.addMessage(m);
                            const reply = await conv.send(prompt);
                            setConvHistory(conv.getMessages());
                            setConvTokens(conv.getTokenCount());
                            log("success", `ConvManager reply (${String(reply.content.length)} chars, ${String(conv.getTokenCount())} tokens)`);
                          })}
                        >
                          Send via ConversationManager
                        </Button>
                        <Button variant="subtle" size="xs" onClick={() => { setConvHistory([]); setConvTokens(0); }}>Clear</Button>
                      </Group>
                      {convTokens > 0 && <Badge size="sm" variant="light">{convTokens} tokens in context</Badge>}
                      {convHistory.length > 0 && (
                        <Stack gap={4}>
                          {convHistory.map((m, i) => (
                            <Card key={i} withBorder p="xs">
                              <Badge size="xs" color={m.role === "user" ? "blue" : m.role === "system" ? "gray" : "green"} mb={4}>{m.role}</Badge>
                              <Text fz="xs" style={{ whiteSpace: "pre-wrap" }} lineClamp={4}>{m.content}</Text>
                            </Card>
                          ))}
                        </Stack>
                      )}
                    </Stack>
                  }
                  code={`const conv = new ConversationManager({
  client,
  maxTokens: 8192,
  systemPrompt: "You are helpful.",
});

const reply = await conv.send("${prompt}");
console.log(reply.content);
console.log("Tokens:", conv.getTokenCount());`}
                  title="live-conversation-manager.ts"
                />
              </Stack>
            )}

            {page === "tool-calling" && (
              <Stack gap="lg">
                <Title order={2}>Tool / Function Calling</Title>
                <Text c="dimmed">
                  Let the model call your functions during a conversation. The SDK manages the tool-call → execute → result → continue loop.
                </Text>

                <Callout type="info" title="How it works">
                  <List spacing="xs" fz="sm">
                    <List.Item>Define tools with name, description, JSON Schema parameters, and an optional handler function</List.Item>
                    <List.Item>The SDK injects tool definitions into the system prompt automatically</List.Item>
                    <List.Item>When the model responds with {"<tool_call>"} XML tags, the SDK parses and executes the handler</List.Item>
                    <List.Item>Tool results are fed back to the model, which continues until it produces a text response</List.Item>
                    <List.Item>Works with ALL providers (Ollama, Anthropic, CLI) — no adapter changes needed</List.Item>
                  </List>
                </Callout>

                <CodeBlock
                  title="auto-tool-calling.ts"
                  code={`import { ConversationManager } from "@byom-ai/web-sdk";

const conversation = new ConversationManager({
  client,
  systemPrompt: "You are a research assistant.",
  tools: [
    {
      name: "search_docs",
      description: "Search the documentation for relevant pages",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
      // Auto-execute handler — SDK calls this automatically
      handler: async (args) => {
        const results = await fetch(\`/api/search?q=\${args.query}\`);
        return JSON.stringify(await results.json());
      },
    },
  ],
});

// The model will call search_docs if it needs to look something up
const reply = await conversation.send("Find docs about authentication");
// reply.content already includes info from the search results`}
                />

                <CodeBlock
                  title="manual-tool-calling.ts"
                  code={`// Manual mode — you control tool execution via stream events
const conversation = new ConversationManager({
  client,
  tools: [
    {
      name: "confirm_action",
      description: "Ask user to confirm a dangerous action",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action to confirm" },
        },
      },
      // No handler → manual mode
    },
  ],
});

for await (const event of conversation.stream("Delete all logs")) {
  if (event.type === "tool_call") {
    // Show confirmation dialog to user
    const confirmed = await showConfirmDialog(event.arguments.action);
    conversation.submitToolResult(
      event.toolCallId,
      JSON.stringify({ confirmed }),
    );
  }
  if (event.type === "chunk") {
    process.stdout.write(event.delta);
  }
}`}
                />

                <CodeBlock
                  title="mixed-mode.ts"
                  code={`// Mix auto + manual tools — handlers auto-execute, others pause
const conversation = new ConversationManager({
  client,
  tools: [
    {
      name: "search",
      description: "Search docs",
      handler: async (args) => searchDocs(args.query), // auto
    },
    {
      name: "confirm",
      description: "User confirmation",
      // no handler → manual via stream events
    },
  ],
  maxToolRounds: 5, // safety limit on tool call loops
});`}
                />

                <Title order={3} mt="md">Tool Priming</Title>
                <Text c="dimmed" fz="sm">
                  Small models often fail to use the correct tool call format. Tool priming sends a focused
                  preliminary message that instructs the model to select and call the right tool.
                  Three layers: auto-detect (zero cost), ConversationManager-level, and per-message.
                </Text>

                <CodeBlock
                  title="tool-priming.ts"
                  code={`// Layer 1: Auto-detect (always on, zero LLM cost)
// The SDK scans user messages for tool name fragments and
// parameter values — priming triggers automatically when relevant.

// Layer 2: Enable for all messages
const conversation = new ConversationManager({
  client,
  primeTools: true, // ← priming for every message
  tools: [...],
});

// Layer 3: Enable per message
await conversation.send("Navigate to streaming", {
  primeTools: true, // ← just this message
});`}
                />

                <Title order={3} mt="md">Hide Tool Call Markup</Title>
                <Text c="dimmed" fz="sm">
                  By default, tool call XML tags are visible in responses. Enable hideToolCalls
                  to strip them — the conversation history stays clean.
                </Text>

                <CodeBlock
                  title="hide-tool-calls.ts"
                  code={`const conversation = new ConversationManager({
  client,
  tools: [...],
  hideToolCalls: true, // strip <tool_call> markup from stored messages
});

// Per-message override
await conversation.send("search for closures", {
  hideToolCalls: true,
});

// getMessages() returns clean text without XML tags`}
                />

                <Title order={3} mt="md">Match Ranges &amp; Highlighting</Title>
                <Text c="dimmed" fz="sm">
                  Every tool call includes a matchRange with character indices in the original response.
                  Use this to highlight, annotate, or strip tool calls in custom UI.
                </Text>

                <CodeBlock
                  title="match-ranges.ts"
                  code={`import { parseToolCalls, stripToolCalls } from "@byom-ai/web-sdk";

const result = parseToolCalls(modelResponse, toolNames, toolDefs);
for (const call of result.toolCalls) {
  console.log(call.name, call.matchRange);
  // { start: 42, end: 128 } — character indices in modelResponse
}

// Strip all tool call markup, leaving only surrounding prose
const cleanText = stripToolCalls(modelResponse, result.matchRanges);

// Or access matchRange from stream events
for await (const event of conversation.stream("...")) {
  if (event.type === "tool_call") {
    console.log(event.matchRange); // { start, end }
  }
}`}
                />

                <Title order={3} mt="md">Priming Lifecycle Events</Title>
                <Text c="dimmed" fz="sm">
                  When tool priming is active, the stream yields lifecycle events for building
                  rich UX — loading indicators, tool discovery animations, etc.
                </Text>

                <CodeBlock
                  title="priming-events.ts"
                  code={`for await (const event of conversation.stream("...")) {
  switch (event.type) {
    case "tool_priming_start":
      showStatus("Looking for available tools...");
      break;
    case "tool_priming_match":
      showStatus(\`Found tools: \${event.tools.join(", ")}\`);
      // event.tools = ["search_docs", "navigate_to_page"]
      break;
    case "tool_priming_end":
      clearStatus();
      break;
    case "tool_call":
      showPill(event.name); // e.g., Pill badge with tool name
      break;
    case "tool_result":
      showCheckmark(event.name);
      break;
    case "chunk":
      appendText(event.delta);
      break;
    case "done":
      break;
  }
}`}
                />

                <Title order={3} mt="md">Multi-Format Parsing</Title>
                <Text c="dimmed" fz="sm">
                  The SDK automatically detects tool calls in 5 formats — from strict XML tags
                  to bare JSON objects. This ensures compatibility across all model sizes.
                </Text>

                <CodeBlock
                  title="parsing-strategies.ts"
                  code={`// The SDK parses all of these formats automatically:

// 1. XML tags (Anthropic, larger models)
// <tool_call>{"name":"search","arguments":{"query":"x"}}</tool_call>

// 2. JSON in code blocks (GPT-style)
// \`\`\`json
// {"name":"search","arguments":{"query":"x"}}
// \`\`\`

// 3. Bare JSON with "name" field
// {"name":"search","arguments":{"query":"x"}}

// 4. Function-call syntax at line start
// search_docs "closures"

// 5. JSON with known parameter keys (smallest models)
// {"page_id":"providers"}  →  maps to navigate_to_page

// No configuration needed — all strategies run automatically.
// Priority: XML > code blocks > bare JSON > loose > param-keys`}
                />

                <PreviewCode
                  preview={
                    <Stack gap="sm">
                      <Text fz="sm">Try tool calling live. This demo defines a mock &quot;get_time&quot; tool that returns the current time.</Text>
                      <Textarea
                        label="Message"
                        value={prompt}
                        onChange={(e) => setPrompt(e.currentTarget.value)}
                        minRows={2}
                        autosize
                        placeholder="What time is it?"
                      />
                      <Group gap="xs">
                        <Button
                          disabled={isBusy || !sid}
                          loading={busy === "ToolSend"}
                          onClick={() => run("ToolSend", async () => {
                            const c = clientRef.current;
                            if (!c) throw new Error("Connect first.");
                            setToolLog([]);
                            const conv = new ConversationManager({
                              client: c,
                              maxTokens: 8192,
                              systemPrompt: "You are helpful. Use the available tools when needed.",
                              tools: [
                                {
                                  name: "get_time",
                                  description: "Get the current date and time",
                                  handler: async () => {
                                    const t = new Date().toLocaleString();
                                    setToolLog((p) => [...p, `🔧 get_time() → ${t}`]);
                                    return t;
                                  },
                                },
                                {
                                  name: "calculate",
                                  description: "Evaluate a math expression",
                                  parameters: {
                                    type: "object",
                                    properties: { expression: { type: "string", description: "Math expression to evaluate" } },
                                    required: ["expression"],
                                  },
                                  handler: async (args) => {
                                    const expr = String(args.expression);
                                    setToolLog((p) => [...p, `🔧 calculate("${expr}")`]);
                                    try {
                                      const result = String(Function(`"use strict"; return (${expr.replace(/[^0-9+\-*/().%\s]/g, "")})`)());
                                      setToolLog((p) => [...p, `  → ${result}`]);
                                      return result;
                                    } catch { return "Error: invalid expression"; }
                                  },
                                },
                              ],
                            });
                            const reply = await conv.send(prompt);
                            setToolLog((p) => [...p, `💬 ${reply.content}`]);
                            log("success", `Tool calling reply (${String(reply.content.length)} chars)`);
                          })}
                        >
                          Send with Tools
                        </Button>
                        <Button variant="subtle" size="xs" onClick={() => setToolLog([])}>Clear log</Button>
                      </Group>
                      {toolLog.length > 0 && (
                        <Card withBorder bg="gray.0" p="xs">
                          <ScrollArea h={200}>
                            <Stack gap={2}>
                              {toolLog.map((entry, i) => (
                                <Text key={i} fz="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{entry}</Text>
                              ))}
                            </Stack>
                          </ScrollArea>
                        </Card>
                      )}
                    </Stack>
                  }
                  code={`const conv = new ConversationManager({
  client,
  tools: [
    {
      name: "get_time",
      description: "Get the current date and time",
      handler: async () => new Date().toLocaleString(),
    },
    {
      name: "calculate",
      description: "Evaluate a math expression",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string" },
        },
        required: ["expression"],
      },
      handler: async (args) => {
        return String(eval(args.expression));
      },
    },
  ],
});

const reply = await conv.send("${prompt}");`}
                  title="live-tool-demo.ts"
                />
              </Stack>
            )}

            {SCENARIO_CATALOG.filter((s) => s.id === page).map((s) => (
              <Stack key={s.id} gap="lg">
                <Title order={2}>{s.title}</Title>
                <Text c="dimmed">{s.summary}</Text>
                <TabGroup tabs={s.steps.map((st, i) => ({ id: String(i), label: `Step ${String(i + 1)}`, content: <Text fz="sm">{st}</Text> }))} />
                <Callout type="success" title="Expected outcome">{s.expectedOutcome}</Callout>
              </Stack>
            ))}

            {page === "snippet" && (
              <Stack gap="lg">
                <Title order={2}>Integration Snippet</Title>
                <Text>Minimal browser pattern for using BYOM with the injected extension transport.</Text>
                <CodeBlock title="browser-integration.ts" code={EXTENSION_SNIPPET} />
              </Stack>
            )}

            {page === "event-log" && (
              <Stack gap="lg">
                <Group justify="space-between"><Title order={2}>Event Log</Title>{isBusy && <Loader size="xs" />}</Group>
                {logs.length === 0 && <Text c="dimmed">No events.</Text>}
                <Stack gap={4}>{logs.map((e) => (
                  <Card key={e.id} p="xs" withBorder>
                    <Group gap="xs" wrap="nowrap"><Badge size="xs" color={e.level === "success" ? "teal" : e.level === "error" ? "red" : "blue"}>{e.level}</Badge><Text fz="xs" truncate style={{ flex: 1 }}>{e.message}</Text><Text fz="xs" c="dimmed">{e.at}</Text></Group>
                    {e.details && <Text fz="xs" c="dimmed" mt={2} ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{e.details}</Text>}
                  </Card>
                ))}</Stack>
              </Stack>
            )}
          </Box>
        </ScrollArea>
      </AppShell.Main>

      {/* Right aside — AI Chat (independent connection) */}
      {chatOpen && (
        <AppShell.Aside>
          <ChatSidebar onClose={toggleChat} onNavigate={setPage} />
        </AppShell.Aside>
      )}
    </AppShell>
  );
}

