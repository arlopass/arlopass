import process from "node:process";

import { isValidExtensionId } from "../native-host-manifest.js";

const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_ENV_VALUES = new Set(["0", "false", "no", "off"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const CHROME_EXTENSION_ORIGIN_PREFIX = "chrome-extension://";

export type AuthenticatedOriginPolicy = Readonly<{
  authenticatedOrigins: ReadonlySet<string>;
  authenticatedOriginMatcher: (origin: string) => boolean;
  allowLoopbackOrigins: boolean;
}>;

function normalizeNonEmpty(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function parseCsvEnv(value: string | undefined): readonly string[] {
  const normalized = normalizeNonEmpty(value);
  if (normalized === undefined) {
    return [];
  }

  const entries = normalized
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return Array.from(new Set(entries));
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
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

function normalizeHttpOrigin(origin: string | undefined): string | undefined {
  const normalized = normalizeNonEmpty(origin);
  if (normalized === undefined) {
    return undefined;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.origin;
  } catch {
    return undefined;
  }
}

function normalizeChromeExtensionOrigin(origin: string | undefined): string | undefined {
  const normalized = normalizeNonEmpty(origin)?.toLowerCase();
  if (normalized === undefined) {
    return undefined;
  }

  const match = /^chrome-extension:\/\/([a-z]{32})(?:\/.*)?$/.exec(normalized);
  if (!match) {
    return undefined;
  }

  const extensionId = match[1];
  if (extensionId === undefined || !isValidExtensionId(extensionId)) {
    return undefined;
  }
  return `${CHROME_EXTENSION_ORIGIN_PREFIX}${extensionId}`;
}

function normalizeAuthenticatedOrigin(origin: string | undefined): string | undefined {
  const normalized = normalizeNonEmpty(origin);
  if (normalized === undefined) {
    return undefined;
  }

  if (normalized.startsWith(CHROME_EXTENSION_ORIGIN_PREFIX)) {
    return normalizeChromeExtensionOrigin(normalized);
  }
  return normalizeHttpOrigin(normalized);
}

function toChromeExtensionOrigin(extensionId: string | undefined): string | undefined {
  const normalized = normalizeNonEmpty(extensionId)?.toLowerCase();
  if (normalized === undefined || !isValidExtensionId(normalized)) {
    return undefined;
  }
  return `${CHROME_EXTENSION_ORIGIN_PREFIX}${normalized}`;
}

export function isLoopbackOrigin(origin: string): boolean {
  const normalizedOrigin = normalizeHttpOrigin(origin);
  if (normalizedOrigin === undefined) {
    return false;
  }

  const parsed = new URL(normalizedOrigin);
  return LOOPBACK_HOSTS.has(parsed.hostname);
}

export function createAuthenticatedOriginPolicyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AuthenticatedOriginPolicy {
  const authenticatedOrigins = new Set<string>();

  for (const entry of parseCsvEnv(env["ARLOPASS_BRIDGE_AUTHENTICATED_ORIGINS"])) {
    const normalizedOrigin = normalizeAuthenticatedOrigin(entry);
    if (normalizedOrigin !== undefined) {
      authenticatedOrigins.add(normalizedOrigin);
    }
  }

  for (const extensionId of parseCsvEnv(
    env["ARLOPASS_BRIDGE_AUTHENTICATED_EXTENSION_IDS"],
  )) {
    const extensionOrigin = toChromeExtensionOrigin(extensionId);
    if (extensionOrigin !== undefined) {
      authenticatedOrigins.add(extensionOrigin);
    }
  }

  const allowLoopbackOrigins = parseBooleanEnv(
    env["ARLOPASS_BRIDGE_ALLOW_LOOPBACK_ORIGINS"],
    true,
  );
  const authenticatedOriginMatcher = (origin: string): boolean => {
    const normalizedOrigin = normalizeAuthenticatedOrigin(origin);
    if (normalizedOrigin !== undefined && authenticatedOrigins.has(normalizedOrigin)) {
      return true;
    }
    return allowLoopbackOrigins && isLoopbackOrigin(origin);
  };

  return Object.freeze({
    authenticatedOrigins,
    authenticatedOriginMatcher,
    allowLoopbackOrigins,
  });
}
