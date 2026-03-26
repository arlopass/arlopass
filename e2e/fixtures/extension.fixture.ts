import { test as base, chromium, type BrowserContext } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSION_DIST = path.resolve(
    __dirname,
    "../../apps/extension/dist/chromium",
);

export type ExtensionFixtures = {
    /** Chromium persistent context with the extension loaded. */
    context: BrowserContext;
    /** The runtime extension ID extracted from the service worker URL. */
    extensionId: string;
};

export const extensionTest = base.extend<ExtensionFixtures>({
    // eslint-disable-next-line no-empty-pattern
    context: async ({ }, use) => {
        const context = await chromium.launchPersistentContext("", {
            channel: "chromium",
            args: [
                `--disable-extensions-except=${EXTENSION_DIST}`,
                `--load-extension=${EXTENSION_DIST}`,
            ],
        });

        await use(context);
        await context.close();
    },

    extensionId: async ({ context }, use) => {
        let [sw] = context.serviceWorkers();
        if (!sw) {
            sw = await context.waitForEvent("serviceworker", { timeout: 10_000 });
        }
        const extensionId = sw.url().split("/")[2];
        await use(extensionId);
    },
});

export { expect } from "@playwright/test";
