import { describe, it, expect, vi } from "vitest";
import { buildSnapshot, snapshotsEqual, createInitialSnapshot } from "../store/snapshot.js";
import { Subscriptions } from "../store/subscriptions.js";
import { ClientStore } from "../store/client-store.js";
import type { BYOMClient } from "@byom-ai/web-sdk";

function createMockClient(overrides: {
  state?: string;
  sessionId?: string;
  selectedProvider?: { providerId: string; modelId: string };
} = {}) {
  return {
    state: overrides.state ?? "disconnected",
    sessionId: overrides.sessionId ?? undefined,
    selectedProvider: overrides.selectedProvider ?? undefined,
    connect: vi.fn(),
    disconnect: vi.fn(),
    listProviders: vi.fn(),
    selectProvider: vi.fn(),
    chat: {
      send: vi.fn(),
      stream: vi.fn(),
    },
  } as unknown as BYOMClient;
}

describe("snapshot", () => {
  it("creates initial snapshot with disconnected state", () => {
    const snap = createInitialSnapshot();
    expect(snap.state).toBe("disconnected");
    expect(snap.sessionId).toBeNull();
    expect(snap.selectedProvider).toBeNull();
    expect(snap.providers).toEqual([]);
    expect(snap.error).toBeNull();
  });

  it("builds snapshot from client state values", () => {
    const snap = buildSnapshot({
      state: "connected",
      sessionId: "session.123",
      selectedProvider: { providerId: "p.1", modelId: "m.1" },
      providers: [{ providerId: "p.1", providerName: "Test", models: ["m.1"] }],
      error: null,
    });
    expect(snap.state).toBe("connected");
    expect(snap.sessionId).toBe("session.123");
  });

  it("detects equal snapshots", () => {
    const a = createInitialSnapshot();
    const b = createInitialSnapshot();
    expect(snapshotsEqual(a, b)).toBe(true);
  });

  it("detects different snapshots", () => {
    const a = createInitialSnapshot();
    const b = buildSnapshot({ ...a, state: "connected" });
    expect(snapshotsEqual(a, b)).toBe(false);
  });
});

describe("Subscriptions", () => {
  it("notifies subscribers", () => {
    const subs = new Subscriptions();
    let count = 0;
    subs.subscribe(() => { count++; });
    subs.notify();
    expect(count).toBe(1);
  });

  it("unsubscribes correctly", () => {
    const subs = new Subscriptions();
    let count = 0;
    const unsub = subs.subscribe(() => { count++; });
    unsub();
    subs.notify();
    expect(count).toBe(0);
  });

  it("supports multiple subscribers", () => {
    const subs = new Subscriptions();
    let count = 0;
    subs.subscribe(() => { count++; });
    subs.subscribe(() => { count += 10; });
    subs.notify();
    expect(count).toBe(11);
  });

  it("clears all subscribers", () => {
    const subs = new Subscriptions();
    let count = 0;
    subs.subscribe(() => { count++; });
    subs.clear();
    subs.notify();
    expect(count).toBe(0);
  });
});

describe("ClientStore", () => {
  it("creates with initial disconnected snapshot", () => {
    const client = createMockClient();
    const store = new ClientStore(client);
    const snap = store.getSnapshot();
    expect(snap.state).toBe("disconnected");
    expect(snap.sessionId).toBeNull();
    store.destroy();
  });

  it("getSnapshot returns same reference when state unchanged", () => {
    const client = createMockClient();
    const store = new ClientStore(client);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    store.destroy();
  });

  it("subscribe returns unsubscribe function", () => {
    const client = createMockClient();
    const store = new ClientStore(client);
    let notified = false;
    const unsub = store.subscribe(() => { notified = true; });
    store.refreshSnapshot();
    unsub();
    expect(typeof unsub).toBe("function");
    store.destroy();
  });

  it("refreshSnapshot notifies on state change", () => {
    const mockClient = createMockClient();
    const store = new ClientStore(mockClient);
    let notified = false;
    store.subscribe(() => { notified = true; });
    (mockClient as unknown as Record<string, unknown>).state = "connected";
    store.refreshSnapshot();
    expect(notified).toBe(true);
    expect(store.getSnapshot().state).toBe("connected");
    store.destroy();
  });

  it("refreshSnapshot does NOT notify when state unchanged", () => {
    const client = createMockClient();
    const store = new ClientStore(client);
    let count = 0;
    store.subscribe(() => { count++; });
    store.refreshSnapshot();
    expect(count).toBe(0);
    store.destroy();
  });

  it("setError updates snapshot error field", () => {
    const client = createMockClient();
    const store = new ClientStore(client);
    const error = new Error("test") as any;
    store.setError(error);
    expect(store.getSnapshot().error).toBe(error);
    store.destroy();
  });

  it("setProviders updates snapshot providers", () => {
    const client = createMockClient();
    const store = new ClientStore(client);
    const providers = [{ providerId: "p", providerName: "P", models: ["m"] }] as const;
    store.setProviders(providers);
    expect(store.getSnapshot().providers).toBe(providers);
    store.destroy();
  });

  it("destroy clears subscriptions and stops polling", () => {
    const client = createMockClient();
    const store = new ClientStore(client);
    let count = 0;
    store.subscribe(() => { count++; });
    store.destroy();
    store.refreshSnapshot();
    expect(count).toBe(0);
  });
});
