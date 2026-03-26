import { Group, Loader, Stack, Text, TextInput } from "@mantine/core";
import { ProviderAvatar } from "../ProviderAvatar.js";
import { PrimaryButton } from "../PrimaryButton.js";
import type { ProviderEntry } from "./provider-registry.js";
import { tokens } from "../theme.js";

export type TestConnectionStepProps = {
  provider: ProviderEntry;
  credentialName: string;
  providerName: string;
  onProviderNameChange: (name: string) => void;
  onTest: () => void;
  testing: boolean;
  testError: string | null;
};

export function TestConnectionStep({
  provider,
  credentialName,
  providerName,
  onProviderNameChange,
  onTest,
  testing,
  testError,
}: TestConnectionStepProps) {
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

        {/* Selected credential display */}
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

        {/* Provider name */}
        <TextInput
          label="Provider name"
          size="xs"
          value={providerName}
          onChange={(e) => onProviderNameChange(e.currentTarget.value)}
          placeholder={provider.defaultName}
          styles={{
            label: { fontSize: 12, fontWeight: 500, color: tokens.color.textPrimary, marginBottom: 8 },
            input: { height: 32, fontSize: 12, borderColor: tokens.color.border, borderRadius: tokens.radius.card, background: tokens.color.bgSurface },
          }}
        />
      </Stack>

      {/* Test error */}
      {testError != null && (
        <Stack
          gap={4}
          style={{
            background: "#fff0f0",
            padding: tokens.spacing.cardPadding,
            borderRadius: tokens.radius.card,
          }}
        >
          <Text fw={600} fz="sm" c="#8e2e2e">Connection failed</Text>
          <Text fz="xs" c="#8e2e2e">{testError}</Text>
        </Stack>
      )}

      <PrimaryButton onClick={onTest} disabled={testing}>
        {testing ? "Testing..." : "Test connection"}
      </PrimaryButton>
    </>
  );
}
