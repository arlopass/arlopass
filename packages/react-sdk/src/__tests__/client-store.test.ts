import { describe, it, expect, vi } from "vitest";
import { buildSnapshot, snapshotsEqual, createInitialSnapshot } from "../store/snapshot.js";
import { Subscriptions } from "../store/subscriptions.js";

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
