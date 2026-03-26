# @byom-ai/adapter-runtime

Load, host, sandbox, and health-check BYOM AI provider adapters. Manages the full lifecycle from manifest validation through sandboxed execution.

```ts
import { loadAdapter, AdapterHost } from "@byom-ai/adapter-runtime";

const loaded = await loadAdapter(manifestJson, () => new OllamaAdapter(), {
  requireSignatureVerification: false,
});

const host = new AdapterHost();
await host.start();
await host.registerAdapter(loaded);

const health = host.getAdapterHealth("ollama");
console.log(health.state); // "running"

const response = await host.callAdapter("ollama", async (adapter, sandbox) => {
  return adapter.contract.sendMessage("session-1", "Hello");
});

await host.shutdown();
```

---

## API Reference

### `AdapterContract`

Interface every adapter must implement:

```ts
interface AdapterContract {
  readonly manifest: AdapterManifest;
  describeCapabilities(): readonly ProtocolCapability[];
  listModels(): Promise<readonly string[]>;
  createSession(options?: Record<string, unknown>): Promise<string>;
  sendMessage(sessionId: string, message: string): Promise<string>;
  streamMessage(sessionId: string, message: string, onChunk: (chunk: string) => void): Promise<void>;
  healthCheck(): Promise<boolean>;
  shutdown(): Promise<void>;
}
```

### `CloudAdapterContractV2`

Extended contract for cloud providers with connection lifecycle:

```ts
interface CloudAdapterContractV2 extends AdapterContract {
  listConnectionMethods(): readonly ConnectionMethodDescriptor[];
  beginConnect(input: BeginConnectInput): Promise<BeginConnectResult>;
  completeConnect(input: CompleteConnectInput): Promise<CompleteConnectResult>;
  validateCredentialRef(input: ValidateCredentialRefInput): Promise<ValidationResult>;
  revokeCredentialRef(input: RevokeCredentialRefInput): Promise<void>;
  discoverModels(ctx: CloudConnectionContext): Promise<readonly ModelDescriptor[]>;
  discoverCapabilities(ctx: CloudConnectionContext): Promise<CapabilityDescriptor>;
}
```

**`isCloudAdapterContractV2(candidate: unknown): boolean`** — Type guard.

---

### `AdapterManifest`

Declarative manifest every adapter ships:

```ts
type AdapterManifest = {
  schemaVersion: string;                              // "1.0.0"
  providerId: string;
  version: string;
  displayName: string;
  authType: "none" | "api_key" | "oauth2" | "local";
  capabilities: readonly ProtocolCapability[];
  requiredPermissions: readonly string[];
  egressRules: readonly AdapterEgressRule[];
  riskLevel: "low" | "medium" | "high";
  signingKeyId: string;
  connectionMethods?: readonly ConnectionMethodDescriptor[];
  metadata?: Record<string, string>;
}

type AdapterEgressRule = { host: string; port?: number; protocol: "https" | "http" | "tcp" }
```

| Function | Description |
|----------|-------------|
| `parseAdapterManifest(input: unknown): AdapterManifest` | Parse and validate, throws `ManifestValidationError` |
| `safeParseAdapterManifest(input: unknown): SafeParseResult<AdapterManifest>` | Non-throwing variant |
| `isAdapterManifest(input: unknown): boolean` | Type guard |
| `parseConnectionMethods(input: unknown, options?): readonly ConnectionMethodDescriptor[]` | Parse connection method descriptors |

---

### `AdapterHost`

Manages running adapters with health checks, restart logic, and sandbox enforcement.

```ts
const host = new AdapterHost(options?: AdapterHostOptions);
```

| Method | Returns | Description |
|--------|---------|-------------|
| `start()` | `Promise<void>` | Start the host runtime |
| `registerAdapter(loaded)` | `Promise<void>` | Register a loaded adapter |
| `deregisterAdapter(providerId)` | `Promise<void>` | Remove an adapter |
| `getAdapterHealth(providerId)` | `AdapterHealthStatus` | Get adapter health |
| `listAdapterHealth()` | `readonly AdapterHealthStatus[]` | Health of all adapters |
| `getManifest(providerId)` | `AdapterManifest` | Get adapter manifest |
| `getSandboxContext(providerId)` | `SandboxContext` | Get sandbox context |
| `callAdapter(providerId, fn)` | `Promise<T>` | Execute within adapter sandbox |
| `shutdown()` | `Promise<void>` | Stop all adapters |
| `isStarted` | `boolean` | Whether host is running |

```ts
type AdapterState = "pending" | "starting" | "running" | "degraded" | "stopped" | "failed"

type AdapterHealthStatus = {
  state: AdapterState;
  providerId: string;
  lastHealthCheck?: string;
  restartCount: number;
  error?: string;
}
```

---

### `loadAdapter(manifestInput, factory, options?): Promise<LoadedAdapter>`

Load and validate an adapter from its manifest and factory function.

Strict cloud-contract enforcement is opt-in via manifest:

- If `connectionMethods` contains one or more descriptors, the contract must satisfy `CloudAdapterContractV2`, and `listConnectionMethods()` must match the manifest descriptors exactly.
- If `connectionMethods` is omitted (or present but empty), runtime preserves legacy compatibility and only requires `AdapterContract`.

```ts
type LoadedAdapter = {
  providerId: string;
  manifest: AdapterManifest;
  contract: AdapterContract;
}
```

---

### Artifact Signing

Sign and verify adapter artifacts with Ed25519:

| Function | Description |
|----------|-------------|
| `signArtifact(payload, options): SignedArtifact` | Sign an adapter artifact |
| `verifyArtifactSignature(artifact, options): ArtifactVerificationResult` | Verify signature against key resolver |
| `computeArtifactDigest(content): string` | Compute content digest |
| `parseArtifactSignature(input): ArtifactSignature` | Parse a raw signature |
| `canonicalizeArtifactPayload(artifact): string` | Canonical form for signing |

```ts
type SignedArtifact = {
  providerId: string;
  version: string;
  digest: string;
  signature: ArtifactSignature;
}

type ArtifactSignature = {
  algorithm: "ed25519";
  keyId: string;
  signedAt: string;
  digest: string;
  value: string;
}

interface ArtifactKeyResolver {
  resolvePublicKey(keyId: string): string | undefined;
}
```

---

### Error Classes

| Class | Description |
|-------|-------------|
| `RuntimeError` | Base class (has `code`, `details`) |
| `ManifestValidationError` | Invalid manifest (has `field`) |
| `SignatureVerificationError` | Artifact signature check failed |
| `SandboxViolationError` | Adapter violated sandbox constraints |
| `AdapterLoaderError` | Failed to load adapter |
| `AdapterHostError` | Host runtime failure |

Error codes are defined in `RUNTIME_ERROR_CODES` (30+ codes covering manifest, signature, sandbox, loader, and host errors).

---

### Constants

| Constant | Value |
|----------|-------|
| `MANIFEST_SCHEMA_VERSION` | `"1.0.0"` |
| `ARTIFACT_SIGNATURE_ALGORITHM` | `"ed25519"` |
| `ADAPTER_AUTH_TYPES` | `{ NONE, API_KEY, OAUTH2, LOCAL }` |
| `ADAPTER_RISK_LEVELS` | `{ LOW, MEDIUM, HIGH }` |
| `ADAPTER_STATE` | `{ PENDING, STARTING, RUNNING, DEGRADED, STOPPED, FAILED }` |

---

### Dependencies

- `@byom-ai/protocol` — Capability model, error taxonomy
- `@byom-ai/policy` — Permission and egress validation
- `@byom-ai/telemetry` — Health and performance metrics
