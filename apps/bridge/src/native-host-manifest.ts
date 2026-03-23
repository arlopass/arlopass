export const BRIDGE_HOST_NAME = "com.byom.bridge" as const;
export const HOST_TYPE = "stdio" as const;

const EXTENSION_ID_PATTERN = /^[a-z]{32}$/;

/**
 * Structure matching the Chrome native messaging host manifest schema.
 */
export type NativeHostManifest = Readonly<{
  name: typeof BRIDGE_HOST_NAME;
  description: string;
  path: string;
  type: typeof HOST_TYPE;
  allowed_origins: readonly string[];
}>;

export type AllowlistEntry = Readonly<{
  extensionId: string;
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
  return EXTENSION_ID_PATTERN.test(id);
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
      `Extension ID "${extensionId}" has invalid format (expected 32 lowercase a-z characters).`,
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
 * Builds the native messaging host manifest JSON object from a pinned
 * binary path and explicit extension ID allowlist.
 */
export function buildNativeHostManifest(
  hostBinaryPath: string,
  allowlist: readonly AllowlistEntry[],
): NativeHostManifest {
  return {
    name: BRIDGE_HOST_NAME,
    description: "BYOM AI Bridge — Secure native messaging host",
    path: hostBinaryPath,
    type: HOST_TYPE,
    allowed_origins: allowlist.map((entry) =>
      buildAllowedOrigin(entry.extensionId),
    ),
  };
}
