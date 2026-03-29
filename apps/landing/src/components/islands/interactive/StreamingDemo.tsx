import { Stack, Title, Text, Button, Textarea, Card, Badge, Group, ScrollArea } from "@mantine/core";
import { useInteractive } from "../InteractiveContext";

export default function StreamingDemo() {
  const { prompt, setPrompt, preview, run, doStream, sid, busy, isBusy } = useInteractive();

  return (
    <Stack gap="lg">
      <Title order={2}>Streaming</Title>
      <Text c="dimmed">
        Send a message and watch the response stream in real-time, chunk by chunk.
      </Text>

      {!sid && (
        <Card withBorder p="sm">
          <Text size="sm" c="dimmed">
            Connect and select a provider first — use the Connection or Playground page.
          </Text>
        </Card>
      )}

      {/* Prompt */}
      <Textarea
        label="Prompt"
        placeholder="Type a message to stream…"
        autosize
        minRows={2}
        maxRows={6}
        value={prompt}
        onChange={(e) => setPrompt(e.currentTarget.value)}
      />

      <Group>
        <Button
          onClick={() => run("Stream", async () => { await doStream(); })}
          loading={busy === "Stream"}
          disabled={!sid || (isBusy && busy !== "Stream")}
        >
          Stream
        </Button>
        {busy === "Stream" && (
          <Badge color="yellow" variant="light">Streaming…</Badge>
        )}
      </Group>

      {/* Live preview */}
      <Card withBorder>
        <Text size="xs" fw={600} c="dimmed" mb={4}>Live stream output</Text>
        <ScrollArea h={200} offsetScrollbars>
          {preview ? (
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{preview}</Text>
          ) : (
            <Text size="sm" c="dimmed">
              Stream output will appear here as chunks arrive…
            </Text>
          )}
        </ScrollArea>
      </Card>
    </Stack>
  );
}
