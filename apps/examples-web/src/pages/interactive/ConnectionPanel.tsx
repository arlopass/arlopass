import {
  Stack,
  Title,
  Text,
  Button,
  Group,
  Badge,
  Card,
  Code,
  Select,
  TextInput,
  Alert,
} from "@mantine/core";
import {
  useInteractive,
  TRANSPORT_OPTIONS,
  type TransportProfile,
} from "../../interactive-context";

export default function ConnectionPanel() {
  const {
    tp,
    setTp,
    appId,
    setAppId,
    originOv,
    setOriginOv,
    run,
    doConnect,
    doDisconnect,
    sid,
    tpSrc,
    caps,
    state,
    busy,
    isBusy,
    fb,
    setFb,
  } = useInteractive();

  return (
    <Stack gap="lg">
      <Title order={2}>Connection</Title>
      <Text c="dimmed">
        Configure the transport profile, application ID, and origin — then
        connect to the Arlopass bridge.
      </Text>

      {/* Feedback */}
      {fb && (
        <Alert
          color={
            fb.kind === "error"
              ? "red"
              : fb.kind === "success"
                ? "teal"
                : "blue"
          }
          title={fb.title}
          withCloseButton
          onClose={() => setFb(null)}
        >
          {fb.message}
        </Alert>
      )}

      {/* Transport config */}
      <Card withBorder>
        <Stack gap="sm">
          <Text fw={600}>Transport settings</Text>

          <Select
            label="Transport profile"
            data={TRANSPORT_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            value={tp}
            onChange={(v) => v && setTp(v as TransportProfile)}
          />

          <TextInput
            label="App ID"
            placeholder="com.arlopass.examples.app"
            value={appId}
            onChange={(e) => setAppId(e.currentTarget.value)}
          />

          <TextInput
            label="Origin override"
            description="Leave blank to use the current page origin"
            placeholder={window.location.origin}
            value={originOv}
            onChange={(e) => setOriginOv(e.currentTarget.value)}
          />
        </Stack>
      </Card>

      {/* Actions */}
      <Group>
        <Button
          onClick={() => run("Connect", doConnect)}
          loading={busy === "Connect"}
          disabled={isBusy && busy !== "Connect"}
        >
          Connect
        </Button>
        <Button
          variant="light"
          color="red"
          onClick={() => run("Disconnect", doDisconnect)}
          disabled={!sid || isBusy}
        >
          Disconnect
        </Button>
      </Group>

      {/* Session info */}
      <Card withBorder>
        <Stack gap="xs">
          <Text fw={600}>Session</Text>
          <Group>
            <Badge color={sid ? "teal" : "gray"} variant="dot" size="lg">
              {sid ? "Connected" : "Disconnected"}
            </Badge>
            <Badge color="blue" variant="light">
              {state}
            </Badge>
          </Group>

          {sid && (
            <>
              <Group gap="xs">
                <Text size="sm" fw={500}>
                  Session ID:
                </Text>
                <Code>{sid}</Code>
              </Group>
              <Group gap="xs">
                <Text size="sm" fw={500}>
                  Transport:
                </Text>
                <Text size="sm">{tpSrc}</Text>
              </Group>
              {caps.length > 0 && (
                <Group gap="xs">
                  <Text size="sm" fw={500}>
                    Capabilities:
                  </Text>
                  {caps.map((c) => (
                    <Badge key={c} size="sm" variant="light">
                      {c}
                    </Badge>
                  ))}
                </Group>
              )}
            </>
          )}

          {!sid && (
            <Text size="sm" c="dimmed">
              No active session. Configure settings above and click Connect.
            </Text>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
