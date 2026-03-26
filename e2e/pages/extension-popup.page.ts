import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for the BYOM Wallet extension popup (`popup.html`).
 *
 * Selectors derive from the static HTML in `popup.html` and the
 * dynamically-rendered output of `renderWalletView()`.
 */
export class ExtensionPopupPage {
    readonly page: Page;

    // ── Static elements from popup.html ──
    readonly header: Locator;
    readonly title: Locator;
    readonly statusChip: Locator;
    readonly walletContent: Locator;
    readonly connectProviderBtn: Locator;
    readonly openDashboardBtn: Locator;
    readonly securityFooter: Locator;

    // ── Dynamic elements rendered by popup-render.ts ──
    readonly providerList: Locator;
    readonly emptyState: Locator;
    readonly errorBanner: Locator;
    readonly warningCount: Locator;

    constructor(page: Page) {
        this.page = page;

        // Static popup shell
        this.header = page.locator(".popup-header");
        this.title = page.locator(".popup-header__title");
        this.statusChip = page.locator("#wallet-status");
        this.walletContent = page.locator("#wallet-content");
        this.connectProviderBtn = page.locator("#btn-connect-provider");
        this.openDashboardBtn = page.locator("#btn-open-dashboard");
        this.securityFooter = page.locator(".security-footer");

        // Dynamic wallet view
        this.providerList = page.locator(".provider-list");
        this.emptyState = page.locator(".empty-state");
        this.errorBanner = page.locator(".error-banner");
        this.warningCount = page.locator(".warning-count");
    }

    async goto(extensionId: string): Promise<void> {
        await this.page.goto(`chrome-extension://${extensionId}/popup.html`);
    }

    // ── Provider cards ──

    providerCard(providerId: string): Locator {
        return this.page.locator(`.provider-card[data-provider-id="${providerId}"]`);
    }

    allProviderCards(): Locator {
        return this.page.locator(".provider-card");
    }

    providerName(providerId: string): Locator {
        return this.providerCard(providerId).locator(".provider-card__name");
    }

    providerStatusChip(providerId: string): Locator {
        return this.providerCard(providerId).locator(".status-chip");
    }

    providerActiveBadge(providerId: string): Locator {
        return this.providerCard(providerId).locator(".active-badge");
    }

    setActiveButton(providerId: string): Locator {
        return this.providerCard(providerId).locator('[data-action="setActiveProvider"]');
    }

    revokeButton(providerId: string): Locator {
        return this.providerCard(providerId).locator('[data-action="revokeProvider"]');
    }

    modelSelect(providerId: string): Locator {
        return this.providerCard(providerId).locator(".model-select");
    }

    // ── Actions ──

    async setActiveProvider(providerId: string): Promise<void> {
        await this.setActiveButton(providerId).click();
    }

    async revokeProvider(providerId: string): Promise<void> {
        await this.revokeButton(providerId).click();
    }

    async selectModel(providerId: string, modelId: string): Promise<void> {
        await this.modelSelect(providerId).selectOption(modelId);
    }

    async clickConnectProvider(): Promise<void> {
        await this.connectProviderBtn.click();
    }

    async clickOpenDashboard(): Promise<void> {
        await this.openDashboardBtn.click();
    }
}
