import { Stack, Title, Text, Table } from "@mantine/core";
import { Callout, CodeBlock } from "../../components";
import { navigate } from "../../router";

const webSdkExample = `import { ArlopassClient, ConversationManager } from "@arlopass/web-sdk";

const client = new ArlopassClient({ transport: window.arlopass });
await client.connect({ appId: "my-app" });

const providers = await client.listProviders();
await client.selectProvider({ providerId: "ollama", modelId: "llama3" });

const convo = new ConversationManager({ client });
for await (const event of convo.stream("Hello!")) {
  if (event.type === "token") process.stdout.write(event.token);
}

await client.disconnect();`;

const reactSdkExample = `import { ArlopassProvider, useConnection, useProviders, useChat } from "@arlopass/react";

function App() {
  return (
    <ArlopassProvider appId="my-app">
      <Chat />
    </ArlopassProvider>
  );
}

function Chat() {
  const { state } = useConnection();
  const { providers, select } = useProviders();
  const { messages, stream } = useChat({ systemPrompt: "Be helpful." });

  // State management, error handling, streaming optimization —
  // all handled by the hooks. You write the UI.
}`;

const hookMapping = `// Each React hook replaces a manual Web SDK pattern:

// useConnection()     → client.connect() / client.disconnect() / client.state
// useProviders()      → client.listProviders() / client.selectProvider()
// useChat()           → client.chat.send() / client.chat.stream()
// useConversation()   → new ConversationManager({ client })
// useClient()         → escape hatch — returns the raw ArlopassClient
// ArlopassChatReadyGate   → if (state === "connected" && selectedProvider)`;

const escapeHatch = `import { useClient } from "@arlopass/react";

function AdvancedFeature() {
  // useClient() gives you the raw ArlopassClient when you need full control.
  // The React SDK wraps @arlopass/web-sdk — so all web-sdk types
  // are re-exported from @arlopass/react.
  const client = useClient();

  // You can use client directly for operations not covered by hooks,
  // but you lose automatic state sync and streaming optimization.
  // Use sparingly.
}`;

const migrationPath = `// If you started with the Web SDK and want to add React SDK:

// Before — manual state management
const client = new ArlopassClient({ transport: window.arlopass });
// ... manage state, re-renders, cleanup yourself

// After — wrap in ArlopassProvider, use hooks
import { ArlopassProvider, useConnection } from "@arlopass/react";

// The React SDK re-exports web-sdk types, so your existing
// type imports still work:
import type { ProviderDescriptor, ClientState } from "@arlopass/react";

// Migration is additive — you don't rewrite anything,
// you wrap and replace imperative code with hooks.`;

const comparisonData = [
  {
    dimension: "Setup",
    webSdk: "Create client, pass transport, manage lifecycle manually",
    reactSdk: "Wrap in <ArlopassProvider>, hooks handle lifecycle",
  },
  {
    dimension: "State management",
    webSdk: "Manual — poll getters or build your own reactive layer",
    reactSdk: "Automatic — ClientStore + useSyncExternalStore",
  },
  {
    dimension: "Error handling",
    webSdk: "try/catch around every operation",
    reactSdk: "ArlopassErrorBoundary + error state in hooks",
  },
  {
    dimension: "Streaming",
    webSdk: "for-await-of loop, manual DOM updates",
    reactSdk: "Hook returns streaming content, RAF-batched re-renders",
  },
  {
    dimension: "Testing",
    webSdk: "Mock the ArlopassTransport interface directly",
    reactSdk: "createMockTransport + render with ArlopassProvider",
  },
  {
    dimension: "Bundle size",
    webSdk: "Smaller — no React dependency",
    reactSdk: "Includes web-sdk + React integration layer",
  },
  {
    dimension: "Framework",
    webSdk: "Any — vanilla JS, Vue, Svelte, Angular",
    reactSdk: "React 18+ only",
  },
];

export default function WebSDKvsReact() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Web SDK vs React SDK</Title>
        <Text c="dimmed" mt={4}>
          When to use each — or both
        </Text>
      </div>

      <Title order={3}>Two SDKs, one protocol</Title>
      <Text>
        Arlopass ships two SDKs. The Web SDK (<code>@arlopass/web-sdk</code>) is
        the core — a framework-agnostic TypeScript client that handles
        connections, state machines, envelope construction, and streaming. The
        React SDK (<code>@arlopass/react</code>) wraps the Web SDK with hooks,
        providers, error boundaries, and a reactive state layer. They speak the
        same protocol and use the same transport.
      </Text>

      <Title order={3}>Side-by-side comparison</Title>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Dimension</Table.Th>
            <Table.Th>Web SDK</Table.Th>
            <Table.Th>React SDK</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {comparisonData.map((row) => (
            <Table.Tr key={row.dimension}>
              <Table.Td fw={600}>{row.dimension}</Table.Td>
              <Table.Td>{row.webSdk}</Table.Td>
              <Table.Td>{row.reactSdk}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Title order={3}>When to use the Web SDK</Title>
      <Text>
        Use the Web SDK when you're not using React — vanilla JavaScript, Vue,
        Svelte, Angular, or any other framework. It's also the right choice when
        you need full control over the client lifecycle, want to build your own
        reactive abstraction on top, or need the smallest possible bundle.
      </Text>
      <CodeBlock title="Web SDK usage" code={webSdkExample} />

      <Title order={3}>When to use the React SDK</Title>
      <Text>
        Use the React SDK when you're building a React application and want
        managed state, automatic re-renders, streaming optimization, error
        boundaries, and a hooks-based API. It handles the hard parts — state
        synchronization, concurrent rendering safety, and streaming batching —
        so you can focus on your UI.
      </Text>
      <CodeBlock title="React SDK usage" code={reactSdkExample} />

      <Title order={3}>Hook-to-pattern mapping</Title>
      <Text>
        Every React SDK hook replaces a specific Web SDK pattern. If you're
        familiar with the Web SDK, this mapping shows what each hook
        encapsulates.
      </Text>
      <CodeBlock title="What each hook replaces" code={hookMapping} />

      <Callout type="info" title="useClient() — the escape hatch">
        The React SDK re-exports all Web SDK types. If you need the raw{" "}
        <code>ArlopassClient</code> for an operation not covered by hooks, call{" "}
        <code>useClient()</code>. You lose automatic state sync for that
        operation, but you get full control. Use it sparingly.
      </Callout>
      <CodeBlock title="Escape hatch" code={escapeHatch} />

      <Title order={3}>Using both</Title>
      <Text>
        Because the React SDK wraps the Web SDK, you're already using both.
        Types like <code>ProviderDescriptor</code>, <code>ClientState</code>,
        and <code>ChatStreamEvent</code> are re-exported from{" "}
        <code>@arlopass/react</code>. You don't need to install{" "}
        <code>@arlopass/web-sdk</code> separately unless you're importing
        something the React SDK doesn't re-export (which is rare).
      </Text>

      <Title order={3}>Migration path</Title>
      <Text>
        If you started with the Web SDK and want to move to React, the migration
        is additive. Wrap your app in <code>ArlopassProvider</code>, replace
        imperative client calls with hooks, and remove your manual state
        management code. Your existing type imports keep working because the
        React SDK re-exports them.
      </Text>
      <CodeBlock title="Additive migration" code={migrationPath} />

      <Callout type="tip" title="Related">
        See{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("concepts/state-management")}
        >
          State Management
        </Text>{" "}
        for how the React SDK stays in sync with the client, or{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("reference/react-sdk/hooks")}
        >
          Hooks Reference
        </Text>{" "}
        for the complete hook API.
      </Callout>
    </Stack>
  );
}
