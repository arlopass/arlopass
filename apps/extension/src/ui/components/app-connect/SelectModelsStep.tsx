import { Checkbox, Group, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import { ProviderAvatar } from "../ProviderAvatar.js";
import { PrimaryButton } from "../PrimaryButton.js";
import type { WalletProvider } from "../../popup-state.js";
import { tokens } from "../theme.js";

type ModelItem = { id: string; name: string; providerKey: string };

function deriveProviderKey(provider: WalletProvider): string {
  const nameLower = provider.name.toLowerCase();
  const m = provider.metadata?.["methodId"] ?? "";
  if (m.startsWith("anthropic.") || nameLower.includes("anthropic") || nameLower.includes("claude")) return "anthropic";
  if (m.startsWith("openai.") || nameLower.includes("openai")) return "openai";
  if (m.startsWith("gemini.") || nameLower.includes("gemini")) return "gemini";
  if (m.startsWith("foundry.") || nameLower.includes("microsoft")) return "microsoft";
  if (m.startsWith("bedrock.")) return "bedrock";
  if (m.startsWith("perplexity.")) return "perplexity";
  if (provider.type === "local") return "ollama";
  if (provider.type === "cli") return "githubcopilot";
  return "openai";
}

function collectModels(providers: WalletProvider[], selectedProviderIds: string[]): ModelItem[] {
  const models = new Map<string, ModelItem>();
  for (const p of providers) {
    if (!selectedProviderIds.includes(p.id)) continue;
    const pk = deriveProviderKey(p);
    for (const m of p.models) {
      if (!models.has(m.id)) models.set(m.id, { id: m.id, name: m.name, providerKey: pk });
    }
  }
  return Array.from(models.values());
}

export type SelectModelsStepProps = {
  rawProviders: WalletProvider[];
  selectedProviderIds: string[];
  selectedModelIds: string[];
  onToggle: (modelIds: string[]) => void;
  onNext: () => void;
};

export function SelectModelsStep({ rawProviders, selectedProviderIds, selectedModelIds, onToggle, onNext }: SelectModelsStepProps) {
  const models = collectModels(rawProviders, selectedProviderIds);

  const toggle = (id: string) => {
    if (selectedModelIds.includes(id)) {
      onToggle(selectedModelIds.filter((x) => x !== id));
    } else {
      onToggle([...selectedModelIds, id]);
    }
  };

  const allSelected = models.length > 0 && models.every((m) => selectedModelIds.includes(m.id));
  const toggleAll = () => {
    if (allSelected) onToggle([]);
    else onToggle(models.map((m) => m.id));
  };

  return (
    <>
      <Group justify="space-between">
        <Text fw={500} fz="sm" c={tokens.color.textPrimary}>Select models</Text>
        <UnstyledButton onClick={toggleAll}>
          <Text fz="xs" c="#2f70ff" fw={500}>{allSelected ? "Deselect all" : "Select all"}</Text>
        </UnstyledButton>
      </Group>

      <ScrollArea style={{ flex: 1, minHeight: 0 }} type="scroll" offsetScrollbars scrollbarSize={6}>
        {models.length === 0 ? (
          <Text fz="sm" c={tokens.color.textSecondary} ta="center" py="xl">No models available from selected providers.</Text>
        ) : (
          <Stack gap={8}>
            {models.map((model) => (
              <UnstyledButton
                key={model.id}
                onClick={() => toggle(model.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: tokens.spacing.iconTextGap,
                  width: "100%",
                  padding: tokens.spacing.cardPadding,
                  background: tokens.color.bgCard,
                  border: selectedModelIds.includes(model.id) ? "2px solid #2f70ff" : `1px solid ${tokens.color.border}`,
                  borderRadius: tokens.radius.card,
                  cursor: "pointer",
                }}
              >
                <Checkbox checked={selectedModelIds.includes(model.id)} onChange={() => toggle(model.id)} size="xs" color="#2f70ff" styles={{ input: { cursor: "pointer" } }} />
                <ProviderAvatar providerKey={model.providerKey} size={20} />
                <Text fw={600} fz="sm" c={tokens.color.textPrimary} truncate style={{ flex: 1, minWidth: 0 }}>
                  {model.name}
                </Text>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </ScrollArea>

      <PrimaryButton onClick={onNext} disabled={selectedModelIds.length === 0}>
        Continue
      </PrimaryButton>
    </>
  );
}
