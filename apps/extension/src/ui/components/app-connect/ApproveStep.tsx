import { Center, Group, Stack, Text } from "@mantine/core";
import { IconPlugConnected } from "@tabler/icons-react";
import { PrimaryButton } from "../PrimaryButton.js";
import { tokens } from "../theme.js";
import { Button } from "@mantine/core";

export type ApproveStepProps = {
  origin: string;
  displayName: string;
  iconUrl?: string | undefined;
  description?: string | undefined;
  onApprove: () => void;
  onDecline: () => void;
};

export function ApproveStep({ origin, displayName, iconUrl, description, onApprove, onDecline }: ApproveStepProps) {
  return (
    <>
      <Center style={{ flex: 1 }}>
        <Stack gap={16} align="center" maw={300}>
          {iconUrl ? (
            <img src={iconUrl} alt="" width={48} height={48} style={{ borderRadius: 10 }} />
          ) : (
            <IconPlugConnected size={48} color={tokens.color.textSecondary} stroke={1.5} />
          )}
          <Text fw={600} fz="lg" c={tokens.color.textPrimary} ta="center">
            {displayName}
          </Text>
          <Text fz="xs" c={tokens.color.textSecondary} ta="center">
            {origin}
          </Text>
          {description && (
            <Text fz="xs" c={tokens.color.textSecondary} ta="center">
              {description}
            </Text>
          )}
          <Text fz="sm" c={tokens.color.textSecondary} ta="center">
            This app wants to connect to your BYOM wallet to use AI providers and models.
          </Text>
        </Stack>
      </Center>
      <Stack gap={tokens.spacing.sectionGap}>
        <PrimaryButton onClick={onApprove}>Allow connection</PrimaryButton>
        <Button
          variant="default"
          fullWidth
          radius={tokens.radius.button}
          fz="md"
          fw={500}
          onClick={onDecline}
          styles={{
            root: {
              height: "auto",
              padding: `${tokens.spacing.buttonPaddingY}px 0`,
              background: tokens.color.bgSurface,
              borderColor: tokens.color.bgSurface,
              color: tokens.color.textPrimary,
            },
          }}
        >
          Decline
        </Button>
      </Stack>
    </>
  );
}
