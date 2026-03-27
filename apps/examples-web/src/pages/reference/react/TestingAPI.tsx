import { Stack, Title, Text, Divider } from "@mantine/core";
import { ApiTable, CodeBlock, InlineCode } from "../../../components";

const importLine = `import {
  createMockTransport,
  MockArlopassProvider,
  mockWindowArlopass,
  cleanupWindowArlopass,
  simulateExternalDisconnect,
  waitForSnapshot,
  waitForChat,
  waitForStream,
  waitForState,
} from "@arlopass/react/testing";`;

// ---------------------------------------------------------------------------
// createMockTransport
// ---------------------------------------------------------------------------

const mockTransportOptions = [
  {
    name: "capabilities",
    type: "readonly string[]",
    default:
      '["session.create", "provider.list", "chat.completions", "chat.stream"]',
    description: "Capabilities returned on session.create.",
  },
  {
    name: "providers",
    type: "readonly { providerId: string; providerName: string; models: readonly string[] }[]",
    default:
      '[{ providerId: "mock", providerName: "Mock Provider", models: ["mock-model"] }]',
    description: "Providers returned on provider.list.",
  },
  {
    name: "chatResponse",
    type: "string | (() => string)",
    default: '"Hello from mock!"',
    description:
      "Response for chat.completions. Can be a string or a factory function.",
  },
  {
    name: "failOn",
    type: "string",
    description:
      'Capability name to throw an error on (e.g. "chat.completions").',
  },
  {
    name: "chatError",
    type: "Error",
    description: "Specific error to throw on chat.completions.",
  },
  {
    name: "latency",
    type: "number",
    default: "0",
    description: "Simulated latency in milliseconds before responding.",
  },
  {
    name: "streamChunks",
    type: "readonly string[]",
    description:
      "Individual chunks for chat.stream. Each string becomes a chunk payload.",
  },
  {
    name: "streamResponse",
    type: "string",
    description: "Full stream response — overrides streamChunks when set.",
  },
];

const mockTransportExample = `const transport = createMockTransport({
  chatResponse: "Hello!",
  latency: 100,
});`;

// ---------------------------------------------------------------------------
// MockArlopassProvider
// ---------------------------------------------------------------------------

const mockProviderProps = [
  {
    name: "transport",
    type: "ArlopassTransport",
    required: true,
    description: "Mock transport to inject as window.arlopass.",
  },
  {
    name: "appId",
    type: "string",
    default: '"test"',
    description: "App ID for the provider.",
  },
  {
    name: "children",
    type: "ReactNode",
    required: true,
    description: "Components under test.",
  },
  {
    name: "...rest",
    type: "ArlopassProviderProps",
    description:
      "All other ArlopassProvider props (defaultProvider, autoConnect, etc.).",
  },
];

const mockProviderExample = `const transport = createMockTransport();

render(
  <MockArlopassProvider transport={transport}>
    <MyComponent />
  </MockArlopassProvider>
);`;

// ---------------------------------------------------------------------------
// Window mocks
// ---------------------------------------------------------------------------

const windowMocksData = [
  {
    name: "mockWindowArlopass",
    type: "(transport: ArlopassTransport) => void",
    description:
      "Injects a transport as window.arlopass. Use before rendering ArlopassProvider in tests.",
  },
  {
    name: "cleanupWindowArlopass",
    type: "() => void",
    description: "Removes window.arlopass to simulate extension not installed.",
  },
  {
    name: "simulateExternalDisconnect",
    type: "(transport: ArlopassTransport) => Promise<void>",
    description:
      "Removes window.arlopass and calls transport.disconnect() if available.",
  },
];

const windowMocksExample = `// Setup
mockWindowArlopass(transport);

// Teardown
cleanupWindowArlopass();

// Simulate disconnect
await simulateExternalDisconnect(transport);`;

// ---------------------------------------------------------------------------
// Wait helpers
// ---------------------------------------------------------------------------

const waitHelpersData = [
  {
    name: "waitForSnapshot",
    type: "(store: ClientStore, predicate: (snapshot: ClientSnapshot) => boolean, options?: { timeout?: number }) => Promise<ClientSnapshot>",
    description:
      "Polls the store until the predicate returns true. Default timeout: 3000ms.",
  },
  {
    name: "waitForChat",
    type: "(screen: Screen, testId?: string) => Promise<HTMLElement>",
    description:
      'Waits for an element with the given data-testid (default: "chat-ready") to appear.',
  },
  {
    name: "waitForStream",
    type: "(screen: Screen, options?: { timeout?: number }) => Promise<void>",
    description:
      'Waits until the streaming indicator disappears (data-testid="streaming" is removed).',
  },
  {
    name: "waitForState",
    type: "(screen: Screen, state: string, options?: { timeout?: number }) => Promise<void>",
    description: 'Waits until data-testid="state" has the given text content.',
  },
];

const waitHelpersExample = `// Wait for connected state
await waitForState(screen, "connected");

// Wait for streaming to finish
await waitForStream(screen, { timeout: 5000 });`;

export default function TestingAPI() {
  return (
    <Stack gap="lg">
      <Title order={2}>Testing Utilities</Title>
      <Text>
        Helpers for unit and integration testing. Import from{" "}
        <InlineCode>@arlopass/react/testing</InlineCode>.
      </Text>

      <CodeBlock code={importLine} language="tsx" />

      {/* createMockTransport ---------------------------------------------- */}
      <Divider />
      <Title order={3}>createMockTransport</Title>
      <Text>
        Creates a <InlineCode>ArlopassTransport</InlineCode> that responds to
        protocol capabilities without a real extension. Supports configurable
        responses, errors, latency, and streaming.
      </Text>
      <ApiTable data={mockTransportOptions} title="MockTransportOptions" />
      <CodeBlock code={mockTransportExample} language="tsx" />

      {/* MockArlopassProvider ------------------------------------------------- */}
      <Divider />
      <Title order={3}>MockArlopassProvider</Title>
      <Text>
        Test wrapper that injects a mock transport into{" "}
        <InlineCode>window.arlopass</InlineCode> and wraps children with{" "}
        <InlineCode>{"<ArlopassProvider>"}</InlineCode>. Drop-in replacement for
        the real provider in test renders.
      </Text>
      <ApiTable data={mockProviderProps} title="Props" />
      <CodeBlock code={mockProviderExample} language="tsx" />

      {/* Window mocks ----------------------------------------------------- */}
      <Divider />
      <Title order={3}>Window mocks</Title>
      <Text>
        Low-level functions for controlling{" "}
        <InlineCode>window.arlopass</InlineCode> in tests.
      </Text>
      <ApiTable data={windowMocksData} title="Functions" />
      <CodeBlock code={windowMocksExample} language="tsx" />

      {/* Wait helpers ----------------------------------------------------- */}
      <Divider />
      <Title order={3}>Wait helpers</Title>
      <Text>
        Polling utilities for async test assertions. All accept an optional{" "}
        <InlineCode>timeout</InlineCode> (default 3000ms, poll interval 50ms).
      </Text>
      <ApiTable data={waitHelpersData} title="Functions" />
      <CodeBlock code={waitHelpersExample} language="tsx" />
    </Stack>
  );
}
