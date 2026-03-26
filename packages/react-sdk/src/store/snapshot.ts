import type { ClientState, ProviderDescriptor } from "../types.js";
import type { BYOMSDKError } from "@byom-ai/web-sdk";

export type ClientSnapshot = Readonly<{
  state: ClientState;
  sessionId: string | null;
  selectedProvider: Readonly<{ providerId: string; modelId: string }> | null;
  providers: readonly ProviderDescriptor[];
  error: BYOMSDKError | null;
}>;

export type SnapshotInput = {
  state: ClientState;
  sessionId?: string | null;
  selectedProvider?: Readonly<{ providerId: string; modelId: string }> | null;
  providers?: readonly ProviderDescriptor[];
  error?: BYOMSDKError | null;
};

const EMPTY_PROVIDERS: readonly ProviderDescriptor[] = Object.freeze([]);

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
