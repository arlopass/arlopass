import {
  assertCapabilityAllowed,
  type ProtocolCapability,
} from "./capabilities.js";
import {
  EnvelopeValidationError,
  PROTOCOL_MACHINE_CODES,
  type ProtocolError,
  type ProtocolErrorDetails,
} from "./errors.js";
import { negotiateProtocolVersion } from "./versioning.js";

export const CANONICAL_ENVELOPE_FIELDS = [
  "protocolVersion",
  "requestId",
  "correlationId",
  "origin",
  "sessionId",
  "capability",
  "providerId",
  "modelId",
  "issuedAt",
  "expiresAt",
  "nonce",
  "payload",
] as const;

export type CanonicalEnvelopeField = (typeof CANONICAL_ENVELOPE_FIELDS)[number];

const CANONICAL_ENVELOPE_FIELD_SET: ReadonlySet<string> = new Set(
  CANONICAL_ENVELOPE_FIELDS,
);

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const NONCE_PATTERN = /^[A-Za-z0-9+/=_:-]+$/;

export const DEFAULT_PROTOCOL_VERSION = "1.0.0";
export const DEFAULT_MAX_ENVELOPE_LIFETIME_MS = 5 * 60 * 1000;
export const DEFAULT_MAX_CLOCK_SKEW_MS = 30 * 1000;
export const DEFAULT_NONCE_MIN_LENGTH = 16;

export type CanonicalEnvelope<TPayload = unknown> = Readonly<{
  protocolVersion: string;
  requestId: string;
  correlationId: string;
  origin: string;
  sessionId: string;
  capability: ProtocolCapability;
  providerId: string;
  modelId: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  payload: TPayload;
}>;

export type EnvelopeValidationOptions<TPayload = unknown> = Readonly<{
  now?: Date;
  maxLifetimeMs?: number;
  maxClockSkewMs?: number;
  nonceMinLength?: number;
  strictFields?: boolean;
  supportedProtocolVersion?: string;
  payloadParser?: (payload: unknown) => TPayload;
}>;

export type SafeEnvelopeParseResult<TPayload = unknown> =
  | Readonly<{ success: true; data: CanonicalEnvelope<TPayload> }>
  | Readonly<{ success: false; error: ProtocolError }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCorrelationId(record: Record<string, unknown>): string | undefined {
  const correlationId = record.correlationId;
  if (typeof correlationId !== "string") {
    return undefined;
  }

  const normalized = correlationId.trim();
  if (normalized.length === 0) {
    return undefined;
  }

  return normalized;
}

function buildError(
  message: string,
  record: Record<string, unknown>,
  options: {
    machineCode:
      | typeof PROTOCOL_MACHINE_CODES.INVALID_ENVELOPE
      | typeof PROTOCOL_MACHINE_CODES.MISSING_REQUIRED_FIELD
      | typeof PROTOCOL_MACHINE_CODES.ENVELOPE_EXPIRED
      | typeof PROTOCOL_MACHINE_CODES.REPLAY_PRONE_METADATA
      | typeof PROTOCOL_MACHINE_CODES.UNSUPPORTED_PROTOCOL_VERSION
      | typeof PROTOCOL_MACHINE_CODES.UNSUPPORTED_CAPABILITY;
    reasonCode:
      | "request.invalid"
      | "request.expired"
      | "request.replay_prone"
      | "protocol.unsupported_version"
      | "protocol.unsupported_capability"
      | "protocol.invalid_envelope";
    details?: ProtocolErrorDetails;
    cause?: Error;
  },
): EnvelopeValidationError {
  const correlationId = readCorrelationId(record);

  return new EnvelopeValidationError(message, {
    machineCode: options.machineCode,
    reasonCode: options.reasonCode,
    ...(correlationId !== undefined ? { correlationId } : {}),
    ...(options.details !== undefined ? { details: options.details } : {}),
    ...(options.cause !== undefined ? { cause: options.cause } : {}),
  });
}

function requireStringField(
  record: Record<string, unknown>,
  field: Exclude<CanonicalEnvelopeField, "payload">,
): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw buildError(`Field "${field}" must be a string.`, record, {
      machineCode: PROTOCOL_MACHINE_CODES.INVALID_ENVELOPE,
      reasonCode: "request.invalid",
      details: { field },
    });
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw buildError(`Field "${field}" must not be empty.`, record, {
      machineCode: PROTOCOL_MACHINE_CODES.INVALID_ENVELOPE,
      reasonCode: "request.invalid",
      details: { field },
    });
  }

  return trimmed;
}

function assertIdentifier(
  value: string,
  field: "requestId" | "correlationId" | "sessionId" | "providerId" | "modelId",
  record: Record<string, unknown>,
): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw buildError(`Field "${field}" has invalid format.`, record, {
      machineCode: PROTOCOL_MACHINE_CODES.INVALID_ENVELOPE,
      reasonCode: "request.invalid",
      details: { field },
    });
  }
}

function assertOrigin(origin: string, record: Record<string, unknown>): string {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(origin);
  } catch (cause) {
    const causeError = cause instanceof Error ? cause : undefined;

    throw buildError("Field \"origin\" must be a valid URL.", record, {
      machineCode: PROTOCOL_MACHINE_CODES.INVALID_ENVELOPE,
      reasonCode: "request.invalid",
      details: { field: "origin" },
      ...(causeError !== undefined ? { cause: causeError } : {}),
    });
  }

  const allowedSchemes = new Set(["https:", "http:", "chrome-extension:"]);
  if (!allowedSchemes.has(parsedUrl.protocol)) {
    throw buildError("Field \"origin\" has an unsupported scheme.", record, {
      machineCode: PROTOCOL_MACHINE_CODES.INVALID_ENVELOPE,
      reasonCode: "request.invalid",
      details: { field: "origin", scheme: parsedUrl.protocol },
    });
  }

  return parsedUrl.origin === "null" ? origin : parsedUrl.origin;
}

function parseTimestampField(
  value: string,
  field: "issuedAt" | "expiresAt",
  record: Record<string, unknown>,
): Date {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw buildError(`Field "${field}" must be a valid timestamp.`, record, {
      machineCode: PROTOCOL_MACHINE_CODES.INVALID_ENVELOPE,
      reasonCode: "request.invalid",
      details: { field },
    });
  }

  return timestamp;
}

function assertRequiredFields(record: Record<string, unknown>): void {
  for (const field of CANONICAL_ENVELOPE_FIELDS) {
    if (!(field in record)) {
      throw buildError(`Missing required field "${field}".`, record, {
        machineCode: PROTOCOL_MACHINE_CODES.MISSING_REQUIRED_FIELD,
        reasonCode: "request.invalid",
        details: { field },
      });
    }
  }
}

function assertStrictFields(record: Record<string, unknown>): void {
  const unknownFields = Object.keys(record).filter(
    (field) => !CANONICAL_ENVELOPE_FIELD_SET.has(field),
  );

  if (unknownFields.length > 0) {
    throw buildError("Envelope contains unknown top-level fields.", record, {
      machineCode: PROTOCOL_MACHINE_CODES.INVALID_ENVELOPE,
      reasonCode: "protocol.invalid_envelope",
      details: { unknownFields: unknownFields.join(",") },
    });
  }
}

function assertReplayResistantMetadata(
  envelope: Pick<CanonicalEnvelope, "issuedAt" | "expiresAt" | "nonce">,
  record: Record<string, unknown>,
  options: {
    now: Date;
    maxLifetimeMs: number;
    maxClockSkewMs: number;
    nonceMinLength: number;
  },
): void {
  const nowMs = options.now.getTime();
  const issuedAtMs = new Date(envelope.issuedAt).getTime();
  const expiresAtMs = new Date(envelope.expiresAt).getTime();

  if (expiresAtMs <= nowMs) {
    throw buildError("Envelope has expired.", record, {
      machineCode: PROTOCOL_MACHINE_CODES.ENVELOPE_EXPIRED,
      reasonCode: "request.expired",
      details: { expiresAt: envelope.expiresAt },
    });
  }

  if (expiresAtMs <= issuedAtMs) {
    throw buildError("Envelope expiry must be later than issue time.", record, {
      machineCode: PROTOCOL_MACHINE_CODES.REPLAY_PRONE_METADATA,
      reasonCode: "request.replay_prone",
      details: { issuedAt: envelope.issuedAt, expiresAt: envelope.expiresAt },
    });
  }

  if (expiresAtMs - issuedAtMs > options.maxLifetimeMs) {
    throw buildError("Envelope lifetime exceeds the security window.", record, {
      machineCode: PROTOCOL_MACHINE_CODES.REPLAY_PRONE_METADATA,
      reasonCode: "request.replay_prone",
      details: { maxLifetimeMs: options.maxLifetimeMs },
    });
  }

  if (issuedAtMs - nowMs > options.maxClockSkewMs) {
    throw buildError("Envelope issuedAt exceeds permitted clock skew.", record, {
      machineCode: PROTOCOL_MACHINE_CODES.REPLAY_PRONE_METADATA,
      reasonCode: "request.replay_prone",
      details: { maxClockSkewMs: options.maxClockSkewMs },
    });
  }

  if (
    envelope.nonce.length < options.nonceMinLength ||
    !NONCE_PATTERN.test(envelope.nonce)
  ) {
    throw buildError("Envelope nonce does not meet replay resistance rules.", record, {
      machineCode: PROTOCOL_MACHINE_CODES.REPLAY_PRONE_METADATA,
      reasonCode: "request.replay_prone",
      details: { nonceMinLength: options.nonceMinLength },
    });
  }
}

export function parseEnvelope<TPayload = unknown>(
  input: unknown,
  options: EnvelopeValidationOptions<TPayload> = {},
): CanonicalEnvelope<TPayload> {
  if (!isRecord(input)) {
    throw new EnvelopeValidationError("Envelope must be an object.", {
      machineCode: PROTOCOL_MACHINE_CODES.INVALID_ENVELOPE,
      reasonCode: "protocol.invalid_envelope",
    });
  }

  const maxLifetimeMs = options.maxLifetimeMs ?? DEFAULT_MAX_ENVELOPE_LIFETIME_MS;
  const maxClockSkewMs = options.maxClockSkewMs ?? DEFAULT_MAX_CLOCK_SKEW_MS;
  const nonceMinLength = options.nonceMinLength ?? DEFAULT_NONCE_MIN_LENGTH;
  const now = options.now ?? new Date();
  const strictFields = options.strictFields ?? true;
  const supportedProtocolVersion =
    options.supportedProtocolVersion ?? DEFAULT_PROTOCOL_VERSION;

  if (strictFields) {
    assertStrictFields(input);
  }

  assertRequiredFields(input);

  const protocolVersion = requireStringField(input, "protocolVersion");
  const requestId = requireStringField(input, "requestId");
  const correlationId = requireStringField(input, "correlationId");
  const origin = assertOrigin(requireStringField(input, "origin"), input);
  const sessionId = requireStringField(input, "sessionId");
  const capabilityRaw = requireStringField(input, "capability");
  const providerId = requireStringField(input, "providerId");
  const modelId = requireStringField(input, "modelId");
  const issuedAt = requireStringField(input, "issuedAt");
  const expiresAt = requireStringField(input, "expiresAt");
  const nonce = requireStringField(input, "nonce");

  const versionNegotiation = negotiateProtocolVersion(
    protocolVersion,
    supportedProtocolVersion,
  );
  if (!versionNegotiation.ok) {
    throw buildError("Unsupported protocol version.", input, {
      machineCode: PROTOCOL_MACHINE_CODES.UNSUPPORTED_PROTOCOL_VERSION,
      reasonCode: "protocol.unsupported_version",
      details: {
        clientVersion: versionNegotiation.client.raw,
        serverVersion: versionNegotiation.server.raw,
      },
    });
  }

  let capability: ProtocolCapability;
  try {
    capability = assertCapabilityAllowed(capabilityRaw);
  } catch (cause) {
    const causeError = cause instanceof Error ? cause : undefined;

    throw buildError("Unsupported capability.", input, {
      machineCode: PROTOCOL_MACHINE_CODES.UNSUPPORTED_CAPABILITY,
      reasonCode: "protocol.unsupported_capability",
      details: { capability: capabilityRaw },
      ...(causeError !== undefined ? { cause: causeError } : {}),
    });
  }

  assertIdentifier(requestId, "requestId", input);
  assertIdentifier(correlationId, "correlationId", input);
  assertIdentifier(sessionId, "sessionId", input);
  assertIdentifier(providerId, "providerId", input);
  assertIdentifier(modelId, "modelId", input);

  const issuedAtTimestamp = parseTimestampField(issuedAt, "issuedAt", input);
  const expiresAtTimestamp = parseTimestampField(expiresAt, "expiresAt", input);

  const parsedPayload = options.payloadParser
    ? options.payloadParser(input.payload)
    : (input.payload as TPayload);

  const parsedEnvelope: CanonicalEnvelope<TPayload> = {
    protocolVersion,
    requestId,
    correlationId,
    origin,
    sessionId,
    capability,
    providerId,
    modelId,
    issuedAt: issuedAtTimestamp.toISOString(),
    expiresAt: expiresAtTimestamp.toISOString(),
    nonce,
    payload: parsedPayload,
  };

  assertReplayResistantMetadata(parsedEnvelope, input, {
    now,
    maxLifetimeMs,
    maxClockSkewMs,
    nonceMinLength,
  });

  return parsedEnvelope;
}

export function safeParseEnvelope<TPayload = unknown>(
  input: unknown,
  options: EnvelopeValidationOptions<TPayload> = {},
): SafeEnvelopeParseResult<TPayload> {
  try {
    const envelope = parseEnvelope(input, options);
    return { success: true, data: envelope };
  } catch (error) {
    if (error instanceof EnvelopeValidationError) {
      return { success: false, error };
    }

    const causeError = error instanceof Error ? error : undefined;
    const wrappedError = new EnvelopeValidationError("Failed to parse envelope.", {
      machineCode: PROTOCOL_MACHINE_CODES.INVALID_ENVELOPE,
      reasonCode: "protocol.invalid_envelope",
      ...(causeError !== undefined ? { cause: causeError } : {}),
    });

    return { success: false, error: wrappedError };
  }
}
