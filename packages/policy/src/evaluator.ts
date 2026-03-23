import {
  isProtocolCapability,
  type ProtocolCapability,
  type ProtocolReasonCode,
} from "@byom-ai/protocol";

import {
  POLICY_DECISION_MACHINE_CODES,
  toPolicyReasonCode,
  type PolicyDecisionMachineCode,
} from "./reason-codes.js";
import { type SignedPolicyBundle } from "./schema.js";
import {
  POLICY_SIGNATURE_ERROR_CODES,
  PolicySignatureError,
  type PolicyKeyResolver,
  verifyPolicyBundleSignature,
} from "./signature.js";

export const POLICY_DECISION_TYPES = {
  ALLOW: "allow",
  DENY: "deny",
} as const;

export type PolicyDecisionType =
  (typeof POLICY_DECISION_TYPES)[keyof typeof POLICY_DECISION_TYPES];

export const UNKNOWN_POLICY_VERSION = "unknown";

export type PolicyEvaluationContext = Readonly<{
  origin: string;
  capability: string;
  providerId?: string;
  modelId?: string;
  correlationId?: string;
}>;

export type PolicyDecision = Readonly<{
  decision: PolicyDecisionType;
  reasonCode: ProtocolReasonCode;
  policyVersion: string;
  machineCode: PolicyDecisionMachineCode;
  correlationId?: string;
}>;

export type PolicyEvaluationOptions = Readonly<{
  signedPolicyBundle?: SignedPolicyBundle;
  keyResolver?: PolicyKeyResolver;
  now?: Date;
  requireSignatureVerification?: boolean;
}>;

type NormalizedEvaluationContext = Readonly<{
  origin: string;
  capability: ProtocolCapability;
  providerId?: string;
  modelId?: string;
  correlationId?: string;
}>;

type RuleMatchSet = readonly string[] | undefined;

const ALLOWED_ORIGIN_SCHEMES = new Set(["https:", "http:", "chrome-extension:"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildDecision(
  decision: PolicyDecisionType,
  machineCode: PolicyDecisionMachineCode,
  policyVersion: string,
  correlationId: string | undefined,
): PolicyDecision {
  return Object.freeze({
    decision,
    machineCode,
    reasonCode: toPolicyReasonCode(machineCode),
    policyVersion,
    ...(correlationId !== undefined ? { correlationId } : {}),
  });
}

function sanitizeCorrelationId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeIdentifier(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return undefined;
  }
  return normalized;
}

function normalizeOrigin(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }

  if (!ALLOWED_ORIGIN_SCHEMES.has(parsed.protocol)) {
    return undefined;
  }

  return parsed.origin;
}

function normalizeContext(input: PolicyEvaluationContext): NormalizedEvaluationContext | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  const origin = normalizeOrigin(input.origin);
  if (origin === undefined) {
    return undefined;
  }

  if (typeof input.capability !== "string" || !isProtocolCapability(input.capability.trim())) {
    return undefined;
  }
  const capabilityCandidate = input.capability.trim();
  if (!isProtocolCapability(capabilityCandidate)) {
    return undefined;
  }
  const capability: ProtocolCapability = capabilityCandidate;

  const providerId = normalizeIdentifier(input.providerId);
  const modelId = normalizeIdentifier(input.modelId);
  const correlationId = sanitizeCorrelationId(input.correlationId);

  return Object.freeze({
    origin,
    capability,
    ...(providerId !== undefined ? { providerId } : {}),
    ...(modelId !== undefined ? { modelId } : {}),
    ...(correlationId !== undefined ? { correlationId } : {}),
  });
}

function hasWildcard(set: RuleMatchSet): boolean {
  return set?.includes("*") ?? false;
}

function matchesRuleSet(set: RuleMatchSet, value: string | undefined): boolean {
  if (set === undefined || set.length === 0) {
    return false;
  }
  if (hasWildcard(set)) {
    return true;
  }
  if (value === undefined) {
    return false;
  }
  return set.includes(value);
}

function isAllowed(set: RuleMatchSet, value: string | undefined): boolean {
  if (set === undefined) {
    return true;
  }
  if (set.length === 0) {
    return false;
  }
  return matchesRuleSet(set, value);
}

function hasAnyAllowRule(bundle: SignedPolicyBundle): boolean {
  const { rules } = bundle.payload;
  const allowSets: RuleMatchSet[] = [
    rules.allowedOrigins,
    rules.allowedCapabilities,
    rules.allowedProviders,
    rules.allowedModels,
  ];

  return allowSets.some((set) => set !== undefined);
}

function toPolicyVersion(bundle: SignedPolicyBundle | undefined): string {
  if (bundle === undefined) {
    return UNKNOWN_POLICY_VERSION;
  }
  return bundle.payload.policyVersion;
}

function denyFromContext(
  machineCode: PolicyDecisionMachineCode,
  bundle: SignedPolicyBundle | undefined,
  context: NormalizedEvaluationContext | undefined,
): PolicyDecision {
  return buildDecision(
    POLICY_DECISION_TYPES.DENY,
    machineCode,
    toPolicyVersion(bundle),
    context?.correlationId,
  );
}

function verifyBundleSignature(
  bundle: SignedPolicyBundle,
  keyResolver: PolicyKeyResolver | undefined,
): PolicyDecisionMachineCode | undefined {
  if (keyResolver === undefined) {
    return POLICY_DECISION_MACHINE_CODES.DENY_KEY_UNAVAILABLE;
  }

  try {
    verifyPolicyBundleSignature(bundle, { keyResolver });
    return undefined;
  } catch (error) {
    if (error instanceof PolicySignatureError) {
      if (error.code === POLICY_SIGNATURE_ERROR_CODES.KEY_NOT_FOUND) {
        return POLICY_DECISION_MACHINE_CODES.DENY_KEY_UNAVAILABLE;
      }
      if (error.code === POLICY_SIGNATURE_ERROR_CODES.INVALID_PUBLIC_KEY) {
        return POLICY_DECISION_MACHINE_CODES.DENY_KEY_UNAVAILABLE;
      }
      return POLICY_DECISION_MACHINE_CODES.DENY_SIGNATURE_INVALID;
    }

    return POLICY_DECISION_MACHINE_CODES.DENY_SIGNATURE_INVALID;
  }
}

function isBundleExpired(bundle: SignedPolicyBundle, now: Date): boolean {
  if (bundle.payload.expiresAt === undefined) {
    return false;
  }
  return now.getTime() > new Date(bundle.payload.expiresAt).getTime();
}

export function evaluatePolicy(
  context: PolicyEvaluationContext,
  options: PolicyEvaluationOptions = {},
): PolicyDecision {
  const normalizedContext = normalizeContext(context);
  const bundle = options.signedPolicyBundle;

  if (normalizedContext === undefined) {
    return denyFromContext(
      POLICY_DECISION_MACHINE_CODES.DENY_EVALUATION_INPUT_INVALID,
      bundle,
      undefined,
    );
  }

  if (bundle === undefined) {
    return denyFromContext(
      POLICY_DECISION_MACHINE_CODES.DENY_POLICY_MISSING,
      undefined,
      normalizedContext,
    );
  }

  const now = options.now ?? new Date();
  if (isBundleExpired(bundle, now)) {
    return denyFromContext(POLICY_DECISION_MACHINE_CODES.DENY_POLICY_EXPIRED, bundle, normalizedContext);
  }

  if (options.requireSignatureVerification ?? true) {
    const signatureFailure = verifyBundleSignature(bundle, options.keyResolver);
    if (signatureFailure !== undefined) {
      return denyFromContext(signatureFailure, bundle, normalizedContext);
    }
  }

  const { rules } = bundle.payload;

  if (matchesRuleSet(rules.deniedOrigins, normalizedContext.origin)) {
    return denyFromContext(POLICY_DECISION_MACHINE_CODES.DENY_ORIGIN_DENIED, bundle, normalizedContext);
  }
  if (matchesRuleSet(rules.deniedCapabilities, normalizedContext.capability)) {
    return denyFromContext(
      POLICY_DECISION_MACHINE_CODES.DENY_CAPABILITY_DENIED,
      bundle,
      normalizedContext,
    );
  }
  if (matchesRuleSet(rules.deniedProviders, normalizedContext.providerId)) {
    return denyFromContext(POLICY_DECISION_MACHINE_CODES.DENY_PROVIDER_DENIED, bundle, normalizedContext);
  }
  if (matchesRuleSet(rules.deniedModels, normalizedContext.modelId)) {
    return denyFromContext(POLICY_DECISION_MACHINE_CODES.DENY_MODEL_DENIED, bundle, normalizedContext);
  }

  if (!hasAnyAllowRule(bundle)) {
    return denyFromContext(
      POLICY_DECISION_MACHINE_CODES.DENY_POLICY_NO_ALLOW_RULES,
      bundle,
      normalizedContext,
    );
  }

  if (!isAllowed(rules.allowedOrigins, normalizedContext.origin)) {
    return denyFromContext(
      POLICY_DECISION_MACHINE_CODES.DENY_ORIGIN_NOT_ALLOWED,
      bundle,
      normalizedContext,
    );
  }
  if (!isAllowed(rules.allowedCapabilities, normalizedContext.capability)) {
    return denyFromContext(
      POLICY_DECISION_MACHINE_CODES.DENY_CAPABILITY_NOT_ALLOWED,
      bundle,
      normalizedContext,
    );
  }
  if (!isAllowed(rules.allowedProviders, normalizedContext.providerId)) {
    return denyFromContext(
      POLICY_DECISION_MACHINE_CODES.DENY_PROVIDER_NOT_ALLOWED,
      bundle,
      normalizedContext,
    );
  }
  if (!isAllowed(rules.allowedModels, normalizedContext.modelId)) {
    return denyFromContext(
      POLICY_DECISION_MACHINE_CODES.DENY_MODEL_NOT_ALLOWED,
      bundle,
      normalizedContext,
    );
  }

  return buildDecision(
    POLICY_DECISION_TYPES.ALLOW,
    POLICY_DECISION_MACHINE_CODES.ALLOW,
    bundle.payload.policyVersion,
    normalizedContext.correlationId,
  );
}
