import { describe, expect, it } from "vitest";

import {
  RuntimeEnforcer,
  type RuntimeGrant,
} from "../permissions/runtime-enforcer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function persistentGrant(
  overrides: Partial<RuntimeGrant> = {},
): RuntimeGrant {
  return {
    id: "grant.default",
    origin: "https://app.example",
    capability: "chat.completions",
    providerId: "provider.a",
    modelId: "model.a",
    grantType: "persistent",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Basic allow / deny
// ---------------------------------------------------------------------------

describe("RuntimeEnforcer.evaluate — basic allow/deny", () => {
  it("allows access when a matching persistent grant is present", () => {
    const enforcer = new RuntimeEnforcer();
    enforcer.syncGrant(persistentGrant({ id: "grant.1" }));

    const result = enforcer.evaluate({
      origin: "https://app.example",
      capability: "chat.completions",
      providerId: "provider.a",
      modelId: "model.a",
    });

    expect(result).toMatchObject({ allowed: true, consumed: false, grantId: "grant.1" });
  });

  it("denies when no grants are present", () => {
    const enforcer = new RuntimeEnforcer();
    expect(
      enforcer.evaluate({
        origin: "https://app.example",
        capability: "chat.completions",
        providerId: "provider.a",
        modelId: "model.a",
      }),
    ).toEqual({ allowed: false, reasonCode: "permission.denied" });
  });

  it("denies when origin does not match", () => {
    const enforcer = new RuntimeEnforcer();
    enforcer.syncGrant(persistentGrant());

    expect(
      enforcer.evaluate({
        origin: "https://other.example",
        capability: "chat.completions",
        providerId: "provider.a",
        modelId: "model.a",
      }),
    ).toEqual({ allowed: false, reasonCode: "permission.denied" });
  });

  it("denies when capability does not match", () => {
    const enforcer = new RuntimeEnforcer();
    enforcer.syncGrant(persistentGrant());

    expect(
      enforcer.evaluate({
        origin: "https://app.example",
        capability: "chat.stream",
        providerId: "provider.a",
        modelId: "model.a",
      }),
    ).toEqual({ allowed: false, reasonCode: "permission.denied" });
  });

  it("denies when providerId does not match (non-wildcard grant)", () => {
    const enforcer = new RuntimeEnforcer();
    enforcer.syncGrant(persistentGrant());

    expect(
      enforcer.evaluate({
        origin: "https://app.example",
        capability: "chat.completions",
        providerId: "provider.different",
        modelId: "model.a",
      }),
    ).toEqual({ allowed: false, reasonCode: "permission.denied" });
  });
});

// ---------------------------------------------------------------------------
// One-time grant consumption
// ---------------------------------------------------------------------------

describe("RuntimeEnforcer.evaluate — one-time grants", () => {
  it("consumes the grant on the first evaluation and denies subsequent ones", () => {
    const enforcer = new RuntimeEnforcer();
    enforcer.syncGrant(
      persistentGrant({ id: "grant.once", grantType: "one-time" }),
    );

    const req = {
      origin: "https://app.example",
      capability: "chat.completions" as const,
      providerId: "provider.a",
      modelId: "model.a",
    };

    const first = enforcer.evaluate(req);
    expect(first).toMatchObject({ allowed: true, consumed: true, grantId: "grant.once" });

    const second = enforcer.evaluate(req);
    expect(second).toEqual({ allowed: false, reasonCode: "permission.denied" });
  });
});

// ---------------------------------------------------------------------------
// Session grants
// ---------------------------------------------------------------------------

describe("RuntimeEnforcer.evaluate — session grants", () => {
  it("allows when sessionId matches", () => {
    const enforcer = new RuntimeEnforcer();
    enforcer.syncGrant(
      persistentGrant({
        id: "grant.session",
        grantType: "session",
        sessionId: "session.abc",
      }),
    );

    const result = enforcer.evaluate({
      origin: "https://app.example",
      capability: "chat.completions",
      providerId: "provider.a",
      modelId: "model.a",
      sessionId: "session.abc",
    });

    expect(result).toMatchObject({ allowed: true, grantId: "grant.session" });
  });

  it("denies when no sessionId is provided", () => {
    const enforcer = new RuntimeEnforcer();
    enforcer.syncGrant(
      persistentGrant({ grantType: "session", sessionId: "session.abc" }),
    );

    expect(
      enforcer.evaluate({
        origin: "https://app.example",
        capability: "chat.completions",
        providerId: "provider.a",
        modelId: "model.a",
      }),
    ).toEqual({ allowed: false, reasonCode: "permission.denied" });
  });

  it("denies when sessionId does not match", () => {
    const enforcer = new RuntimeEnforcer();
    enforcer.syncGrant(
      persistentGrant({ grantType: "session", sessionId: "session.abc" }),
    );

    expect(
      enforcer.evaluate({
        origin: "https://app.example",
        capability: "chat.completions",
        providerId: "provider.a",
        modelId: "model.a",
        sessionId: "session.other",
      }),
    ).toEqual({ allowed: false, reasonCode: "permission.denied" });
  });
});

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------

describe("RuntimeEnforcer.evaluate — expiry", () => {
  it("denies access after a grant's expiresAt has elapsed", () => {
    let nowMs = new Date("2026-03-23T00:00:00.000Z").getTime();
    const enforcer = new RuntimeEnforcer({ now: () => new Date(nowMs) });

    enforcer.syncGrant(
      persistentGrant({
        id: "grant.expiring",
        grantType: "session",
        sessionId: "session.1",
        expiresAt: "2026-03-23T00:01:00.000Z",
      }),
    );

    const req = {
      origin: "https://app.example",
      capability: "chat.completions" as const,
      providerId: "provider.a",
      modelId: "model.a",
      sessionId: "session.1",
    };

    expect(enforcer.evaluate(req)).toMatchObject({ allowed: true });

    nowMs = new Date("2026-03-23T00:01:01.000Z").getTime();
    expect(enforcer.evaluate(req)).toEqual({
      allowed: false,
      reasonCode: "permission.denied",
    });
  });
});

// ---------------------------------------------------------------------------
// Wildcard resource matching
// ---------------------------------------------------------------------------

describe("RuntimeEnforcer.evaluate — wildcard provider/model", () => {
  it("wildcard grant matches any concrete provider and model", () => {
    const enforcer = new RuntimeEnforcer();
    enforcer.syncGrant(
      persistentGrant({
        id: "grant.wildcard",
        capability: "provider.list",
        providerId: "*",
        modelId: "*",
      }),
    );

    expect(
      enforcer.evaluate({
        origin: "https://app.example",
        capability: "provider.list",
        providerId: "provider.x",
        modelId: "model.y",
      }),
    ).toMatchObject({ allowed: true, grantId: "grant.wildcard" });
  });

  it("prefers a specific grant over a wildcard grant when both match", () => {
    const enforcer = new RuntimeEnforcer();

    enforcer.syncGrant(
      persistentGrant({
        id: "grant.wildcard",
        capability: "provider.list",
        providerId: "*",
        modelId: "*",
      }),
    );
    enforcer.syncGrant(
      persistentGrant({
        id: "grant.specific",
        capability: "provider.list",
        providerId: "provider.a",
        modelId: "model.a",
      }),
    );

    const result = enforcer.evaluate({
      origin: "https://app.example",
      capability: "provider.list",
      providerId: "provider.a",
      modelId: "model.a",
    });

    expect(result).toMatchObject({ allowed: true, grantId: "grant.specific" });
  });
});

// ---------------------------------------------------------------------------
// Revocation
// ---------------------------------------------------------------------------

describe("RuntimeEnforcer.revokeGrant", () => {
  it("immediately removes the grant and denies subsequent requests", () => {
    const enforcer = new RuntimeEnforcer();
    enforcer.syncGrant(persistentGrant({ id: "grant.revoke-me" }));
    enforcer.revokeGrant("grant.revoke-me");

    expect(
      enforcer.evaluate({
        origin: "https://app.example",
        capability: "chat.completions",
        providerId: "provider.a",
        modelId: "model.a",
      }),
    ).toEqual({ allowed: false, reasonCode: "permission.denied" });
  });

  it("is a no-op for an unknown grant ID", () => {
    const enforcer = new RuntimeEnforcer();
    expect(() => enforcer.revokeGrant("unknown-id")).not.toThrow();
  });
});

describe("RuntimeEnforcer.revokeBySelector", () => {
  it("revokes all grants matching the origin and leaves others intact", () => {
    const enforcer = new RuntimeEnforcer();
    enforcer.syncGrant(persistentGrant({ id: "grant.a", origin: "https://app.example" }));
    enforcer.syncGrant(persistentGrant({ id: "grant.b", origin: "https://app.example" }));
    enforcer.syncGrant(
      persistentGrant({ id: "grant.other", origin: "https://other.example" }),
    );

    const revokedIds = enforcer.revokeBySelector({ origin: "https://app.example" });
    expect(revokedIds).toEqual(["grant.a", "grant.b"]);

    // The remaining origin should still be accessible.
    expect(
      enforcer.evaluate({
        origin: "https://other.example",
        capability: "chat.completions",
        providerId: "provider.a",
        modelId: "model.a",
      }),
    ).toMatchObject({ allowed: true });
  });

  it("revokes by sessionId", () => {
    const enforcer = new RuntimeEnforcer();
    enforcer.syncGrant(
      persistentGrant({
        id: "grant.session",
        grantType: "session",
        sessionId: "session.1",
      }),
    );
    enforcer.syncGrant(persistentGrant({ id: "grant.persistent" }));

    const revokedIds = enforcer.revokeBySelector({ sessionId: "session.1" });
    expect(revokedIds).toEqual(["grant.session"]);
  });

  it("returns empty array when no grants match the selector", () => {
    const enforcer = new RuntimeEnforcer();
    enforcer.syncGrant(persistentGrant());

    expect(
      enforcer.revokeBySelector({ origin: "https://nonexistent.example" }),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// syncGrant and clear
// ---------------------------------------------------------------------------

describe("RuntimeEnforcer.syncGrant / clear", () => {
  it("replaces an existing grant when syncGrant is called with the same ID", () => {
    const enforcer = new RuntimeEnforcer();
    enforcer.syncGrant(persistentGrant({ id: "grant.1", providerId: "provider.a" }));
    // Overwrite with a different providerId.
    enforcer.syncGrant(persistentGrant({ id: "grant.1", providerId: "provider.b" }));

    expect(
      enforcer.evaluate({
        origin: "https://app.example",
        capability: "chat.completions",
        providerId: "provider.a",
        modelId: "model.a",
      }),
    ).toEqual({ allowed: false, reasonCode: "permission.denied" });

    expect(
      enforcer.evaluate({
        origin: "https://app.example",
        capability: "chat.completions",
        providerId: "provider.b",
        modelId: "model.a",
      }),
    ).toMatchObject({ allowed: true });
  });

  it("clear removes all grants", () => {
    const enforcer = new RuntimeEnforcer();
    enforcer.syncGrant(persistentGrant({ id: "grant.1" }));
    enforcer.syncGrant(persistentGrant({ id: "grant.2" }));
    enforcer.clear();

    expect(
      enforcer.evaluate({
        origin: "https://app.example",
        capability: "chat.completions",
        providerId: "provider.a",
        modelId: "model.a",
      }),
    ).toEqual({ allowed: false, reasonCode: "permission.denied" });
  });
});
