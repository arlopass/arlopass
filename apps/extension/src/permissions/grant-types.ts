import {
  CAPABILITY_CATALOG,
  isProtocolCapability,
  type ProtocolCapability,
} from "@arlopass/protocol";

export const GRANT_SCOPE_WILDCARD = "*" as const;

export const GRANT_TYPES = [
  "one-time",
  "session",
  "persistent",
] as const;

export const WILDCARD_COMPATIBLE_CAPABILITIES = [
  "provider.list",
  "session.create",
] as const satisfies readonly ProtocolCapability[];

const WILDCARD_COMPATIBLE_CAPABILITY_SET: ReadonlySet<ProtocolCapability> =
  new Set(WILDCARD_COMPATIBLE_CAPABILITIES);

const ALLOWED_ORIGIN_SCHEMES = new Set(["http:", "https:", "chrome-extension:"]);

export const DEFAULT_SESSION_GRANT_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_ONE_TIME_GRANT_TTL_MS = 5 * 60 * 1000;

export type GrantType = (typeof GRANT_TYPES)[number];
export type GrantScope = string | typeof GRANT_SCOPE_WILDCARD;

export type Grant = Readonly<{
  id: string;
  origin: string;
  providerId: GrantScope;
  modelId: GrantScope;
  capabilities: readonly ProtocolCapability[];
  grantType: GrantType;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  consumedAt?: number;
}>;

export type GrantKey = Readonly<{
  origin: string;
  providerId: GrantScope;
  modelId: GrantScope;
  capability: ProtocolCapability;
}>;

export type GrantLookup = Readonly<{
  origin: string;
  providerId: string;
  modelId: string;
  capability: ProtocolCapability;
}>;

export type GrantRevocationReason =
  | "user"
  | "expired"
  | "session-ended"
  | "superseded";

export class GrantValidationError extends Error {
  readonly code:
    | "invalid-origin"
    | "invalid-capabilities"
    | "invalid-scope"
    | "invalid-grant-type";

  constructor(
    message: string,
    code:
      | "invalid-origin"
      | "invalid-capabilities"
      | "invalid-scope"
      | "invalid-grant-type",
    options: Readonly<{ cause?: Error }> = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "GrantValidationError";
    this.code = code;
  }
}

export function isGrantType(value: string): value is GrantType {
  return GRANT_TYPES.includes(value as GrantType);
}

export function isGrantScopeWildcard(value: string): value is typeof GRANT_SCOPE_WILDCARD {
  return value === GRANT_SCOPE_WILDCARD;
}

export function isWildcardCompatibleCapability(capability: ProtocolCapability): boolean {
  return WILDCARD_COMPATIBLE_CAPABILITY_SET.has(capability);
}

export function normalizeOrigin(origin: string): string {
  const trimmed = origin.trim();
  if (trimmed.length === 0) {
    throw new GrantValidationError(
      "Origin must be a non-empty URL in scheme://host[:port] format.",
      "invalid-origin",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (cause) {
    const causeError = cause instanceof Error ? cause : undefined;
    throw new GrantValidationError(
      `Origin "${origin}" is not a valid URL.`,
      "invalid-origin",
      causeError !== undefined ? { cause: causeError } : undefined,
    );
  }

  if (!ALLOWED_ORIGIN_SCHEMES.has(parsed.protocol)) {
    throw new GrantValidationError(
      `Origin scheme "${parsed.protocol}" is not allowed.`,
      "invalid-origin",
    );
  }

  if (parsed.origin === "null") {
    throw new GrantValidationError(
      `Origin "${origin}" cannot be normalized to a concrete origin.`,
      "invalid-origin",
    );
  }

  const hasPath = parsed.pathname !== "/";
  if (hasPath || parsed.search.length > 0 || parsed.hash.length > 0) {
    throw new GrantValidationError(
      `Origin "${origin}" must not include path, query, or hash components.`,
      "invalid-origin",
    );
  }

  return parsed.origin;
}

export function normalizeCapabilities(
  capabilities: readonly ProtocolCapability[],
): readonly ProtocolCapability[] {
  if (capabilities.length === 0) {
    throw new GrantValidationError(
      "At least one capability is required to create a grant.",
      "invalid-capabilities",
    );
  }

  const capabilitySet = new Set<ProtocolCapability>();
  for (const capability of capabilities) {
    if (!isProtocolCapability(capability)) {
      throw new GrantValidationError(
        `Unsupported capability "${String(capability)}".`,
        "invalid-capabilities",
      );
    }

    capabilitySet.add(capability);
  }

  const sorted = CAPABILITY_CATALOG.filter((capability) => capabilitySet.has(capability));
  return sorted;
}

export function normalizeGrantScopeValue(
  value: string,
  fieldName: "providerId" | "modelId",
): GrantScope {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new GrantValidationError(
      `${fieldName} must be a non-empty identifier or "*".`,
      "invalid-scope",
    );
  }

  if (trimmed === GRANT_SCOPE_WILDCARD) {
    return GRANT_SCOPE_WILDCARD;
  }

  return trimmed;
}

export function canonicalizeGrantTarget(input: {
  origin: string;
  providerId: string;
  modelId: string;
  capabilities: readonly ProtocolCapability[];
}): Readonly<{
  origin: string;
  providerId: GrantScope;
  modelId: GrantScope;
  capabilities: readonly ProtocolCapability[];
}> {
  const capabilities = normalizeCapabilities(input.capabilities);
  const origin = normalizeOrigin(input.origin);
  const providerId = normalizeGrantScopeValue(input.providerId, "providerId");
  const modelId = normalizeGrantScopeValue(input.modelId, "modelId");

  const hasWildcardCompatible = capabilities.some((capability) =>
    isWildcardCompatibleCapability(capability),
  );
  const hasScopeLockedCapability = capabilities.some(
    (capability) => !isWildcardCompatibleCapability(capability),
  );

  if (hasWildcardCompatible && hasScopeLockedCapability) {
    throw new GrantValidationError(
      "A single grant cannot mix wildcard-only and provider/model-scoped capabilities.",
      "invalid-capabilities",
    );
  }

  if (hasWildcardCompatible) {
    return {
      origin,
      providerId: GRANT_SCOPE_WILDCARD,
      modelId: GRANT_SCOPE_WILDCARD,
      capabilities,
    };
  }

  if (
    providerId === GRANT_SCOPE_WILDCARD ||
    modelId === GRANT_SCOPE_WILDCARD
  ) {
    throw new GrantValidationError(
      "Wildcards are only supported for provider.list and session.create capabilities.",
      "invalid-scope",
    );
  }

  return {
    origin,
    providerId,
    modelId,
    capabilities,
  };
}

export function createCapabilityIndexKey(input: GrantKey): string {
  return JSON.stringify([
    input.origin,
    input.providerId,
    input.modelId,
    input.capability,
  ]);
}

export function cloneGrant(grant: Grant): Grant {
  return {
    id: grant.id,
    origin: grant.origin,
    providerId: grant.providerId,
    modelId: grant.modelId,
    capabilities: [...grant.capabilities],
    grantType: grant.grantType,
    createdAt: grant.createdAt,
    updatedAt: grant.updatedAt,
    ...(grant.expiresAt !== undefined ? { expiresAt: grant.expiresAt } : {}),
    ...(grant.consumedAt !== undefined ? { consumedAt: grant.consumedAt } : {}),
  };
}

export function sameCapabilities(
  left: readonly ProtocolCapability[],
  right: readonly ProtocolCapability[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}
