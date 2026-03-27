import { Stack, Title, Text, Divider } from "@mantine/core";
import { CodeBlock, InlineCode, ApiTable, PreviewCode } from "../../components";

const props = [
  {
    name: "state",
    type: "ClientState",
    description:
      'Connection state override. When omitted, reads from the nearest ArlopassProvider via useConnection. One of: "disconnected", "connecting", "connected", "degraded", "reconnecting", "failed".',
  },
  {
    name: "sessionId",
    type: "string",
    description:
      "Session ID override. When omitted, reads from ArlopassProvider.",
  },
  {
    name: "children",
    type: "ReactNode",
    description: "Custom content. Defaults to rendering the state string.",
  },
];

const uncontrolledExample = `import { ArlopassProvider } from "@arlopass/react";
import { ConnectionStatus } from "@arlopass/react-ui";

function StatusBar() {
  return (
    <ArlopassProvider>
      <ConnectionStatus />
    </ArlopassProvider>
  );
}`;

const controlledExample = `import { ConnectionStatus } from "@arlopass/react-ui";

function CustomStatus({ state }) {
  return (
    <ConnectionStatus state={state}>
      {state === "connected" ? "🟢 Online" : "🔴 Offline"}
    </ConnectionStatus>
  );
}`;

const dataAttributes = [
  {
    name: "data-state",
    type: '"disconnected" | "connecting" | "connected" | "degraded" | "reconnecting" | "failed"',
    default: "—",
    description: "Set on the root div. Mirrors the current connection state.",
  },
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

      <CodeBlock
        code={`import { ConnectionStatus } from "@arlopass/react-ui";`}
        language="tsx"
      />

      <Title order={3}>Props</Title>
      <ApiTable data={props} />

      <Divider />
      <Title order={3}>Uncontrolled usage</Title>
      <Text>
        Inside a <InlineCode>{"<ArlopassProvider>"}</InlineCode>, the component
        reads connection state automatically via{" "}
        <InlineCode>useConnection</InlineCode>.
      </Text>
      <PreviewCode
        preview={
          <div
            style={{
              display: "flex",
              gap: 12,
              fontFamily: "system-ui",
              fontSize: 13,
              flexWrap: "wrap",
            }}
          >
            {[
              "connected",
              "disconnected",
              "connecting",
              "degraded",
              "failed",
            ].map((s) => (
              <span
                key={s}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 500,
                  background:
                    s === "connected"
                      ? "#d1fae5"
                      : s === "disconnected"
                        ? "#f3f4f6"
                        : s === "connecting"
                          ? "#dbeafe"
                          : s === "degraded"
                            ? "#fef3c7"
                            : "#fee2e2",
                  color:
                    s === "connected"
                      ? "#065f46"
                      : s === "disconnected"
                        ? "#6b7280"
                        : s === "connecting"
                          ? "#1e40af"
                          : s === "degraded"
                            ? "#92400e"
                            : "#991b1b",
                }}
              >
                {s}
              </span>
            ))}
          </div>
        }
        code={uncontrolledExample}
        title="ConnectionStatus"
      />

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
