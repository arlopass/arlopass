import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { IconArrowLeft } from "@tabler/icons-react";
import { arlopassTheme } from "./ui/components/theme.js";
import { BridgeInstallGuide } from "./ui/components/onboarding/BridgeInstallGuide.js";
import { OnboardingBanner } from "./ui/components/onboarding/OnboardingBanner.js";
import { AddProviderWizard } from "./ui/components/onboarding/AddProviderWizard.js";
import { useVault } from "./ui/hooks/useVault.js";
import { VaultGate } from "./ui/components/VaultGate.js";
import { VaultProvider } from "./ui/hooks/VaultContext.js";

type OnboardingRoute = "bridge-install" | "add-provider-onboarding" | null;

function parseHash(): OnboardingRoute {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === "bridge-install") return "bridge-install";
  if (hash === "add-provider-onboarding") return "add-provider-onboarding";
  return null;
}

function OptionsOnboarding() {
  const [route, setRoute] = useState<OnboardingRoute>(parseHash);
  const [providerSaved, setProviderSaved] = useState(false);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Close the tab after provider is saved
  useEffect(() => {
    if (!providerSaved) return;
    const timer = setTimeout(() => window.close(), 2000);
    return () => clearTimeout(timer);
  }, [providerSaved]);

  if (route === null) return null;

  if (route === "bridge-install") {
    return (
      <BridgeInstallGuide
        onBridgeDetected={() => {
          window.location.hash = "add-provider-onboarding";
        }}
        onBack={() => window.close()}
      />
    );
  }

  if (route === "add-provider-onboarding") {
    if (providerSaved) {
      return (
        <div className="min-h-screen bg-[var(--ap-bg-base)] flex items-center justify-center">
          <div className="bg-[var(--ap-bg-surface)] border border-[var(--ap-border)] rounded-lg p-10 text-center max-w-[400px] animate-fade-in-up">
            {/* Success checkmark */}
            <div className="w-12 h-12 rounded-full bg-[var(--color-success-subtle)] border border-[var(--color-success)]/20 flex items-center justify-center mx-auto mb-4">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-success)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-[var(--ap-text-primary)] mb-2">
              Provider added!
            </h2>
            <p className="text-xs text-[var(--ap-text-secondary)] mb-4">
              Heading back to the extension…
            </p>
            <div className="w-5 h-5 border-2 border-[var(--color-brand)]/30 border-t-[var(--color-brand)] rounded-full animate-spin-slow mx-auto" />
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[var(--ap-bg-base)]">
        <OnboardingBanner
          step={2}
          totalSteps={3}
          label="Add a provider"
          bridgeConnected
        />
        <div className="max-w-[600px] mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => {
                window.location.hash = "bridge-install";
              }}
              className="flex items-center gap-1 px-2 py-1 text-[10px]! font-medium text-[var(--ap-text-secondary)] bg-transparent border-none cursor-pointer hover:text-[var(--ap-text-primary)] transition-colors duration-150"
            >
              <IconArrowLeft size={12} />
              Back
            </button>
            <button
              type="button"
              onClick={() => window.close()}
              className="px-2 py-1 text-[10px]! font-medium text-[var(--ap-text-secondary)] bg-transparent border-none cursor-pointer hover:text-[var(--ap-text-primary)] transition-colors duration-150"
            >
              Skip for now
            </button>
          </div>

          <div className="bg-[var(--ap-bg-surface)] border border-[var(--ap-border)] rounded-lg p-6">
            <h3 className="text-sm font-semibold text-[var(--ap-text-primary)] mb-4">
              Connect your first AI provider
            </h3>
            <AddProviderWizard
              embedded
              onClose={() => {
                window.location.hash = "bridge-install";
              }}
              onSaved={() => setProviderSaved(true)}
            />
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Bootstrap: only mount if hash matches an onboarding route
const route = parseHash();
if (route !== null) {
  // Hide legacy options UI
  const legacyPage = document.querySelector(
    ".options-page",
  ) as HTMLElement | null;
  if (legacyPage) legacyPage.style.display = "none";

  let mountEl = document.getElementById("onboarding-root");
  if (!mountEl) {
    mountEl = document.createElement("div");
    mountEl.id = "onboarding-root";
    document.body.prepend(mountEl);
  }

  function OptionsOnboardingApp() {
    const vault = useVault();
    return (
      <MantineProvider theme={arlopassTheme} forceColorScheme="dark">
        <VaultGate
          status={vault.status}
          onSetup={vault.setup}
          onSetupKeychain={vault.setupKeychain}
          onUnlock={vault.unlock}
          onUnlockKeychain={vault.unlockKeychain}
          onDestroyVault={vault.destroyVault}
          onRetry={vault.refresh}
          needsReauth={vault.needsReauth}
        >
          <VaultProvider sendVaultMessage={vault.sendVaultMessage}>
            <OptionsOnboarding />
          </VaultProvider>
        </VaultGate>
      </MantineProvider>
    );
  }

  createRoot(mountEl).render(<OptionsOnboardingApp />);
}
