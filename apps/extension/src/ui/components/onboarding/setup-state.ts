import { wrapPairingKeyMaterial, parseBridgePairingState } from "../../../transport/bridge-pairing.js";

export type SetupStep = 1 | 2 | 3 | 4 | 5;

export type OnboardingSetupState = {
    completed: boolean;
    bridgeInstalled: boolean;
    currentStep: SetupStep;
};

const STORAGE_KEY = "arlopass.onboarding.setup";
const PAIRING_STATE_KEY = "arlopass.wallet.bridgePairing.v1";

const DEFAULT_STATE: OnboardingSetupState = {
    completed: false,
    bridgeInstalled: false,
    currentStep: 1,
};

export async function readSetupState(): Promise<OnboardingSetupState> {
    return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            const raw = result[STORAGE_KEY];
            if (
                raw != null &&
                typeof raw === "object" &&
                typeof (raw as Record<string, unknown>).completed === "boolean" &&
                typeof (raw as Record<string, unknown>).currentStep === "number"
            ) {
                resolve(raw as OnboardingSetupState);
            } else {
                resolve(DEFAULT_STATE);
            }
        });
    });
}

export async function writeSetupState(state: OnboardingSetupState): Promise<void> {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEY]: state }, resolve);
    });
}

export async function markSetupComplete(): Promise<void> {
    const current = await readSetupState();
    await writeSetupState({ ...current, completed: true, currentStep: 5 });
}

export async function detectBridge(): Promise<{ connected: boolean; version?: string }> {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            resolve({ connected: false });
        }, 5000);

        try {
            chrome.runtime.sendNativeMessage(
                "com.arlopass.bridge",
                { type: "ping" },
                (response) => {
                    clearTimeout(timeout);
                    if (chrome.runtime.lastError) {
                        resolve({ connected: false });
                        return;
                    }
                    const version = typeof response?.version === "string" ? response.version : undefined;
                    resolve({ connected: true, version });
                },
            );
        } catch {
            clearTimeout(timeout);
            resolve({ connected: false });
        }
    });
}

export async function readPairingState(): Promise<unknown> {
    return new Promise((resolve) => {
        chrome.storage.local.get([PAIRING_STATE_KEY], (result) => {
            const raw = result[PAIRING_STATE_KEY];
            resolve(parseBridgePairingState(raw) !== undefined ? raw : undefined);
        });
    });
}

export async function autoPair(): Promise<{ success: boolean; error?: string }> {
    // Check if already paired
    const existing = await readPairingState();
    if (existing !== undefined) {
        return { success: true };
    }

    // Send pairing.auto to bridge
    try {
        const response = await new Promise<unknown>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Auto-pair timed out")), 10_000);
            chrome.runtime.sendNativeMessage(
                "com.arlopass.bridge",
                {
                    type: "pairing.auto",
                    extensionId: chrome.runtime.id ?? "",
                    hostName: "com.arlopass.bridge",
                },
                (resp: unknown) => {
                    clearTimeout(timeout);
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message ?? "Native messaging error"));
                        return;
                    }
                    resolve(resp);
                },
            );
        });

        // Validate response
        if (typeof response !== "object" || response === null) {
            return { success: false, error: "Invalid response from bridge" };
        }
        const resp = response as Record<string, unknown>;
        if (resp["type"] === "error") {
            return { success: false, error: String(resp["message"] ?? "Bridge returned error") };
        }
        if (resp["type"] !== "pairing.auto") {
            return { success: false, error: "Unexpected response type" };
        }

        const pairingHandle = resp["pairingHandle"];
        const pairingKeyHex = resp["pairingKeyHex"];
        const extensionId = resp["extensionId"];
        const hostName = resp["hostName"];
        const createdAt = resp["createdAt"];

        if (
            typeof pairingHandle !== "string" || typeof pairingKeyHex !== "string" ||
            typeof extensionId !== "string" || typeof hostName !== "string" ||
            typeof createdAt !== "string"
        ) {
            return { success: false, error: "Invalid pairing response fields" };
        }

        // Wrap pairing key and store
        const pairingState = await wrapPairingKeyMaterial({
            pairingHandle,
            extensionId,
            hostName,
            pairingKeyHex,
            runtimeId: chrome.runtime.id ?? "",
            createdAt,
        });

        // Store in chrome.storage.local
        await new Promise<void>((resolve, reject) => {
            chrome.storage.local.set({ [PAIRING_STATE_KEY]: pairingState }, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message ?? "Storage error"));
                    return;
                }
                resolve();
            });
        });

        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
