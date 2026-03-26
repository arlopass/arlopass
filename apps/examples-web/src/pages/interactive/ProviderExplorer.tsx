import { Stack, Title, Text, Button, Group, Badge, Card, Select, Alert } from "@mantine/core";
import { useInteractive } from "../../interactive-context";

export default function ProviderExplorer() {
  const {
    provs, provOpts, modelOpts,
    selProv, setSelProv, selModel, setSelModel,
    run, doList, doSelect,
    sid, busy, isBusy, fb, setFb,
  } = useInteractive();

  return (
    <Stack gap="lg">
      <Title order={2}>Providers</Title>
      <Text c="dimmed">
        List available providers, browse their models, and select a provider/model pair for chat.
      </Text>

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

      {!sid && (
        <Alert color="yellow" title="Not connected">
          Connect to the bridge first to list providers.
        </Alert>
      )}

      {/* List button */}
      <Button
        onClick={() => run("List Providers", async () => { await doList(); })}
        loading={busy === "List Providers"}
        disabled={!sid || (isBusy && busy !== "List Providers")}
      >
        List Providers
      </Button>

      {/* Provider / model selection */}
      {provs.length > 0 && (
        <Card withBorder>
          <Stack gap="sm">
            <Text fw={600}>
              {provs.length} provider{provs.length !== 1 ? "s" : ""} available
            </Text>

            <Select
              label="Provider"
              data={provOpts}
              value={selProv}
              onChange={(v) => {
                setSelProv(v);
                // Auto-select first model of new provider
                const prov = provs.find((p) => p.providerId === v);
                setSelModel(prov?.models[0] ?? null);
              }}
              placeholder="Select a provider"
            />

            <Select
              label="Model"
              data={modelOpts}
              value={selModel}
              onChange={(v) => setSelModel(v)}
              placeholder="Select a model"
              disabled={!selProv}
            />

            <Button
              onClick={() => run("Select", async () => { await doSelect(); })}
              loading={busy === "Select"}
              disabled={!selProv || !selModel || (isBusy && busy !== "Select")}
            >
              Select Provider + Model
            </Button>
          </Stack>
        </Card>
      )}

      {/* Provider list details */}
      {provs.length > 0 && (
        <Stack gap="xs">
          <Text fw={600} size="sm">All providers</Text>
          {provs.map((p) => (
            <Card key={p.providerId} withBorder padding="sm">
              <Group justify="space-between">
                <Group gap="xs">
                  <Text size="sm" fw={500}>{p.providerName}</Text>
                  <Badge size="xs" variant="light">{p.providerId}</Badge>
                </Group>
                <Badge size="sm" color="blue" variant="light">
                  {p.models.length} model{p.models.length !== 1 ? "s" : ""}
                </Badge>
              </Group>
              <Group gap={4} mt={4}>
                {p.models.map((m) => (
                  <Badge
                    key={m}
                    size="xs"
                    variant={m === selModel && p.providerId === selProv ? "filled" : "dot"}
                    color={m === selModel && p.providerId === selProv ? "teal" : "gray"}
                  >
                    {m}
                  </Badge>
                ))}
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
