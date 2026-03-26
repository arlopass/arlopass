import { useState } from "react";
import { Box, Center, Collapse, Loader, ScrollArea, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
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
import type { HeaderMenuItem } from "./WalletHeader.js";
import { useTokenUsage } from "../hooks/useTokenUsage.js";
import { tokens } from "./theme.js";

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
  headerMenuItems?: readonly HeaderMenuItem[] | undefined;
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
  headerMenuItems,
}: WalletPopupProps) {
  const [activeTab, setActiveTab] = useState<WalletTabId>("providers");
  const [opened, { toggle }] = useDisclosure(true);

  const { summaries: usageSummaries } = useTokenUsage();
  const tokenUsageByProvider: Record<string, number> = {};
  for (const s of usageSummaries) {
    for (const p of s.byProvider) {
      tokenUsageByProvider[p.providerId] = (tokenUsageByProvider[p.providerId] ?? 0) + p.inputTokens + p.outputTokens;
    }
  }

  return (
    <PopupShell>
      <WalletHeader
        title="Synapse Wallet"
        collapsed={!opened}
        onToggleCollapse={headerMenuItems != null && headerMenuItems.length > 0 ? undefined : toggle}
        onSettingsClick={onSettingsClick}
        menuItems={headerMenuItems}
      />
      <Collapse in={opened} transitionDuration={200} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Box
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            paddingLeft: tokens.spacing.contentHPadding,
            paddingRight: tokens.spacing.contentHPadding,
            paddingTop: tokens.spacing.contentTopPadding,
            paddingBottom: tokens.spacing.contentBottomPadding,
            gap: tokens.spacing.sectionGap,
          }}
        >
          {/* Tabs — always visible at top */}
          <WalletTabs activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === "providers" && (
            <>
              {/* Category selector — always visible below tabs */}
              <CategorySelector label="All Providers" />

              {/* Provider list — scrollable, takes remaining space */}
              <ScrollArea
                style={{ flex: 1, minHeight: 0 }}
                type="scroll"
                offsetScrollbars
                scrollbarSize={6}
              >
                {loading === true && (
                  <Center py="xl">
                    <Loader size="sm" color={tokens.color.textSecondary} />
                  </Center>
                )}
                {error != null && (
                  <Center py="xl">
                    <Text fz="sm" c="red" ta="center">{error}</Text>
                  </Center>
                )}
                {loading !== true && error == null && providers.length === 0 && (
                  <Center py="xl">
                    <Text fz="sm" c={tokens.color.textSecondary} ta="center">
                      No providers connected.{"\n"}Connect one to get started.
                    </Text>
                  </Center>
                )}
                {loading !== true && error == null && providers.length > 0 && (
                  <ProviderList
                    providers={providers}
                    tokenUsageByProvider={tokenUsageByProvider}
                    onProviderClick={onProviderClick}
                    onRemoveProvider={onRemoveProvider}
                    onEditProvider={onEditProvider}
                  />
                )}
              </ScrollArea>

              {/* Bottom button — always visible */}
              <PrimaryButton onClick={onManageProviders}>
                {providers.length === 0 ? "Connect provider" : "Manage providers"}
              </PrimaryButton>
            </>
          )}

          {activeTab === "models" && (
            <ModelsTabContent providers={rawProviders ?? []} />
          )}

          {activeTab === "apps" && (
            <AppsTabContent />
          )}

          {activeTab === "vault" && (
            <VaultTabContent />
          )}

          {activeTab === "usage" && (
            <UsageTabContent />
          )}
        </Box>
      </Collapse>
    </PopupShell>
  );
}
