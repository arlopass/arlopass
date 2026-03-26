import { Stack, Title, Text, Button, Textarea, Group, Badge, Card, Code, Alert } from "@mantine/core";
import { useInteractive } from "../../interactive-context";
import { PreviewCode, Callout } from "../../components";
import { navigate } from "../../router";

const PLAYGROUND_CODE = `import { BYOMClient } from "@byom-ai/web-sdk";

// 1. Connect
const client = new BYOMClient({ transport, origin });
const session = await client.connect({ appId: "com.example.app" });

// 2. List & select provider
const { providers } = await client.listProviders();
await client.selectProvider({
  providerId: providers[0].providerId,
  modelId: providers[0].models[0],
});

// 3. Send a message
const reply = await client.chat.send({
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(reply.message.content);

// 4. Or stream a response
const stream = await client.chat.stream({
  messages: [{ role: "user", content: "Explain BYOM." }],
});
for await (const chunk of stream) {
  if (chunk.type === "chunk") process.stdout.write(chunk.delta);
  if (chunk.type === "done") break;
}`;

export default function Playground() {
  const {
    sid, fb, setFb, busy, isBusy, prompt, setPrompt, preview, history,
    run, doConnect, doList, doSelect, doSend, doStream, happyPath, state,
  } = useInteractive();

  return (
    <Stack gap="lg">
      <Title order={2}>Playground</Title>
      <Text c="dimmed">
        Live sandbox for testing the BYOM Web SDK. Connect, list providers, select a model, and send messages — all from this page.
      </Text>

      {/* Status */}
      <Group>
        <Badge color={sid ? "teal" : "gray"} variant="dot" size="lg">
          {sid ? "Connected" : "Disconnected"}
        </Badge>
        <Badge color="blue" variant="light">{state}</Badge>
        {sid && <Code>{sid}</Code>}
        {busy && <Badge color="yellow" variant="light">{busy}…</Badge>}
      </Group>

      {/* Feedback */}
      {fb && (
        <Alert
          color={fb.kind === "error" ? "red" : fb.kind === "success" ? "teal" : "blue"}
          title={fb.title}
          withCloseButton
          onClose={() => setFb(null)}
        >
          {fb.message}
        </Alert>
      )}

      {/* Quick actions */}
      <Callout title="Quick start">
        Run the happy-path to connect, list providers, select the first model, and send a test message — all in one click.
      </Callout>

      <Group>
        <Button onClick={happyPath} loading={isBusy} color="violet">
          Run happy-path
        </Button>
        <Button variant="light" onClick={() => run("Connect", doConnect)} disabled={isBusy}>
          Connect
        </Button>
        <Button variant="light" onClick={() => run("List", async () => { await doList(); })} disabled={isBusy || !sid}>
          List Providers
        </Button>
        <Button variant="light" onClick={() => run("Select", async () => { await doSelect(); })} disabled={isBusy || !sid}>
          Select
        </Button>
      </Group>

      {/* Prompt + send */}
      <Textarea
        label="Prompt"
        placeholder="Type a message…"
        autosize
        minRows={2}
        maxRows={6}
        value={prompt}
        onChange={(e) => setPrompt(e.currentTarget.value)}
      />
      <Group>
        <Button onClick={() => run("Send", async () => { await doSend(); })} disabled={isBusy || !sid}>
          Send
        </Button>
        <Button variant="light" onClick={() => run("Stream", async () => { await doStream(); })} disabled={isBusy || !sid}>
          Stream
        </Button>
      </Group>

      {/* Preview / stream output */}
      {preview && (
        <Card withBorder>
          <Text size="xs" fw={600} c="dimmed" mb={4}>Streaming preview</Text>
          <Text style={{ whiteSpace: "pre-wrap" }}>{preview}</Text>
        </Card>
      )}

      {/* Last assistant reply */}
      {history.length > 0 && (
        <Card withBorder>
          <Text size="xs" fw={600} c="dimmed" mb={4}>Last response</Text>
          <Text style={{ whiteSpace: "pre-wrap" }}>
            {history.filter((m) => m.role === "assistant").at(-1)?.content ?? "—"}
          </Text>
        </Card>
      )}

      {/* Code view */}
      <PreviewCode
        preview={
          <Stack gap="xs">
            <Text size="sm" c="dimmed">
              The preview above shows the live interactive demo. Switch to <strong>Code</strong> to see how the Web SDK is used.
            </Text>
            <Group>
              <Button size="xs" variant="subtle" onClick={() => navigate("interactive/connection")}>Connection settings →</Button>
              <Button size="xs" variant="subtle" onClick={() => navigate("interactive/providers")}>Provider explorer →</Button>
              <Button size="xs" variant="subtle" onClick={() => navigate("interactive/chat")}>Chat transcript →</Button>
            </Group>
          </Stack>
        }
        code={PLAYGROUND_CODE}
        title="Web SDK — full lifecycle"
      />
    </Stack>
  );
}
