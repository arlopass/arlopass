import { useState } from "react";
import { Stack, Text, Button, Box, Group } from "@mantine/core";
import { IconShieldCheck, IconLock, IconWallet } from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import { tokens } from "../theme.js";

type TourCardsProps = {
  onComplete: () => void;
};

type TipCard = {
  icon: Icon;
  heading: string;
  copy: string;
};

const TIPS: TipCard[] = [
  {
    icon: IconShieldCheck,
    heading: "Websites ask, you decide",
    copy: "When a website wants to use your AI, you'll see a prompt asking for your permission. You can approve, deny, or choose which models to share.",
  },
  {
    icon: IconLock,
    heading: "Your keys never leave your device",
    copy: "API keys and passwords are stored locally in your browser's secure vault. Websites never see them — the Bridge handles all the communication.",
  },
  {
    icon: IconWallet,
    heading: "Your AI wallet",
    copy: "Click the BYOM icon anytime to see your providers, connected apps, and usage. You can add more providers, revoke access, or change settings whenever you want.",
  },
];

function DotIndicator({ total, active }: { total: number; active: number }) {
  return (
    <Group gap={6} justify="center">
      {Array.from({ length: total }, (_, i) => (
        <Box
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background:
              i === active ? tokens.color.textPrimary : tokens.color.border,
            transition: "background 200ms ease",
          }}
        />
      ))}
    </Group>
  );
}

export function TourCards({ onComplete }: TourCardsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const isLast = currentIndex === TIPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      onComplete();
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <Stack gap={12}>
      <Group justify="flex-end">
        <Text
          size="xs"
          c={tokens.color.textSecondary}
          style={{ cursor: "pointer" }}
          onClick={handleSkip}
        >
          Skip tour
        </Text>
      </Group>

      <Box style={{ overflow: "hidden", borderRadius: 4 }}>
        <Box
          style={{
            display: "flex",
            transform: `translateX(-${currentIndex * 100}%)`,
            transition: "transform 250ms ease",
          }}
        >
          {TIPS.map((tip) => (
            <Box key={tip.heading} style={{ minWidth: "100%", flexShrink: 0 }}>
              <Stack gap={8} align="center" p={12}>
                <tip.icon
                  size={48}
                  color={tokens.color.textPrimary}
                  stroke={1.5}
                />
                <Text
                  size="sm"
                  fw={600}
                  c={tokens.color.textPrimary}
                  ta="center"
                >
                  {tip.heading}
                </Text>
                <Text size="sm" c={tokens.color.textSecondary} ta="center">
                  {tip.copy}
                </Text>
              </Stack>
            </Box>
          ))}
        </Box>
      </Box>

      <DotIndicator total={TIPS.length} active={currentIndex} />

      <Button
        fullWidth
        color={tokens.color.btnPrimaryBg}
        c={tokens.color.btnPrimaryText}
        size="md"
        fw={500}
        radius={4}
        onClick={handleNext}
      >
        {isLast ? "Done ✓" : "Next →"}
      </Button>
    </Stack>
  );
}
