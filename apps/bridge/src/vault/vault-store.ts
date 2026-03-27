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

    status(): { state: VaultState; keyMode?: KeyMode } {
        if (this.#state === "uninitialized") {
            return { state: this.#state };
        }
        // When locked, read keyMode from file header without decrypting
        if (this.#state === "locked") {
            try {
                const fileData = readFileSync(this.#vaultFilePath);
                const header = parseHeader(fileData);
                return { state: this.#state, keyMode: header.keyMode };
            } catch {
                return { state: this.#state };
            }
        }
        return { state: this.#state, keyMode: this.#keyMode };
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
        this.#touchAutoLock();
        return this.#vault!.credentials.map(({ fields: _fields, ...rest }) => rest); // eslint-disable-line @typescript-eslint/no-unused-vars
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
            createdAt: idx >= 0 ? vault.credentials[idx]!.createdAt : now,
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
            createdAt: idx >= 0 ? vault.providers[idx]!.createdAt : now,
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
            createdAt: idx >= 0 ? vault.appConnections[idx]!.createdAt : now,
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
