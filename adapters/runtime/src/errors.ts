export const RUNTIME_ERROR_CODES = {
  MANIFEST_INVALID_INPUT: "ADAPTER_MANIFEST_INVALID_INPUT",
  MANIFEST_MISSING_FIELD: "ADAPTER_MANIFEST_MISSING_FIELD",
  MANIFEST_INVALID_FIELD: "ADAPTER_MANIFEST_INVALID_FIELD",
  MANIFEST_UNSUPPORTED_AUTH_TYPE: "ADAPTER_MANIFEST_UNSUPPORTED_AUTH_TYPE",
  MANIFEST_UNSUPPORTED_CAPABILITY: "ADAPTER_MANIFEST_UNSUPPORTED_CAPABILITY",
  MANIFEST_UNSUPPORTED_RISK_LEVEL: "ADAPTER_MANIFEST_UNSUPPORTED_RISK_LEVEL",
  MANIFEST_UNSUPPORTED_SCHEMA_VERSION: "ADAPTER_MANIFEST_UNSUPPORTED_SCHEMA_VERSION",

  SIGNATURE_KEY_NOT_FOUND: "ADAPTER_SIGNATURE_KEY_NOT_FOUND",
  SIGNATURE_DIGEST_MISMATCH: "ADAPTER_SIGNATURE_DIGEST_MISMATCH",
  SIGNATURE_INVALID: "ADAPTER_SIGNATURE_INVALID",
  SIGNATURE_MISSING: "ADAPTER_SIGNATURE_MISSING",
  SIGNATURE_INVALID_PUBLIC_KEY: "ADAPTER_SIGNATURE_INVALID_PUBLIC_KEY",
  SIGNATURE_ALGORITHM_UNSUPPORTED: "ADAPTER_SIGNATURE_ALGORITHM_UNSUPPORTED",

  SANDBOX_EGRESS_DENIED: "ADAPTER_SANDBOX_EGRESS_DENIED",
  SANDBOX_PERMISSION_DENIED: "ADAPTER_SANDBOX_PERMISSION_DENIED",
  SANDBOX_POLICY_MISSING: "ADAPTER_SANDBOX_POLICY_MISSING",

  LOADER_NOT_FOUND: "ADAPTER_LOADER_NOT_FOUND",
  LOADER_IMPORT_FAILED: "ADAPTER_LOADER_IMPORT_FAILED",
  LOADER_CONTRACT_VIOLATION: "ADAPTER_LOADER_CONTRACT_VIOLATION",
  LOADER_SIGNATURE_REQUIRED: "ADAPTER_LOADER_SIGNATURE_REQUIRED",

  HOST_ALREADY_STARTED: "ADAPTER_HOST_ALREADY_STARTED",
  HOST_NOT_STARTED: "ADAPTER_HOST_NOT_STARTED",
  HOST_SHUTDOWN: "ADAPTER_HOST_SHUTDOWN",
  HOST_HEALTH_TIMEOUT: "ADAPTER_HOST_HEALTH_TIMEOUT",
  HOST_RESTART_LIMIT_EXCEEDED: "ADAPTER_HOST_RESTART_LIMIT_EXCEEDED",
  HOST_LIFECYCLE_ERROR: "ADAPTER_HOST_LIFECYCLE_ERROR",
} as const;

export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[keyof typeof RUNTIME_ERROR_CODES];

export type RuntimeErrorDetails = Readonly<Record<string, string | number | boolean | null>>;

export class RuntimeError extends Error {
  readonly code: RuntimeErrorCode;
  readonly details: RuntimeErrorDetails | undefined;

  constructor(
    message: string,
    options: Readonly<{
      code: RuntimeErrorCode;
      details?: RuntimeErrorDetails;
      cause?: Error;
    }>,
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "RuntimeError";
    this.code = options.code;
    this.details = options.details;
  }
}

export class ManifestValidationError extends RuntimeError {
  readonly field: string | undefined;

  constructor(
    message: string,
    options: Readonly<{
      code: RuntimeErrorCode;
      field?: string;
      details?: RuntimeErrorDetails;
      cause?: Error;
    }>,
  ) {
    super(message, options);
    this.name = "ManifestValidationError";
    this.field = options.field;
  }
}

export class SignatureVerificationError extends RuntimeError {
  constructor(
    message: string,
    options: Readonly<{
      code: RuntimeErrorCode;
      details?: RuntimeErrorDetails;
      cause?: Error;
    }>,
  ) {
    super(message, options);
    this.name = "SignatureVerificationError";
  }
}

export class SandboxViolationError extends RuntimeError {
  constructor(
    message: string,
    options: Readonly<{
      code: RuntimeErrorCode;
      details?: RuntimeErrorDetails;
      cause?: Error;
    }>,
  ) {
    super(message, options);
    this.name = "SandboxViolationError";
  }
}

export class AdapterLoaderError extends RuntimeError {
  constructor(
    message: string,
    options: Readonly<{
      code: RuntimeErrorCode;
      details?: RuntimeErrorDetails;
      cause?: Error;
    }>,
  ) {
    super(message, options);
    this.name = "AdapterLoaderError";
  }
}

export class AdapterHostError extends RuntimeError {
  constructor(
    message: string,
    options: Readonly<{
      code: RuntimeErrorCode;
      details?: RuntimeErrorDetails;
      cause?: Error;
    }>,
  ) {
    super(message, options);
    this.name = "AdapterHostError";
  }
}

export function isRuntimeError(error: unknown): error is RuntimeError {
  return error instanceof RuntimeError;
}
