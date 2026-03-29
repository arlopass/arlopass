/**
 * Vault Bridge Proxy — background-owned persistent bridge connection.
 *
 * The background service worker owns a single `connectNative` port to the
 * bridge. All vault messages from popup/options/background go through this
 * port, keeping ONE bridge process alive for the entire browser session.
 *
 * The vault stays unlocked as long as this port stays open (i.e. until the
 * browser closes or the service worker is terminated, which won't happen
 * while a native port is connected).
 *
 * Popup/options pages send messages via:
 *   chrome.runtime.sendMessage({ channel: "arlopass.vault.proxy", message: {...} })
 * and receive the response as the sendMessage callback/promise result.
 */

import {
    ensureBridgeHandshakeSession,
    clearBridgeHandshakeSessionCache,
} from "./transport/bridge-handshake.js";
import {
    BRIDGE_PAIRING_STATE_STORAGE_KEY,
    parseBridgePairingState,
    unwrapPairingKeyMaterial,
} from "./transport/bridge-pairing.js";
import { autoPair } from "./ui/components/onboarding/setup-state.js";
import { clearVaultLockNotification } from "./transport/runtime.js";

const HOST_NAME = "com.arlopass.bridge";

// ---------------------------------------------------------------------------
// Persistent port singleton (background-owned)
// ---------------------------------------------------------------------------

type PendingRequest = {
    resolve: (response: unknown) => void;
    reject: (error: Error) => void;
    onChunk?: (chunk: string) => void;
};

let port: chrome.runtime.Port | null = null;
const pending = new Map<string, PendingRequest>();
let nextId = 0;

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function ensurePort(): chrome.runtime.Port {
    if (port !== null) return port;
    const p = chrome.runtime.connectNative(HOST_NAME);
    p.onMessage.addListener((msg: unknown) => {
        if (!isRecord(msg)) return;
        const reqId = msg["_bridgeRequestId"];
        if (typeof reqId !== "string") return;
        const req = pending.get(reqId);
        if (!req) return;

        // Intermediate streaming chunk — forward and keep waiting.
        if (
            msg["type"] === "cloud.chat.stream.chunk" ||
            msg["type"] === "cli.chat.stream.chunk"
        ) {
            if (req.onChunk !== undefined) {
                const delta = typeof msg["delta"] === "string" ? msg["delta"] : "";
                if (delta.length > 0) req.onChunk(delta);
            }
            return;
        }

        // Terminal response — resolve the pending request.
        pending.delete(reqId);
        const { _bridgeRequestId: _, ...clean } = msg; // eslint-disable-line @typescript-eslint/no-unused-vars
        req.resolve(clean);
    });
    p.onDisconnect.addListener(() => {
        port = null;
        sessionToken = null;
        const err = new Error("Bridge port disconnected.");
        for (const [, r] of pending) r.reject(err);
        pending.clear();
        clearBridgeHandshakeSessionCache();
    });
    port = p;
    return p;
}

function sendViaPort(message: Record<string, unknown>): Promise<unknown> {
    const p = ensurePort();
    const reqId = `_vp.${String(++nextId)}.${Date.now().toString(36)}`;
    return new Promise<unknown>((resolve, reject) => {
        pending.set(reqId, { resolve, reject });
        try {
            p.postMessage({ ...message, _bridgeRequestId: reqId });
        } catch (err) {
            pending.delete(reqId);
            reject(err instanceof Error ? err : new Error(String(err)));
        }
    });
}

async function sendNativeViaPort(
    _hostName: string,
    message: Record<string, unknown>,
): Promise<unknown> {
    return sendViaPort(message);
}

/**
 * Send a message through the vault-proxy bridge port.
 * Exported so the transport streaming layer can reuse the same bridge process
 * that holds the cloud connection state.
 */
export function sendBridgeMessage(message: Record<string, unknown>): Promise<unknown> {
    return sendViaPort(message);
}

/**
 * Send a streaming message through the vault-proxy bridge port.
 * Intermediate `cloud.chat.stream.chunk` messages are forwarded to onChunk.
 * The promise resolves with the terminal response.
 */
export function sendBridgeStreamingMessage(
    message: Record<string, unknown>,
    onChunk: (chunk: string) => void,
): Promise<unknown> {
    const p = ensurePort();
    const reqId = `_vp.${String(++nextId)}.${Date.now().toString(36)}`;
    return new Promise<unknown>((resolve, reject) => {
        pending.set(reqId, { resolve, reject, onChunk });
        try {
            p.postMessage({ ...message, _bridgeRequestId: reqId });
        } catch (err) {
            pending.delete(reqId);
            reject(err instanceof Error ? err : new Error(String(err)));
        }
    });
}

// Expose on globalThis so the transport layer (runtime.ts) can reuse the
// same bridge process without a circular import.
(globalThis as Record<string, unknown>)["__arlopass_bridge_send"] = sendBridgeMessage;
(globalThis as Record<string, unknown>)["__arlopass_bridge_stream"] = sendBridgeStreamingMessage;

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

let sessionToken: string | null = null;
let sessionPromise: Promise<string> | null = null;

async function establishSession(): Promise<string> {
    const extensionId = chrome.runtime.id;

    let pairingData = await chrome.storage.local.get([BRIDGE_PAIRING_STATE_STORAGE_KEY]);
    let pairingState = parseBridgePairingState(pairingData[BRIDGE_PAIRING_STATE_STORAGE_KEY]);
    if (pairingState === undefined) {
        const pairResult = await autoPair();
        if (!pairResult.success) {
            throw new Error(pairResult.error ?? "Auto-pairing with bridge failed.");
        }
        pairingData = await chrome.storage.local.get([BRIDGE_PAIRING_STATE_STORAGE_KEY]);
        pairingState = parseBridgePairingState(pairingData[BRIDGE_PAIRING_STATE_STORAGE_KEY]);
        if (pairingState === undefined) {
            throw new Error("Pairing succeeded but state was not persisted.");
        }
    }

    const pairingKeyMaterial = await unwrapPairingKeyMaterial({ pairingState, runtimeId: extensionId });
    if (pairingKeyMaterial === undefined || pairingKeyMaterial === null) {
        throw new Error("Failed to unwrap pairing key material.");
    }

    const session = await ensureBridgeHandshakeSession({
        hostName: HOST_NAME,
        extensionId,
        sendNativeMessage: sendNativeViaPort,
        resolveBridgeSharedSecret: async () => pairingKeyMaterial.pairingKeyHex,
        resolveBridgePairingHandle: async () => pairingKeyMaterial.pairingHandle,
    });

    return session.sessionToken;
}

async function getSessionToken(): Promise<string> {
    if (sessionToken !== null) return sessionToken;
    if (sessionPromise !== null) return sessionPromise;
    sessionPromise = establishSession().then((token) => {
        sessionToken = token;
        sessionPromise = null;
        return token;
    }).catch((err) => {
        sessionPromise = null;
        throw err;
    });
    return sessionPromise;
}

// ---------------------------------------------------------------------------
// Public API — send a vault message through the background-owned port
// ---------------------------------------------------------------------------

/**
 * Send a vault message through the persistent bridge port.
 * Automatically establishes session if needed.
 * Can be called from background script directly.
 */
export async function sendVaultMessageViaProxy(
    message: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const token = await getSessionToken();
    const resp = await sendViaPort({ ...message, sessionToken: token });
    if (!isRecord(resp)) throw new Error("Invalid bridge response.");

    // Handle session expiry — re-establish and retry once
    if (resp["type"] === "error" && resp["reasonCode"] === "auth.expired") {
        sessionToken = null;
        clearBridgeHandshakeSessionCache();
        const newToken = await getSessionToken();
        const retryResp = await sendViaPort({ ...message, sessionToken: newToken });
        if (!isRecord(retryResp)) throw new Error("Invalid bridge response.");
        return retryResp as Record<string, unknown>;
    }

    // Clear vault-locked badge and notification flag after successful unlock
    if (
        (message["type"] === "vault.unlock" || message["type"] === "vault.unlock.keychain") &&
        resp["type"] !== "error"
    ) {
        clearVaultLockNotification();
        try { void chrome.action?.setBadgeText?.({ text: "" }); } catch { /* ok */ }
        // Refresh model lists for all connected providers in the background
        void refreshAllProviderModels();
    }

    // Broadcast provider/app changes to all tabs so web SDKs refresh
    const msgType = message["type"] as string;
    if (
        resp["type"] !== "error" && (
            msgType === "vault.providers.save" ||
            msgType === "vault.providers.delete" ||
            msgType === "vault.apps.save" ||
            msgType === "vault.apps.delete"
        )
    ) {
        void broadcastProvidersChanged();
    }

    return resp as Record<string, unknown>;
}

/** Broadcast to all tabs that providers/app-connections changed. */
async function broadcastProvidersChanged(): Promise<void> {
    try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (tab.id !== undefined) {
                try {
                    chrome.tabs.sendMessage(tab.id, { channel: "arlopass.providers.changed" });
                } catch { /* tab may not have content script */ }
            }
        }
    } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Background model refresh — re-discover models for all connected providers
// ---------------------------------------------------------------------------

const DEFAULT_CLOUD_POLICY_VERSION = "policy.unknown";
const MODEL_REFRESH_TIMEOUT_MS = 12_000;

type VaultProvider = {
    id: string;
    name: string;
    type: string;
    status: string;
    models: string[];
    connectorId?: string;
    credentialId?: string;
    metadata?: Record<string, string>;
};

function parseVaultProviders(raw: unknown): VaultProvider[] {
    if (!Array.isArray(raw)) return [];
    const result: VaultProvider[] = [];
    for (const entry of raw) {
        if (
            isRecord(entry) &&
            typeof entry["id"] === "string" &&
            typeof entry["type"] === "string"
        ) {
            result.push({
                id: entry["id"] as string,
                name: (typeof entry["name"] === "string" ? entry["name"] : "") as string,
                type: entry["type"] as string,
                status: (typeof entry["status"] === "string" ? entry["status"] : "disconnected") as string,
                models: Array.isArray(entry["models"])
                    ? (entry["models"] as unknown[]).filter((m): m is string => typeof m === "string")
                    : [],
                ...(typeof entry["connectorId"] === "string" ? { connectorId: entry["connectorId"] } : {}),
                ...(typeof entry["credentialId"] === "string" ? { credentialId: entry["credentialId"] } : {}),
                ...(isRecord(entry["metadata"]) ? { metadata: entry["metadata"] as Record<string, string> } : {}),
            });
        }
    }
    return result;
}

function parseDiscoveredModelIds(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const ids: string[] = [];
    for (const entry of raw) {
        if (typeof entry === "string" && entry.length > 0) {
            ids.push(entry);
        } else if (isRecord(entry) && typeof entry["id"] === "string" && (entry["id"] as string).length > 0) {
            ids.push(entry["id"] as string);
        }
    }
    return ids;
}

async function discoverCloudModels(
    provider: VaultProvider,
): Promise<string[] | null> {
    const metadata = provider.metadata ?? {};
    const connectionHandle = (metadata["connectionHandle"] ?? "").trim();
    const providerId = (metadata["providerId"] ?? "").trim();
    const methodId = (metadata["methodId"] ?? "").trim();
    const endpointProfileHash = (metadata["endpointProfileHash"] ?? "").trim();

    if (connectionHandle.length === 0 || providerId.length === 0 || methodId.length === 0) {
        return null;
    }

    const extensionId = typeof chrome?.runtime?.id === "string" ? chrome.runtime.id : "";
    if (extensionId.length === 0) return null;

    const token = await getSessionToken();
    const resp = await Promise.race([
        sendViaPort({
            type: "cloud.models.discover",
            providerId,
            methodId,
            connectionHandle,
            extensionId,
            origin: `chrome-extension://${extensionId}`,
            policyVersion: DEFAULT_CLOUD_POLICY_VERSION,
            ...(endpointProfileHash.length > 0 ? { endpointProfileHash } : {}),
            refresh: true,
            sessionToken: token,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), MODEL_REFRESH_TIMEOUT_MS)),
    ]);

    if (!isRecord(resp) || resp["type"] !== "cloud.models.discover") return null;

    const models = parseDiscoveredModelIds(resp["models"]);
    return models.length > 0 ? models : null;
}

async function discoverOllamaModels(provider: VaultProvider): Promise<string[] | null> {
    const metadata = provider.metadata ?? {};
    const baseUrl = (metadata["baseUrl"] ?? "http://localhost:11434").trim().replace(/\/+$/, "");

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), MODEL_REFRESH_TIMEOUT_MS);
        const resp = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) return null;
        const payload = (await resp.json()) as unknown;
        if (!isRecord(payload) || !Array.isArray(payload["models"])) return null;
        const models = (payload["models"] as unknown[])
            .map((entry) => (isRecord(entry) && typeof entry["name"] === "string" ? entry["name"] : undefined))
            .filter((name): name is string => typeof name === "string" && name.length > 0)
            .slice(0, 40);
        return models.length > 0 ? models : null;
    } catch {
        return null;
    }
}

async function discoverCliModels(provider: VaultProvider): Promise<string[] | null> {
    const metadata = provider.metadata ?? {};
    const nativeHostName = (metadata["nativeHostName"] ?? "com.arlopass.bridge").trim();
    const cliType = (metadata["cliType"] ?? "").trim();

    if (cliType.length === 0) return null;

    const token = await getSessionToken();
    const resp = await Promise.race([
        sendViaPort({
            type: "cli.models.list",
            cliType,
            nativeHostName,
            sessionToken: token,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), MODEL_REFRESH_TIMEOUT_MS)),
    ]);

    if (!isRecord(resp) || resp["type"] === "error") return null;

    const models = parseDiscoveredModelIds(resp["models"]);
    return models.length > 0 ? models : null;
}

/**
 * Re-discover models for all connected providers after vault unlock.
 * Runs in the background — failures for individual providers are silently
 * ignored so one broken provider doesn't block others from refreshing.
 */
async function refreshAllProviderModels(): Promise<void> {
    try {
        const token = await getSessionToken();
        const listResp = await sendViaPort({ type: "vault.providers.list", sessionToken: token });
        if (!isRecord(listResp) || listResp["type"] === "error") return;

        const providers = parseVaultProviders(listResp["providers"]);
        if (providers.length === 0) return;

        let anyUpdated = false;

        const refreshResults = await Promise.allSettled(
            providers
                .filter((p) => p.status === "connected" || p.status === "degraded")
                .map(async (provider) => {
                    let discovered: string[] | null = null;

                    if (provider.type === "cloud") {
                        discovered = await discoverCloudModels(provider);
                    } else if (provider.type === "local") {
                        discovered = await discoverOllamaModels(provider);
                    } else if (provider.type === "cli") {
                        discovered = await discoverCliModels(provider);
                    }

                    if (discovered === null) return;

                    // Only update if the model list actually changed
                    const currentSet = new Set(provider.models);
                    const discoveredSet = new Set(discovered);
                    if (
                        currentSet.size === discoveredSet.size &&
                        discovered.every((m) => currentSet.has(m))
                    ) {
                        return;
                    }

                    const saveToken = await getSessionToken();
                    const saveResp = await sendViaPort({
                        type: "vault.providers.save",
                        id: provider.id,
                        name: provider.name,
                        providerType: provider.type,
                        ...(provider.connectorId != null ? { connectorId: provider.connectorId } : {}),
                        ...(provider.credentialId != null ? { credentialId: provider.credentialId } : {}),
                        metadata: provider.metadata ?? {},
                        models: discovered,
                        status: provider.status,
                        sessionToken: saveToken,
                    });

                    if (isRecord(saveResp) && saveResp["type"] !== "error") {
                        anyUpdated = true;
                    }
                }),
        );

        // Log failures for debugging but don't throw
        for (const result of refreshResults) {
            if (result.status === "rejected") {
                console.warn("Arlopass: model refresh failed for a provider:", result.reason);
            }
        }

        if (anyUpdated) {
            void broadcastProvidersChanged();
        }
    } catch (error) {
        console.warn("Arlopass: background model refresh failed:", error);
    }
}

/**
 * Pre-warm the bridge session.  Call this at service worker startup so the
 * handshake (auto-pair + challenge-response) completes before the first
 * message arrives.  Failures are silently ignored — the session will be
 * established on-demand when actually needed.
 */
export function preWarmBridgeSession(): void {
    void getSessionToken().catch(() => { /* best effort */ });
}

// ---------------------------------------------------------------------------
// Message listener — relay vault messages from popup/options pages
// ---------------------------------------------------------------------------

const PROXY_CHANNEL = "arlopass.vault.proxy";

/**
 * Register the vault proxy listener in the background service worker.
 * Popup/options pages send:
 *   chrome.runtime.sendMessage({ channel: "arlopass.vault.proxy", message: {...} })
 * and receive the vault response as the callback result.
 */
export function registerVaultProxyListener(): void {
    chrome.runtime.onMessage.addListener(
        (
            request: unknown,
            _sender: chrome.runtime.MessageSender,
            sendResponse: (response: unknown) => void,
        ) => {
            if (!isRecord(request) || request["channel"] !== PROXY_CHANNEL) {
                return false; // not ours
            }
            const message = request["message"];
            if (!isRecord(message)) {
                sendResponse({ type: "error", reasonCode: "request.invalid", message: "Invalid message." });
                return true;
            }

            // Handle async
            void sendVaultMessageViaProxy(message as Record<string, unknown>)
                .then((resp) => sendResponse(resp))
                .catch((err) => sendResponse({
                    type: "error",
                    reasonCode: "vault.inaccessible",
                    message: err instanceof Error ? err.message : String(err),
                }));

            return true; // indicates async sendResponse
        },
    );
}

// ---------------------------------------------------------------------------
// Client helper — used by popup/options pages to send vault messages
// ---------------------------------------------------------------------------

/**
 * Send a vault message from a popup/options page via the background proxy.
 */
export function sendVaultMessageFromPage(
    message: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
        try {
            chrome.runtime.sendMessage(
                { channel: PROXY_CHANNEL, message },
                (response: unknown) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message ?? "Vault proxy error."));
                        return;
                    }
                    if (!isRecord(response)) {
                        reject(new Error("Invalid vault proxy response."));
                        return;
                    }
                    resolve(response as Record<string, unknown>);
                },
            );
        } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
        }
    });
}
