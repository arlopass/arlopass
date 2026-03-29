import { useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { ModelAvatar } from "./ModelAvatar.js";
import { MetadataDivider } from "./MetadataDivider.js";
import { PrimaryButton } from "./PrimaryButton.js";
import { useTokenUsage } from "../hooks/useTokenUsage.js";
import type { WalletProvider } from "../popup-state.js";
import { staggerDelay } from "./animation-utils.js";

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
  if (methodId.startsWith("vertex.") || nameLower.includes("vertex"))
    return "vertexai";
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
      <div className="flex-1 min-h-0 overflow-y-auto pr-1.5">
        {models.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-[var(--ap-text-secondary)] text-center">
              No models available. Connect a provider to see models.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {models.map((model, i) => (
              <ModelCard
                key={model.id}
                model={model}
                tokenUsage={modelUsageMap[model.id] ?? 0}
                index={i}
              />
            ))}
          </div>
        )}
      </div>
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
  index = 0,
}: {
  model: ModelEntry;
  tokenUsage: number;
  index?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="w-full bg-[var(--ap-bg-surface)] border border-[var(--ap-border)] rounded-md overflow-hidden transition-all duration-250 hover:border-[var(--ap-border-strong)] animate-fade-in-up"
      style={staggerDelay(index, 60)}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center justify-between w-full px-3 py-2.5 bg-transparent border-none cursor-pointer text-left gap-3"
      >
        <div className="flex items-center gap-2.5 overflow-hidden flex-1 min-w-0">
          <ModelAvatar
            modelId={model.id}
            providerKey={model.providerKey}
            size={24}
          />
          <div className="flex flex-col gap-0 overflow-hidden min-w-0">
            <span className="text-xs font-semibold text-[var(--ap-text-primary)] truncate">
              {model.name}
            </span>
            <div className="flex items-center gap-2 overflow-hidden truncate">
              <span className="text-[10px] font-medium text-[var(--ap-text-secondary)] whitespace-nowrap">
                {model.providerCount}{" "}
                {model.providerCount === 1 ? "provider" : "providers"} available
              </span>
              {tokenUsage > 0 && (
                <>
                  <MetadataDivider />
                  <span className="text-[10px] font-medium text-[var(--ap-text-secondary)] whitespace-nowrap">
                    {formatTokenCount(tokenUsage)} tokens
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <IconChevronDown
          size={16}
          className={`text-[var(--ap-text-secondary)] shrink-0 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
          aria-hidden
        />
      </button>

      <div
        className={`grid transition-all duration-300 ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.25, 1, 0.5, 1)" }}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3">
            <div className="h-px bg-[var(--ap-border)] mb-3" />
            <div className="flex flex-col gap-2">
              <div className="flex justify-between">
                <span className="text-[10px] text-[var(--ap-text-secondary)]">
                  Model ID
                </span>
                <span className="text-[10px] font-medium text-[var(--ap-text-primary)] truncate max-w-[180px]">
                  {model.id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-[var(--ap-text-secondary)]">
                  Providers
                </span>
                <span className="text-[10px] font-medium text-[var(--ap-text-primary)]">
                  {model.providerCount} available
                </span>
              </div>
              {tokenUsage > 0 && (
                <div className="flex justify-between">
                  <span className="text-[10px] text-[var(--ap-text-secondary)]">
                    Token usage
                  </span>
                  <span className="text-[10px] font-medium text-[var(--ap-text-primary)]">
                    {formatTokenCount(tokenUsage)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
