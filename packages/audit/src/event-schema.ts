/**
 * Canonical audit event schema for BYOM enterprise policy decisions.
 *
 * Privacy-safe by default: prompt and response content are excluded unless
 * explicitly included via the optional `redactedContent` field with a
 * caller-supplied redaction function.
 */

export type AuditDecision = "allow" | "deny";

/** Required fields for every audit event (see spec §7). */
export interface AuditEventFields {
  /** ISO-8601 UTC timestamp of the decision. */
  timestamp: string;
  /** Origin (URL or identifier) of the requesting party. */
  origin: string;
  /** Provider identifier (e.g. "provider.openai"). */
  providerId: string;
  /** Model identifier (e.g. "model.gpt-4o"). */
  modelId: string;
  /** Capability being requested (e.g. "chat.stream"). */
  capability: string;
  /** Allow or deny outcome. */
  decision: AuditDecision;
  /** Reason code explaining the decision. */
  reasonCode: string;
  /** Correlation ID linking this event to a request trace. */
  correlationId: string;
  /** Policy bundle version that produced this decision. */
  policyVersion: string;
}

/** Full audit event, optionally extended with non-content metadata. */
export interface AuditEvent extends AuditEventFields {
  /** Free-form metadata — must NOT contain raw prompt or response text. */
  metadata?: Record<string, unknown>;
}

/** Minimal set of required field names, used for schema validation. */
export const REQUIRED_AUDIT_FIELDS: ReadonlyArray<keyof AuditEventFields> = [
  "timestamp",
  "origin",
  "providerId",
  "modelId",
  "capability",
  "decision",
  "reasonCode",
  "correlationId",
  "policyVersion",
] as const;

/** Error thrown when an event is missing required fields. */
export class AuditSchemaError extends Error {
  constructor(public readonly missingFields: string[]) {
    super(`AuditEvent is missing required fields: ${missingFields.join(", ")}`);
    this.name = "AuditSchemaError";
  }
}

/**
 * Validate that an object contains all required audit event fields.
 * Throws {@link AuditSchemaError} on violations.
 */
export function validateAuditEvent(candidate: unknown): asserts candidate is AuditEvent {
  if (typeof candidate !== "object" || candidate === null) {
    throw new AuditSchemaError(REQUIRED_AUDIT_FIELDS.slice());
  }

  const obj = candidate as Record<string, unknown>;
  const missing = REQUIRED_AUDIT_FIELDS.filter(
    (field) => obj[field] === undefined || obj[field] === null || obj[field] === "",
  );

  if (missing.length > 0) {
    throw new AuditSchemaError(missing);
  }

  if (obj["decision"] !== "allow" && obj["decision"] !== "deny") {
    throw new AuditSchemaError(["decision (must be 'allow' | 'deny')"]);
  }
}

/**
 * Create a validated {@link AuditEvent}.
 *
 * By design this function does NOT accept `prompt` or `response` parameters —
 * content privacy is enforced at construction time.
 */
export function createAuditEvent(fields: AuditEventFields & { metadata?: Record<string, unknown> }): AuditEvent {
  const event: AuditEvent = { ...fields };
  validateAuditEvent(event);
  return event;
}
