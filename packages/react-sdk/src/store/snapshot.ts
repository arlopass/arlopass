import type { ClientState, ProviderDescriptor } from "../types.js";
import type { ArlopassSDKError } from "@arlopass/web-sdk";

export type ClientSnapshot = Readonly<{
    state: ClientState;
    sessionId: string | null;
    selectedProvider: Readonly<{ providerId: string; modelId: string }> | null;
    providers: readonly ProviderDescriptor[];
    error: ArlopassSDKError | null;
}>;

export type SnapshotInput = {
    state: ClientState;
    sessionId?: string | null;
    selectedProvider?: Readonly<{ providerId: string; modelId: string }> | null;
    providers?: readonly ProviderDescriptor[];
    error?: ArlopassSDKError | null;
};

export const EMPTY_PROVIDERS: readonly ProviderDescriptor[] = Object.freeze([]);

export function createInitialSnapshot(): ClientSnapshot {
    return {
        state: "disconnected",
        sessionId: null,
        selectedProvider: null,
        providers: EMPTY_PROVIDERS,
        error: null,
    };
}

export function buildSnapshot(input: SnapshotInput): ClientSnapshot {
    return {
        state: input.state,
        sessionId: input.sessionId ?? null,
        selectedProvider: input.selectedProvider ?? null,
        providers: input.providers ?? [],
        error: input.error ?? null,
    };
}

export function snapshotsEqual(a: ClientSnapshot, b: ClientSnapshot): boolean {
    return (
        a.state === b.state &&
        a.sessionId === b.sessionId &&
        a.selectedProvider === b.selectedProvider &&
        a.providers === b.providers &&
        a.error === b.error
    );
}
