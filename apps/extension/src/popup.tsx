import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { WalletPopup } from "./ui/components/WalletPopup.js";
import { AddProviderWizard, OnboardingController } from "./ui/components/onboarding/index.js";
import { readSetupState } from "./ui/components/onboarding/setup-state.js";
import { AppConnectWizard } from "./ui/components/app-connect/index.js";
import { AppDetailView } from "./ui/components/AppDetailView.js";
import {
  readPendingConnection,
  clearPendingConnection,
  writeConnectionResult,
} from "./ui/components/app-connect/pending-connection.js";
import { byomTheme } from "./ui/components/theme.js";
import { useWalletProviders } from "./ui/hooks/useWalletProviders.js";
import { useActiveTabApp } from "./ui/hooks/useActiveTabApp.js";
import { createWalletActionClient, type SendMessageFn } from "./ui/popup-actions.js";
import type { HeaderMenuItem } from "./ui/components/WalletHeader.js";

const sendMessage: SendMessageFn = (message) =>
  chrome.runtime.sendMessage(message);

const walletActions = createWalletActionClient(sendMessage);

const VIEW_STATE_KEY = "byom.popup.viewState.v1";

type PopupView =
  | { type: "main" }
  | { type: "onboarding" }
  | { type: "add-provider" }
  | { type: "connect-app"; origin: string }
  | { type: "wallet" };

type PersistedViewState = { type: "main" | "wallet" | "add-provider" | "onboarding" };

function persistView(view: PopupView): void {
  const state: PersistedViewState = view.type === "connect-app" ? { type: "main" } : { type: view.type };
  try { chrome.storage.session.set({ [VIEW_STATE_KEY]: state }); } catch { /* session storage may not be available */ }
}

async function restoreView(): Promise<PersistedViewState | null> {
  try {
    return new Promise((resolve) => {
      chrome.storage.session.get([VIEW_STATE_KEY], (result) => {
        const raw = result[VIEW_STATE_KEY];
        if (raw != null && typeof raw === "object" && typeof (raw as Record<string, unknown>)["type"] === "string") {
          resolve(raw as PersistedViewState);
        } else {
          resolve(null);
        }
      });
    });
  } catch {
    return null;
  }
}

function App() {
  const { providers, rawProviders, loading, error, refresh } = useWalletProviders();
  const { activeApp } = useActiveTabApp();
  const [view, setView] = useState<PopupView>({ type: "main" });
  const [restored, setRestored] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const prevActiveAppOrigin = useRef<string | null>(null);

  // Wrap setView to also persist
  const updateView = useCallback((v: PopupView) => {
    setView(v);
    persistView(v);
  }, []);

  // Restore saved view state on mount
  useEffect(() => {
    void (async () => {
      const pending = await readPendingConnection();
      if (pending !== null) {
        setView({ type: "connect-app", origin: pending.origin });
        setRestored(true);
        return;
      }
      const saved = await restoreView();
      if (saved !== null) {
        setView(saved);
      }
      setRestored(true);
      // Onboarding check deferred until providers load
      setOnboardingChecked(false);
    })();
  }, []);

  // Handle active tab app changes
  useEffect(() => {
    if (!restored) return;

    const currentOrigin = activeApp?.tabOrigin ?? null;
    const prevOrigin = prevActiveAppOrigin.current;
    prevActiveAppOrigin.current = currentOrigin;

    // Skip first render (no previous value to compare)
    if (prevOrigin === null && currentOrigin !== null) {
      // Initial load — if view is "main", app detection handles it naturally
      return;
    }

    // If user is in an app-specific view (type === "main" with activeApp)
    if (view.type === "main") {
      if (prevOrigin !== null && currentOrigin !== prevOrigin) {
        // Tab changed to a different origin
        if (currentOrigin === null) {
          // Switched to unregistered page → go to wallet
          updateView({ type: "wallet" });
        }
        // If currentOrigin is a different connected app, activeApp will update
        // and the render will show the new app automatically (view stays "main")
      }
    }
  }, [activeApp?.tabOrigin, view.type, restored, updateView]);

  // Check onboarding after provider loading completes
  useEffect(() => {
    if (!restored || loading) return;
    if (onboardingChecked) return;
    setOnboardingChecked(true);
    void readSetupState().then((state) => {
      if (!state.completed && providers.length === 0) {
        setView({ type: "onboarding" });
      }
    });
  }, [restored, loading, providers.length, onboardingChecked]);

  if (!restored) return null;

  if (view.type === "onboarding") {
    return (
      <MantineProvider theme={byomTheme} forceColorScheme="light">
        <OnboardingController
          hasProviders={providers.length > 0}
          onComplete={() => { updateView({ type: "main" }); refresh(); }}
          onOpenOptions={(route) => {
            chrome.tabs.create({ url: chrome.runtime.getURL(`options.html#${route}`) });
          }}
        />
      </MantineProvider>
    );
  }

  if (view.type === "add-provider") {
    return (
      <MantineProvider theme={byomTheme} forceColorScheme="light">
        <AddProviderWizard
          onClose={() => updateView({ type: "main" })}
          onSaved={refresh}
        />
      </MantineProvider>
    );
  }

  if (view.type === "connect-app") {
    return (
      <MantineProvider theme={byomTheme} forceColorScheme="light">
        <AppConnectWizard
          origin={view.origin}
          providers={providers}
          rawProviders={rawProviders}
          onComplete={(approved) => {
            void writeConnectionResult(view.origin, approved).then(() =>
              clearPendingConnection(),
            ).then(() => {
              updateView({ type: "main" });
              refresh();
            });
          }}
        />
      </MantineProvider>
    );
  }

  // Build header dropdown menu items when an app is detected
  const headerMenuItems: HeaderMenuItem[] = [];
  if (activeApp !== null) {
    const isAppView = view.type === "main";
    const domain = (() => { try { return new URL(activeApp.app.origin).hostname; } catch { return activeApp.app.origin; } })();
    headerMenuItems.push({
      label: activeApp.app.displayName,
      subtitle: domain,
      active: isAppView,
      onClick: () => updateView({ type: "main" }),
    });
    headerMenuItems.push({
      label: "Synapse Wallet",
      active: !isAppView,
      onClick: () => updateView({ type: "wallet" }),
    });
  }

  // Show app-specific view when the active tab has a connected app
  if (view.type === "main" && activeApp !== null) {
    return (
      <MantineProvider theme={byomTheme} forceColorScheme="light">
        <AppDetailView
          app={activeApp.app}
          rawProviders={rawProviders}
          onBack={() => updateView({ type: "wallet" })}
          onSettingsClick={() => {
            void walletActions.openConnectFlow();
          }}
          headerMenuItems={headerMenuItems}
        />
      </MantineProvider>
    );
  }

  return (
    <MantineProvider theme={byomTheme} forceColorScheme="light">
      <WalletPopup
        providers={providers}
        rawProviders={rawProviders}
        loading={loading}
        error={error}
        onProviderClick={(id) => console.log("Provider clicked:", id)}
        onRemoveProvider={(id) => {
          void walletActions.revokeProvider({ providerId: id }).then(() => refresh());
        }}
        onEditProvider={() => {
          void walletActions.openConnectFlow();
        }}
        onManageProviders={() => updateView({ type: "add-provider" })}
        onSettingsClick={() => {
          void walletActions.openConnectFlow();
        }}
        headerMenuItems={headerMenuItems}
      />
    </MantineProvider>
  );
}

const root = document.getElementById("popup-root");
if (root !== null) {
  createRoot(root).render(<App />);
}
