import type { WalletProvider, ActiveProviderRef, WalletError } from "./popup-state.js";

export type WalletViewModel = {
  providers: WalletProvider[];
  activeProvider: ActiveProviderRef | null;
  warnings: string[];
  lastError?: WalletError | null;
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderStatusChip(status: WalletProvider["status"]): string {
  const labels: Record<WalletProvider["status"], string> = {
    connected: "Connected",
    disconnected: "Disconnected",
    attention: "Needs Attention",
  };
  return `<span class="status-chip status-chip--${escapeHtml(status)}">${labels[status]}</span>`;
}

function renderModelSelect(provider: WalletProvider, activeModelId: string | undefined): string {
  if (provider.models.length === 0) return "";
  const options = provider.models
    .map(
      (m) =>
        `<option value="${escapeHtml(m.id)}"${m.id === activeModelId ? " selected" : ""}>${escapeHtml(m.name)}</option>`,
    )
    .join("\n");
  return `<div class="provider-card__model-row">
      <label class="sr-only" for="model-select-${escapeHtml(provider.id)}">Model for ${escapeHtml(provider.name)}</label>
      <select
        id="model-select-${escapeHtml(provider.id)}"
        class="model-select"
        data-provider-id="${escapeHtml(provider.id)}"
        aria-label="Select model for ${escapeHtml(provider.name)}"
      >${options}</select>
    </div>`;
}

function renderProviderCard(
  provider: WalletProvider,
  isActive: boolean,
  activeModelId: string | undefined,
): string {
  const activeBadge = isActive
    ? `<span class="active-badge" aria-label="Active provider">Active</span>`
    : "";
  const setActiveBtn = !isActive
    ? `<button class="btn btn--secondary btn--small" data-action="setActiveProvider" data-provider-id="${escapeHtml(provider.id)}" aria-label="Set ${escapeHtml(provider.name)} as active">Set Active</button>`
    : "";
  const revokeBtn = `<button class="btn btn--danger btn--small" data-action="revokeProvider" data-provider-id="${escapeHtml(provider.id)}" aria-label="Revoke ${escapeHtml(provider.name)}">Revoke</button>`;

  return `<div class="provider-card${isActive ? " provider-card--active" : ""}" data-provider-id="${escapeHtml(provider.id)}">
      <div class="provider-card__header">
        <span class="provider-card__name">${escapeHtml(provider.name)}</span>
        ${renderStatusChip(provider.status)}${activeBadge}
      </div>
      ${renderModelSelect(provider, isActive ? activeModelId : undefined)}
      <div class="provider-card__actions">${setActiveBtn}${revokeBtn}</div>
    </div>`;
}

function renderErrorBanner(error: WalletError): string {
  return `<div class="error-banner" role="alert" aria-live="polite">
      <span class="error-banner__icon" aria-hidden="true">&#9888;</span>
      <span class="error-banner__message">${escapeHtml(error.message)}</span>
      <span class="error-banner__code">[${escapeHtml(error.code)}]</span>
    </div>`;
}

function renderEmptyState(): string {
  return `<div class="empty-state" role="status">
      <div class="empty-state__icon" aria-hidden="true">&#128268;</div>
      <p class="empty-state__title">No providers connected</p>
      <p class="empty-state__subtitle">Connect an AI provider to get started.</p>
    </div>`;
}

export function renderWalletView(model: WalletViewModel): string {
  const { providers, activeProvider, lastError } = model;
  const activeProviderId = activeProvider?.providerId;
  const activeModelId = activeProvider?.modelId;

  const errorBannerHtml = lastError != null ? renderErrorBanner(lastError) : "";

  const providerListHtml =
    providers.length === 0
      ? renderEmptyState()
      : providers
          .map((p) =>
            renderProviderCard(
              p,
              p.id === activeProviderId,
              p.id === activeProviderId ? activeModelId : undefined,
            ),
          )
          .join("\n");

  const warningCountHtml =
    model.warnings.length > 0
      ? `<p class="warning-count" aria-live="polite">${model.warnings.length} record(s) skipped due to invalid format.</p>`
      : "";

  return `${errorBannerHtml}<section class="provider-list" aria-label="Connected providers">
      ${providerListHtml}
    </section>${warningCountHtml}`;
}
