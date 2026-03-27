import type { ProtocolReasonCode } from "./reason-codes.js";

export const PROTOCOL_MACHINE_CODES = {
  AUTH_FAILED: "ARLOPASS_AUTH_FAILED",
  PERMISSION_DENIED: "ARLOPASS_PERMISSION_DENIED",
  PROVIDER_UNAVAILABLE: "ARLOPASS_PROVIDER_UNAVAILABLE",
  POLICY_VIOLATION: "ARLOPASS_POLICY_VIOLATION",
  TIMEOUT: "ARLOPASS_TIMEOUT",
  TRANSIENT_NETWORK: "ARLOPASS_TRANSIENT_NETWORK",
  INVALID_ENVELOPE: "ARLOPASS_PROTOCOL_INVALID_ENVELOPE",
  MISSING_REQUIRED_FIELD: "ARLOPASS_PROTOCOL_MISSING_REQUIRED_FIELD",
  ENVELOPE_EXPIRED: "ARLOPASS_PROTOCOL_ENVELOPE_EXPIRED",
  REPLAY_PRONE_METADATA: "ARLOPASS_PROTOCOL_REPLAY_PRONE_METADATA",
  UNSUPPORTED_PROTOCOL_VERSION: "ARLOPASS_PROTOCOL_UNSUPPORTED_VERSION",
  UNSUPPORTED_CAPABILITY: "ARLOPASS_PROTOCOL_UNSUPPORTED_CAPABILITY",
} as const;

export type ProtocolMachineCode =
  (typeof PROTOCOL_MACHINE_CODES)[keyof typeof PROTOCOL_MACHINE_CODES];

export type ProtocolErrorDetailValue = string | number | boolean | null;
export type ProtocolErrorDetails = Readonly<
  Record<string, ProtocolErrorDetailValue>
>;

export type ProtocolErrorOptions = Readonly<{
  machineCode: ProtocolMachineCode;
  reasonCode: ProtocolReasonCode;
  retryable: boolean;
  correlationId?: string;
  details?: ProtocolErrorDetails;
  cause?: Error;
}>;

type SharedErrorOptions = Readonly<{
  correlationId?: string;
  details?: ProtocolErrorDetails;
  cause?: Error;
}>;

export class ProtocolError extends Error {
  readonly machineCode: ProtocolMachineCode;
  readonly reasonCode: ProtocolReasonCode;
  readonly retryable: boolean;
  readonly correlationId: string | undefined;
  readonly details: ProtocolErrorDetails | undefined;

  constructor(message: string, options: ProtocolErrorOptions) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.machineCode = options.machineCode;
    this.reasonCode = options.reasonCode;
    this.retryable = options.retryable;
    this.correlationId = options.correlationId;
    this.details = options.details;
  }
}

export class AuthError extends ProtocolError {
  constructor(message: string, options: SharedErrorOptions = {}) {
    super(message, {
      machineCode: PROTOCOL_MACHINE_CODES.AUTH_FAILED,
      reasonCode: "auth.invalid",
      retryable: false,
      ...options,
    });
  }
}

export class PermissionError extends ProtocolError {
  constructor(message: string, options: SharedErrorOptions = {}) {
    super(message, {
      machineCode: PROTOCOL_MACHINE_CODES.PERMISSION_DENIED,
      reasonCode: "permission.denied",
      retryable: false,
      ...options,
    });
  }
}

export class ProviderUnavailableError extends ProtocolError {
  constructor(message: string, options: SharedErrorOptions = {}) {
    super(message, {
      machineCode: PROTOCOL_MACHINE_CODES.PROVIDER_UNAVAILABLE,
      reasonCode: "provider.unavailable",
      retryable: true,
      ...options,
    });
  }
}

export class PolicyViolationError extends ProtocolError {
  constructor(message: string, options: SharedErrorOptions = {}) {
    super(message, {
      machineCode: PROTOCOL_MACHINE_CODES.POLICY_VIOLATION,
      reasonCode: "policy.denied",
      retryable: false,
      ...options,
    });
  }
}

export class TimeoutError extends ProtocolError {
  constructor(message: string, options: SharedErrorOptions = {}) {
    super(message, {
      machineCode: PROTOCOL_MACHINE_CODES.TIMEOUT,
      reasonCode: "transport.timeout",
      retryable: true,
      ...options,
    });
  }
}

export class TransientNetworkError extends ProtocolError {
  constructor(message: string, options: SharedErrorOptions = {}) {
    super(message, {
      machineCode: PROTOCOL_MACHINE_CODES.TRANSIENT_NETWORK,
      reasonCode: "transport.transient_failure",
      retryable: true,
      ...options,
    });
  }
}

export type EnvelopeValidationErrorOptions = Readonly<{
  machineCode?:
  | typeof PROTOCOL_MACHINE_CODES.INVALID_ENVELOPE
  | typeof PROTOCOL_MACHINE_CODES.MISSING_REQUIRED_FIELD
  | typeof PROTOCOL_MACHINE_CODES.ENVELOPE_EXPIRED
  | typeof PROTOCOL_MACHINE_CODES.REPLAY_PRONE_METADATA
  | typeof PROTOCOL_MACHINE_CODES.UNSUPPORTED_PROTOCOL_VERSION
  | typeof PROTOCOL_MACHINE_CODES.UNSUPPORTED_CAPABILITY;
  reasonCode?: ProtocolReasonCode;
  correlationId?: string;
  details?: ProtocolErrorDetails;
  cause?: Error;
}>;

export class EnvelopeValidationError extends ProtocolError {
  constructor(message: string, options: EnvelopeValidationErrorOptions = {}) {
    super(message, {
      machineCode: options.machineCode ?? PROTOCOL_MACHINE_CODES.INVALID_ENVELOPE,
      reasonCode: options.reasonCode ?? "request.invalid",
      retryable: false,
      ...(options.correlationId !== undefined
        ? { correlationId: options.correlationId }
        : {}),
      ...(options.details !== undefined ? { details: options.details } : {}),
      ...(options.cause !== undefined ? { cause: options.cause } : {}),
    });
  }
}

export class ProtocolVersionError extends ProtocolError {
  constructor(message: string, options: SharedErrorOptions = {}) {
    super(message, {
      machineCode: PROTOCOL_MACHINE_CODES.UNSUPPORTED_PROTOCOL_VERSION,
      reasonCode: "protocol.unsupported_version",
      retryable: false,
      ...options,
    });
  }
}

export function isProtocolError(error: unknown): error is ProtocolError {
  return error instanceof ProtocolError;
}
