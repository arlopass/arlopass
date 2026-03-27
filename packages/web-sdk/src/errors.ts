import {
  PROTOCOL_MACHINE_CODES,
  ProtocolError,
  normalizeReasonCode,
  type ProtocolReasonCode,
} from "@arlopass/protocol";

import type { TransportErrorLike } from "./types.js";

export const SDK_MACHINE_CODES = {
  INVALID_STATE_TRANSITION: "ARLOPASS_SDK_INVALID_STATE_TRANSITION",
  INVALID_STATE_OPERATION: "ARLOPASS_SDK_INVALID_STATE_OPERATION",
  MISSING_PROVIDER_SELECTION: "ARLOPASS_SDK_MISSING_PROVIDER_SELECTION",
  PROTOCOL_VIOLATION: "ARLOPASS_SDK_PROTOCOL_VIOLATION",
  TRANSPORT_ERROR: "ARLOPASS_SDK_TRANSPORT_ERROR",
} as const;

export type SDKMachineCode =
  | (typeof SDK_MACHINE_CODES)[keyof typeof SDK_MACHINE_CODES]
  | typeof PROTOCOL_MACHINE_CODES.TIMEOUT
  | typeof PROTOCOL_MACHINE_CODES.INVALID_ENVELOPE
  | typeof PROTOCOL_MACHINE_CODES.MISSING_REQUIRED_FIELD
  | typeof PROTOCOL_MACHINE_CODES.ENVELOPE_EXPIRED
  | typeof PROTOCOL_MACHINE_CODES.REPLAY_PRONE_METADATA
  | typeof PROTOCOL_MACHINE_CODES.UNSUPPORTED_PROTOCOL_VERSION
  | typeof PROTOCOL_MACHINE_CODES.UNSUPPORTED_CAPABILITY
  | typeof PROTOCOL_MACHINE_CODES.PROVIDER_UNAVAILABLE
  | typeof PROTOCOL_MACHINE_CODES.TRANSIENT_NETWORK
  | typeof PROTOCOL_MACHINE_CODES.AUTH_FAILED
  | typeof PROTOCOL_MACHINE_CODES.PERMISSION_DENIED
  | typeof PROTOCOL_MACHINE_CODES.POLICY_VIOLATION;

type SDKErrorDetails = Readonly<Record<string, string | number | boolean | null>>;

export type SDKErrorOptions = Readonly<{
  machineCode: SDKMachineCode;
  reasonCode: ProtocolReasonCode;
  retryable: boolean;
  correlationId?: string | undefined;
  details?: SDKErrorDetails | undefined;
  cause?: Error | undefined;
}>;

type SharedSDKErrorOptions = Readonly<{
  reasonCode?: ProtocolReasonCode | undefined;
  retryable?: boolean | undefined;
  correlationId?: string | undefined;
  details?: SDKErrorDetails | undefined;
  cause?: Error | undefined;
}>;

export type SDKErrorFallback = Readonly<{
  message: string;
  machineCode: SDKMachineCode;
  reasonCode: ProtocolReasonCode;
  retryable: boolean;
  correlationId?: string | undefined;
  details?: SDKErrorDetails | undefined;
}>;

export class ArlopassSDKError extends Error {
  readonly machineCode: SDKMachineCode;
  readonly reasonCode: ProtocolReasonCode;
  readonly retryable: boolean;
  readonly correlationId: string | undefined;
  readonly details: SDKErrorDetails | undefined;

  constructor(message: string, options: SDKErrorOptions) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.machineCode = options.machineCode;
    this.reasonCode = options.reasonCode;
    this.retryable = options.retryable;
    this.correlationId = options.correlationId;
    this.details = options.details;
  }
}

export class ArlopassStateError extends ArlopassSDKError {
  constructor(message: string, options: SharedSDKErrorOptions = {}) {
    super(message, {
      machineCode: SDK_MACHINE_CODES.INVALID_STATE_OPERATION,
      reasonCode: options.reasonCode ?? "request.invalid",
      retryable: options.retryable ?? false,
      correlationId: options.correlationId,
      details: options.details,
      cause: options.cause,
    });
  }
}

export class ArlopassInvalidStateTransitionError extends ArlopassSDKError {
  constructor(message: string, options: SharedSDKErrorOptions = {}) {
    super(message, {
      machineCode: SDK_MACHINE_CODES.INVALID_STATE_TRANSITION,
      reasonCode: options.reasonCode ?? "request.invalid",
      retryable: options.retryable ?? false,
      correlationId: options.correlationId,
      details: options.details,
      cause: options.cause,
    });
  }
}

type ProtocolBoundaryOptions = SharedSDKErrorOptions &
  Readonly<{ machineCode?: SDKMachineCode | undefined }>;

export class ArlopassProtocolBoundaryError extends ArlopassSDKError {
  constructor(message: string, options: ProtocolBoundaryOptions = {}) {
    super(message, {
      machineCode: options.machineCode ?? SDK_MACHINE_CODES.PROTOCOL_VIOLATION,
      reasonCode: options.reasonCode ?? "protocol.invalid_envelope",
      retryable: options.retryable ?? false,
      correlationId: options.correlationId,
      details: options.details,
      cause: options.cause,
    });
  }
}

export class ArlopassTransportError extends ArlopassSDKError {
  constructor(message: string, options: SharedSDKErrorOptions = {}) {
    super(message, {
      machineCode: SDK_MACHINE_CODES.TRANSPORT_ERROR,
      reasonCode: options.reasonCode ?? "transport.transient_failure",
      retryable: options.retryable ?? true,
      correlationId: options.correlationId,
      details: options.details,
      cause: options.cause,
    });
  }
}

export class ArlopassTimeoutError extends ArlopassSDKError {
  constructor(message: string, options: SharedSDKErrorOptions = {}) {
    super(message, {
      machineCode: PROTOCOL_MACHINE_CODES.TIMEOUT,
      reasonCode: options.reasonCode ?? "transport.timeout",
      retryable: options.retryable ?? true,
      correlationId: options.correlationId,
      details: options.details,
      cause: options.cause,
    });
  }
}

function toDetails(
  value: unknown,
): Readonly<Record<string, string | number | boolean | null>> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const details: Record<string, string | number | boolean | null> = {};
  for (const [key, detailValue] of Object.entries(value)) {
    if (
      typeof detailValue === "string" ||
      typeof detailValue === "number" ||
      typeof detailValue === "boolean" ||
      detailValue === null
    ) {
      details[key] = detailValue;
    }
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTransportLikeError(error: unknown): TransportErrorLike | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const message = typeof error.message === "string" ? error.message : undefined;
  const machineCode =
    typeof error.machineCode === "string" ? error.machineCode : undefined;
  const reasonCode =
    typeof error.reasonCode === "string" ? error.reasonCode : undefined;
  const retryable =
    typeof error.retryable === "boolean" ? error.retryable : undefined;
  const correlationId =
    typeof error.correlationId === "string" ? error.correlationId : undefined;
  const details = toDetails(error.details);

  return {
    ...(message !== undefined ? { message } : {}),
    ...(machineCode !== undefined ? { machineCode } : {}),
    ...(reasonCode !== undefined ? { reasonCode } : {}),
    ...(retryable !== undefined ? { retryable } : {}),
    ...(correlationId !== undefined ? { correlationId } : {}),
    ...(details !== undefined ? { details } : {}),
    cause: error.cause,
  };
}

function castMachineCode(value: string): SDKMachineCode {
  return value as SDKMachineCode;
}

function isTimeoutShape(value: {
  reasonCode?: string;
  machineCode?: string;
  message?: string;
}): boolean {
  const reasonCode = value.reasonCode ? normalizeReasonCode(value.reasonCode) : undefined;
  if (reasonCode === "transport.timeout") {
    return true;
  }

  if (value.machineCode === PROTOCOL_MACHINE_CODES.TIMEOUT) {
    return true;
  }

  return value.message?.toLowerCase().includes("timeout") ?? false;
}

function normalizeUnknownCause(cause: unknown): Error | undefined {
  if (cause instanceof Error) {
    return cause;
  }

  if (cause === undefined || cause === null) {
    return undefined;
  }

  return new Error(String(cause));
}

export function normalizeSDKError(
  error: unknown,
  fallback: SDKErrorFallback,
): ArlopassSDKError {
  if (error instanceof ArlopassSDKError) {
    return error;
  }

  if (error instanceof ProtocolError) {
    if (isTimeoutShape(error)) {
      return new ArlopassTimeoutError(error.message, {
        reasonCode: error.reasonCode,
        retryable: error.retryable,
        correlationId: error.correlationId ?? fallback.correlationId,
        details: error.details,
        cause: error,
      });
    }

    return new ArlopassProtocolBoundaryError(error.message, {
      machineCode: castMachineCode(error.machineCode),
      reasonCode: error.reasonCode,
      retryable: error.retryable,
      correlationId: error.correlationId ?? fallback.correlationId,
      details: error.details,
      cause: error,
    });
  }

  const transportLike = readTransportLikeError(error);
  if (transportLike !== undefined) {
    const reasonCode = normalizeReasonCode(transportLike.reasonCode ?? fallback.reasonCode);
    const message = transportLike.message ?? fallback.message;
    const retryable = transportLike.retryable ?? fallback.retryable;
    const correlationId = transportLike.correlationId ?? fallback.correlationId;

    if (isTimeoutShape(transportLike)) {
      return new ArlopassTimeoutError(message, {
        reasonCode,
        retryable,
        correlationId,
        details: transportLike.details ?? fallback.details,
        cause: normalizeUnknownCause(transportLike.cause),
      });
    }

    return new ArlopassTransportError(message, {
      reasonCode,
      retryable,
      correlationId,
      details: transportLike.details ?? fallback.details,
      cause: normalizeUnknownCause(transportLike.cause),
    });
  }

  if (error instanceof Error) {
    if (isTimeoutShape(error)) {
      return new ArlopassTimeoutError(error.message, {
        reasonCode: fallback.reasonCode,
        retryable: fallback.retryable,
        correlationId: fallback.correlationId,
        details: fallback.details,
        cause: error,
      });
    }

    return new ArlopassTransportError(error.message, {
      reasonCode: fallback.reasonCode,
      retryable: fallback.retryable,
      correlationId: fallback.correlationId,
      details: fallback.details,
      cause: error,
    });
  }

  return new ArlopassSDKError(fallback.message, {
    machineCode: fallback.machineCode,
    reasonCode: fallback.reasonCode,
    retryable: fallback.retryable,
    correlationId: fallback.correlationId,
    details: fallback.details,
  });
}
