import { Stack, Title, Text, Divider } from "@mantine/core";
import { ApiTable, CodeBlock, InlineCode } from "../../../components";

const importLine = `import {
  ArlopassConnectionGate,
  ArlopassProviderGate,
  ArlopassChatReadyGate,
  ArlopassNotInstalled,
  ArlopassDisconnected,
  ArlopassConnected,
  ArlopassProviderNotReady,
  ArlopassHasError,
  ArlopassChatNotReady,
  ArlopassChatReady,
  ArlopassErrorBoundary,
} from "@arlopass/react/guards";`;

// ---------------------------------------------------------------------------
// Positive gates
// ---------------------------------------------------------------------------

const connectionGateProps = [
  {
    name: "fallback",
    type: "ReactNode",
    default: "null",
    description: "Rendered while connecting or when disconnected.",
  },
  {
    name: "errorFallback",
    type: "(props: { error: ArlopassSDKError; retry: (() => Promise<void>) | null }) => ReactNode",
    description:
      "Rendered when connection fails. Receives the error and a retry function.",
  },
  {
    name: "notInstalledFallback",
    type: "ReactNode",
    description: "Rendered when the Arlopass extension is not installed.",
  },
  {
    name: "children",
    type: "ReactNode",
    required: true,
    description:
      'Rendered when connected (state is "connected" or "degraded").',
  },
];

const connectionGateExample = `<ArlopassConnectionGate
  fallback={<p>Connecting…</p>}
  notInstalledFallback={<p>Please install the Arlopass extension.</p>}
  errorFallback={({ error, retry }) => (
    <div>
      <p>Error: {error.message}</p>
      {retry && <button onClick={retry}>Retry</button>}
    </div>
  )}
>
  <MyApp />
</ArlopassConnectionGate>`;

const providerGateProps = [
  {
    name: "fallback",
    type: "ReactNode",
    default: "null",
    description: "Rendered when no provider is selected.",
  },
  {
    name: "loadingFallback",
    type: "ReactNode",
    description:
      "Rendered while providers are being listed. Falls back to fallback if not set.",
  },
  {
    name: "children",
    type: "ReactNode",
    required: true,
    description: "Rendered when a provider is selected.",
  },
];

const providerGateExample = `<ArlopassProviderGate fallback={<ProviderPicker />}>
  <Chat />
</ArlopassProviderGate>`;

const chatReadyGateProps = [
  {
    name: "connectingFallback",
    type: "ReactNode",
    default: "null",
    description: "Rendered while connecting.",
  },
  {
    name: "notInstalledFallback",
    type: "ReactNode",
    description: "Rendered when the extension is not installed.",
  },
  {
    name: "providerFallback",
    type: "ReactNode",
    default: "null",
    description: "Rendered when connected but no provider is selected.",
  },
  {
    name: "errorFallback",
    type: "(props: { error: ArlopassSDKError; retry: (() => Promise<void>) | null }) => ReactNode",
    description: "Rendered on connection failure.",
  },
  {
    name: "children",
    type: "ReactNode",
    required: true,
    description: "Rendered when connected and a provider is selected.",
  },
];

const chatReadyGateExample = `<ArlopassChatReadyGate
  connectingFallback={<Spinner />}
  providerFallback={<ProviderPicker />}
>
  <Chat />
</ArlopassChatReadyGate>`;

// ---------------------------------------------------------------------------
// Negative guards
// ---------------------------------------------------------------------------

const negativeGuards = [
  {
    name: "ArlopassNotInstalled",
    description:
      "Renders children only when the Arlopass extension is not detected.",
    childrenType: "ReactNode | (() => ReactNode)",
  },
  {
    name: "ArlopassDisconnected",
    description:
      'Renders children when the client is not connected (any state except "connected" or "degraded").',
    childrenType: "ReactNode | (() => ReactNode)",
  },
  {
    name: "ArlopassConnected",
    description:
      'Renders children only when connected ("connected" or "degraded").',
    childrenType: "ReactNode | (() => ReactNode)",
  },
  {
    name: "ArlopassProviderNotReady",
    description: "Renders children when no provider is selected.",
    childrenType: "ReactNode | (() => ReactNode)",
  },
  {
    name: "ArlopassHasError",
    description:
      "Renders children when a connection error is present. Children receive { error, retry } as a render prop.",
    childrenType:
      "(props: { error: ArlopassSDKError; retry: (() => Promise<void>) | null }) => ReactNode",
  },
  {
    name: "ArlopassChatNotReady",
    description:
      "Renders children when chat is not ready (not connected or no provider selected).",
    childrenType: "ReactNode | (() => ReactNode)",
  },
  {
    name: "ArlopassChatReady",
    description:
      "Renders children only when chat is ready (connected and provider selected).",
    childrenType: "ReactNode | (() => ReactNode)",
  },
];

const negativeGuardsData = negativeGuards.map((g) => ({
  name: g.name,
  type: "Component",
  description: `${g.description} Children type: ${g.childrenType}`,
}));

const negativeExample = `<ArlopassNotInstalled>
  <p>Install the Arlopass extension to use AI features.</p>
</ArlopassNotInstalled>

<ArlopassHasError>
  {({ error, retry }) => (
    <div>
      <p>{error.message}</p>
      {retry && <button onClick={retry}>Retry</button>}
    </div>
  )}
</ArlopassHasError>`;

// ---------------------------------------------------------------------------
// ArlopassErrorBoundary
// ---------------------------------------------------------------------------

const errorBoundaryProps = [
  {
    name: "fallback",
    type: "(props: { error: Error; resetErrorBoundary: () => void }) => ReactNode",
    required: true,
    description:
      "Render prop called when an error is caught. Receives the error and a reset function.",
  },
  {
    name: "onError",
    type: "(error: Error, errorInfo: ErrorInfo) => void",
    description: "Optional callback for logging or telemetry.",
  },
  {
    name: "children",
    type: "ReactNode",
    required: true,
    description: "Child tree to wrap with the error boundary.",
  },
];

const errorBoundaryExample = `<ArlopassErrorBoundary
  fallback={({ error, resetErrorBoundary }) => (
    <div>
      <p>Something went wrong: {error.message}</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  )}
  onError={(err, info) => console.error(err, info)}
>
  <Chat />
</ArlopassErrorBoundary>`;

export default function GuardsAPI() {
  return (
    <Stack gap="lg">
      <Title order={2}>Guard Components</Title>
      <Text>
        Guards conditionally render children based on connection state, provider
        selection, and error conditions. Import from{" "}
        <InlineCode>@arlopass/react/guards</InlineCode>.
      </Text>

      <CodeBlock code={importLine} language="tsx" />

      {/* Positive gates -------------------------------------------------- */}
      <Divider />
      <Title order={3}>Positive gates</Title>
      <Text>
        Gates render their children when a condition is met and show a fallback
        otherwise.
      </Text>

      <Title order={4}>ArlopassConnectionGate</Title>
      <Text>
        Renders children when the client is connected. Shows fallbacks for
        loading, error, and not-installed states.
      </Text>
      <ApiTable data={connectionGateProps} title="Props" />
      <CodeBlock code={connectionGateExample} language="tsx" />

      <Title order={4}>ArlopassProviderGate</Title>
      <Text>Renders children when a provider/model pair is selected.</Text>
      <ApiTable data={providerGateProps} title="Props" />
      <CodeBlock code={providerGateExample} language="tsx" />

      <Title order={4}>ArlopassChatReadyGate</Title>
      <Text>
        All-in-one gate that checks connection, provider selection, and error
        state. Renders children only when everything is ready to chat.
      </Text>
      <ApiTable data={chatReadyGateProps} title="Props" />
      <CodeBlock code={chatReadyGateExample} language="tsx" />

      {/* Negative guards ------------------------------------------------- */}
      <Divider />
      <Title order={3}>Negative guards</Title>
      <Text>
        Negative guards render children when a condition is <strong>not</strong>{" "}
        met. They accept <InlineCode>ReactNode</InlineCode> or a render function
        as children.
      </Text>

      <ApiTable data={negativeGuardsData} title="Guards" />
      <CodeBlock code={negativeExample} language="tsx" />

      {/* Error boundary -------------------------------------------------- */}
      <Divider />
      <Title order={3}>ArlopassErrorBoundary</Title>
      <Text>
        A React error boundary that catches rendering errors in the child tree.
        Standard class-component boundary with a render-prop fallback.
      </Text>
      <ApiTable data={errorBoundaryProps} title="Props" />
      <CodeBlock code={errorBoundaryExample} language="tsx" />
    </Stack>
  );
}
