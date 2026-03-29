import { useState, useEffect, useRef, useCallback } from "react";
import { Stack, Title, Text, Table, Code } from "@mantine/core";
import { CodeBlock, PreviewCode, Callout, InlineCode } from "../../components";

const addCmd = `npx @arlopass/ui add chat`;

const cliCommands = `# Add a single block
npx @arlopass/ui add chat

# Add multiple blocks
npx @arlopass/ui add chat chatbot provider-picker

# List available blocks
npx @arlopass/ui list

# Overwrite existing files
npx @arlopass/ui add chat --force

# Preview without writing files
npx @arlopass/ui add chat --dry-run

# Custom output directory
npx @arlopass/ui add chat --out src/ui`;

const configFile = `// arlopass-ui.json — auto-created on first \`add\`
{
  "outputDir": "src/components/arlopass",
  "typescript": true
}`;

const chatUsage = `import { ArlopassProvider } from "@arlopass/react";
import { ArlopassChat } from "./components/arlopass/chat";

function App() {
  return (
    <ArlopassProvider>
      <ArlopassChat
        systemPrompt="You are a helpful assistant."
        placeholder="Ask me anything…"
      />
    </ArlopassProvider>
  );
}`;

const chatbotUsage = `import { ArlopassChatbot } from "./components/arlopass/chatbot";

function App() {
  return (
    <div>
      <h1>My App</h1>
      {/* Floating chat widget — renders a bubble in the bottom-right */}
      <ArlopassChatbot
        buttonLabel="Ask AI"
        position="bottom-right"
        systemPrompt="You are a customer support agent."
      />
    </div>
  );
}`;

const providerPickerUsage = `import { ArlopassProviderPicker } from "./components/arlopass/provider-picker";

function Settings() {
  return (
    <ArlopassProviderPicker
      onSelect={(providerId, modelId) => {
        console.log("Selected:", providerId, modelId);
      }}
    />
  );
}`;

const connectionBannerUsage = `import { ArlopassConnectionBanner } from "./components/arlopass/connection-banner";

function App() {
  return (
    <div>
      <ArlopassConnectionBanner installUrl="https://chromewebstore.google.com" />
      {/* rest of your app */}
    </div>
  );
}`;

const installButtonUsage = `import { ArlopassInstallButton, ArlopassNotInstalled } from "@arlopass/react";

function Header() {
  return (
    <header>
      <h1>My App</h1>
      <ArlopassNotInstalled>
        <ArlopassInstallButton installUrl="https://chromewebstore.google.com" />
      </ArlopassNotInstalled>
    </header>
  );
}`;

const extensionRequiredUsage = `import { ArlopassExtensionGate, ArlopassInstallButton } from "@arlopass/react";

function App() {
  return (
    <div>
      <h1>My App</h1>

      {/* This feature only shows when the extension is installed */}
      <ArlopassExtensionGate
        fallback={({ installUrl }) => (
          <div>
            <p>AI search requires the Arlopass extension.</p>
            <ArlopassInstallButton installUrl={installUrl} />
          </div>
        )}
      >
        <AIPoweredSearch />
      </ArlopassExtensionGate>

      {/* This feature hides silently when no extension */}
      <ArlopassExtensionGate>
        <AIChatWidget />
      </ArlopassExtensionGate>
    </div>
  );
}`;

const appRequiredUsage = `import { ArlopassProvider, ArlopassRequiredGate, ArlopassInstallButton } from "@arlopass/react";

function App() {
  return (
    <ArlopassProvider appId="my-app">
      <ArlopassRequiredGate
        fallback={({ installUrl }) => (
          <div style={{ textAlign: "center", padding: 40 }}>
            <h2>Arlopass Required</h2>
            <p>This app needs the Arlopass extension to work.</p>
            <p>Install the extension to connect your AI providers.</p>
            <ArlopassInstallButton installUrl={installUrl} />
          </div>
        )}
      >
        <MainApp />
      </ArlopassRequiredGate>
    </ArlopassProvider>
  );
}`;

const blocks = [
  {
    id: "chat",
    name: "Chat",
    description:
      "Complete chat interface with avatars, message bubbles, typing indicator, streaming cursor, tool activity, context bar, scroll fade, and auto-scroll",
  },
  {
    id: "chatbot",
    name: "Chatbot Widget",
    description:
      "Floating chatbot bubble with expandable chat panel (depends on chat)",
  },
  {
    id: "provider-picker",
    name: "Provider Picker",
    description: "Styled provider and model selection dropdowns",
  },
  {
    id: "connection-banner",
    name: "Connection Banner",
    description: "Connection status banner with install prompt",
  },
  {
    id: "install-button",
    name: "Install Button",
    description: "Styled button/link to install the Arlopass extension",
  },
  {
    id: "extension-required",
    name: "Extension Required Gate",
    description:
      "Feature-level gate that shows an install prompt when the extension is missing",
  },
  {
    id: "app-required",
    name: "App Required Gate",
    description:
      "Full-app gate that blocks the entire UI with an install page when extension is missing",
  },
];

// ─── Shared preview styles ──────────────────────────────────────────

const S = {
  root: {
    background: "var(--ap-bg-surface)",
    border: "1px solid var(--ap-border)",
    borderRadius: 12,
    maxWidth: 340,
    fontFamily: "system-ui",
    overflow: "hidden",
    fontSize: 12,
    color: "var(--ap-text-body)",
  },
  header: {
    display: "flex",
    alignItems: "center" as const,
    gap: 8,
    padding: "10px 14px",
    borderBottom: "1px solid var(--ap-border)",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ap-text-primary)",
  },
  msgs: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
    padding: "12px 14px",
    minHeight: 130,
    maxHeight: 200,
    overflowY: "auto" as const,
  },
  row: { display: "flex", gap: 8, alignItems: "flex-start" as const },
  avU: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "var(--ap-bg-base)",
    border: "1px solid var(--ap-border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: 9,
    color: "var(--ap-text-tertiary)",
  },
  avA: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "var(--ap-bg-elevated)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: 9,
    color: "var(--ap-text-tertiary)",
  },
  bU: {
    background: "var(--ap-bg-base)",
    border: "1px solid var(--ap-border)",
    borderRadius: 8,
    padding: "6px 10px",
    lineHeight: 1.5,
    maxWidth: 220,
  },
  bA: {
    background: "var(--ap-bg-elevated)",
    border: "1px solid rgba(120,113,108,0.15)",
    borderRadius: 8,
    padding: "6px 10px",
    lineHeight: 1.5,
    maxWidth: 220,
  },
  meta: {
    fontSize: 9,
    color: "var(--ap-text-tertiary)",
    marginTop: 3,
    marginLeft: 2,
    opacity: 0.7,
  },
  pill: {
    display: "inline-block",
    fontSize: 9,
    fontWeight: 500,
    padding: "1px 6px",
    borderRadius: 4,
    background: "var(--ap-bg-elevated)",
    color: "var(--ap-text-tertiary)",
    marginTop: 3,
    marginLeft: 2,
  },
  inp: { padding: "8px 14px", borderTop: "1px solid var(--ap-border)" },
  inpRow: { display: "flex", alignItems: "flex-end" as const, gap: 6 },
  inpEl: {
    flex: 1,
    border: "1px solid var(--ap-border)",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    background: "var(--ap-bg-base)",
    color: "var(--ap-text-body)",
    outline: "none",
  },
  btn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "var(--ap-text-tertiary)",
    border: "none",
    color: "white",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
  },
  btnDisabled: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "var(--ap-bg-elevated)",
    border: "none",
    color: "var(--ap-text-tertiary)",
    cursor: "not-allowed",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
  },
  selectorPill: {
    padding: "2px 8px",
    borderRadius: 4,
    background: "var(--ap-bg-elevated)",
    fontSize: 10,
    fontWeight: 500,
    color: "var(--ap-text-secondary)",
  },
  ctxBar: {
    marginLeft: "auto",
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: 500,
    color: "var(--ap-text-tertiary)",
  },
  ft: {
    padding: "8px 14px",
    borderTop: "1px solid var(--ap-border)",
    display: "flex",
    alignItems: "center" as const,
    gap: 6,
  },
  ftDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#4d7c0f",
    flexShrink: 0,
  },
  ftLbl: { fontSize: 10, color: "var(--ap-text-tertiary)", flex: 1 },
  ftMdl: {
    fontSize: 10,
    fontFamily: "monospace",
    color: "var(--ap-text-tertiary)",
  },
} as const;

// ─── Shared mock data ───────────────────────────────────────────────

const MOCK_PROVIDERS = [
  { id: "anthropic", name: "Anthropic", models: ["claude-3.5-sonnet", "claude-3-opus", "claude-3-haiku"] },
  { id: "openai", name: "OpenAI", models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o"] },
  { id: "ollama", name: "Ollama Local", models: ["llama3", "llama3.1", "codellama", "mistral"] },
];

// ─── Interactive Chat preview ───────────────────────────────────────

type MockMsg = {
  id: number;
  role: "user" | "assistant";
  text: string;
  model?: string | undefined;
  tools?: string[] | undefined;
};

const MOCK_RESPONSES: { text: string; tools?: string[] }[] = [
  {
    text: "Arlopass is an AI wallet for the web. It lets you use your own providers with any app.",
    tools: ["search docs"],
  },
  {
    text: "You can install it from the Chrome Web Store. It takes about 10 seconds.",
  },
  {
    text: "The SDK supports streaming, tool calling, and context window management out of the box.",
    tools: ["search docs"],
  },
  {
    text: "Check the getting started guide for a step-by-step tutorial.",
  },
];

function ChatBlockPreview() {
  const [messages, setMessages] = useState<MockMsg[]>([
    { id: 0, role: "user", text: "What is Arlopass?" },
    {
      id: 1,
      role: "assistant",
      text: "Arlopass is an AI wallet for the web. It lets you use your own providers with any app.",
      model: "Claude 3.5 · Anthropic",
      tools: ["search docs"],
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [, setStreamMeta] = useState<{
    model: string;
    tools?: string[] | undefined;
  } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [provIdx, setProvIdx] = useState(0);
  const [modelIdx, setModelIdx] = useState(0);
  const chatProv = MOCK_PROVIDERS[provIdx]!;
  const chatModel = chatProv.models[modelIdx] ?? chatProv.models[0]!;
  const msgEndRef = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const respIdxRef = useRef(0);

  const scrollDown = useCallback(() => {
    const el = msgsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(scrollDown, [messages, streaming, scrollDown]);

  const handleSend = useCallback(() => {
    const txt = input.trim();
    if (!txt || isStreaming) return;
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: "user", text: txt },
    ]);
    setIsStreaming(true);
    setStreaming("");

    const resp = MOCK_RESPONSES[respIdxRef.current % MOCK_RESPONSES.length]!;
    respIdxRef.current++;
    const modelLabel = `${chatModel} · ${chatProv.name}`;
    setStreamMeta({ model: modelLabel, tools: resp.tools });

    let i = 0;
    const timer = setInterval(() => {
      if (i < resp.text.length) {
        setStreaming(resp.text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(timer);
        setStreaming("");
        setStreamMeta(null);
        setIsStreaming(false);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: "assistant",
            text: resp.text,
            model: modelLabel,
            tools: resp.tools,
          },
        ]);
      }
    }, 25);
  }, [input, isStreaming, chatModel, chatProv.name]);

  return (
    <div style={S.root}>
      <div style={S.header}>Documentation Assistant</div>
      <div ref={msgsRef} style={S.msgs}>
        {messages.map((m) => (
          <div key={m.id} style={S.row}>
            <div style={m.role === "user" ? S.avU : S.avA}>
              {m.role === "user" ? "U" : "AI"}
            </div>
            <div>
              <div style={m.role === "user" ? S.bU : S.bA}>{m.text}</div>
              {m.role === "assistant" && m.model && (
                <div style={S.meta}>{m.model}</div>
              )}
              {m.role === "assistant" &&
                m.tools?.map((t) => (
                  <span key={t} style={S.pill}>
                    {t}
                  </span>
                ))}
            </div>
          </div>
        ))}
        {isStreaming && streaming && (
          <div style={S.row}>
            <div style={S.avA}>AI</div>
            <div style={S.bA}>
              {streaming}
              <span
                style={{
                  display: "inline-block",
                  width: 2,
                  height: 13,
                  background: "var(--ap-text-tertiary)",
                  marginLeft: 2,
                  verticalAlign: "middle",
                }}
              />
            </div>
          </div>
        )}
        {isStreaming && !streaming && (
          <div style={S.row}>
            <div style={S.avA}>AI</div>
            <div
              style={{
                ...S.bA,
                display: "flex",
                alignItems: "center",
                gap: 3,
                padding: "8px 10px",
              }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="chat-bounce"
                  style={{
                    animationDelay: `${i * 150}ms`,
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: "var(--ap-text-tertiary)",
                  }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={msgEndRef} />
      </div>
      <div style={S.inp}>
        {/* Provider/model selectors + context bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginBottom: 5,
          }}
        >
          <select
            value={provIdx}
            onChange={(e) => { setProvIdx(Number(e.target.value)); setModelIdx(0); }}
            style={{ ...S.selectorPill, border: "none", outline: "none", cursor: "pointer", appearance: "auto" as const }}
          >
            {MOCK_PROVIDERS.map((p, i) => <option key={p.id} value={i}>{p.name}</option>)}
          </select>
          <select
            value={modelIdx}
            onChange={(e) => setModelIdx(Number(e.target.value))}
            style={{ ...S.selectorPill, border: "none", outline: "none", cursor: "pointer", appearance: "auto" as const }}
          >
            {chatProv.models.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <span style={S.ctxBar}>
            {isStreaming
              ? `${(messages.length * 0.3).toFixed(1)}k/200k`
              : "0.2k/200k (0%)"}
          </span>
        </div>
        <div style={S.inpRow}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about Arlopass…"
            style={S.inpEl}
            disabled={isStreaming}
          />
          <button
            style={isStreaming || !input.trim() ? S.btnDisabled : S.btn}
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
          >
            ↑
          </button>
        </div>
      </div>
      <div style={S.ft}>
        {isStreaming ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="chat-bounce"
                  style={{
                    animationDelay: `${i * 150}ms`,
                    width: 3,
                    height: 3,
                    borderRadius: "50%",
                    background: "var(--ap-text-tertiary)",
                  }}
                />
              ))}
            </div>
            <span style={S.ftLbl}>Streaming…</span>
          </>
        ) : (
          <>
            <div style={S.ftDot} />
            <span style={S.ftLbl}>Connected via Arlopass</span>
            <span style={S.ftMdl}>Claude 3.5</span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Interactive Chatbot widget preview ─────────────────────────────

function ChatbotWidgetPreview() {
  const [open, setOpen] = useState(true);

  return (
    <div
      style={{
        position: "relative",
        height: 360,
        background: "var(--ap-bg-base)",
        borderRadius: 12,
        overflow: "hidden",
        fontFamily: "system-ui",
      }}
    >
      <div style={{ padding: 24 }}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--ap-text-primary)",
          }}
        >
          My Application
        </div>
        <div
          style={{
            fontSize: 14,
            color: "var(--ap-text-tertiary)",
            marginTop: 4,
          }}
        >
          Your main page content goes here.
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 12,
        }}
      >
        {open && (
          <div
            style={{
              width: 260,
              background: "var(--ap-bg-surface)",
              borderRadius: 12,
              boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
              overflow: "hidden",
              border: "1px solid var(--ap-border)",
              fontSize: 12,
              color: "var(--ap-text-body)",
            }}
          >
            <div style={{ ...S.header, justifyContent: "space-between" }}>
              <span>AI Assistant</span>
              <span
                onClick={() => setOpen(false)}
                style={{
                  color: "var(--ap-text-tertiary)",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                ✕
              </span>
            </div>
            <div
              style={{
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                minHeight: 100,
              }}
            >
              <div style={S.row}>
                <div style={S.avA}>AI</div>
                <div style={{ ...S.bA, maxWidth: 180, fontSize: 11 }}>
                  Hi! How can I help?
                </div>
              </div>
              <div style={S.row}>
                <div style={S.avU}>U</div>
                <div style={{ ...S.bU, maxWidth: 180, fontSize: 11 }}>
                  Show me the docs
                </div>
              </div>
              <div style={S.row}>
                <div style={S.avA}>AI</div>
                <div style={{ ...S.bA, maxWidth: 180, fontSize: 11 }}>
                  Sure! Check out the getting started guide
                  <span
                    style={{
                      display: "inline-block",
                      width: 2,
                      height: 11,
                      background: "var(--ap-text-tertiary)",
                      marginLeft: 2,
                      verticalAlign: "middle",
                    }}
                  />
                </div>
              </div>
            </div>
            <div
              style={{
                borderTop: "1px solid var(--ap-border)",
                padding: 8,
                display: "flex",
                gap: 6,
              }}
            >
              <input
                disabled
                placeholder="Ask AI…"
                style={{ ...S.inpEl, fontSize: 11 }}
              />
              <button style={{ ...S.btn, width: 28, height: 28, fontSize: 11 }}>
                ↑
              </button>
            </div>
          </div>
        )}
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            background: "var(--ap-bg-elevated)",
            color: "var(--ap-text-body)",
            border: "1px solid var(--ap-border)",
            borderRadius: 999,
            padding: "10px 18px",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {open ? "✕ Close" : "💬 Ask AI"}
        </button>
      </div>
    </div>
  );
}

// ─── Interactive Provider Picker preview ────────────────────────────

function ProviderPickerPreview() {
  const [provIdx, setProvIdx] = useState(0);
  const [modelIdx, setModelIdx] = useState(0);
  const [applied, setApplied] = useState<string | null>(null);

  const prov = MOCK_PROVIDERS[provIdx]!;

  return (
    <div style={{ maxWidth: 360, fontFamily: "system-ui", padding: 4 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--ap-text-secondary)",
            }}
          >
            Provider
          </label>
          <select
            value={provIdx}
            onChange={(e) => {
              setProvIdx(Number(e.target.value));
              setModelIdx(0);
              setApplied(null);
            }}
            style={{
              padding: "6px 10px",
              border: "1px solid var(--ap-border)",
              borderRadius: 8,
              fontSize: 12,
              background: "var(--ap-bg-base)",
              color: "var(--ap-text-body)",
              outline: "none",
            }}
          >
            {MOCK_PROVIDERS.map((p, i) => (
              <option key={p.id} value={i}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--ap-text-secondary)",
            }}
          >
            Model
          </label>
          <select
            value={modelIdx}
            onChange={(e) => {
              setModelIdx(Number(e.target.value));
              setApplied(null);
            }}
            style={{
              padding: "6px 10px",
              border: "1px solid var(--ap-border)",
              borderRadius: 8,
              fontSize: 12,
              background: "var(--ap-bg-base)",
              color: "var(--ap-text-body)",
              outline: "none",
            }}
          >
            {prov.models.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setApplied(`${prov.name} / ${prov.models[modelIdx]}`)}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            background: "var(--ap-text-tertiary)",
            color: "white",
            border: "none",
            cursor: "pointer",
          }}
        >
          Apply
        </button>
      </div>
      {applied && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "var(--ap-text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span style={{ color: "#4d7c0f" }}>✓</span> Selected: {applied}
        </div>
      )}
    </div>
  );
}

// ─── Interactive Connection Banner preview ──────────────────────────

function ConnectionBannerPreview() {
  const [state, setState] = useState<
    "not-installed" | "disconnected" | "connected"
  >("not-installed");

  return (
    <div style={{ fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {(["not-installed", "disconnected", "connected"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setState(s)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 500,
              cursor: "pointer",
              border: "1px solid var(--ap-border)",
              background: state === s ? "var(--ap-bg-elevated)" : "transparent",
              color:
                state === s
                  ? "var(--ap-text-primary)"
                  : "var(--ap-text-tertiary)",
            }}
          >
            {s}
          </button>
        ))}
      </div>
      {state === "not-installed" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderRadius: 8,
            border: "1px solid rgba(217,119,6,0.25)",
            background: "rgba(217,119,6,0.06)",
            padding: "10px 14px",
            fontSize: 12,
            color: "var(--ap-text-body)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#d97706",
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1 }}>
            Extension not detected.{" "}
            <span
              style={{
                textDecoration: "underline",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Install it
            </span>{" "}
            to connect your AI providers.
          </span>
        </div>
      )}
      {state === "disconnected" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderRadius: 8,
            border: "1px solid rgba(185,28,28,0.25)",
            background: "rgba(185,28,28,0.06)",
            padding: "10px 14px",
            fontSize: 12,
            color: "var(--ap-text-body)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#b91c1c",
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1 }}>
            Disconnected from Arlopass. Check that the extension is enabled and
            reload.
          </span>
        </div>
      )}
      {state === "connected" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderRadius: 8,
            border: "1px solid rgba(77,124,15,0.25)",
            background: "rgba(77,124,15,0.06)",
            padding: "10px 14px",
            fontSize: 12,
            color: "var(--ap-text-body)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#4d7c0f",
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1 }}>Connected to Arlopass.</span>
        </div>
      )}
    </div>
  );
}

// ─── Interactive Install Button preview ─────────────────────────────

function InstallButtonPreview() {
  const [clicked, setClicked] = useState(false);

  return (
    <div
      style={{
        padding: 12,
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: "system-ui",
      }}
    >
      <button
        onClick={() => {
          setClicked(true);
          setTimeout(() => setClicked(false), 2000);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 20px",
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 13,
          border: "none",
          cursor: "pointer",
          background: clicked
            ? "var(--ap-bg-elevated)"
            : "var(--ap-text-tertiary)",
          color: clicked ? "var(--ap-text-secondary)" : "white",
          transition: "all 200ms",
        }}
      >
        {clicked ? "✓ Redirecting…" : "Install Arlopass"}
      </button>
    </div>
  );
}

// ─── Interactive Extension Gate preview ─────────────────────────────

function ExtensionGatePreview() {
  const [installed, setInstalled] = useState(false);

  return (
    <div style={{ padding: 12, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        <button
          onClick={() => setInstalled(false)}
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 500,
            cursor: "pointer",
            border: "1px solid var(--ap-border)",
            background: !installed ? "var(--ap-bg-elevated)" : "transparent",
            color: !installed
              ? "var(--ap-text-primary)"
              : "var(--ap-text-tertiary)",
          }}
        >
          Not installed
        </button>
        <button
          onClick={() => setInstalled(true)}
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 500,
            cursor: "pointer",
            border: "1px solid var(--ap-border)",
            background: installed ? "var(--ap-bg-elevated)" : "transparent",
            color: installed
              ? "var(--ap-text-primary)"
              : "var(--ap-text-tertiary)",
          }}
        >
          Installed
        </button>
      </div>
      {!installed ? (
        <div
          style={{
            background: "rgba(217,119,6,0.06)",
            border: "1px solid rgba(217,119,6,0.25)",
            borderRadius: 8,
            padding: 16,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--ap-text-primary)",
              marginBottom: 6,
            }}
          >
            AI search requires Arlopass
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--ap-text-secondary)",
              marginBottom: 10,
            }}
          >
            Install the extension to use AI-powered search.
          </div>
          <button
            style={{
              padding: "7px 14px",
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 12,
              background: "var(--ap-text-tertiary)",
              color: "white",
              border: "none",
              cursor: "pointer",
            }}
          >
            Install Arlopass
          </button>
        </div>
      ) : (
        <div
          style={{
            background: "var(--ap-bg-elevated)",
            border: "1px solid var(--ap-border)",
            borderRadius: 8,
            padding: 16,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--ap-text-primary)",
              marginBottom: 4,
            }}
          >
            🔍 AI-Powered Search
          </div>
          <div style={{ fontSize: 11, color: "var(--ap-text-secondary)" }}>
            Feature is active. Type to search with AI.
          </div>
          <input
            disabled
            placeholder="Search with AI…"
            style={{
              marginTop: 10,
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--ap-border)",
              background: "var(--ap-bg-base)",
              color: "var(--ap-text-body)",
              fontSize: 12,
              width: "80%",
              outline: "none",
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Interactive App Required Gate preview ──────────────────────────

function AppRequiredGatePreview() {
  const [installed, setInstalled] = useState(false);

  return (
    <div style={{ fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        <button
          onClick={() => setInstalled(false)}
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 500,
            cursor: "pointer",
            border: "1px solid var(--ap-border)",
            background: !installed ? "var(--ap-bg-elevated)" : "transparent",
            color: !installed
              ? "var(--ap-text-primary)"
              : "var(--ap-text-tertiary)",
          }}
        >
          Blocked
        </button>
        <button
          onClick={() => setInstalled(true)}
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 500,
            cursor: "pointer",
            border: "1px solid var(--ap-border)",
            background: installed ? "var(--ap-bg-elevated)" : "transparent",
            color: installed
              ? "var(--ap-text-primary)"
              : "var(--ap-text-tertiary)",
          }}
        >
          App loaded
        </button>
      </div>
      {!installed ? (
        <div
          style={{
            padding: 28,
            textAlign: "center",
            background: "var(--ap-bg-surface)",
            borderRadius: 8,
            border: "1px solid var(--ap-border)",
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--ap-text-primary)",
              marginBottom: 6,
            }}
          >
            Arlopass Required
          </div>
          <div
            style={{
              fontSize: 12,
              marginBottom: 14,
              color: "var(--ap-text-secondary)",
            }}
          >
            This app needs the Arlopass extension to connect your AI providers.
          </div>
          <button
            onClick={() => setInstalled(true)}
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 13,
              background: "var(--ap-text-tertiary)",
              color: "white",
              border: "none",
              cursor: "pointer",
            }}
          >
            Install Arlopass
          </button>
        </div>
      ) : (
        <div
          style={{
            padding: 28,
            textAlign: "center",
            background: "var(--ap-bg-surface)",
            borderRadius: 8,
            border: "1px solid var(--ap-border)",
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--ap-text-primary)",
              marginBottom: 4,
            }}
          >
            ✨ My App
          </div>
          <div style={{ fontSize: 12, color: "var(--ap-text-secondary)" }}>
            App loaded successfully. AI features are ready.
          </div>
        </div>
      )}
    </div>
  );
}

export default function BlockRegistry() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Block registry</Title>
        <Text c="dimmed" mt={4}>
          Pre-styled Tailwind blocks you copy into your project with a single
          command
        </Text>
      </div>

      <Text>
        Blocks are complete, styled UI components built on top of the{" "}
        <InlineCode>@arlopass/react-ui</InlineCode> primitives. Instead of
        installing them as a dependency, the CLI copies the source files into
        your project so you have full control over the code.
      </Text>

      <Title order={3}>Install a block</Title>
      <CodeBlock title="Terminal" code={addCmd} language="bash" />

      <Title order={3}>Available blocks</Title>
      <Table withTableBorder withColumnBorders highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ID</Table.Th>
            <Table.Th>Name</Table.Th>
            <Table.Th>Description</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {blocks.map((b) => (
            <Table.Tr key={b.id}>
              <Table.Td>
                <Code>{b.id}</Code>
              </Table.Td>
              <Table.Td>{b.name}</Table.Td>
              <Table.Td>
                <Text fz="sm">{b.description}</Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Title order={3}>CLI commands</Title>
      <CodeBlock title="Terminal" code={cliCommands} language="bash" />

      <Title order={3}>Configuration</Title>
      <Text>
        On first run, the CLI creates a{" "}
        <InlineCode>arlopass-ui.json</InlineCode> file in your project root. You
        can edit it to change the output directory or other settings.
      </Text>
      <CodeBlock title="arlopass-ui.json" code={configFile} language="json" />

      <Title order={3}>Chat block</Title>
      <Text>
        A full chat interface with message list, streaming indicator, input
        field, and send/stop buttons. Wrap it in a{" "}
        <InlineCode>ArlopassProvider</InlineCode> and you're ready to go.
      </Text>
      <PreviewCode
        preview={<ChatBlockPreview />}
        code={chatUsage}
        title="Chat usage"
      />

      <Title order={3}>Chatbot widget block</Title>
      <Text>
        A floating chat widget that renders a toggle bubble in the corner of the
        screen. Opens an expandable panel with the full chat interface. It wraps{" "}
        <InlineCode>ArlopassProvider</InlineCode> and guard components
        internally — just drop it anywhere.
      </Text>
      <PreviewCode
        preview={<ChatbotWidgetPreview />}
        code={chatbotUsage}
        title="Chatbot widget"
      />

      <Title order={3}>Provider picker block</Title>
      <Text>
        Styled provider and model selection dropdowns. Fires an{" "}
        <InlineCode>onSelect</InlineCode> callback when the user confirms their
        choice.
      </Text>
      <PreviewCode
        preview={<ProviderPickerPreview />}
        code={providerPickerUsage}
        title="Provider picker"
      />

      <Title order={3}>Connection banner block</Title>
      <Text>
        Shows contextual banners based on the Arlopass extension connection
        state: an install prompt when not detected, a reconnect message when
        disconnected, and a success indicator when connected.
      </Text>
      <PreviewCode
        preview={<ConnectionBannerPreview />}
        code={connectionBannerUsage}
        title="Connection banner"
      />

      <Title order={3}>Install button</Title>
      <Text>
        A styled button/link that directs users to install the Arlopass
        extension. Use inside{" "}
        <InlineCode>{"<ArlopassNotInstalled>"}</InlineCode> or any "not
        installed" fallback.
      </Text>
      <PreviewCode
        preview={<InstallButtonPreview />}
        code={installButtonUsage}
        title="Install button"
      />

      <Title order={3}>Extension required gate (feature-level)</Title>
      <Text>
        Wraps a feature that needs the Arlopass extension. When the extension is
        missing, shows a fallback prompt. When installed, renders the feature
        normally. Use for individual AI-powered features in apps that also work
        without Arlopass.
      </Text>
      <PreviewCode
        preview={<ExtensionGatePreview />}
        code={extensionRequiredUsage}
        title="Extension required gate"
      />

      <Title order={3}>App required gate (full-app)</Title>
      <Text>
        Blocks the entire app when Arlopass is not installed. Use this when your
        app cannot function at all without the extension.
      </Text>
      <PreviewCode
        preview={<AppRequiredGatePreview />}
        code={appRequiredUsage}
        title="App required gate"
      />

      <Callout type="info" title="You own the source">
        After copying, the block source lives in your project. Edit the markup,
        swap Tailwind for your own design system, add props — it's your code
        now. The primitives from <InlineCode>@arlopass/react-ui</InlineCode>{" "}
        remain as npm dependencies for behaviour and state management.
      </Callout>
    </Stack>
  );
}
