export type ScenarioDefinition = Readonly<{
  id: string;
  title: string;
  summary: string;
  steps: readonly string[];
  expectedOutcome: string;
}>;

export const SCENARIO_CATALOG: readonly ScenarioDefinition[] = [
  {
    id: "sdk-happy-path",
    title: "SDK happy path",
    summary:
      "Connect, list providers, select model, and send a non-streaming chat request.",
    steps: [
      "Initialize BYOMClient with transport (injected extension or demo transport).",
      "Call connect({ appId }) and inspect session + capabilities.",
      "Call listProviders(), select provider/model, then call chat.send().",
    ],
    expectedOutcome:
      "You receive a typed assistant response and correlation IDs for traceability.",
  },
  {
    id: "streaming-chat",
    title: "Streaming chat",
    summary:
      "Render chunked responses in real-time by consuming client.chat.stream().",
    steps: [
      "Connect and select a provider/model first.",
      "Call client.chat.stream({ messages }) and append chunk deltas to UI.",
      "Handle final done event and keep correlation ID for observability.",
    ],
    expectedOutcome:
      "Users see incremental response updates and a deterministic done signal.",
  },
  {
    id: "extension-first",
    title: "Extension-first transport",
    summary:
      "Use injected window.byom transport from the extension when available.",
    steps: [
      "Check whether window.byom exists in the page context.",
      "Build BYOMClient with injected transport and origin.",
      "Fallback to controlled mock transport if extension transport is unavailable.",
    ],
    expectedOutcome:
      "The app remains usable even when extension injection is absent.",
  },
  {
    id: "error-timeout",
    title: "Error + timeout handling",
    summary:
      "Exercise typed BYOM SDK errors for policy denials and transient/timeout failures.",
    steps: [
      "Switch transport profile to Failure or Slow modes.",
      "Run chat.send/chat.stream and catch BYOMSDKError variants.",
      "Show machineCode, reasonCode, retryability, and correlation context.",
    ],
    expectedOutcome:
      "The app can provide robust retries and user guidance for recoverable issues.",
  },
  {
    id: "provider-switching",
    title: "Provider + model switching",
    summary:
      "Switch providers/models in-session to support local + cloud + CLI scenarios.",
    steps: [
      "Fetch provider list and expose provider/model selectors.",
      "Call selectProvider() whenever selection changes.",
      "Route chat requests through the currently selected provider/model pair.",
    ],
    expectedOutcome:
      "One app can safely pivot across Ollama, Claude, and CLI-backed providers.",
  },
];

export const EXTENSION_SNIPPET = `import { BYOMClient, type BYOMTransport } from "@byom-ai/web-sdk";

const transport = (window as Window & { byom?: BYOMTransport }).byom;
if (transport === undefined) {
  throw new Error("BYOM extension transport was not injected.");
}

const client = new BYOMClient({
  transport,
  origin: window.location.origin,
});

await client.connect({ appId: "com.acme.copilot" });
const providers = await client.listProviders();
await client.selectProvider({
  providerId: providers.providers[0]!.providerId,
  modelId: providers.providers[0]!.models[0]!,
});

const reply = await client.chat.send({
  messages: [{ role: "user", content: "Summarize this ticket." }],
});`;

