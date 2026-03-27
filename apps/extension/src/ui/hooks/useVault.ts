// apps/extension/src/ui/hooks/useVault.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { ensureBridgeHandshakeSession, clearBridgeHandshakeSessionCache } from "../../transport/bridge-handshake.js";
import {
    BRIDGE_PAIRING_STATE_STORAGE_KEY,
    parseBridgePairingState,
    unwrapPairingKeyMaterial,
} from "../../transport/bridge-pairing.js";
import { autoPair } from "../components/onboarding/setup-state.js";

const HOST_NAME = "com.arlopass.bridge";

// ---------------------------------------------------------------------------
// Persistent native port — keeps 1 bridge process alive for all vault calls
// ---------------------------------------------------------------------------

type PendingRequest = {
    resolve: (response: unknown) => void;
    reject: (error: Error) => void;
};

let sharedPort: chrome.runtime.Port | null = null;
const pendingRequests = new Map<string, PendingRequest>();
let nextRequestId = 0;

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function ensurePort(): chrome.runtime.Port {
    if (sharedPort !== null) return sharedPort;
    const port = chrome.runtime.connectNative(HOST_NAME);
    port.onMessage.addListener((msg: unknown) => {
        if (!isRecord(msg)) return;
        const reqId = msg["_bridgeRequestId"];
        if (typeof reqId !== "string") return;
        const pending = pendingRequests.get(reqId);
        if (!pending) return;
        pendingRequests.delete(reqId);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _bridgeRequestId: _, ...clean } = msg;
        pending.resolve(clean);
    });
    port.onDisconnect.addListener(() => {
        sharedPort = null;
        const err = new Error("Bridge port disconnected.");
        for (const [, p] of pendingRequests) p.reject(err);
        pendingRequests.clear();
        // Clear cached sessions since the bridge process died
        clearBridgeHandshakeSessionCache();
    });
    sharedPort = port;
    return port;
}

/** Send a message over the persistent port and await the response. */
function sendViaPort(message: Record<string, unknown>): Promise<unknown> {
    const port = ensurePort();
    const reqId = `_vr.${String(++nextRequestId)}.${Date.now().toString(36)}`;
    return new Promise<unknown>((resolve, reject) => {
        pendingRequests.set(reqId, { resolve, reject });
        try {
            port.postMessage({ ...message, _bridgeRequestId: reqId });
        } catch (err) {
            pendingRequests.delete(reqId);
            reject(err instanceof Error ? err : new Error(String(err)));
        }
    });
}

/** Wrapper matching the sendNativeMessage signature expected by ensureBridgeHandshakeSession. */
async function sendNativeMessageViaPersistentPort(
    _hostName: string,
    message: Record<string, unknown>,
): Promise<unknown> {
    return sendViaPort(message);
}

// ---------------------------------------------------------------------------
// Session establishment
// ---------------------------------------------------------------------------

export type VaultStatus =
    | { state: "connecting" }
    | { state: "bridge-unavailable"; error: string }
    | { state: "uninitialized" }
    | { state: "locked"; keyMode?: "password" | "keychain" }
    | { state: "unlocked" }
    | { state: "locked_out"; secondsRemaining: number };

export type UseVaultResult = {
    status: VaultStatus;
    sendVaultMessage: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
    setup: (password: string) => Promise<void>;
    setupKeychain: () => Promise<void>;
    unlock: (password: string) => Promise<void>;
    unlockKeychain: () => Promise<void>;
    lock: () => Promise<void>;
    refresh: () => void;
    needsReauth: boolean;
};

type SessionRef = { sessionToken: string };

async function establishSession(): Promise<SessionRef> {
    const extensionId = chrome.runtime.id;

    // Auto-pair if no pairing state exists (first run or reinstall)
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
        sendNativeMessage: sendNativeMessageViaPersistentPort,
        resolveBridgeSharedSecret: async () => pairingKeyMaterial.pairingKeyHex,
        resolveBridgePairingHandle: async () => pairingKeyMaterial.pairingHandle,
    });

    return { sessionToken: session.sessionToken };
}

export function useVault(): UseVaultResult {
    const [status, setStatus] = useState<VaultStatus>({ state: "connecting" });
    const sessionRef = useRef<SessionRef | null>(null);
    const mountedRef = useRef(true);
    // Tracks whether vault was unlocked then auto-locked mid-session.
    // When true, VaultGate shows an unlock overlay instead of full re-gating.
    const [needsReauth, setNeedsReauth] = useState(false);

    const sendVaultMessage = useCallback(async (message: Record<string, unknown>): Promise<Record<string, unknown>> => {
        if (sessionRef.current === null) {
            throw new Error("No bridge session. Vault not ready.");
        }
        const response = await sendViaPort({
            ...message,
            sessionToken: sessionRef.current.sessionToken,
        });
        if (!isRecord(response)) {
            throw new Error("Invalid bridge response.");
        }
        // If vault became locked mid-session (auto-lock), set needsReauth overlay
        if (response["type"] === "error" && response["reasonCode"] === "vault.locked") {
            setNeedsReauth(true);
            setStatus({ state: "locked" });
        }
        if (response["type"] === "error" && response["reasonCode"] === "auth.expired") {
            // Session expired — need to re-establish
            sessionRef.current = null;
            setStatus({ state: "connecting" });
        }
        return response as Record<string, unknown>;
    }, []);

    const checkStatus = useCallback(async () => {
        try {
            const session = await establishSession();
            if (!mountedRef.current) return;
            sessionRef.current = session;

            const resp = await sendViaPort({
                type: "vault.status",
                sessionToken: session.sessionToken,
            });
            if (!mountedRef.current) return;
            if (!isRecord(resp)) {
                setStatus({ state: "bridge-unavailable", error: "Invalid response from bridge." });
                return;
            }
            const vaultState = resp["state"] as string;
            const keyMode = resp["keyMode"] as string | undefined;
            if (vaultState === "uninitialized") {
                setStatus({ state: "uninitialized" });
            } else if (vaultState === "locked") {
                if (keyMode === "keychain") {
                    // Auto-unlock for keychain mode
                    setStatus({ state: "locked", keyMode: "keychain" });
                    try {
                        const unlockResp = await sendViaPort({
                            type: "vault.unlock.keychain",
                            sessionToken: session.sessionToken,
                        });
                        if (!mountedRef.current) return;
                        if (isRecord(unlockResp) && unlockResp["type"] !== "error") {
                            setStatus({ state: "unlocked" });
                        } else {
                            // Keychain auto-unlock failed — show password fallback
                            setStatus({ state: "locked", keyMode: "keychain" });
                        }
                    } catch {
                        if (!mountedRef.current) return;
                        setStatus({ state: "locked", keyMode: "keychain" });
                    }
                } else {
                    setStatus({ state: "locked", keyMode: "password" });
                }
            } else if (vaultState === "unlocked") {
                setStatus({ state: "unlocked" });
            } else {
                setStatus({ state: "bridge-unavailable", error: `Unknown vault state: ${vaultState}` });
            }
        } catch (err) {
            if (!mountedRef.current) return;
            setStatus({
                state: "bridge-unavailable",
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }, []);

    const setup = useCallback(async (password: string) => {
        const resp = await sendVaultMessage({ type: "vault.setup", keyMode: "password", password });
        if (resp["type"] === "error") {
            throw new Error(resp["message"] as string ?? "Setup failed.");
        }
        setStatus({ state: "unlocked" });
    }, [sendVaultMessage]);

    const setupKeychain = useCallback(async () => {
        const resp = await sendVaultMessage({ type: "vault.setup.keychain" });
        if (resp["type"] === "error") {
            throw new Error(resp["message"] as string ?? "Keychain setup failed.");
        }
        setStatus({ state: "unlocked" });
    }, [sendVaultMessage]);

    const unlock = useCallback(async (password: string) => {
        const resp = await sendVaultMessage({ type: "vault.unlock", password });
        if (resp["type"] === "error") {
            const code = resp["reasonCode"] as string;
            if (code === "vault.locked_out") {
                const match = (resp["message"] as string)?.match(/(\d+) seconds/);
                const seconds = match?.[1] !== undefined ? Number.parseInt(match[1], 10) : 60;
                setStatus({ state: "locked_out", secondsRemaining: seconds });
                throw new Error(resp["message"] as string);
            }
            throw new Error(resp["message"] as string ?? "Unlock failed.");
        }
        setNeedsReauth(false);
        setStatus({ state: "unlocked" });
    }, [sendVaultMessage]);

    const unlockKeychain = useCallback(async () => {
        const resp = await sendVaultMessage({ type: "vault.unlock.keychain" });
        if (resp["type"] === "error") {
            throw new Error(resp["message"] as string ?? "Keychain unlock failed.");
        }
        setNeedsReauth(false);
        setStatus({ state: "unlocked" });
    }, [sendVaultMessage]);

    const lock = useCallback(async () => {
        await sendVaultMessage({ type: "vault.lock" });
        setStatus({ state: "locked" });
    }, [sendVaultMessage]);

    useEffect(() => {
        mountedRef.current = true;
        void checkStatus();
        return () => { mountedRef.current = false; };
    }, [checkStatus]);

    return { status, sendVaultMessage, setup, setupKeychain, unlock, unlockKeychain, lock, refresh: checkStatus, needsReauth };
}
