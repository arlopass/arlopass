// apps/bridge/src/__tests__/vault-encryption.test.ts
import { describe, expect, it } from "vitest";
import { deriveKey, encryptVault, decryptVault, HEADER_SIZE } from "../vault/vault-encryption.js";
import type { Vault } from "../vault/vault-types.js";
import { createEmptyVault } from "../vault/vault-types.js";

describe("deriveKey", () => {
  it("produces a 32-byte key from password + salt", () => {
    const salt = Buffer.alloc(32, 0xaa);
    const key = deriveKey("test-password", salt);
    expect(key.length).toBe(32);
  });

  it("produces the same key for same password + salt", () => {
    const salt = Buffer.alloc(32, 0xbb);
    const key1 = deriveKey("hello", salt);
    const key2 = deriveKey("hello", salt);
    expect(Buffer.compare(key1, key2)).toBe(0);
  });

  it("produces different keys for different passwords", () => {
    const salt = Buffer.alloc(32, 0xcc);
    const key1 = deriveKey("password-a", salt);
    const key2 = deriveKey("password-b", salt);
    expect(Buffer.compare(key1, key2)).not.toBe(0);
  });
});

describe("encryptVault + decryptVault roundtrip", () => {
  it("encrypts and decrypts an empty vault (password mode)", () => {
    const vault = createEmptyVault();
    const salt = Buffer.alloc(32, 0x11);
    const key = deriveKey("my-password", salt);
    const encrypted = encryptVault(vault, key, salt, "password");
    expect(encrypted.length).toBeGreaterThan(HEADER_SIZE);
    expect(encrypted.subarray(0, 4).toString("ascii")).toBe("ARLO");

    const decrypted = decryptVault(encrypted, key);
    expect(decrypted).toEqual(vault);
  });

  it("encrypts and decrypts a vault with data", () => {
    const vault = createEmptyVault();
    vault.credentials.push({
      id: "cred.abc123",
      connectorId: "anthropic",
      name: "My Key",
      fields: { apiKey: "sk-ant-test-123" },
      createdAt: "2026-03-27T00:00:00Z",
      lastUsedAt: "2026-03-27T00:00:00Z",
    });
    const salt = Buffer.alloc(32, 0x22);
    const key = deriveKey("secret", salt);
    const encrypted = encryptVault(vault, key, salt, "password");
    const decrypted = decryptVault(encrypted, key);
    expect(decrypted.credentials).toHaveLength(1);
    expect(decrypted.credentials[0].fields.apiKey).toBe("sk-ant-test-123");
  });

  it("fails to decrypt with wrong key", () => {
    const vault = createEmptyVault();
    const salt = Buffer.alloc(32, 0x33);
    const rightKey = deriveKey("right", salt);
    const wrongKey = deriveKey("wrong", salt);
    const encrypted = encryptVault(vault, rightKey, salt, "password");
    expect(() => decryptVault(encrypted, wrongKey)).toThrow();
  });

  it("detects tampered ciphertext", () => {
    const vault = createEmptyVault();
    const salt = Buffer.alloc(32, 0x44);
    const key = deriveKey("tamper-test", salt);
    const encrypted = encryptVault(vault, key, salt, "password");
    encrypted[HEADER_SIZE + 5] ^= 0xff;
    expect(() => decryptVault(encrypted, key)).toThrow();
  });

  it("rejects files with wrong magic bytes", () => {
    const vault = createEmptyVault();
    const salt = Buffer.alloc(32, 0x55);
    const key = deriveKey("magic-test", salt);
    const encrypted = encryptVault(vault, key, salt, "password");
    encrypted[0] = 0x00;
    expect(() => decryptVault(encrypted, key)).toThrow(/magic/i);
  });

  it("stores keyMode in header", () => {
    const vault = createEmptyVault();
    const salt = Buffer.alloc(32, 0x66);
    const key = deriveKey("mode-test", salt);
    const forPassword = encryptVault(vault, key, salt, "password");
    const forKeychain = encryptVault(vault, key, salt, "keychain");
    expect(forPassword[5]).toBe(0);
    expect(forKeychain[5]).toBe(1);
  });
});
