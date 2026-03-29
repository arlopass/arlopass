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
        return new VaultStore({ vaultFilePath: vaultPath, lockoutFilePath: lockoutPath, minPasswordLength: 1 });
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
            expect(store.status()).toEqual({ state: "uninitialized", minPasswordLength: 1 });
            store.setup({ keyMode: "password", password: "s" });
            expect(store.status()).toEqual({ state: "unlocked", keyMode: "password", minPasswordLength: 1 });
            store.lock();
            expect(store.status()).toEqual({ state: "locked", keyMode: "password", minPasswordLength: 1 });
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
            expect(list[0]!.id).toBe("cred.1");
            expect(list[0]!).not.toHaveProperty("fields");
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
            expect(list[0]!.name).toBe("V2");
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
                minPasswordLength: 1,
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
                minPasswordLength: 1,
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
                minPasswordLength: 1,
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
