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
  type BYOMTransport,
  type ChatMessage,
  type ProviderDescriptor,
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
          <ChatSidebar onClose={toggleChat} />
        </AppShell.Aside>
      )}
    </AppShell>
  );
}

