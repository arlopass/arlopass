import type { Page } from "@playwright/test";

/**
 * Wait for a selector to appear and then disappear (e.g. loading indicator).
 */
export async function waitForLoadingComplete(
    page: Page,
    loadingSelector: string,
    timeoutMs = 10_000,
): Promise<void> {
    try {
        await page.locator(loadingSelector).waitFor({ state: "visible", timeout: 2_000 });
    } catch {
        // Loading indicator may already be gone
    }
    await page.locator(loadingSelector).waitFor({ state: "hidden", timeout: timeoutMs });
}

/**
 * Wait for `window.arlopass` to be defined in the page context.
 */
export async function waitForArlopassTransport(
    page: Page,
    timeoutMs = 10_000,
): Promise<boolean> {
    try {
        await page.waitForFunction(
            () => typeof (window as unknown as Record<string, unknown>).arlopass !== "undefined",
            undefined,
            { timeout: timeoutMs },
        );
        return true;
    } catch {
        return false;
    }
}

/**
 * Retry an async callback up to `maxAttempts` times with a delay between attempts.
 */
export async function retry<T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
    delayMs = 500,
): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < maxAttempts; i++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (i < maxAttempts - 1) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }
    throw lastError;
}
