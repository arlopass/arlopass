import { test, expect } from "@playwright/test";
import { HarnessPage } from "../../pages/e2e-harness.page";
import { attachDebugOnFailure } from "../../helpers/debug-on-failure";

test.describe("Web App – Connection Lifecycle", () => {
    let app: HarnessPage;

    test.beforeEach(async ({ page }) => {
        app = new HarnessPage(page);
        await app.goto();
    });

    test.afterEach(async (_unused, testInfo) => {
        await attachDebugOnFailure(app?.page, testInfo);
    });

    // ── Page load ──

    test("renders app header and title", async () => {
        await expect(app.heading).toBeVisible();
    });

    test("shows DISCONNECTED badge on load", async () => {
        await expect(app.page.getByText("DISCONNECTED", { exact: true })).toBeVisible();
    });

    test("shows extension not detected alert (no extension loaded)", async () => {
        await expect(app.extensionMissingAlert).toBeVisible();
    });

    test("renders all three tabs", async () => {
        await expect(app.playgroundTab).toBeVisible();
        await expect(app.scenarioCatalogTab).toBeVisible();
        await expect(app.snippetTab).toBeVisible();
    });

    // ── Transport profiles ──

    test("transport profile dropdown has all options", async () => {
        await app.transportProfileSelect.click();

        await expect(app.page.getByRole("option", { name: /Auto/i })).toBeVisible();
        await expect(app.page.getByRole("option", { name: /Injected/i })).toBeVisible();
        await expect(app.page.getByRole("option", { name: /Mock/i })).toBeVisible();
        await expect(app.page.getByRole("option", { name: /Slow/i })).toBeVisible();
        await expect(app.page.getByRole("option", { name: /Failure/i })).toBeVisible();
    });

    // ── Connect with mock transport ──

    test("connects with mock transport", async () => {
        await app.selectTransportProfile("Mock");
        await app.connect();
        await app.waitForFeedback("Connected");

        await expect(app.page.getByText("CONNECTED", { exact: true })).toBeVisible();
    });

    test("shows session ID after connecting", async () => {
        await app.selectTransportProfile("Mock");
        await app.connect();
        await app.waitForFeedback("Connected");

        // Session code element should no longer say N/A
        await expect(app.page.locator("code").filter({ hasText: "N/A" })).toHaveCount(0);
    });

    // ── Disconnect ──

    test("disconnects and clears session state", async () => {
        await app.selectTransportProfile("Mock");
        await app.connect();
        await app.waitForFeedback("Connected");

        await app.disconnect();
        await app.waitForFeedback("Disconnected");

        await expect(app.page.getByText("DISCONNECTED", { exact: true })).toBeVisible();
    });

    // ── Auto mode falls back to mock ──

    test("auto mode falls back to mock when extension not available", async () => {
        // Auto is the default; without extension it should use mock
        await app.connect();
        await app.waitForFeedback("Connected");

        // Should show fallback warning
        await expect(
            app.page.getByText(/demo|mock|fallback/i).first(),
        ).toBeVisible();
    });

    // ── Injected mode fails without extension ──

    test("injected mode fails without extension loaded", async () => {
        await app.selectTransportProfile("Injected");
        await app.connect();

        await expect(app.page.getByText(/failed|error|unavailable/i).first()).toBeVisible({ timeout: 10_000 });
    });
});
