import {
  Group,
  NumberInput,
  ScrollArea,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { PrimaryButton } from "../PrimaryButton.js";
import type { AppPermissions, AppRules, AppLimits } from "./app-storage.js";
import { tokens } from "../theme.js";
import { useDisclosure } from "@mantine/hooks";

type SectionProps = {
  title: string;
  badge: string;
  children: React.ReactNode;
  masterToggle?: boolean | undefined;
  onMasterToggle?: (() => void) | undefined;
};

function CollapsibleSection({
  title,
  badge,
  children,
  masterToggle,
  onMasterToggle,
}: SectionProps) {
  const [opened, { toggle }] = useDisclosure(true);
  return (
    <Stack
      gap={0}
      style={{
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.card,
        overflow: "hidden",
      }}
    >
      <Group
        justify="space-between"
        style={{
          padding: `${tokens.spacing.cardPadding}px`,
          borderBottom: opened ? `1px solid ${tokens.color.border}` : undefined,
          cursor: "pointer",
        }}
        onClick={toggle}
      >
        <Group gap={8}>
          <IconChevronDown
            size={14}
            color={tokens.color.textPrimary}
            style={{
              transform: opened ? undefined : "rotate(-90deg)",
              transition: "transform 150ms ease",
            }}
          />
          <Text fw={600} fz="sm" c={tokens.color.textPrimary}>
            {title}
          </Text>
          <Text fw={400} fz="xs" c={tokens.color.textSecondary}>
            ({badge})
          </Text>
        </Group>
        {masterToggle !== undefined && (
          <Switch
            checked={masterToggle}
            onChange={(e) => {
              e.stopPropagation();
              onMasterToggle?.();
            }}
            size="xs"
            color="#2f70ff"
          />
        )}
      </Group>
      {opened && (
        <Stack gap={0} style={{ padding: `${tokens.spacing.cardPadding}px` }}>
          {children}
        </Stack>
      )}
    </Stack>
  );
}

function SettingRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap" py={8}>
      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
        <Text fw={600} fz="sm" c={tokens.color.textPrimary}>
          {title}
        </Text>
        <Text fz="xs" c={tokens.color.textSecondary}>
          {description}
        </Text>
      </Stack>
      <Switch
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        size="xs"
        color="#2f70ff"
      />
    </Group>
  );
}

function LimitRow({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap" py={8}>
      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
        <Text fw={600} fz="sm" c={tokens.color.textPrimary}>
          {title}
        </Text>
        <Text fz="xs" c={tokens.color.textSecondary}>
          {description}
        </Text>
      </Stack>
      <NumberInput
        value={value}
        onChange={(v) => {
          if (typeof v === "number") onChange(v);
        }}
        min={1}
        max={1_000_000}
        size="xs"
        w={90}
        styles={{
          input: {
            height: 28,
            fontSize: 12,
            textAlign: "right",
            borderColor: tokens.color.border,
            borderRadius: tokens.radius.card,
          },
        }}
      />
    </Group>
  );
}

export type ConfigureSettingsStepProps = {
  rules: AppRules;
  permissions: AppPermissions;
  limits: AppLimits;
  onRuleChange: (key: keyof AppRules, value: boolean) => void;
  onPermissionChange: (key: keyof AppPermissions, value: boolean) => void;
  onLimitChange: (key: keyof AppLimits, value: number) => void;
  onSave: () => void;
  saving: boolean;
};

export function ConfigureSettingsStep({
  rules,
  permissions,
  limits,
  onRuleChange,
  onPermissionChange,
  onLimitChange,
  onSave,
  saving,
}: ConfigureSettingsStepProps) {
  const rulesCount = [
    rules.lowTokenUsage,
    rules.noFallback,
    rules.alwaysAskPermission,
  ].filter(Boolean).length;
  const permsCount = [
    permissions.autopilot,
    permissions.readBalance,
    permissions.autoSelectModel,
  ].filter(Boolean).length;

  return (
    <>
      <ScrollArea
        style={{ flex: 1, minHeight: 0 }}
        type="scroll"
        offsetScrollbars
        scrollbarSize={6}
      >
        <Stack gap={tokens.spacing.sectionGap}>
          <CollapsibleSection
            title="Rules"
            badge={`${String(rulesCount)}/3 enforced`}
          >
            <SettingRow
              title="Low token usage mode"
              description="Force the web app to only send user message without additional metadata."
              checked={rules.lowTokenUsage}
              onChange={(v) => onRuleChange("lowTokenUsage", v)}
            />
            <SettingRow
              title="No fallback mode"
              description="Force the web app to show an error if a provider/model call fails instead of falling back to a different one."
              checked={rules.noFallback}
              onChange={(v) => onRuleChange("noFallback", v)}
            />
            <SettingRow
              title="Always ask for permission"
              description="Force the web app to always ask for permission before sending a message to your AI client."
              checked={rules.alwaysAskPermission}
              onChange={(v) => onRuleChange("alwaysAskPermission", v)}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Permissions"
            badge={`${String(permsCount)}/3 enabled`}
          >
            <SettingRow
              title="Autopilot mode"
              description="Let the web app run on autopilot mode, executing multiple consecutive AI commands and messages without human interaction."
              checked={permissions.autopilot}
              onChange={(v) => onPermissionChange("autopilot", v)}
            />
            <SettingRow
              title="Read token balance"
              description="Allow the web app to read the user's balance for specific providers and models."
              checked={permissions.readBalance}
              onChange={(v) => onPermissionChange("readBalance", v)}
            />
            <SettingRow
              title="Auto-select model"
              description="Allow the web app to automatically select the best suited model for a task from the list of enabled models."
              checked={permissions.autoSelectModel}
              onChange={(v) => onPermissionChange("autoSelectModel", v)}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Limits & Quotas" badge="">
            <LimitRow
              title="Consecutive AI calls"
              description="The maximum amount of AI calls that the web app can make before the user has to approve the continuation of the session."
              value={limits.consecutiveCalls}
              onChange={(v) => onLimitChange("consecutiveCalls", v)}
            />
            <LimitRow
              title="Daily tokens"
              description="The maximum amount of tokens the web app can consume in a single day."
              value={limits.dailyTokens}
              onChange={(v) => onLimitChange("dailyTokens", v)}
            />
            <LimitRow
              title="Concurrent calls"
              description="The maximum amount of AI calls that can be executed concurrently by the web app."
              value={limits.concurrentCalls}
              onChange={(v) => onLimitChange("concurrentCalls", v)}
            />
          </CollapsibleSection>
        </Stack>
      </ScrollArea>

      <PrimaryButton onClick={onSave} disabled={saving}>
        {saving ? "Saving..." : "Save settings"}
      </PrimaryButton>
    </>
  );
}
