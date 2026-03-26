import { Stack, Text, Group, ThemeIcon, Box } from "@mantine/core";
import { type ReactNode } from "react";

type Step = {
  title: string;
  content: ReactNode;
};

type StepListProps = {
  steps: Step[];
};

export function StepList({ steps }: StepListProps) {
  return (
    <Stack gap="lg">
      {steps.map((step, i) => (
        <Group key={i} align="flex-start" gap="md" wrap="nowrap">
          <ThemeIcon size="lg" radius="xl" variant="light" color="blue" style={{ flexShrink: 0 }}>
            <Text fw={700} fz="sm">{i + 1}</Text>
          </ThemeIcon>
          <Box style={{ flex: 1 }}>
            <Text fw={600} mb={4}>{step.title}</Text>
            {step.content}
          </Box>
        </Group>
      ))}
    </Stack>
  );
}
