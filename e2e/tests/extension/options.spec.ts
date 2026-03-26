import { test, expect } from "../../fixtures/test";
import { ExtensionOptionsPage } from "../../pages/extension-options.page";
import { attachDebugOnFailure } from "../../helpers/debug-on-failure";

test.describe("Extension Options Page", () => {
    let options: ExtensionOptionsPage;

    test.beforeEach(async ({ context, extensionId }) => {
        const page = await context.newPage();
        options = new ExtensionOptionsPage(page);
        await options.goto(extensionId);
    });

    test.afterEach(async ({ }, testInfo) => {
        await attachDebugOnFailure(options?.page, testInfo);
    });

    // ── Page load ──

    test("renders options page header", async () => {
        await expect(options.headerTitle).toContainText("Connect Provider");
    });

    test("renders provider connection form", async () => {
        await expect(options.form).toBeVisible();
        await expect(options.connectorSelect).toBeVisible();
        await expect(options.displayNameInput).toBeVisible();
    });

    test("renders action buttons", async () => {
        await expect(options.testConnectionBtn).toBeVisible();
        await expect(options.testConnectionBtn).toHaveText("Test Connection");
        await expect(options.saveProviderBtn).toBeVisible();
        await expect(options.saveProviderBtn).toHaveText("Save Provider");
    });

    test("shows security note about in-memory secrets", async () => {
        await expect(options.securityNote).toContainText("in-memory");
        await expect(options.securityNote).toContainText("not persisted");
    });

    // ── Connector selection ──

    test("has connector options populated", async () => {
        const optionCount = await options.connectorSelect.locator("option").count();
        expect(optionCount).toBeGreaterThan(0);
    });

    test("switching connector updates dynamic fields", async () => {
        // Select a cloud connector  
        await options.selectConnector("cloud-openai");

        // OpenAI should show apiKey field
        await expect(options.connectorFieldsContainer).toBeVisible();

        // Switch to another connector
        await options.selectConnector("cloud-anthropic");

        // Fields should update (connector-specific fields re-render)
        await expect(options.connectorFieldsContainer).toBeVisible();
    });

    // ── Display name ──

    test("display name input accepts text", async () => {
        await options.fillDisplayName("My Test Provider");
        await expect(options.displayNameInput).toHaveValue("My Test Provider");
    });

    test("display name respects maxlength of 80", async () => {
        const longName = "A".repeat(100);
        await options.displayNameInput.fill(longName);
        const value = await options.displayNameInput.inputValue();
        expect(value.length).toBeLessThanOrEqual(80);
    });

    // ── Bridge pairing section ──

    test("renders bridge pairing controls", async () => {
        await expect(options.bridgeHostNameInput).toBeVisible();
        await expect(options.bridgeHostNameInput).toHaveValue("com.byom.bridge");
        await expect(options.beginPairingBtn).toBeVisible();
        await expect(options.refreshPairingsBtn).toBeVisible();
    });

    test("renders pairing code input", async () => {
        await expect(options.pairingCodeInput).toBeVisible();
        await expect(options.completePairingBtn).toBeVisible();
        await expect(options.rotatePairingBtn).toBeVisible();
    });

    test("renders pairing handle select and revoke", async () => {
        await expect(options.pairingHandleSelect).toBeVisible();
        await expect(options.revokePairingBtn).toBeVisible();
    });

    // ── Connector-specific field rendering ──

    test.describe("cloud connector fields", () => {
        const connectors = [
            { id: "cloud-anthropic", label: "Anthropic" },
            { id: "cloud-openai", label: "OpenAI" },
            { id: "cloud-gemini", label: "Gemini" },
            { id: "cloud-perplexity", label: "Perplexity" },
            { id: "cloud-bedrock", label: "Bedrock" },
            { id: "cloud-vertex", label: "Vertex" },
            { id: "cloud-foundry", label: "Foundry" },
        ];

        for (const { id, label } of connectors) {
            test(`renders fields for ${label} connector`, async () => {
                await options.selectConnector(id);

                // All cloud connectors should have methodId (connection method) field
                await expect(options.connectorFieldsContainer).toBeVisible();

                // Connector fields container should not be empty
                const fieldCount = await options.connectorFieldsContainer.locator("input, select").count();
                expect(fieldCount).toBeGreaterThan(0);
            });
        }
    });

    // ── Cancel edit ──

    test("cancel edit button is hidden by default", async () => {
        await expect(options.cancelEditBtn).toBeHidden();
    });
});
