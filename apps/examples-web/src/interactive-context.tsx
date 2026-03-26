import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BYOMClient,
  BYOMSDKError,
  ConversationManager,
  type BYOMTransport,
  type ChatMessage,
  type ProviderDescriptor,
} from "@byom-ai/web-sdk";

import { createDemoTransport, getInjectedTransport, type DemoTransportMode } from "./demo-transport";

/* ─── Types ─────────────────────────────────────────────────────────── */

export type TransportProfile = "auto" | "injected" | DemoTransportMode;
export type Feedback = Readonly<{ kind: "success" | "error" | "info"; title: string; message: string }>;
export type LogEntry = Readonly<{ id: string; at: string; level: "info" | "success" | "error"; message: string; details?: string }>;

export const TRANSPORT_OPTIONS: readonly { value: TransportProfile; label: string }[] = [
  { value: "auto", label: "Auto (Injected → Mock)" },
  { value: "injected", label: "Injected extension transport" },
  { value: "mock", label: "Mock bridge transport" },
  { value: "slow", label: "Slow transport (timeout demo)" },
  { value: "failure", label: "Failure transport (typed error demo)" },
];

/* ─── Helpers ───────────────────────────────────────────────────────── */

export const logId = () =>
  typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `l.${Date.now()}.${Math.random().toString(36).slice(2)}`;
export const ts = () => new Date().toLocaleTimeString();
export const fmtModel = (m: string) =>
  m.split(/[-_.]/g).filter(Boolean).map((p) => (p.length <= 3 ? p.toUpperCase() : p[0]!.toUpperCase() + p.slice(1))).join(" ");
export const errStr = (e: unknown) =>
  e instanceof BYOMSDKError
    ? `${e.machineCode} | ${e.reasonCode} | retryable=${String(e.retryable)}`
    : e instanceof Error ? e.message : String(e);
export const errFb = (ctx: string, e: unknown): Feedback => ({
  kind: "error",
  title: `${ctx} failed`,
  message: e instanceof BYOMSDKError ? `${e.message} (${e.reasonCode})` : e instanceof Error ? e.message : String(e),
});

export function resolve(profile: TransportProfile): { transport: BYOMTransport; source: string; warning?: string } {
  const inj = getInjectedTransport();
  if (profile === "injected") {
    if (!inj) throw new Error("window.byom not found.");
    return { transport: inj, source: "Injected extension" };
  }
  if (profile === "auto") {
    if (inj) return { transport: inj, source: "Injected extension" };
    return { transport: createDemoTransport("mock"), source: "Demo mock", warning: "window.byom unavailable — using demo transport." };
  }
  return { transport: createDemoTransport(profile), source: `Demo ${profile}` };
}

/* ─── Context shape ─────────────────────────────────────────────────── */

interface InteractiveContextValue {
  /* state */
  clientRef: React.RefObject<BYOMClient | null>;
  tp: TransportProfile;
  setTp: (v: TransportProfile) => void;
  appId: string;
  setAppId: (v: string) => void;
  originOv: string;
  setOriginOv: (v: string) => void;

  fb: Feedback | null;
  setFb: (v: Feedback | null) => void;
  busy: string | null;
  isBusy: boolean;
  tpSrc: string;
  sid: string | null;
  state: string;
  caps: readonly string[];

  provs: readonly ProviderDescriptor[];
  selProv: string | null;
  setSelProv: (v: string | null) => void;
  selModel: string | null;
  setSelModel: (v: string | null) => void;
  provOpts: { value: string; label: string }[];
  modelOpts: { value: string; label: string }[];

  prompt: string;
  setPrompt: (v: string) => void;
  history: readonly ChatMessage[];
  setHistory: React.Dispatch<React.SetStateAction<readonly ChatMessage[]>>;
  preview: string;
  logs: readonly LogEntry[];

  convHistory: readonly ChatMessage[];
  setConvHistory: React.Dispatch<React.SetStateAction<readonly ChatMessage[]>>;
  convTokens: number;
  setConvTokens: (v: number) => void;
  toolLog: string[];
  setToolLog: React.Dispatch<React.SetStateAction<string[]>>;

  injAvail: boolean;

  /* operations */
  log: (level: LogEntry["level"], msg: string, det?: string) => void;
  run: (name: string, op: () => Promise<void>) => void;
  doConnect: () => Promise<void>;
  doDisconnect: () => Promise<void>;
  doList: () => Promise<{ providerId: string; modelId: string } | null>;
  doSelect: (pId?: string, mId?: string) => Promise<void>;
  doSend: (msgs?: ChatMessage[]) => Promise<void>;
  doStream: (msgs?: ChatMessage[]) => Promise<void>;
  happyPath: () => void;
}

const InteractiveContext = createContext<InteractiveContextValue | null>(null);

/* ─── Provider ──────────────────────────────────────────────────────── */

export function InteractiveProvider({ children }: { children: ReactNode }) {
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
    r();
    window.addEventListener("byom:injected", r as EventListener);
    window.addEventListener("focus", r);
    return () => {
      window.removeEventListener("byom:injected", r as EventListener);
      window.removeEventListener("focus", r);
    };
  }, []);

  const isBusy = busy !== null;
  const sp = useMemo(() => provs.find((p) => p.providerId === selProv) ?? null, [provs, selProv]);
  const modelOpts = useMemo(() => (sp?.models ?? []).map((m) => ({ value: m, label: `${fmtModel(m)} (${m})` })), [sp]);
  const provOpts = useMemo(() => provs.map((p) => ({ value: p.providerId, label: `${p.providerName} · ${p.models.length} model(s)` })), [provs]);

  const log = useCallback(
    (level: LogEntry["level"], msg: string, det?: string) =>
      setLogs((p) => [{ id: logId(), at: ts(), level, message: msg, ...(det ? { details: det } : {}) }, ...p].slice(0, 120)),
    [],
  );
  const syncState = useCallback(() => setState(clientRef.current?.state ?? "disconnected"), []);

  const run = useCallback(
    async (name: string, op: () => Promise<void>) => {
      if (busy) return;
      setBusy(name);
      try { await op(); } catch (e) { setFb(errFb(name, e)); log("error", `${name} failed`, errStr(e)); }
      finally { setBusy(null); syncState(); setInjAvail(getInjectedTransport() !== null); }
    },
    [busy, log, syncState],
  );

  const doConnect = useCallback(async () => {
    await clientRef.current?.disconnect().catch(() => {});
    const r = resolve(tp);
    const origin = originOv.trim() || window.location.origin;
    const tMs = tp === "slow" ? 1500 : tp === "injected" || tp === "auto" ? 120000 : 6000;
    const c = new BYOMClient({ transport: r.transport, origin, timeoutMs: tMs });
    const res = await c.connect({ appId, origin });
    clientRef.current = c;
    setSid(res.sessionId); setCaps(res.capabilities); setTpSrc(r.source);
    setFb({ kind: "success", title: "Connected", message: `Session ${res.sessionId}` });
    log("success", `Connected via ${r.source}`);
    if (r.warning) { setFb({ kind: "info", title: "Fallback", message: r.warning }); log("info", "Fallback", r.warning); }
  }, [tp, originOv, appId, log]);

  const doList = useCallback(async () => {
    const c = clientRef.current;
    if (!c) throw new Error("Connect first.");
    const r = await c.listProviders();
    setProvs(r.providers);
    const f = r.providers[0];
    setSelProv(f?.providerId ?? null);
    setSelModel(f?.models[0] ?? null);
    log("success", `${r.providers.length} providers`);
    setFb({ kind: "success", title: "Providers listed", message: `${r.providers.length} available` });
    return f && f.models[0] ? { providerId: f.providerId, modelId: f.models[0] } : null;
  }, [log]);

  const doSelect = useCallback(async (pId?: string, mId?: string) => {
    const c = clientRef.current;
    if (!c) throw new Error("Connect first.");
    const p = pId ?? selProv, m = mId ?? selModel;
    if (!p || !m) throw new Error("Select provider/model.");
    const r = await c.selectProvider({ providerId: p, modelId: m });
    setFb({ kind: "success", title: "Selected", message: `${r.providerId}/${r.modelId}` });
    log("success", `Selected ${r.providerId}/${r.modelId}`);
  }, [selProv, selModel, log]);

  const doSend = useCallback(async (msgs?: ChatMessage[]) => {
    const c = clientRef.current;
    if (!c) throw new Error("Connect first.");
    const m = msgs ?? [...history, { role: "user" as const, content: prompt }];
    if (!msgs) setHistory(m);
    const r = await c.chat.send({ messages: m });
    setHistory((p) => [...p, r.message]);
    log("success", `Response (${r.message.content.length} chars)`);
  }, [history, prompt, log]);

  const doStream = useCallback(async (msgs?: ChatMessage[]) => {
    const c = clientRef.current;
    if (!c) throw new Error("Connect first.");
    const m = msgs ?? [...history, { role: "user" as const, content: prompt }];
    if (!msgs) setHistory(m);
    setPreview("");
    let full = "";
    const s = await c.chat.stream({ messages: m });
    for await (const ch of s) {
      if (ch.type === "chunk") { full += ch.delta; setPreview(full); }
      if (ch.type === "done") break;
    }
    if (full) { setHistory((p) => [...p, { role: "assistant", content: full }]); log("success", "Stream done"); }
  }, [history, prompt, log]);

  const doDisconnect = useCallback(async () => {
    await clientRef.current?.disconnect();
    clientRef.current = null;
    setSid(null); setCaps([]); setProvs([]); setSelProv(null); setSelModel(null); setHistory([]); setPreview("");
    setFb({ kind: "info", title: "Disconnected", message: "Session ended." });
    log("info", "Disconnected");
  }, [log]);

  const happyPath = useCallback(
    () => run("Happy path", async () => {
      await doConnect();
      const s = await doList();
      if (s) { await doSelect(s.providerId, s.modelId); await doSend([{ role: "user", content: "Summarize BYOM in one paragraph." }]); }
    }),
    [run, doConnect, doList, doSelect, doSend],
  );

  const value = useMemo<InteractiveContextValue>(
    () => ({
      clientRef, tp, setTp, appId, setAppId, originOv, setOriginOv,
      fb, setFb, busy, isBusy, tpSrc, sid, state, caps,
      provs, selProv, setSelProv, selModel, setSelModel, provOpts, modelOpts,
      prompt, setPrompt, history, setHistory, preview, logs,
      convHistory, setConvHistory, convTokens, setConvTokens, toolLog, setToolLog,
      injAvail,
      log, run, doConnect, doDisconnect, doList, doSelect, doSend, doStream, happyPath,
    }),
    [
      tp, appId, originOv, fb, busy, isBusy, tpSrc, sid, state, caps,
      provs, selProv, selModel, provOpts, modelOpts,
      prompt, history, preview, logs,
      convHistory, convTokens, toolLog, injAvail,
      log, run, doConnect, doDisconnect, doList, doSelect, doSend, doStream, happyPath,
    ],
  );

  return <InteractiveContext.Provider value={value}>{children}</InteractiveContext.Provider>;
}

/* ─── Hook ──────────────────────────────────────────────────────────── */

export function useInteractive(): InteractiveContextValue {
  const ctx = useContext(InteractiveContext);
  if (!ctx) throw new Error("useInteractive must be used within <InteractiveProvider>");
  return ctx;
}
