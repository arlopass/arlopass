export const REASON_CODE_CATALOG = [
  "allow",
  "auth.invalid",
  "auth.expired",
  "permission.denied",
  "policy.denied",
  "provider.unavailable",
  "request.invalid",
  "request.replay_prone",
  "request.expired",
  "protocol.unsupported_version",
  "protocol.unsupported_capability",
  "protocol.invalid_envelope",
  "transport.timeout",
  "transport.transient_failure",
] as const;

export type ProtocolReasonCode = (typeof REASON_CODE_CATALOG)[number];

const REASON_CODE_SET: ReadonlySet<string> = new Set(REASON_CODE_CATALOG);

const REASON_CODE_ALIASES: Readonly<Record<string, ProtocolReasonCode>> = {
  allow: "allow",
  ok: "allow",
  "auth.invalid": "auth.invalid",
  "auth.invalid_credentials": "auth.invalid",
  "auth.expired": "auth.expired",
  "permission.denied": "permission.denied",
  denied: "permission.denied",
  "policy.denied": "policy.denied",
  "policy.blocked": "policy.denied",
  policy_blocked: "policy.denied",
  "provider.unavailable": "provider.unavailable",
  "request.invalid": "request.invalid",
  "request.malformed": "request.invalid",
  request_malformed: "request.invalid",
  malformed: "request.invalid",
  "request.replay_prone": "request.replay_prone",
  "request.replay.prone": "request.replay_prone",
  request_replay_prone: "request.replay_prone",
  replay: "request.replay_prone",
  "request.expired": "request.expired",
  expired: "request.expired",
  "protocol.unsupported_version": "protocol.unsupported_version",
  "protocol.version_unsupported": "protocol.unsupported_version",
  "protocol.unsupported_capability": "protocol.unsupported_capability",
  "protocol.invalid_envelope": "protocol.invalid_envelope",
  "transport.timeout": "transport.timeout",
  timeout: "transport.timeout",
  "transport.transient_failure": "transport.transient_failure",
  transient: "transport.transient_failure",
};

const INVALID_FALLBACK_REASON: ProtocolReasonCode = "request.invalid";

export function isReasonCode(value: string): value is ProtocolReasonCode {
  return REASON_CODE_SET.has(value);
}

function canonicalizeReasonCode(input: string): string {
  return input.trim().toLowerCase().replace(/[\s-]+/g, ".");
}

export function normalizeReasonCode(input: unknown): ProtocolReasonCode {
  if (typeof input !== "string" || input.trim().length === 0) {
    return INVALID_FALLBACK_REASON;
  }

  const canonical = canonicalizeReasonCode(input);
  if (isReasonCode(canonical)) {
    return canonical;
  }

  return REASON_CODE_ALIASES[canonical] ?? INVALID_FALLBACK_REASON;
}
