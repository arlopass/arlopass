// apps/extension/src/ui/hooks/useVault.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { ensureBridgeHandshakeSession } from "../../transport/bridge-handshake.js";
import {
    BRIDGE_PAIRING_STATE_STORAGE_KEY,
    parseBridgePairingState,
    unwrapPairingKeyMaterial,
} from "../../transport/bridge-pairing.js";
import { autoPair } from "../components/onboarding/setup-state.js";

const HOST_NAME = "com.arlopass.bridge";

export type VaultStatus =
    | { state: "connecting" }
    | { state: "bridge-unavailable"; error: string }
    | { state: "uninitialized" }
    | { state: "locked"; keyMode?: "password" | "keychain" }
    | { state: "unlocked" }
    | { state: "locked_out"; secondsRemaining: number };

export type UseVaultResult = {
    status: VaultStatus;
    /** Send an authenticated vault.* message to the bridge. Returns the response. */
    sendVaultMessage: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
    /** Run vault.setup with password mode. */
    setup: (password: string) => Promise<void>;
    /** Unlock with password. */
    unlock: (password: string) => Promise<void>;
    /** Lock the vault. */
    lock: () => Promise<void>;
    /** Re-check vault status (e.g. after bridge reconnect). */
    refresh: () => void;
    /** True when vault was unlocked but auto-locked mid-session. Show overlay, not full re-gate. */
    needsReauth: boolean;
};

type SessionRef = {
    sessionToken: string;
};

async function sendNativeMessage(
    hostName: string,
    message: Record<string, unknown>,
): Promise<unknown> {
    return new Promise((resolve, reject) => {
        try {
            chrome.runtime.sendNativeMessage(hostName, message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message ?? "Native messaging error"));
                } else {
                    resolve(response);
                }
            });
        } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
        }
    });
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

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
        sendNativeMessage,
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
        const response = await sendNativeMessage(HOST_NAME, {
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

            const resp = await sendNativeMessage(HOST_NAME, {
                type: "vault.status",
                sessionToken: session.sessionToken,
            });
            if (!mountedRef.current) return;
            if (!isRecord(resp)) {
                setStatus({ state: "bridge-unavailable", error: "Invalid response from bridge." });
                return;
            }
            const vaultState = resp["state"] as string;
            if (vaultState === "uninitialized") {
                setStatus({ state: "uninitialized" });
            } else if (vaultState === "locked") {
                setStatus({ state: "locked" });
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

    const unlock = useCallback(async (password: string) => {
        const resp = await sendVaultMessage({ type: "vault.unlock", password });
        if (resp["type"] === "error") {
            const code = resp["reasonCode"] as string;
            if (code === "vault.locked_out") {
                // Parse seconds from message: "Too many failed attempts. Try again in N seconds."
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

    const lock = useCallback(async () => {
        await sendVaultMessage({ type: "vault.lock" });
        setStatus({ state: "locked" });
    }, [sendVaultMessage]);

    useEffect(() => {
        mountedRef.current = true;
        void checkStatus();
        return () => { mountedRef.current = false; };
    }, [checkStatus]);

    return { status, sendVaultMessage, setup, unlock, lock, refresh: checkStatus, needsReauth };
}
