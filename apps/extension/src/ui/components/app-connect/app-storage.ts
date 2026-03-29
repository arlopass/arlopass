/**
 * Connected app storage for the Arlopass extension.
 *
 * Each connected app represents a web origin that the user has approved
 * to use the wallet's providers and models. Apps survive browser restarts
 * and are persisted in the vault via the bridge.
 */

export type SendVaultMessage = (message: Record<string, unknown>) => Promise<Record<string, unknown>>;

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

/** Map a vault VaultAppConnection record to a ConnectedApp. */
function vaultToConnectedApp(v: Record<string, unknown>): ConnectedApp {
    const perms = (typeof v["permissions"] === "object" && v["permissions"] !== null ? v["permissions"] : {}) as Record<string, unknown>;
    const rules = (typeof v["rules"] === "object" && v["rules"] !== null ? v["rules"] : {}) as Record<string, unknown>;
    const limits = (typeof v["limits"] === "object" && v["limits"] !== null ? v["limits"] : {}) as Record<string, unknown>;

    const app: ConnectedApp = {
        id: String(v["id"] ?? ""),
        origin: String(v["origin"] ?? ""),
        displayName: String(v["displayName"] ?? ""),
        enabledProviderIds: Array.isArray(v["approvedProviders"]) ? v["approvedProviders"] as string[] : [],
        enabledModelIds: Array.isArray(v["approvedModels"]) ? v["approvedModels"] as string[] : [],
        permissions: {
            autopilot: perms["autopilot"] === true,
            readBalance: perms["readBalance"] === true,
            autoSelectModel: perms["autoSelectModel"] === true,
        },
        rules: {
            lowTokenUsage: rules["lowTokenUsage"] === true,
            noFallback: rules["noFallback"] === true,
            alwaysAskPermission: rules["alwaysAskPermission"] !== false,
        },
        limits: {
            consecutiveCalls: typeof limits["consecutiveCalls"] === "number" ? limits["consecutiveCalls"] : DEFAULT_LIMITS.consecutiveCalls,
            dailyTokens: typeof limits["dailyTokens"] === "number" ? limits["dailyTokens"] : DEFAULT_LIMITS.dailyTokens,
            concurrentCalls: typeof limits["concurrentCalls"] === "number" ? limits["concurrentCalls"] : DEFAULT_LIMITS.concurrentCalls,
        },
        tokenUsage: typeof perms["__tokenUsage"] === "number" ? perms["__tokenUsage"] : 0,
        lastUsedAt: typeof v["lastUsedAt"] === "string" ? new Date(v["lastUsedAt"] as string).getTime() : 0,
        createdAt: typeof v["createdAt"] === "string" ? new Date(v["createdAt"] as string).getTime() : 0,
        status: perms["__status"] === "disabled" ? "disabled" : "active",
    };
    if (typeof perms["__appId"] === "string") app.appId = perms["__appId"];
    if (typeof perms["__description"] === "string") app.description = perms["__description"];
    if (typeof perms["__iconUrl"] === "string") app.iconUrl = perms["__iconUrl"];
    return app;
}

/** Map a ConnectedApp to vault message fields for vault.apps.save. */
function connectedAppToVaultFields(app: ConnectedApp): Record<string, unknown> {
    return {
        id: app.id,
        origin: app.origin,
        displayName: app.displayName,
        approvedProviders: app.enabledProviderIds,
        approvedModels: app.enabledModelIds,
        permissions: {
            ...app.permissions,
            __appId: app.appId,
            __description: app.description,
            __iconUrl: app.iconUrl,
            __tokenUsage: app.tokenUsage,
            __status: app.status,
        } as Record<string, unknown>,
        rules: { ...app.rules } as Record<string, unknown>,
        limits: { ...app.limits } as Record<string, unknown>,
    };
}

export async function loadApps(sendVaultMessage: SendVaultMessage): Promise<ConnectedApp[]> {
    const resp = await sendVaultMessage({ type: "vault.apps.list" });
    const raw = Array.isArray(resp["appConnections"]) ? resp["appConnections"] as Record<string, unknown>[] : [];
    return raw.map(vaultToConnectedApp);
}

export async function loadAppByOrigin(origin: string, sendVaultMessage: SendVaultMessage): Promise<ConnectedApp | null> {
    const apps = await loadApps(sendVaultMessage);
    return apps.find((a) => a.origin === origin) ?? null;
}

export async function saveApp(app: Omit<ConnectedApp, "id" | "createdAt" | "tokenUsage" | "lastUsedAt">, sendVaultMessage: SendVaultMessage): Promise<ConnectedApp> {
    const apps = await loadApps(sendVaultMessage);
    const now = Date.now();

    // Check if origin already exists → update
    const existing = apps.find((a) => a.origin === app.origin);
    if (existing) {
        const updated: ConnectedApp = {
            ...existing,
            ...app,
            lastUsedAt: now,
        };
        await sendVaultMessage({ type: "vault.apps.save", ...connectedAppToVaultFields(updated) });
        return updated;
    }

    // Enforce cap
    if (apps.length >= MAX_APPS) {
        const oldest = apps.reduce((a, b) => (a.lastUsedAt < b.lastUsedAt ? a : b));
        await sendVaultMessage({ type: "vault.apps.delete", appId: oldest.id });
    }

    const newApp: ConnectedApp = {
        id: generateAppId(),
        ...app,
        tokenUsage: 0,
        lastUsedAt: now,
        createdAt: now,
    };
    await sendVaultMessage({ type: "vault.apps.save", ...connectedAppToVaultFields(newApp) });
    return newApp;
}

export async function updateAppLastUsed(origin: string, sendVaultMessage: SendVaultMessage): Promise<void> {
    const app = await loadAppByOrigin(origin, sendVaultMessage);
    if (app) {
        const updated = { ...app, lastUsedAt: Date.now() };
        await sendVaultMessage({ type: "vault.apps.save", ...connectedAppToVaultFields(updated) });
    }
}

export async function removeApp(origin: string, sendVaultMessage: SendVaultMessage): Promise<void> {
    const app = await loadAppByOrigin(origin, sendVaultMessage);
    if (app) {
        await sendVaultMessage({ type: "vault.apps.delete", appId: app.id });

        // Notify content scripts in tabs matching this origin so active
        // streams are torn down and the page SDK learns immediately.
        try {
            const tabs = await chrome.tabs.query({ url: `${origin}/*` });
            for (const tab of tabs) {
                if (tab.id !== undefined) {
                    chrome.tabs.sendMessage(tab.id, {
                        channel: "arlopass.app.disconnected",
                        origin,
                    }).catch(() => {
                        // Tab may not have the content script; ignore.
                    });
                }
            }
        } catch {
            // Tabs API may be unavailable in some contexts; non-fatal.
        }
    }
}
