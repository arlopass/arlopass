import type { ProtocolCapability } from "@arlopass/protocol";
import { describe, expect, it } from "vitest";

import { ExtensionEventEmitter, type ExtensionEventMap } from "../events.js";
import { GrantStore, GrantStoreError } from "../permissions/grant-store.js";
import {
  GRANT_SCOPE_WILDCARD,
  GrantValidationError,
} from "../permissions/grant-types.js";

type DeterministicClock = Readonly<{
  now: () => number;
  advance: (milliseconds: number) => void;
}>;

function createClock(startAt: string): DeterministicClock {
  let current = new Date(startAt).getTime();
  return {
    now: () => current,
    advance: (milliseconds: number) => {
      current += milliseconds;
    },
  };
}

function createStoreHarness(
  clock: DeterministicClock,
): Readonly<{
  events: ExtensionEventEmitter<ExtensionEventMap>;
  store: GrantStore;
}> {
  const events = new ExtensionEventEmitter<ExtensionEventMap>();
  let sequence = 0;
  const store = new GrantStore({
    now: clock.now,
    sessionGrantTtlMs: 1_000,
    oneTimeGrantTtlMs: 500,
    randomId: () => `g${sequence++}`,
    events,
  });

  return { events, store };
}

function permissionLookup(
  capability: ProtocolCapability,
  providerId = "provider.alpha",
  modelId = "model.one",
): Readonly<{
  origin: string;
  providerId: string;
  modelId: string;
  capability: ProtocolCapability;
}> {
  return {
    origin: "https://app.example.com",
    providerId,
    modelId,
    capability,
  };
}

describe("GrantStore", () => {
  it("supports one-time grants that are consumed exactly once", () => {
    const clock = createClock("2026-03-23T12:00:00.000Z");
    const { events, store } = createStoreHarness(clock);
    const consumed: string[] = [];

    events.on("grant-consumed", (event) => {
      consumed.push(event.grant.id);
    });

    const grant = store.grantPermission({
      origin: "https://app.example.com",
      providerId: "provider.alpha",
      modelId: "model.one",
      capabilities: ["chat.stream"],
      grantType: "one-time",
    });

    expect(store.hasPermission(permissionLookup("chat.stream"))).toBe(true);
    const consumedGrant = store.consumeOneTimeGrant(grant.id, "req.test-1");
    expect(consumedGrant.consumedAt).toBe(clock.now());
    expect(consumed).toEqual([grant.id]);
    expect(store.hasPermission(permissionLookup("chat.stream"))).toBe(false);
    expect(() => store.consumeOneTimeGrant(grant.id)).toThrowError(GrantStoreError);
  });

  it("expires session grants deterministically by TTL and by session end", () => {
    const clock = createClock("2026-03-23T12:00:00.000Z");
    const { store } = createStoreHarness(clock);

    const sessionGrant = store.grantPermission({
      origin: "https://app.example.com",
      providerId: "provider.alpha",
      modelId: "model.one",
      capabilities: ["chat.completions"],
      grantType: "session",
    });
    const persistentGrant = store.grantPermission({
      origin: "https://app.example.com",
      providerId: "provider.alpha",
      modelId: "model.one",
      capabilities: ["chat.stream"],
      grantType: "persistent",
    });

    expect(store.hasPermission(permissionLookup("chat.completions"))).toBe(true);
    expect(store.hasPermission(permissionLookup("chat.stream"))).toBe(true);

    clock.advance(1_000);
    const expired = store.expireStaleGrants();
    expect(expired.map((grant) => grant.id)).toEqual([sessionGrant.id]);
    expect(store.hasPermission(permissionLookup("chat.completions"))).toBe(false);
    expect(store.hasPermission(permissionLookup("chat.stream"))).toBe(true);

    const ended = store.expireSessionGrants("session-ended");
    expect(ended).toHaveLength(0);
    expect(store.getGrant(persistentGrant.id)).toBeDefined();
  });

  it("applies wildcard provider/model behavior for provider.list and session.create", () => {
    const clock = createClock("2026-03-23T12:00:00.000Z");
    const { store } = createStoreHarness(clock);

    const providerListGrant = store.grantPermission({
      origin: "https://app.example.com",
      providerId: "provider.alpha",
      modelId: "model.one",
      capabilities: ["provider.list"],
      grantType: "persistent",
    });
    const sessionCreateGrant = store.grantPermission({
      origin: "https://app.example.com",
      providerId: "provider.beta",
      modelId: "model.two",
      capabilities: ["session.create"],
      grantType: "session",
    });

    expect(providerListGrant.providerId).toBe(GRANT_SCOPE_WILDCARD);
    expect(providerListGrant.modelId).toBe(GRANT_SCOPE_WILDCARD);
    expect(sessionCreateGrant.providerId).toBe(GRANT_SCOPE_WILDCARD);
    expect(sessionCreateGrant.modelId).toBe(GRANT_SCOPE_WILDCARD);

    expect(
      store.hasPermission(permissionLookup("provider.list", "provider.alpha", "model.one")),
    ).toBe(true);
    expect(
      store.hasPermission(permissionLookup("provider.list", "provider.gamma", "model.xyz")),
    ).toBe(true);
    expect(
      store.hasPermission(permissionLookup("session.create", "provider.gamma", "model.xyz")),
    ).toBe(true);
    expect(
      store.hasPermission(permissionLookup("chat.completions", "provider.gamma", "model.xyz")),
    ).toBe(false);
  });

  it("rejects wildcard scopes for non-wildcard capabilities", () => {
    const clock = createClock("2026-03-23T12:00:00.000Z");
    const { store } = createStoreHarness(clock);

    expect(() =>
      store.grantPermission({
        origin: "https://app.example.com",
        providerId: GRANT_SCOPE_WILDCARD,
        modelId: GRANT_SCOPE_WILDCARD,
        capabilities: ["chat.completions"],
        grantType: "persistent",
      }),
    ).toThrowError(GrantValidationError);
  });

  it("revokes overlapping grants deterministically and emits explicit reasons", () => {
    const clock = createClock("2026-03-23T12:00:00.000Z");
    const { events, store } = createStoreHarness(clock);
    const revocations: Array<{ id: string; reason: string }> = [];

    events.on("grant-revoked", (event) => {
      revocations.push({ id: event.grant.id, reason: event.reason });
    });

    const initial = store.grantPermission({
      origin: "https://app.example.com",
      providerId: "provider.alpha",
      modelId: "model.one",
      capabilities: ["chat.completions"],
      grantType: "persistent",
    });

    clock.advance(25);
    const replacement = store.grantPermission({
      origin: "https://app.example.com",
      providerId: "provider.alpha",
      modelId: "model.one",
      capabilities: ["chat.completions"],
      grantType: "session",
    });

    const matched = store.checkPermission(
      permissionLookup("chat.completions", "provider.alpha", "model.one"),
    );
    expect(matched.allowed).toBe(true);
    expect(matched.grant?.id).toBe(replacement.id);
    expect(store.getGrant(initial.id)).toBeUndefined();
    expect(revocations).toContainEqual({ id: initial.id, reason: "superseded" });

    store.revokeGrant(replacement.id, "user");
    expect(store.hasPermission(permissionLookup("chat.completions"))).toBe(false);
    expect(revocations).toContainEqual({ id: replacement.id, reason: "user" });
  });

  it("marks expired grants revoked when checked after expiry", () => {
    const clock = createClock("2026-03-23T12:00:00.000Z");
    const { events, store } = createStoreHarness(clock);
    const revocations: Array<{ id: string; reason: string }> = [];

    events.on("grant-revoked", (event) => {
      revocations.push({ id: event.grant.id, reason: event.reason });
    });

    const sessionGrant = store.grantPermission({
      origin: "https://app.example.com",
      providerId: "provider.alpha",
      modelId: "model.one",
      capabilities: ["chat.stream"],
      grantType: "session",
    });

    clock.advance(1_000);
    const result = store.checkPermission(permissionLookup("chat.stream"));
    expect(result.allowed).toBe(false);
    expect(store.getGrant(sessionGrant.id)).toBeUndefined();
    expect(revocations).toContainEqual({ id: sessionGrant.id, reason: "expired" });
  });
});
