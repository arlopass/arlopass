/**
 * Docs context registry for the AI chat sidebar.
 *
 * Indexes all page content, code samples, and scenario descriptions
 * so the chat can search through them and answer questions accurately.
 */

import { SCENARIO_CATALOG, EXTENSION_SNIPPET } from "./scenario-catalog";

export type DocEntry = {
  id: string;
  title: string;
  content: string;
  keywords: string[];
};

const DOCS: DocEntry[] = [
  {
    id: "overview",
    title: "Arlopass Overview",
    content: `Arlopass (Bring Your Own Model) is an AI wallet system. It consists of:
- A Chrome extension that acts as a secure wallet for AI provider credentials
- A web SDK (@arlopass/web-sdk) that web apps use to communicate with the extension
- A native bridge that routes requests to cloud providers (Anthropic, OpenAI, Gemini, etc.) and local runtimes (Ollama)
- An encrypted vault on the bridge that stores credentials, providers, app connections, and token usage (AES-256-GCM)
- A consent/permission system where users control which apps can access which providers and models

The extension acts as a thin client — all sensitive data lives in the encrypted vault on the bridge.
On first use, the user sets up the vault with a master password or OS keychain.
Web apps connect via window.arlopass which is injected by the extension's content script.`,
    keywords: ["arlopass", "overview", "what is", "architecture", "how does", "wallet", "extension", "vault", "encryption"],
  },
  {
    id: "web-sdk",
    title: "Web SDK (ArlopassClient)",
    content: `The @arlopass/web-sdk provides a ArlopassClient class for web apps:

import { ArlopassClient } from "@arlopass/web-sdk";

const client = new ArlopassClient({
  transport: window.arlopass, // injected by extension
  origin: window.location.origin,
  timeoutMs: 120000,
});

// Connect to the wallet
const session = await client.connect({ appId: "com.myapp" });

// List available providers
const { providers } = await client.listProviders();

// Select a provider and model
await client.selectProvider({
  providerId: providers[0].providerId,
  modelId: providers[0].models[0],
});

// Send a chat message
const reply = await client.chat.send({
  messages: [{ role: "user", content: "Hello!" }],
});

// Stream a response
const stream = await client.chat.stream({
  messages: [{ role: "user", content: "Tell me a story" }],
});
for await (const chunk of stream) {
  if (chunk.type === "chunk") process.stdout.write(chunk.delta);
  if (chunk.type === "done") break;
}

Client states: disconnected → connecting → connected → (degraded/reconnecting/failed)`,
    keywords: ["sdk", "client", "ArlopassClient", "connect", "listProviders", "selectProvider", "chat", "send", "stream", "transport", "import"],
  },
  {
    id: "providers",
    title: "Providers",
    content: `Supported provider types:
- Cloud: Anthropic, OpenAI, Gemini, Microsoft Foundry, Amazon Bedrock, Perplexity, Google Vertex AI
- Local: Ollama (connects to local Ollama runtime)
- CLI: GitHub Copilot CLI, Claude Code (via native bridge)

Each provider has:
- An ID (e.g., "arlopass.wallet.provider.cloud-anthropic.xxxxx")
- A name (e.g., "Anthropic Cloud")
- A list of available models
- A status (connected, disconnected, attention, degraded, etc.)
- Metadata including connection method and configuration

Providers are added through the extension popup's onboarding wizard:
1. Select provider type
2. Enter credentials (API key)
3. Test connection
4. Save provider`,
    keywords: ["provider", "anthropic", "openai", "gemini", "ollama", "bedrock", "foundry", "perplexity", "vertex", "cloud", "local", "cli"],
  },
  {
    id: "app-connection",
    title: "App Connection Flow",
    content: `When a web app calls client.connect(), the extension checks if the origin has an approved app connection.

App Identity (appId):
The SDK auto-derives an appId from the page origin using reverse-domain notation:
- https://myapp.com → "com.myapp"
- https://chat.example.org → "org.example.chat"
- http://localhost:5173 → "localhost" (dev origin — no prefix required)

You can set appSuffix for disambiguation: appSuffix: "chat" → "com.myapp.chat"
Or set an explicit appId: appId: "com.myapp.dashboard"
The extension validates that the appId matches the page origin on production (non-dev) domains.

App metadata (appName, appDescription, appIcon) is shown in the approval popup.
Icon URLs must be https:// or data:image/ on production; http:// allowed on dev origins.

If not approved:
1. Extension opens the popup with a connection request showing the app name, icon, and description
2. User sees "Allow connection" / "Decline" 
3. If approved, user selects which providers to share
4. User selects which models to enable (all by default)
5. User configures settings: Rules (low token usage, no fallback, always ask permission), Permissions (autopilot, read balance, auto-select model), Limits (consecutive calls, daily tokens, concurrent calls)
6. App connection is saved

Once connected, the app can only see/use providers and models that were explicitly enabled.
App connections are stored in the encrypted vault on the bridge (vault.apps.save/list/delete).`,
    keywords: ["connect", "connection", "app", "approve", "permission", "settings", "rules", "limits", "consent", "appId", "appSuffix", "appName", "appDescription", "appIcon", "validation", "origin"],
  },
  {
    id: "credentials",
    title: "Credentials & Vault",
    content: `Credentials are stored in an encrypted vault on the native bridge — NOT in chrome.storage.

The vault uses AES-256-GCM encryption with either:
- Master password: PBKDF2 key derivation (210,000 iterations, SHA-256) → AES-256-GCM
- OS keychain: random 32-byte key stored in Windows Credential Manager / macOS Keychain / Linux libsecret → AES-256-GCM

Each credential contains:
- Connector ID (which provider type, e.g., "cloud-anthropic")
- Name (e.g., "Anthropic API Key")
- Fields including the API key/secret
- Created and last-used timestamps

Vault lifecycle:
- First run: user chooses master password or OS keychain → empty encrypted vault created on bridge
- Browser open: extension checks vault status → if locked, shows unlock screen → if keychain mode, auto-unlocks
- During use: all reads/writes go through vault.* messages via a single persistent bridge connection
- Auto-lock: 30 minutes of inactivity → vault locks → user must re-authenticate
- Cross-browser: vault lives on the bridge, works with Chrome, Edge, Firefox simultaneously

The vault file format: 64-byte plaintext header (magic "ARLO", version, keyMode, salt for PBKDF2, IV for GCM, reserved) followed by encrypted JSON + 16-byte GCM auth tag.

Credentials persist across provider removal and can be reused when adding a new provider of the same type.

Zero-knowledge: web apps never see API keys. The bridge reads them from the vault and attaches them to outgoing requests. The extension popup reads credentials on demand via vault.credentials.list (redacted) and vault.credentials.get (with fields).`,
    keywords: ["credential", "vault", "api key", "secret", "storage", "security", "store", "encryption", "aes", "password", "keychain", "pbkdf2", "master password", "auto-lock", "cross-browser"],
  },
  {
    id: "vault-security",
    title: "Vault Security Architecture",
    content: `The Arlopass vault is an encrypted file owned by the native bridge, storing all sensitive data: credentials, providers, app connections, and token usage.

Encryption:
- AES-256-GCM authenticated encryption
- Password mode: PBKDF2 with 210,000 iterations (OWASP 2024 recommendation), SHA-256, 32-byte key
- Keychain mode: random 32-byte key stored in OS credential store (Windows Credential Manager, macOS Keychain, Linux libsecret)
- Salt generated once at vault creation, stored permanently in file header
- IV (nonce) freshly randomized on every write — required for GCM security

Vault file format:
- 64-byte plaintext header: magic "ARLO" (4 bytes), version (1), keyMode (1), salt (32), IV (12), reserved (14)
- Ciphertext: AES-256-GCM encrypted JSON + 16-byte authentication tag

Brute force protection:
- Failed password attempts tracked to disk (survives bridge restarts)
- Escalating lockout: 5 failures → 30s, 10 → 5min, 20+ → 30min delay
- Keychain failures don't count (infrastructure errors, not auth failures)
- Resets only after successful unlock, NOT on restart

Auto-lock:
- 30 minutes of inactivity (configurable via ARLOPASS_VAULT_AUTO_LOCK_MS)
- Timer resets on vault.* messages (rate-limited: max 1 reset per 10 seconds)
- On expiry: re-encrypt to disk, wipe memory, state → locked

Atomic writes: every mutation writes to vault.encrypted.tmp then renames — prevents corruption on crash.

Zero-knowledge design:
- Web apps never see API keys — bridge reads from vault and attaches to outgoing requests
- Extension popup never holds keys in memory — vault.credentials.list returns redacted data
- Vault file unreadable without password/keychain — even if copied

The vault is cross-browser: one bridge, one vault file, works with Chrome + Edge + Firefox simultaneously.

Switching modes: the vault supports rekey (vault.rekey / vault.rekey.keychain) to switch between password and keychain modes without losing data.

Web SDK integration: if a web app calls the SDK and the vault is locked, the extension opens automatically for the user to unlock. The SDK retries transparently after unlock (2-second polling, up to 60 seconds).`,
    keywords: ["vault", "security", "encryption", "aes", "gcm", "pbkdf2", "keychain", "password", "master password", "brute force", "lockout", "auto-lock", "atomic", "zero-knowledge", "cross-browser", "rekey"],
  },
  {
    id: "extension-snippet",
    title: "Integration Code Snippet",
    content: EXTENSION_SNIPPET,
    keywords: ["snippet", "code", "example", "integration", "browser"],
  },
  {
    id: "errors",
    title: "Error Handling",
    content: `The SDK throws ArlopassSDKError with structured error info:
- machineCode: e.g., "ARLOPASS_PERMISSION_DENIED", "ARLOPASS_POLICY_VIOLATION", "ARLOPASS_TRANSIENT_NETWORK"
- reasonCode: e.g., "permission.denied", "policy.denied", "transport.transient_failure"
- retryable: boolean indicating if the request can be retried
- correlationId: for tracing across hops
- details: additional context object

Common errors:
- Connection declined: machineCode="ARLOPASS_PERMISSION_DENIED", user declined the app connection
- Provider unavailable: provider not connected or model not enabled for the app
- Timeout: transport didn't respond within timeoutMs`,
    keywords: ["error", "ArlopassSDKError", "machineCode", "reasonCode", "retry", "timeout", "permission denied"],
  },
  {
    id: "streaming",
    title: "Streaming Chat",
    content: `client.chat.stream() returns an async iterable of chunks:

const stream = await client.chat.stream({
  messages: [{ role: "user", content: "Hello" }],
});

for await (const chunk of stream) {
  switch (chunk.type) {
    case "chunk":
      // chunk.delta contains the text fragment
      // chunk.index is the chunk sequence number
      break;
    case "done":
      // Stream completed successfully
      break;
  }
}

The stream is routed through: web page → content script → background service worker → native bridge → AI provider
Each chunk is delivered as it arrives from the provider.`,
    keywords: ["stream", "streaming", "chunk", "delta", "async", "iterable", "real-time"],
  },
  {
    id: "conversation-manager",
    title: "ConversationManager",
    content: `The ConversationManager class provides automatic conversation history management:

import { ConversationManager } from "@arlopass/web-sdk";

const conversation = new ConversationManager({
  client,
  systemPrompt: "You are a helpful assistant.",
  maxTokens: 8192, // optional — auto-resolves from model
});

// Send messages — history managed automatically
const reply = await conversation.send("What is a closure?");

// Streaming
for await (const event of conversation.stream("Explain useEffect.")) {
  if (event.type === "chunk") process.stdout.write(event.delta);
}

// Pin important context that survives truncation
conversation.addMessage(
  { role: "user", content: "We use React 19 + TypeScript." },
  { pinned: true },
);

// Optional auto-summarization of evicted messages
const conv = new ConversationManager({
  client,
  summarize: true,
  summarizationPrompt: "Summarize focusing on code decisions.",
});

Key features:
- Token-aware sliding window truncation
- System prompt pinning (never evicted)
- Message pinning via addMessage({ pinned: true }) or setPin()
- Auto-summarization of evicted messages (opt-in)
- Built-in model context window lookup (25+ models)
- getContextWindow() and getTokenCount() for inspection
- getContextInfo() returns ContextWindowInfo: maxTokens, usedTokens, reservedOutputTokens, remainingTokens, usageRatio
- ArlopassClient.contextWindowSize getter and getContextInfo(messages) for low-level usage
- React hooks expose contextInfo on both useChat and useConversation`,
    keywords: ["conversation", "manager", "history", "context", "window", "truncation", "pin", "pinning", "summarize", "summarization", "tokens", "maxTokens", "contextInfo", "contextWindowSize", "usageRatio", "remainingTokens", "getContextInfo", "ContextWindowInfo"],
  },
  {
    id: "tool-calling",
    title: "Tool / Function Calling",
    content: `SDK-side function/tool calling via ConversationManager:

import { ConversationManager } from "@arlopass/web-sdk";

const conversation = new ConversationManager({
  client,
  tools: [{
    name: "search_docs",
    description: "Search documentation",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    handler: async (args) => JSON.stringify(await searchDocs(args.query)),
  }],
});

// Auto mode: SDK calls handler, feeds result back, loops until text response
const reply = await conversation.send("Find docs about closures");

// Manual mode (no handler): yields tool_call events, use submitToolResult()
for await (const event of conversation.stream("Get weather")) {
  if (event.type === "tool_call") {
    const result = await fetchWeather(event.arguments.city);
    conversation.submitToolResult(event.toolCallId, result);
  }
  if (event.type === "chunk") console.log(event.delta);
}

How it works:
- Tool definitions injected into system prompt as XML blocks
- Model responds with <tool_call> XML tags
- SDK parses, executes handlers (or yields events for manual), feeds results back
- Loops until model produces text response or maxToolRounds reached
- Works with ALL providers (Ollama, Anthropic, CLI) — no adapter changes

Advanced features:

Tool Priming (primeTools):
Small models often fail to output the correct <tool_call> XML format. Tool priming sends a focused
preliminary message asking the model to select the right tool. Three layers:
- Auto-detect (always on, zero cost): SDK scans user message for tool name fragments and parameter values
- ConversationManager-level: new ConversationManager({ primeTools: true, tools: [...] })
- Per-message: conversation.send("...", { primeTools: true })

Hide Tool Calls (hideToolCalls):
Strip <tool_call> XML markup from responses stored in conversation history:
  new ConversationManager({ hideToolCalls: true, tools: [...] })
  conversation.send("...", { hideToolCalls: true }) // per-message override

Match Ranges:
Every ToolCall and tool_call event includes matchRange: { start, end } — character indices in the response.
Use for highlighting, custom rendering, or manual stripping.
  import { parseToolCalls, stripToolCalls } from "@arlopass/web-sdk";
  const result = parseToolCalls(text, toolNames, toolDefs);
  const clean = stripToolCalls(text, result.matchRanges);

Priming Lifecycle Events:
Stream events for building rich tool UX:
  tool_priming_start — "Looking for tools..." (message: string)
  tool_priming_match — tools found (tools: string[])
  tool_priming_end — priming complete
  tool_call — model called a tool (includes matchRange)
  tool_result — tool execution complete

Multi-Format Parsing (5 strategies):
1. XML tags: <tool_call>{"name":"x","arguments":{}}</tool_call>
2. JSON code blocks: \`\`\`json {"name":"x",...} \`\`\`
3. Bare JSON with "name" field
4. Loose function syntax: tool_name args (at line start)
5. Parameter-key reverse mapping: {"page_id":"x"} → navigate_to_page`,
    keywords: ["tool", "tools", "function", "calling", "function calling", "handler", "tool_call", "tool_result", "manual", "auto", "rag", "priming", "primeTools", "hideToolCalls", "matchRange", "stripToolCalls", "parsing", "lifecycle"],
  },
  {
    id: "react-sdk",
    title: "React SDK (@arlopass/react)",
    content: `The @arlopass/react package provides React bindings for the Arlopass web SDK.
It wraps @arlopass/web-sdk in idiomatic React hooks and components.

Setup — wrap your app in ArlopassProvider:

import { ArlopassProvider, useChat } from "@arlopass/react";

function App() {
  return (
    <ArlopassProvider appId="my-app">
      <ChatUI />
    </ArlopassProvider>
  );
}

ArlopassProvider detects window.arlopass (injected by the extension) and auto-connects.
It accepts optional defaultProvider/defaultModel for auto-selection.

Hooks:
- useConnection() — connection lifecycle: state, sessionId, isConnected, isConnecting, error, connect(), disconnect(), retry()
- useProviders() — provider discovery: providers, selectedProvider, isLoading, listProviders(), selectProvider(), retry()
- useChat() — low-level chat: messages, streamingContent, isStreaming, send(), stream(), stop(), clearMessages(), retry()
- useConversation() — recommended: wraps ConversationManager with tools, pinning, tokenCount, contextWindow, submitToolResult()
- useClient() — escape hatch: returns the raw ArlopassClient or null

Requirements: React 18+, injected transport only (window.arlopass from the browser extension).`,
    keywords: ["react", "hook", "useChat", "useConversation", "useConnection", "useProviders", "useClient", "ArlopassProvider", "provider"],
  },
  {
    id: "react-guards",
    title: "React SDK Guard Components",
    content: `Guard components from @arlopass/react/guards provide declarative conditional rendering based on connection/provider/chat state.

3 Positive Gates (show children when condition met, render fallback otherwise):
- <ArlopassConnectionGate fallback={...}> — renders children when connected
- <ArlopassProviderGate fallback={...}> — renders children when a provider is selected
- <ArlopassChatReadyGate connectingFallback={...} notInstalledFallback={...} providerFallback={...} errorFallback={({ error, retry }) => ...}> — all-in-one gate

7 Negative Guards (render function children when condition met):
- <ArlopassNotInstalled>{() => <p>Install extension</p>}</ArlopassNotInstalled>
- <ArlopassDisconnected>{() => <p>Not connected</p>}</ArlopassDisconnected>
- <ArlopassConnected>{() => <p>Connected!</p>}</ArlopassConnected>
- <ArlopassProviderNotReady>{() => <p>Select provider</p>}</ArlopassProviderNotReady>
- <ArlopassHasError>{({ error, retry }) => <p>{error.message}</p>}</ArlopassHasError>
- <ArlopassChatNotReady>{() => <p>Chat not ready</p>}</ArlopassChatNotReady>
- <ArlopassChatReady>{() => <p>Ready to chat!</p>}</ArlopassChatReady>

ArlopassErrorBoundary catches fatal errors in the React tree:
<ArlopassErrorBoundary fallback={({ error, reset }) => <button onClick={reset}>Retry</button>}>
  <App />
</ArlopassErrorBoundary>

Import: import { ArlopassChatReadyGate, ArlopassHasError, ... } from "@arlopass/react/guards";`,
    keywords: ["guard", "gate", "ArlopassConnectionGate", "ArlopassProviderGate", "ArlopassChatReadyGate", "ArlopassNotInstalled", "ArlopassDisconnected", "ArlopassConnected", "ArlopassHasError", "ArlopassChatNotReady", "ArlopassChatReady"],
  },
  {
    id: "react-testing",
    title: "React SDK Testing Utilities",
    content: `Testing utilities from @arlopass/react/testing for unit testing React components that use Arlopass hooks.

createMockTransport(options?) — creates a mock ArlopassTransport:
  import { createMockTransport } from "@arlopass/react/testing";
  const transport = createMockTransport({
    chatResponse: "Mock reply",
    streamChunks: ["Hello ", "world!"],
    providers: [{ providerId: "mock", providerName: "Mock", models: ["mock-model"] }],
  });

MockArlopassProvider — drop-in test wrapper:
  import { MockArlopassProvider } from "@arlopass/react/testing";
  render(
    <MockArlopassProvider transport={transport}>
      <MyComponent />
    </MockArlopassProvider>
  );

mockWindowArlopass(transport) / cleanupWindowArlopass() — inject/clean window.arlopass:
  beforeEach(() => mockWindowArlopass(transport));
  afterEach(() => cleanupWindowArlopass());

waitForChat() / waitForStream() / waitForState(state) — async test helpers:
  await waitForChat(); // waits until chat response arrives
  await waitForStream(); // waits until streaming completes
  await waitForState("connected"); // waits until connection state matches`,
    keywords: ["testing", "mock", "MockArlopassProvider", "createMockTransport", "test", "vitest", "jest"],
  },
  {
    id: "react-ui",
    title: "Components Library (@arlopass/react-ui)",
    content: `The @arlopass/react-ui package provides headless, unstyled compound React components for AI chat interfaces. All components use dot-notation namespaces and support controlled + uncontrolled modes.

Install: npm install @arlopass/react-ui

Components:
- Chat — compound chat interface: Chat.Root, Chat.Messages, Chat.Message, Chat.MessageContent, Chat.Input, Chat.SendButton, Chat.StopButton, Chat.StreamingIndicator, Chat.EmptyState
- Message — standalone message display: Message.Root, Message.Content, Message.Role, Message.Timestamp, Message.Status, Message.ToolCalls
- StreamingText — streaming text renderer with typing cursor
- ProviderPicker — provider/model selection: ProviderPicker.Root, ProviderPicker.ProviderSelect, ProviderPicker.ModelSelect, ProviderPicker.SubmitButton
- ToolActivity — tool call display: ToolActivity.Root, ToolActivity.Call, ToolActivity.Result
- ConnectionStatus — connection state display

Usage (uncontrolled — auto-manages conversation):
import { Chat } from "@arlopass/react-ui";

<ArlopassProvider appId="my-app">
  <Chat.Root systemPrompt="You are helpful.">
    <Chat.Messages>
      {(messages) => messages.map(m => (
        <Chat.Message key={m.id} message={m}>
          <Chat.MessageContent />
        </Chat.Message>
      ))}
    </Chat.Messages>
    <Chat.Input />
    <Chat.SendButton>Send</Chat.SendButton>
  </Chat.Root>
</ArlopassProvider>

Styling: Components render semantic HTML with data-* attributes (data-state, data-role, data-status) for CSS targeting. No CSS shipped.
CSS example: [data-role="user"] { background: #e3f2fd; } [data-state="streaming"] { opacity: 0.7; }`,
    keywords: ["react-ui", "components", "Chat", "Message", "StreamingText", "ProviderPicker", "ToolActivity", "ConnectionStatus", "headless", "compound", "unstyled", "primitive", "data-state", "data-role"],
  },
  {
    id: "ui-registry",
    title: "Block Registry (@arlopass/ui)",
    content: `The @arlopass/ui package is a CLI tool that copies pre-styled Tailwind React components into your project (like shadcn/ui).

CLI usage:
  npx @arlopass/ui add chat          # copy chat block
  npx @arlopass/ui add chatbot       # copy chatbot widget (includes chat)
  npx @arlopass/ui add --all         # copy all blocks
  npx @arlopass/ui list              # list available blocks

Available blocks:
- chat — complete chat interface with messages, streaming, input (ArlopassChat component)
- chatbot — floating chatbot bubble with expandable panel (ArlopassChatbot component, depends on chat)
- provider-picker — styled provider/model dropdowns (ArlopassProviderPicker)
- connection-banner — connection status banner with install prompt (ArlopassConnectionBanner)

Blocks are copied to src/components/arlopass/ by default. Configure with arlopass-ui.json:
  { "outDir": "src/components/arlopass", "overwrite": false }

After copying, you own the source. Modify Tailwind classes freely.
Blocks import from @arlopass/react-ui (headless primitives) and @arlopass/react (hooks/guards).`,
    keywords: ["registry", "blocks", "CLI", "npx", "arlopass-ui", "chat block", "chatbot", "tailwind", "copy", "shadcn", "ArlopassChat", "ArlopassChatbot"],
  },
];

// Add scenarios from catalog
for (const scenario of SCENARIO_CATALOG) {
  DOCS.push({
    id: `scenario-${scenario.id}`,
    title: scenario.title,
    content: `${scenario.summary}\n\nSteps:\n${scenario.steps.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")}\n\nExpected outcome: ${scenario.expectedOutcome}`,
    keywords: scenario.id.split("-"),
  });
}

/**
 * Search docs by query string. Returns the most relevant entries.
 * Uses keyword matching and content search.
 */
export function searchDocs(query: string, maxResults = 3): DocEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (terms.length === 0) return DOCS.slice(0, maxResults);

  const scored = DOCS.map((doc) => {
    let score = 0;
    const lowerContent = doc.content.toLowerCase();
    const lowerTitle = doc.title.toLowerCase();

    for (const term of terms) {
      // Keyword match (highest weight)
      if (doc.keywords.some((kw) => kw.includes(term))) score += 10;
      // Title match
      if (lowerTitle.includes(term)) score += 5;
      // Content match
      const contentMatches = lowerContent.split(term).length - 1;
      score += Math.min(contentMatches, 5) * 2;
    }

    return { doc, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.doc);
}

/**
 * Build a system prompt with relevant doc context for the AI chat.
 */
export function buildSystemPrompt(userQuery: string): string {
  const relevant = searchDocs(userQuery, 3);

  const contextBlocks = relevant.map((doc) =>
    `--- ${doc.title} ---\n${doc.content}`
  ).join("\n\n");

  return `You are a helpful assistant for the Arlopass Wallet documentation website. You answer questions about the Arlopass extension, web SDK, React SDK, providers, app connections, credentials, and how to integrate with Arlopass.

Use the following documentation context to answer accurately. If the answer isn't in the context, say so honestly.

${contextBlocks}

Important:
- Be concise and accurate
- Include code examples when relevant
- Reference specific Arlopass concepts (providers, models, vault, app connections)
- If asked about implementation, show @arlopass/web-sdk or @arlopass/react TypeScript code`;
}
