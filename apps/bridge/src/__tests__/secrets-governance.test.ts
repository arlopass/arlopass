/**
 * Tests for bridge secret governance modules:
 *  - KeychainStore
 *  - KeyRotationManager
 *  - RevokeInvalidator
 *
 * Coverage:
 *  - OS keychain lookup failures deny by default (return undefined)
 *  - Keychain store/retrieve/delete lifecycle
 *  - Key rotation updates active key reference safely
 *  - Rotation listeners are notified
 *  - Revoke event invalidates cached token material immediately
 *  - isRevoked() returns true after invalidate()
 *  - Listener errors do not interrupt revocation
 *  - listRevokedIds returns sorted IDs
 */
import { describe, expect, it, vi } from "vitest";

import type { KeychainBackend } from "../secrets/keychain-store.js";
import {
  KeychainStore,
  KeychainError,
  buildBridgeCloudAccountName,
} from "../secrets/keychain-store.js";
import { KeyRotationManager } from "../secrets/rotation.js";
import { RevokeInvalidator } from "../secrets/revoke-invalidator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFaultyBackend(): KeychainBackend {
  return {
    getPassword: vi.fn().mockRejectedValue(new Error("keychain unavailable")),
    setPassword: vi.fn().mockRejectedValue(new Error("keychain unavailable")),
    deletePassword: vi.fn().mockRejectedValue(new Error("keychain unavailable")),
  };
}

const TEST_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VdAyEAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
-----END PUBLIC KEY-----`;

// ---------------------------------------------------------------------------
// KeychainStore — deny by default on failure
// ---------------------------------------------------------------------------

describe("KeychainStore — deny by default on lookup failure", () => {
  it("returns undefined when the backend throws on getPassword", async () => {
    const store = new KeychainStore({
      service: "byom.test",
      backend: makeFaultyBackend(),
    });

    const result = await store.retrieve("api.key");
    expect(result).toBeUndefined();
  });

  it("returns undefined when the secret does not exist in the backend", async () => {
    const store = new KeychainStore({ service: "byom.test" });
    const result = await store.retrieve("nonexistent.key");
    expect(result).toBeUndefined();
  });

  it("returns false (not throws) when delete fails", async () => {
    const store = new KeychainStore({
      service: "byom.test",
      backend: makeFaultyBackend(),
    });
    const result = await store.delete("any.key");
    expect(result).toBe(false);
  });

  it("throws KeychainError when store fails", async () => {
    const store = new KeychainStore({
      service: "byom.test",
      backend: makeFaultyBackend(),
    });
    await expect(store.store("api.key", "secret")).rejects.toThrow(KeychainError);
  });
});

// ---------------------------------------------------------------------------
// KeychainStore — happy path
// ---------------------------------------------------------------------------

describe("KeychainStore — store/retrieve/delete lifecycle", () => {
  it("stores and retrieves a secret", async () => {
    const store = new KeychainStore({ service: "byom.test" });

    await store.store("api.token", "sk-abc123");
    const retrieved = await store.retrieve("api.token");

    expect(retrieved).toBe("sk-abc123");
  });

  it("returns undefined after delete", async () => {
    const store = new KeychainStore({ service: "byom.test" });
    await store.store("api.token", "sk-abc123");
    await store.delete("api.token");

    const result = await store.retrieve("api.token");
    expect(result).toBeUndefined();
  });

  it("isolates secrets by service name", async () => {
    const store1 = new KeychainStore({ service: "byom.service.a" });
    const store2 = new KeychainStore({ service: "byom.service.b" });

    await store1.store("token", "value-a");
    await store2.store("token", "value-b");

    expect(await store1.retrieve("token")).toBe("value-a");
    expect(await store2.retrieve("token")).toBe("value-b");
  });

  it("builds deterministic bridge-cloud namespaced account keys", async () => {
    const store = new KeychainStore({ service: "byom.test" });
    const credentialAccount = buildBridgeCloudAccountName({
      namespace: "credential",
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      recordId: "credref.provider.claude.anthropic.api_key.0001",
    });
    const metadataAccount = buildBridgeCloudAccountName({
      namespace: "metadata",
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      recordId: "credref.provider.claude.anthropic.api_key.0001",
    });

    expect(credentialAccount).toBe(
      "bridge.cloud.v1.credential.provider.claude.anthropic.api_key.credref.provider.claude.anthropic.api_key.0001",
    );
    expect(metadataAccount).toBe(
      "bridge.cloud.v1.metadata.provider.claude.anthropic.api_key.credref.provider.claude.anthropic.api_key.0001",
    );
    expect(credentialAccount).not.toBe(metadataAccount);

    await store.store(credentialAccount, "credential-secret");
    await store.store(metadataAccount, '{"refreshedAt":"2026-03-24T00:00:00.000Z"}');

    expect(await store.retrieve(credentialAccount)).toBe("credential-secret");
    expect(await store.retrieve(metadataAccount)).toBe(
      '{"refreshedAt":"2026-03-24T00:00:00.000Z"}',
    );
  });

  it("rejects unsafe bridge-cloud account namespace segments", () => {
    expect(() =>
      buildBridgeCloudAccountName({
        namespace: "credential",
        providerId: "provider claude",
        methodId: "anthropic.api_key",
        recordId: "credref.provider.claude.anthropic.api_key.0001",
      }),
    ).toThrow(KeychainError);
  });
});

// ---------------------------------------------------------------------------
// KeyRotationManager — key rotation updates policy-bound references
// ---------------------------------------------------------------------------

describe("KeyRotationManager — rotation updates active key reference", () => {
  it("activeKeyId is undefined before any key is created", () => {
    const manager = new KeyRotationManager();
    expect(manager.activeKeyId).toBeUndefined();
  });

  it("activeKeyId is set after createInitialKey", () => {
    const manager = new KeyRotationManager();
    manager.createInitialKey({ keyId: "key.v1", publicKeyPem: TEST_PEM });
    expect(manager.activeKeyId).toBe("key.v1");
  });

  it("rotation updates activeKeyId to the new key", () => {
    const manager = new KeyRotationManager();
    manager.createInitialKey({ keyId: "key.v1", publicKeyPem: TEST_PEM });
    manager.rotate("key.v1", {
      nextKeyId: "key.v2",
      nextPublicKeyPem: TEST_PEM,
    });
    expect(manager.activeKeyId).toBe("key.v2");
  });

  it("rotation notifies all listeners with the correct event", () => {
    const manager = new KeyRotationManager();
    manager.createInitialKey({ keyId: "key.v1", publicKeyPem: TEST_PEM });

    const listener = vi.fn();
    manager.onRotation(listener);

    manager.rotate("key.v1", {
      nextKeyId: "key.v2",
      nextPublicKeyPem: TEST_PEM,
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]![0]).toMatchObject({
      previousKeyId: "key.v1",
      currentKeyId: "key.v2",
    });
  });

  it("rotation listener disposer stops future notifications", () => {
    const manager = new KeyRotationManager();
    manager.createInitialKey({ keyId: "key.v1", publicKeyPem: TEST_PEM });

    const listener = vi.fn();
    const dispose = manager.onRotation(listener);
    dispose();

    manager.rotate("key.v1", { nextKeyId: "key.v2", nextPublicKeyPem: TEST_PEM });

    expect(listener).not.toHaveBeenCalled();
  });

  it("previous key is marked as rotated in the underlying manager", () => {
    const manager = new KeyRotationManager();
    manager.createInitialKey({ keyId: "key.v1", publicKeyPem: TEST_PEM });
    manager.rotate("key.v1", { nextKeyId: "key.v2", nextPublicKeyPem: TEST_PEM });

    const prevKey = manager.keyManager.getKey("key.v1");
    expect(prevKey?.status).toBe("rotated");
  });

  it("rotation listener error does not interrupt the rotation", () => {
    const manager = new KeyRotationManager();
    manager.createInitialKey({ keyId: "key.v1", publicKeyPem: TEST_PEM });
    manager.onRotation(() => {
      throw new Error("listener blew up");
    });

    expect(() =>
      manager.rotate("key.v1", { nextKeyId: "key.v2", nextPublicKeyPem: TEST_PEM }),
    ).not.toThrow();
    expect(manager.activeKeyId).toBe("key.v2");
  });
});

// ---------------------------------------------------------------------------
// RevokeInvalidator — immediate invalidation on revoke events
// ---------------------------------------------------------------------------

describe("RevokeInvalidator — invalidate cached token material immediately", () => {
  it("isRevoked returns false before invalidation", () => {
    const invalidator = new RevokeInvalidator();
    expect(invalidator.isRevoked("key.v1")).toBe(false);
  });

  it("isRevoked returns true immediately after invalidate()", () => {
    const invalidator = new RevokeInvalidator();
    invalidator.invalidate({
      keyId: "key.v1",
      revokedAt: "2026-03-23T10:00:00.000Z",
    });
    expect(invalidator.isRevoked("key.v1")).toBe(true);
  });

  it("getRevocationRecord returns the revocation event", () => {
    const invalidator = new RevokeInvalidator();
    const event = { keyId: "key.v1", revokedAt: "2026-03-23T10:00:00.000Z", reason: "compromised" };
    invalidator.invalidate(event);

    expect(invalidator.getRevocationRecord("key.v1")).toMatchObject(event);
  });

  it("notifies all registered listeners synchronously on invalidate()", () => {
    const invalidator = new RevokeInvalidator();
    const listener = vi.fn();
    invalidator.onInvalidation(listener);

    invalidator.invalidate({ keyId: "key.v1", revokedAt: "2026-03-23T10:00:00.000Z" });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]![0]).toMatchObject({ keyId: "key.v1" });
  });

  it("listener disposer prevents future notifications", () => {
    const invalidator = new RevokeInvalidator();
    const listener = vi.fn();
    const dispose = invalidator.onInvalidation(listener);
    dispose();

    invalidator.invalidate({ keyId: "key.v1", revokedAt: "2026-03-23T10:00:00.000Z" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("listener error does not interrupt invalidation of subsequent keys", () => {
    const invalidator = new RevokeInvalidator();
    invalidator.onInvalidation(() => {
      throw new Error("listener failed");
    });

    expect(() =>
      invalidator.invalidate({ keyId: "key.v1", revokedAt: "2026-03-23T10:00:00.000Z" }),
    ).not.toThrow();

    expect(invalidator.isRevoked("key.v1")).toBe(true);
  });

  it("listRevokedIds returns sorted key IDs", () => {
    const invalidator = new RevokeInvalidator();
    const revokedAt = "2026-03-23T10:00:00.000Z";
    invalidator.invalidate({ keyId: "key.z", revokedAt });
    invalidator.invalidate({ keyId: "key.a", revokedAt });
    invalidator.invalidate({ keyId: "key.m", revokedAt });

    expect(invalidator.listRevokedIds()).toEqual(["key.a", "key.m", "key.z"]);
  });

  it("clear removes all revocation records", () => {
    const invalidator = new RevokeInvalidator();
    invalidator.invalidate({ keyId: "key.v1", revokedAt: "2026-03-23T10:00:00.000Z" });
    invalidator.clear();

    expect(invalidator.isRevoked("key.v1")).toBe(false);
    expect(invalidator.listRevokedIds()).toHaveLength(0);
  });
});
