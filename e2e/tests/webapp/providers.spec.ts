import { test, expect } from "@playwright/test";
import { ExamplesAppPage } from "../../pages/examples-app.page";
import { attachDebugOnFailure } from "../../helpers/debug-on-failure";

test.describe("Web App – Provider Scenarios", () => {
    let app: ExamplesAppPage;

    test.beforeEach(async ({ page }) => {
        app = new ExamplesAppPage(page);
        await app.goto();

        // Connect with mock transport before each test
        await app.selectTransportProfile("Mock");
        await app.connect();
        await app.waitForFeedback("Connected");
    });

    test.afterEach(async ({ }, testInfo) => {
        await attachDebugOnFailure(app?.page, testInfo);
    });

    // ── List providers ──

    test("lists providers from mock transport", async () => {
        await app.listProviders();
        await app.waitForFeedback("Providers loaded");

        // Provider dropdown should now be populated
        await app.providerSelect.click();
        const optionCount = await app.page.getByRole("option").count();
        expect(optionCount).toBeGreaterThan(0);
    });

    test("auto-selects first provider and model", async () => {
        await app.listProviders();
        await app.waitForFeedback("Providers loaded");

        // Provider should have a value selected
        const providerValue = await app.providerSelect.inputValue();
        expect(providerValue).toBeTruthy();
    });

    // ── Select provider ──

    test("confirms provider selection", async () => {
        await app.listProviders();
        await app.waitForFeedback("Providers loaded");

        await app.clickSelectProvider();
        await app.waitForFeedback("Provider selected");
    });

    // ── Event log ──

    test("generates log entries for provider operations", async () => {
        await app.listProviders();
        await app.waitForFeedback("Providers loaded");

        // Log should have entries
        await expect(app.page.getByText("Fetched provider list")).toBeVisible();
    });
});
