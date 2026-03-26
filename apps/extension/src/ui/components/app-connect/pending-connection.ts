/**
 * Pending connection request — written by the background when a new
 * origin sends session.create, read by the popup to show the connection wizard.
 *
 * Flow:
 * 1. Background receives session.create from unknown origin
 * 2. Background writes pending request to storage
 * 3. Background opens popup (chrome.action.openPopup)
 * 4. Popup reads pending request, shows connection wizard
 * 5. On user decision, popup writes result to storage and clears pending
 * 6. Background polls/watches storage for result
 */

const PENDING_KEY = "byom.wallet.pendingConnection.v1";

export type PendingConnectionRequest = {
    origin: string;
    requestedAt: number;
};

export type ConnectionResult = {
    origin: string;
    approved: boolean;
    resolvedAt: number;
};

export async function writePendingConnection(origin: string): Promise<void> {
    const request: PendingConnectionRequest = { origin, requestedAt: Date.now() };
    return new Promise((resolve) => {
        chrome.storage.local.set({ [PENDING_KEY]: request }, () => resolve());
    });
}

export async function readPendingConnection(): Promise<PendingConnectionRequest | null> {
    return new Promise((resolve) => {
        chrome.storage.local.get([PENDING_KEY], (result) => {
            const raw = result[PENDING_KEY];
            if (raw != null && typeof raw === "object" && typeof (raw as Record<string, unknown>)["origin"] === "string") {
                resolve(raw as PendingConnectionRequest);
            } else {
                resolve(null);
            }
        });
    });
}

export async function clearPendingConnection(): Promise<void> {
    return new Promise((resolve) => {
        chrome.storage.local.remove([PENDING_KEY], () => resolve());
    });
}

const RESULT_KEY = "byom.wallet.connectionResult.v1";

export async function writeConnectionResult(origin: string, approved: boolean): Promise<void> {
    const result: ConnectionResult = { origin, approved, resolvedAt: Date.now() };
    return new Promise((resolve) => {
        chrome.storage.local.set({ [RESULT_KEY]: result }, () => resolve());
    });
}

export async function readConnectionResult(): Promise<ConnectionResult | null> {
    return new Promise((resolve) => {
        chrome.storage.local.get([RESULT_KEY], (result) => {
            const raw = result[RESULT_KEY];
            if (raw != null && typeof raw === "object" && typeof (raw as Record<string, unknown>)["origin"] === "string") {
                resolve(raw as ConnectionResult);
            } else {
                resolve(null);
            }
        });
    });
}

export async function clearConnectionResult(): Promise<void> {
    return new Promise((resolve) => {
        chrome.storage.local.remove([RESULT_KEY], () => resolve());
    });
}
