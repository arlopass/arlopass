import { useState } from "react";
import { NumberInput } from "@mantine/core";
import { IconChevronDown, IconClock } from "@tabler/icons-react";
import { PrimaryButton } from "../PrimaryButton.js";
import type { AppPermissions, AppRules, AppLimits } from "./app-storage.js";

type SectionProps = {
  title: string;
  badge: string;
  children: React.ReactNode;
  masterToggle?: boolean | undefined;
  onMasterToggle?: (() => void) | undefined;
};

/**
 * Collapsible section matching the PermissionsManagement preview.
 */
function CollapsibleSection({
  title,
  badge,
  children,
  masterToggle,
  onMasterToggle,
}: SectionProps) {
  const [opened, setOpened] = useState(true);
  return (
    <div className="border border-[var(--ap-border)] rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpened((v) => !v)}
        className="flex items-center justify-between w-full px-3 py-2.5 bg-transparent border-none cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <IconChevronDown
            size={14}
            className={`text-[var(--ap-text-primary)] transition-transform duration-200 ${opened ? "" : "-rotate-90"}`}
          />
          <span className="text-xs font-semibold text-[var(--ap-text-primary)]">
            {title}
          </span>
          {badge && (
            <span className="text-[10px] font-normal text-[var(--ap-text-secondary)]">
              ({badge})
            </span>
          )}
        </div>
        {masterToggle !== undefined && (
          <Toggle checked={masterToggle} onChange={() => onMasterToggle?.()} />
        )}
      </button>
      <div
        className={`grid transition-all duration-300 ${opened ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.25, 1, 0.5, 1)" }}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 border-t border-[var(--ap-border)]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Custom toggle switch matching the PermissionsIllustration preview.
 * w-6 h-3.5, smooth 250ms knob transition.
 */
function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`relative w-7 h-4 rounded-full border-none cursor-pointer shrink-0 transition-colors duration-250 ${
        checked ? "bg-[var(--color-success)]" : "bg-[var(--ap-border)]"
      }`}
    >
      <div
        className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-all duration-250 ${
          checked ? "left-[calc(100%-14px)]" : "left-0.5"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.25, 1, 0.5, 1)" }}
      />
    </button>
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
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-xs font-semibold text-[var(--ap-text-primary)]">
          {title}
        </span>
        <span className="text-[10px] text-[var(--ap-text-secondary)] leading-snug">
          {description}
        </span>
      </div>
      <Toggle checked={checked} onChange={() => onChange(!checked)} />
    </div>
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
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-xs font-semibold text-[var(--ap-text-primary)]">
          {title}
        </span>
        <span className="text-[10px] text-[var(--ap-text-secondary)] leading-snug">
          {description}
        </span>
      </div>
      <NumberInput
        value={value}
        onChange={(v) => {
          if (typeof v === "number") onChange(v);
        }}
        min={1}
        max={1_000_000}
        size="xs"
        w={80}
        styles={{
          input: {
            height: 26,
            fontSize: 11,
            textAlign: "right",
            borderColor: "var(--ap-border)",
            borderRadius: 4,
            background: "var(--ap-bg-base)",
            color: "var(--ap-text-primary)",
          },
        }}
      />
    </div>
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
  /** When true, shows a "coming soon" overlay over the settings */
  comingSoon?: boolean;
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
  comingSoon = false,
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
      {comingSoon && (
        <div className="flex items-center gap-2 px-3 py-2 mb-1 rounded-md bg-[var(--ap-bg-card)] border border-[var(--ap-border)]">
          <IconClock size={14} className="text-[var(--color-brand)] shrink-0" />
          <span className="text-[11px] text-[var(--ap-text-secondary)] leading-snug">
            App settings are <span className="font-semibold text-[var(--ap-text-primary)]">coming soon</span> and aren't enforced yet. You can save defaults now and they'll apply once available.
          </span>
        </div>
      )}
      <div className={`flex-1 min-h-0 overflow-y-auto pr-1.5 relative ${comingSoon ? "pointer-events-none" : ""}`}>
        {comingSoon && (
          <div className="absolute inset-0 bg-[var(--ap-bg-base)]/60 z-10 rounded-md" />
        )}
        <div className="flex flex-col gap-3">
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
        </div>
      </div>

      <PrimaryButton onClick={onSave} disabled={saving} loading={saving}>
        {saving ? "Saving..." : comingSoon ? "Save & connect" : "Save settings"}
      </PrimaryButton>
    </>
  );
}
