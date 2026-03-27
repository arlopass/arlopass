import { test, expect } from "../../fixtures/test";
import { waitForArlopassTransport } from "../../helpers/wait.helper";

test.describe("Content Script Injection", () => {
    test("injects window.arlopass on http pages", async ({ context }) => {
        const page = await context.newPage();
        await page.goto("https://example.com");

        const hasTransport = await waitForArlopassTransport(page, 5_000);
        expect(hasTransport).toBe(true);
    });

    test("window.arlopass has expected transport interface", async ({ context }) => {
        const page = await context.newPage();
        await page.goto("https://example.com");
        await waitForArlopassTransport(page, 5_000);

        const transportShape = await page.evaluate(() => {
            const arlopass = (window as unknown as Record<string, unknown>).arlopass as Record<string, unknown> | undefined;
            if (!arlopass) return null;
            return {
                hasRequest: typeof arlopass.request === "function",
                hasStream: typeof arlopass.stream === "function",
                hasDisconnect: typeof arlopass.disconnect === "function",
            };
        });

        expect(transportShape).not.toBeNull();
        expect(transportShape?.hasRequest).toBe(true);
        expect(transportShape?.hasStream).toBe(true);
    });

    test("does not inject window.arlopass on chrome:// pages", async ({ context }) => {
        const page = await context.newPage();
        await page.goto("chrome://version");

        // Content scripts don't run on chrome:// pages
        const hasTransport = await waitForArlopassTransport(page, 2_000);
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
            waitForArlopassTransport(page1, 5_000),
            waitForArlopassTransport(page2, 5_000),
        ]);

        expect(has1).toBe(true);
        expect(has2).toBe(true);
    });
});
