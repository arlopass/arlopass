import { test, expect } from "../../fixtures/test";
import { ExtensionPopupPage } from "../../pages/extension-popup.page";
import {
    clearWalletStorage,
    seedProviders,
    seedWalletError,
} from "../../helpers/storage.helper";

test.describe("Extension Popup", () => {
    let popup: ExtensionPopupPage;

    test.beforeEach(async ({ context, extensionId }) => {
        await clearWalletStorage(context);
        const page = await context.newPage();
        popup = new ExtensionPopupPage(page);
        await popup.goto(extensionId);
    });

    // ── Rendering ──

    test("renders popup header with branding", async () => {
        await expect(popup.title).toHaveText("BYOM Wallet");
        await expect(popup.statusChip).toBeVisible();
        await expect(popup.header).toBeVisible();
    });

    test("renders action buttons in footer", async () => {
        await expect(popup.connectProviderBtn).toBeVisible();
        await expect(popup.connectProviderBtn).toHaveText("Connect Provider");
        await expect(popup.openDashboardBtn).toBeVisible();
        await expect(popup.openDashboardBtn).toHaveText("Open Dashboard");
    });

    test("displays security footer text", async () => {
        await expect(popup.securityFooter).toContainText("Origin-scoped approvals");
        await expect(popup.securityFooter).toContainText("credentials stored locally");
    });

    test("shows status chip in header", async () => {
        await expect(popup.statusChip).toBeVisible();
        const text = await popup.statusChip.textContent();
        expect(text).toBeTruthy();
    });

    // ── Empty state ──

    test("shows empty state when no providers exist", async () => {
        await expect(popup.emptyState).toBeVisible();
        await expect(popup.page.locator(".empty-state__title")).toHaveText(
            "No providers connected",
        );
        await expect(popup.page.locator(".empty-state__subtitle")).toContainText(
            "Connect an AI provider",
        );
    });

    test("does not show provider list in empty state", async () => {
        await expect(popup.allProviderCards()).toHaveCount(0);
    });

    // ── Provider cards ──

    test("renders provider cards when providers are seeded", async ({
        context,
        extensionId,
    }) => {
        await seedProviders(context, [
            {
                id: "test-ollama",
                name: "Ollama Local",
                type: "local",
                status: "connected",
                models: [
                    { id: "llama3", name: "Llama 3" },
                    { id: "mistral", name: "Mistral" },
                ],
            },
            {
                id: "test-cloud",
                name: "Anthropic Cloud",
                type: "cloud",
                status: "connected",
                models: [{ id: "claude-3", name: "Claude 3" }],
            },
        ]);

        // Reload popup to pick up seeded data
        await popup.goto(extensionId);

        await expect(popup.allProviderCards()).toHaveCount(2);
        await expect(popup.providerName("test-ollama")).toHaveText("Ollama Local");
        await expect(popup.providerName("test-cloud")).toHaveText("Anthropic Cloud");
    });

    test("shows status chip per provider", async ({ context, extensionId }) => {
        await seedProviders(context, [
            {
                id: "p1",
                name: "Provider One",
                type: "cloud",
                status: "connected",
                models: [],
            },
            {
                id: "p2",
                name: "Provider Two",
                type: "local",
                status: "disconnected",
                models: [],
            },
        ]);
        await popup.goto(extensionId);

        await expect(popup.providerStatusChip("p1")).toHaveText("Connected");
        await expect(popup.providerStatusChip("p2")).toHaveText("Disconnected");
    });

    test("shows active badge on the active provider", async ({
        context,
        extensionId,
    }) => {
        await seedProviders(
            context,
            [
                {
                    id: "active-one",
                    name: "Active Provider",
                    type: "cloud",
                    status: "connected",
                    models: [{ id: "m1", name: "Model" }],
                },
                {
                    id: "inactive-one",
                    name: "Inactive Provider",
                    type: "local",
                    status: "connected",
                    models: [],
                },
            ],
            { providerId: "active-one", modelId: "m1" },
        );
        await popup.goto(extensionId);

        await expect(popup.providerActiveBadge("active-one")).toBeVisible();
        await expect(popup.providerActiveBadge("inactive-one")).toHaveCount(0);
    });

    test("renders model dropdown for providers with models", async ({
        context,
        extensionId,
    }) => {
        await seedProviders(
            context,
            [
                {
                    id: "with-models",
                    name: "With Models",
                    type: "cloud",
                    status: "connected",
                    models: [
                        { id: "m1", name: "Model A" },
                        { id: "m2", name: "Model B" },
                    ],
                },
            ],
            { providerId: "with-models", modelId: "m1" },
        );
        await popup.goto(extensionId);

        const select = popup.modelSelect("with-models");
        await expect(select).toBeVisible();
        await expect(select.locator("option")).toHaveCount(2);
    });

    test("does not render model dropdown when provider has no models", async ({
        context,
        extensionId,
    }) => {
        await seedProviders(context, [
            {
                id: "no-models",
                name: "No Models",
                type: "local",
                status: "connected",
                models: [],
            },
        ]);
        await popup.goto(extensionId);

        await expect(popup.modelSelect("no-models")).toHaveCount(0);
    });

    // ── Actions ──

    test("shows Set Active button for inactive providers", async ({
        context,
        extensionId,
    }) => {
        await seedProviders(context, [
            {
                id: "inactive",
                name: "Inactive",
                type: "cloud",
                status: "connected",
                models: [],
            },
        ]);
        await popup.goto(extensionId);

        await expect(popup.setActiveButton("inactive")).toBeVisible();
    });

    test("hides Set Active button on the active provider", async ({
        context,
        extensionId,
    }) => {
        await seedProviders(
            context,
            [
                {
                    id: "already-active",
                    name: "Already Active",
                    type: "cloud",
                    status: "connected",
                    models: [],
                },
            ],
            { providerId: "already-active" },
        );
        await popup.goto(extensionId);

        await expect(popup.setActiveButton("already-active")).toHaveCount(0);
    });

    test("shows Revoke button on every provider", async ({
        context,
        extensionId,
    }) => {
        await seedProviders(context, [
            {
                id: "revokable",
                name: "Revokable",
                type: "cloud",
                status: "connected",
                models: [],
            },
        ]);
        await popup.goto(extensionId);

        await expect(popup.revokeButton("revokable")).toBeVisible();
    });

    // ── Error banner ──

    test("shows error banner when last error is set", async ({
        context,
        extensionId,
    }) => {
        await seedWalletError(context, {
            message: "Provider unavailable",
            code: "BYOM_PROVIDER_UNAVAILABLE",
        });
        await popup.goto(extensionId);

        await expect(popup.errorBanner).toBeVisible();
        await expect(popup.errorBanner).toContainText("Provider unavailable");
        await expect(popup.errorBanner).toContainText("BYOM_PROVIDER_UNAVAILABLE");
    });

    test("does not show error banner when no error exists", async () => {
        await expect(popup.errorBanner).toHaveCount(0);
    });

    // ── Various statuses ──

    test.describe("provider status rendering", () => {
        const statuses = [
            { status: "connected", label: "Connected" },
            { status: "disconnected", label: "Disconnected" },
            { status: "attention", label: "Needs Attention" },
            { status: "reconnecting", label: "Reconnecting" },
            { status: "failed", label: "Action Required" },
            { status: "revoked", label: "Revoked" },
            { status: "degraded", label: "Degraded" },
        ] as const;

        for (const { status, label } of statuses) {
            test(`renders "${label}" chip for ${status} status`, async ({
                context,
                extensionId,
            }) => {
                await seedProviders(context, [
                    {
                        id: `status-${status}`,
                        name: `Provider ${status}`,
                        type: "cloud",
                        status,
                        models: [],
                    },
                ]);
                await popup.goto(extensionId);

                await expect(popup.providerStatusChip(`status-${status}`)).toHaveText(label);
            });
        }
    });

    // ── Warning count ──

    test("shows warning count when snapshot has warnings", async ({
        context,
        extensionId,
    }) => {
        // Seed invalid provider data to trigger warnings
        await context.serviceWorkers()[0]?.evaluate(async () => {
            await chrome.storage.local.set({
                "byom.wallet.providers.v1": [
                    { id: "good", name: "Good", type: "cloud", status: "connected", models: [] },
                    { broken: true }, // missing required fields
                    { id: "no-name", type: "cloud", status: "connected", models: [] }, // missing name
                ],
            });
        });
        await popup.goto(extensionId);

        await expect(popup.warningCount).toBeVisible();
        await expect(popup.warningCount).toContainText("skipped");
    });
});
