import {
  EnvelopeValidationError,
  PolicyViolationError,
  ProtocolError,
  PROTOCOL_MACHINE_CODES,
  ProviderUnavailableError,
  TimeoutError,
  TransientNetworkError,
} from "@arlopass/protocol";
import type { ChatMessage } from "@arlopass/web-sdk";

import {
  ensureBridgeHandshakeSession,
  invalidateBridgeHandshakeSessionCache,
} from "./bridge-handshake.js";
import {
  buildCloudRequestProof,
  computeCloudRequestPayloadHash,
} from "./request-proof.js";

type NativeMessenger = (
  hostName: string,
  message: Record<string, unknown>,
) => Promise<unknown>;

type RuntimeCloudProvider = Readonly<{
  providerId: string;
  providerName: string;
  modelId: string;
  metadata: Readonly<Record<string, string>>;
}>;

export type RunCloudBridgeCompletionInput = Readonly<{
  provider: RuntimeCloudProvider;
  messages: readonly ChatMessage[];
  correlationId: string;
  timeoutMs: number;
  requestId: string;
  nonce: string;
  origin: string;
  extensionId: string;
  resolveBridgeSharedSecret: (
    hostName: string,
  ) => Promise<string | Uint8Array | undefined | null>;
  resolveBridgePairingHandle?: (hostName: string) => Promise<string | undefined | null>;
  sendNativeMessage: NativeMessenger;
  /** One-shot send through the persistent bridge port (same process as streaming). */
  sendPortMessage?: (message: Record<string, unknown>) => Promise<unknown>;
  /** Streaming send that forwards intermediate chunks via onChunk. */
  sendStreamingMessage?: (
    message: Record<string, unknown>,
    onChunk: (chunk: string) => void,
  ) => Promise<unknown>;
  now: () => Date;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string | undefined, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function assertNativeHostName(hostName: string): string {
  if (!/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(hostName)) {
    throw new ProviderUnavailableError("Native bridge host name is invalid.", {
      details: { hostName },
    });
  }
  return hostName;
}

function requireMetadataField(
  metadata: Readonly<Record<string, string>>,
  field: string,
): string {
  const value = normalizeText(metadata[field], "");
  if (value.length === 0) {
    throw new ProviderUnavailableError(
      `Cloud provider metadata is missing required field "${field}".`,
      {
        details: { field },
      },
    );
  }
  return value;
}

function isProvisionalConnectionHandle(value: string): boolean {
  return value.includes(".pending.");
}

type CloudExecutionBindingMetadata = Readonly<{
  policyVersion: string;
  endpointProfileHash: string;
}>;

function toSafeDetails(
  details: unknown,
): Readonly<Record<string, string | number | boolean | null>> | undefined {
  if (!isRecord(details)) {
    return undefined;
  }

  const normalized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(details)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      normalized[key] = value;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function mapBridgeError(
  reasonCode: string,
  message: string,
  details: Readonly<Record<string, string | number | boolean | null>> | undefined,
): never {
  if (reasonCode === "transport.timeout") {
    throw new TimeoutError(message, {
      ...(details !== undefined ? { details } : {}),
    });
  }

  if (reasonCode === "transport.cancelled") {
    throw new ProtocolError(message, {
      machineCode: PROTOCOL_MACHINE_CODES.TRANSIENT_NETWORK,
      reasonCode: "transport.cancelled",
      retryable: true,
      ...(details !== undefined ? { details } : {}),
    });
  }

  if (reasonCode === "request.invalid") {
    throw new EnvelopeValidationError(message, {
      reasonCode: "request.invalid",
      ...(details !== undefined ? { details } : {}),
    });
  }

  if (reasonCode === "policy.denied") {
    throw new PolicyViolationError(message, {
      ...(details !== undefined ? { details } : {}),
    });
  }

  if (reasonCode === "auth.invalid" || reasonCode === "auth.expired") {
    throw new ProtocolError(message, {
      machineCode: PROTOCOL_MACHINE_CODES.AUTH_FAILED,
      reasonCode,
      retryable: reasonCode === "auth.expired",
      ...(details !== undefined ? { details } : {}),
    });
  }

  if (reasonCode === "permission.denied") {
    throw new ProtocolError(message, {
      machineCode: PROTOCOL_MACHINE_CODES.PERMISSION_DENIED,
      reasonCode: "permission.denied",
      retryable: false,
      ...(details !== undefined ? { details } : {}),
    });
  }

  if (reasonCode === "transport.transient_failure") {
    throw new TransientNetworkError(message, {
      ...(details !== undefined ? { details } : {}),
    });
  }

  throw new ProviderUnavailableError(message, {
    ...(details !== undefined ? { details } : {}),
  });
}

function shouldRetryWithFreshHandshake(reasonCode: string, message: string): boolean {
  if (reasonCode !== "auth.invalid" && reasonCode !== "auth.expired") {
    return false;
  }
  const normalized = message.toLowerCase();
  return (
    normalized.includes("handshake session token") &&
    (normalized.includes("unknown") || normalized.includes("expired"))
  );
}

async function resolveCloudExecutionBindingMetadata(options: Readonly<{
  metadata: Readonly<Record<string, string>>;
  hostName: string;
  providerId: string;
  methodId: string;
  connectionHandle: string;
  extensionId: string;
  origin: string;
  sendNativeMessage: NativeMessenger;
}>): Promise<CloudExecutionBindingMetadata> {
  const metadataPolicyVersion = normalizeText(options.metadata["policyVersion"]);
  const metadataEndpointProfileHash = normalizeText(
    options.metadata["endpointProfileHash"],
  );
  if (
    metadataPolicyVersion.length > 0 &&
    metadataEndpointProfileHash.length > 0
  ) {
    return {
      policyVersion: metadataPolicyVersion,
      endpointProfileHash: metadataEndpointProfileHash,
    };
  }

  const validationResponse = await options.sendNativeMessage(options.hostName, {
    type: "cloud.connection.validate",
    providerId: options.providerId,
    methodId: options.methodId,
    connectionHandle: options.connectionHandle,
    extensionId: options.extensionId,
    origin: options.origin,
    ...(metadataPolicyVersion.length > 0
      ? { policyVersion: metadataPolicyVersion }
      : {}),
    ...(metadataEndpointProfileHash.length > 0
      ? { endpointProfileHash: metadataEndpointProfileHash }
      : {}),
  });

  if (!isRecord(validationResponse)) {
    throw new ProviderUnavailableError(
      "Native bridge returned an invalid cloud connection validation response.",
      {
        details: {
          hostName: options.hostName,
          providerId: options.providerId,
          methodId: options.methodId,
        },
      },
    );
  }

  if (validationResponse["type"] === "error") {
    const reasonCode =
      typeof validationResponse["reasonCode"] === "string"
        ? validationResponse["reasonCode"]
        : "provider.unavailable";
    const message =
      typeof validationResponse["message"] === "string"
        ? validationResponse["message"]
        : "Cloud connection validation failed in native bridge.";
    mapBridgeError(reasonCode, message, toSafeDetails(validationResponse["details"]));
  }

  if (validationResponse["type"] !== "cloud.connection.validate") {
    throw new ProviderUnavailableError(
      "Native bridge returned an unexpected cloud connection validation payload.",
      {
        details: {
          hostName: options.hostName,
          providerId: options.providerId,
          methodId: options.methodId,
        },
      },
    );
  }

  // Extract binding metadata from the response. The bridge resolves these
  // from the persisted connection registry regardless of whether the
  // adapter's credential validation succeeds (which can fail in fresh
  // processes where the adapter has no in-memory credential context).
  const policyVersion = normalizeText(
    typeof validationResponse["policyVersion"] === "string"
      ? validationResponse["policyVersion"]
      : "",
    metadataPolicyVersion,
  );
  const endpointProfileHash = normalizeText(
    typeof validationResponse["endpointProfileHash"] === "string"
      ? validationResponse["endpointProfileHash"]
      : "",
    metadataEndpointProfileHash,
  );

  // If binding metadata is available, use it even when valid !== true.
  // The credential will be verified during the actual chat execution handshake.
  if (policyVersion.length > 0 && endpointProfileHash.length > 0) {
    return {
      policyVersion,
      endpointProfileHash,
    };
  }

  // No binding metadata — surface the validation failure.
  if (validationResponse["valid"] !== true) {
    const reason =
      typeof validationResponse["reason"] === "string"
        ? validationResponse["reason"]
        : "unknown";
    throw new ProviderUnavailableError(
      `Cloud provider connection is not valid (${reason}). Re-test and save the provider in extension options.`,
      {
        details: {
          hostName: options.hostName,
          providerId: options.providerId,
          methodId: options.methodId,
          reason,
        },
      },
    );
  }
  if (policyVersion.length === 0 || endpointProfileHash.length === 0) {
    throw new ProviderUnavailableError(
      `Provider "${options.providerId}" is missing required cloud binding metadata. Re-test and save the provider in extension options to refresh connection binding.`,
      {
        details: {
          hostName: options.hostName,
          providerId: options.providerId,
          methodId: options.methodId,
          hasPolicyVersion: policyVersion.length > 0,
          hasEndpointProfileHash: endpointProfileHash.length > 0,
        },
      },
    );
  }

  return {
    policyVersion,
    endpointProfileHash,
  };
}

export async function runCloudBridgeCompletion(
  input: RunCloudBridgeCompletionInput,
): Promise<string> {
  const hostName = assertNativeHostName(
    normalizeText(input.provider.metadata["nativeHostName"], "com.arlopass.bridge"),
  );
  const bridgeProviderId = normalizeText(
    input.provider.metadata["providerId"],
    input.provider.providerId,
  );
  const methodId = requireMetadataField(input.provider.metadata, "methodId");
  const connectionHandle = requireMetadataField(
    input.provider.metadata,
    "connectionHandle",
  );
  if (isProvisionalConnectionHandle(connectionHandle)) {
    throw new ProviderUnavailableError(
      `Provider "${input.provider.providerName}" is in validation-only mode. Enable cloud bridge execution, re-test the provider connection, and save again before sending chat messages.`,
      {
        details: {
          providerId: bridgeProviderId,
          methodId,
          connectionHandleState: "pending",
        },
      },
    );
  }
  const tenantId = normalizeText(input.provider.metadata["tenantId"], "default");
  const region = normalizeText(input.provider.metadata["region"], "global");

  // Perform handshake FIRST so all subsequent calls can include the session token.
  const handshakeOptions = {
    hostName,
    extensionId: input.extensionId,
    sendNativeMessage: input.sendNativeMessage,
    resolveBridgeSharedSecret: input.resolveBridgeSharedSecret,
    ...(input.resolveBridgePairingHandle !== undefined
      ? { resolveBridgePairingHandle: input.resolveBridgePairingHandle }
      : {}),
    now: input.now,
  } satisfies Parameters<typeof ensureBridgeHandshakeSession>[0];

  let handshake = await ensureBridgeHandshakeSession(handshakeOptions);

  // Create an auth-aware messenger that attaches the session token so
  // intermediate calls (cloud.connection.validate) pass the session gate.
  const authedMessenger: typeof input.sendNativeMessage = async (h, msg) =>
    input.sendNativeMessage(h, { ...msg, sessionToken: handshake.sessionToken });

  const bindingMetadata = await resolveCloudExecutionBindingMetadata({
    metadata: input.provider.metadata,
    hostName,
    providerId: bridgeProviderId,
    methodId,
    connectionHandle,
    extensionId: input.extensionId,
    origin: input.origin,
    sendNativeMessage: authedMessenger,
  });

  const payloadHash = await computeCloudRequestPayloadHash({
    messages: input.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    modelId: input.provider.modelId,
  });

  const executeWithHandshake = async (
    handshake: Readonly<{ sessionToken: string; sessionKey: Uint8Array }>,
  ): Promise<unknown> => {
    const requestProof = await buildCloudRequestProof({
      requestId: input.requestId,
      nonce: input.nonce,
      origin: input.origin,
      connectionHandle,
      payloadHash,
      sessionKey: handshake.sessionKey,
    });
    return input.sendNativeMessage(hostName, {
      type: "cloud.chat.execute",
      correlationId: input.correlationId,
      tenantId,
      origin: input.origin,
      providerId: bridgeProviderId,
      methodId,
      modelId: input.provider.modelId,
      extensionId: input.extensionId,
      region,
      connectionHandle,
      policyVersion: bindingMetadata.policyVersion,
      endpointProfileHash: bindingMetadata.endpointProfileHash,
      messages: input.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      timeoutMs: input.timeoutMs,
      handshakeSessionToken: handshake.sessionToken,
      requestProof,
    });
  };

  let response = await executeWithHandshake(handshake);

  console.warn(
    "[arlopass] cloud-native response:",
    "type=", isRecord(response) ? response["type"] : typeof response,
    "provider=", bridgeProviderId,
    "model=", input.provider.modelId,
    "hasContent=", isRecord(response) ? typeof response["content"] === "string" : false,
    "contentLen=", isRecord(response) && typeof response["content"] === "string" ? (response["content"] as string).length : 0,
    isRecord(response) && response["type"] === "error" ? `reason=${String(response["reasonCode"])} msg=${String(response["message"])}` : "",
  );

  if (isRecord(response) && response["type"] === "error") {
    const reasonCode =
      typeof response["reasonCode"] === "string"
        ? response["reasonCode"]
        : "provider.unavailable";
    const message =
      typeof response["message"] === "string"
        ? response["message"]
        : "Cloud execution failed in native bridge.";
    if (shouldRetryWithFreshHandshake(reasonCode, message)) {
      invalidateBridgeHandshakeSessionCache({
        hostName,
        extensionId: input.extensionId,
      });
      handshake = await ensureBridgeHandshakeSession(handshakeOptions);
      response = await executeWithHandshake(handshake);
    }
  }

  if (!isRecord(response)) {
    throw new ProviderUnavailableError(
      "Native bridge returned an invalid cloud execution response.",
      {
        details: {
          hostName,
          providerId: bridgeProviderId,
          modelId: input.provider.modelId,
        },
      },
    );
  }

  if (response["type"] === "error") {
    const reasonCode =
      typeof response["reasonCode"] === "string"
        ? response["reasonCode"]
        : "provider.unavailable";
    const message =
      typeof response["message"] === "string"
        ? response["message"]
        : "Cloud execution failed in native bridge.";
    const details = toSafeDetails(response["details"]);
    mapBridgeError(reasonCode, message, details);
  }

  if (response["type"] !== "cloud.chat.result") {
    throw new ProviderUnavailableError(
      "Native bridge returned an unexpected cloud execution payload.",
      {
        details: {
          hostName,
          providerId: bridgeProviderId,
          modelId: input.provider.modelId,
        },
      },
    );
  }

  const responseCorrelationId = response["correlationId"];
  if (
    typeof responseCorrelationId === "string" &&
    responseCorrelationId !== input.correlationId
  ) {
    throw new ProviderUnavailableError(
      "Native bridge returned mismatched correlation ID for cloud execution.",
      {
        details: {
          hostName,
          expectedCorrelationId: input.correlationId,
          receivedCorrelationId: responseCorrelationId,
        },
      },
    );
  }

  const content =
    typeof response["content"] === "string" ? response["content"].trim() : "";
  if (content.length === 0) {
    console.warn(
      "[arlopass] cloud-native EMPTY content",
      "provider=", bridgeProviderId,
      "model=", input.provider.modelId,
      "rawContent=", JSON.stringify(response["content"]),
      "fullResponse=", JSON.stringify(response).slice(0, 500),
    );
    throw new ProviderUnavailableError(
      "Native bridge cloud execution returned empty assistant content.",
      {
        details: {
          hostName,
          providerId: bridgeProviderId,
          modelId: input.provider.modelId,
        },
      },
    );
  }

  console.warn(
    "[arlopass] cloud-native OK",
    "provider=", bridgeProviderId,
    "contentLen=", content.length,
  );
  return content;
}

export async function runCloudBridgeCompletionStream(
  input: RunCloudBridgeCompletionInput,
): Promise<AsyncIterable<string>> {
  // When a persistent bridge port is available (connectNative), stream
  // real-time chunks through it.  The bridge tags each intermediate
  // `cloud.chat.stream.chunk` message with the caller's `_bridgeRequestId`
  // so PersistentBridgePort can route them to the onChunk callback.
  //
  // If connectNative is not available (unit tests, non-Chrome environment,
  // permissions issue), fall back to a single-delta completion.
  const bridgePort = input.sendStreamingMessage;
  if (bridgePort === undefined) {
    return fallbackSingleDeltaStream(input);
  }

  // When a persistent port is available, all preparatory calls (validation,
  // handshake) MUST go through the SAME bridge process that will handle the
  // streaming request. Build a port-scoped native messenger for these calls.
  const portMessenger: NativeMessenger =
    input.sendPortMessage !== undefined
      ? async (_hostName, message) => input.sendPortMessage!(message)
      : input.sendNativeMessage;

  const hostName = assertNativeHostName(
    normalizeText(input.provider.metadata["nativeHostName"], "com.arlopass.bridge"),
  );
  const bridgeProviderId = normalizeText(
    input.provider.metadata["providerId"],
    input.provider.providerId,
  );
  const methodId = requireMetadataField(input.provider.metadata, "methodId");
  const connectionHandle = requireMetadataField(
    input.provider.metadata,
    "connectionHandle",
  );

  if (isProvisionalConnectionHandle(connectionHandle)) {
    throw new ProviderUnavailableError(
      `Provider "${input.provider.providerName}" is in validation-only mode. Enable cloud bridge execution, re-test the provider connection, and save again before sending chat messages.`,
      {
        details: {
          providerId: bridgeProviderId,
          methodId,
          connectionHandleState: "pending",
        },
      },
    );
  }

  const tenantId = normalizeText(input.provider.metadata["tenantId"], "default");
  const region = normalizeText(input.provider.metadata["region"], "global");

  // Handshake goes through the same persistent port (same bridge process).
  // Must happen BEFORE resolveCloudExecutionBindingMetadata so we can
  // attach the session token to intermediate calls (cloud.connection.validate).
  const handshake = await ensureBridgeHandshakeSession({
    hostName,
    extensionId: input.extensionId,
    sendNativeMessage: portMessenger,
    resolveBridgeSharedSecret: input.resolveBridgeSharedSecret,
    ...(input.resolveBridgePairingHandle !== undefined
      ? { resolveBridgePairingHandle: input.resolveBridgePairingHandle }
      : {}),
    now: input.now,
  });

  const authedPortMessenger: NativeMessenger = async (h, msg) =>
    portMessenger(h, { ...msg, sessionToken: handshake.sessionToken });

  // Binding metadata typically comes from stored provider metadata; only
  // calls the bridge if missing.
  const bindingMetadata = await resolveCloudExecutionBindingMetadata({
    metadata: input.provider.metadata,
    hostName,
    providerId: bridgeProviderId,
    methodId,
    connectionHandle,
    extensionId: input.extensionId,
    origin: input.origin,
    sendNativeMessage: authedPortMessenger,
  });

  const payloadHash = await computeCloudRequestPayloadHash({
    messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
    modelId: input.provider.modelId,
  });

  const requestProof = await buildCloudRequestProof({
    requestId: input.requestId,
    nonce: input.nonce,
    origin: input.origin,
    connectionHandle,
    payloadHash,
    sessionKey: handshake.sessionKey,
  });

  // Build an AsyncIterable that yields real-time streaming deltas.
  // bridgePort.sendWithChunks fires onChunk for each intermediate delta
  // message from the bridge, then resolves with the terminal response.
  return (async function* (): AsyncIterable<string> {
    const queue: string[] = [];
    const waiters: Array<(value: string | null) => void> = [];
    let streamDone = false;
    let chunkCount = 0;

    const onChunk = (delta: string): void => {
      if (chunkCount === 0) {
        console.warn(
          "[arlopass] cloud-native-stream FIRST_CHUNK",
          "provider=", bridgeProviderId,
          "deltaLen=", delta.length,
        );
      }
      chunkCount++;
      const waiter = waiters.shift();
      if (waiter !== undefined) {
        waiter(delta);
        return;
      }
      queue.push(delta);
    };

    const streamPromise = bridgePort(
      {
        type: "cloud.chat.execute",
        correlationId: input.correlationId,
        tenantId,
        origin: input.origin,
        providerId: bridgeProviderId,
        methodId,
        modelId: input.provider.modelId,
        extensionId: input.extensionId,
        region,
        connectionHandle,
        policyVersion: bindingMetadata.policyVersion,
        endpointProfileHash: bindingMetadata.endpointProfileHash,
        messages: input.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        timeoutMs: input.timeoutMs,
        handshakeSessionToken: handshake.sessionToken,
        requestProof,
        streamRequested: true,
      },
      onChunk,
    )
      .then((response) => {
        streamDone = true;
        console.warn(
          "[arlopass] cloud-native-stream END",
          "provider=", bridgeProviderId,
          "chunks=", chunkCount,
          "responseType=", isRecord(response) ? response["type"] : typeof response,
          isRecord(response) && response["type"] === "error" ? `reason=${String(response["reasonCode"])} msg=${String(response["message"])}` : "",
        );
        // Signal any waiting consumer that the stream is done.
        const waiter = waiters.shift();
        if (waiter !== undefined) {
          waiter(null);
        }

        // Validate terminal response.
        if (
          isRecord(response) &&
          response["type"] === "error"
        ) {
          const message =
            typeof response["message"] === "string"
              ? response["message"]
              : "Cloud streaming execution failed.";
          const details = toSafeDetails(response["details"]);
          throw new ProviderUnavailableError(message, {
            ...(details !== undefined ? { details } : {}),
          });
        }
      })
      .catch((error: unknown) => {
        streamDone = true;
        const errMsg = error instanceof Error ? error.message : String(error);
        console.warn(
          "[arlopass] cloud-native-stream ERROR",
          "provider=", bridgeProviderId,
          "chunks=", chunkCount,
          "error=", errMsg,
        );
        const waiter = waiters.shift();
        if (waiter !== undefined) {
          waiter(null);
        }
        throw error;
      });

    // Yield chunks as they arrive.
    while (!streamDone || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift() as string;
        continue;
      }
      if (streamDone) {
        break;
      }
      const next = await new Promise<string | null>((resolve) => {
        waiters.push(resolve);
      });
      if (next === null) {
        break;
      }
      yield next;
    }

    // Rethrow any error from the terminal response.
    await streamPromise;
  })();
}

async function fallbackSingleDeltaStream(
  input: RunCloudBridgeCompletionInput,
): Promise<AsyncIterable<string>> {
  const completion = await runCloudBridgeCompletion(input);
  return (async function* (): AsyncIterable<string> {
    if (completion.length > 0) {
      yield completion;
    }
  })();
}
