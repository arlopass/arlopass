import { ModelAvatar } from "../ModelAvatar.js";
import { PrimaryButton } from "../PrimaryButton.js";
import type { WalletProvider } from "../../popup-state.js";
import { staggerDelay } from "../animation-utils.js";

type ModelItem = { id: string; name: string; providerKey: string };

function deriveProviderKey(provider: WalletProvider): string {
  const nameLower = provider.name.toLowerCase();
  const m = provider.metadata?.["methodId"] ?? "";
  const cliType = provider.metadata?.["cliType"] ?? "";
  if (cliType === "claude-code") return "claude";
  if (
    m.startsWith("anthropic.") ||
    nameLower.includes("anthropic") ||
    nameLower.includes("claude")
  )
    return "anthropic";
  if (m.startsWith("openai.") || nameLower.includes("openai")) return "openai";
  if (m.startsWith("gemini.") || nameLower.includes("gemini")) return "gemini";
  if (m.startsWith("vertex.") || nameLower.includes("vertex")) return "vertexai";
  if (m.startsWith("foundry.") || nameLower.includes("microsoft"))
    return "microsoft";
  if (m.startsWith("bedrock.")) return "bedrock";
  if (m.startsWith("perplexity.")) return "perplexity";
  if (provider.type === "local") return "ollama";
  if (provider.type === "cli") return "githubcopilot";
  return "openai";
}

function collectModels(
  providers: WalletProvider[],
  selectedProviderIds: string[],
): ModelItem[] {
  const models = new Map<string, ModelItem>();
  for (const p of providers) {
    if (!selectedProviderIds.includes(p.id)) continue;
    const pk = deriveProviderKey(p);
    for (const m of p.models) {
      if (!models.has(m.id))
        models.set(m.id, { id: m.id, name: m.name, providerKey: pk });
    }
  }
  return Array.from(models.values());
}

export type SelectModelsStepProps = {
  rawProviders: WalletProvider[];
  selectedProviderIds: string[];
  selectedModelIds: string[];
  supportedModels?: readonly string[] | undefined;
  requiredModels?: readonly string[] | undefined;
  onToggle: (modelIds: string[]) => void;
  onNext: () => void;
};

/**
 * Model selection step matching the ModelPicker preview.
 * Checkbox selection with brand highlight on selected items.
 */
export function SelectModelsStep({
  rawProviders,
  selectedProviderIds,
  selectedModelIds,
  supportedModels,
  requiredModels,
  onToggle,
  onNext,
}: SelectModelsStepProps) {
  const models = collectModels(rawProviders, selectedProviderIds);
  const requiredSet = new Set(requiredModels ?? []);
  const supportedSet = new Set(supportedModels ?? []);

  const toggle = (id: string) => {
    if (selectedModelIds.includes(id)) {
      onToggle(selectedModelIds.filter((x) => x !== id));
    } else {
      onToggle([...selectedModelIds, id]);
    }
  };

  const allSelected =
    models.length > 0 && models.every((m) => selectedModelIds.includes(m.id));
  const toggleAll = () => {
    if (allSelected) onToggle([]);
    else onToggle(models.map((m) => m.id));
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--ap-text-primary)]">
          Select models
        </span>
        <button
          type="button"
          onClick={toggleAll}
          className="text-[10px]! font-medium text-[var(--color-brand)] bg-transparent border-none cursor-pointer hover:underline"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1.5">
        {models.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-[var(--ap-text-secondary)] text-center">
              No models available from selected providers.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {models.map((model, i) => {
              const selected = selectedModelIds.includes(model.id);
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => toggle(model.id)}
                  className={`flex items-center gap-2 w-full py-2 px-2.5 rounded-md border cursor-pointer transition-all duration-250 animate-fade-in-up
                    ${
                      selected
                        ? "border-[var(--color-brand)] bg-[var(--ap-brand-subtle)]"
                        : "border-[var(--ap-border)] bg-transparent hover:border-[var(--ap-border-strong)]"
                    }`}
                  style={staggerDelay(i, 60)}
                >
                  {/* Custom checkbox */}
                  <div
                    className={`w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center shrink-0 transition-all duration-200
                    ${
                      selected
                        ? "border-[var(--color-brand)] bg-[var(--color-brand)]"
                        : "border-[var(--ap-border-strong)] bg-transparent"
                    }`}
                  >
                    {selected && (
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <ModelAvatar modelId={model.id} providerKey={model.providerKey} size={16} />
                  <span className="text-[10px] font-medium text-[var(--ap-text-primary)] truncate flex-1 min-w-0 text-left">
                    {model.name}
                  </span>
                  {requiredSet.has(model.id) && (
                    <span className="px-1.5 py-0.5 text-[8px] font-medium bg-[var(--color-danger-subtle)] text-[var(--color-danger)] border border-[var(--color-danger)]/20 rounded-sm shrink-0">
                      Required
                    </span>
                  )}
                  {!requiredSet.has(model.id) && supportedSet.has(model.id) && (
                    <span className="px-1.5 py-0.5 text-[8px] font-medium bg-[var(--ap-brand-subtle)] text-[var(--color-brand)] border border-[var(--color-brand)]/20 rounded-sm shrink-0">
                      Supported
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <PrimaryButton onClick={onNext} disabled={selectedModelIds.length === 0}>
        Continue
      </PrimaryButton>
    </>
  );
}
