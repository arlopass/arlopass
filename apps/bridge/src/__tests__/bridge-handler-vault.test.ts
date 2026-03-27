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
        handler = new BridgeHandler({ vaultStore });
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
        expect((listRes["credentials"] as Record<string, unknown>[])[0]).not.toHaveProperty("fields");

        const getRes = await send({ type: "vault.credentials.get", credentialId: "cred.1" });
        expect((getRes["credential"] as Record<string, unknown>)["fields"]).toHaveProperty("apiKey", "sk-test");

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
        expect((readRes["recentEntries"] as unknown[]).length).toBe(1);
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
