const SEMVER_PATTERN =
  /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export type ProtocolSemver = `${number}.${number}.${number}`;

export type ParsedProtocolVersion = Readonly<{
  raw: string;
  major: number;
  minor: number;
  patch: number;
}>;

export type ProtocolVersionRange = Readonly<{
  min: ProtocolSemver;
  max: ProtocolSemver;
}>;

export type VersionNegotiationSuccess = Readonly<{
  ok: true;
  version: ParsedProtocolVersion;
}>;

export type VersionNegotiationFailure = Readonly<{
  ok: false;
  reason: "unsupported_major" | "no_compatible_version";
  client: ParsedProtocolVersion;
  server: ParsedProtocolVersion;
}>;

export type VersionNegotiationResult =
  | VersionNegotiationSuccess
  | VersionNegotiationFailure;

export function parseProtocolVersion(version: string): ParsedProtocolVersion {
  const match = SEMVER_PATTERN.exec(version);
  if (!match?.groups) {
    throw new TypeError(`Invalid protocol version: ${version}`);
  }

  const majorPart = match.groups.major;
  const minorPart = match.groups.minor;
  const patchPart = match.groups.patch;

  if (majorPart === undefined || minorPart === undefined || patchPart === undefined) {
    throw new TypeError(`Invalid protocol version: ${version}`);
  }

  const major = Number.parseInt(majorPart, 10);
  const minor = Number.parseInt(minorPart, 10);
  const patch = Number.parseInt(patchPart, 10);

  return {
    raw: `${major}.${minor}.${patch}`,
    major,
    minor,
    patch,
  };
}

export function compareProtocolVersions(
  left: ParsedProtocolVersion,
  right: ParsedProtocolVersion,
): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }

  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }

  return left.patch - right.patch;
}

export function negotiateProtocolVersion(
  clientVersion: string,
  serverVersion: string,
): VersionNegotiationResult {
  const client = parseProtocolVersion(clientVersion);
  const server = parseProtocolVersion(serverVersion);

  if (client.major !== server.major) {
    return {
      ok: false,
      reason: "unsupported_major",
      client,
      server,
    };
  }

  const negotiated =
    compareProtocolVersions(client, server) <= 0 ? client : server;

  return {
    ok: true,
    version: negotiated,
  };
}

export function isProtocolVersionInRange(
  version: string,
  range: ProtocolVersionRange,
): boolean {
  const parsedVersion = parseProtocolVersion(version);
  const min = parseProtocolVersion(range.min);
  const max = parseProtocolVersion(range.max);

  return (
    compareProtocolVersions(parsedVersion, min) >= 0 &&
    compareProtocolVersions(parsedVersion, max) <= 0
  );
}
