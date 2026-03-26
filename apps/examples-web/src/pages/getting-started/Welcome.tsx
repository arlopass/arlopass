import { Stack, Title, Text, Card, Badge, Group, Divider, SimpleGrid } from "@mantine/core";
import { Callout } from "../../components";
import { navigate } from "../../router";

const features = [
  {
    title: "Provider Agnostic",
    badge: "Flexibility",
    color: "blue",
    description:
      "Connect to OpenAI, Anthropic, Google, Ollama, or any provider your users choose. One API, every model.",
  },
  {
    title: "Secure by Default",
    badge: "Security",
    color: "teal",
    description:
      "API keys never touch your servers. The browser extension manages credentials, so you ship zero secrets.",
  },
  {
    title: "Developer Friendly",
    badge: "DX",
    color: "grape",
    description:
      "Full TypeScript support, React hooks, streaming out of the box, and guard components for common UI states.",
  },
];

export default function Welcome() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Welcome to BYOM</Title>
        <Text c="dimmed" mt={4}>
          Bring Your Own Model — an AI wallet for the web
        </Text>
      </div>

      <Text>
        BYOM lets users bring their own AI provider to any web app. Instead of
        locking into a single model or forcing users to trust you with API keys,
        your app connects to whatever provider the user already has — through a
        browser extension that acts as a universal AI wallet.
      </Text>

      <Title order={3}>How it works</Title>
      <Text>
        The architecture has three layers. The{" "}
        <strong>BYOM browser extension</strong> holds the user's provider
        credentials and exposes a secure transport on the page. The{" "}
        <strong>Web SDK</strong> connects to that transport and gives you a
        client for sending messages, streaming responses, and calling tools.
        The <strong>React SDK</strong> wraps the Web SDK in hooks and
        components so you can build AI-powered UIs with minimal boilerplate.
      </Text>

      <Title order={3}>Key features</Title>
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        {features.map((f) => (
          <Card key={f.title} padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="xs">
              <Text fw={600}>{f.title}</Text>
              <Badge color={f.color} variant="light">
                {f.badge}
              </Badge>
            </Group>
            <Text fz="sm" c="dimmed">
              {f.description}
            </Text>
          </Card>
        ))}
      </SimpleGrid>

      <Divider />

      <Title order={3}>Choose your path</Title>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Card
          padding="lg"
          radius="md"
          withBorder
          style={{ cursor: "pointer" }}
          onClick={() => navigate("getting-started/quickstart-web-sdk")}
        >
          <Text fw={600} mb={4}>
            Web SDK
          </Text>
          <Text fz="sm" c="dimmed">
            Framework-agnostic. Use with vanilla JS, Svelte, Vue, or any
            framework. Full control over every call.
          </Text>
        </Card>
        <Card
          padding="lg"
          radius="md"
          withBorder
          style={{ cursor: "pointer" }}
          onClick={() => navigate("getting-started/quickstart-react")}
        >
          <Text fw={600} mb={4}>
            React SDK
          </Text>
          <Text fz="sm" c="dimmed">
            Hooks, providers, and guard components. The fastest way to add AI
            to a React app.
          </Text>
        </Card>
      </SimpleGrid>

      <Callout type="tip" title="New to BYOM?">
        Start with the{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("getting-started/quickstart-react")}
        >
          React Quickstart
        </Text>{" "}
        — you'll have a working chat component in five minutes.
      </Callout>
    </Stack>
  );
}
