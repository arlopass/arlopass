import { normalizeReasonCode, type ProtocolReasonCode } from "@arlopass/protocol";

const REDACTED_VALUE = "[REDACTED]";
const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|authorization|api[-_]?key|cookie|credential|private[-_]?key|passphrase)/i;

export type SafeUserError = Readonly<{
  reasonCode: ProtocolReasonCode;
  message: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactSensitiveStringSegments(value: string): string {
  return value
    .replace(/(Bearer\s+)[A-Za-z0-9\-._~+/=]+/gi, `$1${REDACTED_VALUE}`)
    .replace(/(Basic\s+)[A-Za-z0-9+/=]+/gi, `$1${REDACTED_VALUE}`)
    .replace(
      /((?:api[_-]?key|token|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*)([^\s,;]+)/gi,
      `$1${REDACTED_VALUE}`,
    )
    .replace(
      /([?&](?:api[_-]?key|token|access_token|refresh_token|password|secret)=)[^&\s]+/gi,
      `$1${REDACTED_VALUE}`,
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED_VALUE);
}

function redactValue(value: unknown): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "string") {
    return redactSensitiveStringSegments(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }
  if (!isRecord(value)) {
    return REDACTED_VALUE;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      if (
        typeof entryValue === "string" &&
        /^Bearer\s+/i.test(entryValue)
      ) {
        redacted[key] = `Bearer ${REDACTED_VALUE}`;
      } else {
        redacted[key] = REDACTED_VALUE;
      }
      continue;
    }
    redacted[key] = redactValue(entryValue);
  }
  return redacted;
}

export function redactProviderPayload(
  payload: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const redacted = redactValue(payload);
  return isRecord(redacted) ? redacted : {};
}

export function toSafeUserError(input: Readonly<{
  providerError?: unknown;
  reasonCode?: unknown;
  fallbackMessage?: string;
}>): SafeUserError {
  const reasonCode = normalizeReasonCode(input.reasonCode);
  const rawMessage =
    typeof input.providerError === "string"
      ? input.providerError
      : input.providerError instanceof Error
        ? input.providerError.message
        : typeof input.fallbackMessage === "string"
          ? input.fallbackMessage
          : "Cloud provider request failed.";
  return {
    reasonCode,
    message: redactSensitiveStringSegments(rawMessage),
  };
}

