import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Group,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import {
  ArlopassClient,
  ArlopassSDKError,
  type ArlopassTransport,
  type ChatMessage,
  type ProviderDescriptor,
} from "@arlopass/web-sdk";
import {
  createDemoTransport,
  getInjectedTransport,
  type DemoTransportMode,
} from "./demo-transport.js";

/* ── Types ─────────────────────────────────────────────────────────── */

type TransportProfile = "auto" | "injected" | DemoTransportMode;

type Feedback = { kind: "success" | "error" | "info"; title: string; message: string };

type LogEntry = { id: string; level: "info" | "success" | "error"; message: string };

/* ── Constants ─────────────────────────────────────────────────────── */

const TRANSPORT_OPTIONS = [
  { value: "auto", label: "Auto-detect" },
  { value: "injected", label: "Injected extension transport" },
  { value: "mock", label: "Mock bridge transport" },
  { value: "slow", label: "Slow transport (timeout demo)" },
  { value: "failure", label: "Failure transport (typed error demo)" },
];

const SCENARIOS = [
  { id: "sdk-happy-path", title: "SDK Happy Path", summary: "Connect → list → select → chat.send" },
  { id: "streaming", title: "Streaming", summary: "Connect → list → select → chat.stream with chunked output" },
  { id: "error-handling", title: "Error Handling", summary: "Failure transport and timeout scenarios" },
];

const SNIPPET = `import { ArlopassClient } from "@arlopass/web-sdk";

const client = new ArlopassClient({ transport, origin });
const session = await client.connect({ appId: "com.example.app" });

const { providers } = await client.listProviders();
await client.selectProvider({
  providerId: providers[0].providerId,
  modelId: providers[0].models[0],
});

const reply = await client.chat.send({
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(reply.message.content);`;

/* ── Helpers ───────────────────────────────────────────────────────── */

let logCounter = 0;
const nextLogId = () => `log-${++logCounter}`;

function resolve(profile: TransportProfile): {
  transport: ArlopassTransport;
  source: string;
} {
  const inj = getInjectedTransport();
  if (profile === "injected") {
    if (!inj) throw new Error("window.arlopass not found.");
    return { transport: inj, source: "Injected extension" };
  }
  if (profile === "auto") {
    if (inj) return { transport: inj, source: "Injected extension" };
    return { transport: createDemoTransport("mock"), source: "Demo mock" };
  }
  return { transport: createDemoTransport(profile), source: `Demo ${profile}` };
}

function errMsg(e: unknown): string {
  if (e instanceof ArlopassSDKError) return `${e.message} (${e.reasonCode})`;
  if (e instanceof Error) return e.message;
  return String(e);
}

/* ── App ───────────────────────────────────────────────────────────── */

export default function App() {
  const clientRef = useRef<ArlopassClient | null>(null);

  /* State */
  const [tp, setTp] = useState<TransportProfile>("auto");
  const [appId, setAppId] = useState("com.arlopass.examples.app");
  const [originOv, setOriginOv] = useState("");
  const [sid, setSid] = useState<string | null>(null);
  const [tpSrc, setTpSrc] = useState("N/A");
  const [fb, setFb] = useState<Feedback | null>(null);
  const [busyOp, setBusy] = useState<string | null>(null);

  const [provs, setProvs] = useState<readonly ProviderDescriptor[]>([]);
  const [selProv, setSelProv] = useState<string | null>(null);
  const [selModel, setSelModel] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [preview, setPreview] = useState("");

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [injAvail, setInjAvail] = useState(() => getInjectedTransport() !== null);

  /* Extension detection */
  useEffect(() => {
    const check = () => setInjAvail(getInjectedTransport() !== null);
    check();
    window.addEventListener("arlopass:injected", check as EventListener);
    window.addEventListener("focus", check);
    return () => {
      window.removeEventListener("arlopass:injected", check as EventListener);
      window.removeEventListener("focus", check);
    };
  }, []);

  const isBusy = busyOp !== null;

  const log = useCallback(
    (level: LogEntry["level"], message: string) =>
      setLogs((prev) => [{ id: nextLogId(), level, message }, ...prev].slice(0, 100)),
    [],
  );

  /* ── Operations ──────────────────────────────────────────────────── */

  const run = useCallback(
    async (name: string, op: () => Promise<void>) => {
      if (isBusy) return;
      setBusy(name);
      try {
        await op();
      } catch (e: unknown) {
        setFb({ kind: "error", title: `${name} failed`, message: errMsg(e) });
        log("error", `${name} failed: ${errMsg(e)}`);
      } finally {
        setBusy(null);
      }
    },
    [isBusy, log],
  );

  const doConnect = useCallback(async () => {
    await clientRef.current?.disconnect().catch(() => {});
    const r = resolve(tp);
    const origin = originOv.trim() || window.location.origin;
    const tMs = tp === "slow" ? 1500 : tp === "injected" || tp === "auto" ? 120_000 : 6_000;
    const c = new ArlopassClient({ transport: r.transport, origin, timeoutMs: tMs });
    const res = await c.connect({ appId, origin, timeoutMs: tMs });
    clientRef.current = c;
    setSid(res.sessionId);
    setTpSrc(r.source);
    setFb({ kind: "success", title: "Connected", message: `Session ${res.sessionId}` });
    log("success", `Connected via ${r.source}`);
  }, [tp, originOv, appId, log]);

  const doDisconnect = useCallback(async () => {
    await clientRef.current?.disconnect();
    clientRef.current = null;
    setSid(null);
    setTpSrc("N/A");
    setProvs([]);
    setSelProv(null);
    setSelModel(null);
    setMessages([]);
    setPreview("");
    setFb({ kind: "info", title: "Disconnected", message: "Session ended." });
    log("info", "Disconnected");
  }, [log]);

  const doList = useCallback(async (): Promise<{ providerId: string; modelId: string } | null> => {
    const c = clientRef.current;
    if (!c) throw new Error("Connect first.");
    const r = await c.listProviders();
    setProvs(r.providers);
    const first = r.providers[0];
    setSelProv(first?.providerId ?? null);
    setSelModel(first?.models[0] ?? null);
    setFb({ kind: "success", title: "Providers loaded", message: `${r.providers.length} available` });
    log("success", "Fetched provider list");
    return first && first.models[0] ? { providerId: first.providerId, modelId: first.models[0] } : null;
  }, [log]);

  const doSelect = useCallback(
    async (pId?: string, mId?: string) => {
      const c = clientRef.current;
      if (!c) throw new Error("Connect first.");
      const p = pId ?? selProv;
      const m = mId ?? selModel;
      if (!p || !m) throw new Error("Select provider/model.");
      const r = await c.selectProvider({ providerId: p, modelId: m });
      setFb({ kind: "success", title: "Provider selected", message: `${r.providerId}/${r.modelId}` });
      log("success", `Selected ${r.providerId}/${r.modelId}`);
    },
    [selProv, selModel, log],
  );

  const doSend = useCallback(
    async (msgs?: ChatMessage[]) => {
      const c = clientRef.current;
      if (!c) throw new Error("Connect first.");
      if (!msgs && !prompt.trim()) throw new Error("Prompt is empty.");
      const m = msgs ?? [...messages, { role: "user" as const, content: prompt }];
      if (!msgs) setMessages(m);
      const r = await c.chat.send({ messages: m });
      setMessages((prev) => [...prev, r.message]);
      setPrompt("");
      setFb({ kind: "success", title: "Chat response received", message: `${r.message.content.length} chars` });
      log("success", "chat.send completed");
    },
    [messages, prompt, log],
  );

  const doStream = useCallback(
    async (msgs?: ChatMessage[]) => {
      const c = clientRef.current;
      if (!c) throw new Error("Connect first.");
      if (!msgs && !prompt.trim()) throw new Error("Prompt is empty.");
      const m = msgs ?? [...messages, { role: "user" as const, content: prompt }];
      if (!msgs) setMessages(m);
      setPreview("");
      let full = "";
      const s = await c.chat.stream({ messages: m });
      for await (const ch of s) {
        if (ch.type === "chunk") {
          full += ch.delta;
          setPreview(full);
        }
        if (ch.type === "done") break;
      }
      if (full) {
        setMessages((prev) => [...prev, { role: "assistant", content: full }]);
      }
      setFb({ kind: "success", title: "Stream completed", message: `${full.length} chars` });
      setPrompt("");
      log("success", "chat.stream completed");
    },
    [messages, prompt, log],
  );

  const happyPath = useCallback(() => {
    void run("Happy path", async () => {
      await doConnect();
      const s = await doList();
      if (s) {
        await doSelect(s.providerId, s.modelId);
        await doSend([{ role: "user", content: "Summarize Arlopass in one paragraph." }]);
      }
    });
  }, [run, doConnect, doList, doSelect, doSend]);

  /* ── Derived ──────────────────────────────────────────────────────── */

  const provOpts = provs.map((p) => ({
    value: p.providerId,
    label: `${p.providerName} · ${p.models.length} model(s)`,
  }));

  const sp = provs.find((p) => p.providerId === selProv);
  const modelOpts = (sp?.models ?? []).map((m) => ({ value: m, label: m }));

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <Stack p="lg" maw={900} mx="auto">
      {/* Header */}
      <Title order={1}>Arlopass Extension + SDK Examples</Title>

      <Group>
        <Badge color={sid ? "teal" : "gray"} size="lg" tt="uppercase">
          {sid ? "CONNECTED" : "DISCONNECTED"}
        </Badge>
        <Badge color="blue" variant="light" tt="none">
          {clientRef.current?.state ?? "idle"}
        </Badge>
      </Group>

      {/* Extension detection */}
      {injAvail ? (
        <Alert color="green">Extension transport detected</Alert>
      ) : (
        <Alert color="yellow">Extension transport not detected</Alert>
      )}

      {/* Feedback */}
      {fb && (
        <Alert
          color={fb.kind === "error" ? "red" : fb.kind === "success" ? "teal" : "blue"}
          title={fb.title}
          withCloseButton
          onClose={() => setFb(null)}
        >
          {fb.message}
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="playground">
        <Tabs.List>
          <Tabs.Tab value="playground">Interactive playground</Tabs.Tab>
          <Tabs.Tab value="scenarios">Scenario catalog</Tabs.Tab>
          <Tabs.Tab value="snippet">Integration snippet</Tabs.Tab>
        </Tabs.List>

        {/* ── Playground tab ─────────────────────────────────────── */}
        <Tabs.Panel value="playground" pt="md">
          <Stack gap="md">
            {/* Connection controls */}
            <Card withBorder>
              <Stack gap="sm">
                <Text fw={600}>Connection Controls</Text>

                <Select
                  label="Transport profile"
                  data={TRANSPORT_OPTIONS}
                  value={tp}
                  onChange={(v) => v && setTp(v as TransportProfile)}
                />

                <TextInput
                  label="App ID"
                  value={appId}
                  onChange={(e) => setAppId(e.currentTarget.value)}
                />

                <TextInput
                  label="Origin override"
                  placeholder={typeof window !== "undefined" ? window.location.origin : ""}
                  value={originOv}
                  onChange={(e) => setOriginOv(e.currentTarget.value)}
                />

                <Group>
                  <Button onClick={() => void run("Connect", doConnect)} disabled={isBusy}>
                    Connect
                  </Button>
                  <Button
                    variant="light"
                    color="red"
                    onClick={() => void run("Disconnect", doDisconnect)}
                    disabled={!sid || isBusy}
                  >
                    Disconnect
                  </Button>
                  <Button color="violet" onClick={happyPath} disabled={isBusy}>
                    Run happy-path
                  </Button>
                </Group>

                <Group gap="xs">
                  <Text size="sm">Transport:</Text>
                  <Code>{tpSrc}</Code>
                  <Text size="sm">Session:</Text>
                  <Code>{sid ?? "N/A"}</Code>
                </Group>
              </Stack>
            </Card>

            {/* Provider scenarios */}
            <Card withBorder>
              <Stack gap="sm">
                <Text fw={600}>Provider Scenarios</Text>

                <Group>
                  <Button
                    variant="light"
                    onClick={() => void run("List", async () => { await doList(); })}
                    disabled={isBusy}
                  >
                    List providers
                  </Button>
                  <Button
                    variant="light"
                    onClick={() => void run("Select", async () => { await doSelect(); })}
                    disabled={isBusy}
                  >
                    Select provider
                  </Button>
                </Group>

                <Select
                  label="Provider"
                  data={provOpts}
                  value={selProv}
                  onChange={(v) => setSelProv(v)}
                />

                <Select
                  label="Model"
                  data={modelOpts}
                  value={selModel}
                  onChange={(v) => setSelModel(v)}
                />
              </Stack>
            </Card>

            {/* Chat */}
            <Card withBorder>
              <Stack gap="sm">
                <Text fw={600}>Chat</Text>

                <Textarea
                  label="Prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.currentTarget.value)}
                  minRows={2}
                />

                <Group>
                  <Button
                    variant="light"
                    onClick={() => void run("chat.send", async () => { await doSend(); })}
                    disabled={isBusy}
                  >
                    chat.send
                  </Button>
                  <Button
                    variant="light"
                    onClick={() => void run("chat.stream", async () => { await doStream(); })}
                    disabled={isBusy}
                  >
                    chat.stream
                  </Button>
                </Group>

                <Text size="sm" className="mono-text">
                  {preview || "No active stream."}
                </Text>
              </Stack>
            </Card>

            {/* Chat transcript */}
            <Card withBorder>
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={600}>Chat Transcript</Text>
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => { setMessages([]); setLogs([]); }}
                  >
                    Clear
                  </Button>
                </Group>

                {messages.length === 0 && (
                  <Text size="sm" c="dimmed">No chat messages yet.</Text>
                )}

                {messages.map((m, i) => (
                  <Card key={i} withBorder p="xs">
                    <Group gap="xs" mb={4}>
                      <Badge size="sm" variant="light">
                        {m.role}
                      </Badge>
                    </Group>
                    <Text size="sm">{m.content}</Text>
                  </Card>
                ))}
              </Stack>
            </Card>

            {/* Event log */}
            <Card withBorder>
              <Stack gap="sm">
                <Text fw={600}>Event Log</Text>

                {logs.length === 0 && (
                  <Text size="sm" c="dimmed">No events yet.</Text>
                )}

                {logs.map((entry) => (
                  <Card key={entry.id} withBorder p="xs">
                    <Group gap="xs">
                      <Badge
                        size="sm"
                        variant="light"
                        color={
                          entry.level === "error"
                            ? "red"
                            : entry.level === "success"
                              ? "teal"
                              : "blue"
                        }
                      >
                        {entry.level}
                      </Badge>
                      <Text size="sm">{entry.message}</Text>
                    </Group>
                  </Card>
                ))}
              </Stack>
            </Card>
          </Stack>
        </Tabs.Panel>

        {/* ── Scenario catalog tab ───────────────────────────────── */}
        <Tabs.Panel value="scenarios" pt="md">
          <Stack gap="md">
            {SCENARIOS.map((s) => (
              <Card key={s.id} withBorder>
                <Text fw={600}>{s.title}</Text>
                <Text size="sm" c="dimmed">{s.summary}</Text>
              </Card>
            ))}
          </Stack>
        </Tabs.Panel>

        {/* ── Integration snippet tab ────────────────────────────── */}
        <Tabs.Panel value="snippet" pt="md">
          <Card withBorder>
            <pre>
              <code>{SNIPPET}</code>
            </pre>
          </Card>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
