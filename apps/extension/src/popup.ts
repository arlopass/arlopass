import { normalizeWalletSnapshot } from "./ui/popup-state.js";
import { renderWalletView } from "./ui/popup-render.js";

type WalletActionPayload = Record<string, string>;

type WalletActionResponse =
  | { ok: true; data?: unknown }
  | { ok: false; errorCode: string; message: string };

async function loadWalletSnapshot(): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        "byom.wallet.providers.v1",
        "byom.wallet.activeProvider.v1",
        "byom.wallet.ui.lastError.v1",
      ],
      (result) => {
        resolve(result as Record<string, unknown>);
      },
    );
  });
}

async function sendWalletAction(
  action: string,
  payload: WalletActionPayload,
): Promise<WalletActionResponse> {
  const requestId = `req.popup.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const response = (await chrome.runtime.sendMessage({
    channel: "byom.wallet",
    action,
    requestId,
    payload,
  })) as WalletActionResponse;
  return response;
}

async function refreshPopup(container: HTMLElement): Promise<void> {
  try {
    const raw = await loadWalletSnapshot();
    const snapshot = normalizeWalletSnapshot(raw);

    if (snapshot.warnings.length > 0) {
      console.warn("BYOM Wallet: snapshot warnings", snapshot.warnings);
    }

    container.innerHTML = renderWalletView({
      providers: snapshot.providers,
      activeProvider: snapshot.activeProvider,
      warnings: snapshot.warnings,
      lastError: snapshot.lastError,
    });

    bindProviderActions(container);
  } catch (err) {
    console.error("BYOM Wallet: failed to load wallet state", err);
    container.innerHTML = `<div class="error-banner" role="alert"><span class="error-banner__icon" aria-hidden="true">&#9888;</span><span class="error-banner__message">Failed to load wallet state. Please try again.</span></div>`;
  }
}

function showInlineError(container: HTMLElement, message: string, code: string): void {
  const existing = container.querySelector(".error-banner");
  if (existing !== null) {
    existing.remove();
  }
  const banner = document.createElement("div");
  banner.className = "error-banner";
  banner.setAttribute("role", "alert");
  banner.setAttribute("aria-live", "polite");
  banner.innerHTML = `<span class="error-banner__icon" aria-hidden="true">&#9888;</span><span class="error-banner__message">${message}</span><span class="error-banner__code">[${code}]</span>`;
  container.prepend(banner);
}

function bindProviderActions(container: HTMLElement): void {
  container.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const btn = target.closest("[data-action]") as HTMLElement | null;
    if (btn === null) return;

    const action = btn.dataset["action"];
    const providerId = btn.dataset["providerId"];

    if (action === "revokeProvider" && providerId !== undefined) {
      void sendWalletAction("wallet.revokeProvider", { providerId }).then((resp) => {
        if (resp.ok) {
          void refreshPopup(container);
        } else {
          showInlineError(container, resp.message, resp.errorCode);
        }
      });
    } else if (action === "setActiveProvider" && providerId !== undefined) {
      void sendWalletAction("wallet.setActiveProvider", { providerId }).then((resp) => {
        if (resp.ok) {
          void refreshPopup(container);
        } else {
          showInlineError(container, resp.message, resp.errorCode);
        }
      });
    }
  });

  container.addEventListener("change", (event) => {
    const target = event.target as HTMLSelectElement;
    if (!target.classList.contains("model-select")) return;
    const providerId = target.dataset["providerId"];
    const modelId = target.value;
    if (providerId !== undefined && modelId.length > 0) {
      void sendWalletAction("wallet.setActiveModel", { providerId, modelId }).then((resp) => {
        if (resp.ok) {
          void refreshPopup(container);
        } else {
          showInlineError(container, resp.message, resp.errorCode);
          // Deny-safe: reload original state on failure
          void refreshPopup(container);
        }
      });
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("wallet-content");
  if (container === null) {
    console.error("BYOM Wallet: popup container #wallet-content not found");
    return;
  }

  void refreshPopup(container);

  document.getElementById("btn-connect-provider")?.addEventListener("click", () => {
    void sendWalletAction("wallet.openConnectFlow", {}).then((resp) => {
      if (!resp.ok) {
        showInlineError(container, resp.message, resp.errorCode);
      }
    });
  });

  document.getElementById("btn-open-dashboard")?.addEventListener("click", () => {
    void sendWalletAction("wallet.openConnectFlow", {}).then((resp) => {
      if (!resp.ok) {
        showInlineError(container, resp.message, resp.errorCode);
      }
    });
  });
});
