import {
  EnvelopeValidationError,
  PROTOCOL_MACHINE_CODES,
  type ProtocolErrorDetails,
} from "./errors.js";

const CONNECTION_HANDLE_PREFIX = "connh.";
const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NON_EMPTY_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;
const NON_NEGATIVE_INTEGER_PATTERN = /^\d+$/;

export type CloudConnectionHandle = Readonly<{
  connectionHandle: string;
  providerId: string;
  methodId: string;
  extensionId: string;
  origin: string;
  bindingEpoch: number;
  signature: string;
}>;

export type CloudRequestProof = Readonly<{
  requestId: string;
  nonce: string;
  origin: string;
  connectionHandle: string;
  payloadHash: string;
  proof: string;
}>;

type ConnectionHandleField =
  | "connectionHandle"
  | "providerId"
  | "methodId"
  | "extensionId"
  | "origin";

type RequestProofField =
  | "requestId"
  | "nonce"
  | "origin"
  | "connectionHandle"
  | "payloadHash"
  | "proof";

type CloudValidationMachineCode =
  | typeof PROTOCOL_MACHINE_CODES.INVALID_ENVELOPE
  | typeof PROTOCOL_MACHINE_CODES.MISSING_REQUIRED_FIELD;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildValidationError(
  message: string,
  options: {
    machineCode?: CloudValidationMachineCode;
    details?: ProtocolErrorDetails;
    cause?: Error;
  } = {},
): EnvelopeValidationError {
  return new EnvelopeValidationError(message, {
    machineCode: options.machineCode ?? PROTOCOL_MACHINE_CODES.INVALID_ENVELOPE,
    reasonCode: "request.invalid",
    ...(options.details !== undefined ? { details: options.details } : {}),
    ...(options.cause !== undefined ? { cause: options.cause } : {}),
  });
}

function assertObjectInput(
  input: unknown,
  context: "CloudConnectionHandle" | "CloudRequestProof",
): asserts input is Record<string, unknown> {
  if (!isRecord(input)) {
    throw buildValidationError(`${context} payload must be an object.`, {
      details: { field: "input", expectedType: "object" },
    });
  }
}

function requireNonEmptyString<
  TField extends ConnectionHandleField | RequestProofField,
>(record: Record<string, unknown>, field: TField): string {
  if (!(field in record)) {
    throw buildValidationError(`Missing required field "${field}".`, {
      machineCode: PROTOCOL_MACHINE_CODES.MISSING_REQUIRED_FIELD,
      details: { field },
    });
  }

  const value = record[field];
  if (typeof value !== "string") {
    throw buildValidationError(`Field "${field}" must be a string.`, {
      details: { field, expectedType: "string" },
    });
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw buildValidationError(`Field "${field}" must not be empty.`, {
      details: { field },
    });
  }

  return trimmed;
}

export function parseCloudConnectionHandle(input: unknown): CloudConnectionHandle {
  assertObjectInput(input, "CloudConnectionHandle");

  const connectionHandle = requireNonEmptyString(input, "connectionHandle");
  const providerId = requireNonEmptyString(input, "providerId");
  const methodId = requireNonEmptyString(input, "methodId");
  const extensionId = requireNonEmptyString(input, "extensionId");
  const origin = requireNonEmptyString(input, "origin");

  const expectedPrefix = `${CONNECTION_HANDLE_PREFIX}${providerId}.${methodId}.`;
  if (!connectionHandle.startsWith(expectedPrefix)) {
    throw buildValidationError(
      "Field \"connectionHandle\" must match the providerId/methodId binding.",
      {
        details: { field: "connectionHandle", providerId, methodId },
      },
    );
  }

  const suffix = connectionHandle.slice(expectedPrefix.length);
  const suffixParts = suffix.split(".");
  if (suffixParts.length !== 3) {
    throw buildValidationError(
      "Field \"connectionHandle\" must follow connh.<providerId>.<methodId>.<uuid>.<bindingEpoch>.<signature> format.",
      {
        details: { field: "connectionHandle", expectedPrefix },
      },
    );
  }

  const [uuidSegment = "", bindingEpochRaw = "", signature = ""] = suffixParts;

  if (!CANONICAL_UUID_PATTERN.test(uuidSegment)) {
    throw buildValidationError(
      "Field \"connectionHandle\" contains an invalid canonical UUID segment.",
      {
        details: {
          field: "connectionHandle",
          segment: "uuid",
        },
      },
    );
  }

  if (!NON_NEGATIVE_INTEGER_PATTERN.test(bindingEpochRaw)) {
    throw buildValidationError(
      "Field \"connectionHandle\" contains an invalid bindingEpoch segment.",
      {
        details: {
          field: "connectionHandle",
          segment: "bindingEpoch",
        },
      },
    );
  }

  const bindingEpoch = Number.parseInt(bindingEpochRaw, 10);
  if (!Number.isSafeInteger(bindingEpoch) || bindingEpoch < 0) {
    throw buildValidationError(
      "Field \"connectionHandle\" contains an out-of-range bindingEpoch segment.",
      {
        details: {
          field: "connectionHandle",
          segment: "bindingEpoch",
        },
      },
    );
  }

  if (!NON_EMPTY_TOKEN_PATTERN.test(signature)) {
    throw buildValidationError(
      "Field \"connectionHandle\" contains an invalid signature segment.",
      {
        details: {
          field: "connectionHandle",
          segment: "signature",
        },
      },
    );
  }

  return {
    connectionHandle,
    providerId,
    methodId,
    extensionId,
    origin,
    bindingEpoch,
    signature,
  };
}

export function parseCloudRequestProof(input: unknown): CloudRequestProof {
  assertObjectInput(input, "CloudRequestProof");

  const requestId = requireNonEmptyString(input, "requestId");
  const nonce = requireNonEmptyString(input, "nonce");
  const origin = requireNonEmptyString(input, "origin");
  const connectionHandle = requireNonEmptyString(input, "connectionHandle");
  const payloadHash = requireNonEmptyString(input, "payloadHash");
  const proof = requireNonEmptyString(input, "proof");

  return {
    requestId,
    nonce,
    origin,
    connectionHandle,
    payloadHash,
    proof,
  };
}
