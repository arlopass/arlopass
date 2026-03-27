import type { BrowserContext, Page } from "@playwright/test";

/**
 * Read a value from chrome.storage.local via the service worker.
 */
export async function getStorageValue(
    context: BrowserContext,
    key: string,
): Promise<unknown> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error("No service worker found");
    return sw.evaluate(async (k: string) => {
        const result = await chrome.storage.local.get(k);
        return result[k];
    }, key);
}

/**
 * Write a value into chrome.storage.local via the service worker.
 */
export async function setStorageValue(
    context: BrowserContext,
    key: string,
    value: unknown,
): Promise<void> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error("No service worker found");
    await sw.evaluate(
        async (args: { k: string; v: unknown }) => {
            await chrome.storage.local.set({ [args.k]: args.v });
        },
        { k: key, v: value },
    );
}

/**
 * Clear all Arlopass wallet keys from chrome.storage.local.
 */
export async function clearWalletStorage(context: BrowserContext): Promise<void> {
    const sw = context.serviceWorkers()[0];
    if (!sw) throw new Error("No service worker found");
    await sw.evaluate(async () => {
        await chrome.storage.local.remove([
            "arlopass.wallet.providers.v1",
            "arlopass.wallet.activeProvider.v1",
            "arlopass.wallet.ui.lastError.v1",
        ]);
    });
}

/**
 * Seed chrome.storage.local with a fake provider list for testing.
 */
export async function seedProviders(
    context: BrowserContext,
    providers: readonly Record<string, unknown>[],
    activeProvider?: { providerId: string; modelId?: string },
): Promise<void> {
    await setStorageValue(context, "arlopass.wallet.providers.v1", providers);
    if (activeProvider) {
        await setStorageValue(context, "arlopass.wallet.activeProvider.v1", activeProvider);
    }
}

/**
 * Seed a wallet error in chrome.storage.local.
 */
export async function seedWalletError(
    context: BrowserContext,
    error: { message: string; code: string },
): Promise<void> {
    await setStorageValue(context, "arlopass.wallet.ui.lastError.v1", {
        ...error,
        at: Date.now(),
    });
}
