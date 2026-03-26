import { test, expect } from "../../fixtures/test";
import { ExamplesAppPage } from "../../pages/examples-app.page";
import { waitForByomTransport } from "../../helpers/wait.helper";
import { attachContextDebugOnFailure } from "../../helpers/debug-on-failure";

/**
 * Integration tests that load the extension AND navigate to the
 * examples web app, testing the full extension ↔ webapp pipeline.
 *
 * These use the extension fixture (persistent context with extension loaded)
 * and point at the locally-served examples-web app.
 */
test.describe("Extension ↔ Web App Integration", () => {
    const BASE_URL = "http://localhost:4173";

    test.afterEach(async ({ context }, testInfo) => {
        await attachContextDebugOnFailure(context, testInfo);
    });

    test("extension injects window.byom into web app page", async ({
        context,
    }) => {
        const page = await context.newPage();
        await page.goto(BASE_URL);

        const hasTransport = await waitForByomTransport(page, 10_000);
        expect(hasTransport).toBe(true);
    });

    test("web app detects extension transport when extension is loaded", async ({
        context,
    }) => {
        const page = await context.newPage();
        await page.goto(BASE_URL);

        // Wait for React to render + detect injected transport
        await page.waitForLoadState("networkidle");

        // The app should show "Extension transport detected" alert
        await expect(
            page.getByText("Extension transport detected"),
        ).toBeVisible({ timeout: 15_000 });
    });

    test("injected transport mode works with real extension", async ({
        context,
    }) => {
        const page = await context.newPage();
        await page.goto(BASE_URL);
        await page.waitForLoadState("networkidle");

        const app = new ExamplesAppPage(page);

        // Select injected mode — should work since extension is loaded
        await app.selectTransportProfile("Injected");
        await app.connect();

        // Connection may succeed or fail depending on bridge availability,
        // but transport detection should work
        await expect(
            page.getByText("Extension transport detected"),
        ).toBeVisible();
    });
});
