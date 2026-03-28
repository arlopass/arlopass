import { useState } from "react";
import { PopupShell } from "./PopupShell.js";
import { WalletHeader } from "./WalletHeader.js";
import { WalletTabs, type WalletTabId } from "./WalletTabs.js";
import { CategorySelector } from "./CategorySelector.js";
import { ProviderList } from "./ProviderList.js";
import { PrimaryButton } from "./PrimaryButton.js";
import { ModelsTabContent } from "./ModelsTabContent.js";
import { VaultTabContent } from "./VaultTabContent.js";
import { AppsTabContent } from "./AppsTabContent.js";
import { UsageTabContent } from "./UsageTabContent.js";
import type { ProviderCardData } from "./ProviderCard.js";
import type { WalletProvider } from "../popup-state.js";
import { useTokenUsage } from "../hooks/useTokenUsage.js";

export type WalletPopupProps = {
  providers: ProviderCardData[];
  rawProviders?: WalletProvider[] | undefined;
  loading?: boolean | undefined;
  error?: string | null | undefined;
  onProviderClick?: ((providerId: string) => void) | undefined;
  onRemoveProvider?: ((providerId: string) => void) | undefined;
  onEditProvider?: ((providerId: string) => void) | undefined;
  onManageProviders?: (() => void) | undefined;
  onSettingsClick?: (() => void) | undefined;
  navLink?: { label: string; onClick: () => void } | undefined;
};

export function WalletPopup({
  providers,
  rawProviders,
  loading,
  error,
  onProviderClick,
  onRemoveProvider,
  onEditProvider,
  onManageProviders,
  onSettingsClick,
  navLink,
}: WalletPopupProps) {
  const [activeTab, setActiveTab] = useState<WalletTabId>("providers");
  const [collapsed, setCollapsed] = useState(false);

  const { summaries: usageSummaries } = useTokenUsage();
  const tokenUsageByProvider: Record<string, number> = {};
  for (const s of usageSummaries) {
    for (const p of s.byProvider) {
      tokenUsageByProvider[p.providerId] =
        (tokenUsageByProvider[p.providerId] ?? 0) +
        p.inputTokens +
        p.outputTokens;
    }
  }

  return (
    <PopupShell>
      <WalletHeader
        title="Arlopass Wallet"
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onSettingsClick={onSettingsClick}
        navLink={navLink}
      />

      {/* Collapsible body with CSS grid transition */}
      <div
        className={`grid transition-all duration-300 ${collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"} flex-1 min-h-0`}
        style={{ transitionTimingFunction: "cubic-bezier(0.25, 1, 0.5, 1)" }}
      >
        <div className="overflow-hidden flex flex-col min-h-0">
          <div className="flex flex-col flex-1 min-h-0 px-3 pt-1.5 pb-2.5 gap-2.5">
            {/* Tabs */}
            <WalletTabs activeTab={activeTab} onTabChange={setActiveTab} />

            {activeTab === "providers" && (
              <>
                <CategorySelector label="All Providers" />

                {/* Provider list — scrollable */}
                <div className="flex-1 min-h-0 overflow-y-auto pr-1.5">
                  {loading === true && (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-5 h-5 border-2 border-[var(--ap-text-secondary)]/30 border-t-[var(--ap-text-secondary)] rounded-full animate-spin-slow" />
                    </div>
                  )}
                  {error != null && (
                    <div className="flex items-center justify-center py-8">
                      <span className="text-xs text-[var(--color-danger)] text-center">
                        {error}
                      </span>
                    </div>
                  )}
                  {loading !== true &&
                    error == null &&
                    providers.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 gap-2 animate-fade-in">
                        <span className="text-xs text-[var(--ap-text-secondary)] text-center max-w-[240px]">
                          No providers connected.{"\n"}Connect one to get
                          started.
                        </span>
                      </div>
                    )}
                  {loading !== true &&
                    error == null &&
                    providers.length > 0 && (
                      <ProviderList
                        providers={providers}
                        tokenUsageByProvider={tokenUsageByProvider}
                        onProviderClick={onProviderClick}
                        onRemoveProvider={onRemoveProvider}
                        onEditProvider={onEditProvider}
                      />
                    )}
                </div>

                <PrimaryButton onClick={onManageProviders}>
                  {providers.length === 0
                    ? "Connect provider"
                    : "Manage providers"}
                </PrimaryButton>
              </>
            )}

            {activeTab === "models" && (
              <ModelsTabContent providers={rawProviders ?? []} />
            )}

            {activeTab === "apps" && <AppsTabContent />}

            {activeTab === "vault" && <VaultTabContent />}

            {activeTab === "usage" && <UsageTabContent />}
          </div>
        </div>
      </div>
    </PopupShell>
  );
}
