import { Stack, Title, Text, List } from "@mantine/core";
import { CodeBlock, Callout, InlineCode } from "../../components";
import { navigate } from "../../router";

const installReact = `npm install @byom-ai/react`;

const installWeb = `npm install @byom-ai/web-sdk`;

const installUI = `npm install @byom-ai/react-ui`;

const registryCmd = `npx @byom-ai/ui add chat`;

const verifyReact = `import { BYOMProvider, useConversation } from "@byom-ai/react";

console.log("React SDK loaded ✓");`;

const verifyWeb = `import { BYOMClient } from "@byom-ai/web-sdk";

console.log("Web SDK loaded ✓");`;

export default function Installation() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Installation</Title>
        <Text c="dimmed" mt={4}>
          Install the SDKs and get your environment ready
        </Text>
      </div>

      <Title order={3}>Prerequisites</Title>
      <List spacing="xs">
        <List.Item>
          <Text fz="sm">
            <strong>Node.js 18+</strong> — required for both SDKs
          </Text>
        </List.Item>
        <List.Item>
          <Text fz="sm">
            <strong>React 18+</strong> — required if using the React SDK
          </Text>
        </List.Item>
        <List.Item>
          <Text fz="sm">
            <strong>BYOM browser extension</strong> — installed in the user's
            browser to provide AI credentials
          </Text>
        </List.Item>
      </List>

      <Title order={3}>React SDK</Title>
      <Text>
        The React SDK gives you hooks, providers, and guard components for
        building AI-powered React apps.
      </Text>
      <CodeBlock title="Terminal" code={installReact} language="bash" />

      <Title order={3}>Web SDK</Title>
      <Text>
        The Web SDK is framework-agnostic. Use it with vanilla JavaScript,
        Svelte, Vue, or any other framework.
      </Text>
      <CodeBlock title="Terminal" code={installWeb} language="bash" />

      <Callout type="info" title="You don't need both">
        The React SDK includes <InlineCode>@byom-ai/web-sdk</InlineCode> as a
        dependency — you don't need to install both. Only install the Web SDK
        directly if you're not using React.
      </Callout>

      <Title order={3}>Browser extension</Title>
      <Text>
        BYOM requires the browser extension to be installed in the end user's
        browser. The extension manages provider credentials and exposes the
        secure transport that the SDKs connect to. Install the BYOM browser
        extension from the Chrome Web Store.
      </Text>

      <Title order={3}>Verify installation</Title>
      <Text>
        Add one of these import checks to confirm everything is wired up:
      </Text>
      <CodeBlock title="React SDK" code={verifyReact} />
      <CodeBlock title="Web SDK" code={verifyWeb} />

      <Title order={3}>Components Library</Title>
      <Text>
        The optional components library provides headless React primitives for
        building chat interfaces.
      </Text>
      <CodeBlock title="Terminal" code={installUI} language="bash" />

      <Callout type="info" title="Optional">
        The components library is optional — you can build everything with the
        React SDK hooks alone. The primitives package adds ready-made compound
        components that save time on common UI patterns.
      </Callout>

      <Text>
        You can also use the block registry CLI to copy pre-styled Tailwind
        blocks into your project:
      </Text>
      <CodeBlock title="Terminal" code={registryCmd} language="bash" />

      <Title order={3}>TypeScript</Title>
      <Text>
        Both SDKs ship with full TypeScript declarations. No{" "}
        <InlineCode>@types</InlineCode> packages needed — just import and go.
      </Text>

      <Callout type="tip" title="Next steps">
        Ready to write code? Pick a quickstart:{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("getting-started/quickstart-web-sdk")}
        >
          Web SDK
        </Text>{" "}
        or{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("getting-started/quickstart-react")}
        >
          React SDK
        </Text>
        .
      </Callout>
    </Stack>
  );
}
