import { Group, Stack, Text } from "@mantine/core";
import { IconRosetteDiscountCheck } from "@tabler/icons-react";
import { ProviderAvatar } from "../ProviderAvatar.js";
import { PrimaryButton } from "../PrimaryButton.js";
import type { ProviderEntry } from "./provider-registry.js";
import { tokens } from "../theme.js";

export type ConnectionResultStepProps = {
  provider: ProviderEntry;
  credentialName: string;
  providerName: string;
  modelCount: number;
  message: string;
  onSave: () => void;
  saving: boolean;
};

export function ConnectionResultStep({
  provider,
  credentialName,
  providerName,
  modelCount,
  message,
  onSave,
  saving,
}: ConnectionResultStepProps) {
  return (
    <>
      <Stack
        gap={tokens.spacing.sectionGap}
        style={{
          padding: tokens.spacing.cardPadding,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.card,
        }}
      >
        {/* Provider header */}
        <Group gap={tokens.spacing.iconTextGap} align="center" wrap="nowrap" style={{ paddingBottom: tokens.spacing.sectionGap, borderBottom: `1px solid ${tokens.color.border}` }}>
          <ProviderAvatar providerKey={provider.providerKey} size={tokens.size.providerIcon} />
          <Text fw={600} fz="sm" c={tokens.color.textPrimary}>
            {provider.shortLabel}
          </Text>
        </Group>

        {/* Selected credential */}
        <Text fw={500} fz="sm" c={tokens.color.textPrimary}>
          Selected credentials
        </Text>

        <Group
          gap={tokens.spacing.iconTextGap}
          style={{
            background: tokens.color.bgSurface,
            padding: tokens.spacing.cardPadding,
            borderRadius: tokens.radius.card,
          }}
        >
          <ProviderAvatar providerKey={provider.providerKey} size={16} />
          <Text fw={600} fz="sm" c={tokens.color.textPrimary}>
            {credentialName || `${provider.shortLabel} Key`}
          </Text>
        </Group>

        {/* Provider name (read-only) */}
        <Text fw={500} fz="sm" c={tokens.color.textPrimary}>Provider name</Text>
        <Group
          style={{
            background: tokens.color.bgSurface,
            padding: `8px ${tokens.spacing.cardPadding}px`,
            borderRadius: tokens.radius.card,
            border: `1px solid ${tokens.color.border}`,
            height: 32,
          }}
        >
          <Text fz="sm" c={tokens.color.textSecondary}>{providerName || provider.defaultName}</Text>
        </Group>

        {/* Model count */}
        <Text fz="sm" fw={500} c={tokens.color.textSecondary} ta="center">
          {modelCount} {modelCount === 1 ? "model" : "models"} available for this provider
        </Text>
      </Stack>

      {/* Success banner */}
      <Stack
        gap={4}
        style={{
          background: "#d1f4ce",
          padding: tokens.spacing.cardPadding,
          borderRadius: tokens.radius.card,
        }}
      >
        <Group gap={tokens.spacing.iconTextGap}>
          <IconRosetteDiscountCheck size={16} color="#236b1e" />
          <Text fw={600} fz="sm" c="#236b1e">Connection successful</Text>
        </Group>
        <Text fz="xs" c="#236b1e" style={{ paddingLeft: 26 }}>
          {message}
        </Text>
      </Stack>

      <PrimaryButton onClick={onSave} disabled={saving}>
        {saving ? "Saving..." : "Save provider"}
      </PrimaryButton>
    </>
  );
}
