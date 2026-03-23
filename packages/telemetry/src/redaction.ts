export const REDACTED_VALUE = "[REDACTED]";

export const REQUIRED_SIGNAL_METADATA_FIELDS = [
  "correlationId",
  "origin",
  "providerId",
] as const;

export const SAFE_SIGNAL_METADATA_FIELDS = [
  ...REQUIRED_SIGNAL_METADATA_FIELDS,
  "modelId",
  "capability",
  "reasonCode",
  "outcome",
  "requestId",
  "sessionId",
  "status",
  "errorName",
  "errorType",
] as const;

const DEFAULT_SENSITIVE_KEY_PATTERN =
  /(token|secret|password|authorization|api[-_]?key|cookie|credential|private[-_]?key|passphrase)/i;
const DEFAULT_MAX_REDACTION_DEPTH = 6;

export class SignalContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignalContractError";
  }
}

export type TelemetryRedactionOptions = Readonly<{
  redactedValue?: string;
  sensitiveKeyPattern?: RegExp;
  maxDepth?: number;
}>;

export type NormalizeSignalMetadataOptions = Readonly<{
  requiredFields?: readonly string[];
  allowedFields?: readonly string[];
  includeUnknownFields?: boolean;
  redaction?: TelemetryRedactionOptions;
}>;

type RedactionState = Readonly<{
  redactedValue: string;
  sensitiveKeyPattern: RegExp;
  maxDepth: number;
  seen: WeakSet<object>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSensitiveKey(key: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0;
  return pattern.test(key);
}

function redactSensitiveStringSegments(value: string, redactedValue: string): string {
  return value
    .replace(/(Bearer\s+)[A-Za-z0-9\-._~+/=]+/gi, `$1${redactedValue}`)
    .replace(/(Basic\s+)[A-Za-z0-9+/=]+/gi, `$1${redactedValue}`)
    .replace(
      /((?:api[_-]?key|token|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*)([^\s,;]+)/gi,
      `$1${redactedValue}`,
    )
    .replace(
      /([?&](?:api[_-]?key|token|access_token|refresh_token|password|secret)=)[^&\s]+/gi,
      `$1${redactedValue}`,
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, redactedValue);
}

function createRedactionState(options: TelemetryRedactionOptions): RedactionState {
  return {
    redactedValue: options.redactedValue ?? REDACTED_VALUE,
    sensitiveKeyPattern: options.sensitiveKeyPattern ?? DEFAULT_SENSITIVE_KEY_PATTERN,
    maxDepth:
      typeof options.maxDepth === "number" && Number.isInteger(options.maxDepth) && options.maxDepth > 0
        ? options.maxDepth
        : DEFAULT_MAX_REDACTION_DEPTH,
    seen: new WeakSet<object>(),
  };
}

function redactTelemetryValueInternal(
  value: unknown,
  state: RedactionState,
  depth: number,
  key: string | undefined,
): unknown {
  if (key !== undefined && isSensitiveKey(key, state.sensitiveKeyPattern)) {
    return state.redactedValue;
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return redactSensitiveStringSegments(value, state.redactedValue);
  }

  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    return state.redactedValue;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (depth >= state.maxDepth) {
    return state.redactedValue;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactTelemetryValueInternal(entry, state, depth + 1, undefined));
  }

  if (!isRecord(value)) {
    return state.redactedValue;
  }

  if (state.seen.has(value)) {
    return state.redactedValue;
  }
  state.seen.add(value);

  const redactedRecord: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    redactedRecord[entryKey] = redactTelemetryValueInternal(
      entryValue,
      state,
      depth + 1,
      entryKey,
    );
  }

  return redactedRecord;
}

export function redactTelemetryValue(
  value: unknown,
  options: TelemetryRedactionOptions = {},
): unknown {
  return redactTelemetryValueInternal(value, createRedactionState(options), 0, undefined);
}

export function redactTelemetryRecord(
  record: Readonly<Record<string, unknown>>,
  options: TelemetryRedactionOptions = {},
): Readonly<Record<string, unknown>> {
  const redacted = redactTelemetryValue(record, options);
  if (!isRecord(redacted)) {
    return {};
  }

  return redacted;
}

export function assertRequiredMetadataFields(
  metadata: Readonly<Record<string, unknown>>,
  requiredFields: readonly string[] = REQUIRED_SIGNAL_METADATA_FIELDS,
): void {
  const missingFields = requiredFields.filter((field) => {
    const fieldValue = metadata[field];
    return typeof fieldValue !== "string" || fieldValue.trim().length === 0;
  });

  if (missingFields.length > 0) {
    throw new SignalContractError(
      `Missing required telemetry metadata fields: ${missingFields.join(", ")}`,
    );
  }
}

export function normalizeSignalMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
  options: NormalizeSignalMetadataOptions = {},
): Readonly<Record<string, unknown>> {
  const source = metadata ?? {};
  const includeUnknownFields = options.includeUnknownFields ?? false;
  const allowedFields = options.allowedFields ?? SAFE_SIGNAL_METADATA_FIELDS;
  const allowedFieldSet = new Set<string>(allowedFields);
  const filteredMetadata: Record<string, unknown> = {};

  for (const [field, fieldValue] of Object.entries(source)) {
    if (includeUnknownFields || allowedFieldSet.has(field)) {
      filteredMetadata[field] = fieldValue;
    }
  }

  const redactedMetadata = redactTelemetryRecord(filteredMetadata, options.redaction);
  const requiredFields = options.requiredFields ?? [];
  if (requiredFields.length > 0) {
    assertRequiredMetadataFields(redactedMetadata, requiredFields);
  }

  return redactedMetadata;
}
