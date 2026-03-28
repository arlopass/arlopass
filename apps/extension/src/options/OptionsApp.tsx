import { useCallback, useState } from "react";
import { AddProviderWizard } from "../ui/components/onboarding/AddProviderWizard.js";
import { ProvidersList } from "./components/ProvidersList.js";
import { BridgePairing } from "./components/BridgePairing.js";
import {
  useProviderStorage,
  type StoredProvider,
} from "./hooks/useProviderStorage.js";
import { useNativeMessage } from "./hooks/useNativeMessage.js";

export function OptionsApp() {
  const {
    providers,
    activeProvider,
    loading,
    removeProvider,
    activateProvider,
    setActiveModel,
    refresh,
  } = useProviderStorage();

  const { sendNativeMessage } = useNativeMessage();

  const [wizardKey, setWizardKey] = useState(0);

  const handleProviderSaved = useCallback(() => {
    refresh();
    // Reset wizard to fresh state by remounting
    setWizardKey((k) => k + 1);
  }, [refresh]);

  const handleEdit = useCallback((_provider: StoredProvider) => {
    // Scroll to top of form
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleRemove = useCallback(
    async (providerId: string) => {
      await removeProvider(providerId);
    },
    [removeProvider],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--ap-bg-base)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <div className="w-6 h-6 border-2 border-[var(--color-brand)]/30 border-t-[var(--color-brand)] rounded-full animate-spin-slow" />
          <span className="text-xs text-[var(--ap-text-secondary)]">
            Loading providers…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--ap-bg-base)] text-[var(--ap-text-body)]">
      <div className="max-w-[1080px] mx-auto px-6 py-6">
        {/* Header */}
        <header className="flex items-center gap-2.5 pb-4 mb-5 border-b border-[var(--ap-border)]">
          <div className="w-5 h-5 text-[var(--color-brand)]">
            <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
              <path
                d="M12 22v-5M9 8V2M15 8V2M18 8h1a2 2 0 0 1 2 2v1a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-1a2 2 0 0 1 2-2h1"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-base font-semibold text-[var(--ap-text-primary)] m-0">
            Arlopass Wallet — Connect Provider
          </h1>
        </header>

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(420px,1.2fr)_minmax(300px,1fr)] gap-4">
          {/* Left column: Add Provider Wizard + Bridge */}
          <div className="flex flex-col gap-4">
            <div className="bg-[var(--ap-bg-surface)] border border-[var(--ap-border)] rounded-lg p-5">
              <h2 className="text-sm font-semibold text-[var(--ap-text-primary)] m-0 mb-4">
                Connect a Provider
              </h2>
              <AddProviderWizard
                key={wizardKey}
                embedded
                onClose={() => {
                  // Reset wizard
                  setWizardKey((k) => k + 1);
                }}
                onSaved={handleProviderSaved}
              />
            </div>

            <div className="bg-[var(--ap-bg-surface)] border border-[var(--ap-border)] rounded-lg p-5">
              <BridgePairing sendNativeMessage={sendNativeMessage} />
            </div>
          </div>

          {/* Right column: Provider list */}
          <ProvidersList
            providers={providers}
            activeProvider={activeProvider}
            onActivate={(id) => void activateProvider(id)}
            onEdit={handleEdit}
            onRemove={(id) => void handleRemove(id)}
            onModelChange={(providerId, modelId) =>
              void setActiveModel(providerId, modelId)
            }
          />
        </div>
      </div>
    </div>
  );
}
