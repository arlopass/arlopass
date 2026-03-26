import process from "node:process";

export type CloudCanaryAllowlist = Readonly<{
  extensionIds: readonly string[];
  origins: readonly string[];
}>;

export type CloudExecutionContext = Readonly<{
  extensionId?: string;
  origin?: string;
}>;

export type CloudFeatureFlags = Readonly<{
  cloudBrokerV2Enabled: boolean;
  cloudMethodAllowlist: Readonly<Record<string, boolean>>;
  cloudCanaryAllowlist?: CloudCanaryAllowlist;
}>;

const EMPTY_METHOD_ALLOWLIST: Readonly<Record<string, boolean>> = Object.freeze(
  {},
);
const EMPTY_ALLOWLIST_ENTRIES: readonly string[] = Object.freeze([]);
const EMPTY_CLOUD_CANARY_ALLOWLIST: CloudCanaryAllowlist = Object.freeze({
  extensionIds: EMPTY_ALLOWLIST_ENTRIES,
  origins: EMPTY_ALLOWLIST_ENTRIES,
});

const PROVIDER_METHOD_FLAG_ENV_MAP: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    BYOM_CLOUD_PROVIDER_ANTHROPIC_API_KEY_ENABLED: Object.freeze([
      "anthropic.api_key",
    ]),
    BYOM_CLOUD_PROVIDER_ANTHROPIC_OAUTH_ENABLED: Object.freeze([
      "anthropic.oauth_subscription",
    ]),
    BYOM_CLOUD_PROVIDER_FOUNDRY_ENABLED: Object.freeze([
      "foundry.api_key",
    ]),
    BYOM_CLOUD_PROVIDER_VERTEX_ENABLED: Object.freeze([
      "vertex.api_key",
      "vertex.service_account",
      "vertex.workload_identity_federation",
    ]),
    BYOM_CLOUD_PROVIDER_BEDROCK_ENABLED: Object.freeze([
      "bedrock.api_key",
      "bedrock.assume_role",
      "bedrock.aws_access_key",
    ]),
    BYOM_CLOUD_PROVIDER_OPENAI_ENABLED: Object.freeze([
      "openai.api_key",
    ]),
    BYOM_CLOUD_PROVIDER_PERPLEXITY_ENABLED: Object.freeze([
      "perplexity.api_key",
    ]),
    BYOM_CLOUD_PROVIDER_GEMINI_ENABLED: Object.freeze([
      "gemini.api_key",
      "gemini.oauth_access_token",
    ]),
  });

const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_ENV_VALUES = new Set(["0", "false", "no", "off"]);
const LEGACY_METHOD_ID_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "foundry.aad_client_credentials": "foundry.api_key",
});

export const DEFAULT_CLOUD_FEATURE_FLAGS: CloudFeatureFlags = Object.freeze({
  cloudBrokerV2Enabled: false,
  cloudMethodAllowlist: EMPTY_METHOD_ALLOWLIST,
  cloudCanaryAllowlist: EMPTY_CLOUD_CANARY_ALLOWLIST,
});

function normalizeNonEmpty(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOrigin(value: string | undefined): string | undefined {
  const normalized = normalizeNonEmpty(value);
  if (normalized === undefined) {
    return undefined;
  }

  try {
    return new URL(normalized).origin;
  } catch {
    return normalized.replace(/\/+$/, "");
  }
}

function toNormalizedSet(
  values: readonly string[],
  normalize: (value: string | undefined) => string | undefined,
): ReadonlySet<string> {
  const normalized = new Set<string>();
  for (const entry of values) {
    const candidate = normalize(entry);
    if (candidate !== undefined) {
      normalized.add(candidate);
    }
  }
  return normalized;
}

function parseBooleanEnv(value: string | undefined, fallback = false): boolean {
  const normalized = normalizeNonEmpty(value)?.toLowerCase();
  if (normalized === undefined) {
    return fallback;
  }
  if (TRUE_ENV_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_ENV_VALUES.has(normalized)) {
    return false;
  }
  return fallback;
}

function createMethodAllowlist(
  methodIds: readonly string[],
): Readonly<Record<string, boolean>> {
  if (methodIds.length === 0) {
    return EMPTY_METHOD_ALLOWLIST;
  }

  const normalized = new Set<string>();
  for (const methodId of methodIds) {
    const normalizedMethodId = normalizeNonEmpty(methodId);
    const candidate =
      normalizedMethodId !== undefined
        ? (LEGACY_METHOD_ID_ALIASES[normalizedMethodId] ?? normalizedMethodId)
        : undefined;
    if (candidate !== undefined) {
      normalized.add(candidate);
    }
  }

  if (normalized.size === 0) {
    return EMPTY_METHOD_ALLOWLIST;
  }

  const allowlist: Record<string, boolean> = {};
  for (const methodId of normalized) {
    allowlist[methodId] = true;
  }
  return Object.freeze(allowlist);
}

export function parseCsvEnv(value: string | undefined): readonly string[] {
  const normalized = normalizeNonEmpty(value);
  if (normalized === undefined) {
    return EMPTY_ALLOWLIST_ENTRIES;
  }

  const values = normalized
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (values.length === 0) {
    return EMPTY_ALLOWLIST_ENTRIES;
  }

  return Object.freeze(Array.from(new Set(values)));
}

export function isCanaryAllowed(
  context: CloudExecutionContext,
  allowlist: CloudCanaryAllowlist,
): boolean {
  const extensionAllowlist = toNormalizedSet(
    allowlist.extensionIds,
    normalizeNonEmpty,
  );
  const originAllowlist = toNormalizedSet(allowlist.origins, normalizeOrigin);

  if (extensionAllowlist.size === 0 && originAllowlist.size === 0) {
    return true;
  }

  if (extensionAllowlist.size > 0) {
    const extensionId = normalizeNonEmpty(context.extensionId);
    if (extensionId === undefined || !extensionAllowlist.has(extensionId)) {
      return false;
    }
  }

  if (originAllowlist.size > 0) {
    const origin = normalizeOrigin(context.origin);
    if (origin === undefined || !originAllowlist.has(origin)) {
      return false;
    }
  }

  return true;
}

export function createCloudFeatureFlagsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CloudFeatureFlags {
  const enabledMethodIds = new Set<string>(parseCsvEnv(env["BYOM_CLOUD_METHOD_ALLOWLIST"]));
  for (const [envKey, methodIds] of Object.entries(PROVIDER_METHOD_FLAG_ENV_MAP)) {
    if (!parseBooleanEnv(env[envKey], false)) {
      continue;
    }
    for (const methodId of methodIds) {
      enabledMethodIds.add(methodId);
    }
  }

  const cloudCanaryAllowlist: CloudCanaryAllowlist = Object.freeze({
    extensionIds: parseCsvEnv(env["BYOM_CLOUD_CANARY_EXTENSION_IDS"]),
    origins: parseCsvEnv(env["BYOM_CLOUD_CANARY_ORIGINS"]),
  });

  return Object.freeze({
    cloudBrokerV2Enabled: parseBooleanEnv(
      env["BYOM_CLOUD_BROKER_V2_ENABLED"],
      false,
    ),
    cloudMethodAllowlist: createMethodAllowlist(Array.from(enabledMethodIds)),
    cloudCanaryAllowlist,
  });
}

export function isCloudMethodEnabled(
  flags: CloudFeatureFlags,
  methodId: string | undefined,
): boolean {
  if (typeof methodId !== "string") {
    return false;
  }

  const normalizedMethodId = methodId.trim();
  if (normalizedMethodId.length === 0) {
    return false;
  }

  const canonicalMethodId = LEGACY_METHOD_ID_ALIASES[normalizedMethodId] ?? normalizedMethodId;
  return flags.cloudMethodAllowlist[canonicalMethodId] === true;
}

export function isCloudExecutionEnabled(
  flags: CloudFeatureFlags,
  methodId: string | undefined,
  context: CloudExecutionContext = {},
): boolean {
  if (!flags.cloudBrokerV2Enabled) {
    return false;
  }

  if (!isCloudMethodEnabled(flags, methodId)) {
    return false;
  }

  return isCanaryAllowed(
    context,
    flags.cloudCanaryAllowlist ?? EMPTY_CLOUD_CANARY_ALLOWLIST,
  );
}
