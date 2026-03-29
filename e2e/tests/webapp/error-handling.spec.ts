import { test, expect } from "@playwright/test";
import { HarnessPage } from "../../pages/e2e-harness.page";
import { attachDebugOnFailure } from "../../helpers/debug-on-failure";

test.describe("Web App – Error Handling", () => {
    let app: HarnessPage;

    test.beforeEach(async ({ page }) => {
        app = new HarnessPage(page);
        await app.goto();
    });

    test.afterEach(async (_unused, testInfo) => {
        await attachDebugOnFailure(app?.page, testInfo);
    });

    // ── Failure transport ──

    test("failure transport shows typed error on connect", async () => {
        await app.selectTransportProfile("Failure");
        await app.connect();

        // Should display error feedback
        await expect(app.page.getByText(/failed/i).first()).toBeVisible({ timeout: 15_000 });
    });

    test("failure transport logs error details", async () => {
        await app.selectTransportProfile("Failure");
        await app.connect();

        // Wait for error to appear in log
        await expect(app.page.getByText(/failed/i).first()).toBeVisible({ timeout: 15_000 });

        // Event log should have error entry
        const errorLogs = app.page.locator('[class*="Badge"]').filter({ hasText: "error" });
        await expect(errorLogs.first()).toBeVisible();
    });

    // ── Slow transport (timeout) ──

    test("slow transport triggers timeout error", async () => {
        await app.selectTransportProfile("Slow");
        await app.connect();

        // Should fail with timeout (the app sets 1.5s timeout for slow mode)
        await expect(app.page.getByText(/failed|timeout/i).first()).toBeVisible({ timeout: 20_000 });
    });

    // ── Operations without connection ──

    test("list providers without connection shows error", async () => {
        // Don't connect first
        await app.selectTransportProfile("Mock");
        await app.listProviders();

        await expect(app.page.getByText(/failed|Connect first/i).first()).toBeVisible({ timeout: 5_000 });
    });

    test("chat.send without connection shows error", async () => {
        await app.selectTransportProfile("Mock");
        await app.fillPrompt("test");
        await app.sendChat();

        await expect(app.page.getByText(/failed|Connect first/i).first()).toBeVisible({ timeout: 5_000 });
    });

    // ── Happy path scenario ──

    test("happy path scenario runs full flow automatically", async () => {
        await app.selectTransportProfile("Mock");
        await app.runHappyPath();

        // Should complete with chat response
        await app.waitForFeedback("Chat response received");

        // Should show connected state
        await expect(app.page.getByText("CONNECTED", { exact: true })).toBeVisible();

        // Should have chat messages in transcript
        const assistantBadges = app.page.locator('[class*="Badge"]').filter({ hasText: "assistant" });
        await expect(assistantBadges.first()).toBeVisible();
    });

    // ── Tabs ──

    test("scenario catalog tab renders content", async () => {
        await app.scenarioCatalogTab.click();

        // Should show scenario descriptions
        await expect(app.page.getByText(/SDK Happy Path|Streaming/i).first()).toBeVisible();
    });

    test("integration snippet tab renders code sample", async () => {
        await app.snippetTab.click();

        // Should show code content
        await expect(app.page.locator("pre").first()).toBeVisible();
    });
});
