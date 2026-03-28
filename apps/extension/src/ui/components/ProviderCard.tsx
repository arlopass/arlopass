import { useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { ProviderAvatar } from "./ProviderAvatar.js";
import { MetadataDivider } from "./MetadataDivider.js";
import { staggerDelay } from "./animation-utils.js";

const STATUS_LABELS: Record<string, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  attention: "Attention",
  reconnecting: "Reconnecting",
  failed: "Failed",
  revoked: "Revoked",
  degraded: "Degraded",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function statusColor(status: string): string {
  if (status === "connected") return "var(--color-success)";
  if (
    status === "attention" ||
    status === "degraded" ||
    status === "reconnecting"
  )
    return "var(--color-warning)";
  if (status === "failed" || status === "revoked" || status === "disconnected")
    return "var(--color-danger)";
  return "var(--ap-text-secondary)";
}

function statusDotColor(status: string): string {
  if (status === "connected") return "bg-[var(--color-success)]";
  if (
    status === "attention" ||
    status === "degraded" ||
    status === "reconnecting"
  )
    return "bg-[var(--color-warning)]";
  if (status === "failed" || status === "revoked" || status === "disconnected")
    return "bg-[var(--color-danger)]";
  return "bg-[var(--ap-text-tertiary)]";
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

export type ProviderCardData = {
  id: string;
  name: string;
  providerKey: string;
  status: string;
  modelsAvailable: number;
  providerType: string;
};

export type ProviderCardProps = {
  provider: ProviderCardData;
  tokenUsage?: number | undefined;
  onClick?: ((providerId: string) => void) | undefined;
  onRemove?: ((providerId: string) => void) | undefined;
  onEdit?: ((providerId: string) => void) | undefined;
  index?: number | undefined;
};

/**
 * Provider card with expand/collapse, matching the ConnectProviders preview style.
 * Features staggered fade-in, smooth expand, and status indicator dot.
 */
export function ProviderCard({
  provider,
  tokenUsage,
  onClick: _onClick,
  onRemove,
  onEdit,
  index = 0,
}: ProviderCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="w-full bg-[var(--ap-bg-surface)] border border-[var(--ap-border)] rounded-md overflow-hidden transition-all duration-250 hover:border-[var(--ap-border-strong)] animate-fade-in-up"
      style={staggerDelay(index, 80)}
    >
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center justify-between w-full px-3 py-2.5 bg-transparent border-none cursor-pointer text-left gap-3"
      >
        <div className="flex items-center gap-2.5 overflow-hidden flex-1 min-w-0">
          <ProviderAvatar providerKey={provider.providerKey} size={24} />
          <div className="flex flex-col gap-0 overflow-hidden min-w-0">
            <span className="text-xs font-semibold text-[var(--ap-text-primary)] leading-normal truncate">
              {provider.name}
            </span>
            <div className="flex items-center gap-2 overflow-hidden truncate">
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotColor(provider.status)}`}
                />
                <span
                  className="text-[10px] font-medium whitespace-nowrap"
                  style={{ color: statusColor(provider.status) }}
                >
                  {statusLabel(provider.status)}
                </span>
              </div>
              <MetadataDivider />
              <span className="text-[10px] font-medium text-[var(--ap-text-secondary)] whitespace-nowrap">
                {provider.modelsAvailable}{" "}
                {provider.modelsAvailable === 1 ? "model" : "models"}
              </span>
              {tokenUsage != null && tokenUsage > 0 && (
                <>
                  <MetadataDivider />
                  <span className="text-[10px] font-medium text-[var(--ap-text-secondary)] whitespace-nowrap">
                    {formatTokenCount(tokenUsage)} tokens
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <IconChevronDown
          size={16}
          className={`text-[var(--ap-text-secondary)] shrink-0 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
          aria-hidden
        />
      </button>

      {/* Expanded detail */}
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
                  Status
                </span>
                <span
                  className="text-[10px] font-medium"
                  style={{ color: statusColor(provider.status) }}
                >
                  {statusLabel(provider.status)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-[var(--ap-text-secondary)]">
                  Type
                </span>
                <span className="text-[10px] font-medium text-[var(--ap-text-primary)]">
                  {provider.providerType}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-[var(--ap-text-secondary)]">
                  Models
                </span>
                <span className="text-[10px] font-medium text-[var(--ap-text-primary)]">
                  {provider.modelsAvailable} available
                </span>
              </div>
              {tokenUsage != null && tokenUsage > 0 && (
                <div className="flex justify-between">
                  <span className="text-[10px] text-[var(--ap-text-secondary)]">
                    Token usage
                  </span>
                  <span className="text-[10px] font-medium text-[var(--ap-text-primary)]">
                    {formatTokenCount(tokenUsage)}
                  </span>
                </div>
              )}
              <div className="flex gap-1.5 mt-1">
                {onEdit != null && (
                  <button
                    type="button"
                    onClick={() => onEdit(provider.id)}
                    className="px-1.5 py-0.5 text-[10px]! font-medium leading-tight text-[var(--ap-text-secondary)] bg-[var(--ap-bg-elevated)] border border-[var(--ap-border)] rounded-sm cursor-pointer hover:text-[var(--ap-text-primary)] hover:border-[var(--ap-border-strong)] transition-all duration-150 active:scale-95"
                  >
                    Edit
                  </button>
                )}
                {onRemove != null && (
                  <button
                    type="button"
                    onClick={() => onRemove(provider.id)}
                    className="px-1.5 py-0.5 text-[10px]! font-medium leading-tight text-[var(--color-danger)] bg-[var(--color-danger-subtle)] border border-[var(--color-danger)]/20 rounded-sm cursor-pointer hover:bg-[var(--color-danger)] hover:text-[var(--ap-text-primary)] transition-all duration-150 active:scale-95"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
