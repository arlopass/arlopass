/**
 * Connected app storage for the BYOM extension.
 *
 * Each connected app represents a web origin that the user has approved
 * to use the wallet's providers and models. Apps survive browser restarts
 * and are persisted in chrome.storage.local.
 *
 * Storage key: `byom.wallet.apps.v1`
 */

const STORAGE_KEY = "byom.wallet.apps.v1";
const MAX_APPS = 100;

export type AppPermissions = {
    autopilot: boolean;
    readBalance: boolean;
    autoSelectModel: boolean;
};

export type AppRules = {
    lowTokenUsage: boolean;
    noFallback: boolean;
    alwaysAskPermission: boolean;
};

export type AppLimits = {
    consecutiveCalls: number;
    dailyTokens: number;
    concurrentCalls: number;
};

export type ConnectedApp = {
    id: string;
    origin: string;
    displayName: string;
    appId?: string;
    description?: string;
    iconUrl?: string;
    enabledProviderIds: string[];
    enabledModelIds: string[];
    permissions: AppPermissions;
    rules: AppRules;
    limits: AppLimits;
    tokenUsage: number;
    lastUsedAt: number;
    createdAt: number;
    status: "active" | "disabled";
};

export const DEFAULT_PERMISSIONS: AppPermissions = {
    autopilot: false,
    readBalance: false,
    autoSelectModel: false,
};

export const DEFAULT_RULES: AppRules = {
    lowTokenUsage: false,
    noFallback: false,
    alwaysAskPermission: true,
};

export const DEFAULT_LIMITS: AppLimits = {
    consecutiveCalls: 25,
    dailyTokens: 100_000,
    concurrentCalls: 3,
};

function generateAppId(): string {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return `app.${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function loadApps(): Promise<ConnectedApp[]> {
    return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            const raw = result[STORAGE_KEY];
            if (!Array.isArray(raw)) { resolve([]); return; }
            resolve(raw.filter(isValidApp));
        });
    });
}

export async function loadAppByOrigin(origin: string): Promise<ConnectedApp | null> {
    const apps = await loadApps();
    return apps.find((a) => a.origin === origin) ?? null;
}

export async function saveApp(app: Omit<ConnectedApp, "id" | "createdAt" | "tokenUsage" | "lastUsedAt">): Promise<ConnectedApp> {
    const apps = await loadApps();
    const now = Date.now();

    // Check if origin already exists → update
    const existingIdx = apps.findIndex((a) => a.origin === app.origin);
    if (existingIdx >= 0) {
        const updated: ConnectedApp = {
            ...apps[existingIdx]!,
            ...app,
            lastUsedAt: now,
        };
        apps[existingIdx] = updated;
        await writeApps(apps);
        return updated;
    }

    // Enforce cap
    if (apps.length >= MAX_APPS) {
        const oldest = apps.reduce((a, b) => (a.lastUsedAt < b.lastUsedAt ? a : b));
        const idx = apps.indexOf(oldest);
        if (idx >= 0) apps.splice(idx, 1);
    }

    const newApp: ConnectedApp = {
        id: generateAppId(),
        ...app,
        tokenUsage: 0,
        lastUsedAt: now,
        createdAt: now,
    };
    apps.push(newApp);
    await writeApps(apps);
    return newApp;
}

export async function updateAppLastUsed(origin: string): Promise<void> {
    const apps = await loadApps();
    const idx = apps.findIndex((a) => a.origin === origin);
    if (idx >= 0) {
        apps[idx] = { ...apps[idx]!, lastUsedAt: Date.now() };
        await writeApps(apps);
    }
}

export async function removeApp(origin: string): Promise<void> {
    const apps = await loadApps();
    await writeApps(apps.filter((a) => a.origin !== origin));
}

function writeApps(apps: ConnectedApp[]): Promise<void> {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEY]: apps }, () => resolve());
    });
}

function isValidApp(raw: unknown): raw is ConnectedApp {
    if (typeof raw !== "object" || raw === null) return false;
    const obj = raw as Record<string, unknown>;
    return (
        typeof obj["id"] === "string" &&
        typeof obj["origin"] === "string" &&
        typeof obj["displayName"] === "string" &&
        Array.isArray(obj["enabledProviderIds"]) &&
        Array.isArray(obj["enabledModelIds"]) &&
        typeof obj["permissions"] === "object" && obj["permissions"] !== null &&
        typeof obj["rules"] === "object" && obj["rules"] !== null &&
        typeof obj["limits"] === "object" && obj["limits"] !== null &&
        typeof obj["createdAt"] === "number" &&
        typeof obj["status"] === "string" &&
        (obj["appId"] == null || typeof obj["appId"] === "string") &&
        (obj["description"] == null || typeof obj["description"] === "string") &&
        (obj["iconUrl"] == null || typeof obj["iconUrl"] === "string")
    );
}
