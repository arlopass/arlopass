import { Stack, Title, Text, List } from "@mantine/core";
import { ApiTable, CodeBlock, Callout, InlineCode } from "../../../components";

const basicUsage = `import { BYOMProvider } from "@byom-ai/react";

function App() {
  return (
    <BYOMProvider>
      <MyChat />
    </BYOMProvider>
  );
}`;

const autoSelectUsage = `<BYOMProvider
  defaultProvider="openai"
  defaultModel="gpt-4o"
>
  <MyChat />
</BYOMProvider>`;

const errorCallbackUsage = `<BYOMProvider
  onError={(err) => console.error(err.machineCode, err.message)}
  autoConnect={false}
>
  <MyChat />
</BYOMProvider>`;

const appIdentityUsage = `<BYOMProvider
  appSuffix="my-chat"
  appName="My Chat App"
  appDescription="A demo chat application"
  appIcon="https://example.com/icon.png"
>
  <MyChat />
</BYOMProvider>`;

const providerProps = [
  {
    name: "appId",
    type: "string",
    description: "Full reverse-domain app identifier. Auto-derived from the page origin if omitted.",
  },
  {
    name: "appSuffix",
    type: "string",
    description: "Suffix appended to the auto-derived domain prefix. Ignored when appId is set.",
  },
  {
    name: "appName",
    type: "string",
    description: "Human-readable app name sent during the connect handshake.",
  },
  {
    name: "appDescription",
    type: "string",
    description: "Short app description sent during the connect handshake.",
  },
  {
    name: "appIcon",
    type: "string",
    description: "URL to a square icon/logo (https:// or data: URI).",
  },
  {
    name: "defaultProvider",
    type: "string",
    description: "Provider ID to auto-select after connecting. Must be paired with defaultModel.",
  },
  {
    name: "defaultModel",
    type: "string",
    description: "Model ID to auto-select after connecting. Must be paired with defaultProvider.",
  },
  {
    name: "autoConnect",
    type: "boolean",
    default: "true",
    description: "Connect to the BYOM extension automatically on mount.",
  },
  {
    name: "onError",
    type: "(error: BYOMSDKError) => void",
    description: "Called when a connection or auto-select error occurs.",
  },
  {
    name: "children",
    type: "ReactNode",
    required: true,
    description: "Child components that consume the BYOM context.",
  },
];

export default function ReactProvider() {
  return (
    <Stack gap="lg">
      <Title order={2}>BYOMProvider</Title>
      <Text>
        The root context provider. Wrap your app (or the subtree that needs AI) with{" "}
        <InlineCode>{"<BYOMProvider>"}</InlineCode> to enable all hooks and guard components.
      </Text>

      <CodeBlock code={`import { BYOMProvider } from "@byom-ai/react";`} language="tsx" />

      <Title order={3}>Props</Title>
      <ApiTable data={providerProps} />

      <Title order={3}>Mount sequence</Title>
      <List type="ordered" spacing="xs">
        <List.Item>
          Detects the injected transport from <InlineCode>window.byom</InlineCode> (set by
          the browser extension).
        </List.Item>
        <List.Item>
          Creates a <InlineCode>BYOMClient</InlineCode> instance bound to that transport.
        </List.Item>
        <List.Item>
          If <InlineCode>autoConnect</InlineCode> is <InlineCode>true</InlineCode> and the
          transport is available, calls <InlineCode>client.connect()</InlineCode> with the
          configured app identity.
        </List.Item>
        <List.Item>
          If <InlineCode>defaultProvider</InlineCode> and <InlineCode>defaultModel</InlineCode>{" "}
          are set, calls <InlineCode>client.selectProvider()</InlineCode> after connecting.
        </List.Item>
        <List.Item>
          Publishes the store via React context so child hooks can read snapshot state.
        </List.Item>
      </List>

      <Title order={3}>Unmount / cleanup</Title>
      <Text>
        On unmount the provider calls <InlineCode>client.disconnect()</InlineCode> and
        destroys the internal store. Any in-flight operations are cancelled.
      </Text>

      <Callout type="info" title="Transport not found">
        If the BYOM extension is not installed, the provider still renders its children. Hooks
        will report <InlineCode>state: "disconnected"</InlineCode> and guard components can
        show an install prompt.
      </Callout>

      <Title order={3}>Examples</Title>

      <Text fw={600} fz="sm">Basic usage</Text>
      <CodeBlock code={basicUsage} language="tsx" />

      <Text fw={600} fz="sm">Auto-select provider and model</Text>
      <CodeBlock code={autoSelectUsage} language="tsx" />

      <Text fw={600} fz="sm">App identity</Text>
      <CodeBlock code={appIdentityUsage} language="tsx" />

      <Text fw={600} fz="sm">Manual connect with error callback</Text>
      <CodeBlock code={errorCallbackUsage} language="tsx" />
    </Stack>
  );
}
