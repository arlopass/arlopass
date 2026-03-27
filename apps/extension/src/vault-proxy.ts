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

const HOST_NAME = "com.arlopass.bridge";

// ---------------------------------------------------------------------------
// Persistent port singleton (background-owned)
// ---------------------------------------------------------------------------

type PendingRequest = {
    resolve: (response: unknown) => void;
    reject: (error: Error) => void;
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

    // Clear vault-locked badge after successful unlock
    if (
        (message["type"] === "vault.unlock" || message["type"] === "vault.unlock.keychain") &&
        resp["type"] !== "error"
    ) {
        try { void chrome.action?.setBadgeText?.({ text: "" }); } catch { /* ok */ }
    }

    return resp as Record<string, unknown>;
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
