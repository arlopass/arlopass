import { test, expect } from "../../fixtures/test";

test.describe("Extension Service Worker", () => {
    test("service worker is registered and running", async ({ context }) => {
        const workers = context.serviceWorkers();
        expect(workers.length).toBeGreaterThanOrEqual(1);

        const sw = workers[0];
        expect(sw.url()).toContain("chrome-extension://");
        expect(sw.url()).toContain("background.js");
    });

    test("service worker URL contains valid extension ID", async ({
        extensionId,
    }) => {
        expect(extensionId).toBeTruthy();
        expect(extensionId.length).toBeGreaterThan(0);
        // Chrome extension IDs are 32 lowercase alpha characters
        expect(extensionId).toMatch(/^[a-z]{32}$/);
    });

    test("service worker can access chrome.storage API", async ({
        context,
    }) => {
        const sw = context.serviceWorkers()[0];
        const canAccess = await sw.evaluate(async () => {
            try {
                await chrome.storage.local.get("__test__");
                return true;
            } catch {
                return false;
            }
        });
        expect(canAccess).toBe(true);
    });

    test("service worker can read/write storage", async ({ context }) => {
        const sw = context.serviceWorkers()[0];

        await sw.evaluate(async () => {
            await chrome.storage.local.set({ "__e2e_test__": "hello" });
        });

        const value = await sw.evaluate(async () => {
            const result = await chrome.storage.local.get("__e2e_test__");
            return result["__e2e_test__"];
        });

        expect(value).toBe("hello");

        // Clean up
        await sw.evaluate(async () => {
            await chrome.storage.local.remove("__e2e_test__");
        });
    });

    test("service worker responds to wallet messages", async ({ context }) => {
        const sw = context.serviceWorkers()[0];

        // The background script listens for { channel: "byom.wallet" } messages
        const response = await sw.evaluate(async () => {
            return new Promise<unknown>((resolve) => {
                // Simulate an internal message
                chrome.runtime.sendMessage(
                    {
                        channel: "byom.wallet",
                        action: "wallet.getSnapshot",
                        requestId: "test-req-1",
                        payload: {},
                    },
                    (resp) => {
                        resolve(resp);
                    },
                );
            });
        });

        // Response should be structured (ok/error)
        expect(response).toBeDefined();
    });
});
