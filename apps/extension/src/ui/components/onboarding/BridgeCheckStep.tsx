import { useEffect, useRef, useState } from "react";
import { Stack, Text, Button, Box, Group, Loader } from "@mantine/core";
import { IconCircleCheck } from "@tabler/icons-react";
import { tokens } from "../theme.js";
import { detectBridge } from "./setup-state.js";

type BridgeCheckStepProps = {
  onBridgeFound: () => void;
  onInstallNeeded: () => void;
  onBack: () => void;
};

type DetectionState =
  | { status: "detecting" }
  | { status: "found"; version?: string }
  | { status: "not-found" };

export function BridgeCheckStep({
  onBridgeFound,
  onInstallNeeded,
  onBack,
}: BridgeCheckStepProps) {
  const [state, setState] = useState<DetectionState>({ status: "detecting" });
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runDetection = () => {
    setState({ status: "detecting" });
    void detectBridge().then((result) => {
      if (result.connected) {
        setState(result.version != null
          ? { status: "found", version: result.version }
          : { status: "found" });
      } else {
        setState({ status: "not-found" });
      }
    });
  };

  // Run detection on mount
  useEffect(() => {
    runDetection();
  }, []);

  // Auto-advance when bridge is found
  useEffect(() => {
    if (state.status === "found") {
      autoAdvanceRef.current = setTimeout(onBridgeFound, 1500);
    }
    return () => {
      if (autoAdvanceRef.current !== null) {
        clearTimeout(autoAdvanceRef.current);
        autoAdvanceRef.current = null;
      }
    };
  }, [state.status, onBridgeFound]);

  return (
    <Stack gap={12} p={12}>
      <Text size="xs" fw={500} c={tokens.color.textSecondary}>
        Step 1 of 3
      </Text>

      {state.status === "detecting" && (
        <Stack gap={12}>
          <Text size="md" fw={600} c={tokens.color.textPrimary}>
            Checking your setup…
          </Text>
          <Group justify="center">
            <Loader size="sm" color={tokens.color.textPrimary} />
          </Group>
          <Text size="sm" c={tokens.color.textSecondary}>
            Looking for the BYOM Bridge on your computer.
          </Text>
        </Stack>
      )}

      {state.status === "found" && (
        <Stack gap={12}>
          <Group gap={8} align="center">
            <IconCircleCheck size={24} color="#2b8a3e" stroke={1.5} />
            <Text size="md" fw={600} c={tokens.color.textPrimary}>
              Bridge connected
            </Text>
          </Group>

          <Box
            p={12}
            style={{
              background: "#f8f9fa",
              border: `1px solid ${tokens.color.border}`,
              borderRadius: 4,
            }}
          >
            <Text size="sm" c={tokens.color.textPrimary}>
              ✓ BYOM Bridge v{state.version ?? "unknown"} — Running on your
              computer
            </Text>
          </Box>

          <Text size="sm" c={tokens.color.textPrimary}>
            Everything looks good. Let{"'"}s connect your first AI provider.
          </Text>

          <Button
            fullWidth
            color={tokens.color.btnPrimaryBg}
            c={tokens.color.btnPrimaryText}
            size="md"
            fw={500}
            radius={4}
            onClick={onBridgeFound}
          >
            {"Continue →"}
          </Button>
        </Stack>
      )}

      {state.status === "not-found" && (
        <Stack gap={12}>
          <Text size="md" fw={600} c={tokens.color.textPrimary}>
            Bridge not found
          </Text>

          <Text size="sm" c={tokens.color.textSecondary}>
            The BYOM Bridge is a small helper app that runs on your computer. It
            connects the extension to your AI providers securely.
          </Text>

          <Button
            fullWidth
            color={tokens.color.btnPrimaryBg}
            c={tokens.color.btnPrimaryText}
            size="md"
            fw={500}
            radius={4}
            onClick={onInstallNeeded}
          >
            {"Install the Bridge →"}
          </Button>

          <Button
            fullWidth
            variant="outline"
            color={tokens.color.textPrimary}
            size="md"
            fw={500}
            radius={4}
            onClick={runDetection}
          >
            {"I already installed it — Check again ↻"}
          </Button>
        </Stack>
      )}

      <Text
        size="xs"
        c={tokens.color.textSecondary}
        ta="left"
        style={{ cursor: "pointer" }}
        onClick={onBack}
      >
        ← Back
      </Text>
    </Stack>
  );
}
