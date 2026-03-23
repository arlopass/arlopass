export const CAPABILITY_CATALOG = [
  "provider.list",
  "session.create",
  "chat.completions",
  "chat.stream",
] as const;

export type ProtocolCapability = (typeof CAPABILITY_CATALOG)[number];

const CAPABILITY_SET: ReadonlySet<string> = new Set(CAPABILITY_CATALOG);

export const DEFAULT_ALLOWED_CAPABILITIES: readonly ProtocolCapability[] =
  CAPABILITY_CATALOG;

export function isProtocolCapability(value: string): value is ProtocolCapability {
  return CAPABILITY_SET.has(value);
}

export function isCapabilityAllowed(
  capability: string,
  allowedCapabilities: readonly ProtocolCapability[] = DEFAULT_ALLOWED_CAPABILITIES,
): capability is ProtocolCapability {
  if (!isProtocolCapability(capability)) {
    return false;
  }

  return allowedCapabilities.includes(capability);
}

export function assertCapabilityAllowed(
  capability: string,
  allowedCapabilities: readonly ProtocolCapability[] = DEFAULT_ALLOWED_CAPABILITIES,
): ProtocolCapability {
  if (!isCapabilityAllowed(capability, allowedCapabilities)) {
    throw new TypeError(`Unsupported capability: ${capability}`);
  }

  return capability;
}
