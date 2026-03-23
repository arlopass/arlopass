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
  const alertIcon = `
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
      <path
        d="M12 9v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3Z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>`;

  return `<div class="error-banner" role="alert" aria-live="polite">
      <span class="error-banner__icon" aria-hidden="true">${alertIcon}</span>
      <span class="error-banner__message">${escapeHtml(error.message)}</span>
      <span class="error-banner__code">[${escapeHtml(error.code)}]</span>
    </div>`;
}

function renderEmptyState(): string {
  const plugIcon = `
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
      <path
        d="M12 22v-5M9 8V2M15 8V2M18 8h1a2 2 0 0 1 2 2v1a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-1a2 2 0 0 1 2-2h1"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>`;

  return `<article class="empty-state" role="status">
      <div class="empty-state__icon" aria-hidden="true">${plugIcon}</div>
      <h2 class="empty-state__title">No providers connected</h2>
      <p class="empty-state__subtitle">Connect an AI provider to get started.</p>
    </article>`;
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
