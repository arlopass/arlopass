import { useCallback, useState } from "react";
import { PopupShell } from "./PopupShell.js";
import { WalletHeader } from "./WalletHeader.js";
import { ConfigureSettingsStep } from "./app-connect/ConfigureSettingsStep.js";
import { saveApp, type ConnectedApp } from "./app-connect/app-storage.js";
import type { WalletProvider } from "../popup-state.js";
import { useVaultContext } from "../hooks/VaultContext.js";
import { useTokenUsage } from "../hooks/useTokenUsage.js";
import {
  AppStatsBar,
  AppTabs,
  type AppTabId,
  EnableProviderSubView,
  PickProviderModelsSubView,
  EnableModelSubView,
  ProvidersTabContent,
  AppModelsTabContent,
  extractDomain,
  deriveProviderKey,
} from "./app-detail/index.js";

type SubView =
  | "none"
  | "enable-provider"
  | "pick-provider-models"
  | "enable-model";

export type AppDetailViewProps = {
  app: ConnectedApp;
  rawProviders: WalletProvider[];
  onBack: () => void;
  onSettingsClick?: (() => void) | undefined;
  navLink?: { label: string; onClick: () => void } | undefined;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function AppDetailView({
  app,
  rawProviders,
  onBack: _onBack,
  onSettingsClick,
  navLink,
}: AppDetailViewProps) {
  const [activeTab, setActiveTab] = useState<AppTabId>("providers");
  const [collapsed, setCollapsed] = useState(false);
  const [localApp, setLocalApp] = useState(app);
  const [subView, setSubView] = useState<SubView>("none");
  const [pickedProviderId, setPickedProviderId] = useState<string | null>(null);
  const [pickedModelIds, setPickedModelIds] = useState<string[]>([]);
  const { sendVaultMessage } = useVaultContext();

  const { summaries: usageSummaries } = useTokenUsage();
  const appUsageSummary = usageSummaries.find(
    (s) => s.origin === localApp.origin,
  );
  const appTotalTokens = appUsageSummary
    ? appUsageSummary.totalInputTokens + appUsageSummary.totalOutputTokens
    : localApp.tokenUsage;

  // Providers enabled for this app
  const enabledProviders = rawProviders.filter((p) =>
    localApp.enabledProviderIds.includes(p.id),
  );

  // Models enabled for this app, grouped by provider
  const enabledModels = new Map<
    string,
    { name: string; providerKey: string; providerCount: number }
  >();
  for (const p of enabledProviders) {
    const pk = deriveProviderKey(p);
    for (const m of p.models) {
      if (localApp.enabledModelIds.includes(m.id)) {
        const existing = enabledModels.get(m.id);
        if (existing != null) {
          existing.providerCount++;
        } else {
          enabledModels.set(m.id, {
            name: m.name,
            providerKey: pk,
            providerCount: 1,
          });
        }
      }
    }
  }

  const handleSaveSettings = useCallback(async () => {
    await saveApp(
      {
        origin: localApp.origin,
        displayName: localApp.displayName,
        enabledProviderIds: localApp.enabledProviderIds,
        enabledModelIds: localApp.enabledModelIds,
        permissions: localApp.permissions,
        rules: localApp.rules,
        limits: localApp.limits,
        status: localApp.status,
      },
      sendVaultMessage,
    );
  }, [localApp, sendVaultMessage]);

  const persistApp = useCallback(
    async (updated: ConnectedApp) => {
      setLocalApp(updated);
      await saveApp(
        {
          origin: updated.origin,
          displayName: updated.displayName,
          enabledProviderIds: updated.enabledProviderIds,
          enabledModelIds: updated.enabledModelIds,
          permissions: updated.permissions,
          rules: updated.rules,
          limits: updated.limits,
          status: updated.status,
        },
        sendVaultMessage,
      );
    },
    [sendVaultMessage],
  );

  // Providers NOT yet enabled for this app
  const availableProviders = rawProviders.filter(
    (p) => !localApp.enabledProviderIds.includes(p.id),
  );

  // For enable-model: all models from enabled providers that aren't yet enabled
  const availableModels: { id: string; name: string; providerKey: string }[] =
    [];
  for (const p of enabledProviders) {
    const pk = deriveProviderKey(p);
    for (const m of p.models) {
      if (
        !localApp.enabledModelIds.includes(m.id) &&
        !availableModels.some((am) => am.id === m.id)
      ) {
        availableModels.push({ id: m.id, name: m.name, providerKey: pk });
      }
    }
  }

  // The provider being configured in the enable-provider flow
  const pickedProvider =
    pickedProviderId != null
      ? (rawProviders.find((p) => p.id === pickedProviderId) ?? null)
      : null;

  const handleConfirmEnableProvider = useCallback(async () => {
    if (pickedProvider == null) return;
    const newProviderIds = [...localApp.enabledProviderIds, pickedProvider.id];
    const newModelIds = [
      ...localApp.enabledModelIds,
      ...pickedModelIds.filter((id) => !localApp.enabledModelIds.includes(id)),
    ];
    const updated = {
      ...localApp,
      enabledProviderIds: newProviderIds,
      enabledModelIds: newModelIds,
    };
    await persistApp(updated);
    setSubView("none");
    setPickedProviderId(null);
    setPickedModelIds([]);
  }, [localApp, pickedProvider, pickedModelIds, persistApp]);

  const handleConfirmEnableModels = useCallback(async () => {
    const newModelIds = [
      ...localApp.enabledModelIds,
      ...pickedModelIds.filter((id) => !localApp.enabledModelIds.includes(id)),
    ];
    const updated = { ...localApp, enabledModelIds: newModelIds };
    await persistApp(updated);
    setSubView("none");
    setPickedModelIds([]);
  }, [localApp, pickedModelIds, persistApp]);

  const handleDisableProvider = useCallback(
    async (providerId: string) => {
      const updated = {
        ...localApp,
        enabledProviderIds: localApp.enabledProviderIds.filter(
          (id) => id !== providerId,
        ),
      };
      await persistApp(updated);
    },
    [localApp, persistApp],
  );

  const handleDisableModel = useCallback(
    async (modelId: string) => {
      const updated = {
        ...localApp,
        enabledModelIds: localApp.enabledModelIds.filter(
          (id) => id !== modelId,
        ),
      };
      await persistApp(updated);
    },
    [localApp, persistApp],
  );

  return (
    <PopupShell>
      <WalletHeader
        title={
          subView === "none"
            ? localApp.displayName
            : subView === "enable-provider"
              ? "Enable provider"
              : subView === "pick-provider-models"
                ? `${pickedProvider?.name ?? "Provider"} models`
                : "Enable model"
        }
        subtitle={
          subView === "none" ? extractDomain(localApp.origin) : undefined
        }
        navLink={subView === "none" ? navLink : undefined}
        onBack={
          subView !== "none"
            ? () => {
                setSubView("none");
                setPickedProviderId(null);
                setPickedModelIds([]);
              }
            : undefined
        }
        collapsed={collapsed}
        onToggleCollapse={
          subView === "none" ? () => setCollapsed((v) => !v) : undefined
        }
        onSettingsClick={subView !== "none" ? undefined : onSettingsClick}
      />

      {/* Collapsible body */}
      <div
        className={`grid transition-all duration-300 ${collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"} flex-1 min-h-0`}
        style={{ transitionTimingFunction: "cubic-bezier(0.25, 1, 0.5, 1)" }}
      >
        <div className="overflow-hidden flex flex-col min-h-0">
          <div className="flex flex-col flex-1 min-h-0 px-3 pt-1.5 pb-2.5 gap-2.5">
            {/* App stats bar */}
            <AppStatsBar app={localApp} totalTokens={appTotalTokens} />

            {/* App tabs */}
            <AppTabs activeTab={activeTab} onTabChange={setActiveTab} />

            {/* Sub-views override tab content */}
            {subView === "enable-provider" && (
              <EnableProviderSubView
                availableProviders={availableProviders}
                onPickProvider={(providerId, modelIds) => {
                  setPickedProviderId(providerId);
                  setPickedModelIds(modelIds);
                  setSubView("pick-provider-models");
                }}
              />
            )}

            {subView === "pick-provider-models" && pickedProvider != null && (
              <PickProviderModelsSubView
                provider={pickedProvider}
                providerKey={deriveProviderKey(pickedProvider)}
                selectedModelIds={pickedModelIds}
                onToggleModel={(modelId) =>
                  setPickedModelIds((prev) =>
                    prev.includes(modelId)
                      ? prev.filter((x) => x !== modelId)
                      : [...prev, modelId],
                  )
                }
                onToggleAll={() => {
                  const allIds = pickedProvider.models.map((m) => m.id);
                  setPickedModelIds(
                    pickedModelIds.length === allIds.length ? [] : allIds,
                  );
                }}
                onConfirm={() => void handleConfirmEnableProvider()}
              />
            )}

            {subView === "enable-model" && (
              <EnableModelSubView
                availableModels={availableModels}
                selectedModelIds={pickedModelIds}
                onToggleModel={(modelId) =>
                  setPickedModelIds((prev) =>
                    prev.includes(modelId)
                      ? prev.filter((x) => x !== modelId)
                      : [...prev, modelId],
                  )
                }
                onToggleAll={() =>
                  setPickedModelIds(
                    pickedModelIds.length === availableModels.length
                      ? []
                      : availableModels.map((m) => m.id),
                  )
                }
                onConfirm={() => void handleConfirmEnableModels()}
              />
            )}

            {/* Normal tab content — only when no sub-view is active */}
            {subView === "none" && activeTab === "providers" && (
              <ProvidersTabContent
                app={localApp}
                enabledProviders={enabledProviders}
                appUsageSummary={appUsageSummary}
                onDisableProvider={(id) => void handleDisableProvider(id)}
                onEnableProvider={() => {
                  setPickedModelIds([]);
                  setSubView("enable-provider");
                }}
              />
            )}

            {subView === "none" && activeTab === "models" && (
              <AppModelsTabContent
                enabledModels={enabledModels}
                appUsageSummary={appUsageSummary}
                onDisableModel={(id) => void handleDisableModel(id)}
                onEnableModel={() => {
                  setPickedModelIds([]);
                  setSubView("enable-model");
                }}
              />
            )}

            {subView === "none" && activeTab === "settings" && (
              <ConfigureSettingsStep
                rules={localApp.rules}
                permissions={localApp.permissions}
                limits={localApp.limits}
                onRuleChange={(key, value) =>
                  setLocalApp((prev) => ({
                    ...prev,
                    rules: { ...prev.rules, [key]: value },
                  }))
                }
                onPermissionChange={(key, value) =>
                  setLocalApp((prev) => ({
                    ...prev,
                    permissions: { ...prev.permissions, [key]: value },
                  }))
                }
                onLimitChange={(key, value) =>
                  setLocalApp((prev) => ({
                    ...prev,
                    limits: { ...prev.limits, [key]: value },
                  }))
                }
                onSave={() => void handleSaveSettings()}
                saving={false}
              />
            )}
          </div>
        </div>
      </div>
    </PopupShell>
  );
}
