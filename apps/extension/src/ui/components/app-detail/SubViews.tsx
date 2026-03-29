import { ProviderAvatar } from "../ProviderAvatar.js";
import { ModelAvatar } from "../ModelAvatar.js";
import { PrimaryButton } from "../PrimaryButton.js";
import type { WalletProvider } from "../../popup-state.js";
import { deriveProviderKey } from "./utils.js";
import { staggerDelay } from "../animation-utils.js";

export type EnableProviderSubViewProps = {
  availableProviders: WalletProvider[];
  onPickProvider: (providerId: string, modelIds: string[]) => void;
};

export function EnableProviderSubView({
  availableProviders,
  onPickProvider,
}: EnableProviderSubViewProps) {
  return (
    <>
      <span className="text-xs font-medium text-[var(--ap-text-primary)]">
        Select a provider to enable
      </span>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1.5">
        <div className="flex flex-col gap-2">
          {availableProviders.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <span className="text-xs text-[var(--ap-text-secondary)] text-center">
                All providers are already enabled.
              </span>
            </div>
          )}
          {availableProviders.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() =>
                onPickProvider(
                  p.id,
                  p.models.map((m) => m.id),
                )
              }
              className="flex items-center gap-2.5 w-full px-3 py-2.5 bg-[var(--ap-bg-surface)] border border-[var(--ap-border)] rounded-md cursor-pointer text-left transition-all duration-250 hover:border-[var(--ap-border-strong)] animate-fade-in-up"
              style={staggerDelay(i, 60)}
            >
              <ProviderAvatar providerKey={deriveProviderKey(p)} size={24} />
              <div className="flex flex-col gap-0 overflow-hidden min-w-0">
                <span className="text-xs font-semibold text-[var(--ap-text-primary)] truncate">
                  {p.name}
                </span>
                <span className="text-[10px] font-medium text-[var(--ap-text-secondary)]">
                  {p.models.length} {p.models.length === 1 ? "model" : "models"}{" "}
                  available
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export type PickProviderModelsSubViewProps = {
  provider: WalletProvider;
  providerKey: string;
  selectedModelIds: string[];
  onToggleModel: (modelId: string) => void;
  onToggleAll: () => void;
  onConfirm: () => void;
};

export function PickProviderModelsSubView({
  provider,
  providerKey,
  selectedModelIds,
  onToggleModel,
  onToggleAll,
  onConfirm,
}: PickProviderModelsSubViewProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--ap-text-primary)]">
          Select models to enable
        </span>
        <button
          type="button"
          onClick={onToggleAll}
          className="text-[10px] font-medium text-[var(--color-brand)] bg-transparent border-none cursor-pointer hover:underline"
        >
          {selectedModelIds.length === provider.models.length
            ? "Deselect all"
            : "Select all"}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1.5">
        <div className="flex flex-col gap-1.5">
          {provider.models.map((m, i) => {
            const selected = selectedModelIds.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onToggleModel(m.id)}
                className={`flex items-center gap-2 w-full py-2 px-2.5 rounded-md border cursor-pointer transition-all duration-250 animate-fade-in-up text-left
                  ${
                    selected
                      ? "border-[var(--color-brand)] bg-[var(--ap-brand-subtle)]"
                      : "border-[var(--ap-border)] bg-transparent hover:border-[var(--ap-border-strong)]"
                  }`}
                style={staggerDelay(i, 60)}
              >
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
                <ProviderAvatar providerKey={providerKey} size={16} />
                <span className="text-[10px] font-medium text-[var(--ap-text-primary)] truncate flex-1 min-w-0">
                  {m.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <PrimaryButton
        onClick={onConfirm}
        disabled={selectedModelIds.length === 0}
      >
        Enable provider
      </PrimaryButton>
    </>
  );
}

export type EnableModelSubViewProps = {
  availableModels: { id: string; name: string; providerKey: string }[];
  selectedModelIds: string[];
  onToggleModel: (modelId: string) => void;
  onToggleAll: () => void;
  onConfirm: () => void;
};

export function EnableModelSubView({
  availableModels,
  selectedModelIds,
  onToggleModel,
  onToggleAll,
  onConfirm,
}: EnableModelSubViewProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--ap-text-primary)]">
          Select models to enable
        </span>
        <button
          type="button"
          onClick={onToggleAll}
          className="text-[10px] font-medium text-[var(--color-brand)] bg-transparent border-none cursor-pointer hover:underline"
        >
          {selectedModelIds.length === availableModels.length
            ? "Deselect all"
            : "Select all"}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1.5">
        <div className="flex flex-col gap-1.5">
          {availableModels.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <span className="text-xs text-[var(--ap-text-secondary)] text-center">
                All models from enabled providers are already enabled.
              </span>
            </div>
          )}
          {availableModels.map((m, i) => {
            const selected = selectedModelIds.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onToggleModel(m.id)}
                className={`flex items-center gap-2 w-full py-2 px-2.5 rounded-md border cursor-pointer transition-all duration-250 animate-fade-in-up text-left
                  ${
                    selected
                      ? "border-[var(--color-brand)] bg-[var(--ap-brand-subtle)]"
                      : "border-[var(--ap-border)] bg-transparent hover:border-[var(--ap-border-strong)]"
                  }`}
                style={staggerDelay(i, 60)}
              >
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
                <ModelAvatar modelId={m.id} providerKey={m.providerKey} size={16} />
                <span className="text-[10px] font-medium text-[var(--ap-text-primary)] truncate flex-1 min-w-0">
                  {m.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <PrimaryButton
        onClick={onConfirm}
        disabled={selectedModelIds.length === 0}
      >
        {selectedModelIds.length > 0
          ? `Enable ${String(selectedModelIds.length)} model${selectedModelIds.length !== 1 ? "s" : ""}`
          : "Enable models"}
      </PrimaryButton>
    </>
  );
}
