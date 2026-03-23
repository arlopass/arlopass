import { describe, expect, it } from "vitest";
import { renderWalletView } from "../ui/popup-render.js";
import type { WalletViewModel } from "../ui/popup-render.js";
import type { WalletProvider } from "../ui/popup-state.js";

function makeProvider(overrides: Partial<WalletProvider> = {}): WalletProvider {
  return {
    id: "ollama",
    name: "Ollama",
    type: "local",
    status: "connected",
    models: [],
    ...overrides,
  };
}

function emptyModel(): WalletViewModel {
  return { providers: [], activeProvider: null, warnings: [] };
}

describe("renderWalletView", () => {
  it("renders empty state when no providers exist", () => {
    const html = renderWalletView(emptyModel());
    expect(html).toContain("No providers connected");
  });

  it("does not render provider cards in empty state", () => {
    const html = renderWalletView(emptyModel());
    expect(html).not.toContain("provider-card");
  });

  it("renders provider name when provider is present", () => {
    const html = renderWalletView({
      providers: [makeProvider({ name: "Ollama" })],
      activeProvider: null,
      warnings: [],
    });
    expect(html).toContain("Ollama");
    expect(html).not.toContain("No providers connected");
  });

  it("marks active provider with active-badge and provider-card--active", () => {
    const html = renderWalletView({
      providers: [makeProvider({ id: "ollama" })],
      activeProvider: { providerId: "ollama" },
      warnings: [],
    });
    expect(html).toContain("active-badge");
    expect(html).toContain("provider-card--active");
  });

  it("does not mark inactive provider as active", () => {
    const html = renderWalletView({
      providers: [makeProvider({ id: "other" })],
      activeProvider: { providerId: "ollama" },
      warnings: [],
    });
    expect(html).not.toContain("provider-card--active");
    expect(html).not.toContain("active-badge");
  });

  it("renders revoke button for each provider", () => {
    const html = renderWalletView({
      providers: [makeProvider({ id: "ollama" })],
      activeProvider: null,
      warnings: [],
    });
    expect(html).toContain('data-action="revokeProvider"');
    expect(html).toContain('data-provider-id="ollama"');
  });

  it("renders set-active button for non-active provider", () => {
    const html = renderWalletView({
      providers: [
        makeProvider({ id: "ollama" }),
        makeProvider({ id: "claude", name: "Claude", type: "cloud" }),
      ],
      activeProvider: { providerId: "ollama" },
      warnings: [],
    });
    expect(html).toContain('data-action="setActiveProvider"');
    expect(html).toContain('data-provider-id="claude"');
  });

  it("does not render set-active button for the active provider", () => {
    const html = renderWalletView({
      providers: [makeProvider({ id: "ollama" })],
      activeProvider: { providerId: "ollama" },
      warnings: [],
    });
    // setActiveProvider should not appear for the provider that is already active
    expect(html).not.toContain('data-action="setActiveProvider"');
  });

  it("renders error banner when lastError is present", () => {
    const html = renderWalletView({
      ...emptyModel(),
      lastError: { code: "storage_error", message: "Storage unavailable", at: 0 },
    });
    expect(html).toContain("error-banner");
    expect(html).toContain("Storage unavailable");
    expect(html).toContain("storage_error");
  });

  it("does not render error banner when lastError is null", () => {
    const html = renderWalletView({ ...emptyModel(), lastError: null });
    expect(html).not.toContain("error-banner");
  });

  it("renders model select when provider has models", () => {
    const html = renderWalletView({
      providers: [
        makeProvider({
          id: "ollama",
          models: [{ id: "llama3", name: "Llama 3" }],
        }),
      ],
      activeProvider: { providerId: "ollama", modelId: "llama3" },
      warnings: [],
    });
    expect(html).toContain("model-select");
    expect(html).toContain("Llama 3");
  });

  it("pre-selects the active model in the select", () => {
    const html = renderWalletView({
      providers: [
        makeProvider({
          id: "ollama",
          models: [
            { id: "llama3", name: "Llama 3" },
            { id: "mistral", name: "Mistral" },
          ],
        }),
      ],
      activeProvider: { providerId: "ollama", modelId: "mistral" },
      warnings: [],
    });
    expect(html).toContain('value="mistral" selected');
  });

  it("does not render model select when provider has no models", () => {
    const html = renderWalletView({
      providers: [makeProvider({ models: [] })],
      activeProvider: null,
      warnings: [],
    });
    expect(html).not.toContain("model-select");
  });

  it("renders warning count when warnings are present", () => {
    const html = renderWalletView({
      ...emptyModel(),
      warnings: ["w1", "w2"],
    });
    expect(html).toContain("2 record(s) skipped");
  });

  it("does not render warning count when no warnings", () => {
    const html = renderWalletView(emptyModel());
    expect(html).not.toContain("record(s) skipped");
  });

  it("renders correct status chip class for connected status", () => {
    const html = renderWalletView({
      providers: [makeProvider({ status: "connected" })],
      activeProvider: null,
      warnings: [],
    });
    expect(html).toContain("status-chip--connected");
    expect(html).toContain("Connected");
  });

  it("renders correct status chip class for disconnected status", () => {
    const html = renderWalletView({
      providers: [makeProvider({ status: "disconnected" })],
      activeProvider: null,
      warnings: [],
    });
    expect(html).toContain("status-chip--disconnected");
    expect(html).toContain("Disconnected");
  });

  it("renders correct status chip class for attention status", () => {
    const html = renderWalletView({
      providers: [makeProvider({ status: "attention" })],
      activeProvider: null,
      warnings: [],
    });
    expect(html).toContain("status-chip--attention");
    expect(html).toContain("Needs Attention");
  });

  it("escapes HTML in provider name to prevent XSS", () => {
    const html = renderWalletView({
      providers: [makeProvider({ name: '<script>alert("xss")</script>' })],
      activeProvider: null,
      warnings: [],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders provider-list section wrapper", () => {
    const html = renderWalletView(emptyModel());
    expect(html).toContain("provider-list");
  });

  it("renders multiple provider cards", () => {
    const html = renderWalletView({
      providers: [
        makeProvider({ id: "ollama", name: "Ollama" }),
        makeProvider({ id: "claude", name: "Claude", type: "cloud" }),
      ],
      activeProvider: null,
      warnings: [],
    });
    expect(html).toContain("Ollama");
    expect(html).toContain("Claude");
  });
});
