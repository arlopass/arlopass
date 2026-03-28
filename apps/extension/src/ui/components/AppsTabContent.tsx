import { useEffect, useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { MetadataDivider } from "./MetadataDivider.js";
import { PrimaryButton } from "./PrimaryButton.js";
import {
  loadApps,
  removeApp,
  type ConnectedApp,
} from "./app-connect/app-storage.js";
import { useVaultContext } from "../hooks/VaultContext.js";
import { staggerDelay } from "./animation-utils.js";

function formatAge(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${String(mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${String(days)}d ago`;
  if (days < 30)
    return `${String(Math.floor(days / 7))} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  return `${String(months)} month${months > 1 ? "s" : ""} ago`;
}

function extractDomain(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}

export function AppsTabContent() {
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [loading, setLoading] = useState(true);
  const { sendVaultMessage } = useVaultContext();

  useEffect(() => {
    void loadApps(sendVaultMessage).then((loaded) => {
      setApps(loaded);
      setLoading(false);
    });
  }, [sendVaultMessage]);

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1.5">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-[var(--ap-text-secondary)]">
              Loading…
            </span>
          </div>
        )}
        {!loading && apps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2 animate-fade-in">
            <span className="text-xs font-medium text-[var(--ap-text-primary)]">
              Connected Apps
            </span>
            <span className="text-[10px] text-[var(--ap-text-secondary)] text-center max-w-[280px]">
              Apps that connect to your wallet will appear here. Visit a web app
              that uses Arlopass to get started.
            </span>
          </div>
        )}
        {!loading && apps.length > 0 && (
          <div className="flex flex-col gap-2">
            {apps.map((app, i) => (
              <AppCard
                key={app.id}
                app={app}
                index={i}
                onRemove={(origin) => void removeApp(origin, sendVaultMessage)}
              />
            ))}
          </div>
        )}
      </div>
      <PrimaryButton>Manage apps</PrimaryButton>
    </>
  );
}

function AppCard({
  app,
  index = 0,
  onRemove,
}: {
  app: ConnectedApp;
  index?: number;
  onRemove: (origin: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="w-full bg-[var(--ap-bg-surface)] border border-[var(--ap-border)] rounded-md overflow-hidden transition-all duration-250 hover:border-[var(--ap-border-strong)] animate-fade-in-up"
      style={staggerDelay(index, 80)}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center justify-between w-full px-3 py-2.5 bg-transparent border-none cursor-pointer gap-3 text-left"
      >
        {app.iconUrl ? (
          <img
            src={app.iconUrl}
            alt=""
            width={28}
            height={28}
            className="rounded-md shrink-0"
          />
        ) : (
          <div className="w-7 h-7 rounded-md bg-[var(--ap-brand-subtle)] flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-[var(--color-brand)]">
              {app.displayName[0]?.toUpperCase() ?? "A"}
            </span>
          </div>
        )}
        <div className="flex flex-col gap-0 overflow-hidden min-w-0 flex-1">
          <div className="flex items-center gap-1 overflow-hidden">
            <span className="text-xs font-semibold text-[var(--ap-text-primary)] truncate">
              {app.displayName}
            </span>
            <span className="text-[10px] text-[var(--ap-text-secondary)] truncate shrink-0">
              ({extractDomain(app.origin)})
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-hidden truncate">
            {app.description && (
              <>
                <span className="text-[10px] font-medium text-[var(--ap-text-secondary)] truncate whitespace-nowrap">
                  {app.description}
                </span>
                <MetadataDivider />
              </>
            )}
            <span className="text-[10px] font-medium text-[var(--ap-text-secondary)] whitespace-nowrap">
              {app.status === "active" ? "Full permissions" : "Disabled"}
            </span>
            <MetadataDivider />
            <span className="text-[10px] font-medium text-[var(--ap-text-secondary)] whitespace-nowrap">
              Last used {formatAge(app.lastUsedAt)}
            </span>
          </div>
        </div>
        <IconChevronDown
          size={16}
          className={`text-[var(--ap-text-secondary)] shrink-0 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
          aria-hidden
        />
      </button>

      <div
        className={`grid transition-all duration-300 ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.25, 1, 0.5, 1)" }}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3">
            <div className="h-px bg-[var(--ap-border)] mb-3" />
            <div className="flex flex-col gap-2">
              <div className="flex justify-between">
                <span className="text-[10px] text-[var(--ap-text-secondary)]">
                  Origin
                </span>
                <span className="text-[10px] font-medium text-[var(--ap-text-primary)] truncate max-w-[200px]">
                  {app.origin}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-[var(--ap-text-secondary)]">
                  Providers
                </span>
                <span className="text-[10px] font-medium text-[var(--ap-text-primary)]">
                  {app.enabledProviderIds.length} enabled
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-[var(--ap-text-secondary)]">
                  Models
                </span>
                <span className="text-[10px] font-medium text-[var(--ap-text-primary)]">
                  {app.enabledModelIds.length} enabled
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-[var(--ap-text-secondary)]">
                  Status
                </span>
                <span
                  className={`text-[10px] font-medium ${app.status === "active" ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}
                >
                  {app.status}
                </span>
              </div>
              <div className="flex gap-1.5 mt-1">
                <button
                  type="button"
                  onClick={() => onRemove(app.origin)}
                  className="px-1.5 py-0.5 text-[10px]! font-medium leading-tight text-[var(--color-danger)] bg-[var(--color-danger-subtle)] border border-[var(--color-danger)]/20 rounded-sm cursor-pointer hover:bg-[var(--color-danger)] hover:text-[var(--ap-text-primary)] transition-all duration-150 active:scale-95"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
