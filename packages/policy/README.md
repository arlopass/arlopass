# @arlopass/policy

Evaluate allow/deny rules against origins, capabilities, providers, and models. Policies are versioned, signed with Ed25519, and enforced at two points — preflight in the extension and runtime in the bridge.

```ts
import { evaluatePolicy, parsePolicyBundle } from "@arlopass/policy";

const bundle = parsePolicyBundle({
  schemaVersion: "1.0.0",
  policyVersion: "org.acme.v3",
  keyId: "key-1",
  issuedAt: new Date().toISOString(),
  rules: {
    allowedOrigins: ["https://app.acme.com"],
    deniedProviders: ["untrusted-provider"],
  },
});

const decision = evaluatePolicy({
  origin: "https://app.acme.com",
  capability: "chat.completions",
  providerId: "ollama",
  modelId: "llama3.2",
  policyBundle: bundle,
});

console.log(decision.decision);   // "allow"
console.log(decision.machineCode); // "ARLOPASS_POLICY_ALLOW"
```

---

## API Reference

### `evaluatePolicy(context: PolicyEvaluationContext, options?: PolicyEvaluationOptions): PolicyDecision`

Evaluate a request against a policy bundle. Returns a decision with reason code and machine code.

```ts
type PolicyDecision = {
  decision: "allow" | "deny";
  reasonCode: ProtocolReasonCode;
  policyVersion: string;
  machineCode: PolicyDecisionMachineCode;
  correlationId?: string;
}
```

---

### Policy Bundle

```ts
type PolicyBundle = {
  schemaVersion: string;       // "1.0.0"
  policyVersion: string;
  keyId: string;
  issuedAt: string;
  expiresAt?: string;
  rules: PolicyRuleSet;
  metadata?: Record<string, string>;
}
```

### Policy Rules

```ts
type PolicyRuleSet = {
  allowedOrigins?: readonly string[];
  deniedOrigins?: readonly string[];
  allowedCapabilities?: readonly ProtocolCapability[];
  deniedCapabilities?: readonly ProtocolCapability[];
  allowedProviders?: readonly string[];
  deniedProviders?: readonly string[];
  allowedModels?: readonly string[];
  deniedModels?: readonly string[];
}
```

### Signed Bundles

```ts
type SignedPolicyBundle = {
  payload: PolicyBundle;
  signature: PolicyBundleSignature;
}

type PolicyBundleSignature = {
  algorithm: "ed25519";
  keyId: string;
  signedAt: string;
  digest: string;
  value: string;
}
```

---

### Parsing Functions

| Function | Description |
|----------|-------------|
| `parsePolicyBundle(input: unknown): PolicyBundle` | Parse and validate a bundle, throws `PolicySchemaError` on failure |
| `parseSignedPolicyBundle(input: unknown): SignedPolicyBundle` | Parse a signed bundle with signature |
| `safeParsePolicyBundle(input: unknown): SafeParseResult<PolicyBundle>` | Returns `{ success, value/error }` |
| `safeParseSignedPolicyBundle(input: unknown): SafeParseResult<SignedPolicyBundle>` | Non-throwing variant |
| `isPolicyBundle(input: unknown): boolean` | Type guard |
| `isSignedPolicyBundle(input: unknown): boolean` | Type guard |

---

### Signature Verification

**`verifyPolicyBundleSignature(bundle: SignedPolicyBundle, options: { keyResolver: PolicyKeyResolver }): BundleVerificationResult`**

Verify a signed bundle against a key resolver.

**`canonicalizePolicyBundle(payload: PolicyBundle): string`** — Deterministic canonical form for signing.

**`createPolicyBundleDigest(payload: PolicyBundle): string`** — Compute digest for the bundle payload.

---

### `InMemoryPolicyKeyManager`

Key lifecycle manager for policy signing and verification.

```ts
import { InMemoryPolicyKeyManager } from "@arlopass/policy";

const keys = new InMemoryPolicyKeyManager();
const key = keys.createKey({ algorithm: "ed25519" });
const rotated = keys.rotateKey(key.keyId, { algorithm: "ed25519" });
keys.revokeKey(rotated.previous.keyId, { reason: "Scheduled rotation" });
const pub = keys.resolvePublicKey(rotated.current.keyId);
```

| Method | Returns | Description |
|--------|---------|-------------|
| `createKey(input)` | `PolicyKeyRecord` | Generate a new Ed25519 key pair |
| `rotateKey(keyId, input)` | `{ previous, current }` | Rotate a key, marking old as `rotated` |
| `revokeKey(keyId, input?)` | `PolicyKeyRecord` | Revoke a key |
| `getKey(keyId)` | `PolicyKeyRecord \| undefined` | Look up a key by ID |
| `listKeys()` | `readonly PolicyKeyRecord[]` | List all keys |
| `resolvePublicKey(keyId, options?)` | `string \| undefined` | Get PEM public key for verification |
| `assertActiveKey(keyId)` | `PolicyKeyRecord` | Throws if key is not active |

```ts
type PolicyKeyRecord = {
  keyId: string;
  publicKeyPem: string;
  status: "active" | "rotated" | "revoked";
  createdAt: string;
  rotatedAt?: string;
  revokedAt?: string;
  replacementKeyId?: string;
  revocationReason?: string;
  metadata?: Record<string, string>;
}
```

---

### Decision Machine Codes (`POLICY_DECISION_MACHINE_CODES`)

`ARLOPASS_POLICY_ALLOW` plus 16 deny variants: `DENY_POLICY_MISSING`, `DENY_POLICY_INVALID`, `DENY_ORIGIN_NOT_ALLOWED`, `DENY_ORIGIN_BLOCKED`, `DENY_CAPABILITY_NOT_ALLOWED`, `DENY_CAPABILITY_BLOCKED`, `DENY_PROVIDER_NOT_ALLOWED`, `DENY_PROVIDER_BLOCKED`, `DENY_MODEL_NOT_ALLOWED`, `DENY_MODEL_BLOCKED`, and others.

**`toPolicyReasonCode(machineCode): ProtocolReasonCode`** — Map machine code to protocol reason code.

**`isPolicyDecisionMachineCode(value: string): boolean`** — Type guard.

---

### Error Classes

| Class | Description |
|-------|-------------|
| `PolicySchemaError` | Invalid bundle structure (has `code`, `field`, `details`) |
| `PolicySignatureError` | Signature verification failure (has `code`) |
| `PolicyKeyManagementError` | Key lifecycle error (has `code`, `keyId`, `details`) |

---

### Constants

| Constant | Value |
|----------|-------|
| `POLICY_BUNDLE_SCHEMA_VERSION` | `"1.0.0"` |
| `POLICY_SIGNATURE_ALGORITHM` | `"ed25519"` |

### Dependencies

- `@arlopass/protocol` — Capability types and reason codes
