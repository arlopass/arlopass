import type { ProtocolCapability } from "@byom-ai/protocol";

import type {
  Grant,
  GrantRevocationReason,
  GrantScope,
  GrantType,
} from "./permissions/grant-types.js";

export type GrantCreatedEvent = Readonly<{
  grant: Grant;
}>;

export type GrantRevokedEvent = Readonly<{
  grant: Grant;
  reason: GrantRevocationReason;
  revokedAt: number;
}>;

export type GrantConsumedEvent = Readonly<{
  grant: Grant;
  requestId?: string;
  consumedAt: number;
}>;

export type SessionEstablishedEvent = Readonly<{
  sessionId: string;
  origin: string;
  establishedAt: number;
}>;

export type SessionTerminatedEvent = Readonly<{
  sessionId: string;
  origin: string;
  terminatedAt: number;
  reason: "disconnect" | "timeout" | "bridge-reset" | "extension-reload";
}>;

export type PermissionCheckEvent = Readonly<{
  origin: string;
  providerId: string;
  modelId: string;
  capability: ProtocolCapability;
  allowed: boolean;
  matchedGrantId?: string;
  checkedAt: number;
}>;

export type ConsentRequestedEvent = Readonly<{
  origin: string;
  providerId: string;
  modelId: string;
  capabilities: readonly ProtocolCapability[];
  requestedAt: number;
}>;

export type ConsentResolvedEvent = Readonly<{
  origin: string;
  providerId: GrantScope;
  modelId: GrantScope;
  capabilities: readonly ProtocolCapability[];
  grantType?: GrantType;
  granted: boolean;
  resolvedAt: number;
}>;

export type BridgeGrantRevocationEvent = Readonly<{
  grantId: string;
  origin: string;
  providerId: GrantScope;
  modelId: GrantScope;
  capabilities: readonly ProtocolCapability[];
  revokedAt: number;
  reason: GrantRevocationReason;
}>;

export type BridgeGrantSynchronizationEvent = Readonly<{
  grantId: string;
  origin: string;
  providerId: GrantScope;
  modelId: GrantScope;
  capabilities: readonly ProtocolCapability[];
  grantType: GrantType;
  createdAt: number;
  expiresAt?: number;
}>;

export type ConnectionHealthState =
  | "reconnecting"
  | "failed"
  | "revoked"
  | "degraded";

export type ConnectionHealthChangedEvent = Readonly<{
  providerId: string;
  state: ConnectionHealthState;
  reasonCode?: string;
  detail?: string;
  updatedAt: number;
}>;

export type ConnectionDiscoveryUpdatedEvent = Readonly<{
  providerId: string;
  cacheStatus: "hot" | "stale" | "miss" | "refreshed";
  degraded: boolean;
  degradedReason?: "stale" | "partial" | "unavailable";
  detail?: string;
  updatedAt: number;
}>;

export type ExtensionEventMap = {
  "grant-created": GrantCreatedEvent;
  "grant-revoked": GrantRevokedEvent;
  "grant-consumed": GrantConsumedEvent;
  "permission-checked": PermissionCheckEvent;
  "consent-requested": ConsentRequestedEvent;
  "consent-resolved": ConsentResolvedEvent;
  "session-established": SessionEstablishedEvent;
  "session-terminated": SessionTerminatedEvent;
  "bridge-grant-synchronization": BridgeGrantSynchronizationEvent;
  "bridge-grant-revocation": BridgeGrantRevocationEvent;
  "connection-health-changed": ConnectionHealthChangedEvent;
  "connection-discovery-updated": ConnectionDiscoveryUpdatedEvent;
};

type EventListener<TPayload> = (payload: TPayload) => void;

export class ExtensionEventEmitter<TEventMap extends Record<string, unknown>> {
  readonly #listeners: Map<keyof TEventMap, Set<EventListener<unknown>>> = new Map();

  on<TKey extends keyof TEventMap>(
    eventName: TKey,
    listener: EventListener<TEventMap[TKey]>,
  ): () => void {
    const listeners = this.#listeners.get(eventName) ?? new Set();
    listeners.add(listener as EventListener<unknown>);
    this.#listeners.set(eventName, listeners);
    return () => {
      this.off(eventName, listener);
    };
  }

  once<TKey extends keyof TEventMap>(
    eventName: TKey,
    listener: EventListener<TEventMap[TKey]>,
  ): () => void {
    const dispose = this.on(eventName, (payload) => {
      dispose();
      listener(payload);
    });
    return dispose;
  }

  off<TKey extends keyof TEventMap>(
    eventName: TKey,
    listener: EventListener<TEventMap[TKey]>,
  ): void {
    const listeners = this.#listeners.get(eventName);
    if (listeners === undefined) {
      return;
    }

    listeners.delete(listener as EventListener<unknown>);
    if (listeners.size === 0) {
      this.#listeners.delete(eventName);
    }
  }

  emit<TKey extends keyof TEventMap>(eventName: TKey, payload: TEventMap[TKey]): void {
    const listeners = this.#listeners.get(eventName);
    if (listeners === undefined || listeners.size === 0) {
      return;
    }

    const listenersSnapshot = [...listeners];
    for (const listener of listenersSnapshot) {
      listener(payload);
    }
  }

  removeAllListeners<TKey extends keyof TEventMap>(eventName?: TKey): void {
    if (eventName !== undefined) {
      this.#listeners.delete(eventName);
      return;
    }

    this.#listeners.clear();
  }
}
