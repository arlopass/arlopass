import { Stack, Title, Text, Card, Badge, Group, Code, Loader } from "@mantine/core";
import { useInteractive } from "../InteractiveContext";

export default function EventLog() {
  const { logs, busy, isBusy } = useInteractive();

  return (
    <Stack gap="lg">
      <Title order={2}>Event Log</Title>
      <Text c="dimmed">
        Real-time log of all SDK operations — connections, provider listings, chat requests, and errors.
      </Text>

      {isBusy && (
        <Group gap="xs">
          <Loader size="xs" />
          <Text size="sm" c="dimmed">{busy}…</Text>
        </Group>
      )}

      {logs.length === 0 ? (
        <Card withBorder p="xl">
          <Text c="dimmed" ta="center">
            No log entries yet. Use the Playground or other interactive pages to generate SDK events.
          </Text>
        </Card>
      ) : (
        <Stack gap="xs">
          {logs.map((entry) => (
            <Card key={entry.id} withBorder padding="sm">
              <Group gap="xs" mb={4}>
                <Badge
                  size="sm"
                  color={entry.level === "success" ? "teal" : entry.level === "error" ? "red" : "blue"}
                  variant="light"
                >
                  {entry.level}
                </Badge>
                <Text size="xs" c="dimmed">{entry.at}</Text>
              </Group>
              <Text size="sm">{entry.message}</Text>
              {entry.details && (
                <Code block mt={4} style={{ fontSize: "0.75rem" }}>
                  {entry.details}
                </Code>
              )}
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
