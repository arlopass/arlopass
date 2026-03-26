import { Stack, Title, Text } from "@mantine/core";
import { CodeBlock, Callout, StepList } from "../../components";
import { navigate } from "../../router";

const stepInstall = `npm install @byom-ai/web-sdk`;

const stepCreateClient = `import { BYOMClient } from "@byom-ai/web-sdk";

const client = new BYOMClient({
  transport: window.byom,
});`;

const stepConnect = `await client.connect({ appId: "my-app" });
console.log("Connected to BYOM extension");`;

const stepSelectProvider = `const providers = await client.listProviders();
console.log("Available providers:", providers);

// Select the first available provider
await client.selectProvider(providers[0].id);`;

const stepSendMessage = `const response = await client.chat.send({
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello! What can you do?" },
  ],
});

console.log(response.content);`;

const fullExample = `import { BYOMClient } from "@byom-ai/web-sdk";

async function main() {
  // 1. Create the client
  const client = new BYOMClient({
    transport: window.byom,
  });

  // 2. Connect to the extension
  await client.connect({ appId: "my-app" });

  // 3. Pick a provider
  const providers = await client.listProviders();
  await client.selectProvider(providers[0].id);

  // 4. Send a message
  const response = await client.chat.send({
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Explain BYOM in one sentence." },
    ],
  });

  console.log(response.content);
}

main();`;

export default function QuickstartWebSDK() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Quickstart: Web SDK</Title>
        <Text c="dimmed" mt={4}>
          Send your first AI message in 5 minutes
        </Text>
      </div>

      <Callout type="tip" title="Using React?">
        Jump to the{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("getting-started/quickstart-react")}
        >
          React Quickstart
        </Text>{" "}
        instead — it has hooks and components that handle connection state for
        you.
      </Callout>

      <StepList
        steps={[
          {
            title: "Install the Web SDK",
            content: (
              <CodeBlock title="Terminal" code={stepInstall} language="bash" />
            ),
          },
          {
            title: "Create a client",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  The client needs a transport — the bridge to the browser
                  extension. The extension injects it at{" "}
                  <code>window.byom</code>.
                </Text>
                <CodeBlock title="client.ts" code={stepCreateClient} />
              </Stack>
            ),
          },
          {
            title: "Connect to the extension",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  Call <code>connect()</code> with your app ID. This
                  handshakes with the extension and verifies the user has it
                  installed.
                </Text>
                <CodeBlock title="client.ts" code={stepConnect} />
              </Stack>
            ),
          },
          {
            title: "Select a provider",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  List the providers the user has configured, then select one.
                  The extension handles all credential management.
                </Text>
                <CodeBlock title="client.ts" code={stepSelectProvider} />
              </Stack>
            ),
          },
          {
            title: "Send a message",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  Send a chat completion request. The response comes back from
                  whatever model the user chose.
                </Text>
                <CodeBlock title="client.ts" code={stepSendMessage} />
              </Stack>
            ),
          },
        ]}
      />

      <Title order={3}>Complete example</Title>
      <Text>
        Here's everything together in a single file you can run:
      </Text>
      <CodeBlock title="main.ts" code={fullExample} />

      <Callout type="info" title="Next steps">
        Now that you're sending messages, explore{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("tutorials/streaming-responses")}
        >
          streaming responses
        </Text>
        ,{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("guides/conversation-management")}
        >
          conversation management
        </Text>
        , and{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("guides/tool-calling")}
        >
          tool calling
        </Text>
        .
      </Callout>
    </Stack>
  );
}
