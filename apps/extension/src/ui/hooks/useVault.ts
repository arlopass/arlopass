// apps/extension/src/ui/hooks/useVault.ts
//
// React hook for vault lifecycle. All vault messages go through the
// background-owned persistent bridge port via chrome.runtime.sendMessage.
// This ensures ONE bridge process stays alive for the entire browser session.
//
import { useCallback, useEffect, useRef, useState } from "react";
import { sendVaultMessageFromPage } from "../../vault-proxy.js";

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

export type VaultStatus =
    | { state: "connecting" }
    | { state: "bridge-unavailable"; error: string }
    | { state: "uninitialized"; minPasswordLength?: number }
    | { state: "locked"; keyMode?: "password" | "keychain"; minPasswordLength?: number }
    | { state: "unlocked"; minPasswordLength?: number }
    | { state: "locked_out"; secondsRemaining: number; minPasswordLength?: number };

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

export function useVault(): UseVaultResult {
    const [status, setStatus] = useState<VaultStatus>({ state: "connecting" });
    const mountedRef = useRef(true);
    const [needsReauth, setNeedsReauth] = useState(false);

    // All vault operations go through the background proxy
    const sendVaultMessage = useCallback(async (message: Record<string, unknown>): Promise<Record<string, unknown>> => {
        const response = await sendVaultMessageFromPage(message);
        // If vault became locked mid-session (auto-lock), set needsReauth overlay
        if (response["type"] === "error" && response["reasonCode"] === "vault.locked") {
            setNeedsReauth(true);
            setStatus({ state: "locked" });
        }
        return response;
    }, []);

    const checkStatus = useCallback(async () => {
        try {
            const resp = await sendVaultMessageFromPage({ type: "vault.status" });
            if (!mountedRef.current) return;
            if (!isRecord(resp)) {
                setStatus({ state: "bridge-unavailable", error: "Invalid response from bridge." });
                return;
            }
            if (resp["type"] === "error") {
                setStatus({ state: "bridge-unavailable", error: resp["message"] as string ?? "Bridge error." });
                return;
            }
            const vaultState = resp["state"] as string;
            const keyMode = resp["keyMode"] as string | undefined;
            const minPwLen = typeof resp["minPasswordLength"] === "number" ? resp["minPasswordLength"] as number : undefined;
            const mpOpt = minPwLen !== undefined ? { minPasswordLength: minPwLen } : {};
            if (vaultState === "uninitialized") {
                setStatus({ state: "uninitialized", ...mpOpt });
            } else if (vaultState === "locked") {
                if (keyMode === "keychain") {
                    setStatus({ state: "locked", keyMode: "keychain", ...mpOpt });
                    try {
                        const unlockResp = await sendVaultMessageFromPage({ type: "vault.unlock.keychain" });
                        if (!mountedRef.current) return;
                        if (isRecord(unlockResp) && unlockResp["type"] !== "error") {
                            setStatus({ state: "unlocked", ...mpOpt });
                        } else {
                            setStatus({ state: "locked", keyMode: "keychain", ...mpOpt });
                        }
                    } catch {
                        if (!mountedRef.current) return;
                        setStatus({ state: "locked", keyMode: "keychain", ...mpOpt });
                    }
                } else {
                    setStatus({ state: "locked", keyMode: "password", ...mpOpt });
                }
            } else if (vaultState === "unlocked") {
                setStatus({ state: "unlocked", ...mpOpt });
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
