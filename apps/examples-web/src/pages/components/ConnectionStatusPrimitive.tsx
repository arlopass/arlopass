import { Stack, Title, Text, Divider } from "@mantine/core";
import { CodeBlock, InlineCode, ApiTable } from "../../components";
import { navigate } from "../../router";

const props = [
  { name: "state", type: "ClientState", description: 'Connection state override. When omitted, reads from the nearest BYOMProvider via useConnection. One of: "disconnected", "connecting", "connected", "degraded", "reconnecting", "failed".' },
  { name: "sessionId", type: "string", description: "Session ID override. When omitted, reads from BYOMProvider." },
  { name: "children", type: "ReactNode", description: "Custom content. Defaults to rendering the state string." },
];

const uncontrolledExample = `import { BYOMProvider } from "@byom-ai/react";
import { ConnectionStatus } from "@byom-ai/react-ui";

function StatusBar() {
  return (
    <BYOMProvider>
      <ConnectionStatus />
    </BYOMProvider>
  );
}`;

const controlledExample = `import { ConnectionStatus } from "@byom-ai/react-ui";

function CustomStatus({ state }) {
  return (
    <ConnectionStatus state={state}>
      {state === "connected" ? "🟢 Online" : "🔴 Offline"}
    </ConnectionStatus>
  );
}`;

const dataAttributes = [
  { name: "data-state", type: '"disconnected" | "connecting" | "connected" | "degraded" | "reconnecting" | "failed"', default: "—", description: "Set on the root div. Mirrors the current connection state." },
];

const stylingExample = `/* Color-code connection states */
[data-state="connected"] {
  color: #22c55e;
}

[data-state="degraded"] {
  color: #eab308;
}

[data-state="disconnected"],
[data-state="failed"] {
  color: #ef4444;
}

[data-state="connecting"],
[data-state="reconnecting"] {
  color: #3b82f6;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}`;

export default function ConnectionStatusPrimitive() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>ConnectionStatus</Title>
        <Text c="dimmed" mt={4}>
          Connection state display
        </Text>
      </div>

      <CodeBlock code={`import { ConnectionStatus } from "@byom-ai/react-ui";`} language="tsx" />

      <Title order={3}>Props</Title>
      <ApiTable data={props} />

      <Divider />
      <Title order={3}>Uncontrolled usage</Title>
      <Text>
        Inside a <InlineCode>{"<BYOMProvider>"}</InlineCode>, the component
        reads connection state automatically via{" "}
        <InlineCode>useConnection</InlineCode>.
      </Text>
      <CodeBlock title="Uncontrolled" code={uncontrolledExample} language="tsx" />

      <Title order={3}>Controlled usage</Title>
      <Text>
        Pass the <InlineCode>state</InlineCode> prop to override auto-detection.
        Useful for storybooks, tests, or custom state management.
      </Text>
      <CodeBlock title="Controlled" code={controlledExample} language="tsx" />

      <Divider />
      <Title order={3}>Data attributes</Title>
      <ApiTable data={dataAttributes} />

      <Title order={3}>Styling</Title>
      <Text>
        The component renders a plain <InlineCode>{"<div>"}</InlineCode> with a{" "}
        <InlineCode>data-state</InlineCode> attribute. Use CSS selectors to
        style each state:
      </Text>
      <CodeBlock title="CSS" code={stylingExample} language="css" />
    </Stack>
  );
}
