# Cloud Provider Adapters and Connection Flows v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable production-grade cloud provider chat execution (Anthropic subscription/API key, Microsoft Foundry, Google Vertex AI, Amazon Bedrock) through secure bridge-managed connection flows without changing the public SDK API.

**Architecture:** Keep the extension as UX/control initiator and make the bridge authoritative for security-sensitive operations. Introduce a bridge-only credential registry (`CredentialRef`) plus extension-visible `ConnectionHandle`, request-bound proof verification, cloud adapter contract v2, and provider-specific adapters behind a common execution engine with strict reliability controls.

**Tech Stack:** TypeScript, Node.js, Chrome Extension APIs, Vitest, Native Messaging bridge, existing BYOM protocol/policy/audit/telemetry packages.

---

## Spec Reference
- `docs/superpowers/specs/2026-03-24-cloud-provider-adapters-connection-flows-design.md`

## Scope Check
- This work touches multiple code areas (`packages/protocol`, `adapters/runtime`, `apps/bridge`, `apps/extension`) but they are not independent subsystems; they are one end-to-end connection/execution pipeline.  
- Execute as one coordinated plan with parallelizable provider-adapter tasks (Task 8) after core security/runtime primitives are in place.

## Implementation Rules
- TDD-first for every task (fail -> implement -> pass).
- No plaintext credentials in extension storage, SDK payloads, logs, or UI error text.
- Keep `@byom-ai/web-sdk` public API unchanged.
- Keep bridge authoritative: extension preflight/cache never bypasses bridge checks.
- Commit after each task.

## Assumptions (resolved defaults)
- Regional failover default: automatic health-based failover for read/discovery paths, no hedging for write-like/send paths.
- Token cache persistence: bridge in-memory only (no disk persistence) for v2 baseline.
- Canary policy source: bridge config/env driven allowlists for extension IDs and origins.

## File Structure (lock boundaries before coding)

### Create
- `packages/protocol/src/cloud-connection.ts` — shared cloud connection method/handle/proof message types.
- `packages/protocol/src/__tests__/cloud-connection.test.ts` — protocol-level guards/normalization tests.
- `adapters/runtime/src/cloud-contract.ts` — cloud contract v2 interfaces + helper guards.
- `adapters/runtime/src/__tests__/cloud-contract.test.ts` — contract guard/version tests.
- `apps/bridge/src/cloud/connection-registry.ts` — `ConnectionHandle -> CredentialRef` mapping, epoch/versioning.
- `apps/bridge/src/session/session-key-registry.ts` — bridge-issued proof session key lifecycle (issue, lookup, rotate, expire).
- `apps/bridge/src/cloud/request-proof.ts` — proof-of-possession verification helpers.
- `apps/bridge/src/cloud/cloud-connection-service.ts` — begin/complete/validate/revoke/discover handlers.
- `apps/bridge/src/cloud/discovery-cache.ts` — TTL/negative-cache/invalidation orchestration for model+capability discovery.
- `apps/bridge/src/cloud/discovery-refresh-scheduler.ts` — scheduled background discovery refresh triggers.
- `apps/bridge/src/cloud/token-lease-manager.ts` — token refresh single-flight and lease caching.
- `apps/bridge/src/cloud/cloud-chat-executor.ts` — cloud send/stream execution path with reliability controls.
- `apps/bridge/src/cloud/timeout-budgets.ts` — spec-bound timeout constants for all runtime stages.
- `apps/bridge/src/cloud/error-redaction.ts` — non-leaky user-visible error shaping + internal redaction helpers.
- `apps/bridge/src/__tests__/cloud-connection-service.test.ts`
- `apps/bridge/src/__tests__/discovery-cache.test.ts`
- `apps/bridge/src/__tests__/discovery-refresh-scheduler.test.ts`
- `apps/bridge/src/__tests__/cloud-chat-executor.test.ts`
- `apps/bridge/src/__tests__/timeout-budgets.test.ts`
- `apps/bridge/src/__tests__/error-redaction.test.ts`
- `apps/bridge/src/telemetry/cloud-observability.ts` — cloud telemetry emitters for stage histograms + reason/retry tags.
- `apps/bridge/src/__tests__/cloud-observability.test.ts`
- `apps/bridge/src/__tests__/request-proof.test.ts`
- `apps/bridge/src/__tests__/session-key-registry.test.ts`
- `apps/bridge/src/__tests__/connection-registry.test.ts`
- `apps/bridge/src/__tests__/bridge-handler-cloud.test.ts`
- `apps/extension/src/transport/cloud-native.ts` — extension wrappers for cloud native messages.
- `apps/extension/src/transport/bridge-handshake.ts` — extension-native handshake client for acquiring ephemeral proof session keys.
- `apps/extension/src/transport/request-proof.ts` — extension-side per-request proof generator (`requestId+nonce+origin+handle+payloadHash`).
- `apps/extension/src/__tests__/bridge-handshake.test.ts`
- `apps/extension/src/__tests__/request-proof.test.ts`
- `apps/extension/src/options/connectors/types.ts` — connector types and reusable schemas.
- `apps/extension/src/options/connectors/cloud-anthropic.ts`
- `apps/extension/src/options/connectors/cloud-foundry.ts`
- `apps/extension/src/options/connectors/cloud-vertex.ts`
- `apps/extension/src/options/connectors/cloud-bedrock.ts`
- `apps/extension/src/options/connectors/index.ts`
- `apps/extension/src/__tests__/options-cloud-connectors.test.ts`
- `apps/extension/src/provider-migrations.ts` — normalize legacy cloud provider records and mark reconnect requirements.
- `apps/extension/src/__tests__/provider-migrations.test.ts`
- `adapters/adapter-microsoft-foundry/package.json`
- `adapters/adapter-microsoft-foundry/tsconfig.json`
- `adapters/adapter-microsoft-foundry/src/index.ts`
- `adapters/adapter-microsoft-foundry/src/__tests__/contract.test.ts`
- `adapters/adapter-google-vertex-ai/package.json`
- `adapters/adapter-google-vertex-ai/tsconfig.json`
- `adapters/adapter-google-vertex-ai/src/index.ts`
- `adapters/adapter-google-vertex-ai/src/__tests__/contract.test.ts`
- `adapters/adapter-amazon-bedrock/package.json`
- `adapters/adapter-amazon-bedrock/tsconfig.json`
- `adapters/adapter-amazon-bedrock/src/index.ts`
- `adapters/adapter-amazon-bedrock/src/__tests__/contract.test.ts`
- `apps/bridge/src/config/cloud-feature-flags.ts` — global/provider-level enable gates and allowlists.
- `apps/bridge/src/config/index.ts` — cloud flag loader bootstrap surface.
- `apps/bridge/src/__tests__/cloud-feature-flags.test.ts`
- `ops/tests/release-gates/adapter-conformance-gates.test.ts` — adapter signature/sandbox/contract release gate assertions.
- `ops/tests/release-gates/adapter-version-matrix-gates.test.ts` — runtime-adapter compatibility matrix gate tests.

### Modify
- `packages/protocol/src/index.ts` — export cloud connection types.
- `adapters/runtime/src/adapter-loader.ts` — accept and detect cloud contract v2 methods.
- `adapters/runtime/src/manifest-schema.ts` — additive `connectionMethods[]` and broker policy fields.
- `adapters/runtime/src/index.ts` — export cloud contract types.
- `adapters/runtime/src/__tests__/manifest-schema.test.ts`
- `adapters/runtime/src/__tests__/adapter-host.test.ts`
- `apps/bridge/src/session/handshake.ts` — session key material for request-bound proof.
- `apps/bridge/src/session/request-verifier.ts` — validate proof and replay-resistant metadata for connection handles.
- `apps/bridge/src/bridge-handler.ts` — add cloud native message handlers and executor wiring.
- `apps/bridge/src/main.ts` — bootstrap cloud services/executors + adapter host registration.
- `apps/bridge/src/native-host.ts` — no protocol change expected; update tests only if framing assumptions change.
- `apps/bridge/src/secrets/keychain-store.ts` — account namespacing + optional metadata helpers.
- `apps/bridge/src/__tests__/integration.native-messaging.test.ts`
- `apps/bridge/src/__tests__/handshake.test.ts`
- `apps/bridge/src/__tests__/secrets-governance.test.ts`
- `apps/extension/src/transport/runtime.ts` — replace cloud `provider.unavailable` path with cloud native bridge execution.
- `apps/extension/src/background.ts` — forward new cloud events/status and revocation signals.
- `apps/extension/src/events.ts` — add connection-health event types for cloud providers.
- `apps/extension/src/popup.ts` — render `reconnecting | failed | revoked` cloud states consistently.
- `apps/extension/src/options.ts` — consume connector modules + store `connectionHandle` metadata only.
- `apps/extension/src/index.ts` — run one-time provider migration at startup boundary.
- `apps/extension/src/__tests__/transport-runtime.test.ts`
- `apps/extension/src/__tests__/background.test.ts`
- `apps/extension/src/__tests__/popup-state.test.ts`
- `apps/extension/src/__tests__/popup-render.test.ts`
- `adapters/adapter-claude-subscription/src/index.ts` — implement v2 connection methods and broker-aware auth lifecycle.
- `adapters/adapter-claude-subscription/src/auth.ts` — support subscription and API key method descriptors.
- `adapters/adapter-claude-subscription/src/__tests__/contract.test.ts`
- `.github/workflows/reliability-gates.yml` — add adapter release/conformance gates to CI.
- `RUNNING_AND_USAGE_GUIDE.md` — cloud connection setup/runtime validation instructions.

### Test Suites to keep green
- `npm run -w @byom-ai/protocol test`
- `npm run -w @byom-ai/adapter-runtime test`
- `npm run -w @byom-ai/bridge test`
- `npm run -w @byom-ai/extension test`
- `npm run lint && npm run typecheck && npm run test && npm run build`

---

### Task 1: Add shared cloud connection protocol contracts

**Files:**
- Create: `packages/protocol/src/cloud-connection.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/src/__tests__/cloud-connection.test.ts`

- [ ] **Step 1: Write the failing protocol contract tests**

```ts
it("normalizes and validates connection handle payload", () => {
  const parsed = parseCloudConnectionHandle({
    connectionHandle: "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.7.a1b2",
    providerId: "provider.claude",
    methodId: "anthropic.api_key",
    origin: "https://app.example.com",
    extensionId: "abcdefghijklmnopqrstuvwxzy123456",
  });
   expect(parsed.bindingEpoch).toBe(7);
   expect(parsed.providerId).toBe("provider.claude");
   expect(() => parseCloudConnectionHandle({ ...parsed, providerId: "provider.other" })).toThrow();
});
it("accepts unknown optional fields without breaking compatibility", () => {
  const parsed = parseCloudConnectionHandle({
    connectionHandle: "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.7.a1b2",
    providerId: "provider.claude",
    methodId: "anthropic.api_key",
    extensionId: "abcdefghijklmnopqrstuvwxzy123456",
    origin: "https://app.example.com",
    optionalFutureField: "ignored",
  });
  expect(parsed.providerId).toBe("provider.claude");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w @byom-ai/protocol test -- src/__tests__/cloud-connection.test.ts`  
Expected: FAIL (missing module / missing parser).

- [ ] **Step 3: Implement minimal cloud contract types and parsers**

```ts
export type CloudConnectionHandle = Readonly<{ connectionHandle: string; providerId: string; methodId: string }>;
export type CloudRequestProof = Readonly<{ requestId: string; nonce: string; origin: string; connectionHandle: string; payloadHash: string; proof: string }>;
export function parseCloudConnectionHandle(input: unknown): CloudConnectionHandle { /* strict grammar + provider/method match + epoch + signature segment checks */ }
export function parseCloudRequestProof(input: unknown): CloudRequestProof { /* require full PoP fields used by bridge verification */ }
```

- [ ] **Step 4: Re-run protocol tests**

Run: `npm run -w @byom-ai/protocol test -- src/__tests__/cloud-connection.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/cloud-connection.ts packages/protocol/src/index.ts packages/protocol/src/__tests__/cloud-connection.test.ts
git commit -m "feat(protocol): add cloud connection handle and proof contracts"
```

---

### Task 2: Extend adapter runtime with cloud contract v2 and manifest fields

**Files:**
- Create: `adapters/runtime/src/cloud-contract.ts`, `adapters/runtime/src/__tests__/cloud-contract.test.ts`
- Modify: `adapters/runtime/src/adapter-loader.ts`, `adapters/runtime/src/manifest-schema.ts`, `adapters/runtime/src/index.ts`
- Test: `adapters/runtime/src/__tests__/manifest-schema.test.ts`, `adapters/runtime/src/__tests__/adapter-host.test.ts`

- [ ] **Step 1: Write failing tests for v2 manifest fields and cloud contract detection**

```ts
it("accepts additive connectionMethods manifest field", () => {
  const manifest = parseAdapterManifest({ ...baseManifest, connectionMethods: [{ id: "anthropic.api_key", authFlow: "api-key" }] });
  expect(manifest.connectionMethods?.[0]?.id).toBe("anthropic.api_key");
});
it("requires cloud adapters to expose discovery hooks", () => {
  expect(isCloudAdapterContractV2(candidate)).toBe(true);
  expect(typeof candidate.discoverModels).toBe("function");
  expect(typeof candidate.discoverCapabilities).toBe("function");
});
```

- [ ] **Step 2: Run adapter runtime tests to verify failures**

Run: `npm run -w @byom-ai/adapter-runtime test -- src/__tests__/manifest-schema.test.ts src/__tests__/cloud-contract.test.ts`  
Expected: FAIL (unknown field/contract helpers absent).

- [ ] **Step 3: Implement manifest/schema additions and contract guards**

```ts
export interface CloudAdapterContractV2 extends AdapterContract {
  listConnectionMethods(): readonly ConnectionMethodDescriptor[];
  beginConnect(input: BeginConnectInput): Promise<BeginConnectResult>;
  completeConnect(input: CompleteConnectInput): Promise<CompleteConnectResult>;
  validateCredentialRef(input: ValidateCredentialRefInput): Promise<ValidationResult>;
  revokeCredentialRef(input: RevokeCredentialRefInput): Promise<void>;
  discoverModels(ctx: CloudConnectionContext): Promise<readonly ModelDescriptor[]>;
  discoverCapabilities(ctx: CloudConnectionContext): Promise<CapabilityDescriptor>;
}
```

- [ ] **Step 4: Re-run targeted adapter runtime tests**

Run: `npm run -w @byom-ai/adapter-runtime test -- src/__tests__/manifest-schema.test.ts src/__tests__/adapter-host.test.ts src/__tests__/cloud-contract.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add adapters/runtime/src adapters/runtime/src/__tests__
git commit -m "feat(adapter-runtime): add cloud contract v2 and manifest connection methods"
```

---

### Task 3: Build bridge credential registry and connection handle mapping

**Files:**
- Create: `apps/bridge/src/cloud/connection-registry.ts`, `apps/bridge/src/__tests__/connection-registry.test.ts`
- Modify: `apps/bridge/src/secrets/keychain-store.ts`, `apps/bridge/src/__tests__/secrets-governance.test.ts`
- Test: `apps/bridge/src/__tests__/connection-registry.test.ts`

- [ ] **Step 1: Write failing tests for handle issuance, lookup, epoch bump, and revoke**

```ts
it("increments credential epoch on revoke and rejects stale handle", async () => {
  const registry = new ConnectionRegistry(/* deps */);
  const { connectionHandle } = await registry.register(/* ... */);
  await registry.revoke(connectionHandle);
  await expect(registry.resolve(connectionHandle)).rejects.toThrow("revoked");
});
it("rejects handle resolution when extension/origin/policy binding context mismatches", async () => {
  const { connectionHandle } = await registry.register({
    providerId: "provider.claude",
    methodId: "anthropic.api_key",
    extensionId: "ext-1",
    origin: "https://app.example.com",
    policyVersion: "pol.v2",
  });
  await expect(
    registry.resolve(connectionHandle, {
      extensionId: "ext-2",
      origin: "https://app.example.com",
      policyVersion: "pol.v2",
    }),
  ).rejects.toThrow("binding mismatch");
});
```

- [ ] **Step 2: Run bridge tests to verify failure**

Run: `npm run -w @byom-ai/bridge test -- src/__tests__/connection-registry.test.ts`  
Expected: FAIL (registry missing).

- [ ] **Step 3: Implement registry + keychain account namespacing**

```ts
type ConnectionRecord = {
  connectionHandle: string;
  credentialRef: string;
  providerId: string;
  methodId: string;
  epoch: number;
  extensionId: string;
  origin: string;
  policyVersion: string;
  endpointProfileHash: string;
};
```

- [ ] **Step 4: Re-run bridge tests**

Run: `npm run -w @byom-ai/bridge test -- src/__tests__/connection-registry.test.ts src/__tests__/secrets-governance.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/cloud/connection-registry.ts apps/bridge/src/secrets/keychain-store.ts apps/bridge/src/__tests__/connection-registry.test.ts apps/bridge/src/__tests__/secrets-governance.test.ts
git commit -m "feat(bridge): add connection registry and secure handle mapping"
```

---

### Task 4: Add request-bound proof verification and handshake session keys

**Files:**
- Create: `apps/bridge/src/cloud/request-proof.ts`, `apps/bridge/src/__tests__/request-proof.test.ts`
- Modify: `apps/bridge/src/session/handshake.ts`, `apps/bridge/src/session/request-verifier.ts`, `apps/bridge/src/__tests__/handshake.test.ts`, `apps/bridge/src/__tests__/integration.native-messaging.test.ts`
- Test: `apps/bridge/src/__tests__/request-proof.test.ts`, `apps/bridge/src/__tests__/handshake.test.ts`

- [ ] **Step 1: Write failing tests for proof verification and replay rejection**

```ts
it("rejects request.check when proof does not match request payload hash", () => {
  const verifier = new RequestVerifier(/* with session key resolver */);
  const result = verifier.verifyWithProof(envelope, { connectionHandle, proof: "bad" });
  expect(result.ok).toBe(false);
  expect(result.error.reasonCode).toBe("request.replay_prone");
});
it("rejects proof when handle binding metadata does not match extension/origin context", () => {
  const result = verifier.verifyWithProof(envelope, {
    connectionHandle,
    proof,
    extensionId: "ext-2",
    origin: "https://app.example.com",
  });
  expect(result.ok).toBe(false);
  expect(result.error.reasonCode).toBe("request.replay_prone");
});
```

- [ ] **Step 2: Run failing security tests**

Run: `npm run -w @byom-ai/bridge test -- src/__tests__/request-proof.test.ts src/__tests__/handshake.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement session-key issuance and proof verification helpers**

```ts
proof = HMAC(sessionKey, requestId || nonce || origin || connectionHandle || payloadHash)
assertHandleBinding(connectionHandle, { extensionId, origin, policyVersion, endpointProfileHash })
```

- [ ] **Step 4: Re-run security and integration tests**

Run: `npm run -w @byom-ai/bridge test -- src/__tests__/request-proof.test.ts src/__tests__/handshake.test.ts src/__tests__/integration.native-messaging.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/cloud/request-proof.ts apps/bridge/src/session/handshake.ts apps/bridge/src/session/request-verifier.ts apps/bridge/src/__tests__/request-proof.test.ts apps/bridge/src/__tests__/handshake.test.ts apps/bridge/src/__tests__/integration.native-messaging.test.ts
git commit -m "feat(bridge): enforce request-bound connection handle proof verification"
```

---

### Task 4B: Implement extension-native handshake session-key acquisition and refresh

**Files:**
- Create: `apps/bridge/src/session/session-key-registry.ts`, `apps/bridge/src/__tests__/session-key-registry.test.ts`, `apps/extension/src/transport/bridge-handshake.ts`, `apps/extension/src/__tests__/bridge-handshake.test.ts`
- Modify: `apps/bridge/src/session/handshake.ts`, `apps/bridge/src/bridge-handler.ts`, `apps/extension/src/transport/runtime.ts`, `apps/bridge/src/__tests__/integration.native-messaging.test.ts`
- Test: `apps/extension/src/__tests__/bridge-handshake.test.ts`, `apps/bridge/src/__tests__/session-key-registry.test.ts`

- [ ] **Step 1: Write failing tests for session key issuance, in-memory caching, and rotation**

```ts
it("acquires handshake session key once and reuses it until expiry", async () => {
  const session = await ensureBridgeHandshakeSession({ hostName: "com.byom.bridge" });
  const reused = await ensureBridgeHandshakeSession({ hostName: "com.byom.bridge" });
  expect(reused.sessionKey).toBe(session.sessionKey);
});
it("refreshes handshake session on auth.expired and never persists session key", async () => {
  await expect(readPersistedSessionKey()).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run handshake tests and verify failures**

Run: `npm run -w @byom-ai/extension test -- src/__tests__/bridge-handshake.test.ts && npm run -w @byom-ai/bridge test -- src/__tests__/session-key-registry.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement handshake client + bridge session-key registry**

```ts
// extension
const challenge = await sendNativeMessage(hostName, { type: "handshake.challenge" });
const secretHex = await resolveBridgeSharedSecret(); // explicit source; fail closed if missing
const hmac = createHmac("sha256", Buffer.from(secretHex, "hex")).update(challenge.nonce).digest("hex");
const session = await sendNativeMessage(hostName, { type: "handshake.verify", nonce: challenge.nonce, hmac, extensionId });
cacheInMemorySession({ sessionKey: session.sessionToken, expiresAt: session.expiresAt ?? addDefaultTtl(session.establishedAt) });

// bridge
sessionKeyRegistry.issue({ extensionId, sessionToken, expiresAt });
sessionKeyRegistry.resolve(sessionToken);
```

- [ ] **Step 4: Re-run handshake tests**

Run: `npm run -w @byom-ai/extension test -- src/__tests__/bridge-handshake.test.ts && npm run -w @byom-ai/bridge test -- src/__tests__/session-key-registry.test.ts src/__tests__/integration.native-messaging.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/session/session-key-registry.ts apps/bridge/src/session/handshake.ts apps/bridge/src/bridge-handler.ts apps/bridge/src/__tests__/session-key-registry.test.ts apps/bridge/src/__tests__/integration.native-messaging.test.ts apps/extension/src/transport/bridge-handshake.ts apps/extension/src/transport/runtime.ts apps/extension/src/__tests__/bridge-handshake.test.ts
git commit -m "feat(handshake): add bridge-issued session key lifecycle for proof generation"
```

---

### Task 5: Implement bridge cloud control-plane + discovery cache orchestration handlers

**Files:**
- Create: `apps/bridge/src/cloud/cloud-connection-service.ts`, `apps/bridge/src/cloud/discovery-cache.ts`, `apps/bridge/src/cloud/discovery-refresh-scheduler.ts`, `apps/bridge/src/__tests__/cloud-connection-service.test.ts`, `apps/bridge/src/__tests__/discovery-cache.test.ts`, `apps/bridge/src/__tests__/discovery-refresh-scheduler.test.ts`, `apps/bridge/src/__tests__/bridge-handler-cloud.test.ts`
- Modify: `apps/bridge/src/bridge-handler.ts`, `apps/bridge/src/main.ts`
- Test: `apps/bridge/src/__tests__/bridge-handler-cloud.test.ts`

- [ ] **Step 1: Write failing bridge handler tests for cloud native message types**

```ts
it("returns cloud.connection.complete with connectionHandle on success", async () => {
  const response = await handler.handle({ type: "cloud.connection.complete", providerId: "provider.claude", methodId: "anthropic.api_key" });
  expect(response.type).toBe("cloud.connection.complete");
});
it("uses hot-cache TTL=5m and negative-cache TTL=60s for discovery", async () => {
  const first = await service.discover({ providerId: "provider.claude", refresh: true });
  const second = await service.discover({ providerId: "provider.claude" });
  expect(second.cacheStatus).toBe("hot");
  expect(first.models.length).toBeGreaterThan(0);
});
it("invalidates discovery cache on revoke, policy change, and repeated provider.unavailable", async () => {
  await service.discover({ providerId: "provider.claude", refresh: true });
  await service.onCredentialRevoked({ providerId: "provider.claude" });
  await service.onPolicyVersionChanged("pol.v3");
  await service.onProviderUnavailableThreshold({ providerId: "provider.claude", failures: 3 });
  expect(service.getDiscoveryCacheState("provider.claude")).toBe("stale");
});
it("schedules background discovery refresh and triggers on connect/reconnect", async () => {
  scheduler.start({ intervalMs: 300_000 });
  await service.onConnectionCompleted({ providerId: "provider.claude" });
  await service.onReconnected({ providerId: "provider.claude" });
  expect(scheduler.nextRunAt("provider.claude")).toBeDefined();
});
it("forces fresh discovery when user triggers manual refresh models action", async () => {
  await service.discover({ providerId: "provider.claude" }); // primes hot cache
  const refreshed = await service.discover({ providerId: "provider.claude", refresh: true });
  expect(refreshed.cacheStatus).toBe("refreshed");
});
it("fails closed with policy.denied when discovery fan-out endpoint is not declared in egress rules", async () => {
  await expect(service.discover({ providerId: "provider.claude", endpointOverride: "https://undeclared.example.com" })).rejects.toMatchObject({ reasonCode: "policy.denied" });
});
```

- [ ] **Step 2: Run bridge handler tests**

Run: `npm run -w @byom-ai/bridge test -- src/__tests__/bridge-handler-cloud.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement cloud control-plane service and dispatch wiring**

```ts
case "cloud.connection.begin":
case "cloud.connection.complete":
case "cloud.connection.validate":
case "cloud.connection.revoke":
case "cloud.models.discover":
case "cloud.capabilities.discover":
case "cloud.discovery.refresh":
// discovery cache policy
hotTtlMs = 300_000;
negativeTtlMs = 60_000;
invalidateOn(["credential.rotate", "credential.revoke", "policy.version.changed", "provider.unavailable.threshold"]);
scheduleBackgroundRefresh({ intervalMs: 300_000, triggerOn: ["connection.completed", "connection.reconnected"] });
if (message.type === "cloud.discovery.refresh" || request.refresh === true) forceRefresh = true;
for (const endpoint of discoveryFanoutEndpoints) {
  assertEgressAllowed(sandboxPolicy, toEgressAttempt(endpoint)); // fail closed before dispatch
}
```

- [ ] **Step 4: Re-run cloud handler tests**

Run: `npm run -w @byom-ai/bridge test -- src/__tests__/cloud-connection-service.test.ts src/__tests__/discovery-cache.test.ts src/__tests__/discovery-refresh-scheduler.test.ts src/__tests__/bridge-handler-cloud.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/cloud/cloud-connection-service.ts apps/bridge/src/cloud/discovery-cache.ts apps/bridge/src/cloud/discovery-refresh-scheduler.ts apps/bridge/src/bridge-handler.ts apps/bridge/src/main.ts apps/bridge/src/__tests__/cloud-connection-service.test.ts apps/bridge/src/__tests__/discovery-cache.test.ts apps/bridge/src/__tests__/discovery-refresh-scheduler.test.ts apps/bridge/src/__tests__/bridge-handler-cloud.test.ts
git commit -m "feat(bridge): add cloud connection control-plane native messages"
```

---

### Task 6: Implement bridge cloud chat execution with reliability guards

**Files:**
- Create: `apps/bridge/src/cloud/token-lease-manager.ts`, `apps/bridge/src/cloud/cloud-chat-executor.ts`, `apps/bridge/src/cloud/timeout-budgets.ts`, `apps/bridge/src/__tests__/cloud-chat-executor.test.ts`, `apps/bridge/src/__tests__/timeout-budgets.test.ts`
- Modify: `apps/bridge/src/bridge-handler.ts`, `apps/bridge/src/__tests__/integration.native-messaging.test.ts`
- Test: `apps/bridge/src/__tests__/cloud-chat-executor.test.ts`, `apps/bridge/src/__tests__/timeout-budgets.test.ts`

- [ ] **Step 1: Write failing tests for timeout, retry budget, circuit-breaker, and revocation-epoch checks**

```ts
it("fails closed with auth.expired when epoch changes while waiting on refresh lock", async () => {
  await expect(executor.execute(req)).rejects.toMatchObject({ reasonCode: "auth.expired" });
});
it("refreshes at 80% lifetime with jitter and bounded retries", async () => {
  const lease = await tokenLeaseManager.getLease(ctx);
  expect(lease.refreshPolicy.thresholdRatio).toBe(0.8);
  expect(lease.refreshPolicy.jitterRatio).toBe(0.1); // ±10%
  expect(lease.refreshPolicy.maxAttempts).toBe(3);
  expect(lease.refreshPolicy.cooldownMs).toBe(300_000);
});
it("enforces breaker and backpressure defaults from spec", async () => {
  expect(executorPolicy.breaker.openAfterConsecutiveFailures).toBe(5);
  expect(executorPolicy.breaker.failureWindowMs).toBe(60_000);
  expect(executorPolicy.breaker.halfOpenAfterMs).toBe(30_000);
  expect(executorPolicy.breaker.closeAfterConsecutiveSuccesses).toBe(3);
  expect(executorPolicy.backpressure.perOriginInFlightCap).toBe(3);
  expect(executorPolicy.backpressure.perProviderStreamCap).toBe(5);
});
it("enforces retry backoff defaults from spec", () => {
  expect(executorPolicy.retry.baseDelayMs).toBe(250);
  expect(executorPolicy.retry.multiplier).toBe(2);
  expect(executorPolicy.retry.maxDelayMs).toBe(8_000);
  expect(executorPolicy.retry.maxAttempts.controlPlaneValidation).toBe(2);
  expect(executorPolicy.retry.maxAttempts.dataPlaneSend).toBe(3);
  expect(executorPolicy.retry.maxAttempts.streamSetup).toBe(2);
});
it("scopes circuit breaker key by tenant+origin+provider+method+region", () => {
  const keyA = buildBreakerScopeKey({
    tenantId: "tenant-a",
    origin: "https://app-a.example.com",
    providerId: "provider.claude",
    methodId: "anthropic.api_key",
    region: "us-east-1",
  });
  const keyB = buildBreakerScopeKey({
    tenantId: "tenant-b",
    origin: "https://app-a.example.com",
    providerId: "provider.claude",
    methodId: "anthropic.api_key",
    region: "us-east-1",
  });
  expect(keyA).not.toBe(keyB);
});
it("pins stage timeout budgets to spec values", () => {
  expect(TIMEOUT_BUDGETS.handshakeMs).toBe(5_000);
  expect(TIMEOUT_BUDGETS.validationMs).toBe(10_000);
  expect(TIMEOUT_BUDGETS.discoveryMs).toBe(15_000);
  expect(TIMEOUT_BUDGETS.tokenRefreshMs).toBe(8_000);
  expect(TIMEOUT_BUDGETS.chatSendMs).toBe(60_000);
  expect(TIMEOUT_BUDGETS.streamSetupMs).toBe(15_000);
  expect(TIMEOUT_BUDGETS.healthProbeMs).toBe(5_000);
});
it("fails closed and emits audit marker when revocation occurs after refresh lock and before completion", async () => {
  await expect(executor.execute(req)).rejects.toMatchObject({ reasonCode: "auth.expired" });
  expect(auditEvents).toContainEqual(expect.objectContaining({ revocation_race_terminated: true }));
});
```

- [ ] **Step 2: Run executor tests to verify failures**

Run: `npm run -w @byom-ai/bridge test -- src/__tests__/cloud-chat-executor.test.ts src/__tests__/timeout-budgets.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement executor + token lease single-flight + epoch checks**

```ts
if (currentEpoch !== admissionEpoch) throw new AuthError("Credential was revoked during refresh wait.");
const refreshAtMs = issuedAtMs + Math.floor(ttlMs * 0.8) + randomJitterByRatio(ttlMs, 0.1); // ±10%
const retryPolicy = { maxAttempts: 3, cooldownMs: 300_000 };
const breakerPolicy = { openAfterConsecutiveFailures: 5, failureWindowMs: 60_000, halfOpenAfterMs: 30_000, closeAfterConsecutiveSuccesses: 3 };
const backpressurePolicy = { perOriginInFlightCap: 3, perProviderStreamCap: 5 };
const retryBackoff = { baseDelayMs: 250, multiplier: 2, maxDelayMs: 8_000, maxAttempts: { controlPlaneValidation: 2, dataPlaneSend: 3, streamSetup: 2 } };
const breakerScopeKey = [tenantId, origin, providerId, methodId, region].join("::");
const TIMEOUT_BUDGETS = { handshakeMs: 5_000, validationMs: 10_000, discoveryMs: 15_000, tokenRefreshMs: 8_000, chatSendMs: 60_000, streamSetupMs: 15_000, healthProbeMs: 5_000 };
events.emit("cloud.reconnect.required", { providerId, methodId, reasonCode: "auth.expired" });
if (currentEpoch !== admissionEpochAfterLock) throw new AuthError("Credential was revoked after refresh lock release.");
if (currentEpoch !== admissionEpochAtCompletion) {
  audit.emit({ revocation_race_terminated: true, correlationId });
  throw new AuthError("Credential was revoked before completion commit.");
}
```

- [ ] **Step 4: Re-run executor and integration tests**

Run: `npm run -w @byom-ai/bridge test -- src/__tests__/cloud-chat-executor.test.ts src/__tests__/timeout-budgets.test.ts src/__tests__/integration.native-messaging.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/cloud/token-lease-manager.ts apps/bridge/src/cloud/cloud-chat-executor.ts apps/bridge/src/cloud/timeout-budgets.ts apps/bridge/src/bridge-handler.ts apps/bridge/src/__tests__/cloud-chat-executor.test.ts apps/bridge/src/__tests__/timeout-budgets.test.ts apps/bridge/src/__tests__/integration.native-messaging.test.ts
git commit -m "feat(bridge): add cloud chat executor with token leasing and reliability controls"
```

---

### Task 7: Upgrade Anthropic adapter to cloud contract v2

**Files:**
- Modify: `adapters/adapter-claude-subscription/src/index.ts`, `adapters/adapter-claude-subscription/src/auth.ts`, `adapters/adapter-claude-subscription/src/__tests__/contract.test.ts`
- Test: `adapters/adapter-claude-subscription/src/__tests__/contract.test.ts`

- [ ] **Step 1: Write failing tests for `listConnectionMethods/beginConnect/completeConnect/validate/revoke`**

```ts
it("supports subscription oauth and api_key methods", () => {
  const methods = adapter.listConnectionMethods();
  expect(methods.map((m) => m.id)).toEqual(expect.arrayContaining(["anthropic.oauth_subscription", "anthropic.api_key"]));
});
```

- [ ] **Step 2: Run adapter tests to verify failures**

Run: `npm run -w @byom-ai/adapter-claude-subscription test -- src/__tests__/contract.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement v2 connection lifecycle methods**

```ts
async beginConnect(input) { /* return challenge/required fields */ }
async completeConnect(input) { /* persist via broker callback and return handle */ }
```

- [ ] **Step 4: Re-run adapter contract tests**

Run: `npm run -w @byom-ai/adapter-claude-subscription test -- src/__tests__/contract.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add adapters/adapter-claude-subscription/src/index.ts adapters/adapter-claude-subscription/src/auth.ts adapters/adapter-claude-subscription/src/__tests__/contract.test.ts
git commit -m "feat(adapter-claude): add cloud contract v2 connection methods"
```

---

### Task 8: Add Foundry, Vertex, and Bedrock adapter packages

**Files:**
- Create:  
  - `adapters/adapter-microsoft-foundry/{package.json,tsconfig.json,src/index.ts,src/__tests__/contract.test.ts}`  
  - `adapters/adapter-google-vertex-ai/{package.json,tsconfig.json,src/index.ts,src/__tests__/contract.test.ts}`  
  - `adapters/adapter-amazon-bedrock/{package.json,tsconfig.json,src/index.ts,src/__tests__/contract.test.ts}`
- Test: all new adapter contract tests

- [ ] **Step 1: Write failing contract tests for all three adapters**

```ts
it("declares strict egress and exposes cloud connection methods", async () => {
  expect(adapter.manifest.egressRules.length).toBeGreaterThan(0);
  expect(adapter.listConnectionMethods().length).toBeGreaterThan(0);
});
it("pins provider method IDs and canonical auth error mapping", async () => {
  expect(foundryAdapter.listConnectionMethods().map((m) => m.id)).toEqual(expect.arrayContaining(["foundry.aad_client_credentials"]));
  expect(vertexAdapter.listConnectionMethods().map((m) => m.id)).toEqual(expect.arrayContaining(["vertex.service_account", "vertex.workload_identity_federation"]));
  expect(bedrockAdapter.listConnectionMethods().map((m) => m.id)).toEqual(expect.arrayContaining(["bedrock.aws_access_key", "bedrock.assume_role"]));
  await expect(foundryAdapter.validateCredentialRef({ credentialRef: "invalid" })).rejects.toMatchObject({ reasonCode: "auth.invalid" });
  expect(foundryAdapter.requiredEndpointProfileFields).toEqual(expect.arrayContaining(["tenantId", "resourceName", "apiVersion"]));
});
it("implements provider-specific endpointProfile/discovery semantics with partial-region outcomes", async () => {
  expect(vertexAdapter.requiredEndpointProfileFields).toEqual(expect.arrayContaining(["projectId", "location"]));
  expect(bedrockAdapter.requiredEndpointProfileFields).toEqual(expect.arrayContaining(["region", "modelAccessPolicy", "roleArn"]));
  expect(bedrockAdapter.listConnectionMethods().map((m) => m.id)).toEqual(expect.arrayContaining(["bedrock.assume_role"]));
  const assumeRoleMethod = bedrockAdapter.listConnectionMethods().find((m) => m.id === "bedrock.assume_role");
  expect(assumeRoleMethod?.requiredFields).toEqual(expect.arrayContaining(["roleArn"]));
  expect(assumeRoleMethod?.optionalFields).toEqual(expect.arrayContaining(["externalId"]));
  const discovery = await bedrockAdapter.discoverModels({
    endpointProfile: { region: "us-east-1" },
    /* mocked connection context */
  } as never);
  expect(discovery).toEqual(expect.any(Array));
  expect(bedrockAdapter.lastDiscoveryRegions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ status: expect.stringMatching(/healthy|partial|stale|unavailable/) }),
    ]),
  );
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test --workspace @byom-ai/adapter-microsoft-foundry --workspace @byom-ai/adapter-google-vertex-ai --workspace @byom-ai/adapter-amazon-bedrock`  
Expected: FAIL (packages missing).

- [ ] **Step 3: Implement minimal adapter contract v2 for each provider**

```ts
export class MicrosoftFoundryAdapter implements AdapterContract, CloudAdapterContractV2 { /* ... */ }
// Each adapter must include exact method IDs, required endpointProfile fields, and canonical error mapping.
// Required provider acceptance:
// - Foundry: tenant/resource/apiVersion profile + AAD client credentials flow.
// - Vertex: service-account + WIF method separation with project/location profile.
// - Bedrock: region-aware discovery with partial outcomes surfaced for fallback handling.
// - Bedrock assume-role: require roleArn, support optional externalId, enforce single assume-role hop by default.
```

- [ ] **Step 4: Re-run adapter tests**

Run: `npm test --workspace @byom-ai/adapter-microsoft-foundry --workspace @byom-ai/adapter-google-vertex-ai --workspace @byom-ai/adapter-amazon-bedrock`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add adapters/adapter-microsoft-foundry adapters/adapter-google-vertex-ai adapters/adapter-amazon-bedrock
git commit -m "feat(adapters): add foundry vertex and bedrock cloud adapters"
```

---

### Task 8B: Enforce default-off bridge gating before cloud runtime enablement

**Files:**
- Create: `apps/bridge/src/config/cloud-feature-flags.ts`, `apps/bridge/src/config/index.ts`, `apps/bridge/src/__tests__/cloud-feature-flags.test.ts`
- Modify: `apps/bridge/src/bridge-handler.ts`, `apps/bridge/src/__tests__/bridge-handler-cloud.test.ts`
- Test: `apps/bridge/src/__tests__/cloud-feature-flags.test.ts`, `apps/bridge/src/__tests__/bridge-handler-cloud.test.ts`

- [ ] **Step 1: Write failing tests for cloud gating when flags are disabled**

```ts
it("denies cloud.connection.begin and cloud.chat.execute when cloudBrokerV2Enabled is false", async () => {
  const response = await handler.handle({ type: "cloud.chat.execute", providerId: "provider.claude", modelId: "claude-sonnet-4-5" });
  expect(response).toMatchObject({ type: "error", reasonCode: "policy.denied" });
});
it("denies provider execution when provider-level flag is disabled", async () => {
  expect(isCloudExecutionEnabled(flags, "anthropic.api_key")).toBe(false);
});
```

- [ ] **Step 2: Run bridge gating tests and verify failures**

Run: `npm run -w @byom-ai/bridge test -- src/__tests__/cloud-feature-flags.test.ts src/__tests__/bridge-handler-cloud.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement default-off global/provider cloud gates in bridge handler path**

```ts
if (!flags.cloudBrokerV2Enabled) return deny("policy.denied");
if (!flags.providerEnabled(methodId)) return deny("policy.denied");
```

- [ ] **Step 4: Re-run bridge gating tests**

Run: `npm run -w @byom-ai/bridge test -- src/__tests__/cloud-feature-flags.test.ts src/__tests__/bridge-handler-cloud.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/bridge/src/config/cloud-feature-flags.ts apps/bridge/src/config/index.ts apps/bridge/src/bridge-handler.ts apps/bridge/src/__tests__/cloud-feature-flags.test.ts apps/bridge/src/__tests__/bridge-handler-cloud.test.ts
git commit -m "feat(bridge): gate cloud execution behind default-off feature flags"
```

---

### Task 9: Enable cloud execution path in extension transport runtime

**Files:**
- Create: `apps/extension/src/transport/cloud-native.ts`, `apps/extension/src/transport/bridge-handshake.ts`, `apps/extension/src/transport/request-proof.ts`, `apps/extension/src/__tests__/bridge-handshake.test.ts`, `apps/extension/src/__tests__/request-proof.test.ts`
- Modify: `apps/extension/src/transport/runtime.ts`, `apps/extension/src/__tests__/transport-runtime.test.ts`
- Test: `apps/extension/src/__tests__/transport-runtime.test.ts`, `apps/extension/src/__tests__/bridge-handshake.test.ts`, `apps/extension/src/__tests__/request-proof.test.ts`

- [ ] **Step 1: Write failing transport tests replacing cloud unavailable behavior**

```ts
it("routes cloud chat completion through native cloud.chat.execute", async () => {
  const result = await handler(/* cloud request */);
  expect(sendNativeMessage).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: "cloud.chat.execute" }));
  expect(result?.ok).toBe(true);
});
it("surfaces policy.denied when bridge cloud flags are disabled", async () => {
  const result = await handler(/* cloud request with flags off response */);
  expect(result?.ok).toBe(false);
  expect(result?.error?.reasonCode).toBe("policy.denied");
});
it("computes request-bound proof from session key + request context for every cloud call", async () => {
  const proof = buildCloudRequestProof({
    requestId: "req.123",
    nonce: "nonce.123",
    origin: "https://app.example.com",
    connectionHandle: "connh.provider.claude.anthropic.api_key.uuid.7.sig",
    payloadHash: "sha256:abc",
    sessionKey,
  });
  expect(proof.length).toBeGreaterThan(10);
});
it("acquires bridge handshake session before computing proof and sending cloud request", async () => {
  const session = await ensureBridgeHandshakeSession({ hostName: "com.byom.bridge", extensionId: "ext.test" });
  expect(session.sessionKey.length).toBeGreaterThan(10);
});
```

- [ ] **Step 2: Run extension transport tests and verify expected failures**

Run: `npm run -w @byom-ai/extension test -- src/__tests__/transport-runtime.test.ts src/__tests__/bridge-handshake.test.ts src/__tests__/request-proof.test.ts`  
Expected: FAIL (still throws cloud broker unavailable).

- [ ] **Step 3: Implement cloud-native message client and runtime switch branch**

```ts
case "cloud":
  const bridgeSession = await ensureBridgeHandshakeSession({ hostName, extensionId });
  return runCloudBridgeCompletion({
    provider,
    messages,
    timeoutMs,
    correlationId,
    sessionId,
    proof: buildCloudRequestProof({
      requestId,
      nonce,
      origin,
      connectionHandle,
      payloadHash,
      sessionKey: bridgeSession.sessionKey,
    }),
    handshakeSessionToken: bridgeSession.sessionToken,
    sendNativeMessage,
  });
// Respect bridge policy.denied gates as authoritative (do not fallback locally).
```

- [ ] **Step 4: Re-run transport tests**

Run: `npm run -w @byom-ai/extension test -- src/__tests__/transport-runtime.test.ts src/__tests__/bridge-handshake.test.ts src/__tests__/request-proof.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/transport/cloud-native.ts apps/extension/src/transport/bridge-handshake.ts apps/extension/src/transport/request-proof.ts apps/extension/src/transport/runtime.ts apps/extension/src/__tests__/transport-runtime.test.ts apps/extension/src/__tests__/bridge-handshake.test.ts apps/extension/src/__tests__/request-proof.test.ts
git commit -m "feat(extension): enable cloud runtime execution via native bridge"
```

---

### Task 10: Implement cloud connect wizard connector modules (secure metadata only)

**Files:**
- Create:  
  - `apps/extension/src/options/connectors/types.ts`  
  - `apps/extension/src/options/connectors/cloud-anthropic.ts`  
  - `apps/extension/src/options/connectors/cloud-foundry.ts`  
  - `apps/extension/src/options/connectors/cloud-vertex.ts`  
  - `apps/extension/src/options/connectors/cloud-bedrock.ts`  
  - `apps/extension/src/options/connectors/index.ts`  
  - `apps/extension/src/__tests__/options-cloud-connectors.test.ts`
- Modify: `apps/extension/src/options.ts`
- Test: `apps/extension/src/__tests__/options-cloud-connectors.test.ts`

- [ ] **Step 1: Write failing connector tests for validation and metadata sanitization**

```ts
it("never persists raw credential fields in sanitized metadata", () => {
  const metadata = sanitizeCloudConnectorMetadata({ apiKey: "sk-secret", baseUrl: "https://api.anthropic.com" });
  expect(Object.values(metadata).join(" ")).not.toContain("sk-secret");
  expect(metadata.connectionHandle).toBeDefined();
});
it("requires roleArn for bedrock.assume_role and treats externalId as optional", () => {
  const valid = validateCloudConnectorInput("cloud-bedrock", {
    methodId: "bedrock.assume_role",
    roleArn: "arn:aws:iam::111122223333:role/byom-bedrock-role",
    externalId: "optional-external-id",
    region: "us-east-1",
  });
  expect(valid.ok).toBe(true);
  const missingRole = validateCloudConnectorInput("cloud-bedrock", {
    methodId: "bedrock.assume_role",
    region: "us-east-1",
  });
  expect(missingRole.ok).toBe(false);
});
```

- [ ] **Step 2: Run options connector tests and verify failure**

Run: `npm run -w @byom-ai/extension test -- src/__tests__/options-cloud-connectors.test.ts`  
Expected: FAIL (connector module missing).

- [ ] **Step 3: Extract connector modules and wire options form to native cloud connection methods**

```ts
const CONNECTORS = [...LOCAL_CONNECTORS, ...CLOUD_CONNECTORS, CLI_CONNECTOR];
// Bedrock wizard for assume-role must include roleArn (required), externalId (optional), region (required), and default assume-role depth=1.
```

- [ ] **Step 4: Re-run connector + options-adjacent tests**

Run: `npm run -w @byom-ai/extension test -- src/__tests__/options-cloud-connectors.test.ts src/__tests__/background.test.ts src/__tests__/popup-state.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/options.ts apps/extension/src/options/connectors apps/extension/src/__tests__/options-cloud-connectors.test.ts
git commit -m "feat(extension): add secure multi-cloud connection wizard connectors"
```

---

### Task 11: Integrate reconnect/discovery state events, observability, and targeted validation

**Files:**
- Modify: `apps/extension/src/background.ts`, `apps/extension/src/events.ts`, `apps/extension/src/transport/runtime.ts`, `apps/extension/src/options.ts`, `apps/extension/src/popup.ts`, `apps/extension/src/__tests__/background.test.ts`, `apps/extension/src/__tests__/popup-state.test.ts`, `apps/extension/src/__tests__/popup-render.test.ts`
- Modify: `apps/bridge/src/cloud/discovery-cache.ts`, `apps/bridge/src/cloud/error-redaction.ts`, `apps/bridge/src/telemetry/cloud-observability.ts`, `apps/bridge/src/__tests__/integration.native-messaging.test.ts`, `apps/bridge/src/__tests__/discovery-cache.test.ts`, `apps/bridge/src/__tests__/cloud-observability.test.ts`, `apps/bridge/src/__tests__/error-redaction.test.ts`
- Modify: `RUNNING_AND_USAGE_GUIDE.md`

- [ ] **Step 1: Write failing tests for cloud connection health and revocation propagation**

```ts
it("marks in-flight cloud request revoked when bridge emits credential revocation", async () => {
  await expect(service.forwardRequest(req)).rejects.toMatchObject({ reasonCode: "auth.expired" });
});
it("maps partial/stale region discovery to attention/degraded connection states", async () => {
  const state = deriveConnectionState({ regions: [{ id: "us-east-1", status: "stale" }, { id: "us-west-2", status: "healthy" }] });
  expect(state).toBe("attention");
});
it("invalidates extension snapshot cache on policy change and provider.unavailable threshold", async () => {
  await onPolicyVersionChanged("pol.v5");
  await onProviderUnavailableThreshold({ providerId: "provider.claude", failures: 3 });
  expect(readProviderSnapshot("provider.claude")?.cacheStatus).toBe("stale");
});
it("propagates reconnecting/failed/revoked states through runtime, options, and popup renderers", async () => {
  setProviderState("provider.claude", "reconnecting");
  expect(readPopupBadge("provider.claude")).toContain("Reconnecting");
  setProviderState("provider.claude", "failed");
  expect(readPopupBadge("provider.claude")).toContain("Action required");
  setProviderState("provider.claude", "revoked");
  expect(readPopupBadge("provider.claude")).toContain("Revoked");
});
it("propagates degraded discovery state with explicit regional fallback messaging", async () => {
  setProviderState("provider.claude", "degraded", {
    regions: [{ regionId: "us-east-1", status: "unavailable" }, { regionId: "us-west-2", status: "partial" }],
  });
  expect(readPopupBadge("provider.claude")).toContain("Degraded");
  expect(readPopupDetails("provider.claude")).toContain("Fallback region");
});
it("records correlation continuity and stage histograms with reason/retry tags", async () => {
  await runCloudSend({ correlationId: "corr.test.001" });
  expect(metrics.stageLatencyHistogram).toHaveRecorded("cloud.send", expect.objectContaining({ correlationId: "corr.test.001" }));
  expect(metrics.errorTags).toContainEqual(expect.objectContaining({ reasonCode: "transport.transient_failure", retryable: true }));
});
it("emits required SLI metrics for connect/send/stream/refresh/recovery paths", async () => {
  await runConnectAndSendScenario();
  expect(metrics.sli).toContainEqual(expect.objectContaining({ name: "cloud.connect.success_rate" }));
  expect(metrics.sli).toContainEqual(expect.objectContaining({ name: "cloud.chat.send.success_rate" }));
  expect(metrics.sli).toContainEqual(expect.objectContaining({ name: "cloud.stream.interruption_rate" }));
  expect(metrics.sli).toContainEqual(expect.objectContaining({ name: "cloud.token.refresh.success_rate" }));
  expect(metrics.sli).toContainEqual(expect.objectContaining({ name: "cloud.recovery.mttr" }));
});
it("redacts raw provider errors and secrets from user-visible messages", () => {
  const safe = toSafeUserError({
    providerError: "401 invalid api_key=sk-secret token=abc",
    reasonCode: "auth.invalid",
  });
  expect(safe.message).not.toContain("sk-secret");
  expect(safe.message).not.toContain("token=");
  expect(safe.reasonCode).toBe("auth.invalid");
});
```

- [ ] **Step 2: Run targeted tests and verify failure**

Run: `npm run -w @byom-ai/extension test -- src/__tests__/background.test.ts src/__tests__/popup-state.test.ts src/__tests__/popup-render.test.ts && npm run -w @byom-ai/bridge test -- src/__tests__/integration.native-messaging.test.ts src/__tests__/discovery-cache.test.ts src/__tests__/cloud-observability.test.ts src/__tests__/error-redaction.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement event propagation and final integration wiring**

```ts
events.emit("connection-health-changed", { providerId, state, reasonCode });
events.emit("connection-discovery-updated", {
  providerId,
  cache: { tier: "hot", ttlMs: 300_000 },
  regions: [{ regionId: "us-east-1", status: "stale" }],
});
persistedSnapshot.ttlMs = 86_400_000; // 24h extension metadata cache
invalidateSnapshotOn("credential.revoke");
invalidateSnapshotOn("credential.rotate");
invalidateSnapshotOn("policy.version.changed");
invalidateSnapshotOn("provider.unavailable.threshold");
telemetry.record("cloud.discovery.cache.hit_rate", { providerId, tier: "hot" });
telemetry.recordStageLatency("cloud.connect.validate", durationMs, { correlationId, providerId, methodId });
telemetry.recordStageLatency("cloud.send", sendDurationMs, { correlationId, providerId, modelId });
telemetry.recordError({ machineCode, reasonCode, retryable, correlationId, providerId, methodId });
renderProviderState("reconnecting" | "failed" | "revoked"); // popup + options parity
const safeError = toSafeUserError(rawProviderError); // enforce non-leaky user messages
auditDebugLog(redactProviderPayload(rawProviderError));
```

- [ ] **Step 4: Run targeted integration tests**

Run:
```bash
npm run -w @byom-ai/extension test -- src/__tests__/background.test.ts
npm run -w @byom-ai/extension test -- src/__tests__/popup-state.test.ts src/__tests__/popup-render.test.ts
npm run -w @byom-ai/bridge test -- src/__tests__/integration.native-messaging.test.ts src/__tests__/discovery-cache.test.ts src/__tests__/cloud-observability.test.ts src/__tests__/error-redaction.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit final integration and docs**

```bash
git add apps/extension/src/background.ts apps/extension/src/events.ts apps/extension/src/transport/runtime.ts apps/extension/src/options.ts apps/extension/src/popup.ts apps/extension/src/__tests__/background.test.ts apps/extension/src/__tests__/popup-state.test.ts apps/extension/src/__tests__/popup-render.test.ts apps/bridge/src/cloud/discovery-cache.ts apps/bridge/src/cloud/error-redaction.ts apps/bridge/src/telemetry/cloud-observability.ts apps/bridge/src/__tests__/cloud-observability.test.ts apps/bridge/src/__tests__/discovery-cache.test.ts apps/bridge/src/__tests__/error-redaction.test.ts apps/bridge/src/__tests__/integration.native-messaging.test.ts RUNNING_AND_USAGE_GUIDE.md
git commit -m "feat(cloud): finalize connection health propagation and rollout docs"
```

---

### Task 12: Add migration compatibility + feature flags + canary/rollback controls

**Files:**
- Create: `apps/extension/src/provider-migrations.ts`, `apps/extension/src/__tests__/provider-migrations.test.ts`
- Modify: `apps/bridge/src/config/cloud-feature-flags.ts`, `apps/bridge/src/config/index.ts`, `apps/bridge/src/main.ts`, `apps/bridge/src/__tests__/cloud-feature-flags.test.ts`, `apps/extension/src/index.ts`, `RUNNING_AND_USAGE_GUIDE.md`
- Test: `apps/bridge/src/__tests__/cloud-feature-flags.test.ts`, `apps/extension/src/__tests__/provider-migrations.test.ts`

- [ ] **Step 1: Write failing tests for migration normalization and flag gating**

```ts
it("marks legacy cloud records as needsReconnect when no valid connectionHandle exists", () => {
  const migrated = migrateProviderRecord({ type: "cloud", metadata: { baseUrl: "https://api.anthropic.com" } });
  expect(migrated.metadata.needsReconnect).toBe("true");
});
it("denies cloud provider execution when cloudBrokerV2Enabled is false", () => {
  expect(isCloudExecutionEnabled(flags, "anthropic.api_key")).toBe(false);
});
it("resolves registered cloud adapter packages for runtime loading", async () => {
  await expect(resolveCloudAdapter("microsoft-foundry")).resolves.toBeDefined();
  await expect(resolveCloudAdapter("google-vertex-ai")).resolves.toBeDefined();
  await expect(resolveCloudAdapter("amazon-bedrock")).resolves.toBeDefined();
});
it("enforces canary allowlists for extension IDs and origins", () => {
  expect(isCanaryAllowed({ extensionId: "ext-unknown", origin: "https://app.example.com" }, allowlist)).toBe(false);
});
```

- [ ] **Step 2: Run failing migration/flag tests**

Run: `npm run -w @byom-ai/bridge test -- src/__tests__/cloud-feature-flags.test.ts && npm run -w @byom-ai/extension test -- src/__tests__/provider-migrations.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement phased migration and rollout controls**

```ts
const CLOUD_FEATURE_FLAGS = [
  "cloudBrokerV2Enabled",
  "cloudProvider.anthropic.apiKey.enabled",
  "cloudProvider.anthropic.oauth.enabled",
  "cloudProvider.foundry.enabled",
  "cloudProvider.vertex.enabled",
  "cloudProvider.bedrock.enabled",
] as const;
const CLOUD_CANARY_ALLOWLIST = {
  extensionIds: parseCsvEnv("BYOM_CLOUD_CANARY_EXTENSION_IDS"), // defaults to []
  origins: parseCsvEnv("BYOM_CLOUD_CANARY_ORIGINS"), // defaults to []
};
if (!isCanaryAllowed(requestContext, CLOUD_CANARY_ALLOWLIST)) return deny("policy.denied");
// Ensure workspace package wiring resolves new adapters at runtime and in tests.
registerCloudAdapterPackage("@byom-ai/adapter-microsoft-foundry");
registerCloudAdapterPackage("@byom-ai/adapter-google-vertex-ai");
registerCloudAdapterPackage("@byom-ai/adapter-amazon-bedrock");
```

- [ ] **Step 4: Re-run migration/flag tests and final full repo quality gates**

Run:
```bash
npm run -w @byom-ai/bridge test -- src/__tests__/cloud-feature-flags.test.ts
npm run -w @byom-ai/extension test -- src/__tests__/provider-migrations.test.ts
npm run lint
npm run typecheck
npm run test
npm run build
```
Expected: PASS.

- [ ] **Step 5: Commit rollout controls and migration docs**

```bash
git add apps/bridge/src/config/cloud-feature-flags.ts apps/bridge/src/config/index.ts apps/bridge/src/main.ts apps/bridge/src/__tests__/cloud-feature-flags.test.ts apps/extension/src/provider-migrations.ts apps/extension/src/index.ts apps/extension/src/__tests__/provider-migrations.test.ts RUNNING_AND_USAGE_GUIDE.md
git commit -m "feat(cloud): add migration normalization and rollout feature flags"
```

---

### Task 13: Add mandatory adapter release gates (signature/sandbox/version matrix) in CI

**Files:**
- Create: `ops/tests/release-gates/adapter-conformance-gates.test.ts`, `ops/tests/release-gates/adapter-version-matrix-gates.test.ts`
- Modify: `.github/workflows/reliability-gates.yml`, `RUNNING_AND_USAGE_GUIDE.md`
- Test: `ops/tests/release-gates/adapter-conformance-gates.test.ts`, `ops/tests/release-gates/adapter-version-matrix-gates.test.ts`

- [ ] **Step 1: Write failing release-gate tests for adapter onboarding constraints**

```ts
it("fails when adapter artifact signature or sandbox egress contract is missing", async () => {
  await expect(runAdapterConformanceGate("adapter-google-vertex-ai")).rejects.toThrow();
});
it("fails when runtime/adapters version compatibility matrix is not satisfied", async () => {
  await expect(runAdapterVersionMatrixGate()).rejects.toThrow();
});
```

- [ ] **Step 2: Run failing release-gate tests**

Run: `npm run test -- ops/tests/release-gates`  
Expected: FAIL.

- [ ] **Step 3: Add CI workflow gate jobs for adapter conformance and matrix checks**

```yaml
- name: Run adapter conformance release gates
  run: npm run test -- ops/tests/release-gates/adapter-conformance-gates.test.ts
- name: Run adapter runtime version matrix gates
  run: npm run test -- ops/tests/release-gates/adapter-version-matrix-gates.test.ts
```

- [ ] **Step 4: Re-run release-gate tests and workflow-local validation**

Run:
```bash
npm run test -- ops/tests/release-gates
npm run lint
npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit CI/release gating**

```bash
git add .github/workflows/reliability-gates.yml ops/tests/release-gates/adapter-conformance-gates.test.ts ops/tests/release-gates/adapter-version-matrix-gates.test.ts RUNNING_AND_USAGE_GUIDE.md
git commit -m "ci(release): enforce adapter conformance and version matrix gates"
```

---

## Final Verification Checklist

- [ ] Cloud connect/test/save works for Anthropic subscription + API key methods.
- [ ] Cloud connect/test/save works for Foundry, Vertex, and Bedrock.
- [ ] `chat.send` and `chat.stream` execute through cloud bridge path with no `provider.unavailable` broker gap.
- [ ] Extension storage contains no secrets and no bridge `CredentialRef`.
- [ ] Handle replay/proof tampering is denied with canonical reason codes.
- [ ] Revocation epoch races fail closed.
- [ ] Discovery cache policy is enforced (hot=5m, negative=60s) with explicit invalidation triggers.
- [ ] Scheduled background discovery refresh runs at configured interval and on connect/reconnect.
- [ ] Stage timeout budgets match spec (`5s/10s/15s/8s/60s/15s/5s`) and are covered by tests.
- [ ] User-visible cloud errors are non-leaky and provider payloads are redacted in debug/audit paths.
- [ ] Legacy cloud provider records are normalized and flagged `needsReconnect` safely.
- [ ] Provider-level and global cloud rollout flags support canary and rollback.
- [ ] CI release gates enforce adapter signature/sandbox/conformance + version matrix before release.
- [ ] Existing local (Ollama) and CLI paths remain green.

## Definition of Done

- All plan tasks merged with passing tests and quality gates.
- Bridge is authoritative for cloud auth/execution decisions.
- Cloud providers execute with secure credential handling and actionable failures.
- New provider/method onboarding requires only contract-compliant adapter and connector module additions.
- Production rollout controls (flags/canary/rollback) are documented and tested.

