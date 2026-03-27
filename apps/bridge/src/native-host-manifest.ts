export const BRIDGE_HOST_NAME = "com.byom.bridge" as const;
export const HOST_TYPE = "stdio" as const;

/** Chromium extension IDs: 32 lowercase chars in the range a-p. */
const CHROMIUM_EXTENSION_ID_PATTERN = /^[a-p]{32}$/;

/** Firefox add-on IDs: email-style (addon@domain) or {uuid}. */
const FIREFOX_ADDON_ID_PATTERN =
  /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$|^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/;

/**
 * Structure matching the Chrome/Edge native messaging host manifest schema.
 */
export type NativeHostManifest = Readonly<{
  name: typeof BRIDGE_HOST_NAME;
  description: string;
  path: string;
  type: typeof HOST_TYPE;
  allowed_origins: readonly string[];
}>;

/**
 * Structure matching the Firefox native messaging host manifest schema.
 */
export type FirefoxNativeHostManifest = Readonly<{
  name: typeof BRIDGE_HOST_NAME;
  description: string;
  path: string;
  type: typeof HOST_TYPE;
  allowed_extensions: readonly string[];
}>;

export type AllowlistEntry = Readonly<{
  extensionId: string;
  browser?: "chrome" | "edge" | "firefox";
  description?: string;
}>;

export class ManifestValidationError extends Error {
  readonly reasonCode = "auth.invalid" as const;

  constructor(message: string) {
    super(message);
    this.name = "ManifestValidationError";
  }
}

export function isValidExtensionId(id: string): boolean {
  return CHROMIUM_EXTENSION_ID_PATTERN.test(id) || FIREFOX_ADDON_ID_PATTERN.test(id);
}

export function isChromiumExtensionId(id: string): boolean {
  return CHROMIUM_EXTENSION_ID_PATTERN.test(id);
}

export function isFirefoxAddonId(id: string): boolean {
  return FIREFOX_ADDON_ID_PATTERN.test(id);
}

export function buildAllowedOrigin(extensionId: string): string {
  return `chrome-extension://${extensionId}/`;
}

/**
 * Asserts that the given extension ID is syntactically valid and present
 * in the explicit allowlist.  Throws ManifestValidationError on any failure.
 */
export function assertExtensionIdInAllowlist(
  extensionId: string,
  allowlist: readonly AllowlistEntry[],
): void {
  if (!isValidExtensionId(extensionId)) {
    throw new ManifestValidationError(
      `Extension ID "${extensionId}" has invalid format (expected Chromium 32-char a-p or Firefox addon@domain / {uuid}).`,
    );
  }

  const isAllowed = allowlist.some((entry) => entry.extensionId === extensionId);
  if (!isAllowed) {
    throw new ManifestValidationError(
      `Extension ID "${extensionId}" is not in the allowlist.`,
    );
  }
}

/**
 * Builds the Chromium (Chrome/Edge) native messaging host manifest.
 */
export function buildNativeHostManifest(
  hostBinaryPath: string,
  allowlist: readonly AllowlistEntry[],
): NativeHostManifest {
  const chromiumEntries = allowlist.filter(
    (entry) => entry.browser !== "firefox" && isChromiumExtensionId(entry.extensionId),
  );
  return {
    name: BRIDGE_HOST_NAME,
    description: "BYOM AI Bridge — Secure native messaging host",
    path: hostBinaryPath,
    type: HOST_TYPE,
    allowed_origins: chromiumEntries.map((entry) =>
      buildAllowedOrigin(entry.extensionId),
    ),
  };
}

/**
 * Builds the Firefox native messaging host manifest.
 */
export function buildFirefoxNativeHostManifest(
  hostBinaryPath: string,
  allowlist: readonly AllowlistEntry[],
): FirefoxNativeHostManifest {
  const firefoxEntries = allowlist.filter(
    (entry) => entry.browser === "firefox" || isFirefoxAddonId(entry.extensionId),
  );
  return {
    name: BRIDGE_HOST_NAME,
    description: "BYOM AI Bridge — Secure native messaging host",
    path: hostBinaryPath,
    type: HOST_TYPE,
    allowed_extensions: firefoxEntries.map((entry) => entry.extensionId),
  };
}
