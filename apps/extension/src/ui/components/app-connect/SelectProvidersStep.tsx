import { ProviderAvatar } from "../ProviderAvatar.js";
import { PrimaryButton } from "../PrimaryButton.js";
import type { ProviderCardData } from "../ProviderCard.js";
import { staggerDelay } from "../animation-utils.js";

export type SelectProvidersStepProps = {
  providers: ProviderCardData[];
  selectedIds: string[];
  onToggle: (providerIds: string[]) => void;
  onNext: () => void;
};

/**
 * Provider selection step matching the landing preview checkbox pattern.
 * Selected items get brand border + subtle background.
 */
export function SelectProvidersStep({
  providers,
  selectedIds,
  onToggle,
  onNext,
}: SelectProvidersStepProps) {
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onToggle(selectedIds.filter((x) => x !== id));
    } else {
      onToggle([...selectedIds, id]);
    }
  };

  const allSelected =
    providers.length > 0 && providers.every((p) => selectedIds.includes(p.id));
  const toggleAll = () => {
    if (allSelected) onToggle([]);
    else onToggle(providers.map((p) => p.id));
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--ap-text-primary)]">
          Select providers
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
        <div className="flex flex-col gap-2">
          {providers.map((provider, i) => {
            const selected = selectedIds.includes(provider.id);
            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => toggle(provider.id)}
                className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-md border cursor-pointer transition-all duration-250 animate-fade-in-up
                  ${
                    selected
                      ? "border-[var(--color-brand)] bg-[var(--ap-brand-subtle)]"
                      : "border-[var(--ap-border)] bg-[var(--ap-bg-surface)] hover:border-[var(--ap-border-strong)]"
                  }`}
                style={staggerDelay(i, 60)}
              >
                {/* Custom checkbox */}
                <div
                  className={`w-4 h-4 rounded-sm border-2 flex items-center justify-center shrink-0 transition-all duration-200
                  ${
                    selected
                      ? "border-[var(--color-brand)] bg-[var(--color-brand)]"
                      : "border-[var(--ap-border-strong)] bg-transparent"
                  }`}
                >
                  {selected && (
                    <svg
                      width="10"
                      height="10"
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
                <ProviderAvatar providerKey={provider.providerKey} size={20} />
                <div className="flex flex-col gap-0 overflow-hidden min-w-0 flex-1 text-left">
                  <span className="text-xs font-semibold text-[var(--ap-text-primary)] truncate">
                    {provider.name}
                  </span>
                  <span className="text-[10px] font-medium text-[var(--ap-text-secondary)]">
                    {provider.modelsAvailable}{" "}
                    {provider.modelsAvailable === 1 ? "model" : "models"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <PrimaryButton onClick={onNext} disabled={selectedIds.length === 0}>
        Continue
      </PrimaryButton>
    </>
  );
}
