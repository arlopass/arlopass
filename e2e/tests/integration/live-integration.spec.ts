import { test, expect } from "../../fixtures/test";
import { ExtensionPopupPage } from "../../pages/extension-popup.page";
import { ExtensionOptionsPage } from "../../pages/extension-options.page";
import { ExamplesAppPage } from "../../pages/examples-app.page";
import { waitForArlopassTransport } from "../../helpers/wait.helper";
import {
    isLiveIntegrationEnabled,
    isProviderEnabled,
    credentialsForConnector,
} from "../../helpers/env-credentials";
import { attachContextDebugOnFailure } from "../../helpers/debug-on-failure";

/**
 * Live Provider Pipeline Tests — zero mocks @live
 *
 * Depends on the "live-setup" project (connectivity check). If that
 * fails, Playwright skips this entire file automatically.
 *
 * Each provider is a **single test** with sequential `test.step()` calls.
 * If an earlier step fails (e.g. saving the provider), the later steps
 * (connect, chat, stream) are automatically skipped.
 *
 * Guard order (all evaluated before launching the browser):
 *   1. `TEST_LIVE_INTEGRATION_ENABLED` must be `true`
 *   2. `TEST_<PROVIDER>_ENABLED` must be `true`
 *   3. Credentials must be configured for the provider
 *
 * Prerequisites:
 *   1. `TEST_LIVE_INTEGRATION_ENABLED=true` in `e2e/.env.e2e`
 *   2. Bridge must be running (`npm run dev:bridge`)
 *   3. At least one `TEST_<PROVIDER>_ENABLED=true` with valid credentials
 *   4. The "live-setup" connectivity check must pass
 *
 * Run: npm run test:e2e:live
 */

const CONNECTORS = [
    { id: "cloud-anthropic", label: "Anthropic", flag: "TEST_ANTHROPIC_ENABLED" },
    { id: "cloud-openai", label: "OpenAI", flag: "TEST_OPENAI_ENABLED" },
    { id: "cloud-gemini", label: "Gemini", flag: "TEST_GEMINI_ENABLED" },
    { id: "cloud-perplexity", label: "Perplexity", flag: "TEST_PERPLEXITY_ENABLED" },
    { id: "cloud-bedrock", label: "Amazon Bedrock", flag: "TEST_BEDROCK_ENABLED" },
    { id: "cloud-vertex", label: "Google Vertex AI", flag: "TEST_VERTEX_ENABLED" },
    { id: "cloud-foundry", label: "Microsoft Foundry", flag: "TEST_FOUNDRY_ENABLED" },
] as const;

for (const { id, label, flag } of CONNECTORS) {
    // Each provider gets its own describe so the skip runs at describe
    // level — before fixtures are created (no wasted browser launch).
    test.describe(`Live Pipeline — ${label} @live`, () => {
        const BASE_URL = "http://localhost:4173";

        // Skip the entire describe (and all its tests) early — before
        // any fixture or browser context is created.
        test.skip(() => !isLiveIntegrationEnabled(), "Live integration disabled (set TEST_LIVE_INTEGRATION_ENABLED=true)");
        test.skip(() => !isProviderEnabled(id), `${label} disabled (set ${flag}=true)`);

        test.afterEach(async ({ context }, testInfo) => {
            await attachContextDebugOnFailure(context, testInfo);
        });

        test(`full pipeline — ${label}`, async ({ context, extensionId }) => {
            const creds = credentialsForConnector(id);
            if (!creds) {
                test.skip(true, `No credentials configured for ${label}`);
                return;
            }

            // ── Step 1: Save provider via options page ──
            await test.step(`save ${label} provider via options page`, async () => {
                const page = await context.newPage();
                const options = new ExtensionOptionsPage(page);
                await options.goto(extensionId);

                await options.selectConnector(id);
                await options.fillDisplayName(`Live E2E ${label}`);
                await options.fillConnectorFields(creds);
                await options.clickSaveProvider();
                await page.close();
            });

            // ── Step 2: Activate provider in popup ──
            await test.step(`activate ${label} in popup`, async () => {
                const page = await context.newPage();
                const popup = new ExtensionPopupPage(page);
                await popup.goto(extensionId);

                await expect(popup.allProviderCards().first()).toBeVisible({
                    timeout: 10_000,
                });

                const setActiveBtn = page.locator('[data-action="setActiveProvider"]').first();
                if (await setActiveBtn.isVisible()) {
                    await setActiveBtn.click();
                }
                await page.close();
            });

            // ── Step 3: Connect webapp via real injected transport ──
            const webPage = await context.newPage();
            await webPage.goto(BASE_URL);
            await webPage.waitForLoadState("networkidle");
            const app = new ExamplesAppPage(webPage);

            await test.step("connect to webapp via injected transport", async () => {
                const hasTransport = await waitForArlopassTransport(webPage, 10_000);
                expect(hasTransport).toBe(true);

                await app.selectTransportProfile("Injected");
                await app.connect();
                await app.waitForFeedback("Connected");
            });

            // ── Step 4: List + select provider ──
            await test.step("list providers and select", async () => {
                await app.listProviders();
                await app.waitForFeedback("Providers loaded");

                await app.clickSelectProvider();
                await app.waitForFeedback("Provider selected");
            });

            // ── Step 5: Send chat message (request/response) ──
            await test.step(`chat.send through real ${label}`, async () => {
                await app.fillPrompt("Say hello in exactly three words.");
                await app.sendChat();
                await app.waitForFeedback("Chat response received");

                const assistantBadges = webPage
                    .locator('[class*="Badge"]')
                    .filter({ hasText: "assistant" });
                await expect(assistantBadges.first()).toBeVisible({ timeout: 60_000 });
            });

            // ── Step 6: Stream chat message ──
            await test.step(`chat.stream through real ${label}`, async () => {
                await app.fillPrompt("Count from 1 to 5, one number per line.");
                await app.streamChat();
                await app.waitForFeedback("Stream completed");
            });
        });
    });
}
