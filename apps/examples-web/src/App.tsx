import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppShell,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Container,
  Divider,
  Group,
  List,
  Loader,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconPlugConnected, IconX } from "@tabler/icons-react";
import {
  BYOMClient,
  BYOMSDKError,
  type BYOMTransport,
  type ChatMessage,
  type ProviderDescriptor,
} from "@byom-ai/web-sdk";

import { createDemoTransport, getInjectedTransport, type DemoTransportMode } from "./demo-transport";
import { EXTENSION_SNIPPET, SCENARIO_CATALOG } from "./scenario-catalog";

type TransportProfile = "auto" | "injected" | DemoTransportMode;

type Feedback = Readonly<{
  kind: "success" | "error" | "info";
  title: string;
  message: string;
}>;

type LogEntry = Readonly<{
  id: string;
  at: string;
  level: "info" | "success" | "error";
  message: string;
  details?: string;
}>;

const TRANSPORT_PROFILE_OPTIONS: readonly { value: TransportProfile; label: string }[] = [
  { value: "auto", label: "Auto (Injected -> Mock)" },
  { value: "injected", label: "Injected extension transport" },
  { value: "mock", label: "Mock bridge transport" },
  { value: "slow", label: "Slow transport (timeout demo)" },
  { value: "failure", label: "Failure transport (typed error demo)" },
];

function createLogId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `log.${Date.now()}.${Math.random().toString(36).slice(2)}`;
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString();
}

function serializeError(error: unknown): string {
  if (error instanceof BYOMSDKError) {
    const detailsEntry =
      error.details !== undefined
        ? [`details=${JSON.stringify(error.details)}`]
        : [];

    return [
      `machineCode=${error.machineCode}`,
      `reasonCode=${error.reasonCode}`,
      `retryable=${String(error.retryable)}`,
      ...(error.correlationId !== undefined
        ? [`correlationId=${error.correlationId}`]
        : []),
      ...detailsEntry,
    ].join(" | ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function errorToFeedback(context: string, error: unknown): Feedback {
  if (error instanceof BYOMSDKError) {
    return {
      kind: "error",
      title: `${context} failed`,
      message: `${error.message} (${error.reasonCode})`,
    };
  }

  if (error instanceof Error) {
    return {
      kind: "error",
      title: `${context} failed`,
      message: error.message,
    };
  }

  return {
    kind: "error",
    title: `${context} failed`,
    message: String(error),
  };
}

type ResolvedTransport = Readonly<{
  transport: BYOMTransport;
  source: string;
  warning?: string;
}>;

function resolveTransport(profile: TransportProfile): ResolvedTransport {
  const injectedTransport = getInjectedTransport();

  if (profile === "injected") {
    if (injectedTransport === null) {
      throw new Error(
        "window.byom was not found. Load the extension content script on this page or use Auto/Mock mode.",
      );
    }

    return {
      transport: injectedTransport,
      source: "Injected extension transport",
    };
  }

  if (profile === "auto") {
    if (injectedTransport !== null) {
      return {
        transport: injectedTransport,
        source: "Injected extension transport",
      };
    }

    return {
      transport: createDemoTransport("mock"),
      source: "Demo mock transport",
      warning:
        "window.byom is unavailable, so the app is using the built-in demo transport.",
    };
  }

  return {
    transport: createDemoTransport(profile),
    source: `Demo ${profile} transport`,
  };
}

export default function App(): JSX.Element {
  const clientRef = useRef<BYOMClient | null>(null);
  const [transportProfile, setTransportProfile] = useState<TransportProfile>("auto");
  const [appId, setAppId] = useState("com.byom.examples.app");
  const [originOverride, setOriginOverride] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [activeOperation, setActiveOperation] = useState<string | null>(null);
  const [transportSource, setTransportSource] = useState("Not connected");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [clientState, setClientState] = useState("disconnected");
  const [capabilities, setCapabilities] = useState<readonly string[]>([]);
  const [providers, setProviders] = useState<readonly ProviderDescriptor[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("Explain how BYOM protects provider credentials.");
  const [chatHistory, setChatHistory] = useState<readonly ChatMessage[]>([]);
  const [streamPreview, setStreamPreview] = useState("");
  const [logs, setLogs] = useState<readonly LogEntry[]>([]);
  const [injectedAvailable, setInjectedAvailable] = useState(
    () => getInjectedTransport() !== null,
  );

  useEffect(() => {
    const refreshInjectedAvailability = (): void => {
      setInjectedAvailable(getInjectedTransport() !== null);
    };

    refreshInjectedAvailability();
    window.addEventListener("byom:injected", refreshInjectedAvailability as EventListener);
    window.addEventListener("focus", refreshInjectedAvailability);
    window.addEventListener("pageshow", refreshInjectedAvailability);

    return () => {
      window.removeEventListener("byom:injected", refreshInjectedAvailability as EventListener);
      window.removeEventListener("focus", refreshInjectedAvailability);
      window.removeEventListener("pageshow", refreshInjectedAvailability);
    };
  }, []);

  const isBusy = activeOperation !== null;

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.providerId === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );
  const modelOptions = useMemo(
    () =>
      (selectedProvider?.models ?? []).map((model) => ({
        value: model,
        label: model,
      })),
    [selectedProvider],
  );

  const providerOptions = useMemo(
    () =>
      providers.map((provider) => ({
        value: provider.providerId,
        label: `${provider.providerName} (${provider.providerId})`,
      })),
    [providers],
  );

  const appendLog = (
    level: LogEntry["level"],
    message: string,
    details?: string,
  ): void => {
    const entry: LogEntry = {
      id: createLogId(),
      at: formatTimestamp(new Date()),
      level,
      message,
      ...(details !== undefined ? { details } : {}),
    };

    setLogs((previous) => [entry, ...previous].slice(0, 120));
  };

  const setClientStateFromRef = (): void => {
    setClientState(clientRef.current?.state ?? "disconnected");
  };

  const runOperation = async (
    operationName: string,
    operation: () => Promise<void>,
  ): Promise<void> => {
    if (activeOperation !== null) {
      return;
    }

    setActiveOperation(operationName);
    try {
      await operation();
    } catch (error) {
      const operationFeedback = errorToFeedback(operationName, error);
      setFeedback(operationFeedback);
      appendLog("error", `${operationName} failed`, serializeError(error));
    } finally {
      setActiveOperation(null);
      setClientStateFromRef();
      setInjectedAvailable(getInjectedTransport() !== null);
    }
  };

  const performConnect = async (): Promise<void> => {
    await clientRef.current?.disconnect().catch(() => undefined);

    const resolved = resolveTransport(transportProfile);
    const origin =
      originOverride.trim().length > 0 ? originOverride.trim() : window.location.origin;
    const timeoutMs =
      transportProfile === "slow"
        ? 1_500
        : transportProfile === "injected" || transportProfile === "auto"
          ? 45_000
          : 6_000;
    const client = new BYOMClient({
      transport: resolved.transport,
      origin,
      timeoutMs,
    });

    const connectResult = await client.connect({
      appId,
      origin,
    });

    clientRef.current = client;
    setSessionId(connectResult.sessionId);
    setCapabilities(connectResult.capabilities);
    setTransportSource(resolved.source);
    setFeedback({
      kind: "success",
      title: "Connected",
      message: `Session established (${connectResult.sessionId}).`,
    });
    appendLog(
      "success",
      `Connected via ${resolved.source}`,
      `correlationId=${connectResult.correlationId}`,
    );

    if (resolved.warning !== undefined) {
      setFeedback({
        kind: "info",
        title: "Connected with fallback",
        message: resolved.warning,
      });
      appendLog("info", "Transport fallback applied", resolved.warning);
    }
  };

  const performListProviders = async (): Promise<
    Readonly<{ providerId: string; modelId: string }> | null
  > => {
    const client = clientRef.current;
    if (client === null) {
      throw new Error("Connect first.");
    }

    const result = await client.listProviders();
    setProviders(result.providers);
    const firstProvider = result.providers[0];
    const firstModel = firstProvider?.models[0];
    setSelectedProviderId(firstProvider?.providerId ?? null);
    setSelectedModelId(firstModel ?? null);

    setFeedback({
      kind: "success",
      title: "Providers loaded",
      message: `Received ${result.providers.length} provider(s).`,
    });
    appendLog(
      "success",
      "Fetched provider list",
      `correlationId=${result.correlationId}`,
    );

    if (firstProvider?.providerId !== undefined && firstModel !== undefined) {
      return {
        providerId: firstProvider.providerId,
        modelId: firstModel,
      };
    }

    return null;
  };

  const performSelectProvider = async (
    explicitSelection?: Readonly<{ providerId: string; modelId: string }>,
  ): Promise<void> => {
    const client = clientRef.current;
    if (client === null) {
      throw new Error("Connect first.");
    }

    const providerId = explicitSelection?.providerId ?? selectedProviderId;
    const modelId = explicitSelection?.modelId ?? selectedModelId;
    if (providerId === null || modelId === null || providerId === undefined || modelId === undefined) {
      throw new Error("Choose both provider and model.");
    }

    const result = await client.selectProvider({
      providerId,
      modelId,
    });
    setFeedback({
      kind: "success",
      title: "Provider selected",
      message: `${result.providerId} / ${result.modelId}`,
    });
    appendLog(
      "success",
      "Provider selection confirmed",
      `correlationId=${result.correlationId}`,
    );
  };

  const performSendChat = async (): Promise<void> => {
    const client = clientRef.current;
    if (client === null) {
      throw new Error("Connect first.");
    }
    const promptValue = prompt.trim();
    if (promptValue.length === 0) {
      throw new Error("Prompt must be non-empty.");
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: promptValue,
    };
    setChatHistory((previous) => [...previous, userMessage]);

    const response = await client.chat.send({
      messages: [userMessage],
    });
    setChatHistory((previous) => [...previous, response.message]);
    setFeedback({
      kind: "success",
      title: "Chat response received",
      message: "Non-streaming chat request completed.",
    });
    appendLog(
      "success",
      "chat.send completed",
      `correlationId=${response.correlationId}`,
    );
  };

  const performStreamChat = async (): Promise<void> => {
    const client = clientRef.current;
    if (client === null) {
      throw new Error("Connect first.");
    }
    const promptValue = prompt.trim();
    if (promptValue.length === 0) {
      throw new Error("Prompt must be non-empty.");
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: promptValue,
    };
    setChatHistory((previous) => [...previous, userMessage]);
    setStreamPreview("");

    let streamed = "";
    for await (const event of client.chat.stream({
      messages: [userMessage],
    })) {
      if (event.type === "chunk") {
        streamed += event.delta;
        setStreamPreview(streamed);
      } else {
        appendLog(
          "info",
          "chat.stream completed",
          `correlationId=${event.correlationId}`,
        );
      }
    }

    if (streamed.length > 0) {
      setChatHistory((previous) => [
        ...previous,
        {
          role: "assistant",
          content: streamed,
        },
      ]);
    }
    setFeedback({
      kind: "success",
      title: "Stream completed",
      message: "Streaming chat scenario finished.",
    });
  };

  const performDisconnect = async (): Promise<void> => {
    await clientRef.current?.disconnect();
    clientRef.current = null;
    setSessionId(null);
    setCapabilities([]);
    setProviders([]);
    setSelectedProviderId(null);
    setSelectedModelId(null);
    setStreamPreview("");
    setTransportSource("Not connected");
    setFeedback({
      kind: "info",
      title: "Disconnected",
      message: "Client session has been closed.",
    });
    appendLog("info", "Client disconnected");
  };

  const connect = async (): Promise<void> => runOperation("Connect", performConnect);
  const listProviders = async (): Promise<void> =>
    runOperation("List providers", async () => {
      await performListProviders();
    });
  const selectProvider = async (): Promise<void> =>
    runOperation("Select provider", performSelectProvider);
  const sendChat = async (): Promise<void> => runOperation("Chat send", performSendChat);
  const streamChat = async (): Promise<void> =>
    runOperation("Chat stream", performStreamChat);
  const disconnect = async (): Promise<void> =>
    runOperation("Disconnect", performDisconnect);

  const runHappyPathScenario = async (): Promise<void> =>
    runOperation("Run happy-path scenario", async () => {
      await performConnect();
      const selection = await performListProviders();
      if (selection === null) {
        throw new Error("No providers/models were returned by listProviders.");
      }
      await performSelectProvider(selection);
      await performSendChat();
    });

  const clearSessionData = (): void => {
    setChatHistory([]);
    setStreamPreview("");
    setLogs([]);
    setFeedback(null);
  };

  const feedbackIcon =
    feedback?.kind === "error" ? <IconX size={16} /> : feedback?.kind === "success" ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />;

  const feedbackColor =
    feedback?.kind === "error"
      ? "red"
      : feedback?.kind === "success"
        ? "green"
        : "blue";

  return (
    <AppShell header={{ height: 74 }} padding="md">
      <AppShell.Header>
        <Container size="xl" h="100%">
          <Group h="100%" justify="space-between">
            <Box>
              <Title order={3}>BYOM Extension + SDK Examples</Title>
              <Text size="sm" c="dimmed">
                Production-style integration playground with Mantine UI.
              </Text>
            </Box>
            <Group gap="xs">
              <Badge variant="light" color={sessionId !== null ? "green" : "gray"}>
                {sessionId !== null ? "CONNECTED" : "DISCONNECTED"}
              </Badge>
              <Badge variant="outline">{clientState.toUpperCase()}</Badge>
            </Group>
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="xl" py="md">
          <Stack gap="md">
            {feedback !== null ? (
              <Alert icon={feedbackIcon} color={feedbackColor} title={feedback.title} withCloseButton onClose={() => setFeedback(null)}>
                {feedback.message}
              </Alert>
            ) : null}

            {!injectedAvailable ? (
              <Alert color="yellow" icon={<IconAlertTriangle size={16} />} title="Extension transport not detected">
                <Text size="sm">
                  `window.byom` is currently unavailable in this page context. Use
                  Auto mode to fallback to mock transport, or ensure extension injection
                  is enabled for this origin.
                </Text>
              </Alert>
            ) : (
              <Alert color="teal" icon={<IconPlugConnected size={16} />} title="Extension transport detected">
                <Text size="sm">
                  `window.byom` is available. You can run real extension-backed SDK
                  scenarios from this page.
                </Text>
              </Alert>
            )}

            <Tabs defaultValue="playground">
              <Tabs.List>
                <Tabs.Tab value="playground">Interactive playground</Tabs.Tab>
                <Tabs.Tab value="scenarios">Scenario catalog</Tabs.Tab>
                <Tabs.Tab value="snippet">Integration snippet</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="playground" pt="md">
                <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
                  <Card withBorder radius="md" p="md">
                    <Stack gap="sm">
                      <Title order={4}>Connection controls</Title>
                      <Text size="sm" c="dimmed">
                        Choose transport profile, establish session, then run BYOM SDK flows.
                      </Text>
                      <Select
                        label="Transport profile"
                        value={transportProfile}
                        data={TRANSPORT_PROFILE_OPTIONS}
                        onChange={(value) => {
                          if (value !== null) {
                            setTransportProfile(value as TransportProfile);
                          }
                        }}
                        disabled={isBusy}
                      />
                      <TextInput
                        label="App ID"
                        value={appId}
                        onChange={(event) => setAppId(event.currentTarget.value)}
                        disabled={isBusy}
                      />
                      <TextInput
                        label="Origin override (optional)"
                        value={originOverride}
                        onChange={(event) => setOriginOverride(event.currentTarget.value)}
                        placeholder="Defaults to window.location.origin"
                        disabled={isBusy}
                      />
                      <Group>
                        <Button onClick={() => void connect()} disabled={isBusy}>
                          Connect
                        </Button>
                        <Button variant="default" onClick={() => void disconnect()} disabled={isBusy}>
                          Disconnect
                        </Button>
                        <Button variant="light" onClick={() => void runHappyPathScenario()} disabled={isBusy}>
                          Run happy-path
                        </Button>
                      </Group>

                      <Divider />
                      <Group justify="space-between">
                        <Text size="sm">Transport source</Text>
                        <Code>{transportSource}</Code>
                      </Group>
                      <Group justify="space-between">
                        <Text size="sm">Session</Text>
                        <Code>{sessionId ?? "N/A"}</Code>
                      </Group>
                      <Group justify="space-between" align="flex-start">
                        <Text size="sm">Capabilities</Text>
                        <Group gap={6} justify="flex-end">
                          {capabilities.length === 0 ? (
                            <Text size="xs" c="dimmed">
                              none
                            </Text>
                          ) : (
                            capabilities.map((capability) => (
                              <Badge key={capability} variant="light" color="gray">
                                {capability}
                              </Badge>
                            ))
                          )}
                        </Group>
                      </Group>
                    </Stack>
                  </Card>

                  <Card withBorder radius="md" p="md">
                    <Stack gap="sm">
                      <Title order={4}>Provider scenarios</Title>
                      <Text size="sm" c="dimmed">
                        Demonstrates provider discovery, model selection, and session switching.
                      </Text>
                      <Group>
                        <Button variant="default" onClick={() => void listProviders()} disabled={isBusy}>
                          List providers
                        </Button>
                        <Button variant="default" onClick={() => void selectProvider()} disabled={isBusy}>
                          Select provider
                        </Button>
                      </Group>
                      <Select
                        label="Provider"
                        placeholder="Pick provider"
                        data={providerOptions}
                        value={selectedProviderId}
                        onChange={(value) => {
                          setSelectedProviderId(value);
                          const provider = providers.find((item) => item.providerId === value);
                          setSelectedModelId(provider?.models[0] ?? null);
                        }}
                        disabled={isBusy || providers.length === 0}
                      />
                      <Select
                        label="Model"
                        placeholder="Pick model"
                        data={modelOptions}
                        value={selectedModelId}
                        onChange={(value) => setSelectedModelId(value)}
                        disabled={isBusy || modelOptions.length === 0}
                      />
                      <Text size="xs" c="dimmed">
                        Extension scenario: choose provider/model in wallet first, then execute
                        SDK operations in this app.
                      </Text>
                    </Stack>
                  </Card>

                  <Card withBorder radius="md" p="md">
                    <Stack gap="sm">
                      <Title order={4}>Chat + stream scenarios</Title>
                      <Textarea
                        label="Prompt"
                        minRows={3}
                        autosize
                        value={prompt}
                        onChange={(event) => setPrompt(event.currentTarget.value)}
                        disabled={isBusy}
                      />
                      <Group>
                        <Button onClick={() => void sendChat()} disabled={isBusy}>
                          chat.send
                        </Button>
                        <Button variant="default" onClick={() => void streamChat()} disabled={isBusy}>
                          chat.stream
                        </Button>
                      </Group>

                      <Divider />
                      <Text fw={600} size="sm">
                        Stream preview
                      </Text>
                      <ScrollArea h={86} type="always">
                        <Text size="sm" className="mono-text">
                          {streamPreview.length > 0 ? streamPreview : "No active stream."}
                        </Text>
                      </ScrollArea>
                    </Stack>
                  </Card>

                  <Card withBorder radius="md" p="md">
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Title order={4}>Chat transcript</Title>
                        <Button size="xs" variant="light" onClick={clearSessionData} disabled={isBusy}>
                          Clear
                        </Button>
                      </Group>
                      <ScrollArea h={210} type="always">
                        <Stack gap="xs">
                          {chatHistory.length === 0 ? (
                            <Text size="sm" c="dimmed">
                              No chat messages yet.
                            </Text>
                          ) : (
                            chatHistory.map((message, index) => (
                              <Card key={`${message.role}-${index}`} withBorder radius="sm" p="xs">
                                <Group justify="space-between" mb={4}>
                                  <Badge variant="light" color={message.role === "user" ? "blue" : "green"}>
                                    {message.role}
                                  </Badge>
                                  <Text size="xs" c="dimmed">
                                    #{index + 1}
                                  </Text>
                                </Group>
                                <Text size="sm">{message.content}</Text>
                              </Card>
                            ))
                          )}
                        </Stack>
                      </ScrollArea>
                    </Stack>
                  </Card>
                </SimpleGrid>

                <Card withBorder radius="md" p="md" mt="md">
                  <Group justify="space-between" mb="sm">
                    <Title order={4}>Event log</Title>
                    {isBusy ? <Loader size="xs" /> : null}
                  </Group>
                  <ScrollArea h={240} type="always">
                    <Stack gap="xs">
                      {logs.length === 0 ? (
                        <Text size="sm" c="dimmed">
                          No events yet. Run a scenario to see telemetry-style logs.
                        </Text>
                      ) : (
                        logs.map((entry) => (
                          <Card key={entry.id} withBorder radius="sm" p="xs">
                            <Group justify="space-between" mb={2}>
                              <Group gap={6}>
                                <Badge
                                  color={
                                    entry.level === "error"
                                      ? "red"
                                      : entry.level === "success"
                                        ? "green"
                                        : "blue"
                                  }
                                  variant="light"
                                >
                                  {entry.level.toUpperCase()}
                                </Badge>
                                <Text size="sm" fw={500}>
                                  {entry.message}
                                </Text>
                              </Group>
                              <Text size="xs" c="dimmed">
                                {entry.at}
                              </Text>
                            </Group>
                            {entry.details !== undefined ? (
                              <Text size="xs" className="mono-text">
                                {entry.details}
                              </Text>
                            ) : null}
                          </Card>
                        ))
                      )}
                    </Stack>
                  </ScrollArea>
                </Card>
              </Tabs.Panel>

              <Tabs.Panel value="scenarios" pt="md">
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                  {SCENARIO_CATALOG.map((scenario) => (
                    <Card key={scenario.id} withBorder radius="md" p="md">
                      <Stack gap="xs">
                        <Title order={4}>{scenario.title}</Title>
                        <Text size="sm" c="dimmed">
                          {scenario.summary}
                        </Text>
                        <List size="sm" spacing={6} mt="xs">
                          {scenario.steps.map((step) => (
                            <List.Item key={`${scenario.id}-${step}`}>{step}</List.Item>
                          ))}
                        </List>
                        <Alert color="gray" variant="light" title="Expected outcome">
                          <Text size="sm">{scenario.expectedOutcome}</Text>
                        </Alert>
                      </Stack>
                    </Card>
                  ))}
                </SimpleGrid>
              </Tabs.Panel>

              <Tabs.Panel value="snippet" pt="md">
                <Card withBorder radius="md" p="md">
                  <Stack gap="sm">
                    <Title order={4}>Extension + SDK integration snippet</Title>
                    <Text size="sm" c="dimmed">
                      This is the minimal browser pattern for using injected extension transport.
                    </Text>
                    <ScrollArea h={340} type="always">
                      <Code block className="snippet-block">
                        {EXTENSION_SNIPPET}
                      </Code>
                    </ScrollArea>
                  </Stack>
                </Card>
              </Tabs.Panel>
            </Tabs>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

