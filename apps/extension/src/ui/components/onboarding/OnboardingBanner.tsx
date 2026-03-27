import { Group, Text, Box } from "@mantine/core";
import { tokens } from "../theme.js";

type OnboardingBannerProps = {
  step: number;
  totalSteps: number;
  label: string;
  bridgeConnected?: boolean;
};

export function OnboardingBanner({
  step,
  totalSteps,
  label,
  bridgeConnected,
}: OnboardingBannerProps) {
  return (
    <Box
      px={16}
      py={12}
      style={{
        background: "#f8f9fa",
        borderBottom: `1px solid ${tokens.color.border}`,
      }}
    >
      <Group gap={6}>
        {bridgeConnected && (
          <Text size="sm" fw={500} c="#2b8a3e">
            ✓ Bridge connected ·
          </Text>
        )}
        <Text size="sm" fw={500} c={tokens.color.textPrimary}>
          Step {step} of {totalSteps}: {label}
        </Text>
      </Group>
    </Box>
  );
}
