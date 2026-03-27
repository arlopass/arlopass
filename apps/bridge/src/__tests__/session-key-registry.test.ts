import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SessionKeyRegistry } from "../session/session-key-registry.js";

const BASE_TIME_MS = Date.parse("2026-03-24T12:00:00.000Z");

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

describe("SessionKeyRegistry", () => {
  it("issues a session token and resolves the in-memory session key", () => {
    const now = { value: BASE_TIME_MS };
    const registry = new SessionKeyRegistry({
      now: () => new Date(now.value),
    });

    const sessionToken = "ab".repeat(32);
    registry.issue({
      extensionId: "ext.test",
      sessionToken,
      establishedAt: iso(BASE_TIME_MS),
      expiresAt: iso(BASE_TIME_MS + 60_000),
    });

    const resolved = registry.resolve(sessionToken);
    expect(resolved?.toString("hex")).toBe(sessionToken);
  });

  it("persists issued sessions across registry instances when stateFilePath is configured", () => {
    const now = { value: BASE_TIME_MS };
    const tempRoot = mkdtempSync(join(tmpdir(), "arlopass-session-key-registry-"));
    const stateFilePath = join(tempRoot, "session-keys.json");
    try {
      const sessionToken = "ef".repeat(32);
      const registryOne = new SessionKeyRegistry({
        now: () => new Date(now.value),
        stateFilePath,
      });

      registryOne.issue({
        extensionId: "ext.persisted",
        sessionToken,
        establishedAt: iso(BASE_TIME_MS),
        expiresAt: iso(BASE_TIME_MS + 60_000),
      });

      const registryTwo = new SessionKeyRegistry({
        now: () => new Date(now.value),
        stateFilePath,
      });
      const resolvedRecord = registryTwo.resolveRecord(sessionToken);
      expect(resolvedRecord?.extensionId).toBe("ext.persisted");
      expect(resolvedRecord?.sessionKey.toString("hex")).toBe(sessionToken);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("returns undefined for unknown or malformed session tokens", () => {
    const registry = new SessionKeyRegistry();
    expect(registry.resolve("ff".repeat(32))).toBeUndefined();
    expect(registry.resolve("not-hex")).toBeUndefined();
  });

  it("expires issued keys and cleans them up from memory", () => {
    const now = { value: BASE_TIME_MS };
    const registry = new SessionKeyRegistry({
      now: () => new Date(now.value),
    });

    const sessionToken = "cd".repeat(32);
    registry.issue({
      extensionId: "ext.expiry",
      sessionToken,
      establishedAt: iso(BASE_TIME_MS),
      expiresAt: iso(BASE_TIME_MS + 1_000),
    });
    expect(registry.resolve(sessionToken)?.toString("hex")).toBe(sessionToken);

    now.value = BASE_TIME_MS + 1_001;
    expect(registry.resolve(sessionToken)).toBeUndefined();
  });

  it("validates issue input strictly", () => {
    const registry = new SessionKeyRegistry();
    const token = "11".repeat(32);

    expect(() =>
      registry.issue({
        extensionId: "",
        sessionToken: token,
        establishedAt: iso(BASE_TIME_MS),
        expiresAt: iso(BASE_TIME_MS + 60_000),
      }),
    ).toThrow(/extensionId/i);

    expect(() =>
      registry.issue({
        extensionId: "ext.test",
        sessionToken: "invalid-token",
        establishedAt: iso(BASE_TIME_MS),
        expiresAt: iso(BASE_TIME_MS + 60_000),
      }),
    ).toThrow(/sessionToken/i);

    expect(() =>
      registry.issue({
        extensionId: "ext.test",
        sessionToken: token,
        establishedAt: "not-a-date",
        expiresAt: iso(BASE_TIME_MS + 60_000),
      }),
    ).toThrow(/establishedAt/i);

    expect(() =>
      registry.issue({
        extensionId: "ext.test",
        sessionToken: token,
        establishedAt: iso(BASE_TIME_MS + 5_000),
        expiresAt: iso(BASE_TIME_MS + 1_000),
      }),
    ).toThrow(/expiresAt/i);
  });
});
