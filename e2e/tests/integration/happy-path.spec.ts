import { test, expect } from "../../fixtures/test";
import { ExtensionPopupPage } from "../../pages/extension-popup.page";
import { ExtensionOptionsPage } from "../../pages/extension-options.page";
import { HarnessPage } from "../../pages/e2e-harness.page";
import { clearWalletStorage } from "../../helpers/storage.helper";
import { attachContextDebugOnFailure } from "../../helpers/debug-on-failure";

/**
 * Full happy-path flow:
 *   1. Open extension popup ─ verify empty state
 *   2. Navigate to options ─ see connector form
 *   3. Web app connects via mock transport ─ chat works
 *
 * This test sequence validates the critical user journey without
 * requiring a live bridge or real credentials.
 */
test.describe("Full Happy Path", () => {
    const BASE_URL = "http://localhost:4173";

    test.afterEach(async ({ context }, testInfo) => {
        await attachContextDebugOnFailure(context, testInfo);
    });

    test("extension popup → options → webapp chat (mock)", async ({
        context,
        extensionId,
    }) => {
        // 1. Clean slate
        await clearWalletStorage(context);

        // 2. Popup: empty state
        const popupPage = await context.newPage();
        const popup = new ExtensionPopupPage(popupPage);
        await popup.goto(extensionId);
        await expect(popup.emptyState).toBeVisible();
        await expect(popup.connectProviderBtn).toBeVisible();
        await popupPage.close();

        // 3. Options: page loads and shows form
        const optionsPage = await context.newPage();
        const options = new ExtensionOptionsPage(optionsPage);
        await options.goto(extensionId);
        await expect(options.form).toBeVisible();
        await expect(options.connectorSelect).toBeVisible();
        await optionsPage.close();

        // 4. Web app: connect → list → select → chat
        const webPage = await context.newPage();
        await webPage.goto(BASE_URL);
        await webPage.waitForLoadState("networkidle");

        const app = new HarnessPage(webPage);
        await app.selectTransportProfile("Mock");
        await app.connect();
        await app.waitForFeedback("Connected");

        await app.listProviders();
        await app.waitForFeedback("Providers loaded");

        await app.clickSelectProvider();
        await app.waitForFeedback("Provider selected");

        await app.fillPrompt("E2E test message");
        await app.sendChat();
        await app.waitForFeedback("Chat response received");

        // Verify user message in transcript
        await expect(webPage.getByText("E2E test message")).toBeVisible();

        // Verify assistant responded
        const assistantBadges = webPage
            .locator('[class*="Badge"]')
            .filter({ hasText: "assistant" });
        await expect(assistantBadges.first()).toBeVisible();
    });

    test("happy-path button runs the full scenario in one click", async ({
        context,
    }) => {
        const webPage = await context.newPage();
        await webPage.goto(BASE_URL);
        await webPage.waitForLoadState("networkidle");

        const app = new HarnessPage(webPage);
        await app.selectTransportProfile("Mock");
        await app.runHappyPath();
        await app.waitForFeedback("Chat response received");

        await expect(webPage.getByText("CONNECTED", { exact: true })).toBeVisible();
    });
});
