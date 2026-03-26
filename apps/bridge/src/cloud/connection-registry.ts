import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type ConnectionBindingContext = Readonly<{
  extensionId: string;
  origin: string;
  policyVersion: string;
  endpointProfileHash: string;
}>;

export type ConnectionRegisterInput = Readonly<{
  providerId: string;
  methodId: string;
  credentialRef: string;
}> &
  ConnectionBindingContext;

export type ConnectionRecord = Readonly<{
  connectionHandle: string;
  credentialRef: string;
  providerId: string;
  methodId: string;
  epoch: number;
  extensionId: string;
  origin: string;
  policyVersion: string;
  endpointProfileHash: string;
  uuid: string;
  signature: string;
}>;

export type ConnectionHydrateInput = Readonly<{
  connectionHandle: string;
  credentialRef: string;
  providerId: string;
  methodId: string;
  epoch: number;
  extensionId: string;
  origin: string;
  policyVersion: string;
  endpointProfileHash: string;
}>;

type InternalConnectionRecord = ConnectionRecord &
  Readonly<{
    bindingKey: string;
  }>;

type BindingState = {
  currentEpoch: number;
  revokedHandles: Set<string>;
};

export type ConnectionRegistryOptions = Readonly<{
  signatureKey: Buffer;
  generateUuid?: () => string;
}>;

export class ConnectionRegistryError extends Error {
  readonly reasonCode: "auth.invalid" | "auth.expired";

  constructor(
    message: string,
    reasonCode: "auth.invalid" | "auth.expired" = "auth.invalid",
  ) {
    super(message);
    this.name = "ConnectionRegistryError";
    this.reasonCode = reasonCode;
  }
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new ConnectionRegistryError(
      `Connection registry requires non-empty "${field}".`,
      "auth.invalid",
    );
  }
  return normalized;
}

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isExtensionRuntimeOrigin(origin: string): boolean {
  return (
    origin.startsWith("chrome-extension://") ||
    origin.startsWith("moz-extension://") ||
    origin.startsWith("safari-web-extension://")
  );
}

export class ConnectionRegistry {
  readonly #signatureKey: Buffer;
  readonly #generateUuid: () => string;
  readonly #recordsByHandle = new Map<string, InternalConnectionRecord>();
  readonly #bindingStates = new Map<string, BindingState>();

  constructor(options: ConnectionRegistryOptions) {
    this.#signatureKey = options.signatureKey;
    this.#generateUuid = options.generateUuid ?? randomUUID;
  }

  async register(input: ConnectionRegisterInput): Promise<ConnectionRecord> {
    const providerId = requireNonEmpty(input.providerId, "providerId");
    const methodId = requireNonEmpty(input.methodId, "methodId");
    const credentialRef = requireNonEmpty(input.credentialRef, "credentialRef");
    const extensionId = requireNonEmpty(input.extensionId, "extensionId");
    const origin = requireNonEmpty(input.origin, "origin");
    const policyVersion = requireNonEmpty(input.policyVersion, "policyVersion");
    const endpointProfileHash = requireNonEmpty(
      input.endpointProfileHash,
      "endpointProfileHash",
    );

    const bindingKey = this.#bindingKey(providerId, methodId, credentialRef);
    const state = this.#bindingStates.get(bindingKey) ?? {
      currentEpoch: 0,
      revokedHandles: new Set<string>(),
    };
    this.#bindingStates.set(bindingKey, state);

    const uuid = this.#generateUuid();
    if (!CANONICAL_UUID_PATTERN.test(uuid)) {
      throw new ConnectionRegistryError(
        "Connection registry generated a non-canonical UUID.",
        "auth.invalid",
      );
    }

    const epoch = state.currentEpoch;
    const signature = this.#computeSignature({
      providerId,
      methodId,
      credentialRef,
      extensionId,
      origin,
      policyVersion,
      endpointProfileHash,
      uuid,
      epoch,
    });
    const connectionHandle = `connh.${providerId}.${methodId}.${uuid}.${epoch}.${signature}`;

    const record: InternalConnectionRecord = {
      connectionHandle,
      credentialRef,
      providerId,
      methodId,
      epoch,
      extensionId,
      origin,
      policyVersion,
      endpointProfileHash,
      uuid,
      signature,
      bindingKey,
    };

    this.#recordsByHandle.set(connectionHandle, record);
    return record;
  }

  hydrate(input: ConnectionHydrateInput): void {
    const connectionHandle = requireNonEmpty(input.connectionHandle, "connectionHandle");
    const credentialRef = requireNonEmpty(input.credentialRef, "credentialRef");
    const providerId = requireNonEmpty(input.providerId, "providerId");
    const methodId = requireNonEmpty(input.methodId, "methodId");
    const extensionId = requireNonEmpty(input.extensionId, "extensionId");
    const origin = requireNonEmpty(input.origin, "origin");
    const policyVersion = requireNonEmpty(input.policyVersion, "policyVersion");
    const endpointProfileHash = requireNonEmpty(
      input.endpointProfileHash,
      "endpointProfileHash",
    );
    if (!Number.isInteger(input.epoch) || input.epoch < 0) {
      throw new ConnectionRegistryError(
        'Connection registry requires non-negative integer "epoch".',
        "auth.invalid",
      );
    }
    const epoch = input.epoch;

    const handlePrefix = `connh.${providerId}.${methodId}.`;
    if (!connectionHandle.startsWith(handlePrefix)) {
      throw new ConnectionRegistryError(
        "Connection handle provider/method prefix mismatch.",
        "auth.invalid",
      );
    }
    const encodedTail = connectionHandle.slice(handlePrefix.length);
    const tailSegments = encodedTail.split(".");
    if (tailSegments.length !== 3) {
      throw new ConnectionRegistryError("Connection handle format is invalid.", "auth.invalid");
    }
    const uuid = tailSegments[0];
    const encodedEpoch = tailSegments[1];
    const signature = tailSegments[2];
    if (uuid === undefined || encodedEpoch === undefined || signature === undefined) {
      throw new ConnectionRegistryError("Connection handle format is invalid.", "auth.invalid");
    }
    if (!CANONICAL_UUID_PATTERN.test(uuid)) {
      throw new ConnectionRegistryError("Connection handle UUID segment is invalid.", "auth.invalid");
    }
    const parsedEpoch = Number.parseInt(encodedEpoch, 10);
    if (!Number.isInteger(parsedEpoch) || parsedEpoch < 0 || parsedEpoch !== epoch) {
      throw new ConnectionRegistryError("Connection handle epoch segment is invalid.", "auth.invalid");
    }
    if (signature.length === 0) {
      throw new ConnectionRegistryError(
        "Connection handle signature segment is invalid.",
        "auth.invalid",
      );
    }

    const expectedSignature = this.#computeSignature({
      providerId,
      methodId,
      credentialRef,
      extensionId,
      origin,
      policyVersion,
      endpointProfileHash,
      uuid,
      epoch,
    });
    if (!safeEquals(expectedSignature, signature)) {
      throw new ConnectionRegistryError(
        "Connection handle signature validation failed.",
        "auth.invalid",
      );
    }

    const bindingKey = this.#bindingKey(providerId, methodId, credentialRef);
    const state = this.#bindingStates.get(bindingKey) ?? {
      currentEpoch: epoch,
      revokedHandles: new Set<string>(),
    };
    if (state.currentEpoch < epoch) {
      state.currentEpoch = epoch;
    }
    this.#bindingStates.set(bindingKey, state);

    this.#recordsByHandle.set(connectionHandle, {
      connectionHandle,
      credentialRef,
      providerId,
      methodId,
      epoch,
      extensionId,
      origin,
      policyVersion,
      endpointProfileHash,
      uuid,
      signature,
      bindingKey,
    });
  }

  async resolve(
    connectionHandle: string,
    context: ConnectionBindingContext,
  ): Promise<ConnectionRecord> {
    const normalizedHandle = requireNonEmpty(connectionHandle, "connectionHandle");
    const record = this.#recordsByHandle.get(normalizedHandle);
    if (record === undefined) {
      throw new ConnectionRegistryError("Unknown connection handle.", "auth.invalid");
    }

    const expectedSignature = this.#computeSignature({
      providerId: record.providerId,
      methodId: record.methodId,
      credentialRef: record.credentialRef,
      extensionId: record.extensionId,
      origin: record.origin,
      policyVersion: record.policyVersion,
      endpointProfileHash: record.endpointProfileHash,
      uuid: record.uuid,
      epoch: record.epoch,
    });
    if (!safeEquals(expectedSignature, record.signature)) {
      throw new ConnectionRegistryError(
        "Connection handle signature validation failed.",
        "auth.invalid",
      );
    }

    const state = this.#bindingStates.get(record.bindingKey);
    if (state === undefined || state.currentEpoch !== record.epoch) {
      throw new ConnectionRegistryError(
        "Connection handle is stale or revoked.",
        "auth.expired",
      );
    }
    if (state.revokedHandles.has(record.connectionHandle)) {
      throw new ConnectionRegistryError(
        "Connection handle is stale or revoked.",
        "auth.expired",
      );
    }

    this.#assertBindingContext(record, context);
    return record;
  }

  async revoke(connectionHandle: string): Promise<void> {
    const normalizedHandle = requireNonEmpty(connectionHandle, "connectionHandle");
    const record = this.#recordsByHandle.get(normalizedHandle);
    if (record === undefined) {
      throw new ConnectionRegistryError("Unknown connection handle.", "auth.invalid");
    }

    const state = this.#bindingStates.get(record.bindingKey);
    if (state === undefined) {
      throw new ConnectionRegistryError(
        "Connection binding state not found for handle.",
        "auth.invalid",
      );
    }

    state.revokedHandles.add(record.connectionHandle);
    if (record.epoch === state.currentEpoch) {
      state.currentEpoch += 1;
    }
  }

  #assertBindingContext(
    record: ConnectionRecord,
    context: ConnectionBindingContext,
  ): void {
    const mismatches: string[] = [];
    const extensionId = requireNonEmpty(context.extensionId, "extensionId");
    const origin = requireNonEmpty(context.origin, "origin");
    const policyVersion = requireNonEmpty(context.policyVersion, "policyVersion");
    const endpointProfileHash = requireNonEmpty(
      context.endpointProfileHash,
      "endpointProfileHash",
    );

    if (record.extensionId !== extensionId) {
      mismatches.push("extensionId");
    }
    const originBoundToExtensionRuntime = isExtensionRuntimeOrigin(record.origin);
    if (!originBoundToExtensionRuntime && record.origin !== origin) {
      mismatches.push("origin");
    }
    if (record.policyVersion !== policyVersion) {
      mismatches.push("policyVersion");
    }
    if (record.endpointProfileHash !== endpointProfileHash) {
      mismatches.push("endpointProfileHash");
    }

    if (mismatches.length > 0) {
      throw new ConnectionRegistryError(
        `Connection handle binding mismatch (${mismatches.join(", ")}).`,
        "auth.invalid",
      );
    }
  }

  #bindingKey(providerId: string, methodId: string, credentialRef: string): string {
    return `${providerId}\u0000${methodId}\u0000${credentialRef}`;
  }

  #computeSignature(payload: {
    providerId: string;
    methodId: string;
    credentialRef: string;
    extensionId: string;
    origin: string;
    policyVersion: string;
    endpointProfileHash: string;
    uuid: string;
    epoch: number;
  }): string {
    const canonical = [
      `providerId=${payload.providerId}`,
      `methodId=${payload.methodId}`,
      `credentialRef=${payload.credentialRef}`,
      `extensionId=${payload.extensionId}`,
      `origin=${payload.origin}`,
      `policyVersion=${payload.policyVersion}`,
      `endpointProfileHash=${payload.endpointProfileHash}`,
      `uuid=${payload.uuid}`,
      `epoch=${payload.epoch}`,
    ].join("\n");

    return createHmac("sha256", this.#signatureKey)
      .update(canonical, "utf8")
      .digest("base64url");
  }
}

