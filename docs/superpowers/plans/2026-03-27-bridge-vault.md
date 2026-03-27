# Bridge Encrypted Vault — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all user state (credentials, providers, app connections, token usage) from per-browser `chrome.storage.local` to a centralized encrypted vault on the bridge, making extensions thin clients.

**Architecture:** The bridge gets a new `vault/` module with 7 files: types, encryption, lockout, compaction, secure-wipe, keychain, and the store class. The `BridgeHandler` switch gains 16 new `vault.*` cases that delegate to a `VaultStore` instance. Extensions replace `chrome.storage.local` reads/writes with native messages to the bridge.

**Tech Stack:** Node.js `crypto` (AES-256-GCM, PBKDF2), `fs` (atomic writes), Vitest, React hooks (extension UI)

**Spec:** `docs/superpowers/specs/2026-03-27-bridge-vault-design.md`

---

## File Structure

### New bridge files

| File | Responsibility |
|---|---|
| `apps/bridge/src/vault/vault-types.ts` | All TypeScript types: `Vault`, `VaultCredential`, `VaultProvider`, `VaultAppConnection`, `VaultUsage`, `UsageEntry`, `UsageTotals`, `VaultState`, `VaultError` |
| `apps/bridge/src/vault/secure-wipe.ts` | `secureWipe(buffer)` — zero-fill Buffer before deref |
| `apps/bridge/src/vault/vault-encryption.ts` | `deriveKey()`, `encrypt()`, `decrypt()`, file header parse/write (ARLO magic, version, keyMode, salt, iv) |
| `apps/bridge/src/vault/vault-lockout.ts` | `VaultLockout` class — persisted brute force tracking in `vault-lockout.json` |
| `apps/bridge/src/vault/vault-compaction.ts` | `compactUsage()` — move entries older than 30 days from `recentEntries` to `totals` |
| `apps/bridge/src/vault/vault-keychain.ts` | `KeychainAdapter` — read/write/delete 32-byte key from OS credential store (Windows/macOS/Linux) |
| `apps/bridge/src/vault/vault-store.ts` | `VaultStore` class — state machine (uninitialized/locked/unlocked), CRUD, auto-lock timer, delegates to encryption + lockout + compaction |

### New bridge test files

| File | Tests |
|---|---|
| `apps/bridge/src/__tests__/secure-wipe.test.ts` | Buffer zeroing |
| `apps/bridge/src/__tests__/vault-encryption.test.ts` | Key derivation, encrypt/decrypt roundtrip, header parse, tamper detection, wrong password |
| `apps/bridge/src/__tests__/vault-lockout.test.ts` | Attempt tracking, escalation, persistence across instances, reset on success |
| `apps/bridge/src/__tests__/vault-compaction.test.ts` | 30-day compaction, key computation, idempotency |
| `apps/bridge/src/__tests__/vault-store.test.ts` | Full state machine: setup, lock/unlock, CRUD for all entity types, auto-lock timer, error codes |
| `apps/bridge/src/__tests__/bridge-handler-vault.test.ts` | End-to-end: handler dispatches `vault.*` messages, auth gating, error responses |

### Modified bridge files

| File | Change |
|---|---|
| `apps/bridge/src/bridge-handler.ts` | Add `VaultStore` option, 16 new switch cases in `#dispatch`, new `#handleVault*` methods |
| `apps/bridge/src/main.ts` | Create `VaultStore` instance with file paths from env, pass to `BridgeHandler` |

### Modified extension files (Phase 2 — later tasks)

| File | Change |
|---|---|
| `apps/extension/src/ui/hooks/useWalletProviders.ts` | Replace `chrome.storage.local.get` with `vault.providers.list` native message |
| `apps/extension/src/ui/hooks/useTokenUsage.ts` | Replace `TokenUsageService` with `vault.usage.read` native message |
| `apps/extension/src/transport/runtime.ts` | Remove `WALLET_KEY_PROVIDERS` storage reads, add vault helpers |
| `apps/extension/src/ui/components/onboarding/AddProviderWizard.tsx` | Write to vault instead of `chrome.storage.local` |
| `apps/extension/src/popup.tsx` | Add vault status check on mount, gate UI on vault state |
| `apps/extension/src/background.ts` | Remove `WALLET_KEY_PROVIDERS` constant and storage writes |

---

## Task 1: Vault Types

**Files:**
- Create: `apps/bridge/src/vault/vault-types.ts`

- [ ] **Step 1: Create vault-types.ts with all type definitions**

```ts
// apps/bridge/src/vault/vault-types.ts

export type VaultCredential = {
  id: string;
  connectorId: string;
  name: string;
  fields: Record<string, string>;
  createdAt: string;
  lastUsedAt: string;
};

export type VaultProvider = {
  id: string;
  name: string;
  type: "local" | "cloud" | "cli";
  connectorId: string;
  credentialId: string;
  metadata: Record<string, string>;
  models: string[];
  status: string;
  createdAt: string;
};

export type VaultAppConnection = {
  id: string;
  origin: string;
  displayName: string;
  approvedProviders: string[];
  approvedModels: string[];
  permissions: Record<string, unknown>;
  rules: Record<string, unknown>;
  limits: Record<string, unknown>;
  createdAt: string;
  lastUsedAt: string;
};

export type UsageEntry = {
  origin: string;
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  timestamp: string;
};

export type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  lastUpdated: string;
};

export type VaultUsage = {
  recentEntries: UsageEntry[];
  totals: Record<string, UsageTotals>;
};

export type Vault = {
  version: 1;
  credentials: VaultCredential[];
  providers: VaultProvider[];
  appConnections: VaultAppConnection[];
  usage: VaultUsage;
};

export type VaultState = "uninitialized" | "locked" | "unlocked";

export type KeyMode = "password" | "keychain";

export type VaultErrorCode =
  | "vault.uninitialized"
  | "vault.locked"
  | "vault.locked_out"
  | "vault.corrupted"
  | "vault.write_failed"
  | "vault.inaccessible"
  | "vault.keychain_unavailable"
  | "vault.not_found"
  | "auth.invalid"
  | "request.invalid";

export class VaultError extends Error {
  readonly reasonCode: VaultErrorCode;
  constructor(message: string, reasonCode: VaultErrorCode) {
    super(message);
    this.name = "VaultError";
    this.reasonCode = reasonCode;
  }
}

export function createEmptyVault(): Vault {
  return {
    version: 1,
    credentials: [],
    providers: [],
    appConnections: [],
    usage: { recentEntries: [], totals: {} },
  };
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd apps/bridge && npx tsc --noEmit`
Expected: No errors (or only pre-existing ones unrelated to vault)

- [ ] **Step 3: Commit**

```bash
git add apps/bridge/src/vault/vault-types.ts
git commit -m "feat(vault): add vault type definitions"
```

---

## Task 2: Secure Wipe Utility

**Files:**
- Create: `apps/bridge/src/vault/secure-wipe.ts`
- Create: `apps/bridge/src/__tests__/secure-wipe.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/bridge/src/__tests__/secure-wipe.test.ts
import { describe, expect, it } from "vitest";
import { secureWipe } from "../vault/secure-wipe.js";

describe("secureWipe", () => {
  it("zeros a Buffer in-place", () => {
    const buf = Buffer.from([0xff, 0xab, 0x12, 0x99]);
    secureWipe(buf);
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  it("zeros a Uint8Array in-place", () => {
    const arr = new Uint8Array([1, 2, 3, 4, 5]);
    secureWipe(arr);
    expect(Array.from(arr).every((b) => b === 0)).toBe(true);
  });

  it("handles empty buffer", () => {
    const buf = Buffer.alloc(0);
    secureWipe(buf);
    expect(buf.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/bridge && npx vitest run src/__tests__/secure-wipe.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/bridge/src/vault/secure-wipe.ts

/**
 * Zero-fill a buffer in-place.
 * Uses .fill(0) which compiles to a memset on V8 Buffer internals.
 */
export function secureWipe(buffer: Buffer | Uint8Array): void {
  buffer.fill(0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/bridge && npx vitest run src/__tests__/secure-wipe.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/vault/secure-wipe.ts apps/bridge/src/__tests__/secure-wipe.test.ts
git commit -m "feat(vault): add secureWipe utility"
```

---

## Task 3: Vault Encryption Module

**Files:**
- Create: `apps/bridge/src/vault/vault-encryption.ts`
- Create: `apps/bridge/src/__tests__/vault-encryption.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
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
    // Flip a byte in the ciphertext area
    encrypted[HEADER_SIZE + 5] ^= 0xff;
    expect(() => decryptVault(encrypted, key)).toThrow();
  });

  it("rejects files with wrong magic bytes", () => {
    const vault = createEmptyVault();
    const salt = Buffer.alloc(32, 0x55);
    const key = deriveKey("magic-test", salt);
    const encrypted = encryptVault(vault, key, salt, "password");
    encrypted[0] = 0x00; // corrupt magic
    expect(() => decryptVault(encrypted, key)).toThrow(/magic/i);
  });

  it("stores keyMode in header", () => {
    const vault = createEmptyVault();
    const salt = Buffer.alloc(32, 0x66);
    const key = deriveKey("mode-test", salt);
    const forPassword = encryptVault(vault, key, salt, "password");
    const forKeychain = encryptVault(vault, key, salt, "keychain");
    // keyMode byte is at offset 5
    expect(forPassword[5]).toBe(0);
    expect(forKeychain[5]).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/bridge && npx vitest run src/__tests__/vault-encryption.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement vault-encryption.ts**

```ts
// apps/bridge/src/vault/vault-encryption.ts
import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";
import type { Vault, KeyMode } from "./vault-types.js";
import { secureWipe } from "./secure-wipe.js";

/**
 * File header layout (64 bytes total):
 *   [0..3]   magic   "ARLO" (4 bytes)
 *   [4]      version  1 (1 byte)
 *   [5]      keyMode  0=password, 1=keychain (1 byte)
 *   [6..37]  salt     32 bytes (PBKDF2 salt, permanent)
 *   [38..49] iv       12 bytes (GCM nonce, fresh per write)
 *   [50..63] reserved 14 bytes (zeros)
 */
export const HEADER_SIZE = 64;
const MAGIC = Buffer.from("ARLO", "ascii");
const PBKDF2_ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 32;

const KEY_MODE_MAP: Record<KeyMode, number> = { password: 0, keychain: 1 };
const KEY_MODE_REVERSE: Record<number, KeyMode> = { 0: "password", 1: "keychain" };

export function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
}

export function encryptVault(
  vault: Vault,
  key: Buffer,
  salt: Buffer,
  keyMode: KeyMode,
): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const plaintext = Buffer.from(JSON.stringify(vault), "utf8");

  const header = Buffer.alloc(HEADER_SIZE, 0);
  MAGIC.copy(header, 0);
  header[4] = 1; // version
  header[5] = KEY_MODE_MAP[keyMode];
  salt.copy(header, 6);
  iv.copy(header, 38);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes

  secureWipe(plaintext);

  return Buffer.concat([header, encrypted, authTag]);
}

export type ParsedHeader = {
  version: number;
  keyMode: KeyMode;
  salt: Buffer;
  iv: Buffer;
};

export function parseHeader(data: Buffer): ParsedHeader {
  if (data.length < HEADER_SIZE) {
    throw new Error("Vault file too small to contain a valid header.");
  }
  if (!data.subarray(0, 4).equals(MAGIC)) {
    throw new Error("Invalid vault file: bad magic bytes. Not an Arlopass vault.");
  }
  const version = data[4];
  if (version !== 1) {
    throw new Error(
      `Vault format version ${version} is not supported by this bridge. Please update.`,
    );
  }
  const keyModeByte = data[5];
  const keyMode = KEY_MODE_REVERSE[keyModeByte];
  if (keyMode === undefined) {
    throw new Error(`Unknown key mode: ${keyModeByte}`);
  }
  const salt = Buffer.from(data.subarray(6, 6 + SALT_LENGTH));
  const iv = Buffer.from(data.subarray(38, 38 + IV_LENGTH));
  return { version, keyMode, salt, iv };
}

export function decryptVault(data: Buffer, key: Buffer): Vault {
  const { iv } = parseHeader(data);

  const ciphertextAndTag = data.subarray(HEADER_SIZE);
  if (ciphertextAndTag.length < 16) {
    throw new Error("Vault file too small: no ciphertext.");
  }
  const authTag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);
  const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const vault: Vault = JSON.parse(decrypted.toString("utf8"));

  secureWipe(decrypted);
  return vault;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/bridge && npx vitest run src/__tests__/vault-encryption.test.ts`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/vault/vault-encryption.ts apps/bridge/src/__tests__/vault-encryption.test.ts
git commit -m "feat(vault): add AES-256-GCM encryption with PBKDF2 key derivation"
```

---

## Task 4: Vault Lockout (Brute Force Protection)

**Files:**
- Create: `apps/bridge/src/vault/vault-lockout.ts`
- Create: `apps/bridge/src/__tests__/vault-lockout.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// apps/bridge/src/__tests__/vault-lockout.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/bridge && npx vitest run src/__tests__/vault-lockout.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement vault-lockout.ts**

```ts
// apps/bridge/src/vault/vault-lockout.ts
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

type LockoutState = {
  failedAttempts: number;
  lastFailedAt: string | null;
  lockedUntil: string | null;
};

function emptyState(): LockoutState {
  return { failedAttempts: 0, lastFailedAt: null, lockedUntil: null };
}

// 5 failures → 30s, 10 → 300s, 20+ → 1800s
function computeLockoutSeconds(failedAttempts: number): number {
  if (failedAttempts >= 20) return 1800;
  if (failedAttempts >= 10) return 300;
  if (failedAttempts >= 5) return 30;
  return 0;
}

export class VaultLockout {
  readonly #filePath: string;
  readonly #now: () => number;
  #state: LockoutState;

  constructor(filePath: string, now?: () => number) {
    this.#filePath = filePath;
    this.#now = now ?? (() => Date.now());
    this.#state = this.#load();
  }

  isLockedOut(): boolean {
    if (this.#state.lockedUntil === null) return false;
    return this.#now() < new Date(this.#state.lockedUntil).getTime();
  }

  getSecondsUntilRetry(): number {
    if (this.#state.lockedUntil === null) return 0;
    const remaining = new Date(this.#state.lockedUntil).getTime() - this.#now();
    return Math.max(0, Math.ceil(remaining / 1000));
  }

  getFailedAttempts(): number {
    return this.#state.failedAttempts;
  }

  recordFailure(): void {
    this.#state.failedAttempts += 1;
    this.#state.lastFailedAt = new Date(this.#now()).toISOString();
    const lockSeconds = computeLockoutSeconds(this.#state.failedAttempts);
    if (lockSeconds > 0) {
      this.#state.lockedUntil = new Date(this.#now() + lockSeconds * 1000).toISOString();
    }
    this.#save();
  }

  reset(): void {
    this.#state = emptyState();
    this.#save();
  }

  #load(): LockoutState {
    if (!existsSync(this.#filePath)) return emptyState();
    try {
      const raw: unknown = JSON.parse(readFileSync(this.#filePath, "utf8"));
      if (
        typeof raw === "object" && raw !== null && !Array.isArray(raw) &&
        typeof (raw as Record<string, unknown>)["failedAttempts"] === "number"
      ) {
        const r = raw as Record<string, unknown>;
        return {
          failedAttempts: r["failedAttempts"] as number,
          lastFailedAt: typeof r["lastFailedAt"] === "string" ? r["lastFailedAt"] : null,
          lockedUntil: typeof r["lockedUntil"] === "string" ? r["lockedUntil"] : null,
        };
      }
    } catch { /* corrupted — reset */ }
    return emptyState();
  }

  #save(): void {
    const dir = dirname(this.#filePath);
    mkdirSync(dir, { recursive: true });
    const tmp = `${this.#filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.#state, null, 2), "utf8");
    renameSync(tmp, this.#filePath);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/bridge && npx vitest run src/__tests__/vault-lockout.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/vault/vault-lockout.ts apps/bridge/src/__tests__/vault-lockout.test.ts
git commit -m "feat(vault): add brute force lockout with disk persistence"
```

---

## Task 5: Usage Compaction

**Files:**
- Create: `apps/bridge/src/vault/vault-compaction.ts`
- Create: `apps/bridge/src/__tests__/vault-compaction.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// apps/bridge/src/__tests__/vault-compaction.test.ts
import { describe, expect, it } from "vitest";
import { compactUsage } from "../vault/vault-compaction.js";
import type { VaultUsage } from "../vault/vault-types.js";

const NOW = "2026-03-27T00:00:00Z";
const OLD = "2026-02-01T00:00:00Z"; // >30 days ago
const RECENT = "2026-03-20T00:00:00Z"; // <30 days ago

describe("compactUsage", () => {
  it("moves entries older than 30 days into totals", () => {
    const usage: VaultUsage = {
      recentEntries: [
        { origin: "https://app.test", providerId: "p1", modelId: "m1", inputTokens: 100, outputTokens: 50, timestamp: OLD },
        { origin: "https://app.test", providerId: "p1", modelId: "m1", inputTokens: 200, outputTokens: 100, timestamp: RECENT },
      ],
      totals: {},
    };
    const result = compactUsage(usage, new Date(NOW));
    expect(result.recentEntries).toHaveLength(1);
    expect(result.recentEntries[0].timestamp).toBe(RECENT);

    const key = "https://app.test\0p1\0m1";
    expect(result.totals[key]).toBeDefined();
    expect(result.totals[key].inputTokens).toBe(100);
    expect(result.totals[key].outputTokens).toBe(50);
    expect(result.totals[key].requestCount).toBe(1);
  });

  it("merges into existing totals additively", () => {
    const key = "https://app.test\0p1\0m1";
    const usage: VaultUsage = {
      recentEntries: [
        { origin: "https://app.test", providerId: "p1", modelId: "m1", inputTokens: 100, outputTokens: 50, timestamp: OLD },
      ],
      totals: {
        [key]: { inputTokens: 500, outputTokens: 250, requestCount: 10, lastUpdated: OLD },
      },
    };
    const result = compactUsage(usage, new Date(NOW));
    expect(result.recentEntries).toHaveLength(0);
    expect(result.totals[key].inputTokens).toBe(600);
    expect(result.totals[key].outputTokens).toBe(300);
    expect(result.totals[key].requestCount).toBe(11);
  });

  it("does nothing when all entries are recent", () => {
    const usage: VaultUsage = {
      recentEntries: [
        { origin: "https://a.test", providerId: "p", modelId: "m", inputTokens: 10, outputTokens: 5, timestamp: RECENT },
      ],
      totals: {},
    };
    const result = compactUsage(usage, new Date(NOW));
    expect(result.recentEntries).toHaveLength(1);
    expect(Object.keys(result.totals)).toHaveLength(0);
  });

  it("handles empty usage", () => {
    const usage: VaultUsage = { recentEntries: [], totals: {} };
    const result = compactUsage(usage, new Date(NOW));
    expect(result.recentEntries).toHaveLength(0);
    expect(Object.keys(result.totals)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/bridge && npx vitest run src/__tests__/vault-compaction.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement vault-compaction.ts**

```ts
// apps/bridge/src/vault/vault-compaction.ts
import type { VaultUsage, UsageTotals } from "./vault-types.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function makeKey(origin: string, providerId: string, modelId: string): string {
  return `${origin}\0${providerId}\0${modelId}`;
}

export function compactUsage(usage: VaultUsage, now: Date): VaultUsage {
  const cutoff = now.getTime() - THIRTY_DAYS_MS;
  const kept = [];
  const totals: Record<string, UsageTotals> = { ...usage.totals };
  const nowIso = now.toISOString();

  for (const entry of usage.recentEntries) {
    if (new Date(entry.timestamp).getTime() >= cutoff) {
      kept.push(entry);
      continue;
    }
    const key = makeKey(entry.origin, entry.providerId, entry.modelId);
    const existing = totals[key];
    if (existing !== undefined) {
      totals[key] = {
        inputTokens: existing.inputTokens + entry.inputTokens,
        outputTokens: existing.outputTokens + entry.outputTokens,
        requestCount: existing.requestCount + 1,
        lastUpdated: nowIso,
      };
    } else {
      totals[key] = {
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        requestCount: 1,
        lastUpdated: nowIso,
      };
    }
  }

  return { recentEntries: kept, totals };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/bridge && npx vitest run src/__tests__/vault-compaction.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/vault/vault-compaction.ts apps/bridge/src/__tests__/vault-compaction.test.ts
git commit -m "feat(vault): add usage compaction (30-day window)"
```

---

## Task 6: Vault Store (Core State Machine)

**Files:**
- Create: `apps/bridge/src/vault/vault-store.ts`
- Create: `apps/bridge/src/__tests__/vault-store.test.ts`

This is the largest task. The `VaultStore` class manages the vault state machine (uninitialized → locked → unlocked), delegates to encryption for disk I/O, uses lockout for brute force, and compaction for usage merges.

- [ ] **Step 1: Write failing tests for setup + lock/unlock lifecycle**

```ts
// apps/bridge/src/__tests__/vault-store.test.ts
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { VaultStore } from "../vault/vault-store.js";
import { VaultError } from "../vault/vault-types.js";

describe("VaultStore", () => {
  let dir: string;
  let vaultPath: string;
  let lockoutPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vault-store-"));
    vaultPath = join(dir, "vault.encrypted");
    lockoutPath = join(dir, "vault-lockout.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function createStore() {
    return new VaultStore({ vaultFilePath: vaultPath, lockoutFilePath: lockoutPath });
  }

  describe("lifecycle", () => {
    it("starts as uninitialized when no file exists", () => {
      const store = createStore();
      expect(store.getState()).toBe("uninitialized");
    });

    it("setup creates vault file and transitions to unlocked", () => {
      const store = createStore();
      store.setup({ keyMode: "password", password: "test-pass" });
      expect(store.getState()).toBe("unlocked");
      expect(existsSync(vaultPath)).toBe(true);
    });

    it("lock transitions to locked", () => {
      const store = createStore();
      store.setup({ keyMode: "password", password: "test-pass" });
      store.lock();
      expect(store.getState()).toBe("locked");
    });

    it("unlock with correct password transitions to unlocked", () => {
      const store = createStore();
      store.setup({ keyMode: "password", password: "test-pass" });
      store.lock();
      store.unlock({ password: "test-pass" });
      expect(store.getState()).toBe("unlocked");
    });

    it("unlock with wrong password throws auth.invalid", () => {
      const store = createStore();
      store.setup({ keyMode: "password", password: "right" });
      store.lock();
      expect(() => store.unlock({ password: "wrong" })).toThrow(VaultError);
      try { store.unlock({ password: "wrong" }); } catch (e) {
        expect((e as VaultError).reasonCode).toBe("auth.invalid");
      }
    });

    it("starts as locked when vault file exists", () => {
      const store1 = createStore();
      store1.setup({ keyMode: "password", password: "test-pass" });
      store1.lock();

      const store2 = createStore();
      expect(store2.getState()).toBe("locked");
    });

    it("status returns the current state", () => {
      const store = createStore();
      expect(store.status()).toEqual({ state: "uninitialized" });
      store.setup({ keyMode: "password", password: "s" });
      expect(store.status()).toEqual({ state: "unlocked" });
      store.lock();
      expect(store.status()).toEqual({ state: "locked" });
    });
  });

  describe("credentials CRUD", () => {
    it("saves and lists credentials (redacted)", () => {
      const store = createStore();
      store.setup({ keyMode: "password", password: "p" });
      store.saveCredential({
        id: "cred.1",
        connectorId: "anthropic",
        name: "My Key",
        fields: { apiKey: "sk-secret" },
      });
      const list = store.listCredentials();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe("cred.1");
      expect(list[0]).not.toHaveProperty("fields");
    });

    it("gets a single credential with full fields", () => {
      const store = createStore();
      store.setup({ keyMode: "password", password: "p" });
      store.saveCredential({
        id: "cred.1",
        connectorId: "anthropic",
        name: "Key",
        fields: { apiKey: "sk-secret" },
      });
      const cred = store.getCredential("cred.1");
      expect(cred.fields.apiKey).toBe("sk-secret");
    });

    it("throws vault.not_found for missing credential", () => {
      const store = createStore();
      store.setup({ keyMode: "password", password: "p" });
      expect(() => store.getCredential("cred.nope")).toThrow(VaultError);
    });

    it("upserts existing credential by id", () => {
      const store = createStore();
      store.setup({ keyMode: "password", password: "p" });
      store.saveCredential({ id: "cred.1", connectorId: "anthropic", name: "V1", fields: { apiKey: "old" } });
      store.saveCredential({ id: "cred.1", connectorId: "anthropic", name: "V2", fields: { apiKey: "new" } });
      const list = store.listCredentials();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe("V2");
    });

    it("deletes a credential", () => {
      const store = createStore();
      store.setup({ keyMode: "password", password: "p" });
      store.saveCredential({ id: "cred.1", connectorId: "a", name: "X", fields: {} });
      store.deleteCredential("cred.1");
      expect(store.listCredentials()).toHaveLength(0);
    });
  });

  describe("providers CRUD", () => {
    it("saves and lists providers", () => {
      const store = createStore();
      store.setup({ keyMode: "password", password: "p" });
      store.saveProvider({
        id: "prov.1", name: "Ollama", type: "local", connectorId: "ollama",
        credentialId: "", metadata: {}, models: ["llama3"], status: "connected",
      });
      expect(store.listProviders()).toHaveLength(1);
    });

    it("deletes a provider", () => {
      const store = createStore();
      store.setup({ keyMode: "password", password: "p" });
      store.saveProvider({
        id: "prov.1", name: "Ollama", type: "local", connectorId: "ollama",
        credentialId: "", metadata: {}, models: [], status: "connected",
      });
      store.deleteProvider("prov.1");
      expect(store.listProviders()).toHaveLength(0);
    });
  });

  describe("app connections CRUD", () => {
    it("saves and lists app connections", () => {
      const store = createStore();
      store.setup({ keyMode: "password", password: "p" });
      store.saveAppConnection({
        id: "app.1", origin: "https://chat.test", displayName: "Chat",
        approvedProviders: ["prov.1"], approvedModels: ["llama3"],
        permissions: {}, rules: {}, limits: {},
      });
      expect(store.listAppConnections()).toHaveLength(1);
    });

    it("deletes an app connection", () => {
      const store = createStore();
      store.setup({ keyMode: "password", password: "p" });
      store.saveAppConnection({
        id: "app.1", origin: "https://chat.test", displayName: "Chat",
        approvedProviders: [], approvedModels: [],
        permissions: {}, rules: {}, limits: {},
      });
      store.deleteAppConnection("app.1");
      expect(store.listAppConnections()).toHaveLength(0);
    });
  });

  describe("usage", () => {
    it("reads empty usage initially", () => {
      const store = createStore();
      store.setup({ keyMode: "password", password: "p" });
      const usage = store.readUsage();
      expect(usage.recentEntries).toHaveLength(0);
      expect(Object.keys(usage.totals)).toHaveLength(0);
    });

    it("flushes entries into the vault", () => {
      const store = createStore();
      store.setup({ keyMode: "password", password: "p" });
      store.flushUsage({
        entries: [
          { origin: "https://app.test", providerId: "p1", modelId: "m1", inputTokens: 100, outputTokens: 50, timestamp: new Date().toISOString() },
        ],
      });
      const usage = store.readUsage();
      expect(usage.recentEntries).toHaveLength(1);
    });
  });

  describe("auth gating", () => {
    it("throws vault.uninitialized when not set up", () => {
      const store = createStore();
      expect(() => store.listProviders()).toThrow(VaultError);
      try { store.listProviders(); } catch (e) {
        expect((e as VaultError).reasonCode).toBe("vault.uninitialized");
      }
    });

    it("throws vault.locked when locked", () => {
      const store = createStore();
      store.setup({ keyMode: "password", password: "p" });
      store.lock();
      expect(() => store.listProviders()).toThrow(VaultError);
      try { store.listProviders(); } catch (e) {
        expect((e as VaultError).reasonCode).toBe("vault.locked");
      }
    });
  });

  describe("persistence roundtrip", () => {
    it("data survives lock + unlock cycle", () => {
      const store = createStore();
      store.setup({ keyMode: "password", password: "p" });
      store.saveCredential({ id: "cred.1", connectorId: "a", name: "K", fields: { k: "v" } });
      store.saveProvider({ id: "prov.1", name: "O", type: "local", connectorId: "o", credentialId: "", metadata: {}, models: [], status: "connected" });
      store.lock();
      store.unlock({ password: "p" });
      expect(store.listCredentials()).toHaveLength(1);
      expect(store.listProviders()).toHaveLength(1);
      expect(store.getCredential("cred.1").fields.k).toBe("v");
    });

    it("data survives across VaultStore instances", () => {
      const store1 = createStore();
      store1.setup({ keyMode: "password", password: "p" });
      store1.saveCredential({ id: "cred.1", connectorId: "a", name: "K", fields: { k: "v" } });

      const store2 = createStore();
      store2.unlock({ password: "p" });
      expect(store2.listCredentials()).toHaveLength(1);
    });
  });

  describe("auto-lock", () => {
    it("auto-locks after timeout and transitions to locked state", async () => {
      const store = new VaultStore({
        vaultFilePath: vaultPath,
        lockoutFilePath: lockoutPath,
        autoLockMs: 50, // 50ms for fast test
      });
      store.setup({ keyMode: "password", password: "p" });
      expect(store.getState()).toBe("unlocked");

      await new Promise((r) => setTimeout(r, 100));
      expect(store.getState()).toBe("locked");
    });

    it("resets auto-lock timer on CRUD activity", async () => {
      const store = new VaultStore({
        vaultFilePath: vaultPath,
        lockoutFilePath: lockoutPath,
        autoLockMs: 150,
      });
      store.setup({ keyMode: "password", password: "p" });

      // Activity at 50ms resets timer
      await new Promise((r) => setTimeout(r, 50));
      store.saveCredential({ id: "cred.1", connectorId: "a", name: "K", fields: {} });

      // At 120ms (70ms after last activity): should still be unlocked
      await new Promise((r) => setTimeout(r, 70));
      expect(store.getState()).toBe("unlocked");

      // Wait for full timeout from last activity
      await new Promise((r) => setTimeout(r, 200));
      expect(store.getState()).toBe("locked");
    });

    it("data is persisted when auto-lock fires", async () => {
      const store1 = new VaultStore({
        vaultFilePath: vaultPath,
        lockoutFilePath: lockoutPath,
        autoLockMs: 50,
      });
      store1.setup({ keyMode: "password", password: "p" });
      store1.saveCredential({ id: "cred.1", connectorId: "a", name: "K", fields: { k: "v" } });

      await new Promise((r) => setTimeout(r, 100));
      expect(store1.getState()).toBe("locked");

      // Data should be accessible after unlock
      store1.unlock({ password: "p" });
      expect(store1.listCredentials()).toHaveLength(1);
    });
  });

  describe("write error handling", () => {
    it("throws vault.inaccessible for permission errors on write", () => {
      const store = createStore();
      store.setup({ keyMode: "password", password: "p" });
      // Use a path that will fail (e.g. inside a file as if it were a dir)
      const badStore = new VaultStore({
        vaultFilePath: join(vaultPath, "inside-file", "vault.encrypted"),
        lockoutFilePath: lockoutPath,
      });
      // Setup will fail because vaultPath is already a file, not a directory
      expect(() => badStore.setup({ keyMode: "password", password: "p" })).toThrow(VaultError);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/bridge && npx vitest run src/__tests__/vault-store.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement vault-store.ts**

```ts
// apps/bridge/src/vault/vault-store.ts
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type {
  Vault,
  VaultState,
  KeyMode,
  VaultCredential,
  VaultProvider,
  VaultAppConnection,
  VaultUsage,
  UsageEntry,
} from "./vault-types.js";
import { VaultError, createEmptyVault } from "./vault-types.js";
import { deriveKey, encryptVault, decryptVault, parseHeader } from "./vault-encryption.js";
import { VaultLockout } from "./vault-lockout.js";
import { compactUsage } from "./vault-compaction.js";
import { secureWipe } from "./secure-wipe.js";

export type VaultStoreOptions = {
  vaultFilePath: string;
  lockoutFilePath: string;
  autoLockMs?: number;
  now?: () => Date;
};

type RedactedCredential = Omit<VaultCredential, "fields">;

export class VaultStore {
  readonly #vaultFilePath: string;
  readonly #lockout: VaultLockout;
  readonly #autoLockMs: number;
  readonly #now: () => Date;

  #state: VaultState;
  #vault: Vault | null = null;
  #key: Buffer | null = null;
  #salt: Buffer | null = null;
  #keyMode: KeyMode = "password";
  #autoLockTimer: ReturnType<typeof setTimeout> | null = null;
  #lastTimerReset = 0;

  constructor(options: VaultStoreOptions) {
    this.#vaultFilePath = options.vaultFilePath;
    this.#lockout = new VaultLockout(options.lockoutFilePath, options.now ? () => options.now!().getTime() : undefined);
    this.#autoLockMs = options.autoLockMs ?? 30 * 60 * 1000;
    this.#now = options.now ?? (() => new Date());

    this.#state = existsSync(this.#vaultFilePath) ? "locked" : "uninitialized";
  }

  getState(): VaultState {
    return this.#state;
  }

  status(): { state: VaultState } {
    return { state: this.#state };
  }

  // -- Setup ------------------------------------------------------------------

  setup(input: { keyMode: KeyMode; password?: string; keychainKey?: Buffer }): void {
    if (this.#state !== "uninitialized") {
      throw new VaultError("Vault is already initialized.", "request.invalid");
    }
    const vault = createEmptyVault();
    const salt = randomBytes(32);
    let key: Buffer;

    if (input.keyMode === "password") {
      if (!input.password || input.password.length === 0) {
        throw new VaultError("Password is required for password mode.", "request.invalid");
      }
      key = deriveKey(input.password, salt);
    } else {
      if (!input.keychainKey || input.keychainKey.length !== 32) {
        throw new VaultError("Keychain key must be 32 bytes.", "request.invalid");
      }
      key = input.keychainKey;
    }

    const encrypted = encryptVault(vault, key, salt, input.keyMode);
    this.#atomicWrite(encrypted);

    this.#vault = vault;
    this.#key = key;
    this.#salt = salt;
    this.#keyMode = input.keyMode;
    this.#state = "unlocked";
    this.#startAutoLock();
  }

  // -- Lock / Unlock ----------------------------------------------------------

  lock(): void {
    this.#requireUnlocked();
    this.#persist();
    this.#wipeMemory();
    this.#state = "locked";
  }

  unlock(input: { password?: string; keychainKey?: Buffer }): void {
    if (this.#state === "uninitialized") {
      throw new VaultError("Vault not set up. Send vault.setup first.", "vault.uninitialized");
    }
    if (this.#state === "unlocked") return; // already unlocked

    if (this.#lockout.isLockedOut()) {
      const seconds = this.#lockout.getSecondsUntilRetry();
      throw new VaultError(
        `Too many failed attempts. Try again in ${seconds} seconds.`,
        "vault.locked_out",
      );
    }

    const fileData = this.#readFile();
    const header = parseHeader(fileData);
    this.#keyMode = header.keyMode;
    this.#salt = header.salt;

    let key: Buffer;
    if (header.keyMode === "password") {
      if (!input.password) {
        throw new VaultError("Password is required.", "request.invalid");
      }
      key = deriveKey(input.password, header.salt);
    } else {
      if (!input.keychainKey || input.keychainKey.length !== 32) {
        throw new VaultError("Keychain key must be 32 bytes.", "request.invalid");
      }
      key = input.keychainKey;
    }

    try {
      this.#vault = decryptVault(fileData, key);
    } catch {
      // Only count password mode failures as brute force
      if (header.keyMode === "password") {
        this.#lockout.recordFailure();
      }
      throw new VaultError("Incorrect password.", "auth.invalid");
    }

    this.#lockout.reset();
    this.#key = key;
    this.#state = "unlocked";

    // Run compaction on unlock
    this.#vault.usage = compactUsage(this.#vault.usage, this.#now());
    this.#persist();
    this.#startAutoLock();
  }

  // -- Credentials ------------------------------------------------------------

  listCredentials(): RedactedCredential[] {
    this.#requireUnlocked();
    return this.#vault!.credentials.map(({ fields: _, ...rest }) => rest);
  }

  getCredential(id: string): VaultCredential {
    this.#requireUnlocked();
    this.#touchAutoLock();
    const cred = this.#vault!.credentials.find((c) => c.id === id);
    if (!cred) {
      throw new VaultError(`Credential with ID ${id} not found.`, "vault.not_found");
    }
    return cred;
  }

  saveCredential(input: { id: string; connectorId: string; name: string; fields: Record<string, string> }): void {
    this.#requireUnlocked();
    this.#touchAutoLock();
    const vault = this.#vault!;
    const now = this.#now().toISOString();
    const idx = vault.credentials.findIndex((c) => c.id === input.id);
    const cred: VaultCredential = {
      id: input.id,
      connectorId: input.connectorId,
      name: input.name,
      fields: input.fields,
      createdAt: idx >= 0 ? vault.credentials[idx].createdAt : now,
      lastUsedAt: now,
    };
    if (idx >= 0) {
      vault.credentials[idx] = cred;
    } else {
      vault.credentials.push(cred);
    }
    this.#persist();
  }

  deleteCredential(id: string): void {
    this.#requireUnlocked();
    this.#touchAutoLock();
    const vault = this.#vault!;
    const idx = vault.credentials.findIndex((c) => c.id === id);
    if (idx < 0) {
      throw new VaultError(`Credential with ID ${id} not found.`, "vault.not_found");
    }
    vault.credentials.splice(idx, 1);
    this.#persist();
  }

  // -- Providers --------------------------------------------------------------

  listProviders(): VaultProvider[] {
    this.#requireUnlocked();
    this.#touchAutoLock();
    return this.#vault!.providers;
  }

  saveProvider(input: Omit<VaultProvider, "createdAt">): void {
    this.#requireUnlocked();
    this.#touchAutoLock();
    const vault = this.#vault!;
    const now = this.#now().toISOString();
    const idx = vault.providers.findIndex((p) => p.id === input.id);
    const provider: VaultProvider = {
      ...input,
      createdAt: idx >= 0 ? vault.providers[idx].createdAt : now,
    };
    if (idx >= 0) {
      vault.providers[idx] = provider;
    } else {
      vault.providers.push(provider);
    }
    this.#persist();
  }

  deleteProvider(id: string): void {
    this.#requireUnlocked();
    this.#touchAutoLock();
    const vault = this.#vault!;
    const idx = vault.providers.findIndex((p) => p.id === id);
    if (idx < 0) {
      throw new VaultError(`Provider with ID ${id} not found.`, "vault.not_found");
    }
    vault.providers.splice(idx, 1);
    this.#persist();
  }

  // -- App Connections --------------------------------------------------------

  listAppConnections(): VaultAppConnection[] {
    this.#requireUnlocked();
    this.#touchAutoLock();
    return this.#vault!.appConnections;
  }

  saveAppConnection(input: Omit<VaultAppConnection, "createdAt" | "lastUsedAt">): void {
    this.#requireUnlocked();
    this.#touchAutoLock();
    const vault = this.#vault!;
    const now = this.#now().toISOString();
    const idx = vault.appConnections.findIndex((a) => a.id === input.id);
    const conn: VaultAppConnection = {
      ...input,
      createdAt: idx >= 0 ? vault.appConnections[idx].createdAt : now,
      lastUsedAt: now,
    };
    if (idx >= 0) {
      vault.appConnections[idx] = conn;
    } else {
      vault.appConnections.push(conn);
    }
    this.#persist();
  }

  deleteAppConnection(id: string): void {
    this.#requireUnlocked();
    this.#touchAutoLock();
    const vault = this.#vault!;
    const idx = vault.appConnections.findIndex((a) => a.id === id);
    if (idx < 0) {
      throw new VaultError(`App connection with ID ${id} not found.`, "vault.not_found");
    }
    vault.appConnections.splice(idx, 1);
    this.#persist();
  }

  // -- Usage ------------------------------------------------------------------

  readUsage(): VaultUsage {
    this.#requireUnlocked();
    this.#touchAutoLock();
    return this.#vault!.usage;
  }

  flushUsage(input: { entries: UsageEntry[] }): void {
    this.#requireUnlocked();
    this.#touchAutoLock();
    const vault = this.#vault!;
    vault.usage.recentEntries.push(...input.entries);
    vault.usage = compactUsage(vault.usage, this.#now());
    this.#persist();
  }

  // -- Private ----------------------------------------------------------------

  #requireUnlocked(): void {
    if (this.#state === "uninitialized") {
      throw new VaultError("Vault not set up. Send vault.setup first.", "vault.uninitialized");
    }
    if (this.#state === "locked") {
      throw new VaultError("Vault is locked. Send vault.unlock first.", "vault.locked");
    }
  }

  #persist(): void {
    if (!this.#vault || !this.#key || !this.#salt) return;
    const encrypted = encryptVault(this.#vault, this.#key, this.#salt, this.#keyMode);
    this.#atomicWrite(encrypted);
  }

  #atomicWrite(data: Buffer): void {
    try {
      const dir = dirname(this.#vaultFilePath);
      mkdirSync(dir, { recursive: true });
      const tmp = `${this.#vaultFilePath}.tmp`;
      writeFileSync(tmp, data);
      renameSync(tmp, this.#vaultFilePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") {
        throw new VaultError("Cannot read/write vault file. Check file permissions.", "vault.inaccessible");
      }
      if (code === "ENOSPC") {
        throw new VaultError("Failed to write vault to disk. Check disk space and permissions.", "vault.write_failed");
      }
      throw new VaultError("Failed to write vault to disk. Check disk space and permissions.", "vault.write_failed");
    }
  }

  #readFile(): Buffer {
    try {
      return readFileSync(this.#vaultFilePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        throw new VaultError("Vault not set up. Send vault.setup first.", "vault.uninitialized");
      }
      if (code === "EACCES") {
        throw new VaultError("Cannot read vault file. Check file permissions.", "vault.inaccessible");
      }
      throw new VaultError("Failed to read vault file.", "vault.corrupted");
    }
  }

  #wipeMemory(): void {
    if (this.#key) { secureWipe(this.#key); this.#key = null; }
    this.#vault = null;
    this.#salt = null;
    this.#stopAutoLock();
  }

  #startAutoLock(): void {
    this.#stopAutoLock();
    this.#lastTimerReset = Date.now();
    this.#autoLockTimer = setTimeout(() => {
      if (this.#state === "unlocked") {
        this.lock();
      }
    }, this.#autoLockMs);
  }

  #touchAutoLock(): void {
    const now = Date.now();
    // Rate limit: max 1 reset per 10 seconds
    if (now - this.#lastTimerReset < 10_000) return;
    this.#startAutoLock();
  }

  #stopAutoLock(): void {
    if (this.#autoLockTimer !== null) {
      clearTimeout(this.#autoLockTimer);
      this.#autoLockTimer = null;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/bridge && npx vitest run src/__tests__/vault-store.test.ts`
Expected: PASS (all tests — lifecycle, CRUD, auth gating, persistence, auto-lock, write errors)

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/vault/vault-store.ts apps/bridge/src/__tests__/vault-store.test.ts
git commit -m "feat(vault): add VaultStore with full state machine and CRUD"
```

---

## Task 7: Wire Vault into Bridge Handler

**Files:**
- Modify: `apps/bridge/src/bridge-handler.ts`
- Create: `apps/bridge/src/__tests__/bridge-handler-vault.test.ts`

- [ ] **Step 1: Write failing tests for vault handler integration**

The tests follow the existing pattern in `bridge-handler-pairing.test.ts` — create a `BridgeHandler` with test options, obtain a session token via the test helper, then send vault messages.

```ts
// apps/bridge/src/__tests__/bridge-handler-vault.test.ts
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { BridgeHandler } from "../bridge-handler.js";
import { VaultStore } from "../vault/vault-store.js";
import type { NativeMessage } from "../native-host.js";
import { obtainSessionToken } from "./test-session-helper.js";

describe("BridgeHandler vault.* messages", () => {
  let dir: string;
  let handler: BridgeHandler;
  let sessionToken: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "vault-handler-"));
    const vaultStore = new VaultStore({
      vaultFilePath: join(dir, "vault.encrypted"),
      lockoutFilePath: join(dir, "vault-lockout.json"),
    });
    handler = new BridgeHandler({ vaultStore } as any);
    sessionToken = await obtainSessionToken(handler);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function send(msg: Record<string, unknown>): Promise<NativeMessage> {
    return handler.handle({ ...msg, sessionToken } as NativeMessage);
  }

  it("vault.status returns uninitialized", async () => {
    const res = await send({ type: "vault.status" });
    expect(res["type"]).toBe("vault.status");
    expect(res["state"]).toBe("uninitialized");
  });

  it("vault.setup creates vault", async () => {
    const res = await send({ type: "vault.setup", keyMode: "password", password: "test" });
    expect(res["type"]).toBe("vault.setup");
    expect(res["state"]).toBe("unlocked");
  });

  it("vault.lock + vault.unlock roundtrip", async () => {
    await send({ type: "vault.setup", keyMode: "password", password: "test" });
    const lockRes = await send({ type: "vault.lock" });
    expect(lockRes["type"]).toBe("vault.lock");

    const unlockRes = await send({ type: "vault.unlock", password: "test" });
    expect(unlockRes["type"]).toBe("vault.unlock");
    expect(unlockRes["state"]).toBe("unlocked");
  });

  it("vault.credentials.save + list + get + delete", async () => {
    await send({ type: "vault.setup", keyMode: "password", password: "p" });
    await send({ type: "vault.credentials.save", id: "cred.1", connectorId: "anthropic", name: "Key", fields: { apiKey: "sk-test" } });

    const listRes = await send({ type: "vault.credentials.list" });
    expect(listRes["credentials"]).toHaveLength(1);
    expect((listRes["credentials"] as any[])[0]).not.toHaveProperty("fields");

    const getRes = await send({ type: "vault.credentials.get", credentialId: "cred.1" });
    expect((getRes["credential"] as any)["fields"]["apiKey"]).toBe("sk-test");

    const delRes = await send({ type: "vault.credentials.delete", credentialId: "cred.1" });
    expect(delRes["type"]).toBe("vault.credentials.delete");

    const listRes2 = await send({ type: "vault.credentials.list" });
    expect(listRes2["credentials"]).toHaveLength(0);
  });

  it("vault.providers.save + list + delete", async () => {
    await send({ type: "vault.setup", keyMode: "password", password: "p" });
    await send({
      type: "vault.providers.save",
      id: "prov.1", name: "Ollama", providerType: "local",
      connectorId: "ollama", credentialId: "", metadata: {}, models: [], status: "connected",
    });
    const listRes = await send({ type: "vault.providers.list" });
    expect(listRes["providers"]).toHaveLength(1);

    await send({ type: "vault.providers.delete", providerId: "prov.1" });
    const listRes2 = await send({ type: "vault.providers.list" });
    expect(listRes2["providers"]).toHaveLength(0);
  });

  it("vault.apps.save + list + delete", async () => {
    await send({ type: "vault.setup", keyMode: "password", password: "p" });
    await send({
      type: "vault.apps.save",
      id: "app.1", origin: "https://test.app", displayName: "Test",
      approvedProviders: [], approvedModels: [], permissions: {}, rules: {}, limits: {},
    });
    const listRes = await send({ type: "vault.apps.list" });
    expect(listRes["appConnections"]).toHaveLength(1);

    await send({ type: "vault.apps.delete", appId: "app.1" });
    const listRes2 = await send({ type: "vault.apps.list" });
    expect(listRes2["appConnections"]).toHaveLength(0);
  });

  it("vault.usage.flush + read", async () => {
    await send({ type: "vault.setup", keyMode: "password", password: "p" });
    await send({
      type: "vault.usage.flush",
      entries: [
        { origin: "https://test.app", providerId: "p1", modelId: "m1", inputTokens: 100, outputTokens: 50, timestamp: new Date().toISOString() },
      ],
    });
    const readRes = await send({ type: "vault.usage.read" });
    expect((readRes["recentEntries"] as any[]).length).toBe(1);
  });

  it("returns error for vault operations when not set up", async () => {
    const res = await send({ type: "vault.providers.list" });
    expect(res["type"]).toBe("error");
    expect(res["reasonCode"]).toBe("vault.uninitialized");
  });

  it("requires session token for vault operations", async () => {
    const res = await handler.handle({ type: "vault.status" } as NativeMessage);
    expect(res["type"]).toBe("error");
    expect(res["reasonCode"]).toBe("auth.required");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/bridge && npx vitest run src/__tests__/bridge-handler-vault.test.ts`
Expected: FAIL — VaultStore option not recognized, no vault.* cases in switch

- [ ] **Step 3: Add VaultStore to BridgeHandlerOptions and wire into #dispatch**

In `apps/bridge/src/bridge-handler.ts`:

**3a. Add import at the top** (after other imports):
```ts
import { VaultStore } from "./vault/vault-store.js";
import { VaultError } from "./vault/vault-types.js";
```

**3b. Add to BridgeHandlerOptions type:**
```ts
vaultStore?: VaultStore;
```

**3c. Add private field in the class:**
```ts
readonly #vaultStore: VaultStore | undefined;
```

**3d. Initialize in constructor:**
```ts
this.#vaultStore = options.vaultStore;
```

**3e. Add vault.* cases in the #dispatch switch**, before the `default:` case:
```ts
      case "vault.status":
        return this.#handleVaultStatus();
      case "vault.setup":
        return this.#handleVaultSetup(message);
      case "vault.unlock":
        return this.#handleVaultUnlock(message);
      case "vault.lock":
        return this.#handleVaultLock();
      case "vault.credentials.list":
        return this.#handleVaultCredentialsList();
      case "vault.credentials.get":
        return this.#handleVaultCredentialsGet(message);
      case "vault.credentials.save":
        return this.#handleVaultCredentialsSave(message);
      case "vault.credentials.delete":
        return this.#handleVaultCredentialsDelete(message);
      case "vault.providers.list":
        return this.#handleVaultProvidersList();
      case "vault.providers.save":
        return this.#handleVaultProvidersSave(message);
      case "vault.providers.delete":
        return this.#handleVaultProvidersDelete(message);
      case "vault.apps.list":
        return this.#handleVaultAppsList();
      case "vault.apps.save":
        return this.#handleVaultAppsSave(message);
      case "vault.apps.delete":
        return this.#handleVaultAppsDelete(message);
      case "vault.usage.read":
        return this.#handleVaultUsageRead();
      case "vault.usage.flush":
        return this.#handleVaultUsageFlush(message);
```

**3f. Add handler methods** at the bottom of the class (before the closing `}`):

```ts
  // ---------------------------------------------------------------------------
  // Vault
  // ---------------------------------------------------------------------------

  #requireVaultStore(): VaultStore {
    if (!this.#vaultStore) {
      return undefined as never; // vault not configured
    }
    return this.#vaultStore;
  }

  #handleVaultOp(fn: () => NativeMessage): NativeMessage {
    try {
      return fn();
    } catch (error) {
      if (error instanceof VaultError) {
        return errorResponse(error.reasonCode, error.message);
      }
      throw error;
    }
  }

  #handleVaultStatus(): NativeMessage {
    const store = this.#requireVaultStore();
    return { type: "vault.status", ...store.status() };
  }

  #handleVaultSetup(message: NativeMessage): NativeMessage {
    return this.#handleVaultOp(() => {
      const store = this.#requireVaultStore();
      const keyMode = message["keyMode"] as "password" | "keychain";
      const password = typeof message["password"] === "string" ? message["password"] : undefined;
      store.setup({ keyMode, password });
      return { type: "vault.setup", ...store.status() };
    });
  }

  #handleVaultUnlock(message: NativeMessage): NativeMessage {
    return this.#handleVaultOp(() => {
      const store = this.#requireVaultStore();
      const password = typeof message["password"] === "string" ? message["password"] : undefined;
      store.unlock({ password });
      return { type: "vault.unlock", ...store.status() };
    });
  }

  #handleVaultLock(): NativeMessage {
    return this.#handleVaultOp(() => {
      const store = this.#requireVaultStore();
      store.lock();
      return { type: "vault.lock", ...store.status() };
    });
  }

  #handleVaultCredentialsList(): NativeMessage {
    return this.#handleVaultOp(() => {
      const store = this.#requireVaultStore();
      return { type: "vault.credentials.list", credentials: store.listCredentials() };
    });
  }

  #handleVaultCredentialsGet(message: NativeMessage): NativeMessage {
    return this.#handleVaultOp(() => {
      const store = this.#requireVaultStore();
      const credentialId = message["credentialId"] as string;
      return { type: "vault.credentials.get", credential: store.getCredential(credentialId) };
    });
  }

  #handleVaultCredentialsSave(message: NativeMessage): NativeMessage {
    return this.#handleVaultOp(() => {
      const store = this.#requireVaultStore();
      store.saveCredential({
        id: message["id"] as string,
        connectorId: message["connectorId"] as string,
        name: message["name"] as string,
        fields: message["fields"] as Record<string, string>,
      });
      return { type: "vault.credentials.save" };
    });
  }

  #handleVaultCredentialsDelete(message: NativeMessage): NativeMessage {
    return this.#handleVaultOp(() => {
      const store = this.#requireVaultStore();
      store.deleteCredential(message["credentialId"] as string);
      return { type: "vault.credentials.delete" };
    });
  }

  #handleVaultProvidersList(): NativeMessage {
    return this.#handleVaultOp(() => {
      const store = this.#requireVaultStore();
      return { type: "vault.providers.list", providers: store.listProviders() };
    });
  }

  #handleVaultProvidersSave(message: NativeMessage): NativeMessage {
    return this.#handleVaultOp(() => {
      const store = this.#requireVaultStore();
      store.saveProvider({
        id: message["id"] as string,
        name: message["name"] as string,
        type: message["providerType"] as "local" | "cloud" | "cli",
        connectorId: message["connectorId"] as string,
        credentialId: (message["credentialId"] as string) ?? "",
        metadata: (message["metadata"] as Record<string, string>) ?? {},
        models: (message["models"] as string[]) ?? [],
        status: (message["status"] as string) ?? "connected",
      });
      return { type: "vault.providers.save" };
    });
  }

  #handleVaultProvidersDelete(message: NativeMessage): NativeMessage {
    return this.#handleVaultOp(() => {
      const store = this.#requireVaultStore();
      store.deleteProvider(message["providerId"] as string);
      return { type: "vault.providers.delete" };
    });
  }

  #handleVaultAppsList(): NativeMessage {
    return this.#handleVaultOp(() => {
      const store = this.#requireVaultStore();
      return { type: "vault.apps.list", appConnections: store.listAppConnections() };
    });
  }

  #handleVaultAppsSave(message: NativeMessage): NativeMessage {
    return this.#handleVaultOp(() => {
      const store = this.#requireVaultStore();
      store.saveAppConnection({
        id: message["id"] as string,
        origin: message["origin"] as string,
        displayName: message["displayName"] as string,
        approvedProviders: (message["approvedProviders"] as string[]) ?? [],
        approvedModels: (message["approvedModels"] as string[]) ?? [],
        permissions: (message["permissions"] as Record<string, unknown>) ?? {},
        rules: (message["rules"] as Record<string, unknown>) ?? {},
        limits: (message["limits"] as Record<string, unknown>) ?? {},
      });
      return { type: "vault.apps.save" };
    });
  }

  #handleVaultAppsDelete(message: NativeMessage): NativeMessage {
    return this.#handleVaultOp(() => {
      const store = this.#requireVaultStore();
      store.deleteAppConnection(message["appId"] as string);
      return { type: "vault.apps.delete" };
    });
  }

  #handleVaultUsageRead(): NativeMessage {
    return this.#handleVaultOp(() => {
      const store = this.#requireVaultStore();
      const usage = store.readUsage();
      return { type: "vault.usage.read", ...usage };
    });
  }

  #handleVaultUsageFlush(message: NativeMessage): NativeMessage {
    return this.#handleVaultOp(() => {
      const store = this.#requireVaultStore();
      store.flushUsage({ entries: message["entries"] as any[] });
      return { type: "vault.usage.flush" };
    });
  }
```

- [ ] **Step 4: Run vault handler tests to verify they pass**

Run: `cd apps/bridge && npx vitest run src/__tests__/bridge-handler-vault.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Run full bridge test suite to verify no regressions**

Run: `cd apps/bridge && npx vitest run`
Expected: All existing tests pass + new vault tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/bridge/src/bridge-handler.ts apps/bridge/src/__tests__/bridge-handler-vault.test.ts
git commit -m "feat(vault): wire vault.* messages into bridge handler"
```

---

## Task 8: Wire VaultStore into Bridge Main

**Files:**
- Modify: `apps/bridge/src/main.ts`

- [ ] **Step 1: Add vault file path resolver**

Add a new function alongside the existing `resolvePairingStateFilePathFromEnv` etc.:

```ts
function resolveVaultFilePathFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const value = env["ARLOPASS_BRIDGE_VAULT_FILE_PATH"];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function resolveVaultLockoutFilePathFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const value = env["ARLOPASS_BRIDGE_VAULT_LOCKOUT_FILE_PATH"];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}
```

- [ ] **Step 2: Add VaultStore import and initialization in main()**

Add import at the top:
```ts
import { VaultStore } from "./vault/vault-store.js";
```

In the `main()` function, before `const bridgeHandler = new BridgeHandler({`:
```ts
  const vaultFilePath = resolveVaultFilePathFromEnv(process.env)
    ?? join(dirname(loadOrGenerateSigningKeyPath(process.env)), "vault.encrypted");
  const vaultLockoutFilePath = resolveVaultLockoutFilePathFromEnv(process.env)
    ?? join(dirname(loadOrGenerateSigningKeyPath(process.env)), "vault-lockout.json");
  const vaultAutoLockMs = parsePositiveIntegerEnv(
    process.env["ARLOPASS_VAULT_AUTO_LOCK_MS"],
  );
  const vaultStore = new VaultStore({
    vaultFilePath,
    lockoutFilePath: vaultLockoutFilePath,
    ...(vaultAutoLockMs !== undefined ? { autoLockMs: vaultAutoLockMs } : {}),
  });
```

Add `vaultStore` to the `BridgeHandler` constructor options:
```ts
  const bridgeHandler = new BridgeHandler({
    // ... existing options ...
    vaultStore,
  });
```

- [ ] **Step 3: Verify the bridge compiles**

Run: `cd apps/bridge && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run full bridge test suite**

Run: `cd apps/bridge && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/main.ts
git commit -m "feat(vault): initialize VaultStore on bridge startup"
```

---

## Task 9: Vault Keychain Adapter (Stub)

The OS keychain integration requires native binaries (`keytar` or platform-specific calls). For now, create a stub adapter with the contract, and implement the real thing when the build toolchain supports native binaries.

**Files:**
- Create: `apps/bridge/src/vault/vault-keychain.ts`

- [ ] **Step 1: Create the keychain adapter interface and stub**

```ts
// apps/bridge/src/vault/vault-keychain.ts

export type KeychainAdapter = {
  getKey(): Promise<Buffer | null>;
  setKey(key: Buffer): Promise<void>;
  deleteKey(): Promise<void>;
};

/**
 * Stub keychain adapter that always throws.
 * Will be replaced with platform-specific implementations
 * (Windows Credential Manager, macOS Keychain, Linux libsecret).
 */
export function createKeychainAdapter(): KeychainAdapter {
  return {
    async getKey(): Promise<Buffer | null> {
      throw new Error("OS keychain not yet implemented. Use password mode.");
    },
    async setKey(_key: Buffer): Promise<void> {
      throw new Error("OS keychain not yet implemented. Use password mode.");
    },
    async deleteKey(): Promise<void> {
      throw new Error("OS keychain not yet implemented. Use password mode.");
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/bridge/src/vault/vault-keychain.ts
git commit -m "feat(vault): add keychain adapter stub (password mode only for now)"
```

---

## Task 10: Typecheck + Lint + Full Test Suite

**Files:** All vault files

- [ ] **Step 1: Run bridge typecheck**

Run: `cd apps/bridge && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Run bridge lint**

Run: `cd apps/bridge && npm run lint`
Expected: 0 errors (or fix any that appear)

- [ ] **Step 3: Run full bridge test suite**

Run: `cd apps/bridge && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Run full monorepo test suite**

Run: `npm test` (from workspace root)
Expected: All 1105+ tests pass (including new vault tests)

- [ ] **Step 5: Commit any lint/type fixes**

```bash
git add -A
git commit -m "chore(vault): fix lint and type errors"
```

---

## Summary

| Task | Files | Tests | Description |
|---|---|---|---|
| 1 | vault-types.ts | — | Type definitions + VaultError + createEmptyVault |
| 2 | secure-wipe.ts | 3 | Buffer zeroing utility |
| 3 | vault-encryption.ts | 8 | AES-256-GCM + PBKDF2, header parse, encrypt/decrypt |
| 4 | vault-lockout.ts | 7 | Brute force protection with disk persistence |
| 5 | vault-compaction.ts | 4 | 30-day usage compaction algorithm |
| 6 | vault-store.ts | ~24 | State machine, CRUD, auto-lock, write errors, persistence |
| 7 | bridge-handler.ts (mod) | ~10 | 16 vault.* switch cases + handler methods |
| 8 | main.ts (mod) | — | VaultStore initialization on startup |
| 9 | vault-keychain.ts | — | Stub for OS keychain (password mode only for now) |
| 10 | — | full suite | Typecheck + lint + full monorepo test pass |

**Total new files:** 7 source + 5 test files
**Total modified files:** 2 (bridge-handler.ts, main.ts)
**Estimated new tests:** ~52

> **Extension changes (Phase 2):** Not included in this plan. The extension will be updated in a follow-up plan once the bridge vault API is working and tested. This plan produces a fully functional, fully tested bridge vault module that the extension can wire into.
