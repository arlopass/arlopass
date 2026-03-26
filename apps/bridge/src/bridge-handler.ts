import { createHash } from "node:crypto";
import process from "node:process";
import { appendFileSync } from "node:fs";

import {
  TELEMETRY_METRIC_NAMES,
  TELEMETRY_METRIC_UNITS,
  type TelemetryMetrics,
} from "@byom-ai/telemetry";

import {
  CliChatExecutionError,
  CopilotCliChatExecutor,
  type CliChatExecutor,
  type CliChatMessage,
} from "./cli/copilot-chat-executor.js";
import {
  CloudConnectionService,
  type CloudConnectionServiceContract,
} from "./cloud/cloud-connection-service.js";
import { ConnectionRegistry } from "./cloud/connection-registry.js";
import {
  type CloudChatExecutorContract,
} from "./cloud/cloud-chat-executor.js";
import {
  InMemoryRequestIdempotencyStore,
  IdempotencyStoreError,
  type IdempotencyReservation,
  type RequestIdempotencyStoreContract,
} from "./cloud/idempotency-store.js";
import { redactProviderPayload, toSafeUserError } from "./cloud/error-redaction.js";
import {
  DEFAULT_CLOUD_FEATURE_FLAGS,
  isCloudExecutionEnabled,
  type CloudFeatureFlags,
} from "./config/index.js";
import { HandshakeManager } from "./session/handshake.js";
import type { HandshakeChallengeResponse } from "./session/handshake.js";
import { RequestVerifier } from "./session/request-verifier.js";
import { RuntimeEnforcer } from "./permissions/runtime-enforcer.js";
import type { RuntimeGrant } from "./permissions/runtime-enforcer.js";
import type { NativeMessage, NativeStreamWriter } from "./native-host.js";
import { SessionKeyRegistry } from "./session/session-key-registry.js";
import {
  PairingError,
  PairingManager,
  type BeginPairingResult,
} from "./session/pairing.js";

export type BridgeHandlerOptions = Readonly<{
  sharedSecret: Buffer;
  handshakeManager?: HandshakeManager;
  requestVerifier?: RequestVerifier;
  requestIdempotencyStore?: RequestIdempotencyStoreContract;
  enforcer?: RuntimeEnforcer;
  cliChatExecutor?: CliChatExecutor;
  cloudConnectionService?: CloudConnectionServiceContract;
  cloudChatExecutor?: CloudChatExecutorContract;
  cloudFeatureFlags?: CloudFeatureFlags;
  sessionKeyRegistry?: SessionKeyRegistry;
  pairingManager?: PairingManager;
  pairingCodeRetrievalHint?: string;
  metrics?: TelemetryMetrics;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOptionalNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toErrorDetails(
  value: unknown,
): Readonly<Record<string, string | number | boolean | null>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const normalized: Record<string, string | number | boolean | null> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      normalized[key] = entry;
      continue;
    }
    if (Array.isArray(entry) || isRecord(entry)) {
      normalized[key] = JSON.stringify(entry);
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
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

function toRequestFingerprint(payload: unknown): string {
  return `sha256:${createHash("sha256")
    .update(canonicalizeJsonValue(payload), "utf8")
    .digest("hex")}`;
}

function deriveCloudConnectionCompleteIdempotencyNamespace(sharedSecret: Buffer): string {
  return createHash("sha256")
    .update("byom.bridge.cloud.connection.complete.idempotency.v1", "utf8")
    .update(sharedSecret)
    .digest("hex");
}

function isCloudConnectionCompleteReplay(
  value: Readonly<Record<string, unknown>>,
): value is NativeMessage {
  return (
    value["type"] === "cloud.connection.complete" &&
    typeof value["providerId"] === "string" &&
    typeof value["methodId"] === "string" &&
    typeof value["connectionHandle"] === "string"
  );
}

function isCloudChatReplay(
  value: Readonly<Record<string, unknown>>,
): value is NativeMessage {
  return (
    value["type"] === "cloud.chat.result" &&
    typeof value["correlationId"] === "string" &&
    typeof value["providerId"] === "string" &&
    typeof value["methodId"] === "string" &&
    typeof value["modelId"] === "string" &&
    typeof value["region"] === "string" &&
    typeof value["content"] === "string"
  );
}

function errorResponse(
  reasonCode: string,
  message: string,
  options: Readonly<{
    correlationId?: string;
    details?: Readonly<Record<string, string | number | boolean | null>>;
  }> = {},
): NativeMessage {
  return {
    type: "error",
    reasonCode,
    message,
    ...(options.correlationId !== undefined
      ? { correlationId: options.correlationId }
      : {}),
    ...(options.details !== undefined ? { details: options.details } : {}),
  };
}

/**
 * Routes native messages to the appropriate bridge sub-systems.
 *
 * Supported message types:
 *  - handshake.challenge  → issues a new HMAC challenge
 *  - handshake.verify     → validates the extension HMAC response, returns a session token
 *  - grant.sync           → mirrors an extension grant into the runtime enforcer
 *  - grant.revoke         → removes a grant from the runtime enforcer
 *  - request.check        → validates an envelope and enforces runtime permissions
 *  - cli.models.list      → returns curated model catalog for a supported CLI type
 *  - cli.thinking-levels.list → returns thinking levels for a model/CLI pair
 *  - cli.chat.execute     → executes non-streaming chat against selected local CLI
 *  - cloud.connection.*   → cloud connection lifecycle operations
 *  - cloud.models.discover/cloud.capabilities.discover/cloud.discovery.refresh
 *                         → cloud provider discovery operations
 *  - cloud.chat.execute   → executes non-streaming cloud chat
 *  - pairing.begin/complete/list/revoke/rotate
 *                         → secure bridge pairing lifecycle
 *
 * Every failure path produces an explicit { type: "error", reasonCode, message }
 * response — there are no silent fallbacks.
 */
export class BridgeHandler {
  readonly #sharedSecret: Buffer;
  readonly #handshakeManager: HandshakeManager;
  readonly #requestVerifier: RequestVerifier;
  readonly #requestIdempotencyStore: RequestIdempotencyStoreContract;
  readonly #enforcer: RuntimeEnforcer;
  readonly #cliChatExecutor: CliChatExecutor;
  readonly #cloudConnectionService: CloudConnectionServiceContract;
  readonly #cloudChatExecutor: CloudChatExecutorContract | undefined;
  readonly #cloudFeatureFlags: CloudFeatureFlags;
  readonly #sessionKeyRegistry: SessionKeyRegistry;
  readonly #pairingManager: PairingManager;
  readonly #pairingCodeRetrievalHint: string | undefined;
  readonly #metrics: TelemetryMetrics | undefined;
  readonly #cloudConnectionCompleteIdempotencyNamespace: string;

  constructor(options: BridgeHandlerOptions) {
    this.#sharedSecret = options.sharedSecret;
    this.#cloudConnectionCompleteIdempotencyNamespace =
      deriveCloudConnectionCompleteIdempotencyNamespace(this.#sharedSecret);
    this.#handshakeManager =
      options.handshakeManager ?? new HandshakeManager();
    this.#sessionKeyRegistry =
      options.sessionKeyRegistry ?? new SessionKeyRegistry();
    this.#pairingManager = options.pairingManager ?? new PairingManager();
    this.#pairingCodeRetrievalHint = normalizeOptionalNonEmptyString(
      options.pairingCodeRetrievalHint,
    );
    this.#requestVerifier =
      options.requestVerifier ??
      new RequestVerifier({
        sessionKeyResolver: (sessionToken) =>
          this.#sessionKeyRegistry.resolveRecord(sessionToken),
      });
    this.#requestIdempotencyStore =
      options.requestIdempotencyStore ?? new InMemoryRequestIdempotencyStore();
    this.#enforcer = options.enforcer ?? new RuntimeEnforcer();
    this.#cliChatExecutor =
      options.cliChatExecutor ?? new CopilotCliChatExecutor();
    this.#cloudConnectionService =
      options.cloudConnectionService ??
      new CloudConnectionService({
        adaptersByProvider: {},
        connectionRegistry: new ConnectionRegistry({
          signatureKey: this.#sharedSecret,
        }),
      });
    this.#cloudChatExecutor = options.cloudChatExecutor;
    this.#cloudFeatureFlags =
      options.cloudFeatureFlags ?? DEFAULT_CLOUD_FEATURE_FLAGS;
    this.#metrics = options.metrics;
  }

  /**
   * Dispatches a single native message and returns the response.
   * Records request count, duration, and failure metrics when a metrics emitter
   * is provided.
   */
  async handle(message: NativeMessage, writer?: NativeStreamWriter): Promise<NativeMessage> {
    const startMs = Date.now();
    const messageType =
      typeof message["type"] === "string" ? message["type"] : "unknown";

    // Strip the internal routing tag so it doesn't leak into handler logic
    // or adapter calls (adapters may reject unknown fields).
    const { _bridgeRequestId: _tag, ...cleanMessage } = message;

    let response: NativeMessage;
    try {
      response = await this.#dispatch(cleanMessage as NativeMessage, writer);
    } catch (error) {
      this.#recordMetrics(messageType, Date.now() - startMs, false);
      throw error;
    }

    const success = response["type"] !== "error";
    this.#recordMetrics(messageType, Date.now() - startMs, success);
    return response;
  }

  // ---------------------------------------------------------------------------
  // Internal dispatch and telemetry
  // ---------------------------------------------------------------------------

  async #dispatch(message: NativeMessage, writer?: NativeStreamWriter): Promise<NativeMessage> {
    switch (message["type"]) {
      case "handshake.challenge":
        return this.#handleHandshakeChallenge();

      case "handshake.verify":
        return this.#handleHandshakeVerify(message);

      case "pairing.begin":
        return this.#handlePairingBegin(message);

      case "pairing.complete":
        return this.#handlePairingComplete(message);

      case "pairing.list":
        return this.#handlePairingList(message);

      case "pairing.revoke":
        return this.#handlePairingRevoke(message);

      case "pairing.rotate":
        return this.#handlePairingRotate(message);

      case "grant.sync":
        return this.#handleGrantSync(message);

      case "grant.revoke":
        return this.#handleGrantRevoke(message);

      case "request.check":
        return this.#handleRequestCheck(message);

      case "cli.models.list":
        return this.#handleCliModelsList(message);

      case "cli.thinking-levels.list":
        return this.#handleCliThinkingLevelsList(message);

      case "cli.chat.execute":
        return this.#handleCliChatExecute(message, writer);

      case "cloud.connection.begin":
        return this.#handleCloudConnectionBegin(message);

      case "cloud.connection.complete":
        return this.#handleCloudConnectionComplete(message);

      case "cloud.connection.validate":
        return this.#handleCloudConnectionValidate(message);

      case "cloud.connection.revoke":
        return this.#handleCloudConnectionRevoke(message);

      case "cloud.models.discover":
        return this.#handleCloudModelsDiscover(message);

      case "cloud.capabilities.discover":
        return this.#handleCloudCapabilitiesDiscover(message);

      case "cloud.discovery.refresh":
        return this.#handleCloudDiscoveryRefresh(message);

      case "cloud.chat.execute":
        return this.#handleCloudChatExecute(message, writer);

      default:
        return errorResponse(
          "request.invalid",
          `Unrecognised message type: ${String(message["type"] ?? "(none)")}`,
        );
    }
  }

  #recordMetrics(
    messageType: string,
    durationMs: number,
    success: boolean,
  ): void {
    if (this.#metrics === undefined) return;
    const metadata = {
      correlationId: `bridge.${messageType}`,
      origin: "byom.bridge",
      providerId: "bridge",
      messageType,
    };
    this.#metrics.emit({
      name: TELEMETRY_METRIC_NAMES.REQUEST_TOTAL,
      value: 1,
      metadata,
    });
    this.#metrics.emit({
      name: TELEMETRY_METRIC_NAMES.REQUEST_DURATION_MS,
      value: durationMs,
      unit: TELEMETRY_METRIC_UNITS.milliseconds,
      metadata,
    });
    if (!success) {
      this.#metrics.emit({
        name: TELEMETRY_METRIC_NAMES.REQUEST_FAILURE_TOTAL,
        value: 1,
        metadata,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Handshake
  // ---------------------------------------------------------------------------

  #handleHandshakeChallenge(): NativeMessage {
    const challenge = this.#handshakeManager.createChallenge();
    return {
      type: "handshake.challenge",
      nonce: challenge.nonce,
      issuedAt: challenge.issuedAt,
      expiresAt: challenge.expiresAt,
    };
  }

  #handleHandshakeVerify(message: NativeMessage): NativeMessage {
    const { nonce, hmac, extensionId } = message;

    if (
      typeof nonce !== "string" ||
      typeof hmac !== "string" ||
      typeof extensionId !== "string"
    ) {
      return errorResponse(
        "request.invalid",
        "handshake.verify requires string fields: nonce, hmac, extensionId.",
      );
    }

    const response: HandshakeChallengeResponse = { nonce, hmac, extensionId };
    const pairingHandle = normalizeOptionalNonEmptyString(message["pairingHandle"]);
    const hostName = normalizeOptionalNonEmptyString(message["hostName"]);
    let handshakeSecret = this.#sharedSecret;
    if (pairingHandle !== undefined || hostName !== undefined) {
      if (pairingHandle === undefined || hostName === undefined) {
        return errorResponse(
          "request.invalid",
          "handshake.verify with pairing requires non-empty pairingHandle and hostName.",
        );
      }
      const resolvedPairingSecret = this.#pairingManager.resolvePairingSecret({
        pairingHandle,
        extensionId,
        hostName,
      });
      if (resolvedPairingSecret === undefined) {
        this.#emitPairingAuditEvent({
          action: "complete",
          outcome: "deny",
          reasonCode: "auth.invalid",
          extensionId,
          hostName,
          pairingHandle,
        });
        return errorResponse(
          "auth.invalid",
          "Pairing handle is missing, revoked, or not bound to this extension and host.",
          {
            details: {
              pairingHandle,
              extensionId,
              hostName,
            },
          },
        );
      }
      handshakeSecret = resolvedPairingSecret;
    }

    try {
      const session = this.#handshakeManager.verifyResponse(
        response,
        handshakeSecret,
      );
      if (pairingHandle !== undefined && hostName !== undefined) {
        this.#emitPairingAuditEvent({
          action: "complete",
          outcome: "allow",
          reasonCode: "handshake.verify.ok",
          extensionId,
          hostName,
          pairingHandle,
        });
      }
      this.#sessionKeyRegistry.issue({
        extensionId: session.extensionId,
        sessionToken: session.sessionToken,
        establishedAt: session.establishedAt,
        expiresAt: session.expiresAt,
      });
      return {
        type: "handshake.session",
        sessionToken: session.sessionToken,
        extensionId: session.extensionId,
        establishedAt: session.establishedAt,
        expiresAt: session.expiresAt,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      const reasonCode =
        (error as { reasonCode?: string }).reasonCode ?? "auth.invalid";
      if (pairingHandle !== undefined && hostName !== undefined) {
        this.#emitPairingAuditEvent({
          action: "complete",
          outcome: "deny",
          reasonCode,
          extensionId,
          hostName,
          pairingHandle,
        });
      }
      return errorResponse(reasonCode, message);
    }
  }

  #toPairingPublicResponse(
    begin: BeginPairingResult,
    options: Readonly<{ includeOneTimeCode?: boolean }> = {},
  ): Readonly<Record<string, unknown>> {
    return {
      pairingSessionId: begin.pairingSessionId,
      extensionId: begin.extensionId,
      hostName: begin.hostName,
      curve: begin.curve,
      bridgePublicKey: begin.bridgePublicKey,
      salt: begin.salt,
      iterations: begin.iterations,
      codeLength: begin.codeLength,
      maxAttempts: begin.maxAttempts,
      backoffBaseMs: begin.backoffBaseMs,
      ttlMs: begin.ttlMs,
      createdAt: begin.createdAt,
      expiresAt: begin.expiresAt,
      ...(begin.supersedesPairingHandle !== undefined
        ? { supersedesPairingHandle: begin.supersedesPairingHandle }
        : {}),
      ...(this.#pairingCodeRetrievalHint !== undefined
        ? { codeRetrievalHint: this.#pairingCodeRetrievalHint }
        : {}),
      ...(options.includeOneTimeCode === true
        ? { oneTimeCode: begin.oneTimeCode }
        : {}),
    };
  }

  #emitPairingCode(begin: BeginPairingResult): void {
    const output = [
      `[byom-bridge] Pair Bridge code`,
      `session=${begin.pairingSessionId}`,
      `code=${begin.oneTimeCode}`,
      `ttlSeconds=${String(Math.floor(begin.ttlMs / 1_000))}`,
      `extensionId=${begin.extensionId}`,
      `hostName=${begin.hostName}`,
    ].join(" | ");
    const pairingCodeLogPath = normalizeOptionalNonEmptyString(
      process.env["BYOM_BRIDGE_PAIRING_CODE_LOG_PATH"],
    );
    if (pairingCodeLogPath !== undefined) {
      try {
        appendFileSync(pairingCodeLogPath, `${output}\n`, { encoding: "utf8" });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        process.stderr.write(
          `[byom-bridge] warning: failed to append pairing code to "${pairingCodeLogPath}": ${errorMessage}\n`,
        );
      }
    }
    process.stderr.write(`${output}\n`);
  }

  #emitPairingAuditEvent(input: Readonly<{
    action: "begin" | "complete" | "list" | "revoke" | "rotate";
    outcome: "allow" | "deny";
    reasonCode: string;
    extensionId?: string;
    hostName?: string;
    pairingSessionId?: string;
    pairingHandle?: string;
  }>): void {
    const event = {
      timestamp: new Date().toISOString(),
      subsystem: "bridge.pairing",
      action: input.action,
      outcome: input.outcome,
      reasonCode: input.reasonCode,
      ...(input.extensionId !== undefined ? { extensionId: input.extensionId } : {}),
      ...(input.hostName !== undefined ? { hostName: input.hostName } : {}),
      ...(input.pairingSessionId !== undefined
        ? { pairingSessionId: input.pairingSessionId }
        : {}),
      ...(input.pairingHandle !== undefined ? { pairingHandle: input.pairingHandle } : {}),
    };
    process.stderr.write(`[byom-bridge][audit] ${JSON.stringify(event)}\n`);
  }

  #asPairingErrorResponse(error: unknown, fallbackMessage: string): NativeMessage {
    if (error instanceof PairingError) {
      return errorResponse(error.reasonCode, error.message, {
        ...(error.details !== undefined
          ? { details: error.details }
          : {}),
      });
    }
    const message = error instanceof Error ? error.message : fallbackMessage;
    return errorResponse("transport.transient_failure", message);
  }

  #handlePairingBegin(message: NativeMessage): NativeMessage {
    const extensionId = normalizeOptionalNonEmptyString(message["extensionId"]);
    const hostName = normalizeOptionalNonEmptyString(message["hostName"]);
    const includeOneTimeCode = message["includeOneTimeCode"] === true;
    const supersedesPairingHandle =
      normalizeOptionalNonEmptyString(message["supersedesPairingHandle"]);
    if (extensionId === undefined || hostName === undefined) {
      return errorResponse(
        "request.invalid",
        "pairing.begin requires non-empty extensionId and hostName.",
      );
    }

    try {
      const begin = this.#pairingManager.beginPairing({
        extensionId,
        hostName,
        ...(supersedesPairingHandle !== undefined
          ? { supersedesPairingHandle }
          : {}),
      });
      this.#emitPairingCode(begin);
      this.#emitPairingAuditEvent({
        action: "begin",
        outcome: "allow",
        reasonCode: "pairing.begin.ok",
        extensionId,
        hostName,
        pairingSessionId: begin.pairingSessionId,
        ...(supersedesPairingHandle !== undefined
          ? { pairingHandle: supersedesPairingHandle }
          : {}),
      });
      return {
        type: "pairing.begin",
        ...this.#toPairingPublicResponse(begin, { includeOneTimeCode }),
      };
    } catch (error) {
      this.#emitPairingAuditEvent({
        action: "begin",
        outcome: "deny",
        reasonCode:
          error instanceof PairingError
            ? error.reasonCode
            : "transport.transient_failure",
        extensionId,
        hostName,
      });
      return this.#asPairingErrorResponse(error, "Pairing begin failed.");
    }
  }

  #handlePairingComplete(message: NativeMessage): NativeMessage {
    const pairingSessionId = normalizeOptionalNonEmptyString(message["pairingSessionId"]);
    const extensionId = normalizeOptionalNonEmptyString(message["extensionId"]);
    const hostName = normalizeOptionalNonEmptyString(message["hostName"]);
    const extensionPublicKey = normalizeOptionalNonEmptyString(message["extensionPublicKey"]);
    const proof = normalizeOptionalNonEmptyString(message["proof"]);
    if (
      pairingSessionId === undefined ||
      extensionId === undefined ||
      hostName === undefined ||
      extensionPublicKey === undefined ||
      proof === undefined
    ) {
      return errorResponse(
        "request.invalid",
        "pairing.complete requires non-empty pairingSessionId, extensionId, hostName, extensionPublicKey, and proof.",
      );
    }

    try {
      const result = this.#pairingManager.completePairing({
        pairingSessionId,
        extensionId,
        hostName,
        extensionPublicKey,
        proof,
      });
      this.#emitPairingAuditEvent({
        action: "complete",
        outcome: "allow",
        reasonCode: "pairing.complete.ok",
        extensionId,
        hostName,
        pairingSessionId,
        pairingHandle: result.pairingHandle,
      });
      return {
        type: "pairing.complete",
        pairingHandle: result.pairingHandle,
        extensionId: result.extensionId,
        hostName: result.hostName,
        createdAt: result.createdAt,
        ...(result.rotatedFromPairingHandle !== undefined
          ? { rotatedFromPairingHandle: result.rotatedFromPairingHandle }
          : {}),
      };
    } catch (error) {
      this.#emitPairingAuditEvent({
        action: "complete",
        outcome: "deny",
        reasonCode:
          error instanceof PairingError
            ? error.reasonCode
            : "transport.transient_failure",
        extensionId,
        hostName,
        pairingSessionId,
      });
      return this.#asPairingErrorResponse(error, "Pairing complete failed.");
    }
  }

  #handlePairingList(message: NativeMessage): NativeMessage {
    const extensionId = normalizeOptionalNonEmptyString(message["extensionId"]);
    const hostName = normalizeOptionalNonEmptyString(message["hostName"]);
    try {
      const pairings = this.#pairingManager.listPairings({
        ...(extensionId !== undefined ? { extensionId } : {}),
        ...(hostName !== undefined ? { hostName } : {}),
      });
      this.#emitPairingAuditEvent({
        action: "list",
        outcome: "allow",
        reasonCode: "pairing.list.ok",
        ...(extensionId !== undefined ? { extensionId } : {}),
        ...(hostName !== undefined ? { hostName } : {}),
      });
      return {
        type: "pairing.list",
        pairings,
      };
    } catch (error) {
      this.#emitPairingAuditEvent({
        action: "list",
        outcome: "deny",
        reasonCode:
          error instanceof PairingError
            ? error.reasonCode
            : "transport.transient_failure",
        ...(extensionId !== undefined ? { extensionId } : {}),
        ...(hostName !== undefined ? { hostName } : {}),
      });
      return this.#asPairingErrorResponse(error, "Pairing list failed.");
    }
  }

  #handlePairingRevoke(message: NativeMessage): NativeMessage {
    const pairingHandle = normalizeOptionalNonEmptyString(message["pairingHandle"]);
    const extensionId = normalizeOptionalNonEmptyString(message["extensionId"]);
    const hostName = normalizeOptionalNonEmptyString(message["hostName"]);
    if (pairingHandle === undefined) {
      return errorResponse("request.invalid", "pairing.revoke requires non-empty pairingHandle.");
    }

    try {
      const revoked = this.#pairingManager.revokePairing({
        pairingHandle,
        ...(extensionId !== undefined ? { extensionId } : {}),
        ...(hostName !== undefined ? { hostName } : {}),
      });
      this.#emitPairingAuditEvent({
        action: "revoke",
        outcome: revoked ? "allow" : "deny",
        reasonCode: revoked ? "pairing.revoke.ok" : "auth.invalid",
        ...(extensionId !== undefined ? { extensionId } : {}),
        ...(hostName !== undefined ? { hostName } : {}),
        pairingHandle,
      });
      return {
        type: "pairing.revoke",
        pairingHandle,
        revoked,
      };
    } catch (error) {
      this.#emitPairingAuditEvent({
        action: "revoke",
        outcome: "deny",
        reasonCode:
          error instanceof PairingError
            ? error.reasonCode
            : "transport.transient_failure",
        ...(extensionId !== undefined ? { extensionId } : {}),
        ...(hostName !== undefined ? { hostName } : {}),
        pairingHandle,
      });
      return this.#asPairingErrorResponse(error, "Pairing revoke failed.");
    }
  }

  #handlePairingRotate(message: NativeMessage): NativeMessage {
    const pairingHandle = normalizeOptionalNonEmptyString(message["pairingHandle"]);
    const extensionId = normalizeOptionalNonEmptyString(message["extensionId"]);
    const hostName = normalizeOptionalNonEmptyString(message["hostName"]);
    if (pairingHandle === undefined || extensionId === undefined || hostName === undefined) {
      return errorResponse(
        "request.invalid",
        "pairing.rotate requires non-empty pairingHandle, extensionId, and hostName.",
      );
    }

    try {
      const begin = this.#pairingManager.rotatePairing({
        pairingHandle,
        extensionId,
        hostName,
      });
      this.#emitPairingCode(begin);
      this.#emitPairingAuditEvent({
        action: "rotate",
        outcome: "allow",
        reasonCode: "pairing.rotate.ok",
        extensionId,
        hostName,
        pairingSessionId: begin.pairingSessionId,
        pairingHandle,
      });
      return {
        type: "pairing.rotate",
        ...this.#toPairingPublicResponse(begin),
      };
    } catch (error) {
      this.#emitPairingAuditEvent({
        action: "rotate",
        outcome: "deny",
        reasonCode:
          error instanceof PairingError
            ? error.reasonCode
            : "transport.transient_failure",
        extensionId,
        hostName,
        pairingHandle,
      });
      return this.#asPairingErrorResponse(error, "Pairing rotate failed.");
    }
  }

  // ---------------------------------------------------------------------------
  // Grant synchronisation
  // ---------------------------------------------------------------------------

  #handleGrantSync(message: NativeMessage): NativeMessage {
    const { grant } = message;

    if (!isRecord(grant)) {
      return errorResponse(
        "request.invalid",
        "grant.sync requires a grant object.",
      );
    }

    if (
      typeof grant["id"] !== "string" ||
      typeof grant["origin"] !== "string" ||
      typeof grant["capability"] !== "string" ||
      typeof grant["providerId"] !== "string" ||
      typeof grant["modelId"] !== "string" ||
      typeof grant["grantType"] !== "string"
    ) {
      return errorResponse(
        "request.invalid",
        "grant.sync: grant is missing required fields (id, origin, capability, providerId, modelId, grantType).",
      );
    }

    const runtimeGrant: RuntimeGrant = {
      id: grant["id"] as string,
      origin: grant["origin"] as string,
      capability: grant["capability"] as RuntimeGrant["capability"],
      providerId: grant["providerId"] as string,
      modelId: grant["modelId"] as string,
      grantType: grant["grantType"] as RuntimeGrant["grantType"],
      ...(typeof grant["sessionId"] === "string"
        ? { sessionId: grant["sessionId"] }
        : {}),
      ...(typeof grant["expiresAt"] === "string"
        ? { expiresAt: grant["expiresAt"] }
        : {}),
    };

    this.#enforcer.syncGrant(runtimeGrant);
    return { type: "grant.sync.ack", grantId: runtimeGrant.id };
  }

  #handleGrantRevoke(message: NativeMessage): NativeMessage {
    const { grantId } = message;

    if (typeof grantId !== "string") {
      return errorResponse(
        "request.invalid",
        "grant.revoke requires a grantId string.",
      );
    }

    this.#enforcer.revokeGrant(grantId);
    return { type: "grant.revoke.ack", grantId };
  }

  // ---------------------------------------------------------------------------
  // Request enforcement
  // ---------------------------------------------------------------------------

  #handleRequestCheck(message: NativeMessage): NativeMessage {
    const envelope = message["envelope"];
    const sessionId = message["sessionId"];
    const sessionToken =
      normalizeOptionalNonEmptyString(message["sessionToken"]) ??
      normalizeOptionalNonEmptyString(message["handshakeSessionToken"]);
    const requestProof = message["requestProof"];
    const connectionHandle = message["connectionHandle"];
    const extensionId = normalizeOptionalNonEmptyString(message["extensionId"]);
    const origin = normalizeOptionalNonEmptyString(message["origin"]);
    const policyVersion = normalizeOptionalNonEmptyString(message["policyVersion"]);
    const endpointProfileHash = normalizeOptionalNonEmptyString(
      message["endpointProfileHash"],
    );

    const shouldVerifyProof =
      sessionToken !== undefined ||
      requestProof !== undefined ||
      connectionHandle !== undefined;

    const verified = shouldVerifyProof
      ? this.#requestVerifier.verifyWithProof(envelope, {
        sessionToken: sessionToken ?? "",
        proof: requestProof,
        connectionHandle: connectionHandle ?? {},
        ...(extensionId !== undefined ? { extensionId } : {}),
        ...(origin !== undefined ? { origin } : {}),
        ...(policyVersion !== undefined ? { policyVersion } : {}),
        ...(endpointProfileHash !== undefined ? { endpointProfileHash } : {}),
      })
      : this.#requestVerifier.verify(envelope);
    if (!verified.ok) {
      return errorResponse(verified.error.reasonCode, verified.error.message);
    }

    const { envelope: parsedEnvelope } = verified;

    const result = this.#enforcer.evaluate({
      origin: parsedEnvelope.origin,
      capability: parsedEnvelope.capability,
      providerId: parsedEnvelope.providerId,
      modelId: parsedEnvelope.modelId,
      ...(typeof sessionId === "string" ? { sessionId } : {}),
    });

    if (!result.allowed) {
      return { type: "request.denied", reasonCode: result.reasonCode };
    }

    return {
      type: "request.allowed",
      grantId: result.grantId,
      consumed: result.consumed,
    };
  }

  async #handleCliModelsList(message: NativeMessage): Promise<NativeMessage> {
    const cliType =
      typeof message["cliType"] === "string" && message["cliType"].trim().length > 0
        ? message["cliType"]
        : "copilot-cli";

    try {
      const result = await this.#cliChatExecutor.listModels({ cliType });
      return {
        type: "cli.models.list",
        cliType: result.cliType,
        source: result.source,
        models: result.models,
      };
    } catch (error) {
      if (error instanceof CliChatExecutionError) {
        return errorResponse(error.reasonCode, error.message, {
          ...(error.details !== undefined ? { details: error.details } : {}),
        });
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return errorResponse("transport.transient_failure", errorMessage);
    }
  }

  async #handleCliThinkingLevelsList(message: NativeMessage): Promise<NativeMessage> {
    const cliType =
      typeof message["cliType"] === "string" && message["cliType"].trim().length > 0
        ? message["cliType"]
        : "copilot-cli";
    const modelId =
      typeof message["modelId"] === "string" ? message["modelId"].trim() : "";
    if (modelId.length === 0) {
      return errorResponse(
        "request.invalid",
        "cli.thinking-levels.list requires a non-empty modelId.",
      );
    }

    try {
      const result = await this.#cliChatExecutor.listThinkingLevels({
        cliType,
        modelId,
      });
      return {
        type: "cli.thinking-levels.list",
        cliType: result.cliType,
        modelId: result.modelId,
        source: result.source,
        thinkingLevels: result.thinkingLevels,
      };
    } catch (error) {
      if (error instanceof CliChatExecutionError) {
        return errorResponse(error.reasonCode, error.message, {
          ...(error.details !== undefined ? { details: error.details } : {}),
        });
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return errorResponse("transport.transient_failure", errorMessage);
    }
  }

  async #handleCliChatExecute(message: NativeMessage, writer?: NativeStreamWriter): Promise<NativeMessage> {
    const correlationId =
      typeof message["correlationId"] === "string"
        ? message["correlationId"]
        : undefined;
    const providerId =
      typeof message["providerId"] === "string" ? message["providerId"] : undefined;
    const modelId =
      typeof message["modelId"] === "string" ? message["modelId"] : undefined;
    const sessionId =
      typeof message["sessionId"] === "string" && message["sessionId"].trim().length > 0
        ? message["sessionId"]
        : undefined;
    const timeoutMs =
      typeof message["timeoutMs"] === "number" &&
        Number.isFinite(message["timeoutMs"])
        ? message["timeoutMs"]
        : undefined;
    const cliType =
      typeof message["cliType"] === "string" && message["cliType"].trim().length > 0
        ? message["cliType"]
        : undefined;
    const thinkingLevel =
      typeof message["thinkingLevel"] === "string" &&
        message["thinkingLevel"].trim().length > 0
        ? message["thinkingLevel"]
        : undefined;
    const resumeSessionId =
      typeof message["resumeSessionId"] === "string" &&
        message["resumeSessionId"].trim().length > 0
        ? message["resumeSessionId"]
        : undefined;
    const streamRequested =
      message["streamRequested"] === true || message["stream"] === true;

    const rawMessages = Array.isArray(message["messages"]) ? message["messages"] : undefined;
    if (
      correlationId === undefined ||
      correlationId.trim().length === 0 ||
      providerId === undefined ||
      providerId.trim().length === 0 ||
      modelId === undefined ||
      modelId.trim().length === 0 ||
      rawMessages === undefined
    ) {
      return errorResponse(
        "request.invalid",
        "cli.chat.execute requires non-empty correlationId, providerId, modelId, and messages array.",
        {
          ...(correlationId !== undefined ? { correlationId } : {}),
        },
      );
    }

    const messages: CliChatMessage[] = [];
    for (const entry of rawMessages) {
      if (
        !isRecord(entry) ||
        (entry["role"] !== "system" &&
          entry["role"] !== "user" &&
          entry["role"] !== "assistant") ||
        typeof entry["content"] !== "string" ||
        entry["content"].trim().length === 0
      ) {
        return errorResponse("request.invalid", "cli.chat.execute contains an invalid message.", {
          correlationId,
        });
      }
      messages.push({
        role: entry["role"],
        content: entry["content"],
      });
    }

    try {
      const executionResult = await this.#cliChatExecutor.execute({
        correlationId,
        providerId,
        modelId,
        ...(sessionId !== undefined ? { sessionId } : {}),
        ...(resumeSessionId !== undefined ? { resumeSessionId } : {}),
        ...(cliType !== undefined ? { cliType } : {}),
        ...(thinkingLevel !== undefined ? { thinkingLevel } : {}),
        messages,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      });
      // When streaming is requested and the writer is available, send the
      // content back as word-boundary chunks before the terminal response.
      // The CLI executor does not support real-time chunking; this provides
      // progressive display after the full execution completes.
      if (streamRequested && writer !== undefined && executionResult.content.length > 0) {
        const words = executionResult.content.split(/(?<=\s)/);
        for (const word of words) {
          if (word.length > 0) {
            void writer({
              type: "cli.chat.stream.chunk",
              correlationId: executionResult.correlationId,
              delta: word,
            });
          }
        }
      }
      return {
        type: "cli.chat.result",
        correlationId: executionResult.correlationId,
        providerId: executionResult.providerId,
        modelId: executionResult.modelId,
        content: executionResult.content,
        ...(executionResult.cliSessionId !== undefined
          ? { cliSessionId: executionResult.cliSessionId }
          : {}),
      };
    } catch (error) {
      if (error instanceof CliChatExecutionError) {
        return errorResponse(error.reasonCode, error.message, {
          correlationId,
          ...(error.details !== undefined ? { details: error.details } : {}),
        });
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return errorResponse("transport.transient_failure", errorMessage, {
        correlationId,
      });
    }
  }

  #parseCloudProviderMethod(message: NativeMessage): Readonly<{
    providerId: string | undefined;
    methodId: string | undefined;
  }> {
    return {
      providerId: normalizeOptionalNonEmptyString(message["providerId"]),
      methodId: normalizeOptionalNonEmptyString(message["methodId"]),
    };
  }

  #cloudExecutionDenied(
    methodId: string | undefined,
    options: Readonly<{ correlationId?: string }> = {},
  ): NativeMessage {
    const message =
      methodId === undefined
        ? "Cloud execution requires a non-empty methodId."
        : `Cloud execution for method "${methodId}" is disabled by policy.`;
    return errorResponse("policy.denied", message, {
      ...(options.correlationId !== undefined
        ? { correlationId: options.correlationId }
        : {}),
    });
  }

  #isCloudExecutionAllowed(
    methodId: string | undefined,
    context: Readonly<{ extensionId?: string; origin?: string }> = {},
  ): boolean {
    return isCloudExecutionEnabled(this.#cloudFeatureFlags, methodId, context);
  }

  #cloudErrorResponse(
    error: unknown,
    options: Readonly<{ correlationId?: string; fallbackMessage: string }>,
  ): NativeMessage {
    const reasonCode =
      isRecord(error) && typeof error["reasonCode"] === "string"
        ? error["reasonCode"]
        : "transport.transient_failure";
    const safeError = toSafeUserError({
      providerError: error,
      reasonCode,
      fallbackMessage: options.fallbackMessage,
    });
    const details = isRecord(error) ? toErrorDetails(redactProviderPayload(error)) : undefined;
    return errorResponse(safeError.reasonCode, safeError.message, {
      ...(options.correlationId !== undefined
        ? { correlationId: options.correlationId }
        : {}),
      ...(details !== undefined ? { details } : {}),
    });
  }

  async #handleCloudConnectionBegin(message: NativeMessage): Promise<NativeMessage> {
    const { providerId, methodId } = this.#parseCloudProviderMethod(message);
    const extensionId = normalizeOptionalNonEmptyString(message["extensionId"]);
    const origin = normalizeOptionalNonEmptyString(message["origin"]);
    if (providerId === undefined || methodId === undefined) {
      return errorResponse(
        "request.invalid",
        "cloud.connection.begin requires non-empty providerId and methodId.",
      );
    }
    if (
      !this.#isCloudExecutionAllowed(methodId, {
        ...(extensionId !== undefined ? { extensionId } : {}),
        ...(origin !== undefined ? { origin } : {}),
      })
    ) {
      return this.#cloudExecutionDenied(methodId);
    }

    try {
      const result = await this.#cloudConnectionService.beginConnection({
        ...message,
        providerId,
        methodId,
      });
      return {
        type: "cloud.connection.begin",
        ...result,
        providerId,
        methodId,
      };
    } catch (error) {
      return this.#cloudErrorResponse(error, {
        fallbackMessage: "Cloud connection begin failed.",
      });
    }
  }

  async #handleCloudConnectionComplete(message: NativeMessage): Promise<NativeMessage> {
    const { providerId, methodId } = this.#parseCloudProviderMethod(message);
    const extensionId = normalizeOptionalNonEmptyString(message["extensionId"]);
    const origin = normalizeOptionalNonEmptyString(message["origin"]);
    const policyVersion = normalizeOptionalNonEmptyString(message["policyVersion"]);
    const endpointProfileHash = normalizeOptionalNonEmptyString(
      message["endpointProfileHash"],
    );
    if (providerId === undefined || methodId === undefined) {
      return errorResponse(
        "request.invalid",
        "cloud.connection.complete requires non-empty providerId and methodId.",
      );
    }
    if (
      !this.#isCloudExecutionAllowed(methodId, {
        ...(extensionId !== undefined ? { extensionId } : {}),
        ...(origin !== undefined ? { origin } : {}),
      })
    ) {
      return this.#cloudExecutionDenied(methodId);
    }
    if (
      extensionId === undefined ||
      origin === undefined ||
      policyVersion === undefined
    ) {
      return errorResponse(
        "request.invalid",
        "cloud.connection.complete requires non-empty extensionId, origin, and policyVersion.",
      );
    }

    const completionRequest: {
      providerId: string;
      methodId: string;
      extensionId: string;
      origin: string;
      policyVersion: string;
      endpointProfileHash?: string;
      [key: string]: unknown;
    } = {
      providerId,
      methodId,
      extensionId,
      origin,
      policyVersion,
    };
    if (endpointProfileHash !== undefined) {
      completionRequest["endpointProfileHash"] = endpointProfileHash;
    }
    for (const [key, value] of Object.entries(message)) {
      if (
        key !== "providerId" &&
        key !== "methodId" &&
        key !== "extensionId" &&
        key !== "origin" &&
        key !== "policyVersion" &&
        key !== "endpointProfileHash" &&
        key !== "correlationId" &&
        key !== "type"
      ) {
        completionRequest[key] = value;
      }
    }

    const identityKey = [
      this.#cloudConnectionCompleteIdempotencyNamespace,
      extensionId,
      origin,
      policyVersion,
      providerId,
      methodId,
    ].join("\u0000");
    const fingerprint = toRequestFingerprint(completionRequest);

    let reservation: IdempotencyReservation;
    try {
      const decision = this.#requestIdempotencyStore.reserve({
        scope: "cloud.connection.complete",
        identityKey,
        fingerprint,
      });
      if (decision.kind === "replay") {
        if (!isRecord(decision.response) || !isCloudConnectionCompleteReplay(decision.response)) {
          return errorResponse(
            "transport.transient_failure",
            "Idempotency replay payload is invalid for cloud.connection.complete.",
          );
        }
        return decision.response;
      }
      if (decision.kind === "conflict") {
        return errorResponse("request.replay_prone", decision.message);
      }
      reservation = decision.reservation;
    } catch (error) {
      if (error instanceof IdempotencyStoreError) {
        return errorResponse(error.reasonCode, error.message);
      }
      return errorResponse(
        "transport.transient_failure",
        "Failed to enforce request idempotency for cloud connection completion.",
      );
    }

    try {
      const result = await this.#cloudConnectionService.completeConnection(completionRequest);
      const response = {
        type: "cloud.connection.complete",
        ...result,
        providerId,
        methodId,
      };
      this.#requestIdempotencyStore.complete(reservation, response);
      return response;
    } catch (error) {
      this.#requestIdempotencyStore.abort(reservation);
      return this.#cloudErrorResponse(error, {
        fallbackMessage: "Cloud connection completion failed.",
      });
    }
  }

  async #handleCloudConnectionValidate(message: NativeMessage): Promise<NativeMessage> {
    const { providerId, methodId } = this.#parseCloudProviderMethod(message);
    const extensionId = normalizeOptionalNonEmptyString(message["extensionId"]);
    const origin = normalizeOptionalNonEmptyString(message["origin"]);
    if (providerId === undefined || methodId === undefined) {
      return errorResponse(
        "request.invalid",
        "cloud.connection.validate requires non-empty providerId and methodId.",
      );
    }
    if (
      !this.#isCloudExecutionAllowed(methodId, {
        ...(extensionId !== undefined ? { extensionId } : {}),
        ...(origin !== undefined ? { origin } : {}),
      })
    ) {
      return this.#cloudExecutionDenied(methodId);
    }

    try {
      const result = await this.#cloudConnectionService.validateConnection({
        ...message,
        providerId,
        methodId,
      });
      return {
        type: "cloud.connection.validate",
        ...result,
        providerId,
        methodId,
      };
    } catch (error) {
      return this.#cloudErrorResponse(error, {
        fallbackMessage: "Cloud connection validation failed.",
      });
    }
  }

  async #handleCloudConnectionRevoke(message: NativeMessage): Promise<NativeMessage> {
    const { providerId, methodId } = this.#parseCloudProviderMethod(message);
    const extensionId = normalizeOptionalNonEmptyString(message["extensionId"]);
    const origin = normalizeOptionalNonEmptyString(message["origin"]);
    if (providerId === undefined || methodId === undefined) {
      return errorResponse(
        "request.invalid",
        "cloud.connection.revoke requires non-empty providerId and methodId.",
      );
    }
    if (
      !this.#isCloudExecutionAllowed(methodId, {
        ...(extensionId !== undefined ? { extensionId } : {}),
        ...(origin !== undefined ? { origin } : {}),
      })
    ) {
      return this.#cloudExecutionDenied(methodId);
    }

    try {
      const result = await this.#cloudConnectionService.revokeConnection({
        ...message,
        providerId,
        methodId,
      });
      return {
        type: "cloud.connection.revoke",
        ...result,
        providerId,
        methodId,
      };
    } catch (error) {
      return this.#cloudErrorResponse(error, {
        fallbackMessage: "Cloud connection revocation failed.",
      });
    }
  }

  async #handleCloudModelsDiscover(message: NativeMessage): Promise<NativeMessage> {
    const { providerId, methodId } = this.#parseCloudProviderMethod(message);
    const extensionId = normalizeOptionalNonEmptyString(message["extensionId"]);
    const origin = normalizeOptionalNonEmptyString(message["origin"]);
    if (providerId === undefined || methodId === undefined) {
      return errorResponse(
        "request.invalid",
        "cloud.models.discover requires non-empty providerId and methodId.",
      );
    }
    if (
      !this.#isCloudExecutionAllowed(methodId, {
        ...(extensionId !== undefined ? { extensionId } : {}),
        ...(origin !== undefined ? { origin } : {}),
      })
    ) {
      return this.#cloudExecutionDenied(methodId);
    }

    try {
      const result = await this.#cloudConnectionService.discoverModels({
        ...message,
        providerId,
        methodId,
      });
      return {
        type: "cloud.models.discover",
        ...result,
        providerId,
      };
    } catch (error) {
      return this.#cloudErrorResponse(error, {
        fallbackMessage: "Cloud model discovery failed.",
      });
    }
  }

  async #handleCloudCapabilitiesDiscover(message: NativeMessage): Promise<NativeMessage> {
    const { providerId, methodId } = this.#parseCloudProviderMethod(message);
    const extensionId = normalizeOptionalNonEmptyString(message["extensionId"]);
    const origin = normalizeOptionalNonEmptyString(message["origin"]);
    if (providerId === undefined || methodId === undefined) {
      return errorResponse(
        "request.invalid",
        "cloud.capabilities.discover requires non-empty providerId and methodId.",
      );
    }
    if (
      !this.#isCloudExecutionAllowed(methodId, {
        ...(extensionId !== undefined ? { extensionId } : {}),
        ...(origin !== undefined ? { origin } : {}),
      })
    ) {
      return this.#cloudExecutionDenied(methodId);
    }

    try {
      const result = await this.#cloudConnectionService.discoverCapabilities({
        ...message,
        providerId,
        methodId,
      });
      return {
        type: "cloud.capabilities.discover",
        ...result,
        providerId,
      };
    } catch (error) {
      return this.#cloudErrorResponse(error, {
        fallbackMessage: "Cloud capability discovery failed.",
      });
    }
  }

  async #handleCloudDiscoveryRefresh(message: NativeMessage): Promise<NativeMessage> {
    const { providerId, methodId } = this.#parseCloudProviderMethod(message);
    const extensionId = normalizeOptionalNonEmptyString(message["extensionId"]);
    const origin = normalizeOptionalNonEmptyString(message["origin"]);
    if (providerId === undefined || methodId === undefined) {
      return errorResponse(
        "request.invalid",
        "cloud.discovery.refresh requires non-empty providerId and methodId.",
      );
    }
    if (
      !this.#isCloudExecutionAllowed(methodId, {
        ...(extensionId !== undefined ? { extensionId } : {}),
        ...(origin !== undefined ? { origin } : {}),
      })
    ) {
      return this.#cloudExecutionDenied(methodId);
    }

    try {
      const result = await this.#cloudConnectionService.refreshDiscovery({
        ...message,
        providerId,
        methodId,
      });
      return {
        type: "cloud.discovery.refresh",
        ...result,
        providerId,
      };
    } catch (error) {
      return this.#cloudErrorResponse(error, {
        fallbackMessage: "Cloud discovery refresh failed.",
      });
    }
  }

  async #handleCloudChatExecute(message: NativeMessage, writer?: NativeStreamWriter): Promise<NativeMessage> {
    const correlationId = normalizeOptionalNonEmptyString(message["correlationId"]);
    const tenantId = normalizeOptionalNonEmptyString(message["tenantId"]);
    const origin = normalizeOptionalNonEmptyString(message["origin"]);
    const providerId = normalizeOptionalNonEmptyString(message["providerId"]);
    const methodId = normalizeOptionalNonEmptyString(message["methodId"]);
    const modelId = normalizeOptionalNonEmptyString(message["modelId"]);
    const connectionHandle = normalizeOptionalNonEmptyString(message["connectionHandle"]);
    const region = normalizeOptionalNonEmptyString(message["region"]);
    const extensionId = normalizeOptionalNonEmptyString(message["extensionId"]);
    const handshakeSessionToken =
      normalizeOptionalNonEmptyString(message["handshakeSessionToken"]) ??
      normalizeOptionalNonEmptyString(message["sessionToken"]);
    const requestProof = message["requestProof"];
    const policyVersionFromMessage = normalizeOptionalNonEmptyString(
      message["policyVersion"],
    );
    const endpointProfileHashFromMessage = normalizeOptionalNonEmptyString(
      message["endpointProfileHash"],
    );
    const timeoutMs =
      typeof message["timeoutMs"] === "number" && Number.isFinite(message["timeoutMs"])
        ? Math.max(1, Math.floor(message["timeoutMs"]))
        : undefined;
    const streamRequested =
      message["streamRequested"] === true || message["stream"] === true;
    const signal = message["signal"] instanceof AbortSignal ? message["signal"] : undefined;

    const rawMessages = Array.isArray(message["messages"]) ? message["messages"] : undefined;
    if (
      correlationId === undefined ||
      tenantId === undefined ||
      origin === undefined ||
      providerId === undefined ||
      methodId === undefined ||
      modelId === undefined ||
      connectionHandle === undefined ||
      rawMessages === undefined
    ) {
      return errorResponse(
        "request.invalid",
        "cloud.chat.execute requires non-empty correlationId, tenantId, origin, providerId, methodId, modelId, connectionHandle, and messages array.",
        {
          ...(correlationId !== undefined ? { correlationId } : {}),
        },
      );
    }

    if (
      !this.#isCloudExecutionAllowed(methodId, {
        ...(extensionId !== undefined ? { extensionId } : {}),
        origin,
      })
    ) {
      return this.#cloudExecutionDenied(methodId, { correlationId });
    }

    if (this.#cloudChatExecutor === undefined) {
      return errorResponse(
        "provider.unavailable",
        "Cloud chat executor is unavailable.",
        {
          correlationId,
        },
      );
    }

    const messages: Array<Readonly<{ role: "system" | "user" | "assistant"; content: string }>> =
      [];
    for (const entry of rawMessages) {
      if (
        !isRecord(entry) ||
        (entry["role"] !== "system" &&
          entry["role"] !== "user" &&
          entry["role"] !== "assistant") ||
        typeof entry["content"] !== "string" ||
        entry["content"].trim().length === 0
      ) {
        return errorResponse(
          "request.invalid",
          "cloud.chat.execute contains an invalid message.",
          {
            correlationId,
          },
        );
      }
      messages.push({
        role: entry["role"],
        content: entry["content"],
      });
    }

    if (
      handshakeSessionToken === undefined ||
      extensionId === undefined ||
      !isRecord(requestProof)
    ) {
      return errorResponse(
        "request.invalid",
        "cloud.chat.execute requires non-empty handshakeSessionToken, extensionId, and requestProof.",
        { correlationId },
      );
    }

    let policyVersion = policyVersionFromMessage;
    let endpointProfileHash = endpointProfileHashFromMessage;
    const proofRequestId = normalizeOptionalNonEmptyString(requestProof["requestId"]);
    const proofNonce = normalizeOptionalNonEmptyString(requestProof["nonce"]);
    if (proofRequestId === undefined || proofNonce === undefined) {
      return errorResponse(
        "request.invalid",
        "cloud.chat.execute requestProof requires non-empty requestId and nonce.",
        { correlationId },
      );
    }

    const issuedAt = new Date();
    const proofVerification = this.#requestVerifier.verifyWithProof(
      {
        protocolVersion: "1.0.0",
        requestId: proofRequestId,
        correlationId,
        origin,
        sessionId: tenantId,
        capability: "chat.completions",
        providerId,
        modelId,
        issuedAt: issuedAt.toISOString(),
        expiresAt: new Date(issuedAt.getTime() + 60_000).toISOString(),
        nonce: proofNonce,
        payload: {
          messages,
          modelId,
        },
      },
      {
        sessionToken: handshakeSessionToken,
        proof: requestProof,
        connectionHandle: {
          connectionHandle,
          providerId,
          methodId,
          extensionId,
          origin,
          ...(policyVersion !== undefined ? { policyVersion } : {}),
          ...(endpointProfileHash !== undefined ? { endpointProfileHash } : {}),
        },
        extensionId,
        origin,
        ...(policyVersion !== undefined ? { policyVersion } : {}),
        ...(endpointProfileHash !== undefined ? { endpointProfileHash } : {}),
        allowConsumedNonce: true,
      },
    );
    if (!proofVerification.ok) {
      return errorResponse(proofVerification.error.reasonCode, proofVerification.error.message, {
        correlationId,
      });
    }

    if (policyVersion === undefined || endpointProfileHash === undefined) {
      try {
        const resolvedBinding =
          await this.#cloudConnectionService.resolveConnectionBinding({
            providerId,
            methodId,
            connectionHandle,
            extensionId,
            origin,
            ...(policyVersion !== undefined ? { policyVersion } : {}),
            ...(endpointProfileHash !== undefined ? { endpointProfileHash } : {}),
          });
        policyVersion = normalizeOptionalNonEmptyString(
          resolvedBinding.policyVersion,
        );
        endpointProfileHash = normalizeOptionalNonEmptyString(
          resolvedBinding.endpointProfileHash,
        );
      } catch (error) {
        return this.#cloudErrorResponse(error, {
          correlationId,
          fallbackMessage:
            "cloud.chat.execute requires non-empty policyVersion and endpointProfileHash.",
        });
      }
    }
    if (policyVersion === undefined || endpointProfileHash === undefined) {
      return errorResponse(
        "request.invalid",
        "cloud.chat.execute requires non-empty policyVersion and endpointProfileHash.",
        { correlationId },
      );
    }

    const chatIdentityKey = [
      extensionId,
      providerId,
      methodId,
      proofRequestId,
      proofNonce,
    ].join("\u0000");
    const chatFingerprint = toRequestFingerprint({
      requestId: proofRequestId,
      nonce: proofNonce,
      tenantId,
      origin,
      extensionId,
      providerId,
      methodId,
      modelId,
      connectionHandle,
      policyVersion,
      endpointProfileHash,
      streamRequested,
      timeoutMs: timeoutMs ?? null,
      messages,
    });

    let reservation: IdempotencyReservation;
    try {
      const decision = this.#requestIdempotencyStore.reserve({
        scope: "cloud.chat.execute",
        identityKey: chatIdentityKey,
        fingerprint: chatFingerprint,
      });
      if (decision.kind === "replay") {
        if (!isRecord(decision.response) || !isCloudChatReplay(decision.response)) {
          return errorResponse(
            "transport.transient_failure",
            "Idempotency replay payload is invalid for cloud.chat.execute.",
            {
              correlationId,
            },
          );
        }
        return decision.response;
      }
      if (decision.kind === "conflict") {
        return errorResponse("request.replay_prone", decision.message, {
          correlationId,
        });
      }
      reservation = decision.reservation;
    } catch (error) {
      if (error instanceof IdempotencyStoreError) {
        return errorResponse(error.reasonCode, error.message, {
          correlationId,
        });
      }
      return errorResponse(
        "transport.transient_failure",
        "Failed to enforce request idempotency for cloud chat execution.",
        {
          correlationId,
        },
      );
    }

    try {
      const result = await this.#cloudChatExecutor.execute({
        correlationId,
        tenantId,
        origin,
        extensionId,
        providerId,
        methodId,
        modelId,
        connectionHandle,
        messages,
        policyVersion,
        endpointProfileHash,
        streamRequested,
        ...(region !== undefined ? { region } : {}),
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        ...(signal !== undefined ? { signal } : {}),
        ...(streamRequested && writer !== undefined
          ? {
            onChunk: (chunk: string) => {
              void writer({
                type: "cloud.chat.stream.chunk",
                correlationId: correlationId ?? "",
                delta: chunk,
              });
            },
          }
          : {}),
      });
      const response = {
        type: "cloud.chat.result",
        correlationId: result.correlationId,
        providerId: result.providerId,
        methodId: result.methodId,
        modelId: result.modelId,
        region: result.region,
        content: result.content,
      };
      this.#requestIdempotencyStore.complete(reservation, response);
      return response;
    } catch (error) {
      this.#requestIdempotencyStore.abort(reservation);
      return this.#cloudErrorResponse(error, {
        correlationId,
        fallbackMessage: "Cloud chat execution failed.",
      });
    }
  }
}
