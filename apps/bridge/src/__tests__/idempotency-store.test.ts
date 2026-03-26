import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  InMemoryRequestIdempotencyStore,
  IdempotencyStoreError,
} from "../cloud/idempotency-store.js";

describe("InMemoryRequestIdempotencyStore", () => {
  it("returns replay response for duplicate completed request with identical fingerprint", () => {
    const store = new InMemoryRequestIdempotencyStore({
      now: () => new Date("2026-03-25T00:00:00.000Z"),
      ttlMs: 120_000,
      maxEntries: 16,
    });
    const decision = store.reserve({
      scope: "cloud.chat.execute",
      identityKey: "id-1",
      fingerprint: "fp-a",
    });
    expect(decision.kind).toBe("new");
    if (decision.kind !== "new") {
      return;
    }

    const response = Object.freeze({
      type: "cloud.chat.result",
      correlationId: "corr-1",
      content: "ok",
    });
    store.complete(decision.reservation, response);

    const replay = store.reserve({
      scope: "cloud.chat.execute",
      identityKey: "id-1",
      fingerprint: "fp-a",
    });
    expect(replay.kind).toBe("replay");
    if (replay.kind === "replay") {
      expect(replay.response).toEqual(response);
    }
  });

  it("returns conflict for duplicate identity with mismatched fingerprint", () => {
    const store = new InMemoryRequestIdempotencyStore({
      now: () => new Date("2026-03-25T00:00:00.000Z"),
      ttlMs: 120_000,
      maxEntries: 16,
    });
    const first = store.reserve({
      scope: "cloud.connection.complete",
      identityKey: "id-2",
      fingerprint: "fp-a",
    });
    expect(first.kind).toBe("new");
    if (first.kind !== "new") {
      return;
    }
    store.complete(first.reservation, {
      type: "cloud.connection.complete",
      connectionHandle: "connh.test",
    });

    const conflict = store.reserve({
      scope: "cloud.connection.complete",
      identityKey: "id-2",
      fingerprint: "fp-b",
    });
    expect(conflict.kind).toBe("conflict");
  });

  it("expires completed entries after TTL", () => {
    const clock = { nowMs: new Date("2026-03-25T00:00:00.000Z").getTime() };
    const store = new InMemoryRequestIdempotencyStore({
      now: () => new Date(clock.nowMs),
      ttlMs: 5_000,
      maxEntries: 16,
    });

    const first = store.reserve({
      scope: "cloud.chat.execute",
      identityKey: "id-3",
      fingerprint: "fp-a",
    });
    expect(first.kind).toBe("new");
    if (first.kind !== "new") {
      return;
    }
    store.complete(first.reservation, {
      type: "cloud.chat.result",
      correlationId: "corr-3",
      content: "ok",
    });

    clock.nowMs += 6_000;
    const second = store.reserve({
      scope: "cloud.chat.execute",
      identityKey: "id-3",
      fingerprint: "fp-b",
    });
    expect(second.kind).toBe("new");
  });

  it("fails closed when retention capacity is exceeded", () => {
    const store = new InMemoryRequestIdempotencyStore({
      now: () => new Date("2026-03-25T00:00:00.000Z"),
      ttlMs: 120_000,
      maxEntries: 1,
    });

    const first = store.reserve({
      scope: "cloud.chat.execute",
      identityKey: "id-4a",
      fingerprint: "fp-a",
    });
    expect(first.kind).toBe("new");
    if (first.kind !== "new") {
      return;
    }
    store.complete(first.reservation, {
      type: "cloud.chat.result",
      correlationId: "corr-4",
      content: "ok",
    });

    expect(() =>
      store.reserve({
        scope: "cloud.chat.execute",
        identityKey: "id-4b",
        fingerprint: "fp-b",
      }),
    ).toThrow(IdempotencyStoreError);
  });

  it("fails closed when active in-flight reservations exhaust capacity", () => {
    const store = new InMemoryRequestIdempotencyStore({
      now: () => new Date("2026-03-25T00:00:00.000Z"),
      ttlMs: 120_000,
      maxEntries: 1,
    });

    const first = store.reserve({
      scope: "cloud.chat.execute",
      identityKey: "id-active-1",
      fingerprint: "fp-a",
    });
    expect(first.kind).toBe("new");
    if (first.kind !== "new") {
      return;
    }

    expect(() =>
      store.reserve({
        scope: "cloud.chat.execute",
        identityKey: "id-active-2",
        fingerprint: "fp-b",
      }),
    ).toThrow(IdempotencyStoreError);
  });

  it("surfaces persistence failures via callback without throwing completion", () => {
    const tempRoot = mkdtempSync(join(process.cwd(), ".idempotency-failure-"));
    const nonDirectoryParent = join(tempRoot, "state-parent-file");
    writeFileSync(nonDirectoryParent, "file", "utf8");
    const stateFilePath = join(nonDirectoryParent, "state.json");
    const failures: Array<{ stateFilePath: string; message: string }> = [];
    try {
      const store = new InMemoryRequestIdempotencyStore({
        now: () => new Date("2026-03-25T00:00:00.000Z"),
        ttlMs: 120_000,
        maxEntries: 16,
        stateFilePath,
        onPersistenceFailure: (failure) => {
          failures.push({
            stateFilePath: failure.stateFilePath,
            message: failure.message,
          });
        },
      });
      const first = store.reserve({
        scope: "cloud.connection.complete",
        identityKey: "id-6",
        fingerprint: "fp-a",
      });
      expect(first.kind).toBe("new");
      if (first.kind !== "new") {
        return;
      }

      expect(() =>
        store.complete(first.reservation, {
          type: "cloud.connection.complete",
          connectionHandle: "connh.persist-fail",
        }),
      ).not.toThrow();
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        stateFilePath,
      });
      expect(failures[0]!.message.length).toBeGreaterThan(0);
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it("replays deeply frozen payloads to prevent nested mutation drift", () => {
    const store = new InMemoryRequestIdempotencyStore({
      now: () => new Date("2026-03-25T00:00:00.000Z"),
      ttlMs: 120_000,
      maxEntries: 16,
    });
    const first = store.reserve({
      scope: "cloud.chat.execute",
      identityKey: "id-frozen",
      fingerprint: "fp-frozen",
    });
    expect(first.kind).toBe("new");
    if (first.kind !== "new") {
      return;
    }

    store.complete(first.reservation, {
      type: "cloud.chat.result",
      correlationId: "corr-frozen",
      content: "ok",
      metadata: {
        nested: "value",
      },
    });

    const replay = store.reserve({
      scope: "cloud.chat.execute",
      identityKey: "id-frozen",
      fingerprint: "fp-frozen",
    });
    expect(replay.kind).toBe("replay");
    if (replay.kind !== "replay") {
      return;
    }

    expect(() => {
      (
        (replay.response as Record<string, unknown>)["metadata"] as Record<string, unknown>
      )["nested"] = "mutated";
    }).toThrow(TypeError);

    const replayAgain = store.reserve({
      scope: "cloud.chat.execute",
      identityKey: "id-frozen",
      fingerprint: "fp-frozen",
    });
    expect(replayAgain.kind).toBe("replay");
    if (replayAgain.kind === "replay") {
      expect(
        (
          replayAgain.response as Record<string, unknown>
        )["metadata"] as Record<string, unknown>,
      ).toMatchObject({
        nested: "value",
      });
    }
  });

  it("loads persisted completed entries and replays deterministically", () => {
    const tempRoot = mkdtempSync(join(process.cwd(), ".byom-idempotency-"));
    const stateFilePath = join(tempRoot, "idempotency-state.json");
    try {
      const writer = new InMemoryRequestIdempotencyStore({
        now: () => new Date("2026-03-25T00:00:00.000Z"),
        ttlMs: 120_000,
        maxEntries: 16,
        stateFilePath,
      });
      const first = writer.reserve({
        scope: "cloud.connection.complete",
        identityKey: "id-5",
        fingerprint: "fp-a",
      });
      expect(first.kind).toBe("new");
      if (first.kind !== "new") {
        return;
      }
      writer.complete(first.reservation, {
        type: "cloud.connection.complete",
        connectionHandle: "connh.persisted",
      });

      const reader = new InMemoryRequestIdempotencyStore({
        now: () => new Date("2026-03-25T00:00:01.000Z"),
        ttlMs: 120_000,
        maxEntries: 16,
        stateFilePath,
      });
      const replay = reader.reserve({
        scope: "cloud.connection.complete",
        identityKey: "id-5",
        fingerprint: "fp-a",
      });
      expect(replay.kind).toBe("replay");
      if (replay.kind === "replay") {
        expect(replay.response).toMatchObject({
          type: "cloud.connection.complete",
          connectionHandle: "connh.persisted",
        });
      }
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });
});
