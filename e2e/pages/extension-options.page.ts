import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for the Arlopass Wallet options / Connect Provider page (`options.html`).
 */
export class ExtensionOptionsPage {
    readonly page: Page;

    // ── Header ──
    readonly headerTitle: Locator;

    // ── Provider connection form ──
    readonly form: Locator;
    readonly connectorSelect: Locator;
    readonly displayNameInput: Locator;
    readonly connectorFieldsContainer: Locator;
    readonly testConnectionBtn: Locator;
    readonly saveProviderBtn: Locator;
    readonly cancelEditBtn: Locator;
    readonly editStateMessage: Locator;
    readonly securityNote: Locator;

    // ── Bridge pairing ──
    readonly bridgeHostNameInput: Locator;
    readonly beginPairingBtn: Locator;
    readonly refreshPairingsBtn: Locator;
    readonly pairingCodeInput: Locator;
    readonly completePairingBtn: Locator;
    readonly rotatePairingBtn: Locator;
    readonly pairingHandleSelect: Locator;
    readonly revokePairingBtn: Locator;

    // ── Status / Feedback ──
    readonly statusMessage: Locator;
    readonly errorBanner: Locator;

    constructor(page: Page) {
        this.page = page;

        this.headerTitle = page.locator(".options-header__title");

        // Form elements
        this.form = page.locator("#provider-connect-form");
        this.connectorSelect = page.locator("#provider-connector");
        this.displayNameInput = page.locator("#provider-display-name");
        this.connectorFieldsContainer = page.locator("#provider-connector-fields");
        this.testConnectionBtn = page.locator("#btn-test-connection");
        this.saveProviderBtn = page.locator("#btn-save-provider");
        this.cancelEditBtn = page.locator("#btn-cancel-edit-provider");
        this.editStateMessage = page.locator("#provider-edit-state");
        this.securityNote = page.locator(".options-form__security-note");

        // Bridge pairing
        this.bridgeHostNameInput = page.locator("#bridge-pair-host-name");
        this.beginPairingBtn = page.locator("#btn-begin-bridge-pairing");
        this.refreshPairingsBtn = page.locator("#btn-refresh-bridge-pairings");
        this.pairingCodeInput = page.locator("#bridge-pairing-code");
        this.completePairingBtn = page.locator("#btn-complete-bridge-pairing");
        this.rotatePairingBtn = page.locator("#btn-rotate-bridge-pairing");
        this.pairingHandleSelect = page.locator("#bridge-pairing-handle-select");
        this.revokePairingBtn = page.locator("#btn-revoke-bridge-pairing");

        // Feedback
        this.statusMessage = page.locator('[role="status"]');
        this.errorBanner = page.locator(".error-banner");
    }

    async goto(extensionId: string): Promise<void> {
        await this.page.goto(`chrome-extension://${extensionId}/options.html`);
    }

    // ── Connector selection ──

    async selectConnector(connectorId: string): Promise<void> {
        await this.connectorSelect.selectOption(connectorId);
    }

    async getSelectedConnector(): Promise<string> {
        return this.connectorSelect.inputValue();
    }

    // ── Dynamic connector fields ──

    connectorField(fieldKey: string): Locator {
        return this.connectorFieldsContainer.locator(
            `[name="${fieldKey}"], #connector-field-${fieldKey}`,
        );
    }

    async fillConnectorField(fieldKey: string, value: string): Promise<void> {
        const field = this.connectorField(fieldKey);
        const tagName = await field.evaluate((el) => el.tagName.toLowerCase());
        if (tagName === "select") {
            await field.selectOption(value);
        } else {
            await field.fill(value);
        }
    }

    /**
     * Fill all connector fields from a key-value map (e.g. from env credentials).
     */
    async fillConnectorFields(fields: Readonly<Record<string, string>>): Promise<void> {
        for (const [key, value] of Object.entries(fields)) {
            if (value.length > 0) {
                await this.fillConnectorField(key, value);
            }
        }
    }

    // ── Display name ──

    async fillDisplayName(name: string): Promise<void> {
        await this.displayNameInput.fill(name);
    }

    // ── Actions ──

    async clickTestConnection(): Promise<void> {
        await this.testConnectionBtn.click();
    }

    async clickSaveProvider(): Promise<void> {
        await this.saveProviderBtn.click();
    }

    async clickCancelEdit(): Promise<void> {
        await this.cancelEditBtn.click();
    }

    // ── Bridge pairing ──

    async fillBridgeHostName(name: string): Promise<void> {
        await this.bridgeHostNameInput.fill(name);
    }

    async clickBeginPairing(): Promise<void> {
        await this.beginPairingBtn.click();
    }

    async clickRefreshPairings(): Promise<void> {
        await this.refreshPairingsBtn.click();
    }

    async fillPairingCode(code: string): Promise<void> {
        await this.pairingCodeInput.fill(code);
    }

    async clickCompletePairing(): Promise<void> {
        await this.completePairingBtn.click();
    }

    async clickRotatePairing(): Promise<void> {
        await this.rotatePairingBtn.click();
    }

    async clickRevokePairing(): Promise<void> {
        await this.revokePairingBtn.click();
    }
}
