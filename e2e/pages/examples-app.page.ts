import type { Page, Locator } from "@playwright/test";

/**
 * Page Object for the Arlopass examples web app (React + Mantine).
 *
 * Selectors target Mantine component roles, labels, and text content
 * rendered by `apps/examples-web/src/App.tsx`.
 */
export class ExamplesAppPage {
    readonly page: Page;

    // ── Header ──
    readonly heading: Locator;
    readonly connectionBadge: Locator;
    readonly stateBadge: Locator;

    // ── Transport detection alerts ──
    readonly extensionDetectedAlert: Locator;
    readonly extensionMissingAlert: Locator;

    // ── Feedback alert ──
    readonly feedbackAlert: Locator;

    // ── Tabs ──
    readonly playgroundTab: Locator;
    readonly scenarioCatalogTab: Locator;
    readonly snippetTab: Locator;

    // ── Connection controls card ──
    readonly transportProfileSelect: Locator;
    readonly appIdInput: Locator;
    readonly originOverrideInput: Locator;
    readonly connectBtn: Locator;
    readonly disconnectBtn: Locator;
    readonly happyPathBtn: Locator;
    readonly transportSourceValue: Locator;
    readonly sessionValue: Locator;

    // ── Provider scenarios card ──
    readonly listProvidersBtn: Locator;
    readonly selectProviderBtn: Locator;
    readonly providerSelect: Locator;
    readonly modelSelect: Locator;

    // ── Chat card ──
    readonly promptTextarea: Locator;
    readonly chatSendBtn: Locator;
    readonly chatStreamBtn: Locator;
    readonly streamPreview: Locator;

    // ── Chat transcript card ──
    readonly clearBtn: Locator;
    readonly chatMessages: Locator;
    readonly emptyTranscript: Locator;

    // ── Event log card ──
    readonly logEntries: Locator;

    constructor(page: Page) {
        this.page = page;

        // Header
        this.heading = page.getByRole("heading", { name: "Arlopass Extension + SDK Examples" });
        this.connectionBadge = page.getByText("CONNECTED").or(page.getByText("DISCONNECTED"));
        this.stateBadge = page.locator('[class*="Badge"]').last();

        // Transport alerts
        this.extensionDetectedAlert = page.getByText("Extension transport detected");
        this.extensionMissingAlert = page.getByText("Extension transport not detected");

        // Feedback
        this.feedbackAlert = page.locator('[class*="Alert"]').first();

        // Tabs
        this.playgroundTab = page.getByRole("tab", { name: "Interactive playground" });
        this.scenarioCatalogTab = page.getByRole("tab", { name: "Scenario catalog" });
        this.snippetTab = page.getByRole("tab", { name: "Integration snippet" });

        // Connection controls
        this.transportProfileSelect = page.getByLabel("Transport profile");
        this.appIdInput = page.getByLabel("App ID");
        this.originOverrideInput = page.getByLabel("Origin override");
        this.connectBtn = page.getByRole("button", { name: "Connect", exact: true });
        this.disconnectBtn = page.getByRole("button", { name: "Disconnect" });
        this.happyPathBtn = page.getByRole("button", { name: "Run happy-path" });
        this.transportSourceValue = page.locator("code").filter({ hasText: /transport/i }).or(page.locator("code").first());
        this.sessionValue = page.locator("code").nth(1);

        // Provider scenarios
        this.listProvidersBtn = page.getByRole("button", { name: "List providers" });
        this.selectProviderBtn = page.getByRole("button", { name: "Select provider" });
        this.providerSelect = page.getByLabel("Provider");
        this.modelSelect = page.getByLabel("Model");

        // Chat
        this.promptTextarea = page.getByLabel("Prompt");
        this.chatSendBtn = page.getByRole("button", { name: "chat.send" });
        this.chatStreamBtn = page.getByRole("button", { name: "chat.stream" });
        this.streamPreview = page.getByText("No active stream.").or(page.locator(".mono-text"));

        // Chat transcript
        this.clearBtn = page.getByRole("button", { name: "Clear" });
        this.chatMessages = page.locator('[class*="Card"]').filter({ has: page.locator('[class*="Badge"]').filter({ hasText: /user|assistant/ }) });
        this.emptyTranscript = page.getByText("No chat messages yet.");

        // Event log
        this.logEntries = page.locator('[class*="Card"]').filter({ has: page.locator('[class*="Badge"]').filter({ hasText: /info|success|error/ }) });
    }

    async goto(): Promise<void> {
        await this.page.goto("/");
    }

    // ── Transport profile ──

    async selectTransportProfile(profile: string): Promise<void> {
        await this.transportProfileSelect.click();
        await this.page.getByRole("option", { name: profile }).click();
    }

    // ── Connection ──

    async connect(): Promise<void> {
        await this.connectBtn.click();
    }

    async disconnect(): Promise<void> {
        await this.disconnectBtn.click();
    }

    async runHappyPath(): Promise<void> {
        await this.happyPathBtn.click();
    }

    // ── Providers ──

    async listProviders(): Promise<void> {
        await this.listProvidersBtn.click();
    }

    async selectProvider(providerName: string): Promise<void> {
        await this.providerSelect.click();
        await this.page.getByRole("option", { name: providerName }).click();
    }

    async selectModel(modelName: string): Promise<void> {
        await this.modelSelect.click();
        await this.page.getByRole("option", { name: modelName }).click();
    }

    async clickSelectProvider(): Promise<void> {
        await this.selectProviderBtn.click();
    }

    // ── Chat ──

    async fillPrompt(text: string): Promise<void> {
        await this.promptTextarea.fill(text);
    }

    async sendChat(): Promise<void> {
        await this.chatSendBtn.click();
    }

    async streamChat(): Promise<void> {
        await this.chatStreamBtn.click();
    }

    async clearSession(): Promise<void> {
        await this.clearBtn.click();
    }

    // ── Queries ──

    async getConnectionBadgeText(): Promise<string> {
        return (await this.connectionBadge.textContent()) ?? "";
    }

    async waitForConnected(): Promise<void> {
        await this.page.getByText("CONNECTED").waitFor({ state: "visible", timeout: 30_000 });
    }

    async waitForFeedback(title: string): Promise<void> {
        await this.page.getByText(title).waitFor({ state: "visible", timeout: 30_000 });
    }
}
