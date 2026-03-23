import {
  PermissionError,
  type CanonicalEnvelope,
  type ProtocolErrorDetails,
} from "@byom-ai/protocol";
import type {
  BYOMTransport,
  TransportResponse,
} from "@byom-ai/web-sdk";

import {
  ExtensionEventEmitter,
  type BridgeGrantRevocationEvent,
  type BridgeGrantSynchronizationEvent,
  type ExtensionEventMap,
} from "./events.js";
import {
  ConsentController,
  type ConsentRequest,
} from "./consent/consent-controller.js";
import {
  GrantStore,
  type GrantPermissionMatch,
  type GrantStoreOptions,
} from "./permissions/grant-store.js";
import type {
  Grant,
  GrantRevocationReason,
  GrantType,
} from "./permissions/grant-types.js";

export type BridgeGrantSynchronizer = Readonly<{
  publishGrant(event: BridgeGrantSynchronizationEvent): Promise<void>;
  revokeGrant(event: BridgeGrantRevocationEvent): Promise<void>;
}>;

export type ExtensionBackgroundServiceOptions = Readonly<{
  transport: BYOMTransport;
  consentController: ConsentController;
  grantStore?: GrantStore;
  grantStoreOptions?: Omit<GrantStoreOptions, "events">;
  events?: ExtensionEventEmitter<ExtensionEventMap>;
  grantSynchronizer?: BridgeGrantSynchronizer;
  reportError?: (error: Error) => void;
  now?: () => number;
}>;

export type MediationRequest<TPayload = unknown> = Readonly<{
  envelope: CanonicalEnvelope<TPayload>;
  timeoutMs?: number;
}>;

export type MediationDecision = Readonly<{
  granted: boolean;
  grantId?: string;
  grantType?: GrantType;
  reason:
    | "allow"
    | "grant-created"
    | "user-denied"
    | "bridge-revoked"
    | "grant-not-found"
    | "grant-expired"
    | "grant-consumed";
}>;

type InFlightOperation = {
  requestId: string;
  grantId: string;
  mode: "request" | "stream";
  revoked: boolean;
  revokeReason: GrantRevocationReason | undefined;
};

function createPermissionDeniedError(
  message: string,
  details: ProtocolErrorDetails,
): PermissionError {
  return new PermissionError(message, { details });
}

// ---------------------------------------------------------------------------
// Wallet action types and handlers
// ---------------------------------------------------------------------------

export type WalletActionResponse =
  | Readonly<{ ok: true; data?: object }>
  | Readonly<{ ok: false; errorCode: string; message: string }>;

/** Inbound envelope shape from the popup via chrome.runtime.sendMessage. */
export type WalletMessageEnvelope = Readonly<{
  channel: "byom.wallet";
  action: string;
  requestId: string;
  payload: unknown;
}>;

/**
 * Minimal interface over chrome.storage.local (or a test double).
 * Keys are the storage key names defined by the wallet storage contract v1.
 */
export type WalletStorageAdapter = Readonly<{
  get(keys: readonly string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}>;

export type WalletHandlerOptions = Readonly<{
  storage: WalletStorageAdapter;
  /** Injected so callers can substitute chrome.runtime.openOptionsPage. */
  openOptionsPage?: () => void;
}>;

// Storage key constants (spec: Storage Contract v1).
const WALLET_KEY_PROVIDERS = "byom.wallet.providers.v1";
const WALLET_KEY_ACTIVE = "byom.wallet.activeProvider.v1";

type StoredProvider = {
  id: string;
  name: string;
  type: "local" | "cloud" | "cli";
  status: "connected" | "disconnected" | "attention";
  models: Array<{ id: string; name: string }>;
  lastSyncedAt?: number;
};

type StoredActiveProvider = { providerId: string; modelId?: string } | null;

function isStoredProvider(v: unknown): v is StoredProvider {
  if (typeof v !== "object" || v === null) {
    return false;
  }
  const rec = v as Record<string, unknown>;
  return typeof rec["id"] === "string" && typeof rec["name"] === "string";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function walletHandleSetActiveProvider(
  payload: unknown,
  storage: WalletStorageAdapter,
): Promise<WalletActionResponse> {
  if (!isRecord(payload) || typeof payload["providerId"] !== "string") {
    return {
      ok: false,
      errorCode: "invalid_payload",
      message: "payload.providerId must be a string",
    };
  }

  const providerId = payload["providerId"];
  const modelId = typeof payload["modelId"] === "string" ? payload["modelId"] : undefined;

  const active: { providerId: string; modelId?: string } = { providerId };
  if (modelId !== undefined) {
    active.modelId = modelId;
  }

  await storage.set({ [WALLET_KEY_ACTIVE]: active });
  return { ok: true };
}

async function walletHandleSetActiveModel(
  payload: unknown,
  storage: WalletStorageAdapter,
): Promise<WalletActionResponse> {
  if (
    !isRecord(payload) ||
    typeof payload["providerId"] !== "string" ||
    typeof payload["modelId"] !== "string"
  ) {
    return {
      ok: false,
      errorCode: "invalid_payload",
      message: "payload.providerId and payload.modelId must be strings",
    };
  }

  const providerId = payload["providerId"];
  const modelId = payload["modelId"];

  const stored = await storage.get([WALLET_KEY_PROVIDERS]);
  const rawProviders = stored[WALLET_KEY_PROVIDERS];

  if (!Array.isArray(rawProviders)) {
    return {
      ok: false,
      errorCode: "invalid_selection",
      message: `Provider "${providerId}" not found`,
    };
  }

  const provider = (rawProviders as unknown[]).find(
    (p): p is StoredProvider => isStoredProvider(p) && p.id === providerId,
  );

  if (provider === undefined) {
    return {
      ok: false,
      errorCode: "invalid_selection",
      message: `Provider "${providerId}" not found`,
    };
  }

  const modelExists = provider.models.some((m) => m.id === modelId);
  if (!modelExists) {
    return {
      ok: false,
      errorCode: "invalid_selection",
      message: `Model "${modelId}" not found in provider "${providerId}"`,
    };
  }

  await storage.set({ [WALLET_KEY_ACTIVE]: { providerId, modelId } });
  return { ok: true };
}

async function walletHandleRevokeProvider(
  payload: unknown,
  storage: WalletStorageAdapter,
): Promise<WalletActionResponse> {
  if (!isRecord(payload) || typeof payload["providerId"] !== "string") {
    return {
      ok: false,
      errorCode: "invalid_payload",
      message: "payload.providerId must be a string",
    };
  }

  const providerId = payload["providerId"];

  const stored = await storage.get([WALLET_KEY_PROVIDERS, WALLET_KEY_ACTIVE]);
  const rawProviders = stored[WALLET_KEY_PROVIDERS];
  const rawActive = stored[WALLET_KEY_ACTIVE];

  const updatedProviders = Array.isArray(rawProviders)
    ? (rawProviders as unknown[]).filter(
        (p) => !(isStoredProvider(p) && p.id === providerId),
      )
    : [];

  const currentActive =
    isRecord(rawActive) && typeof rawActive["providerId"] === "string"
      ? (rawActive as StoredActiveProvider)
      : null;

  const updatedActive: StoredActiveProvider =
    currentActive !== null && currentActive.providerId === providerId
      ? null
      : currentActive;

  await storage.set({
    [WALLET_KEY_PROVIDERS]: updatedProviders,
    [WALLET_KEY_ACTIVE]: updatedActive,
  });

  return { ok: true };
}

async function walletHandleOpenConnectFlow(
  openOptionsPage: (() => void) | undefined,
): Promise<WalletActionResponse> {
  if (typeof openOptionsPage !== "function") {
    return {
      ok: false,
      errorCode: "connect_flow_unavailable",
      message: "Options page is not available in this context",
    };
  }

  try {
    openOptionsPage();
    return { ok: true };
  } catch {
    return {
      ok: false,
      errorCode: "connect_flow_unavailable",
      message: "Failed to open options page",
    };
  }
}

function isWalletMessageEnvelope(message: unknown): message is WalletMessageEnvelope {
  return (
    isRecord(message) &&
    message["channel"] === "byom.wallet" &&
    typeof message["action"] === "string" &&
    typeof message["requestId"] === "string"
  );
}

/**
 * Creates a wallet message dispatcher for use with chrome.runtime.onMessage.
 *
 * Returns `null` for messages that do not belong to the `byom.wallet` channel,
 * so the background listener can handle other channels transparently.
 *
 * Usage:
 * ```ts
 * const handle = createWalletMessageHandler({ storage, openOptionsPage });
 * chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
 *   void handle(msg).then((r) => { if (r !== null) sendResponse(r); });
 *   return true; // keep channel open for async response
 * });
 * ```
 */
export function createWalletMessageHandler(
  options: WalletHandlerOptions,
): (message: unknown) => Promise<WalletActionResponse | null> {
  const { storage, openOptionsPage } = options;

  const handlers: Record<
    string,
    (payload: unknown) => Promise<WalletActionResponse>
  > = {
    "wallet.setActiveProvider": (p) => walletHandleSetActiveProvider(p, storage),
    "wallet.setActiveModel": (p) => walletHandleSetActiveModel(p, storage),
    "wallet.revokeProvider": (p) => walletHandleRevokeProvider(p, storage),
    "wallet.openConnectFlow": () => walletHandleOpenConnectFlow(openOptionsPage),
  };

  return async (message: unknown): Promise<WalletActionResponse | null> => {
    if (!isWalletMessageEnvelope(message)) {
      return null;
    }

    const { action, payload } = message;
    const handler = handlers[action];

    if (handler === undefined) {
      return {
        ok: false,
        errorCode: "unsupported_action",
        message: `Wallet action "${action}" is not supported`,
      };
    }

    return handler(payload ?? {});
  };
}

// ---------------------------------------------------------------------------
// ExtensionBackgroundService
// ---------------------------------------------------------------------------

export class ExtensionBackgroundService {
  readonly #transport: BYOMTransport;
  readonly #consentController: ConsentController;
  readonly #events: ExtensionEventEmitter<ExtensionEventMap>;
  readonly #grantStore: GrantStore;
  readonly #grantSynchronizer: BridgeGrantSynchronizer | undefined;
  readonly #reportError: (error: Error) => void;
  readonly #now: () => number;
  readonly #inFlightByRequestId = new Map<string, InFlightOperation>();
  readonly #requestIdsByGrantId = new Map<string, Set<string>>();
  readonly #disposers: Array<() => void> = [];

  constructor(options: ExtensionBackgroundServiceOptions) {
    this.#transport = options.transport;
    this.#consentController = options.consentController;
    this.#events = options.events ?? new ExtensionEventEmitter<ExtensionEventMap>();
    this.#grantStore =
      options.grantStore ??
      new GrantStore({
        ...options.grantStoreOptions,
        events: this.#events,
      });
    this.#grantSynchronizer = options.grantSynchronizer;
    this.#reportError = options.reportError ?? ((error) => console.error(error));
    this.#now = options.now ?? Date.now;

    this.#disposers.push(
      this.#events.on("grant-revoked", (event) => {
        this.#markGrantRevoked(event.grant.id, event.reason);
      }),
    );
    if (this.#grantSynchronizer !== undefined) {
      this.#disposers.push(
        this.#events.on("bridge-grant-synchronization", (event) => {
          void this.#safelySynchronizeGrant(event);
        }),
      );
      this.#disposers.push(
        this.#events.on("bridge-grant-revocation", (event) => {
          void this.#safelySynchronizeRevocation(event);
        }),
      );
    }
  }

  get events(): ExtensionEventEmitter<ExtensionEventMap> {
    return this.#events;
  }

  get grantStore(): GrantStore {
    return this.#grantStore;
  }

  shutdown(): void {
    while (this.#disposers.length > 0) {
      const dispose = this.#disposers.pop();
      dispose?.();
    }
  }

  establishSession(sessionId: string, origin: string): void {
    this.#events.emit("session-established", {
      sessionId,
      origin,
      establishedAt: this.#now(),
    });
  }

  terminateSession(
    sessionId: string,
    origin: string,
    reason: "disconnect" | "timeout" | "bridge-reset" | "extension-reload",
  ): readonly Grant[] {
    this.#events.emit("session-terminated", {
      sessionId,
      origin,
      terminatedAt: this.#now(),
      reason,
    });

    return this.#grantStore.expireSessionGrants("session-ended");
  }

  revokeGrant(grantId: string, reason: GrantRevocationReason = "user"): Grant {
    return this.#grantStore.revokeGrant(grantId, reason);
  }

  expireStaleGrants(): readonly Grant[] {
    return this.#grantStore.expireStaleGrants();
  }

  async evaluatePermission(
    envelope: CanonicalEnvelope<unknown>,
  ): Promise<MediationDecision> {
    const permission = this.#grantStore.checkPermission({
      origin: envelope.origin,
      providerId: envelope.providerId,
      modelId: envelope.modelId,
      capability: envelope.capability,
    });

    if (permission.allowed && permission.grant !== undefined) {
      return {
        granted: true,
        grantId: permission.grant.id,
        grantType: permission.grant.grantType,
        reason: "allow",
      };
    }

    const grant = await this.#requestAndPersistConsent(envelope);
    if (grant === undefined) {
      return {
        granted: false,
        reason: "user-denied",
      };
    }

    return {
      granted: true,
      grantId: grant.id,
      grantType: grant.grantType,
      reason: "grant-created",
    };
  }

  async forwardRequest<TRequestPayload, TResponsePayload>(
    request: MediationRequest<TRequestPayload>,
  ): Promise<TransportResponse<TResponsePayload>> {
    const { grant } = await this.#ensureAuthorizedGrant(request.envelope);
    const operation = this.#registerInFlight(request.envelope.requestId, grant.id, "request");

    try {
      const response = await this.#transport.request<TRequestPayload, TResponsePayload>({
        envelope: request.envelope,
        ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
      });

      this.#throwIfOperationRevoked(operation);
      if (grant.grantType === "one-time") {
        this.#grantStore.consumeOneTimeGrant(grant.id, request.envelope.requestId);
      }

      return response;
    } catch (error) {
      if (operation.revoked) {
        throw this.#createRevokedInFlightError(request.envelope, operation);
      }

      throw error;
    } finally {
      this.#finalizeInFlight(operation.requestId);
    }
  }

  async forwardStream<TRequestPayload, TResponsePayload>(
    request: MediationRequest<TRequestPayload>,
  ): Promise<AsyncIterable<TransportResponse<TResponsePayload>>> {
    const { grant } = await this.#ensureAuthorizedGrant(request.envelope);
    const operation = this.#registerInFlight(request.envelope.requestId, grant.id, "stream");

    let stream: AsyncIterable<TransportResponse<TResponsePayload>>;
    try {
      stream = await this.#transport.stream<TRequestPayload, TResponsePayload>({
        envelope: request.envelope,
        ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
      });

      this.#throwIfOperationRevoked(operation);
      if (grant.grantType === "one-time") {
        this.#grantStore.consumeOneTimeGrant(grant.id, request.envelope.requestId);
      }
    } catch (error) {
      this.#finalizeInFlight(operation.requestId);
      if (operation.revoked) {
        throw this.#createRevokedInFlightError(request.envelope, operation);
      }

      throw error;
    }

    const iterator = stream[Symbol.asyncIterator]();
    const requestId = operation.requestId;
    const throwIfOperationRevoked = (): void => {
      this.#throwIfOperationRevoked(operation);
    };
    const createRevokedError = (): PermissionError =>
      this.#createRevokedInFlightError(request.envelope, operation);
    const finalizeInFlight = (): void => {
      this.#finalizeInFlight(requestId);
    };

    async function* guardedStream(): AsyncIterable<TransportResponse<TResponsePayload>> {
      try {
        while (true) {
          throwIfOperationRevoked();
          const next = await iterator.next();
          if (next.done) {
            return;
          }

          throwIfOperationRevoked();
          yield next.value;
        }
      } catch (error) {
        if (operation.revoked) {
          throw createRevokedError();
        }

        throw error;
      } finally {
        if (typeof iterator.return === "function") {
          await iterator.return();
        }
        finalizeInFlight();
      }
    }

    return guardedStream();
  }

  async mediate<TRequestPayload, TResponsePayload>(
    request: MediationRequest<TRequestPayload> & Readonly<{ mode: "request" }>,
  ): Promise<TransportResponse<TResponsePayload>>;
  async mediate<TRequestPayload, TResponsePayload>(
    request: MediationRequest<TRequestPayload> & Readonly<{ mode: "stream" }>,
  ): Promise<AsyncIterable<TransportResponse<TResponsePayload>>>;
  async mediate<TRequestPayload, TResponsePayload>(
    request:
      | (MediationRequest<TRequestPayload> & Readonly<{ mode: "request" }>)
      | (MediationRequest<TRequestPayload> & Readonly<{ mode: "stream" }>),
  ): Promise<
    | TransportResponse<TResponsePayload>
    | AsyncIterable<TransportResponse<TResponsePayload>>
  > {
    if (request.mode === "stream") {
      return this.forwardStream<TRequestPayload, TResponsePayload>(request);
    }

    return this.forwardRequest<TRequestPayload, TResponsePayload>(request);
  }

  async #ensureAuthorizedGrant(
    envelope: CanonicalEnvelope<unknown>,
  ): Promise<Readonly<{ grant: Grant; permission: GrantPermissionMatch }>> {
    const permission = this.#grantStore.checkPermission({
      origin: envelope.origin,
      providerId: envelope.providerId,
      modelId: envelope.modelId,
      capability: envelope.capability,
    });

    if (permission.allowed && permission.grant !== undefined) {
      return {
        grant: permission.grant,
        permission,
      };
    }

    const granted = await this.#requestAndPersistConsent(envelope);
    if (granted === undefined) {
      throw createPermissionDeniedError(
        "Request denied because the user did not grant permission.",
        {
          origin: envelope.origin,
          providerId: envelope.providerId,
          modelId: envelope.modelId,
          capability: envelope.capability,
          requestId: envelope.requestId,
        },
      );
    }

    return {
      grant: granted,
      permission: {
        allowed: true,
        grant: granted,
        reason: "allow",
      },
    };
  }

  async #requestAndPersistConsent(
    envelope: CanonicalEnvelope<unknown>,
  ): Promise<Grant | undefined> {
    const consentRequest: ConsentRequest = {
      origin: envelope.origin,
      providerId: envelope.providerId,
      modelId: envelope.modelId,
      capabilities: [envelope.capability],
    };

    const consentDecision = await this.#consentController.requestConsent(consentRequest);
    if (!consentDecision.granted || consentDecision.grantType === undefined) {
      return undefined;
    }

    return this.#grantStore.grantPermission({
      origin: consentDecision.origin,
      providerId: consentDecision.providerId,
      modelId: consentDecision.modelId,
      capabilities: consentDecision.capabilities,
      grantType: consentDecision.grantType,
    });
  }

  #registerInFlight(
    requestId: string,
    grantId: string,
    mode: "request" | "stream",
  ): InFlightOperation {
    const operation: InFlightOperation = {
      requestId,
      grantId,
      mode,
      revoked: false,
      revokeReason: undefined,
    };
    this.#inFlightByRequestId.set(requestId, operation);

    const requestIds = this.#requestIdsByGrantId.get(grantId) ?? new Set<string>();
    requestIds.add(requestId);
    this.#requestIdsByGrantId.set(grantId, requestIds);
    return operation;
  }

  #finalizeInFlight(requestId: string): void {
    const operation = this.#inFlightByRequestId.get(requestId);
    if (operation === undefined) {
      return;
    }

    this.#inFlightByRequestId.delete(requestId);
    const grantRequests = this.#requestIdsByGrantId.get(operation.grantId);
    if (grantRequests === undefined) {
      return;
    }

    grantRequests.delete(requestId);
    if (grantRequests.size === 0) {
      this.#requestIdsByGrantId.delete(operation.grantId);
    }
  }

  #markGrantRevoked(grantId: string, reason: GrantRevocationReason): void {
    const requestIds = this.#requestIdsByGrantId.get(grantId);
    if (requestIds === undefined) {
      return;
    }

    for (const requestId of requestIds) {
      const operation = this.#inFlightByRequestId.get(requestId);
      if (operation === undefined) {
        continue;
      }

      operation.revoked = true;
      operation.revokeReason = reason;
    }
  }

  #throwIfOperationRevoked(operation: InFlightOperation): void {
    if (!operation.revoked) {
      return;
    }

    throw this.#createRevokedInFlightError(undefined, operation);
  }

  #createRevokedInFlightError(
    envelope: CanonicalEnvelope<unknown> | undefined,
    operation: InFlightOperation,
  ): PermissionError {
    return createPermissionDeniedError(
      "Grant was revoked while request execution was in-flight.",
      {
        ...(envelope !== undefined ? { requestId: envelope.requestId } : {}),
        ...(envelope !== undefined ? { origin: envelope.origin } : {}),
        ...(envelope !== undefined ? { providerId: envelope.providerId } : {}),
        ...(envelope !== undefined ? { modelId: envelope.modelId } : {}),
        ...(envelope !== undefined ? { capability: envelope.capability } : {}),
        grantId: operation.grantId,
        mode: operation.mode,
        revokeReason: operation.revokeReason ?? "user",
      },
    );
  }

  async #safelySynchronizeGrant(event: BridgeGrantSynchronizationEvent): Promise<void> {
    if (this.#grantSynchronizer === undefined) {
      return;
    }

    try {
      await this.#grantSynchronizer.publishGrant(event);
    } catch (error) {
      const causeError = error instanceof Error ? error : undefined;
      this.#reportError(
        new Error(
          `Failed to synchronize grant "${event.grantId}" to bridge.`,
          causeError !== undefined ? { cause: causeError } : undefined,
        ),
      );
    }
  }

  async #safelySynchronizeRevocation(event: BridgeGrantRevocationEvent): Promise<void> {
    if (this.#grantSynchronizer === undefined) {
      return;
    }

    try {
      await this.#grantSynchronizer.revokeGrant(event);
    } catch (error) {
      const causeError = error instanceof Error ? error : undefined;
      this.#reportError(
        new Error(
          `Failed to synchronize revocation for grant "${event.grantId}" to bridge.`,
          causeError !== undefined ? { cause: causeError } : undefined,
        ),
      );
    }
  }
}
