import { useState } from "react";
import { Stack, Text, Button } from "@mantine/core";
import { IconConfetti } from "@tabler/icons-react";
import { tokens } from "../theme.js";
import { TourCards } from "./TourCards.js";

type SuccessStepProps = {
  onComplete: () => void;
};

type Phase = "celebrate" | "tour";

export function SuccessStep({ onComplete }: SuccessStepProps) {
  const [phase, setPhase] = useState<Phase>("celebrate");

  if (phase === "tour") {
    return (
      <Stack gap={12} p={12}>
        <Text size="xs" fw={500} c={tokens.color.textSecondary}>
          Step 3 of 3
        </Text>
        <TourCards onComplete={onComplete} />
      </Stack>
    );
  }

  return (
    <Stack gap={12} p={12} align="center">
      <Text size="xs" fw={500} c={tokens.color.textSecondary} w="100%">
        Step 3 of 3
      </Text>

      <IconConfetti size={48} color={tokens.color.textPrimary} stroke={1.5} />

      <Text size="lg" fw={600} c={tokens.color.textPrimary} ta="center">
        You{"'"}re all set!
      </Text>

      <Text size="sm" c={tokens.color.textSecondary} ta="center">
        Arlopass is ready to use. Here are a few things to know before you
        start.
      </Text>

      <Button
        fullWidth
        color={tokens.color.btnPrimaryBg}
        c={tokens.color.btnPrimaryText}
        size="md"
        fw={500}
        radius={4}
        onClick={() => setPhase("tour")}
      >
        {"Next →"}
      </Button>
    </Stack>
  );
}
