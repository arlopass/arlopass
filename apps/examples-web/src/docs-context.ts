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
        title: "BYOM Overview",
        content: `BYOM (Bring Your Own Model) is an AI wallet system. It consists of:
- A Chrome extension that acts as a secure wallet for AI provider credentials
- A web SDK (@byom-ai/web-sdk) that web apps use to communicate with the extension
- A native bridge that routes requests to cloud providers (Anthropic, OpenAI, Gemini, etc.) and local runtimes (Ollama)
- A consent/permission system where users control which apps can access which providers and models

The extension popup shows connected providers, models, apps, and stored credentials (vault).
Web apps connect via window.byom which is injected by the extension's content script.`,
        keywords: ["byom", "overview", "what is", "architecture", "how does", "wallet", "extension"],
    },
    {
        id: "web-sdk",
        title: "Web SDK (BYOMClient)",
        content: `The @byom-ai/web-sdk provides a BYOMClient class for web apps:

import { BYOMClient } from "@byom-ai/web-sdk";

const client = new BYOMClient({
  transport: window.byom, // injected by extension
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
        keywords: ["sdk", "client", "BYOMClient", "connect", "listProviders", "selectProvider", "chat", "send", "stream", "transport", "import"],
    },
    {
        id: "providers",
        title: "Providers",
        content: `Supported provider types:
- Cloud: Anthropic, OpenAI, Gemini, Microsoft Foundry, Amazon Bedrock, Perplexity, Google Vertex AI
- Local: Ollama (connects to local Ollama runtime)
- CLI: GitHub Copilot CLI, Claude Code (via native bridge)

Each provider has:
- An ID (e.g., "byom.wallet.provider.cloud-anthropic.xxxxx")
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

If not approved:
1. Extension opens the popup with a connection request
2. User sees "Allow connection" / "Decline" 
3. If approved, user selects which providers to share
4. User selects which models to enable (all by default)
5. User configures settings: Rules (low token usage, no fallback, always ask permission), Permissions (autopilot, read balance, auto-select model), Limits (consecutive calls, daily tokens, concurrent calls)
6. App connection is saved

Once connected, the app can only see/use providers and models that were explicitly enabled.
App connections are stored in chrome.storage.local under byom.wallet.apps.v1.`,
        keywords: ["connect", "connection", "app", "approve", "permission", "settings", "rules", "limits", "consent"],
    },
    {
        id: "credentials",
        title: "Credentials & Vault",
        content: `Credentials are stored in the extension's vault (chrome.storage.local under byom.wallet.credentials.v1).

Each credential contains:
- Connector ID (which provider type, e.g., "cloud-anthropic")
- Name (e.g., "Anthropic API Key")
- Fields including the API key/secret
- Created and last-used timestamps

Credentials persist across provider removal — if you delete a provider, the credential stays in the vault and can be reused when adding a new provider of the same type.

Security: chrome.storage.local is extension-private and encrypted at rest by Chrome.`,
        keywords: ["credential", "vault", "api key", "secret", "storage", "security", "store"],
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
        content: `The SDK throws BYOMSDKError with structured error info:
- machineCode: e.g., "BYOM_PERMISSION_DENIED", "BYOM_POLICY_VIOLATION", "BYOM_TRANSIENT_NETWORK"
- reasonCode: e.g., "permission.denied", "policy.denied", "transport.transient_failure"
- retryable: boolean indicating if the request can be retried
- correlationId: for tracing across hops
- details: additional context object

Common errors:
- Connection declined: machineCode="BYOM_PERMISSION_DENIED", user declined the app connection
- Provider unavailable: provider not connected or model not enabled for the app
- Timeout: transport didn't respond within timeoutMs`,
        keywords: ["error", "BYOMSDKError", "machineCode", "reasonCode", "retry", "timeout", "permission denied"],
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

import { ConversationManager } from "@byom-ai/web-sdk";

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
- getContextWindow() and getTokenCount() for inspection`,
        keywords: ["conversation", "manager", "history", "context", "window", "truncation", "pin", "pinning", "summarize", "summarization", "tokens", "maxTokens"],
    },
    {
        id: "tool-calling",
        title: "Tool / Function Calling",
        content: `SDK-side function/tool calling via ConversationManager:

import { ConversationManager } from "@byom-ai/web-sdk";

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
  import { parseToolCalls, stripToolCalls } from "@byom-ai/web-sdk";
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

    return `You are a helpful assistant for the BYOM AI Wallet documentation website. You answer questions about the BYOM extension, web SDK, providers, app connections, credentials, and how to integrate with BYOM.

Use the following documentation context to answer accurately. If the answer isn't in the context, say so honestly.

${contextBlocks}

Important:
- Be concise and accurate
- Include code examples when relevant
- Reference specific BYOM concepts (providers, models, vault, app connections)
- If asked about implementation, show @byom-ai/web-sdk TypeScript code`;
}
