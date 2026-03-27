import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { VaultLockout } from "../vault/vault-lockout.js";

describe("VaultLockout", () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vault-lockout-"));
    filePath = join(dir, "vault-lockout.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("allows first attempt with no lockout", () => {
    const lockout = new VaultLockout(filePath);
    expect(lockout.isLockedOut()).toBe(false);
  });

  it("tracks failed attempts", () => {
    const lockout = new VaultLockout(filePath);
    lockout.recordFailure();
    lockout.recordFailure();
    expect(lockout.getFailedAttempts()).toBe(2);
  });

  it("locks out after 5 failures for 30 seconds", () => {
    const nowMs = Date.parse("2026-03-27T00:00:00Z");
    const lockout = new VaultLockout(filePath, () => nowMs);
    for (let i = 0; i < 5; i++) lockout.recordFailure();
    expect(lockout.isLockedOut()).toBe(true);
    expect(lockout.getSecondsUntilRetry()).toBeGreaterThan(0);
    expect(lockout.getSecondsUntilRetry()).toBeLessThanOrEqual(30);
  });

  it("locks out after 10 failures for 5 minutes", () => {
    const nowMs = Date.parse("2026-03-27T00:00:00Z");
    const lockout = new VaultLockout(filePath, () => nowMs);
    for (let i = 0; i < 10; i++) lockout.recordFailure();
    expect(lockout.getSecondsUntilRetry()).toBeGreaterThan(30);
    expect(lockout.getSecondsUntilRetry()).toBeLessThanOrEqual(300);
  });

  it("locks out after 20 failures for 30 minutes", () => {
    const nowMs = Date.parse("2026-03-27T00:00:00Z");
    const lockout = new VaultLockout(filePath, () => nowMs);
    for (let i = 0; i < 20; i++) lockout.recordFailure();
    expect(lockout.getSecondsUntilRetry()).toBeGreaterThan(300);
    expect(lockout.getSecondsUntilRetry()).toBeLessThanOrEqual(1800);
  });

  it("persists state across instances", () => {
    const lockout1 = new VaultLockout(filePath);
    for (let i = 0; i < 5; i++) lockout1.recordFailure();

    const lockout2 = new VaultLockout(filePath);
    expect(lockout2.getFailedAttempts()).toBe(5);
    expect(lockout2.isLockedOut()).toBe(true);
  });

  it("resets on successful unlock", () => {
    const lockout = new VaultLockout(filePath);
    for (let i = 0; i < 5; i++) lockout.recordFailure();
    lockout.reset();
    expect(lockout.getFailedAttempts()).toBe(0);
    expect(lockout.isLockedOut()).toBe(false);
  });

  it("persists reset across instances", () => {
    const lockout1 = new VaultLockout(filePath);
    for (let i = 0; i < 5; i++) lockout1.recordFailure();
    lockout1.reset();

    const lockout2 = new VaultLockout(filePath);
    expect(lockout2.getFailedAttempts()).toBe(0);
  });
});
