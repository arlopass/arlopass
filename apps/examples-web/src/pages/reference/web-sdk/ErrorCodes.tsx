import { Stack, Title, Text, Divider } from "@mantine/core";
import { ApiTable, CodeBlock, InlineCode, Callout } from "../../../components";

const importLine = `import {
  BYOMSDKError,
  BYOMStateError,
  BYOMTransportError,
  BYOMTimeoutError,
  BYOMProtocolBoundaryError,
  BYOMInvalidStateTransitionError,
} from "@byom-ai/web-sdk";`;

// ---------------------------------------------------------------------------
// Error hierarchy
// ---------------------------------------------------------------------------

const hierarchyDef = `// Error class hierarchy
BYOMSDKError                          // Base class — all SDK errors extend this
├── BYOMStateError                    // Invalid operation for current state
├── BYOMInvalidStateTransitionError   // Illegal state transition
├── BYOMProtocolBoundaryError         // Protocol envelope validation failure
├── BYOMTransportError                // Transport-layer failure (retryable by default)
└── BYOMTimeoutError                  // Request timed out (retryable by default)`;

const errorProperties = [
  { name: "message", type: "string", description: "Human-readable error description." },
  { name: "machineCode", type: "SDKMachineCode", description: "Stable machine-readable code for programmatic handling." },
  { name: "reasonCode", type: "ProtocolReasonCode", description: "Normalized reason code from the protocol layer." },
  { name: "retryable", type: "boolean", description: "Whether this error can be retried." },
  { name: "correlationId", type: "string | undefined", description: "Correlation ID from the failed request." },
  { name: "details", type: "Record<string, string | number | boolean | null> | undefined", description: "Additional structured metadata about the error." },
  { name: "cause", type: "Error | undefined", description: "Original error that caused this one." },
];

// ---------------------------------------------------------------------------
// SDK machine codes
// ---------------------------------------------------------------------------

const sdkMachineCodes = [
  { name: "BYOM_SDK_INVALID_STATE_TRANSITION", type: "SDK", description: "Attempted an illegal state transition (e.g. connect while already connected)." },
  { name: "BYOM_SDK_INVALID_STATE_OPERATION", type: "SDK", description: "Operation not valid in the current state (e.g. chat.send while disconnected)." },
  { name: "BYOM_SDK_MISSING_PROVIDER_SELECTION", type: "SDK", description: "Chat operation attempted without selecting a provider first." },
  { name: "BYOM_SDK_PROTOCOL_VIOLATION", type: "SDK", description: "Response envelope failed validation." },
  { name: "BYOM_SDK_TRANSPORT_ERROR", type: "SDK", description: "Transport-level failure (network, serialization, etc.)." },
];

// ---------------------------------------------------------------------------
// Protocol machine codes
// ---------------------------------------------------------------------------

const protocolMachineCodes = [
  { name: "BYOM_AUTH_FAILED", type: "Protocol", description: "Authentication failure (invalid credentials)." },
  { name: "BYOM_PERMISSION_DENIED", type: "Protocol", description: "Caller lacks permission for the requested operation." },
  { name: "BYOM_TIMEOUT", type: "Protocol", description: "Request timed out." },
  { name: "BYOM_PROVIDER_UNAVAILABLE", type: "Protocol", description: "Selected provider is offline or unreachable." },
  { name: "BYOM_TRANSIENT_NETWORK", type: "Protocol", description: "Transient network error." },
  { name: "BYOM_POLICY_VIOLATION", type: "Protocol", description: "Request blocked by a policy rule." },
  { name: "BYOM_PROTOCOL_INVALID_ENVELOPE", type: "Protocol", description: "Envelope structure is invalid." },
  { name: "BYOM_PROTOCOL_MISSING_REQUIRED_FIELD", type: "Protocol", description: "A required field is missing from the envelope." },
  { name: "BYOM_PROTOCOL_ENVELOPE_EXPIRED", type: "Protocol", description: "Envelope TTL has expired." },
  { name: "BYOM_PROTOCOL_REPLAY_PRONE_METADATA", type: "Protocol", description: "Envelope metadata suggests a replay attack." },
  { name: "BYOM_PROTOCOL_UNSUPPORTED_VERSION", type: "Protocol", description: "Protocol version not supported." },
  { name: "BYOM_PROTOCOL_UNSUPPORTED_CAPABILITY", type: "Protocol", description: "Requested capability not supported." },
];

// ---------------------------------------------------------------------------
// Reason codes
// ---------------------------------------------------------------------------

const reasonCodes = [
  { name: "allow", type: "Success", description: "Operation succeeded." },
  { name: "auth.invalid", type: "Auth", description: "Invalid credentials." },
  { name: "auth.expired", type: "Auth", description: "Credentials have expired." },
  { name: "permission.denied", type: "Auth", description: "Insufficient permissions." },
  { name: "policy.denied", type: "Policy", description: "Blocked by policy." },
  { name: "provider.unavailable", type: "Provider", description: "Provider is offline or unreachable." },
  { name: "request.invalid", type: "Request", description: "Malformed request." },
  { name: "request.replay_prone", type: "Request", description: "Request metadata suggests a replay." },
  { name: "request.expired", type: "Request", description: "Request envelope has expired." },
  { name: "protocol.unsupported_version", type: "Protocol", description: "Protocol version mismatch." },
  { name: "protocol.unsupported_capability", type: "Protocol", description: "Capability not recognized." },
  { name: "protocol.invalid_envelope", type: "Protocol", description: "Envelope validation failed." },
  { name: "transport.timeout", type: "Transport", description: "Operation timed out." },
  { name: "transport.cancelled", type: "Transport", description: "Operation was cancelled (e.g. AbortSignal)." },
  { name: "transport.transient_failure", type: "Transport", description: "Temporary network or transport issue." },
];

// ---------------------------------------------------------------------------
// Retryable classification
// ---------------------------------------------------------------------------

const retryableExample = `if (error instanceof BYOMSDKError && error.retryable) {
  await retry();
}`;

export default function ErrorCodes() {
  return (
    <Stack gap="lg">
      <Title order={2}>Error Codes</Title>
      <Text>
        Every error thrown by the SDK is an instance of{" "}
        <InlineCode>BYOMSDKError</InlineCode> (or a subclass). Errors carry
        structured metadata for programmatic handling.
      </Text>

      <CodeBlock code={importLine} language="tsx" />

      {/* Hierarchy */}
      <Divider />
      <Title order={3}>Error hierarchy</Title>
      <CodeBlock code={hierarchyDef} language="text" />

      <Title order={3}>Error properties</Title>
      <Text>All error subclasses inherit these properties from <InlineCode>BYOMSDKError</InlineCode>.</Text>
      <ApiTable data={errorProperties} title="BYOMSDKError" />

      {/* SDK machine codes */}
      <Divider />
      <Title order={3}>SDK machine codes</Title>
      <Text>
        Codes prefixed with <InlineCode>BYOM_SDK_</InlineCode> originate in the
        client SDK.
      </Text>
      <ApiTable data={sdkMachineCodes} title="SDK_MACHINE_CODES" />

      {/* Protocol machine codes */}
      <Divider />
      <Title order={3}>Protocol machine codes</Title>
      <Text>
        Codes prefixed with <InlineCode>BYOM_</InlineCode> or{" "}
        <InlineCode>BYOM_PROTOCOL_</InlineCode> originate in the protocol layer
        or extension.
      </Text>
      <ApiTable data={protocolMachineCodes} title="PROTOCOL_MACHINE_CODES" />

      {/* Reason codes */}
      <Divider />
      <Title order={3}>Reason codes</Title>
      <Text>
        Normalized reason codes provide a human-readable classification. The SDK
        normalizes aliases (e.g. <InlineCode>"timeout"</InlineCode> →{" "}
        <InlineCode>"transport.timeout"</InlineCode>).
      </Text>
      <ApiTable data={reasonCodes} title="ProtocolReasonCode" />

      {/* Retryable classification */}
      <Divider />
      <Title order={3}>Retryable vs non-retryable</Title>
      <Text>
        Every error has a <InlineCode>retryable</InlineCode> boolean. Use it
        to decide whether to surface a retry button or fail permanently.
      </Text>

      <ApiTable data={[
        { name: "BYOMTransportError", type: "retryable: true", description: "Transport failures are retryable by default." },
        { name: "BYOMTimeoutError", type: "retryable: true", description: "Timeouts are retryable by default." },
        { name: "BYOMStateError", type: "retryable: false", description: "State errors indicate logic bugs — not retryable." },
        { name: "BYOMInvalidStateTransitionError", type: "retryable: false", description: "Invalid transitions are logic bugs — not retryable." },
        { name: "BYOMProtocolBoundaryError", type: "retryable: false", description: "Protocol violations typically require a code fix." },
      ]} title="Default retryable classification" />

      <CodeBlock code={retryableExample} language="tsx" />

      <Callout type="warning" title="Retryable is a hint">
        The <InlineCode>retryable</InlineCode> flag is a default. The extension
        or adapter may override it based on the specific failure context.
      </Callout>
    </Stack>
  );
}
