import { test, expect } from "../../fixtures/test";
import { ExtensionOptionsPage } from "../../pages/extension-options.page";
import {
    credentialsForConnector,
    isProviderEnabled,
    type ConnectorCredentials,
} from "../../helpers/env-credentials";

/**
 * Cloud Provider Connection Tests (requires real credentials).
 *
 * These tests fill out the extension options form with real credentials
 * loaded from `e2e/.env.e2e` and click "Test Connection".
 *
 * Each test is **automatically skipped** when:
 *   - The provider's `TEST_*_ENABLED` flag is not `"true"`, OR
 *   - The required credential env vars are empty.
 *
 * This means the suite is always safe to run without any setup.
 *
 * To run:
 *   1. Copy `e2e/.env.e2e.example` → `e2e/.env.e2e`
 *   2. Set the `TEST_<PROVIDER>_ENABLED=true` flags for providers you want
 *   3. Fill in the matching credentials
 *   4. Run: npx playwright test --project=extension --grep @cloud-credentials
 */
test.describe("Cloud Provider Connections @cloud-credentials", () => {
    // Track the last page opened so we can capture debug on failure
    let lastPage: import("@playwright/test").Page | undefined;

    test.afterEach(async ({ }, testInfo) => {
        const { attachDebugOnFailure } = await import("../../helpers/debug-on-failure");
        await attachDebugOnFailure(lastPage, testInfo);
    });

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
        test(`Test Connection — ${label}`, async ({ context, extensionId }) => {
            if (!isProviderEnabled(id)) {
                test.skip(true, `${label} tests disabled (set ${flag}=true to enable)`);
                return;
            }

            const creds: ConnectorCredentials | undefined = credentialsForConnector(id);
            if (!creds) {
                test.skip(true, `No credentials configured for ${label} (${id})`);
                return;
            }

            const page = await context.newPage();
            lastPage = page;
            const options = new ExtensionOptionsPage(page);
            await options.goto(extensionId);

            // Select connector
            await options.selectConnector(id);

            // Fill display name
            await options.fillDisplayName(`E2E ${label}`);

            // Fill connector-specific fields from env credentials
            await options.fillConnectorFields(creds);

            // Click Test Connection
            await options.clickTestConnection();

            // Wait for test result — should show status feedback
            // The test connection runs in-memory and shows a status message
            await expect(
                page.locator('[role="status"], .status-message, .connection-result').first(),
            ).toBeVisible({ timeout: 30_000 });
        });
    }
});
