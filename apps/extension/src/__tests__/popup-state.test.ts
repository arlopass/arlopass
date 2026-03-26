import { describe, expect, it } from "vitest";
import { normalizeWalletSnapshot } from "../ui/popup-state.js";

describe("normalizeWalletSnapshot", () => {
  it("normalizes missing active provider to null", () => {
    const result = normalizeWalletSnapshot({});
    expect(result.activeProvider).toBeNull();
  });

  it("drops malformed providers and records warnings", () => {
    const result = normalizeWalletSnapshot({
      "byom.wallet.providers.v1": [{ id: 1 }],
    });
    expect(result.providers).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns empty providers, null error and no warnings for empty object", () => {
    const result = normalizeWalletSnapshot({});
    expect(result.providers).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.lastError).toBeNull();
  });

  it("parses a valid provider correctly", () => {
    const result = normalizeWalletSnapshot({
      "byom.wallet.providers.v1": [
        {
          id: "ollama",
          name: "Ollama",
          type: "local",
          status: "connected",
          models: [{ id: "llama3", name: "Llama 3" }],
        },
      ],
    });
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0]).toMatchObject({
      id: "ollama",
      name: "Ollama",
      type: "local",
      status: "connected",
    });
    expect(result.providers[0]?.models).toHaveLength(1);
    expect(result.providers[0]?.models[0]).toEqual({ id: "llama3", name: "Llama 3" });
  });

  it("parses multiple valid providers", () => {
    const result = normalizeWalletSnapshot({
      "byom.wallet.providers.v1": [
        { id: "ollama", name: "Ollama", type: "local", status: "connected", models: [] },
        { id: "claude", name: "Claude", type: "cloud", status: "disconnected", models: [] },
      ],
    });
    expect(result.providers).toHaveLength(2);
  });

  it("normalizes active provider with providerId and modelId", () => {
    const result = normalizeWalletSnapshot({
      "byom.wallet.activeProvider.v1": { providerId: "ollama", modelId: "llama3" },
    });
    expect(result.activeProvider).toEqual({ providerId: "ollama", modelId: "llama3" });
  });

  it("normalizes active provider with providerId only", () => {
    const result = normalizeWalletSnapshot({
      "byom.wallet.activeProvider.v1": { providerId: "ollama" },
    });
    expect(result.activeProvider).toEqual({ providerId: "ollama" });
    expect(result.activeProvider?.modelId).toBeUndefined();
  });

  it("normalizes active provider to null when value is null", () => {
    const result = normalizeWalletSnapshot({ "byom.wallet.activeProvider.v1": null });
    expect(result.activeProvider).toBeNull();
  });

  it("normalizes active provider to null when providerId is missing", () => {
    const result = normalizeWalletSnapshot({ "byom.wallet.activeProvider.v1": { modelId: "x" } });
    expect(result.activeProvider).toBeNull();
  });

  it("drops provider with invalid type and records warning", () => {
    const result = normalizeWalletSnapshot({
      "byom.wallet.providers.v1": [
        { id: "p1", name: "P1", type: "invalid", status: "connected", models: [] },
      ],
    });
    expect(result.providers).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("drops provider with invalid status and records warning", () => {
    const result = normalizeWalletSnapshot({
      "byom.wallet.providers.v1": [
        { id: "p1", name: "P1", type: "local", status: "unknown-status", models: [] },
      ],
    });
    expect(result.providers).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("drops provider missing id and records warning", () => {
    const result = normalizeWalletSnapshot({
      "byom.wallet.providers.v1": [{ name: "NoId", type: "local", status: "connected", models: [] }],
    });
    expect(result.providers).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("drops malformed model inside a valid provider and records warning", () => {
    const result = normalizeWalletSnapshot({
      "byom.wallet.providers.v1": [
        {
          id: "p1",
          name: "P1",
          type: "local",
          status: "connected",
          models: [{ bad: true }, { id: "m1", name: "M1" }],
        },
      ],
    });
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0]?.models).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("ignores non-array providers key and records warning", () => {
    const result = normalizeWalletSnapshot({
      "byom.wallet.providers.v1": "not-an-array",
    });
    expect(result.providers).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("parses lastError when present and valid", () => {
    const result = normalizeWalletSnapshot({
      "byom.wallet.ui.lastError.v1": { code: "storage_error", message: "Failed to read", at: 12345 },
    });
    expect(result.lastError).toEqual({ code: "storage_error", message: "Failed to read", at: 12345 });
  });

  it("sets lastError to null when absent", () => {
    const result = normalizeWalletSnapshot({});
    expect(result.lastError).toBeNull();
  });

  it("sets lastError to null when shape is invalid", () => {
    const result = normalizeWalletSnapshot({
      "byom.wallet.ui.lastError.v1": { code: 42 },
    });
    expect(result.lastError).toBeNull();
  });

  it("handles null raw input gracefully", () => {
    const result = normalizeWalletSnapshot(null);
    expect(result.providers).toHaveLength(0);
    expect(result.activeProvider).toBeNull();
    expect(result.lastError).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("handles non-object primitive raw input gracefully", () => {
    const result = normalizeWalletSnapshot("bad-input");
    expect(result.providers).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("preserves lastSyncedAt on provider when present", () => {
    const result = normalizeWalletSnapshot({
      "byom.wallet.providers.v1": [
        { id: "p1", name: "P1", type: "cli", status: "connected", models: [], lastSyncedAt: 9999 },
      ],
    });
    expect(result.providers[0]?.lastSyncedAt).toBe(9999);
  });

  it("accepts reconnecting, failed, revoked, and degraded provider statuses", () => {
    const result = normalizeWalletSnapshot({
      "byom.wallet.providers.v1": [
        { id: "p1", name: "P1", type: "cloud", status: "reconnecting", models: [] },
        { id: "p2", name: "P2", type: "cloud", status: "failed", models: [] },
        { id: "p3", name: "P3", type: "cloud", status: "revoked", models: [] },
        {
          id: "p4",
          name: "P4",
          type: "cloud",
          status: "degraded",
          models: [],
          metadata: { statusDetail: "Fallback region us-west-2 in use." },
        },
      ],
    });
    expect(result.providers).toHaveLength(4);
    expect(result.providers.map((provider) => provider.status)).toEqual([
      "reconnecting",
      "failed",
      "revoked",
      "degraded",
    ]);
    expect(result.providers[3]?.statusDetail).toContain("Fallback region");
  });

  it("maps stale/partial cloud discovery metadata to degraded provider status", () => {
    const result = normalizeWalletSnapshot({
      "byom.wallet.providers.v1": [
        {
          id: "p1",
          name: "Claude",
          type: "cloud",
          status: "connected",
          models: [],
          metadata: {
            discoveryRegionStatus:
              "us-east-1:stale,us-west-2:healthy,eu-central-1:partial",
          },
        },
      ],
    });
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0]?.status).toBe("degraded");
    expect(result.providers[0]?.statusDetail).toContain("Fallback region");
  });
});
