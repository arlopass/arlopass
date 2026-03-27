import {
  evaluatePolicy,
  POLICY_DECISION_MACHINE_CODES,
  POLICY_DECISION_TYPES,
  UNKNOWN_POLICY_VERSION,
  type PolicyDecision,
  type PolicyEvaluationContext,
  type PolicyEvaluationOptions,
} from "@arlopass/policy";
import type { CanonicalEnvelope } from "@arlopass/protocol";

export type PreflightEvaluatorOptions = Pick<
  PolicyEvaluationOptions,
  "signedPolicyBundle" | "keyResolver" | "requireSignatureVerification"
> & {
  /** Clock factory for the evaluation time (defaults to Date.now). */
  clock?: () => Date;
};

/**
 * Extension-side preflight policy evaluator.
 *
 * Evaluates a CanonicalEnvelope against the current signed policy bundle
 * before the request is forwarded to the bridge. Deny by default when no
 * policy bundle is configured or when evaluation fails for any reason.
 *
 * Note: The bridge runtime evaluator is authoritative — this is an
 * early-exit optimization to surface denials before the native messaging
 * round-trip. A preflight allow does NOT guarantee a bridge allow.
 */
export class PreflightEvaluator {
  readonly #defaultOptions: PreflightEvaluatorOptions;

  constructor(defaultOptions: PreflightEvaluatorOptions = {}) {
    this.#defaultOptions = defaultOptions;
  }

  /**
   * Evaluate a canonical request envelope against the configured policy.
   *
   * Returns a deny decision if no policy bundle is set, if the signature
   * is invalid, if the policy is expired, or if any unexpected error occurs.
   */
  evaluate(
    envelope: CanonicalEnvelope<unknown>,
    overrides: PreflightEvaluatorOptions = {},
  ): PolicyDecision {
    const merged = { ...this.#defaultOptions, ...overrides };
    const clock = merged.clock ?? (() => new Date());
    const opts: PolicyEvaluationOptions = {
      now: clock(),
      ...(merged.signedPolicyBundle !== undefined
        ? { signedPolicyBundle: merged.signedPolicyBundle }
        : {}),
      ...(merged.keyResolver !== undefined ? { keyResolver: merged.keyResolver } : {}),
      ...(merged.requireSignatureVerification !== undefined
        ? { requireSignatureVerification: merged.requireSignatureVerification }
        : {}),
    };

    const context: PolicyEvaluationContext = {
      origin: envelope.origin,
      capability: envelope.capability,
      providerId: envelope.providerId,
      modelId: envelope.modelId,
      correlationId: envelope.correlationId,
    };

    try {
      return evaluatePolicy(context, opts);
    } catch {
      // Any unexpected error in evaluation defaults to deny.
      const policyVersion =
        opts.signedPolicyBundle?.payload.policyVersion ?? UNKNOWN_POLICY_VERSION;
      return Object.freeze({
        decision: POLICY_DECISION_TYPES.DENY,
        machineCode: POLICY_DECISION_MACHINE_CODES.DENY_POLICY_INVALID,
        reasonCode: "policy.denied",
        policyVersion,
        ...(envelope.correlationId !== undefined
          ? { correlationId: envelope.correlationId }
          : {}),
      } as PolicyDecision);
    }
  }
}
