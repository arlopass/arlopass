import { Stack, Text, Button, Box, Group } from "@mantine/core";
import {
  IconShieldCheck,
  IconLock,
  IconHandStop,
  IconPlug,
  type Icon,
} from "@tabler/icons-react";
import { tokens } from "../theme.js";

type WelcomeStepProps = {
  onNext: () => void;
};

type ValuePropCard = {
  icon: Icon;
  heading: string;
  description: string;
};

const VALUE_PROPS: ValuePropCard[] = [
  {
    icon: IconLock,
    heading: "Your keys stay safe",
    description: "Credentials never leave your device.",
  },
  {
    icon: IconHandStop,
    heading: "You're in control",
    description: "Choose which apps can use your AI.",
  },
  {
    icon: IconPlug,
    heading: "Works everywhere",
    description: "Ollama, Claude, OpenAI and more.",
  },
];

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <Stack gap={12} p={12}>
      <Stack gap={4} align="center">
        <IconShieldCheck
          size={48}
          color={tokens.color.textPrimary}
          stroke={1.5}
        />
        <Text size="lg" fw={600} c={tokens.color.textPrimary} ta="center">
          Welcome to BYOM
        </Text>
        <Text size="sm" c={tokens.color.textSecondary} ta="center">
          Your AI Wallet
        </Text>
      </Stack>

      <Text size="sm" c={tokens.color.textPrimary}>
        BYOM lets you use AI on any website — with your own providers, your own
        models, and your own rules.
      </Text>

      <Stack gap={8}>
        {VALUE_PROPS.map((prop) => (
          <Box
            key={prop.heading}
            p={12}
            style={{
              background: "#f8f9fa",
              border: `1px solid ${tokens.color.border}`,
              borderRadius: 4,
            }}
          >
            <Group gap={8} align="flex-start" wrap="nowrap">
              <prop.icon
                size={16}
                color={tokens.color.textPrimary}
                stroke={1.5}
                style={{ flexShrink: 0, marginTop: 2 }}
              />
              <Stack gap={2}>
                <Text size="sm" fw={600} c={tokens.color.textPrimary}>
                  {prop.heading}
                </Text>
                <Text size="sm" c={tokens.color.textSecondary}>
                  {prop.description}
                </Text>
              </Stack>
            </Group>
          </Box>
        ))}
      </Stack>

      <Button
        fullWidth
        color={tokens.color.btnPrimaryBg}
        c={tokens.color.btnPrimaryText}
        size="md"
        fw={500}
        radius={4}
        onClick={onNext}
      >
        {"Let's get started →"}
      </Button>

      <Text size="xs" c={tokens.color.textSecondary} ta="center">
        Setup takes about 3 minutes
      </Text>
    </Stack>
  );
}
