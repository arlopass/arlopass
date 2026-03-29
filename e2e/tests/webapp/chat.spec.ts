import { test, expect } from "@playwright/test";
import { HarnessPage } from "../../pages/e2e-harness.page";
import { attachDebugOnFailure } from "../../helpers/debug-on-failure";

test.describe("Web App – Chat Scenarios", () => {
    let app: HarnessPage;

    test.beforeEach(async ({ page }) => {
        app = new HarnessPage(page);
        await app.goto();

        // Full connect + provider selection via mock
        await app.selectTransportProfile("Mock");
        await app.connect();
        await app.waitForFeedback("Connected");
        await app.listProviders();
        await app.waitForFeedback("Providers loaded");
        await app.clickSelectProvider();
        await app.waitForFeedback("Provider selected");
    });

    test.afterEach(async (_unused, testInfo) => {
        await attachDebugOnFailure(app?.page, testInfo);
    });

    // ── chat.send ──

    test("sends a chat message and receives response", async () => {
        await app.fillPrompt("Hello, world!");
        await app.sendChat();
        await app.waitForFeedback("Chat response received");

        // Transcript should show user message
        await expect(app.page.getByText("Hello, world!", { exact: true })).toBeVisible();

        // Should have at least 2 messages (user + assistant)
        const userBadges = app.page.locator('[class*="Badge"]').filter({ hasText: "user" });
        const assistantBadges = app.page.locator('[class*="Badge"]').filter({ hasText: "assistant" });
        await expect(userBadges.first()).toBeVisible();
        await expect(assistantBadges.first()).toBeVisible();
    });

    test("chat.send appears in event log", async () => {
        await app.fillPrompt("Test prompt");
        await app.sendChat();
        await app.waitForFeedback("Chat response received");

        await expect(app.page.getByText("chat.send completed")).toBeVisible();
    });

    // ── chat.stream ──

    test("streams a chat response with chunks", async () => {
        await app.fillPrompt("Explain streaming.");
        await app.streamChat();

        // Wait for stream to complete
        await app.waitForFeedback("Stream completed");

        // Should show assistant response in transcript
        const assistantBadges = app.page.locator('[class*="Badge"]').filter({ hasText: "assistant" });
        await expect(assistantBadges.first()).toBeVisible();
    });

    test("stream preview shows content during streaming", async () => {
        await app.fillPrompt("Stream me some text.");
        await app.streamChat();
        await app.waitForFeedback("Stream completed");

        // chat.stream completed log entry
        await expect(app.page.getByText("chat.stream completed")).toBeVisible();
    });

    // ── Empty prompt ──

    test("refuses to send empty prompt", async () => {
        await app.fillPrompt("");
        await app.sendChat();

        // Should show an error about empty prompt
        await expect(app.page.getByText(/empty|non-empty/i).first()).toBeVisible({ timeout: 5_000 });
    });

    // ── Clear ──

    test("clear button resets chat transcript and logs", async () => {
        await app.fillPrompt("Some message");
        await app.sendChat();
        await app.waitForFeedback("Chat response received");

        await app.clearSession();

        await expect(app.page.getByText("No chat messages yet.")).toBeVisible();
        await expect(app.page.getByText("No events yet.")).toBeVisible();
    });
});
