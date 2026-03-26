import { test, expect } from "../../fixtures/test";
import { waitForByomTransport } from "../../helpers/wait.helper";

test.describe("Content Script Injection", () => {
    test("injects window.byom on http pages", async ({ context }) => {
        const page = await context.newPage();
        await page.goto("https://example.com");

        const hasTransport = await waitForByomTransport(page, 5_000);
        expect(hasTransport).toBe(true);
    });

    test("window.byom has expected transport interface", async ({ context }) => {
        const page = await context.newPage();
        await page.goto("https://example.com");
        await waitForByomTransport(page, 5_000);

        const transportShape = await page.evaluate(() => {
            const byom = (window as unknown as Record<string, unknown>).byom as Record<string, unknown> | undefined;
            if (!byom) return null;
            return {
                hasRequest: typeof byom.request === "function",
                hasStream: typeof byom.stream === "function",
                hasDisconnect: typeof byom.disconnect === "function",
            };
        });

        expect(transportShape).not.toBeNull();
        expect(transportShape?.hasRequest).toBe(true);
        expect(transportShape?.hasStream).toBe(true);
    });

    test("does not inject window.byom on chrome:// pages", async ({ context }) => {
        const page = await context.newPage();
        await page.goto("chrome://version");

        // Content scripts don't run on chrome:// pages
        const hasTransport = await waitForByomTransport(page, 2_000);
        expect(hasTransport).toBe(false);
    });

    test("injects transport on multiple tabs independently", async ({
        context,
    }) => {
        const page1 = await context.newPage();
        const page2 = await context.newPage();

        await page1.goto("https://example.com");
        await page2.goto("https://example.org");

        const [has1, has2] = await Promise.all([
            waitForByomTransport(page1, 5_000),
            waitForByomTransport(page2, 5_000),
        ]);

        expect(has1).toBe(true);
        expect(has2).toBe(true);
    });
});
