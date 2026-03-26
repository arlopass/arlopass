import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";

import {
  ConnectionRegistry,
  ConnectionRegistryError,
  type ConnectionBindingContext,
  type ConnectionRecord,
} from "./connection-registry.js";
import {
  DEFAULT_DISCOVERY_HOT_TTL_MS,
  DEFAULT_DISCOVERY_NEGATIVE_TTL_MS,
  DiscoveryCache,
  type DiscoveryCacheDiagnostics,
  type DiscoveryCacheState,
  type DiscoveryCacheStatus,
} from "./discovery-cache.js";
import {
  DEFAULT_DISCOVERY_REFRESH_INTERVAL_MS,
  DiscoveryRefreshScheduler,
  type DiscoveryRefreshSchedulerDiagnostics,
  type DiscoveryRefreshSchedulerOptions,
} from "./discovery-refresh-scheduler.js";

export type CloudDiscoveryResult = Readonly<{
  models: readonly Readonly<Record<string, unknown>>[];
  capabilities: readonly string[];
}>;

export type CloudConnectionCompleteResult = Readonly<{
  credentialRef: string;
  endpointProfile?: Readonly<Record<string, unknown>>;
  endpointProfileHash?: string;
  models?: readonly Readonly<Record<string, unknown>>[];
  capabilities?: readonly string[];
  [key: string]: unknown;
}>;

export type CloudConnectionValidateResult = Readonly<Record<string, unknown>>;

export type CloudControlPlaneAdapter = Readonly<{
  beginConnection(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
  completeConnection(input: Readonly<Record<string, unknown>>): Promise<CloudConnectionCompleteResult>;
  validateConnection(input: Readonly<Record<string, unknown>>): Promise<CloudConnectionValidateResult>;
  revokeConnection(input: Readonly<Record<string, unknown>>): Promise<void>;
  discover(input: Readonly<Record<string, unknown>>): Promise<CloudDiscoveryResult>;
  executeChat(
    input: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<{ content: string }>>;
}>;

export type DiscoverRequest = Readonly<{
  providerId: string;
  methodId?: string;
  endpointOverride?: string;
  refresh?: boolean;
  connectionHandle?: string;
  extensionId?: string;
  origin?: string;
  policyVersion?: string;
  endpointProfileHash?: string;
  endpointProfile?: Readonly<Record<string, unknown>>;
}>;

export type DiscoverResponse = Readonly<{
  providerId: string;
  models: readonly Readonly<Record<string, unknown>>[];
  capabilities: readonly string[];
  cacheStatus: DiscoveryCacheStatus;
}>;

export type ConnectionCompleteRequest = Readonly<{
  providerId: string;
  methodId: string;
  extensionId: string;
  origin: string;
  policyVersion: string;
  endpointProfileHash?: string;
  [key: string]: unknown;
}>;

export type ConnectionCompleteResponse = Readonly<{
  providerId: string;
  methodId: string;
  credentialRef: string;
  connectionHandle: string;
  endpointProfileHash: string;
  [key: string]: unknown;
}>;

export type ConnectionValidateRequest = Readonly<{
  providerId: string;
  methodId: string;
  connectionHandle?: string;
  extensionId?: string;
  origin?: string;
  policyVersion?: string;
  endpointProfileHash?: string;
  [key: string]: unknown;
}>;

export type ConnectionValidateResponse = Readonly<{
  providerId: string;
  methodId: string;
  valid: boolean;
  [key: string]: unknown;
}>;

export type ConnectionBindingResolveRequest = Readonly<{
  providerId: string;
  methodId: string;
  connectionHandle: string;
  extensionId: string;
  origin: string;
  policyVersion?: string;
  endpointProfileHash?: string;
}>;

export type ConnectionBindingResolveResponse = Readonly<{
  providerId: string;
  methodId: string;
  connectionHandle: string;
  extensionId: string;
  origin: string;
  policyVersion: string;
  endpointProfileHash: string;
  epoch: number;
}>;

export type ConnectionRevokeRequest = Readonly<{
  providerId: string;
  methodId: string;
  connectionHandle?: string;
  [key: string]: unknown;
}>;

export type ConnectionRevokeResponse = Readonly<{
  providerId: string;
  methodId: string;
  revoked: boolean;
}>;

type AllowedDiscoveryEgressRule = Readonly<{
  host: string;
  protocol: string;
  port?: number;
}>;

type AllowedDiscoveryEgress = Readonly<
  Record<string, Readonly<Record<string, readonly AllowedDiscoveryEgressRule[]>>>
>;

type CloudConnectionPersistencePhase = "load" | "persist";

type CloudConnectionPersistenceLoadStatus = "not-configured" | "ok" | "failed";

type CloudConnectionPersistencePersistStatus = "not-configured" | "idle" | "ok" | "failed";

export type CloudConnectionPersistenceFailure = Readonly<{
  phase: CloudConnectionPersistencePhase;
  stateFilePath: string;
  message: string;
  code?: string;
  occurredAt: string;
}>;

export type CloudConnectionPersistenceDiagnostics = Readonly<{
  enabled: boolean;
  loadStatus: CloudConnectionPersistenceLoadStatus;
  persistStatus: CloudConnectionPersistencePersistStatus;
  failureCount: number;
  lastFailure?: CloudConnectionPersistenceFailure;
}>;

export type CloudConnectionDiscoveryDiagnostics = Readonly<{
  cache: DiscoveryCacheDiagnostics;
  scheduler: DiscoveryRefreshSchedulerDiagnostics;
}>;

export type CloudConnectionServiceOptions = Readonly<{
  adaptersByProvider: Readonly<Record<string, CloudControlPlaneAdapter>>;
  connectionRegistry: ConnectionRegistry;
  scheduler?: DiscoveryRefreshScheduler;
  schedulerOptions?: Omit<DiscoveryRefreshSchedulerOptions, "onRefresh">;
  hotTtlMs?: number;
  negativeTtlMs?: number;
  refreshIntervalMs?: number;
  allowedDiscoveryEgress?: AllowedDiscoveryEgress;
  now?: () => Date;
  stateFilePath?: string;
  onPersistenceFailure?: (failure: CloudConnectionPersistenceFailure) => void;
}>;

export type CloudConnectionServiceContract = Readonly<{
  beginConnection(
    request: Readonly<{
      providerId: string;
      methodId: string;
      [key: string]: unknown;
    }>,
  ): Promise<Readonly<Record<string, unknown>>>;
  completeConnection(request: ConnectionCompleteRequest): Promise<ConnectionCompleteResponse>;
  validateConnection(request: ConnectionValidateRequest): Promise<ConnectionValidateResponse>;
  resolveConnectionBinding(
    request: ConnectionBindingResolveRequest,
  ): Promise<ConnectionBindingResolveResponse>;
  revokeConnection(request: ConnectionRevokeRequest): Promise<ConnectionRevokeResponse>;
  discoverModels(
    request: DiscoverRequest,
  ): Promise<Readonly<{
    providerId: string;
    models: readonly Readonly<Record<string, unknown>>[];
    cacheStatus: DiscoveryCacheStatus;
  }>>;
  discoverCapabilities(
    request: DiscoverRequest,
  ): Promise<Readonly<{
    providerId: string;
    capabilities: readonly string[];
    cacheStatus: DiscoveryCacheStatus;
  }>>;
  refreshDiscovery(request: Omit<DiscoverRequest, "refresh">): Promise<DiscoverResponse>;
}>;

type ProviderDiscoverySnapshot = Readonly<{
  providerId: string;
  models: readonly Readonly<Record<string, unknown>>[];
  capabilities: readonly string[];
}>;

type ConnectionEpochRecord = Readonly<{
  providerId: string;
  methodId: string;
  epoch: number;
  credentialRef: string;
  extensionId: string;
  origin: string;
  policyVersion: string;
  endpointProfileHash: string;
  connectionInput?: Readonly<Record<string, unknown>>;
}>;

type PersistedConnectionEpochRecord = Readonly<{
  connectionHandle: string;
  providerId: string;
  methodId: string;
  epoch: number;
  credentialRef?: string;
  extensionId: string;
  origin: string;
  policyVersion: string;
  endpointProfileHash: string;
  connectionInput?: Readonly<Record<string, unknown>>;
}>;

type PersistedCloudConnectionServiceState = Readonly<{
  version: 1;
  connectionEpochRecords: readonly PersistedConnectionEpochRecord[];
}>;

export class CloudConnectionServiceError extends Error {
  readonly reasonCode:
    | "request.invalid"
    | "policy.denied"
    | "provider.unavailable"
    | "auth.invalid"
    | "auth.expired";

  constructor(
    message: string,
    reasonCode:
      | "request.invalid"
      | "policy.denied"
      | "provider.unavailable"
      | "auth.invalid"
      | "auth.expired" = "request.invalid",
  ) {
    super(message);
    this.name = "CloudConnectionServiceError";
    this.reasonCode = reasonCode;
  }
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new CloudConnectionServiceError(
      `Cloud connection service requires non-empty "${field}".`,
      "request.invalid",
    );
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new CloudConnectionServiceError(
      `Cloud connection service requires non-empty "${field}".`,
      "request.invalid",
    );
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPersistedConnectionEpochRecord(
  value: unknown,
): value is PersistedConnectionEpochRecord {
  if (!isRecord(value)) {
    return false;
  }
  const connectionInput = value["connectionInput"];
  return (
    typeof value["connectionHandle"] === "string" &&
    value["connectionHandle"].trim().length > 0 &&
    typeof value["providerId"] === "string" &&
    value["providerId"].trim().length > 0 &&
    typeof value["methodId"] === "string" &&
    value["methodId"].trim().length > 0 &&
    typeof value["extensionId"] === "string" &&
    value["extensionId"].trim().length > 0 &&
    typeof value["origin"] === "string" &&
    value["origin"].trim().length > 0 &&
    typeof value["policyVersion"] === "string" &&
    value["policyVersion"].trim().length > 0 &&
    typeof value["endpointProfileHash"] === "string" &&
    value["endpointProfileHash"].trim().length > 0 &&
    isFiniteNumber(value["epoch"]) &&
    Number.isInteger(value["epoch"]) &&
    value["epoch"] >= 0 &&
    (connectionInput === undefined || isRecord(connectionInput))
  );
}

function parsePersistedCredentialRef(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function parsePersistedConnectionInput(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return Object.freeze({ ...value });
}

function normalizeDiscoveryResult(
  providerId: string,
  result: CloudDiscoveryResult,
): ProviderDiscoverySnapshot {
  const models = Array.isArray(result.models) ? result.models : [];
  const capabilities = Array.isArray(result.capabilities)
    ? result.capabilities.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    )
    : [];
  return {
    providerId,
    models,
    capabilities,
  };
}

function toBindingContext(
  input: Readonly<{
    extensionId?: string;
    origin?: string;
    policyVersion?: string;
    endpointProfileHash?: string;
  }>,
): ConnectionBindingContext {
  return {
    extensionId: requireNonEmpty(input.extensionId ?? "", "extensionId"),
    origin: requireNonEmpty(input.origin ?? "", "origin"),
    policyVersion: requireNonEmpty(input.policyVersion ?? "", "policyVersion"),
    endpointProfileHash: requireNonEmpty(
      input.endpointProfileHash ?? "",
      "endpointProfileHash",
    ),
  };
}

function canonicalizeJsonValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return "null";
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeJsonValue(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
    const fields = keys
      .filter((key) => {
        const candidate = record[key];
        return (
          candidate !== undefined &&
          typeof candidate !== "function" &&
          typeof candidate !== "symbol"
        );
      })
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJsonValue(record[key])}`);
    return `{${fields.join(",")}}`;
  }
  return "null";
}

function computeEndpointProfileHash(profile: Readonly<Record<string, unknown>>): string {
  const canonical = canonicalizeJsonValue(profile);
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function parseEndpointHost(endpointOverride: string): string {
  let url: URL;
  try {
    url = new URL(endpointOverride);
  } catch {
    throw new CloudConnectionServiceError(
      "Discovery endpoint override must be a valid absolute URL.",
      "request.invalid",
    );
  }
  return url.hostname;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (isRecord(error) && typeof error["message"] === "string" && error["message"].trim().length > 0) {
    return error["message"];
  }
  return fallback;
}

function getErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }
  return typeof error["code"] === "string" ? error["code"] : undefined;
}

export class CloudConnectionService {
  readonly #adaptersByProvider: Readonly<Record<string, CloudControlPlaneAdapter>>;
  readonly #connectionRegistry: ConnectionRegistry;
  readonly #connectionEpochByHandle = new Map<string, ConnectionEpochRecord>();
  readonly #stateFilePath: string | undefined;
  readonly #onPersistenceFailure:
    | ((failure: CloudConnectionPersistenceFailure) => void)
    | undefined;
  readonly #discoveryCache: DiscoveryCache<ProviderDiscoverySnapshot>;
  readonly #scheduler: DiscoveryRefreshScheduler;
  readonly #allowedDiscoveryEgress: AllowedDiscoveryEgress;
  readonly #refreshIntervalMs: number;

  #persistenceLoadStatus: CloudConnectionPersistenceLoadStatus;
  #persistencePersistStatus: CloudConnectionPersistencePersistStatus;
  #persistenceFailureCount = 0;
  #lastPersistenceFailure: CloudConnectionPersistenceFailure | undefined;
  #persistWriteCounter = 0;
  #policyVersion: string | undefined;

  constructor(options: CloudConnectionServiceOptions) {
    this.#adaptersByProvider = options.adaptersByProvider;
    this.#connectionRegistry = options.connectionRegistry;
    this.#onPersistenceFailure = options.onPersistenceFailure;
    this.#stateFilePath =
      typeof options.stateFilePath === "string" &&
        options.stateFilePath.trim().length > 0
        ? options.stateFilePath.trim()
        : undefined;
    this.#persistenceLoadStatus = this.#stateFilePath === undefined ? "not-configured" : "ok";
    this.#persistencePersistStatus = this.#stateFilePath === undefined ? "not-configured" : "idle";
    const discoveryCacheOptions: Readonly<{
      hotTtlMs: number;
      negativeTtlMs: number;
      now?: () => Date;
    }> = {
      hotTtlMs: options.hotTtlMs ?? DEFAULT_DISCOVERY_HOT_TTL_MS,
      negativeTtlMs: options.negativeTtlMs ?? DEFAULT_DISCOVERY_NEGATIVE_TTL_MS,
      ...(options.now !== undefined ? { now: options.now } : {}),
    };
    this.#discoveryCache = new DiscoveryCache<ProviderDiscoverySnapshot>(
      discoveryCacheOptions,
    );
    this.#allowedDiscoveryEgress = options.allowedDiscoveryEgress ?? {};
    this.#refreshIntervalMs = Math.floor(
      options.refreshIntervalMs ?? DEFAULT_DISCOVERY_REFRESH_INTERVAL_MS,
    );
    this.#scheduler =
      options.scheduler ??
      new DiscoveryRefreshScheduler({
        ...(options.schedulerOptions ?? {}),
        onRefresh: async (providerId) => {
          await this.discover({ providerId, refresh: true });
        },
      });
    const loadStatus = this.#loadStateFromDisk();
    if (loadStatus !== "failed") {
      this.#persistState();
    }
  }

  get scheduler(): DiscoveryRefreshScheduler {
    return this.#scheduler;
  }

  getPersistenceDiagnostics(): CloudConnectionPersistenceDiagnostics {
    return {
      enabled: this.#stateFilePath !== undefined,
      loadStatus: this.#persistenceLoadStatus,
      persistStatus: this.#persistencePersistStatus,
      failureCount: this.#persistenceFailureCount,
      ...(this.#lastPersistenceFailure !== undefined
        ? { lastFailure: this.#lastPersistenceFailure }
        : {}),
    };
  }

  getDiscoveryDiagnostics(): CloudConnectionDiscoveryDiagnostics {
    return {
      cache: this.#discoveryCache.getDiagnostics(),
      scheduler: this.#scheduler.getDiagnostics(),
    };
  }

  startBackgroundRefresh(options: Readonly<{ intervalMs?: number }> = {}): void {
    this.#scheduler.start({
      intervalMs: options.intervalMs ?? this.#refreshIntervalMs,
    });
  }

  stopBackgroundRefresh(): void {
    this.#scheduler.stop();
  }

  async beginConnection(
    request: Readonly<{
      providerId: string;
      methodId: string;
      [key: string]: unknown;
    }>,
  ): Promise<Readonly<Record<string, unknown>>> {
    const providerId = requireNonEmpty(request.providerId, "providerId");
    requireNonEmpty(request.methodId, "methodId");
    const adapter = this.#resolveAdapter(providerId);
    return adapter.beginConnection(request);
  }

  async completeConnection(request: ConnectionCompleteRequest): Promise<ConnectionCompleteResponse> {
    const providerId = requireNonEmpty(request.providerId, "providerId");
    const methodId = requireNonEmpty(request.methodId, "methodId");
    const adapter = this.#resolveAdapter(providerId);
    const completeResult = await adapter.completeConnection(request);
    const credentialRef = requireNonEmpty(completeResult.credentialRef, "credentialRef");

    const endpointProfileHash = this.#resolveEndpointProfileHash(completeResult, request);
    const bindingContext = toBindingContext({
      extensionId: request.extensionId,
      origin: request.origin,
      policyVersion: request.policyVersion,
      endpointProfileHash,
    });
    const connectionRecord = await this.#connectionRegistry.register({
      providerId,
      methodId,
      credentialRef,
      ...bindingContext,
    });
    this.#connectionEpochByHandle.set(connectionRecord.connectionHandle, {
      providerId,
      methodId,
      epoch: connectionRecord.epoch,
      credentialRef,
      extensionId: bindingContext.extensionId,
      origin: bindingContext.origin,
      policyVersion: bindingContext.policyVersion,
      endpointProfileHash: bindingContext.endpointProfileHash,
      ...(isRecord(request.input)
        ? { connectionInput: Object.freeze({ ...request.input }) }
        : {}),
    });
    this.#persistState();

    await this.onConnectionCompleted({ providerId });

    return {
      ...completeResult,
      providerId,
      methodId,
      credentialRef,
      endpointProfileHash,
      connectionHandle: connectionRecord.connectionHandle,
    };
  }

  async resolveConnectionBinding(
    request: ConnectionBindingResolveRequest,
  ): Promise<ConnectionBindingResolveResponse> {
    const providerId = requireNonEmpty(request.providerId, "providerId");
    const methodId = requireNonEmpty(request.methodId, "methodId");
    const connectionHandle = requireNonEmpty(request.connectionHandle, "connectionHandle");
    const epochRecord = this.#connectionEpochByHandle.get(connectionHandle);
    if (epochRecord === undefined) {
      throw new CloudConnectionServiceError(
        "Connection handle is unknown or revoked.",
        "auth.expired",
      );
    }
    if (epochRecord.providerId !== providerId || epochRecord.methodId !== methodId) {
      throw new CloudConnectionServiceError(
        "Connection handle provider/method binding mismatch.",
        "auth.invalid",
      );
    }

    const extensionId = requireNonEmpty(request.extensionId, "extensionId");
    const origin = requireNonEmpty(request.origin, "origin");
    const policyVersion =
      typeof request.policyVersion === "string" && request.policyVersion.trim().length > 0
        ? request.policyVersion
        : epochRecord.policyVersion;
    const endpointProfileHash =
      typeof request.endpointProfileHash === "string" &&
        request.endpointProfileHash.trim().length > 0
        ? request.endpointProfileHash
        : epochRecord.endpointProfileHash;

    const bindingContext = toBindingContext({
      extensionId,
      origin,
      policyVersion,
      endpointProfileHash,
    });
    const resolvedBindingRecord = await this.#resolveConnectionRegistryRecord(
      connectionHandle,
      bindingContext,
    );

    return {
      providerId,
      methodId,
      connectionHandle,
      extensionId,
      origin,
      policyVersion: resolvedBindingRecord.policyVersion,
      endpointProfileHash: resolvedBindingRecord.endpointProfileHash,
      epoch: epochRecord.epoch,
    };
  }

  async validateConnection(request: ConnectionValidateRequest): Promise<ConnectionValidateResponse> {
    const providerId = requireNonEmpty(request.providerId, "providerId");
    const methodId = requireNonEmpty(request.methodId, "methodId");
    const adapter = this.#resolveAdapter(providerId);
    let resolvedBinding: ConnectionBindingResolveResponse | undefined;

    if (typeof request.connectionHandle === "string") {
      resolvedBinding = await this.resolveConnectionBinding({
        providerId,
        methodId,
        connectionHandle: request.connectionHandle,
        extensionId: requireNonEmpty(request.extensionId ?? "", "extensionId"),
        origin: requireNonEmpty(request.origin ?? "", "origin"),
        ...(typeof request.policyVersion === "string"
          ? { policyVersion: request.policyVersion }
          : {}),
        ...(typeof request.endpointProfileHash === "string"
          ? { endpointProfileHash: request.endpointProfileHash }
          : {}),
      });
    }

    const adapterRequest: Record<string, unknown> = { ...request };
    if (
      typeof request.connectionHandle === "string" &&
      request.connectionHandle.trim().length > 0
    ) {
      const epochRecord = this.#connectionEpochByHandle.get(request.connectionHandle);
      if (epochRecord !== undefined) {
        adapterRequest["credentialRef"] = epochRecord.credentialRef;
      }
    }

    const result = await adapter.validateConnection(adapterRequest);
    return {
      ...result,
      providerId,
      methodId,
      valid: result.ok === true,
      ...(resolvedBinding !== undefined
        ? {
          policyVersion: resolvedBinding.policyVersion,
          endpointProfileHash: resolvedBinding.endpointProfileHash,
        }
        : {}),
    };
  }

  async revokeConnection(request: ConnectionRevokeRequest): Promise<ConnectionRevokeResponse> {
    const providerId = requireNonEmpty(request.providerId, "providerId");
    const methodId = requireNonEmpty(request.methodId, "methodId");
    const adapter = this.#resolveAdapter(providerId);
    await adapter.revokeConnection(request);
    if (typeof request.connectionHandle === "string" && request.connectionHandle.trim().length > 0) {
      await this.#connectionRegistry.revoke(request.connectionHandle);
      this.#connectionEpochByHandle.delete(request.connectionHandle);
      this.#persistState();
    }
    await this.onCredentialRevoked({ providerId });
    return {
      providerId,
      methodId,
      revoked: true,
    };
  }

  async discover(request: DiscoverRequest): Promise<DiscoverResponse> {
    const providerId = requireNonEmpty(request.providerId, "providerId");
    const adapter = this.#resolveAdapter(providerId);
    const adapterRequest: Record<string, unknown> = { ...request, providerId };
    if (
      typeof request.connectionHandle === "string" &&
      request.connectionHandle.trim().length > 0
    ) {
      const connectionHandle = requireNonEmpty(request.connectionHandle, "connectionHandle");
      const epochRecord = this.#connectionEpochByHandle.get(connectionHandle);
      if (epochRecord === undefined) {
        throw new CloudConnectionServiceError(
          "Connection handle is unknown or revoked.",
          "auth.expired",
        );
      }
      if (epochRecord.providerId !== providerId) {
        throw new CloudConnectionServiceError(
          "Connection handle provider/method binding mismatch.",
          "auth.invalid",
        );
      }
      const requestedMethodId =
        typeof request.methodId === "string" && request.methodId.trim().length > 0
          ? request.methodId
          : undefined;
      if (requestedMethodId !== undefined && requestedMethodId !== epochRecord.methodId) {
        throw new CloudConnectionServiceError(
          "Connection handle provider/method binding mismatch.",
          "auth.invalid",
        );
      }
      const bindingContext = toBindingContext({
        extensionId:
          typeof request.extensionId === "string" && request.extensionId.trim().length > 0
            ? request.extensionId
            : epochRecord.extensionId,
        origin:
          typeof request.origin === "string" && request.origin.trim().length > 0
            ? request.origin
            : epochRecord.origin,
        policyVersion:
          typeof request.policyVersion === "string" &&
            request.policyVersion.trim().length > 0
            ? request.policyVersion
            : epochRecord.policyVersion,
        endpointProfileHash:
          typeof request.endpointProfileHash === "string" &&
            request.endpointProfileHash.trim().length > 0
            ? request.endpointProfileHash
            : epochRecord.endpointProfileHash,
      });
      await this.#resolveConnectionRegistryRecord(connectionHandle, bindingContext);

      adapterRequest["methodId"] = epochRecord.methodId;
      adapterRequest["connectionHandle"] = connectionHandle;
      adapterRequest["credentialRef"] = epochRecord.credentialRef;
      if (request.endpointProfile !== undefined && isRecord(request.endpointProfile)) {
        adapterRequest["endpointProfile"] = Object.freeze({ ...request.endpointProfile });
      }
      if (epochRecord.connectionInput !== undefined) {
        adapterRequest["connectionInput"] = epochRecord.connectionInput;
      }
    }
    const forceRefresh = request.refresh === true;
    const cacheRead = this.#discoveryCache.read(providerId);
    const shouldUseCache =
      !forceRefresh &&
      cacheRead.cacheStatus === "hot" &&
      !cacheRead.isNegative &&
      cacheRead.value !== undefined;

    if (shouldUseCache) {
      return {
        providerId,
        models: cacheRead.value.models,
        capabilities: cacheRead.value.capabilities,
        cacheStatus: "hot",
      };
    }

    if (request.endpointOverride !== undefined) {
      this.#assertDiscoveryEndpointOverrideAllowed(
        providerId,
        request.methodId,
        request.endpointOverride,
      );
    }

    try {
      const discoveryResult = await adapter.discover(adapterRequest);
      const snapshot = normalizeDiscoveryResult(providerId, discoveryResult);
      const cacheWrite = this.#discoveryCache.storeSuccess(providerId, snapshot);
      this.#scheduler.registerProvider(providerId);
      return {
        providerId,
        models: snapshot.models,
        capabilities: snapshot.capabilities,
        cacheStatus: forceRefresh ? "refreshed" : cacheWrite.cacheStatus,
      };
    } catch (error) {
      const reasonCode =
        this.#extractReasonCode(error) ??
        (error instanceof CloudConnectionServiceError ? error.reasonCode : "provider.unavailable");
      this.#discoveryCache.storeNegative(providerId, reasonCode);
      throw error;
    }
  }

  async discoverModels(request: DiscoverRequest): Promise<Readonly<{
    providerId: string;
    models: readonly Readonly<Record<string, unknown>>[];
    cacheStatus: DiscoveryCacheStatus;
  }>> {
    const result = await this.discover(request);
    return {
      providerId: result.providerId,
      models: result.models,
      cacheStatus: result.cacheStatus,
    };
  }

  async discoverCapabilities(
    request: DiscoverRequest,
  ): Promise<Readonly<{
    providerId: string;
    capabilities: readonly string[];
    cacheStatus: DiscoveryCacheStatus;
  }>> {
    const result = await this.discover(request);
    return {
      providerId: result.providerId,
      capabilities: result.capabilities,
      cacheStatus: result.cacheStatus,
    };
  }

  async refreshDiscovery(request: Omit<DiscoverRequest, "refresh">): Promise<DiscoverResponse> {
    return this.discover({ ...request, refresh: true });
  }

  async getCredentialEpoch(
    input: Readonly<{
      providerId: string;
      methodId: string;
      connectionHandle: string;
      region: string;
      extensionId: string;
      origin: string;
      policyVersion: string;
      endpointProfileHash: string;
    }>,
  ): Promise<number> {
    const providerId = requireNonEmpty(input.providerId, "providerId");
    const methodId = requireNonEmpty(input.methodId, "methodId");
    const connectionHandle = requireNonEmpty(
      input.connectionHandle,
      "connectionHandle",
    );
    const record = this.#connectionEpochByHandle.get(connectionHandle);
    if (record === undefined) {
      throw new CloudConnectionServiceError(
        "Connection handle is unknown or revoked.",
        "auth.expired",
      );
    }
    if (record.providerId !== providerId || record.methodId !== methodId) {
      throw new CloudConnectionServiceError(
        "Connection handle provider/method binding mismatch.",
        "auth.invalid",
      );
    }
    const bindingContext = toBindingContext({
      extensionId: input.extensionId,
      origin: input.origin,
      policyVersion: input.policyVersion,
      endpointProfileHash: input.endpointProfileHash,
    });
    await this.#resolveConnectionRegistryRecord(connectionHandle, bindingContext);
    return record.epoch;
  }

  async executeChat(
    input: Readonly<{
      providerId: string;
      methodId: string;
      modelId: string;
      connectionHandle: string;
      messages: readonly Readonly<{ role: "system" | "user" | "assistant"; content: string }>[];
      correlationId?: string;
      timeoutMs?: number;
      signal?: AbortSignal;
      extensionId: string;
      origin: string;
      policyVersion: string;
      endpointProfileHash: string;
      onChunk?: (chunk: string) => void;
    }>,
  ): Promise<Readonly<{ content: string }>> {
    const providerId = requireNonEmpty(input.providerId, "providerId");
    const methodId = requireNonEmpty(input.methodId, "methodId");
    const modelId = requireNonEmpty(input.modelId, "modelId");
    const connectionHandle = requireNonEmpty(
      input.connectionHandle,
      "connectionHandle",
    );
    const epochRecord = this.#connectionEpochByHandle.get(connectionHandle);
    if (epochRecord === undefined) {
      throw new CloudConnectionServiceError(
        "Connection handle is unknown or revoked.",
        "auth.expired",
      );
    }
    if (epochRecord.providerId !== providerId || epochRecord.methodId !== methodId) {
      throw new CloudConnectionServiceError(
        "Connection handle provider/method binding mismatch.",
        "auth.invalid",
      );
    }
    const bindingContext = toBindingContext({
      extensionId: input.extensionId,
      origin: input.origin,
      policyVersion: input.policyVersion,
      endpointProfileHash: input.endpointProfileHash,
    });
    await this.#resolveConnectionRegistryRecord(connectionHandle, bindingContext);
    if (!Array.isArray(input.messages) || input.messages.length === 0) {
      throw new CloudConnectionServiceError(
        "Cloud chat execution requires a non-empty messages array.",
        "request.invalid",
      );
    }
    const adapter = this.#resolveAdapter(providerId);
    const executionResult = await adapter.executeChat({
      providerId,
      methodId,
      modelId,
      connectionHandle,
      credentialRef: epochRecord.credentialRef,
      messages: input.messages,
      correlationId:
        typeof input.correlationId === "string" && input.correlationId.trim().length > 0
          ? input.correlationId
          : `bridge.chat.${providerId}.${methodId}.${Date.now().toString(36)}`,
      ...(typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs)
        ? { timeoutMs: Math.max(1, Math.floor(input.timeoutMs)) }
        : {}),
      ...(input.signal instanceof AbortSignal ? { signal: input.signal } : {}),
      extensionId: input.extensionId,
      origin: input.origin,
      policyVersion: input.policyVersion,
      endpointProfileHash: input.endpointProfileHash,
      ...(epochRecord.connectionInput !== undefined
        ? { connectionInput: epochRecord.connectionInput }
        : {}),
      ...(typeof input.onChunk === "function" ? { onChunk: input.onChunk } : {}),
    });
    const content =
      typeof executionResult.content === "string"
        ? executionResult.content.trim()
        : "";
    if (content.length === 0) {
      throw new CloudConnectionServiceError(
        "Cloud adapter returned empty chat content.",
        "provider.unavailable",
      );
    }
    return { content };
  }

  async onCredentialRotated(input: Readonly<{ providerId: string }>): Promise<void> {
    this.#discoveryCache.markStale(input.providerId, {
      signal: "credential.rotate",
    });
  }

  async onCredentialRevoked(input: Readonly<{ providerId: string }>): Promise<void> {
    this.#discoveryCache.markStale(input.providerId, {
      signal: "credential.revoke",
    });
  }

  async onPolicyVersionChanged(policyVersion: string): Promise<void> {
    const normalizedPolicyVersion = requireNonEmpty(policyVersion, "policyVersion");
    if (this.#policyVersion !== normalizedPolicyVersion) {
      this.#policyVersion = normalizedPolicyVersion;
      this.#discoveryCache.markAllStale({
        signal: "policy.version.changed",
        detail: `policyVersion=${normalizedPolicyVersion}`,
      });
    }
  }

  async onProviderUnavailableThreshold(
    input: Readonly<{ providerId: string; failures: number }>,
  ): Promise<void> {
    const providerId = requireNonEmpty(input.providerId, "providerId");
    if (input.failures >= 3) {
      this.#discoveryCache.markStale(providerId, {
        signal: "provider.unavailable.threshold",
        detail: `failures=${String(input.failures)}`,
      });
    }
  }

  async onConnectionCompleted(input: Readonly<{ providerId: string }>): Promise<void> {
    const providerId = requireNonEmpty(input.providerId, "providerId");
    this.#scheduler.registerProvider(providerId);
    await this.#scheduler.triggerConnectionCompleted(providerId);
  }

  async onReconnected(input: Readonly<{ providerId: string }>): Promise<void> {
    const providerId = requireNonEmpty(input.providerId, "providerId");
    this.#scheduler.registerProvider(providerId);
    await this.#scheduler.triggerReconnected(providerId);
  }

  getDiscoveryCacheState(providerId: string): DiscoveryCacheState {
    return this.#discoveryCache.state(providerId);
  }

  #resolveAdapter(providerId: string): CloudControlPlaneAdapter {
    const adapter = this.#adaptersByProvider[providerId];
    if (adapter === undefined) {
      throw new CloudConnectionServiceError(
        `No cloud control-plane adapter configured for provider "${providerId}".`,
        "request.invalid",
      );
    }
    return adapter;
  }

  #resolveEndpointProfileHash(
    completeResult: CloudConnectionCompleteResult,
    request: ConnectionCompleteRequest,
  ): string {
    if (
      typeof completeResult.endpointProfileHash === "string" &&
      completeResult.endpointProfileHash.trim().length > 0
    ) {
      return completeResult.endpointProfileHash;
    }
    if (
      completeResult.endpointProfile !== undefined &&
      isRecord(completeResult.endpointProfile)
    ) {
      return computeEndpointProfileHash(completeResult.endpointProfile);
    }
    if (
      typeof request.endpointProfileHash === "string" &&
      request.endpointProfileHash.trim().length > 0
    ) {
      return request.endpointProfileHash;
    }
    throw new CloudConnectionServiceError(
      "Connection completion requires endpointProfileHash metadata.",
      "request.invalid",
    );
  }

  #assertDiscoveryEndpointOverrideAllowed(
    providerId: string,
    methodId: string | undefined,
    endpointOverride: string,
  ): void {
    const normalizedHost = parseEndpointHost(endpointOverride);
    const providerRules = this.#allowedDiscoveryEgress[providerId];
    const normalizedMethodId =
      typeof methodId === "string" && methodId.trim().length > 0 ? methodId : "*";
    const allowedRules = providerRules?.[normalizedMethodId] ?? providerRules?.["*"] ?? [];
    if (allowedRules.length === 0) {
      throw new CloudConnectionServiceError(
        `Discovery endpoint override "${normalizedHost}" denied (no egress allow-list for provider/method).`,
        "policy.denied",
      );
    }

    const allowed = allowedRules.some((rule) => {
      const hostMatches = rule.host === "*" || rule.host === normalizedHost;
      const protocolMatches = rule.protocol === "https";
      return hostMatches && protocolMatches;
    });
    if (!allowed) {
      throw new CloudConnectionServiceError(
        `Discovery endpoint override "${normalizedHost}" is not declared in allowed egress endpoints.`,
        "policy.denied",
      );
    }
  }

  #extractReasonCode(error: unknown): string | undefined {
    if (!isRecord(error)) {
      return undefined;
    }
    const reasonCode = error["reasonCode"];
    return typeof reasonCode === "string" ? reasonCode : undefined;
  }

  async #resolveConnectionRegistryRecord(
    connectionHandle: string,
    context: ConnectionBindingContext,
  ): Promise<ConnectionRecord> {
    try {
      return await this.#connectionRegistry.resolve(connectionHandle, context);
    } catch (error) {
      if (error instanceof ConnectionRegistryError) {
        throw new CloudConnectionServiceError(error.message, error.reasonCode);
      }
      throw error;
    }
  }

  #loadStateFromDisk(): CloudConnectionPersistenceLoadStatus {
    if (this.#stateFilePath === undefined) {
      return this.#persistenceLoadStatus;
    }
    if (!existsSync(this.#stateFilePath)) {
      const recovered = this.#recoverPrimaryStateFileFromTemp();
      if (!recovered && !existsSync(this.#stateFilePath)) {
        this.#persistenceLoadStatus = "ok";
        return this.#persistenceLoadStatus;
      }
    }
    try {
      const raw = readFileSync(this.#stateFilePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!isRecord(parsed) || parsed["version"] !== 1) {
        this.#recordPersistenceFailure(
          "load",
          new Error("Persisted cloud connection state has an invalid format or version."),
        );
        return this.#persistenceLoadStatus;
      }
      const records = Array.isArray(parsed["connectionEpochRecords"])
        ? parsed["connectionEpochRecords"]
        : [];
      let invalidRecordFound = false;
      for (const entry of records) {
        if (!isPersistedConnectionEpochRecord(entry)) {
          invalidRecordFound = true;
          continue;
        }
        const credentialRef = parsePersistedCredentialRef(entry.credentialRef);
        if (credentialRef === undefined) {
          invalidRecordFound = true;
          continue;
        }
        const connectionInput =
          entry.connectionInput === undefined
            ? undefined
            : parsePersistedConnectionInput(entry.connectionInput);
        if (entry.connectionInput !== undefined && connectionInput === undefined) {
          invalidRecordFound = true;
          continue;
        }
        try {
          this.#connectionRegistry.hydrate({
            connectionHandle: entry.connectionHandle,
            providerId: entry.providerId,
            methodId: entry.methodId,
            epoch: entry.epoch,
            credentialRef,
            extensionId: entry.extensionId,
            origin: entry.origin,
            policyVersion: entry.policyVersion,
            endpointProfileHash: entry.endpointProfileHash,
          });
        } catch {
          invalidRecordFound = true;
          continue;
        }
        this.#connectionEpochByHandle.set(entry.connectionHandle, {
          providerId: entry.providerId,
          methodId: entry.methodId,
          epoch: entry.epoch,
          credentialRef,
          extensionId: entry.extensionId,
          origin: entry.origin,
          policyVersion: entry.policyVersion,
          endpointProfileHash: entry.endpointProfileHash,
          ...(connectionInput !== undefined ? { connectionInput } : {}),
        });
      }
      if (invalidRecordFound) {
        this.#recordPersistenceFailure(
          "load",
          new Error("Persisted cloud connection state contained invalid epoch records."),
        );
        return this.#persistenceLoadStatus;
      }
      this.#persistenceLoadStatus = "ok";
      return this.#persistenceLoadStatus;
    } catch (error) {
      this.#recordPersistenceFailure(
        "load",
        error,
        "Failed to read persisted cloud connection state from disk.",
      );
      return this.#persistenceLoadStatus;
    }
  }

  #persistState(): void {
    if (this.#stateFilePath === undefined) {
      return;
    }
    const state: PersistedCloudConnectionServiceState = {
      version: 1,
      connectionEpochRecords: [...this.#connectionEpochByHandle.entries()].map(
        ([connectionHandle, record]) => ({
          connectionHandle,
          providerId: record.providerId,
          methodId: record.methodId,
          epoch: record.epoch,
          credentialRef: record.credentialRef,
          extensionId: record.extensionId,
          origin: record.origin,
          policyVersion: record.policyVersion,
          endpointProfileHash: record.endpointProfileHash,
          ...(record.connectionInput !== undefined
            ? { connectionInput: record.connectionInput }
            : {}),
        }),
      ),
    };
    const directoryPath = dirname(this.#stateFilePath);
    const tempPath = this.#nextTempStatePath();
    let lockDescriptor: number | undefined;
    let tempWritten = false;
    try {
      mkdirSync(directoryPath, { recursive: true });
      lockDescriptor = this.#acquirePersistenceLock();
      writeFileSync(tempPath, JSON.stringify(state), { encoding: "utf8" });
      tempWritten = true;
      this.#fsyncFile(tempPath);
      renameSync(tempPath, this.#stateFilePath);
      tempWritten = false;
      this.#fsyncDirectory(directoryPath);
      this.#persistencePersistStatus = "ok";
    } catch (error) {
      this.#recordPersistenceFailure(
        "persist",
        error,
        "Failed to persist cloud connection state to disk.",
      );
    } finally {
      if (lockDescriptor !== undefined) {
        this.#releasePersistenceLock(lockDescriptor);
      }
      if (tempWritten) {
        try {
          unlinkSync(tempPath);
        } catch {
          // Best-effort temp cleanup on failed writes.
        }
      }
    }
  }

  #recoverPrimaryStateFileFromTemp(): boolean {
    if (this.#stateFilePath === undefined) {
      return false;
    }
    for (const candidatePath of this.#listTempStateCandidates()) {
      try {
        renameSync(candidatePath, this.#stateFilePath);
        return true;
      } catch (error) {
        this.#recordPersistenceFailure(
          "load",
          error,
          `Failed to recover cloud connection state from temp file "${candidatePath}".`,
        );
      }
    }
    return false;
  }

  #listTempStateCandidates(): readonly string[] {
    if (this.#stateFilePath === undefined) {
      return [];
    }
    const stateDirectory = dirname(this.#stateFilePath);
    const stateFileName = basename(this.#stateFilePath);
    const tempPrefix = `${stateFileName}.tmp`;
    try {
      return readdirSync(stateDirectory)
        .filter(
          (entry) =>
            entry === tempPrefix ||
            entry.startsWith(`${tempPrefix}.`),
        )
        .map((entry) => join(stateDirectory, entry))
        .sort((leftPath, rightPath) => this.#mtimeMs(rightPath) - this.#mtimeMs(leftPath));
    } catch {
      return [];
    }
  }

  #mtimeMs(path: string): number {
    try {
      return statSync(path).mtimeMs;
    } catch {
      return 0;
    }
  }

  #nextTempStatePath(): string {
    this.#persistWriteCounter += 1;
    return `${this.#stateFilePath}.tmp.${process.pid}.${Date.now().toString(36)}.${this.#persistWriteCounter.toString(36)}`;
  }

  #persistenceLockPath(): string {
    return `${this.#stateFilePath}.lock`;
  }

  #acquirePersistenceLock(): number {
    const lockPath = this.#persistenceLockPath();
    try {
      return openSync(lockPath, "wx");
    } catch (error) {
      if (getErrorCode(error) === "EEXIST") {
        throw new Error(`Cloud connection state lock is already held at "${lockPath}".`);
      }
      throw error;
    }
  }

  #releasePersistenceLock(lockDescriptor: number): void {
    const lockPath = this.#persistenceLockPath();
    try {
      closeSync(lockDescriptor);
    } finally {
      try {
        unlinkSync(lockPath);
      } catch {
        // Best-effort lock cleanup for process-crash resilience.
      }
    }
  }

  #fsyncFile(path: string): void {
    const fileDescriptor = openSync(path, "r+");
    try {
      fsyncSync(fileDescriptor);
    } finally {
      closeSync(fileDescriptor);
    }
  }

  #fsyncDirectory(path: string): void {
    try {
      const directoryDescriptor = openSync(path, "r");
      try {
        fsyncSync(directoryDescriptor);
      } finally {
        closeSync(directoryDescriptor);
      }
    } catch {
      // Directory fsync is best-effort and can be unsupported on some platforms.
    }
  }

  #recordPersistenceFailure(
    phase: CloudConnectionPersistencePhase,
    error: unknown,
    fallbackMessage?: string,
  ): void {
    if (this.#stateFilePath === undefined) {
      return;
    }
    const baseFailure = {
      phase,
      stateFilePath: this.#stateFilePath,
      message: getErrorMessage(
        error,
        fallbackMessage ?? "Cloud connection state persistence failed.",
      ),
      occurredAt: new Date().toISOString(),
    };
    const code = getErrorCode(error);
    const failure: CloudConnectionPersistenceFailure =
      code === undefined ? baseFailure : { ...baseFailure, code };
    this.#persistenceFailureCount += 1;
    this.#lastPersistenceFailure = failure;
    if (phase === "load") {
      this.#persistenceLoadStatus = "failed";
    } else {
      this.#persistencePersistStatus = "failed";
    }
    if (this.#onPersistenceFailure !== undefined) {
      try {
        this.#onPersistenceFailure(failure);
      } catch {
        // Persistence diagnostic hook failures must never break runtime flow.
      }
    }
  }
}
