import { useState } from "react";
import {
  Box,
  Collapse,
  Divider,
  Group,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { ProviderAvatar } from "./ProviderAvatar.js";
import { MetadataDivider } from "./MetadataDivider.js";
import { PrimaryButton } from "./PrimaryButton.js";
import { useTokenUsage } from "../hooks/useTokenUsage.js";
import type { WalletProvider } from "../popup-state.js";
import { tokens } from "./theme.js";

type ModelEntry = {
  id: string;
  name: string;
  providerCount: number;
  providerKey: string;
};

function deriveProviderKey(provider: WalletProvider): string {
  const nameLower = provider.name.toLowerCase();
  const methodId = provider.metadata?.["methodId"] ?? "";
  const cliType = provider.metadata?.["cliType"] ?? "";
  if (cliType === "claude-code") return "claude";
  if (
    methodId.startsWith("anthropic.") ||
    nameLower.includes("anthropic") ||
    nameLower.includes("claude")
  )
    return "anthropic";
  if (
    methodId.startsWith("openai.") ||
    nameLower.includes("openai") ||
    nameLower.includes("chatgpt")
  )
    return "openai";
  if (methodId.startsWith("gemini.") || nameLower.includes("gemini"))
    return "gemini";
  if (methodId.startsWith("bedrock.") || nameLower.includes("bedrock"))
    return "bedrock";
  if (methodId.startsWith("perplexity.") || nameLower.includes("perplexity"))
    return "perplexity";
  if (
    methodId.startsWith("foundry.") ||
    nameLower.includes("foundry") ||
    nameLower.includes("microsoft")
  )
    return "microsoft";
  if (provider.type === "local" || nameLower.includes("ollama"))
    return "ollama";
  if (provider.type === "cli" || nameLower.includes("copilot"))
    return "githubcopilot";
  return "openai";
}

function aggregateModels(providers: WalletProvider[]): ModelEntry[] {
  const modelMap = new Map<
    string,
    { name: string; providerKeys: Set<string>; providerCount: number }
  >();
  for (const provider of providers) {
    const pk = deriveProviderKey(provider);
    for (const model of provider.models) {
      const existing = modelMap.get(model.id);
      if (existing != null) {
        existing.providerCount++;
        existing.providerKeys.add(pk);
      } else {
        modelMap.set(model.id, {
          name: model.name,
          providerKeys: new Set([pk]),
          providerCount: 1,
        });
      }
    }
  }
  return Array.from(modelMap.entries()).map(([id, data]) => ({
    id,
    name: data.name,
    providerCount: data.providerCount,
    providerKey: data.providerKeys.values().next().value ?? "openai",
  }));
}

export type ModelsTabContentProps = {
  providers: WalletProvider[];
};

export function ModelsTabContent({ providers }: ModelsTabContentProps) {
  const models = aggregateModels(providers);

  const { summaries: usageSummaries } = useTokenUsage();
  const modelUsageMap: Record<string, number> = {};
  for (const s of usageSummaries) {
    for (const p of s.byProvider) {
      modelUsageMap[p.modelId] =
        (modelUsageMap[p.modelId] ?? 0) + p.inputTokens + p.outputTokens;
    }
  }

  return (
    <>
      <ScrollArea
        style={{ flex: 1, minHeight: 0 }}
        type="scroll"
        offsetScrollbars
        scrollbarSize={6}
      >
        {models.length === 0 ? (
          <Text fz="sm" c={tokens.color.textSecondary} ta="center" py="xl">
            No models available. Connect a provider to see models.
          </Text>
        ) : (
          <Stack gap={tokens.spacing.sectionGap}>
            {models.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                tokenUsage={modelUsageMap[model.id] ?? 0}
              />
            ))}
          </Stack>
        )}
      </ScrollArea>
      <PrimaryButton>Manage models</PrimaryButton>
    </>
  );
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function ModelCard({
  model,
  tokenUsage,
}: {
  model: ModelEntry;
  tokenUsage: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Box
      style={{
        width: "100%",
        background: tokens.color.bgSurface,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.card,
        overflow: "hidden",
      }}
    >
      <UnstyledButton
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: tokens.spacing.cardPadding,
          cursor: "pointer",
        }}
      >
        <Group
          gap={tokens.spacing.iconTextGap}
          align="center"
          wrap="nowrap"
          style={{ overflow: "hidden", flex: 1, minWidth: 0 }}
        >
          <ProviderAvatar
            providerKey={model.providerKey}
            size={tokens.size.providerIcon}
          />
          <Stack gap={0} style={{ overflow: "hidden", minWidth: 0 }}>
            <Text fw={600} fz="sm" c={tokens.color.textPrimary} truncate>
              {model.name}
            </Text>
            <Group
              gap={tokens.spacing.metadataGap}
              wrap="nowrap"
              style={{ overflow: "hidden" }}
            >
              <Text
                fw={500}
                fz="xs"
                c={tokens.color.textSecondary}
                lh="normal"
                style={{ whiteSpace: "nowrap" }}
              >
                {model.providerCount}{" "}
                {model.providerCount === 1 ? "provider" : "providers"} available
              </Text>
              {tokenUsage > 0 && (
                <>
                  <MetadataDivider />
                  <Text
                    fw={500}
                    fz="xs"
                    c={tokens.color.textSecondary}
                    lh="normal"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {formatTokenCount(tokenUsage)} tokens
                  </Text>
                </>
              )}
            </Group>
          </Stack>
        </Group>
        <IconChevronDown
          size={20}
          color={tokens.color.textSecondary}
          style={{
            transform: expanded ? undefined : "rotate(-90deg)",
            transition: "transform 150ms ease",
            flexShrink: 0,
          }}
          aria-hidden
        />
      </UnstyledButton>
      <Collapse in={expanded}>
        <Box
          style={{
            padding: `0 ${tokens.spacing.cardPadding}px ${tokens.spacing.cardPadding}px`,
          }}
        >
          <Divider mb={tokens.spacing.sectionGap} color={tokens.color.border} />
          <Stack gap={8}>
            <Group justify="space-between">
              <Text fz="xs" c={tokens.color.textSecondary}>
                Model ID
              </Text>
              <Text
                fz="xs"
                fw={500}
                c={tokens.color.textPrimary}
                truncate
                maw={180}
              >
                {model.id}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text fz="xs" c={tokens.color.textSecondary}>
                Providers
              </Text>
              <Text fz="xs" fw={500} c={tokens.color.textPrimary}>
                {model.providerCount} available
              </Text>
            </Group>
            {tokenUsage > 0 && (
              <Group justify="space-between">
                <Text fz="xs" c={tokens.color.textSecondary}>
                  Token usage
                </Text>
                <Text fz="xs" fw={500} c={tokens.color.textPrimary}>
                  {formatTokenCount(tokenUsage)}
                </Text>
              </Group>
            )}
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}

