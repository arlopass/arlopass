import { Stack, Title, Text, Button, Card, Badge, Group } from "@mantine/core";
import { useInteractive } from "../InteractiveContext";

export default function ChatTranscript() {
  const { history, setHistory } = useInteractive();

  return (
    <Stack gap="lg">
      <Title order={2}>Chat</Title>
      <Text c="dimmed">
        View the full message transcript from your interactive session.
      </Text>

      {/* Actions */}
      <Group>
        <Button
          variant="light"
          color="red"
          size="xs"
          onClick={() => setHistory([])}
          disabled={history.length === 0}
        >
          Clear
        </Button>
        <Text size="sm" c="dimmed">
          {history.length} message{history.length !== 1 ? "s" : ""}
        </Text>
      </Group>

      {/* Messages */}
      {history.length === 0 ? (
        <Card withBorder p="xl">
          <Stack align="center" gap="sm">
            <Text c="dimmed" ta="center">
              No messages yet — use the Playground to send messages.
            </Text>
            <Button
              variant="subtle"
              size="sm"
              onClick={() =>
                (window.location.href = "/docs/interactive/playground")
              }
            >
              Go to Playground →
            </Button>
          </Stack>
        </Card>
      ) : (
        <Stack gap="sm">
          {history.map((msg, i) => (
            <Card key={i} withBorder padding="sm">
              <Group gap="xs" mb={4}>
                <Badge
                  size="sm"
                  color={msg.role === "user" ? "blue" : "green"}
                  variant="light"
                >
                  {msg.role}
                </Badge>
              </Group>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {msg.content}
              </Text>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
