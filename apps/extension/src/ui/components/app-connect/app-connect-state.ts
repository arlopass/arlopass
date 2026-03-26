import type { AppPermissions, AppRules, AppLimits } from "./app-storage.js";
import { DEFAULT_PERMISSIONS, DEFAULT_RULES, DEFAULT_LIMITS } from "./app-storage.js";

export type AppConnectStep =
    | "approve"
    | "select-providers"
    | "select-models"
    | "configure-settings"
    | "saving";

export type AppConnectState = {
    step: AppConnectStep;
    origin: string;
    displayName: string;
    enabledProviderIds: string[];
    enabledModelIds: string[];
    permissions: AppPermissions;
    rules: AppRules;
    limits: AppLimits;
    saving: boolean;
};

export function createInitialState(origin: string): AppConnectState {
    let displayName = origin;
    try { displayName = new URL(origin).hostname; } catch { /* keep raw */ }
    return {
        step: "approve",
        origin,
        displayName,
        enabledProviderIds: [],
        enabledModelIds: [],
        permissions: { ...DEFAULT_PERMISSIONS },
        rules: { ...DEFAULT_RULES },
        limits: { ...DEFAULT_LIMITS },
        saving: false,
    };
}

export type AppConnectAction =
    | { type: "APPROVE" }
    | { type: "DECLINE" }
    | { type: "SET_PROVIDERS"; providerIds: string[] }
    | { type: "SET_MODELS"; modelIds: string[] }
    | { type: "SET_PERMISSION"; key: keyof AppPermissions; value: boolean }
    | { type: "SET_RULE"; key: keyof AppRules; value: boolean }
    | { type: "SET_LIMIT"; key: keyof AppLimits; value: number }
    | { type: "GO_TO_MODELS" }
    | { type: "GO_TO_SETTINGS" }
    | { type: "START_SAVE" }
    | { type: "SAVE_COMPLETE" }
    | { type: "GO_BACK" }
    | { type: "__HYDRATE__"; state: AppConnectState };

export function appConnectReducer(state: AppConnectState, action: AppConnectAction): AppConnectState {
    switch (action.type) {
        case "APPROVE":
            return { ...state, step: "select-providers" };
        case "SET_PROVIDERS":
            return { ...state, enabledProviderIds: action.providerIds };
        case "GO_TO_MODELS":
            return { ...state, step: "select-models" };
        case "SET_MODELS":
            return { ...state, enabledModelIds: action.modelIds };
        case "GO_TO_SETTINGS":
            return { ...state, step: "configure-settings" };
        case "SET_PERMISSION":
            return { ...state, permissions: { ...state.permissions, [action.key]: action.value } };
        case "SET_RULE":
            return { ...state, rules: { ...state.rules, [action.key]: action.value } };
        case "SET_LIMIT":
            return { ...state, limits: { ...state.limits, [action.key]: action.value } };
        case "START_SAVE":
            return { ...state, saving: true, step: "saving" };
        case "SAVE_COMPLETE":
            return { ...state, saving: false };
        case "GO_BACK": {
            if (state.step === "configure-settings") return { ...state, step: "select-models" };
            if (state.step === "select-models") return { ...state, step: "select-providers" };
            if (state.step === "select-providers") return { ...state, step: "approve" };
            return state;
        }
        case "__HYDRATE__":
            return { ...action.state, saving: false };
        default:
            return state;
    }
}
