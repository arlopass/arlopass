import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  InMemoryPolicyKeyManager,
  POLICY_KEY_MANAGEMENT_ERROR_CODES,
  POLICY_KEY_STATUS,
  PolicyKeyManagementError,
} from "../key-management.js";

function createPublicKeyPem(): string {
  const { publicKey } = generateKeyPairSync("ed25519");
  return publicKey.export({ type: "spki", format: "pem" }).toString();
}

function expectKeyManagementError(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(PolicyKeyManagementError);
  if (error instanceof PolicyKeyManagementError) {
    expect(error.code).toBe(code);
  }
}

describe("InMemoryPolicyKeyManager", () => {
  it("supports create, rotate, and revoke lifecycle with deterministic resolution", () => {
    const events: string[] = [];
    const manager = new InMemoryPolicyKeyManager({
      hooks: {
        onCreate: ({ current }) => {
          events.push(`create:${current.keyId}`);
        },
        onRotate: ({ previous, current }) => {
          events.push(`rotate:${previous.keyId}->${current.keyId}`);
        },
        onRevoke: ({ current }) => {
          events.push(`revoke:${current.keyId}`);
        },
      },
    });

    const keyOnePem = createPublicKeyPem();
    const keyTwoPem = createPublicKeyPem();

    const created = manager.createKey({
      keyId: "key.lifecycle.1",
      publicKeyPem: keyOnePem,
      createdAt: "2026-03-23T12:00:00.000Z",
    });
    expect(created.status).toBe(POLICY_KEY_STATUS.ACTIVE);
    expect(manager.resolvePublicKey("key.lifecycle.1")).toBe(keyOnePem.trim());

    const rotated = manager.rotateKey("key.lifecycle.1", {
      nextKeyId: "key.lifecycle.2",
      nextPublicKeyPem: keyTwoPem,
      rotatedAt: "2026-03-23T12:10:00.000Z",
    });
    expect(rotated.previous.status).toBe(POLICY_KEY_STATUS.ROTATED);
    expect(rotated.previous.replacementKeyId).toBe("key.lifecycle.2");
    expect(rotated.current.status).toBe(POLICY_KEY_STATUS.ACTIVE);
    expect(manager.resolvePublicKey("key.lifecycle.1")).toBeUndefined();
    expect(
      manager.resolvePublicKey("key.lifecycle.1", {
        includeRotated: true,
      }),
    ).toBe(keyOnePem.trim());
    expect(manager.resolvePublicKey("key.lifecycle.2")).toBe(keyTwoPem.trim());

    const revoked = manager.revokeKey("key.lifecycle.2", {
      revokedAt: "2026-03-23T12:20:00.000Z",
      reason: "manual revoke",
    });
    expect(revoked.status).toBe(POLICY_KEY_STATUS.REVOKED);
    expect(revoked.revocationReason).toBe("manual revoke");
    expect(manager.resolvePublicKey("key.lifecycle.2")).toBeUndefined();
    expect(
      manager.resolvePublicKey("key.lifecycle.2", {
        includeRevoked: true,
      }),
    ).toBe(keyTwoPem.trim());

    expect(events).toEqual([
      "create:key.lifecycle.1",
      "rotate:key.lifecycle.1->key.lifecycle.2",
      "revoke:key.lifecycle.2",
    ]);
  });

  it("enforces lifecycle contracts for duplicate, inactive, and already-revoked keys", () => {
    const manager = new InMemoryPolicyKeyManager();
    const keyOnePem = createPublicKeyPem();
    const keyTwoPem = createPublicKeyPem();
    const keyThreePem = createPublicKeyPem();

    manager.createKey({
      keyId: "key.contract.1",
      publicKeyPem: keyOnePem,
    });

    expect(() =>
      manager.createKey({
        keyId: "key.contract.1",
        publicKeyPem: keyTwoPem,
      }),
    ).toThrowError(PolicyKeyManagementError);

    try {
      manager.createKey({
        keyId: "key.contract.1",
        publicKeyPem: keyTwoPem,
      });
    } catch (error) {
      expectKeyManagementError(error, POLICY_KEY_MANAGEMENT_ERROR_CODES.KEY_ALREADY_EXISTS);
    }

    manager.rotateKey("key.contract.1", {
      nextKeyId: "key.contract.2",
      nextPublicKeyPem: keyTwoPem,
    });

    expect(() =>
      manager.rotateKey("key.contract.1", {
        nextKeyId: "key.contract.3",
        nextPublicKeyPem: keyThreePem,
      }),
    ).toThrowError(PolicyKeyManagementError);

    try {
      manager.rotateKey("key.contract.1", {
        nextKeyId: "key.contract.3",
        nextPublicKeyPem: keyThreePem,
      });
    } catch (error) {
      expectKeyManagementError(error, POLICY_KEY_MANAGEMENT_ERROR_CODES.KEY_NOT_ACTIVE);
    }

    manager.revokeKey("key.contract.2");
    expect(() => manager.revokeKey("key.contract.2")).toThrowError(PolicyKeyManagementError);

    try {
      manager.revokeKey("key.contract.2");
    } catch (error) {
      expectKeyManagementError(error, POLICY_KEY_MANAGEMENT_ERROR_CODES.KEY_ALREADY_REVOKED);
    }
  });

  it("rolls back changes when lifecycle hooks fail", () => {
    const manager = new InMemoryPolicyKeyManager({
      hooks: {
        onRotate: () => {
          throw new Error("hook failure");
        },
      },
    });
    const keyOnePem = createPublicKeyPem();
    const keyTwoPem = createPublicKeyPem();

    manager.createKey({
      keyId: "key.rollback.1",
      publicKeyPem: keyOnePem,
    });

    expect(() =>
      manager.rotateKey("key.rollback.1", {
        nextKeyId: "key.rollback.2",
        nextPublicKeyPem: keyTwoPem,
      }),
    ).toThrowError(PolicyKeyManagementError);

    try {
      manager.rotateKey("key.rollback.1", {
        nextKeyId: "key.rollback.2",
        nextPublicKeyPem: keyTwoPem,
      });
    } catch (error) {
      expectKeyManagementError(error, POLICY_KEY_MANAGEMENT_ERROR_CODES.LIFECYCLE_HOOK_FAILED);
    }

    expect(manager.getKey("key.rollback.1")?.status).toBe(POLICY_KEY_STATUS.ACTIVE);
    expect(manager.getKey("key.rollback.2")).toBeUndefined();
  });
});