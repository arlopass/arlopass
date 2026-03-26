import { Tabs } from "@mantine/core";
import { tokens } from "./theme.js";

export type WalletTabId = "providers" | "models" | "apps" | "vault" | "usage";

export type WalletTabsProps = {
  activeTab: WalletTabId;
  onTabChange: (tab: WalletTabId) => void;
};

const tabItems: { id: WalletTabId; label: string }[] = [
  { id: "providers", label: "Providers" },
  { id: "models", label: "Models" },
  { id: "apps", label: "Apps" },
  { id: "vault", label: "Vault" },
  { id: "usage", label: "Usage" },
];

export function WalletTabs({ activeTab, onTabChange }: WalletTabsProps) {
  return (
    <Tabs
      value={activeTab}
      onChange={(value) => { if (value !== null) onTabChange(value as WalletTabId); }}
      variant="unstyled"
      styles={{
        root: { overflow: "hidden" },
        list: { display: "flex", width: "100%" },
        tab: {
          flex: "1 0 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: tokens.spacing.tabPadding,
          borderBottom: `1px solid ${tokens.color.border}`,
          background: "transparent",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 500,
          color: tokens.color.textSecondary,
          transition: "border-color 150ms ease, color 150ms ease",
          whiteSpace: "nowrap" as const,
          "&[dataActive]": {
            borderBottomColor: tokens.color.textPrimary,
            color: tokens.color.textPrimary,
          },
        },
      }}
    >
      <Tabs.List>
        {tabItems.map((tab) => (
          <Tabs.Tab
            key={tab.id}
            value={tab.id}
            style={tab.id === activeTab ? {
              borderBottomColor: tokens.color.textPrimary,
              color: tokens.color.textPrimary,
            } : undefined}
          >
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
