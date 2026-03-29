import { test, expect } from "../../fixtures/test";
import { HarnessPage } from "../../pages/e2e-harness.page";
import { waitForArlopassTransport } from "../../helpers/wait.helper";
import { isLiveIntegrationEnabled } from "../../helpers/env-credentials";
import { attachContextDebugOnFailure } from "../../helpers/debug-on-failure";

/**
 * Live connectivity setup — must pass before any provider pipeline tests run.
 *
 * This is configured as a Playwright project dependency: the
 * "live-providers" project depends on "live-setup", so if this
 * fails, all provider pipeline tests are automatically skipped.
 */
test.describe("Live Connectivity Setup @live", () => {
    const BASE_URL = "http://localhost:4173";

    test.afterEach(async ({ context }, testInfo) => {
        await attachContextDebugOnFailure(context, testInfo);
    });

    test("extension ↔ bridge connectivity check", async ({ context }) => {
        test.skip(!isLiveIntegrationEnabled(), "Live integration disabled (set TEST_LIVE_INTEGRATION_ENABLED=true)");

        const page = await context.newPage();
        await page.goto(BASE_URL);
        await page.waitForLoadState("networkidle");

        const hasTransport = await waitForArlopassTransport(page, 10_000);
        expect(hasTransport).toBe(true);

        const app = new HarnessPage(page);
        await app.selectTransportProfile("Injected");
        await app.connect();

        await app.waitForFeedback("Connected");
        await expect(page.getByText("CONNECTED", { exact: true })).toBeVisible();
    });
});
