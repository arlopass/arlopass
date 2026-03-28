import { useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import type { ProviderModel, ProviderStatus } from "../connectors/types.js";

type StoredProvider = {
  id: string;
  name: string;
  type: "local" | "cloud" | "cli";
  status: ProviderStatus;
  models: readonly ProviderModel[];
  lastSyncedAt?: number;
  metadata?: Record<string, string>;
};

type ActiveProviderRef = {
  providerId: string;
  modelId?: string;
};

const STATUS_LABELS: Record<string, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  attention: "Attention",
  reconnecting: "Reconnecting",
  failed: "Failed",
  revoked: "Revoked",
  degraded: "Degraded",
};

const STATUS_CLASSES: Record<string, string> = {
  connected: "bg-[var(--color-success-subtle)] text-[var(--color-success)]",
  disconnected: "bg-[var(--ap-bg-elevated)] text-[var(--ap-text-secondary)]",
  attention: "bg-[var(--color-warning-subtle)] text-[var(--color-warning)]",
  reconnecting: "bg-[var(--color-warning-subtle)] text-[var(--color-warning)]",
  failed: "bg-[var(--color-danger-subtle)] text-[var(--color-danger)]",
  revoked: "bg-[var(--color-danger-subtle)] text-[var(--color-danger)]",
  degraded: "bg-[var(--color-warning-subtle)] text-[var(--color-warning)]",
};

export type ProviderRowProps = {
  provider: StoredProvider;
  isActive: boolean;
  activeModelId?: string;
  onActivate: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onModelChange: (modelId: string) => void;
};

export function ProviderRow({
  provider,
  isActive,
  activeModelId,
  onActivate,
  onEdit,
  onRemove,
  onModelChange,
}: ProviderRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-[var(--ap-bg-surface)] border border-[var(--ap-border)] rounded-md overflow-hidden transition-all duration-250 hover:border-[var(--ap-border-strong)] animate-fade-in-up">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center justify-between w-full px-3 py-2.5 bg-transparent border-none cursor-pointer text-left gap-3"
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="flex flex-col min-w-0 overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--ap-text-primary)] truncate">
                {provider.name}
              </span>
              <span
                className={`px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide rounded-full shrink-0 ${STATUS_CLASSES[provider.status] ?? STATUS_CLASSES["disconnected"]}`}
              >
                {STATUS_LABELS[provider.status] ?? provider.status}
              </span>
              {isActive && (
                <span className="px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide rounded-full shrink-0 bg-[var(--ap-brand-subtle)] text-[var(--color-brand)]">
                  Active
                </span>
              )}
            </div>
            <span className="text-[10px] text-[var(--ap-text-tertiary)] truncate mt-0.5">
              {provider.type} · {provider.id}
            </span>
          </div>
        </div>
        <IconChevronDown
          size={16}
          className={`text-[var(--ap-text-secondary)] shrink-0 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
          aria-hidden
        />
      </button>

      {/* Expanded actions */}
      <div
        className={`grid transition-all duration-300 ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.25, 1, 0.5, 1)" }}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3">
            <div className="h-px bg-[var(--ap-border)] mb-3" />
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={onActivate}
                disabled={isActive}
                className="px-2 py-1 text-[10px]! font-semibold text-[var(--ap-text-secondary)] bg-[var(--ap-bg-elevated)] border border-[var(--ap-border)] rounded-sm cursor-pointer hover:text-[var(--ap-text-primary)] hover:border-[var(--ap-border-strong)] transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isActive ? "Active" : "Set Active"}
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="px-2 py-1 text-[10px]! font-semibold text-[var(--ap-text-secondary)] bg-[var(--ap-bg-elevated)] border border-[var(--ap-border)] rounded-sm cursor-pointer hover:text-[var(--ap-text-primary)] hover:border-[var(--ap-border-strong)] transition-all duration-150 active:scale-95"
              >
                Edit
              </button>

              {/* Model selector */}
              {provider.models.length > 0 && (
                <select
                  value={activeModelId ?? ""}
                  onChange={(e) => onModelChange(e.target.value)}
                  className="min-w-[140px] px-2 py-1 text-[10px] bg-[var(--ap-bg-base)] border border-[var(--ap-border)] rounded-sm text-[var(--ap-text-primary)] transition-[border-color] duration-200 focus:outline-none focus:border-[var(--color-brand)]"
                >
                  <option value="">Select model</option>
                  {provider.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={onRemove}
                className="px-2 py-1 text-[10px]! font-semibold text-[var(--color-danger)] bg-[var(--color-danger-subtle)] border border-[var(--color-danger)]/20 rounded-sm cursor-pointer hover:bg-[var(--color-danger)] hover:text-[var(--ap-text-primary)] transition-all duration-150 active:scale-95"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export type ProvidersListProps = {
  providers: readonly StoredProvider[];
  activeProvider: ActiveProviderRef | null;
  onActivate: (providerId: string) => void;
  onEdit: (provider: StoredProvider) => void;
  onRemove: (providerId: string) => void;
  onModelChange: (providerId: string, modelId: string) => void;
};

export function ProvidersList({
  providers,
  activeProvider,
  onActivate,
  onEdit,
  onRemove,
  onModelChange,
}: ProvidersListProps) {
  return (
    <div className="bg-[var(--ap-bg-surface)] border border-[var(--ap-border)] rounded-lg p-5 animate-fade-in">
      <h2 className="text-sm font-semibold text-[var(--ap-text-primary)] m-0">
        Connected Providers
      </h2>
      <p className="text-[10px] text-[var(--ap-text-secondary)] mt-1 mb-4">
        Manage active provider selection, edit saved settings, and remove stale
        connections.
      </p>

      <div className="flex flex-col gap-2">
        {providers.length === 0 && (
          <p className="text-xs text-[var(--ap-text-secondary)] m-0 py-4 text-center">
            No providers connected yet. Use the form to connect one.
          </p>
        )}
        {providers.map((provider) => {
          const isActive = activeProvider?.providerId === provider.id;
          const activeModelId = isActive ? activeProvider?.modelId : undefined;
          return (
            <ProviderRow
              key={provider.id}
              provider={provider}
              isActive={isActive}
              {...(activeModelId != null ? { activeModelId } : {})}
              onActivate={() => onActivate(provider.id)}
              onEdit={() => onEdit(provider)}
              onRemove={() => onRemove(provider.id)}
              onModelChange={(modelId) => onModelChange(provider.id, modelId)}
            />
          );
        })}
      </div>
    </div>
  );
}
