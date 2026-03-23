import {
  TELEMETRY_METRIC_NAMES,
  TELEMETRY_METRIC_UNITS,
  type TelemetryMetrics,
} from "@byom-ai/telemetry";

import { HandshakeManager } from "./session/handshake.js";
import type { HandshakeChallengeResponse } from "./session/handshake.js";
import { RequestVerifier } from "./session/request-verifier.js";
import { RuntimeEnforcer } from "./permissions/runtime-enforcer.js";
import type { RuntimeGrant } from "./permissions/runtime-enforcer.js";
import type { NativeMessage } from "./native-host.js";

export type BridgeHandlerOptions = Readonly<{
  sharedSecret: Buffer;
  handshakeManager?: HandshakeManager;
  requestVerifier?: RequestVerifier;
  enforcer?: RuntimeEnforcer;
  metrics?: TelemetryMetrics;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorResponse(reasonCode: string, message: string): NativeMessage {
  return { type: "error", reasonCode, message };
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
 *
 * Every failure path produces an explicit { type: "error", reasonCode, message }
 * response — there are no silent fallbacks.
 */
export class BridgeHandler {
  readonly #sharedSecret: Buffer;
  readonly #handshakeManager: HandshakeManager;
  readonly #requestVerifier: RequestVerifier;
  readonly #enforcer: RuntimeEnforcer;
  readonly #metrics: TelemetryMetrics | undefined;

  constructor(options: BridgeHandlerOptions) {
    this.#sharedSecret = options.sharedSecret;
    this.#handshakeManager =
      options.handshakeManager ?? new HandshakeManager();
    this.#requestVerifier =
      options.requestVerifier ?? new RequestVerifier();
    this.#enforcer = options.enforcer ?? new RuntimeEnforcer();
    this.#metrics = options.metrics;
  }

  /**
   * Dispatches a single native message and returns the response.
   * Records request count, duration, and failure metrics when a metrics emitter
   * is provided.
   */
  async handle(message: NativeMessage): Promise<NativeMessage> {
    const startMs = Date.now();
    const messageType =
      typeof message["type"] === "string" ? message["type"] : "unknown";

    let response: NativeMessage;
    try {
      response = await this.#dispatch(message);
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

  async #dispatch(message: NativeMessage): Promise<NativeMessage> {
    switch (message["type"]) {
      case "handshake.challenge":
        return this.#handleHandshakeChallenge();

      case "handshake.verify":
        return this.#handleHandshakeVerify(message);

      case "grant.sync":
        return this.#handleGrantSync(message);

      case "grant.revoke":
        return this.#handleGrantRevoke(message);

      case "request.check":
        return this.#handleRequestCheck(message);

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

    try {
      const session = this.#handshakeManager.verifyResponse(
        response,
        this.#sharedSecret,
      );
      return {
        type: "handshake.session",
        sessionToken: session.sessionToken,
        extensionId: session.extensionId,
        establishedAt: session.establishedAt,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      const reasonCode =
        (error as { reasonCode?: string }).reasonCode ?? "auth.invalid";
      return errorResponse(reasonCode, message);
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
    const { envelope, sessionId } = message;

    const verified = this.#requestVerifier.verify(envelope);
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
}
