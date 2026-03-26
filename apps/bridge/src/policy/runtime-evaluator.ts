import {
  evaluatePolicy,
  POLICY_DECISION_MACHINE_CODES,
  POLICY_DECISION_TYPES,
  UNKNOWN_POLICY_VERSION,
  type PolicyDecision,
  type PolicyEvaluationContext,
  type PolicyEvaluationOptions,
} from "@byom-ai/policy";
import type { AuditEventFields } from "@byom-ai/audit";

import type { AuditEmitter } from "../audit/audit-emitter.js";

export type RuntimeEvaluatorOptions = Pick<
  PolicyEvaluationOptions,
  "signedPolicyBundle" | "keyResolver" | "requireSignatureVerification"
> & {
  /** Clock factory used both for policy evaluation time and audit timestamps. */
  clock?: () => Date;
};

/**
 * Full evaluation input accepted by the bridge runtime evaluator.
 *
 * All fields are required because the bridge processes full request
 * envelopes and must emit complete audit events on every decision.
 */
export type RuntimeEvaluationRequest = Readonly<{
  origin: string;
  capability: string;
  providerId: string;
  modelId: string;
  correlationId?: string;
}>;

/**
 * Bridge-side runtime policy evaluator.  This is the AUTHORITATIVE enforcement
 * point — decisions here override any cached result from the extension.
 *
 * Rules:
 * - Deny by default on missing policy, invalid input, or evaluation failure.
 * - Emits a structured audit event on every decision when an AuditEmitter
 *   is provided.
 * - A stale extension-side policy version does NOT weaken the bridge deny;
 *   the bridge always re-evaluates against its own policy bundle.
 */
export class RuntimeEvaluator {
  readonly #defaultOptions: RuntimeEvaluatorOptions;
  readonly #auditEmitter: AuditEmitter | undefined;
  readonly #now: () => Date;

  constructor(
    defaultOptions: RuntimeEvaluatorOptions = {},
    auditEmitter?: AuditEmitter,
  ) {
    this.#defaultOptions = defaultOptions;
    this.#auditEmitter = auditEmitter;
    this.#now = defaultOptions.clock ?? (() => new Date());
  }

  /**
   * Evaluate a runtime request against the current policy bundle.
   *
   * Always re-evaluates even when the extension has a cached allow — the
   * bridge must never trust extension-side state as authoritative.
   */
  evaluate(
    request: RuntimeEvaluationRequest,
    overrides: RuntimeEvaluatorOptions = {},
  ): PolicyDecision {
    const merged = { ...this.#defaultOptions, ...overrides };
    const opts: PolicyEvaluationOptions = {
      now: this.#now(),
      ...(merged.signedPolicyBundle !== undefined
        ? { signedPolicyBundle: merged.signedPolicyBundle }
        : {}),
      ...(merged.keyResolver !== undefined ? { keyResolver: merged.keyResolver } : {}),
      ...(merged.requireSignatureVerification !== undefined
        ? { requireSignatureVerification: merged.requireSignatureVerification }
        : {}),
    };

    const context: PolicyEvaluationContext = {
      origin: request.origin,
      capability: request.capability,
      providerId: request.providerId,
      modelId: request.modelId,
      ...(request.correlationId !== undefined
        ? { correlationId: request.correlationId }
        : {}),
    };

    let decision: PolicyDecision;
    try {
      decision = evaluatePolicy(context, opts);
    } catch {
      const policyVersion =
        opts.signedPolicyBundle?.payload.policyVersion ?? UNKNOWN_POLICY_VERSION;
      decision = Object.freeze({
        decision: POLICY_DECISION_TYPES.DENY,
        machineCode: POLICY_DECISION_MACHINE_CODES.DENY_POLICY_INVALID,
        reasonCode: "policy.denied",
        policyVersion,
        ...(request.correlationId !== undefined
          ? { correlationId: request.correlationId }
          : {}),
      } as PolicyDecision);
    }

    this.#emitAudit(request, decision);
    return decision;
  }

  /** The policy version from the current bundle, or "unknown" if not set. */
  get currentPolicyVersion(): string {
    return (
      this.#defaultOptions.signedPolicyBundle?.payload.policyVersion ??
      UNKNOWN_POLICY_VERSION
    );
  }

  #emitAudit(request: RuntimeEvaluationRequest, decision: PolicyDecision): void {
    if (this.#auditEmitter === undefined) {
      return;
    }

    const correlationId =
      request.correlationId !== undefined && request.correlationId.trim().length > 0
        ? request.correlationId
        : "unknown";

    const fields: AuditEventFields = {
      timestamp: this.#now().toISOString(),
      origin: request.origin,
      providerId: request.providerId,
      modelId: request.modelId,
      capability: request.capability,
      decision: decision.decision === "allow" ? "allow" : "deny",
      reasonCode: decision.reasonCode,
      correlationId,
      policyVersion: decision.policyVersion,
    };

    this.#auditEmitter.emit(fields);
  }
}
