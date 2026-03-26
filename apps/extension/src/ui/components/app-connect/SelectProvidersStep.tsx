import { Checkbox, Group, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import { ProviderAvatar } from "../ProviderAvatar.js";
import { PrimaryButton } from "../PrimaryButton.js";
import type { ProviderCardData } from "../ProviderCard.js";
import { tokens } from "../theme.js";

export type SelectProvidersStepProps = {
  providers: ProviderCardData[];
  selectedIds: string[];
  onToggle: (providerIds: string[]) => void;
  onNext: () => void;
};

export function SelectProvidersStep({ providers, selectedIds, onToggle, onNext }: SelectProvidersStepProps) {
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onToggle(selectedIds.filter((x) => x !== id));
    } else {
      onToggle([...selectedIds, id]);
    }
  };

  const allSelected = providers.length > 0 && providers.every((p) => selectedIds.includes(p.id));
  const toggleAll = () => {
    if (allSelected) {
      onToggle([]);
    } else {
      onToggle(providers.map((p) => p.id));
    }
  };

  return (
    <>
      <Group justify="space-between">
        <Text fw={500} fz="sm" c={tokens.color.textPrimary}>Select providers</Text>
        <UnstyledButton onClick={toggleAll}>
          <Text fz="xs" c="#2f70ff" fw={500}>{allSelected ? "Deselect all" : "Select all"}</Text>
        </UnstyledButton>
      </Group>

      <ScrollArea style={{ flex: 1, minHeight: 0 }} type="scroll" offsetScrollbars scrollbarSize={6}>
        <Stack gap={8}>
          {providers.map((provider) => (
            <UnstyledButton
              key={provider.id}
              onClick={() => toggle(provider.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: tokens.spacing.iconTextGap,
                width: "100%",
                padding: tokens.spacing.cardPadding,
                background: tokens.color.bgCard,
                border: selectedIds.includes(provider.id) ? "2px solid #2f70ff" : `1px solid ${tokens.color.border}`,
                borderRadius: tokens.radius.card,
                cursor: "pointer",
              }}
            >
              <Checkbox
                checked={selectedIds.includes(provider.id)}
                onChange={() => toggle(provider.id)}
                size="xs"
                color="#2f70ff"
                styles={{ input: { cursor: "pointer" } }}
              />
              <ProviderAvatar providerKey={provider.providerKey} size={20} />
              <Stack gap={0} style={{ overflow: "hidden", minWidth: 0, flex: 1 }}>
                <Text fw={600} fz="sm" c={tokens.color.textPrimary} truncate>{provider.name}</Text>
                <Text fw={500} fz="xs" c={tokens.color.textSecondary}>
                  {provider.modelsAvailable} {provider.modelsAvailable === 1 ? "model" : "models"}
                </Text>
              </Stack>
            </UnstyledButton>
          ))}
        </Stack>
      </ScrollArea>

      <PrimaryButton onClick={onNext} disabled={selectedIds.length === 0}>
        Continue
      </PrimaryButton>
    </>
  );
}
