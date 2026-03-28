import { useCallback, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Collapse,
  Divider,
  Group,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  UnstyledButton,
  NumberInput,
  Switch,
} from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { PopupShell } from "./PopupShell.js";
import { WalletHeader } from "./WalletHeader.js";
import { ProviderAvatar } from "./ProviderAvatar.js";
import { MetadataDivider } from "./MetadataDivider.js";
import { PrimaryButton } from "./PrimaryButton.js";
import { ConfigureSettingsStep } from "./app-connect/ConfigureSettingsStep.js";
import { saveApp, type ConnectedApp } from "./app-connect/app-storage.js";
import type { WalletProvider } from "../popup-state.js";
import { useVaultContext } from "../hooks/VaultContext.js";
import { useTokenUsage } from "../hooks/useTokenUsage.js";
import { tokens } from "./theme.js";

type AppTabId = "providers" | "models" | "settings";
type SubView =
  | "none"
  | "enable-provider"
  | "pick-provider-models"
  | "enable-model";

function extractDomain(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}

function deriveProviderKey(provider: WalletProvider): string {
  const n = provider.name.toLowerCase();
  const m = provider.metadata?.["methodId"] ?? "";
  const cliType = provider.metadata?.["cliType"] ?? "";
  if (cliType === "claude-code") return "claude";
  if (
    m.startsWith("anthropic.") ||
    n.includes("anthropic") ||
    n.includes("claude")
  )
    return "anthropic";
  if (m.startsWith("openai.") || n.includes("openai")) return "openai";
  if (m.startsWith("gemini.") || n.includes("gemini")) return "gemini";
  if (m.startsWith("foundry.") || n.includes("microsoft")) return "microsoft";
  if (m.startsWith("bedrock.")) return "bedrock";
  if (m.startsWith("perplexity.")) return "perplexity";
  if (provider.type === "local") return "ollama";
  if (provider.type === "cli") return "githubcopilot";
  return "openai";
}

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
  const [opened, { toggle }] = useDisclosure(true);
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
        collapsed={!opened}
        onToggleCollapse={subView === "none" ? toggle : undefined}
        onSettingsClick={subView !== "none" ? undefined : onSettingsClick}
      />
      <Collapse
        in={opened}
        transitionDuration={200}
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
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
          {/* App stats bar */}
          <Group gap={tokens.spacing.metadataGap}>
            {localApp.iconUrl && (
              <img
                src={localApp.iconUrl}
                alt=""
                width={24}
                height={24}
                style={{ borderRadius: 4, flexShrink: 0 }}
              />
            )}
            <Text fz="sm" fw={500} c={tokens.color.textPrimary}>
              {formatTokens(appTotalTokens)} tokens used
            </Text>
            <MetadataDivider />
            <Text fz="sm" fw={500} c={tokens.color.textPrimary}>
              {localApp.permissions.autopilot &&
              localApp.permissions.readBalance &&
              localApp.permissions.autoSelectModel
                ? "Full permissions"
                : "Partial permissions"}
            </Text>
          </Group>

          {/* App tabs */}
          <Tabs
            value={activeTab}
            onChange={(v) => {
              if (v !== null) setActiveTab(v as AppTabId);
            }}
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
              },
            }}
          >
            <Tabs.List>
              {(["providers", "models", "settings"] as const).map((id) => (
                <Tabs.Tab
                  key={id}
                  value={id}
                  style={
                    id === activeTab
                      ? {
                          borderBottomColor: tokens.color.textPrimary,
                          color: tokens.color.textPrimary,
                        }
                      : undefined
                  }
                >
                  {id === "providers"
                    ? "Providers"
                    : id === "models"
                      ? "Models"
                      : "Settings"}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>

          {/* Sub-views override tab content */}
          {subView === "enable-provider" && (
            <>
              <Text fw={500} fz="sm" c={tokens.color.textPrimary}>
                Select a provider to enable
              </Text>
              <ScrollArea
                style={{ flex: 1, minHeight: 0 }}
                type="scroll"
                offsetScrollbars
                scrollbarSize={6}
              >
                <Stack gap={8}>
                  {availableProviders.length === 0 && (
                    <Text
                      fz="sm"
                      c={tokens.color.textSecondary}
                      ta="center"
                      py="xl"
                    >
                      All providers are already enabled.
                    </Text>
                  )}
                  {availableProviders.map((p) => (
                    <UnstyledButton
                      key={p.id}
                      onClick={() => {
                        setPickedProviderId(p.id);
                        setPickedModelIds(p.models.map((m) => m.id));
                        setSubView("pick-provider-models");
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: tokens.spacing.iconTextGap,
                        width: "100%",
                        padding: tokens.spacing.cardPadding,
                        background: tokens.color.bgSurface,
                        border: `1px solid ${tokens.color.border}`,
                        borderRadius: tokens.radius.card,
                        cursor: "pointer",
                      }}
                    >
                      <ProviderAvatar
                        providerKey={deriveProviderKey(p)}
                        size={tokens.size.providerIcon}
                      />
                      <Stack
                        gap={0}
                        style={{ overflow: "hidden", minWidth: 0 }}
                      >
                        <Text
                          fw={600}
                          fz="sm"
                          c={tokens.color.textPrimary}
                          truncate
                        >
                          {p.name}
                        </Text>
                        <Text fw={500} fz="xs" c={tokens.color.textSecondary}>
                          {p.models.length}{" "}
                          {p.models.length === 1 ? "model" : "models"} available
                        </Text>
                      </Stack>
                    </UnstyledButton>
                  ))}
                </Stack>
              </ScrollArea>
            </>
          )}

          {subView === "pick-provider-models" && pickedProvider != null && (
            <>
              <Group justify="space-between">
                <Text fw={500} fz="sm" c={tokens.color.textPrimary}>
                  Select models to enable
                </Text>
                <UnstyledButton
                  onClick={() => {
                    const allIds = pickedProvider.models.map((m) => m.id);
                    setPickedModelIds(
                      pickedModelIds.length === allIds.length ? [] : allIds,
                    );
                  }}
                >
                  <Text fz="xs" c="#2f70ff" fw={500}>
                    {pickedModelIds.length === pickedProvider.models.length
                      ? "Deselect all"
                      : "Select all"}
                  </Text>
                </UnstyledButton>
              </Group>
              <ScrollArea
                style={{ flex: 1, minHeight: 0 }}
                type="scroll"
                offsetScrollbars
                scrollbarSize={6}
              >
                <Stack gap={8}>
                  {pickedProvider.models.map((m) => (
                    <UnstyledButton
                      key={m.id}
                      onClick={() => {
                        setPickedModelIds((prev) =>
                          prev.includes(m.id)
                            ? prev.filter((x) => x !== m.id)
                            : [...prev, m.id],
                        );
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: tokens.spacing.iconTextGap,
                        width: "100%",
                        padding: tokens.spacing.cardPadding,
                        background: tokens.color.bgSurface,
                        border: pickedModelIds.includes(m.id)
                          ? "2px solid #2f70ff"
                          : `1px solid ${tokens.color.border}`,
                        borderRadius: tokens.radius.card,
                        cursor: "pointer",
                      }}
                    >
                      <Checkbox
                        checked={pickedModelIds.includes(m.id)}
                        onChange={() => {}}
                        size="xs"
                        color="#2f70ff"
                        styles={{ input: { cursor: "pointer" } }}
                      />
                      <ProviderAvatar
                        providerKey={deriveProviderKey(pickedProvider)}
                        size={20}
                      />
                      <Text
                        fw={600}
                        fz="sm"
                        c={tokens.color.textPrimary}
                        truncate
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        {m.name}
                      </Text>
                    </UnstyledButton>
                  ))}
                </Stack>
              </ScrollArea>
              <PrimaryButton
                onClick={() => void handleConfirmEnableProvider()}
                disabled={pickedModelIds.length === 0}
              >
                Enable provider
              </PrimaryButton>
            </>
          )}

          {subView === "enable-model" && (
            <>
              <Group justify="space-between">
                <Text fw={500} fz="sm" c={tokens.color.textPrimary}>
                  Select models to enable
                </Text>
                <UnstyledButton
                  onClick={() => {
                    setPickedModelIds(
                      pickedModelIds.length === availableModels.length
                        ? []
                        : availableModels.map((m) => m.id),
                    );
                  }}
                >
                  <Text fz="xs" c="#2f70ff" fw={500}>
                    {pickedModelIds.length === availableModels.length
                      ? "Deselect all"
                      : "Select all"}
                  </Text>
                </UnstyledButton>
              </Group>
              <ScrollArea
                style={{ flex: 1, minHeight: 0 }}
                type="scroll"
                offsetScrollbars
                scrollbarSize={6}
              >
                <Stack gap={8}>
                  {availableModels.length === 0 && (
                    <Text
                      fz="sm"
                      c={tokens.color.textSecondary}
                      ta="center"
                      py="xl"
                    >
                      All models from enabled providers are already enabled.
                    </Text>
                  )}
                  {availableModels.map((m) => (
                    <UnstyledButton
                      key={m.id}
                      onClick={() => {
                        setPickedModelIds((prev) =>
                          prev.includes(m.id)
                            ? prev.filter((x) => x !== m.id)
                            : [...prev, m.id],
                        );
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: tokens.spacing.iconTextGap,
                        width: "100%",
                        padding: tokens.spacing.cardPadding,
                        background: tokens.color.bgSurface,
                        border: pickedModelIds.includes(m.id)
                          ? "2px solid #2f70ff"
                          : `1px solid ${tokens.color.border}`,
                        borderRadius: tokens.radius.card,
                        cursor: "pointer",
                      }}
                    >
                      <Checkbox
                        checked={pickedModelIds.includes(m.id)}
                        onChange={() => {}}
                        size="xs"
                        color="#2f70ff"
                        styles={{ input: { cursor: "pointer" } }}
                      />
                      <ProviderAvatar providerKey={m.providerKey} size={20} />
                      <Text
                        fw={600}
                        fz="sm"
                        c={tokens.color.textPrimary}
                        truncate
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        {m.name}
                      </Text>
                    </UnstyledButton>
                  ))}
                </Stack>
              </ScrollArea>
              <PrimaryButton
                onClick={() => void handleConfirmEnableModels()}
                disabled={pickedModelIds.length === 0}
              >
                {pickedModelIds.length > 0
                  ? `Enable ${String(pickedModelIds.length)} model${pickedModelIds.length !== 1 ? "s" : ""}`
                  : "Enable models"}
              </PrimaryButton>
            </>
          )}

          {/* Normal tab content — only when no sub-view is active */}
          {subView === "none" && activeTab === "providers" && (
            <>
              <Text fw={500} fz="xs" c={tokens.color.textPrimary}>
                Enabled providers
              </Text>
              <ScrollArea
                style={{ flex: 1, minHeight: 0 }}
                type="scroll"
                offsetScrollbars
                scrollbarSize={6}
              >
                <Stack gap={tokens.spacing.sectionGap}>
                  {enabledProviders.length === 0 && (
                    <Text
                      fz="sm"
                      c={tokens.color.textSecondary}
                      ta="center"
                      py="xl"
                    >
                      No providers enabled for this app.
                    </Text>
                  )}
                  {enabledProviders.map((p) => {
                    const enabledModelCount = p.models.filter((m) =>
                      localApp.enabledModelIds.includes(m.id),
                    ).length;
                    const providerUsage =
                      appUsageSummary?.byProvider
                        .filter((bp) => bp.providerId === p.id)
                        .reduce(
                          (sum, bp) => sum + bp.inputTokens + bp.outputTokens,
                          0,
                        ) ?? 0;
                    return (
                      <AppProviderCard
                        key={p.id}
                        provider={p}
                        providerKey={deriveProviderKey(p)}
                        enabledModelCount={enabledModelCount}
                        totalModelCount={p.models.length}
                        tokenUsage={providerUsage}
                        onDisable={() => void handleDisableProvider(p.id)}
                      />
                    );
                  })}
                </Stack>
              </ScrollArea>
              <PrimaryButton
                onClick={() => {
                  setPickedModelIds([]);
                  setSubView("enable-provider");
                }}
              >
                Enable provider
              </PrimaryButton>
            </>
          )}

          {subView === "none" && activeTab === "models" && (
            <>
              <Text fw={500} fz="xs" c={tokens.color.textPrimary}>
                Enabled models
              </Text>
              <ScrollArea
                style={{ flex: 1, minHeight: 0 }}
                type="scroll"
                offsetScrollbars
                scrollbarSize={6}
              >
                <Stack gap={tokens.spacing.sectionGap}>
                  {enabledModels.size === 0 && (
                    <Text
                      fz="sm"
                      c={tokens.color.textSecondary}
                      ta="center"
                      py="xl"
                    >
                      No models enabled for this app.
                    </Text>
                  )}
                  {Array.from(enabledModels.entries()).map(([id, model]) => {
                    const modelUsage =
                      appUsageSummary?.byProvider
                        .filter((bp) => bp.modelId === id)
                        .reduce(
                          (sum, bp) => sum + bp.inputTokens + bp.outputTokens,
                          0,
                        ) ?? 0;
                    return (
                      <AppModelCard
                        key={id}
                        modelId={id}
                        model={model}
                        tokenUsage={modelUsage}
                        onDisable={() => void handleDisableModel(id)}
                      />
                    );
                  })}
                </Stack>
              </ScrollArea>
              <PrimaryButton
                onClick={() => {
                  setPickedModelIds([]);
                  setSubView("enable-model");
                }}
              >
                Enable model
              </PrimaryButton>
            </>
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
        </Box>
      </Collapse>
    </PopupShell>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function AppProviderCard({
  provider,
  providerKey,
  enabledModelCount,
  totalModelCount,
  tokenUsage,
  onDisable,
}: {
  provider: WalletProvider;
  providerKey: string;
  enabledModelCount: number;
  totalModelCount: number;
  tokenUsage?: number | undefined;
  onDisable: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Box
      style={{
        width: "100%",
        background: tokens.color.bgSurface,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.card,
        overflow: "hidden",
      }}
    >
      <UnstyledButton
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: tokens.spacing.cardPadding,
          cursor: "pointer",
        }}
      >
        <Group
          gap={tokens.spacing.iconTextGap}
          align="center"
          wrap="nowrap"
          style={{ overflow: "hidden", flex: 1, minWidth: 0 }}
        >
          <ProviderAvatar
            providerKey={providerKey}
            size={tokens.size.providerIcon}
          />
          <Stack gap={0} style={{ overflow: "hidden", minWidth: 0 }}>
            <Text fw={600} fz="sm" c={tokens.color.textPrimary} truncate>
              {provider.name}
            </Text>
            <Text
              fw={500}
              fz="xs"
              c={tokens.color.textSecondary}
              style={{ whiteSpace: "nowrap" }}
            >
              {enabledModelCount}/{totalModelCount} models enabled
            </Text>
          </Stack>
        </Group>
        <IconChevronDown
          size={20}
          color={tokens.color.textSecondary}
          style={{
            transform: expanded ? undefined : "rotate(-90deg)",
            transition: "transform 150ms ease",
            flexShrink: 0,
          }}
          aria-hidden
        />
      </UnstyledButton>
      <Collapse in={expanded}>
        <Box
          style={{
            padding: `0 ${tokens.spacing.cardPadding}px ${tokens.spacing.cardPadding}px`,
          }}
        >
          <Divider mb={tokens.spacing.sectionGap} color={tokens.color.border} />
          <Stack gap={8}>
            <Group justify="space-between">
              <Text fz="xs" c={tokens.color.textSecondary}>
                Type
              </Text>
              <Text fz="xs" fw={500} c={tokens.color.textPrimary}>
                {provider.type}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text fz="xs" c={tokens.color.textSecondary}>
                Enabled models
              </Text>
              <Text fz="xs" fw={500} c={tokens.color.textPrimary}>
                {enabledModelCount} / {totalModelCount}
              </Text>
            </Group>
            {tokenUsage != null && tokenUsage > 0 && (
              <Group justify="space-between">
                <Text fz="xs" c={tokens.color.textSecondary}>
                  Token usage
                </Text>
                <Text fz="xs" fw={500} c={tokens.color.textPrimary}>
                  {formatTokens(tokenUsage)}
                </Text>
              </Group>
            )}
            <Group gap={8} mt={4}>
              <Button
                size="compact-xs"
                variant="light"
                color="red"
                radius={tokens.radius.card}
                onClick={onDisable}
              >
                Disable
              </Button>
            </Group>
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}

function AppModelCard({
  modelId,
  model,
  tokenUsage,
  onDisable,
}: {
  modelId: string;
  model: { name: string; providerKey: string; providerCount: number };
  tokenUsage?: number | undefined;
  onDisable: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Box
      style={{
        width: "100%",
        background: tokens.color.bgSurface,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.card,
        overflow: "hidden",
      }}
    >
      <UnstyledButton
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: tokens.spacing.cardPadding,
          cursor: "pointer",
        }}
      >
        <Group
          gap={tokens.spacing.iconTextGap}
          align="center"
          wrap="nowrap"
          style={{ overflow: "hidden", flex: 1, minWidth: 0 }}
        >
          <ProviderAvatar
            providerKey={model.providerKey}
            size={tokens.size.providerIcon}
          />
          <Stack gap={0} style={{ overflow: "hidden", minWidth: 0 }}>
            <Text fw={600} fz="sm" c={tokens.color.textPrimary} truncate>
              {model.name}
            </Text>
            <Text fw={500} fz="xs" c={tokens.color.textSecondary}>
              {model.providerCount}{" "}
              {model.providerCount === 1 ? "provider" : "providers"}
            </Text>
          </Stack>
        </Group>
        <IconChevronDown
          size={20}
          color={tokens.color.textSecondary}
          style={{
            transform: expanded ? undefined : "rotate(-90deg)",
            transition: "transform 150ms ease",
            flexShrink: 0,
          }}
          aria-hidden
        />
      </UnstyledButton>
      <Collapse in={expanded}>
        <Box
          style={{
            padding: `0 ${tokens.spacing.cardPadding}px ${tokens.spacing.cardPadding}px`,
          }}
        >
          <Divider mb={tokens.spacing.sectionGap} color={tokens.color.border} />
          <Stack gap={8}>
            <Group justify="space-between">
              <Text fz="xs" c={tokens.color.textSecondary}>
                Model ID
              </Text>
              <Text
                fz="xs"
                fw={500}
                c={tokens.color.textPrimary}
                truncate
                maw={180}
              >
                {modelId}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text fz="xs" c={tokens.color.textSecondary}>
                Providers
              </Text>
              <Text fz="xs" fw={500} c={tokens.color.textPrimary}>
                {model.providerCount}
              </Text>
            </Group>
            {tokenUsage != null && tokenUsage > 0 && (
              <Group justify="space-between">
                <Text fz="xs" c={tokens.color.textSecondary}>
                  Token usage
                </Text>
                <Text fz="xs" fw={500} c={tokens.color.textPrimary}>
                  {formatTokens(tokenUsage)}
                </Text>
              </Group>
            )}
            <Group gap={8} mt={4}>
              <Button
                size="compact-xs"
                variant="light"
                color="red"
                radius={tokens.radius.card}
                onClick={onDisable}
              >
                Disable
              </Button>
            </Group>
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}
