import { RUNTIME_ERROR_CODES, SandboxViolationError } from "./errors.js";
import { type AdapterEgressRule, type AdapterManifest } from "./manifest-schema.js";

export type SandboxPermission =
  | "network.egress"
  | "filesystem.read"
  | "filesystem.write"
  | "process.spawn"
  | "env.read";

const PERMISSION_SET: ReadonlySet<string> = new Set<SandboxPermission>([
  "network.egress",
  "filesystem.read",
  "filesystem.write",
  "process.spawn",
  "env.read",
]);

export function isSandboxPermission(value: string): value is SandboxPermission {
  return PERMISSION_SET.has(value);
}

export type SandboxPolicy = Readonly<{
  allowedPermissions: ReadonlySet<SandboxPermission>;
  allowedEgressRules: readonly AdapterEgressRule[];
  maxMemoryMb?: number;
  maxCpuMs?: number;
}>;

export type EgressAttempt = Readonly<{
  host: string;
  port?: number;
  protocol: string;
}>;

export type SandboxCheckResult = Readonly<{
  allowed: boolean;
  reason?: string;
}>;

function sandboxError(
  message: string,
  code: (typeof RUNTIME_ERROR_CODES)[keyof typeof RUNTIME_ERROR_CODES],
  details?: Readonly<Record<string, string | number | boolean | null>>,
): SandboxViolationError {
  return new SandboxViolationError(message, {
    code,
    ...(details !== undefined ? { details } : {}),
  });
}

function egressRuleMatchesAttempt(rule: AdapterEgressRule, attempt: EgressAttempt): boolean {
  const hostMatches = rule.host === "*" || rule.host === attempt.host;
  const protocolMatches = rule.protocol === attempt.protocol;
  const portMatches = rule.port === undefined || rule.port === attempt.port;
  return hostMatches && protocolMatches && portMatches;
}

export function buildSandboxPolicy(manifest: AdapterManifest): SandboxPolicy {
  const allowedPermissions = new Set<SandboxPermission>();
  for (const perm of manifest.requiredPermissions) {
    if (isSandboxPermission(perm)) {
      allowedPermissions.add(perm);
    }
  }
  return Object.freeze({
    allowedPermissions: Object.freeze(allowedPermissions) as ReadonlySet<SandboxPermission>,
    allowedEgressRules: manifest.egressRules,
  });
}

export function checkPermission(
  policy: SandboxPolicy | undefined,
  permission: SandboxPermission,
): SandboxCheckResult {
  if (policy === undefined) {
    return Object.freeze({
      allowed: false,
      reason: "No sandbox policy defined; all permissions denied by default.",
    });
  }
  if (!policy.allowedPermissions.has(permission)) {
    return Object.freeze({
      allowed: false,
      reason: `Permission "${permission}" is not declared in the adapter manifest.`,
    });
  }
  return Object.freeze({ allowed: true });
}

export function checkEgressAttempt(
  policy: SandboxPolicy | undefined,
  attempt: EgressAttempt,
): SandboxCheckResult {
  if (policy === undefined) {
    return Object.freeze({
      allowed: false,
      reason: "No sandbox policy defined; all egress denied by default.",
    });
  }
  if (!policy.allowedPermissions.has("network.egress")) {
    return Object.freeze({
      allowed: false,
      reason: `Permission "network.egress" is not declared in the adapter manifest.`,
    });
  }
  const matched = policy.allowedEgressRules.some((rule) => egressRuleMatchesAttempt(rule, attempt));
  if (!matched) {
    return Object.freeze({
      allowed: false,
      reason: `Egress to "${attempt.protocol}://${attempt.host}${attempt.port !== undefined ? `:${attempt.port}` : ""}" is not permitted by adapter egress rules.`,
    });
  }
  return Object.freeze({ allowed: true });
}

export function assertPermission(
  policy: SandboxPolicy | undefined,
  permission: SandboxPermission,
): void {
  const result = checkPermission(policy, permission);
  if (!result.allowed) {
    throw sandboxError(
      result.reason ?? `Permission "${permission}" denied.`,
      RUNTIME_ERROR_CODES.SANDBOX_PERMISSION_DENIED,
      { permission },
    );
  }
}

export function assertEgressAllowed(
  policy: SandboxPolicy | undefined,
  attempt: EgressAttempt,
): void {
  const result = checkEgressAttempt(policy, attempt);
  if (!result.allowed) {
    throw sandboxError(
      result.reason ?? `Egress denied.`,
      RUNTIME_ERROR_CODES.SANDBOX_EGRESS_DENIED,
      {
        host: attempt.host,
        protocol: attempt.protocol,
        ...(attempt.port !== undefined ? { port: attempt.port } : {}),
      },
    );
  }
}

export class SandboxContext {
  readonly #policy: SandboxPolicy;
  readonly #providerId: string;

  constructor(providerId: string, policy: SandboxPolicy) {
    this.#policy = policy;
    this.#providerId = providerId;
  }

  get providerId(): string {
    return this.#providerId;
  }

  get policy(): SandboxPolicy {
    return this.#policy;
  }

  checkPermission(permission: SandboxPermission): SandboxCheckResult {
    return checkPermission(this.#policy, permission);
  }

  checkEgress(attempt: EgressAttempt): SandboxCheckResult {
    return checkEgressAttempt(this.#policy, attempt);
  }

  assertPermission(permission: SandboxPermission): void {
    assertPermission(this.#policy, permission);
  }

  assertEgressAllowed(attempt: EgressAttempt): void {
    assertEgressAllowed(this.#policy, attempt);
  }
}
