# @byom-ai/protocol

Wire format and contracts shared by the SDK, extension, bridge, and all adapters. Zero dependencies.

```ts
import { parseEnvelope, ProtocolError, type CanonicalEnvelope } from "@byom-ai/protocol";

const envelope = parseEnvelope<{ messages: Array<{ role: string; content: string }> }>(raw);
console.log(envelope.requestId, envelope.capability, envelope.payload.messages);
```

---

## API Reference

### Envelope

All BYOM messages are wrapped in a `CanonicalEnvelope<TPayload>`:

```ts
type CanonicalEnvelope<TPayload> = {
  protocolVersion: string;
  requestId: string;
  correlationId: string;
  origin: string;
  sessionId: string;
  capability: ProtocolCapability;
  providerId: string;
  modelId: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  payload: TPayload;
}
```

**`parseEnvelope<TPayload>(input: unknown, options?: EnvelopeValidationOptions<TPayload>): CanonicalEnvelope<TPayload>`**

Parse and validate an envelope. Throws `EnvelopeValidationError` on missing fields, expired TTL, or short nonce.

**`safeParseEnvelope<TPayload>(input: unknown, options?: EnvelopeValidationOptions<TPayload>): SafeEnvelopeParseResult<TPayload>`**

Like `parseEnvelope`, but returns `{ success: true, value }` or `{ success: false, error }` instead of throwing.

#### Validation Defaults

| Option | Default |
|--------|---------|
| Max envelope lifetime | 5 minutes (`DEFAULT_MAX_ENVELOPE_LIFETIME_MS`) |
| Max clock skew | 30 seconds (`DEFAULT_MAX_CLOCK_SKEW_MS`) |
| Min nonce length | 16 characters (`DEFAULT_NONCE_MIN_LENGTH`) |

---

### Capabilities

```ts
type ProtocolCapability = "provider.list" | "session.create" | "chat.completions" | "chat.stream"
```

| Function | Description |
|----------|-------------|
| `isProtocolCapability(value: string): boolean` | Check if a string is a valid capability |
| `isCapabilityAllowed(capability: string, allowed?: readonly ProtocolCapability[]): boolean` | Check if a capability is in the allowed list |
| `assertCapabilityAllowed(capability: string, allowed?: readonly ProtocolCapability[]): ProtocolCapability` | Throws `ProtocolError` if not allowed |

```ts
const CAPABILITY_CATALOG: readonly ProtocolCapability[] = ["provider.list", "session.create", "chat.completions", "chat.stream"]
const DEFAULT_ALLOWED_CAPABILITIES: readonly ProtocolCapability[] = CAPABILITY_CATALOG
```

---

### Error Classes

All extend `ProtocolError`:

```ts
class ProtocolError extends Error {
  machineCode: ProtocolMachineCode;
  reasonCode: ProtocolReasonCode;
  retryable: boolean;
  correlationId: string | undefined;
  details: ProtocolErrorDetails | undefined;
}
```

| Class | Machine Code | Retryable |
|-------|-------------|-----------|
| `AuthError` | `BYOM_AUTH_FAILED` | No |
| `PermissionError` | `BYOM_PERMISSION_DENIED` | No |
| `ProviderUnavailableError` | `BYOM_PROVIDER_UNAVAILABLE` | Yes |
| `PolicyViolationError` | `BYOM_POLICY_VIOLATION` | No |
| `TimeoutError` | `BYOM_TIMEOUT` | Yes |
| `TransientNetworkError` | `BYOM_TRANSIENT_NETWORK` | Yes |
| `EnvelopeValidationError` | `BYOM_PROTOCOL_INVALID_ENVELOPE` | No |
| `ProtocolVersionError` | `BYOM_PROTOCOL_UNSUPPORTED_VERSION` | No |

**`isProtocolError(error: unknown): boolean`** — Type guard for `ProtocolError` instances.

---

### Machine Codes (`PROTOCOL_MACHINE_CODES`)

| Code | Constant |
|------|----------|
| `BYOM_AUTH_FAILED` | `AUTH_FAILED` |
| `BYOM_PERMISSION_DENIED` | `PERMISSION_DENIED` |
| `BYOM_PROVIDER_UNAVAILABLE` | `PROVIDER_UNAVAILABLE` |
| `BYOM_POLICY_VIOLATION` | `POLICY_VIOLATION` |
| `BYOM_TIMEOUT` | `TIMEOUT` |
| `BYOM_TRANSIENT_NETWORK` | `TRANSIENT_NETWORK` |
| `BYOM_PROTOCOL_INVALID_ENVELOPE` | `INVALID_ENVELOPE` |
| `BYOM_PROTOCOL_MISSING_REQUIRED_FIELD` | `MISSING_REQUIRED_FIELD` |
| `BYOM_PROTOCOL_ENVELOPE_EXPIRED` | `ENVELOPE_EXPIRED` |
| `BYOM_PROTOCOL_REPLAY_PRONE_METADATA` | `REPLAY_PRONE_METADATA` |
| `BYOM_PROTOCOL_UNSUPPORTED_VERSION` | `UNSUPPORTED_PROTOCOL_VERSION` |
| `BYOM_PROTOCOL_UNSUPPORTED_CAPABILITY` | `UNSUPPORTED_CAPABILITY` |

---

### Reason Codes

```ts
type ProtocolReasonCode =
  | "allow"
  | "auth.invalid" | "auth.expired"
  | "permission.denied"
  | "policy.denied"
  | "provider.unavailable"
  | "request.invalid" | "request.replay_prone" | "request.expired"
  | "protocol.unsupported_version" | "protocol.unsupported_capability" | "protocol.invalid_envelope"
  | "transport.timeout" | "transport.transient_failure"
```

| Function | Description |
|----------|-------------|
| `normalizeReasonCode(input: unknown): ProtocolReasonCode` | Coerce to a valid reason code |
| `isReasonCode(value: string): boolean` | Check if value is a known reason code |

---

### Version Negotiation

```ts
type ParsedProtocolVersion = { raw: string; major: number; minor: number; patch: number }
```

| Function | Description |
|----------|-------------|
| `parseProtocolVersion(version: string): ParsedProtocolVersion` | Parse a semver string |
| `compareProtocolVersions(left, right): number` | Compare two versions (-1, 0, 1) |
| `negotiateProtocolVersion(clientVersion, serverVersion): VersionNegotiationResult` | Negotiate compatible version |

---

### Cloud Connection

Types for cloud provider handshakes:

```ts
type CloudConnectionHandle = {
  connectionHandle: string;
  providerId: string;
  methodId: string;
  extensionId: string;
  origin: string;
  bindingEpoch: number;
  signature: string;
}

type CloudRequestProof = {
  requestId: string;
  nonce: string;
  origin: string;
  connectionHandle: string;
  payloadHash: string;
  proof: string;
}
```

| Function | Description |
|----------|-------------|
| `parseCloudConnectionHandle(input: unknown): CloudConnectionHandle` | Parse and validate a connection handle |
| `parseCloudRequestProof(input: unknown): CloudRequestProof` | Parse and validate a request proof |

---

### Constants

| Constant | Value |
|----------|-------|
| `DEFAULT_PROTOCOL_VERSION` | `"1.0.0"` |
| `DEFAULT_MAX_ENVELOPE_LIFETIME_MS` | `300000` (5 min) |
| `DEFAULT_MAX_CLOCK_SKEW_MS` | `30000` (30 sec) |
| `DEFAULT_NONCE_MIN_LENGTH` | `16` |
