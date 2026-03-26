# Design Spec: BYOM Cloud Provider Adapters and Connection Flows (v2)

## 1) Metadata and Pillars

### Metadata
- **Date:** 2026-03-24
- **Status:** Final design spec for implementation planning
- **Scope:** Cloud provider adapter architecture, connection methods, runtime connection flows, and migration to cloud-capable execution in bridge runtime
- **Primary surfaces:** `apps/extension`, `apps/bridge`, `adapters/runtime`, `adapters/*`, `packages/web-sdk`, `packages/protocol`

### Non-negotiable pillars
1. **Robustness** — explicit state machines, strict schema/contract validation, safe defaults.
2. **Reliability** — deterministic retries/timeouts, graceful reconnect, measurable SLOs.
3. **Extensibility** — add provider/method via contract + conformance gates, not ad hoc code paths.
4. **Airtight security** — bridge-authoritative enforcement, secret isolation, least privilege, non-leaky errors.

### Current repo constraints this design preserves
1. **Bridge authority remains final**
   - Extension preflight is advisory; bridge runtime is authoritative deny/allow (`apps/extension/src/policy/preflight-evaluator.ts`, `apps/bridge/src/policy/runtime-evaluator.ts`, `apps/bridge/src/permissions/runtime-enforcer.ts`).
2. **Stable SDK API stays stable**
   - `@byom-ai/web-sdk` public contract remains `connect`, `listProviders`, `selectProvider`, `chat.send`, `chat.stream`, `disconnect` (`packages/web-sdk/src/client.ts`).
   - `window.byom` remains transport plumbing, not the app contract (existing spec direction in `docs/superpowers/specs/2026-03-23-byom-ai-wallet-design.md`).
3. **Existing adapter runtime checks are mandatory**
   - Manifest schema enforcement, signature verification, sandbox permissions/egress, lifecycle health checks (`adapters/runtime/src/manifest-schema.ts`, `adapter-loader.ts`, `artifact-signature.ts`, `sandbox.ts`, `adapter-host.ts`).
4. **Known cloud-runtime gap is explicitly closed**
   - Current extension runtime throws `provider.unavailable` for `providerType: "cloud"` because secure runtime broker is missing (`apps/extension/src/transport/runtime.ts` + test `apps/extension/src/__tests__/transport-runtime.test.ts`).

---

## 2) Problem and Scope

### Problem
BYOM currently supports cloud provider configuration/testing in extension options, but cloud chat execution is blocked at runtime by design because no secure token broker path is wired into the bridge execution plane. This creates an architecture gap between “provider appears connected” and “provider can execute chat safely in production.”

### Scope
This design defines the enterprise-grade cloud connection and execution architecture for:
- Provider onboarding and connection method negotiation
- Credential brokering and secure storage
- Cloud adapter contract v2 and runtime invocation model
- Health, reconnect, discovery, and error behavior
- Migration from current cloud-runtime gap to v2

### In scope
- Anthropic (subscription account + console API key)
- Microsoft Foundry
- Google Vertex AI
- Amazon Bedrock
- Unified connect wizard behavior in extension UX
- Bridge control plane + adapter data plane integration

### Out of scope
- Full enterprise policy authoring UI changes
- Billing aggregation and chargeback dashboards
- Marketplace governance/legal process
- Non-cloud local provider redesign (Ollama/CLI remain supported as-is)

---

## 3) Goals / Non-goals

### Goals
1. Enable secure cloud chat execution through bridge runtime without exposing secrets to app context.
2. Standardize cloud connection methods behind a single adapter contract v2.
3. Preserve compatibility with stable SDK and protocol APIs.
4. Deliver actionable, non-leaky failures with canonical reason codes.
5. Provide deterministic reconnect and health lifecycle across providers.
6. Make onboarding of new cloud providers/methods safe through mandatory conformance gates.

### Non-goals
1. Replacing the existing app-facing SDK surface.
2. Allowing extension-only “connected” states to bypass bridge authority.
3. Accepting unsigned adapters or undeclared egress in production.
4. Provider-specific feature parity in v2 day one (focus: core chat/send/stream readiness).

---

## 4) Architecture Design

### 4.1 Domain model: `Provider -> ConnectionMethod -> CredentialRef (bridge-only) -> ConnectionHandle (extension) -> EndpointProfile -> Session`

#### Provider
Represents a vendor integration profile (e.g., `anthropic`, `microsoft-foundry`, `google-vertex-ai`, `amazon-bedrock`).

#### ConnectionMethod
Represents an auth/connection mode within a provider.
Examples:
- `anthropic.oauth_subscription`
- `anthropic.api_key`
- `foundry.aad_client_credentials`
- `vertex.service_account`
- `vertex.workload_identity_federation`
- `bedrock.aws_access_key`
- `bedrock.assume_role`

#### CredentialRef
Opaque reference (never raw secret) produced by bridge credential broker and stored only in bridge-controlled stores.
- Format: `credref.<provider>.<method>.<uuid>`
- Maps to bridge keychain record(s) and token metadata.

#### ConnectionHandle
Opaque, non-secret but non-portable bridge-issued handle used by extension to reference a credential binding.
- Format: `connh.<provider>.<method>.<uuid>.<sig>`
- Contains no credential material and is cryptographically bound to:
  - extension installation identity
  - allowed origin/policy context
  - provider + method + endpoint profile
  - credential version/epoch
- Handle is not accepted as an authorization primitive by itself.
- Every executable request must include **request-bound proof-of-possession**:
  - extension computes `proof = HMAC(sessionKey, requestId || nonce || origin || connectionHandle || payloadHash)`
  - `sessionKey` is handshake-derived, bridge-issued, and never persisted to extension storage
  - bridge verifies proof before resolving `ConnectionHandle -> CredentialRef`
- Bridge still requires signed envelope + nonce + grant checks per request.

#### EndpointProfile
Normalized runtime endpoint metadata:
- API base URL / region / tenant / project
- Optional deployment/model namespace
- TLS and egress policy selectors
- Discovery configuration (list endpoint, capability endpoint)

#### Session
Runtime execution context bound to:
- Origin
- Provider + model
- ConnectionMethod
- ConnectionHandle (extension-visible) resolved to CredentialRef (bridge-internal)
- Session health state + policy context

#### Persistence boundaries
- **Extension storage (`byom.wallet.providers.v1`)** stores provider metadata + `ConnectionHandle`, never plaintext credentials or `CredentialRef`.
- **Bridge keychain store** stores encrypted secret/token material.
- **Bridge metadata store** maps `ConnectionHandle -> CredentialRef` and enforces binding constraints.
- **In-memory runtime** stores ephemeral access tokens/session keys with TTL.

### 4.2 Adapter contract v2 for cloud methods

Cloud adapters extend current adapter contract with explicit connection and credential lifecycle hooks while preserving existing runtime methods.

```ts
export type CloudConnectionContext = Readonly<{
  providerId: string;
  methodId: string;
  endpointProfile: EndpointProfile;
  credentialRef: string; // bridge-internal only
  connectionHandle?: string; // optional for audit correlation
  correlationId: string;
}>;

export interface CloudAdapterContractV2 extends AdapterContract {
  // Control-plane
  listConnectionMethods(): readonly ConnectionMethodDescriptor[];
  beginConnect(input: BeginConnectInput): Promise<BeginConnectResult>;
  completeConnect(input: CompleteConnectInput): Promise<CompleteConnectResult>;
  validateCredentialRef(input: ValidateCredentialRefInput): Promise<ValidationResult>;
  revokeCredentialRef(input: RevokeCredentialRefInput): Promise<void>;

  // Discovery
  discoverModels(ctx: CloudConnectionContext): Promise<readonly ModelDescriptor[]>;
  discoverCapabilities(ctx: CloudConnectionContext): Promise<CapabilityDescriptor>;

  // Data-plane calls (compatible with v1 flow)
  createSession(options?: Record<string, unknown>): Promise<string>;
  sendMessage(sessionId: string, message: string): Promise<string>;
  streamMessage(sessionId: string, message: string, onChunk: (c: string) => void): Promise<void>;
}
```

#### Required v2 invariants
1. No adapter may persist raw credentials outside bridge broker APIs.
2. Every network call must pass sandbox egress checks from manifest policy.
3. All provider errors map to protocol reason codes + machine codes.
4. Adapter must return deterministic `retryable` semantics.
5. Bridge must resolve `ConnectionHandle -> CredentialRef` before adapter invocation.
6. Bridge must verify request-bound handle proof-of-possession before handle resolution.

### 4.3 Control plane vs data plane boundaries (extension / bridge / adapters)

#### Control plane (extension + bridge control handlers)
- Provider selection, connection method selection, user consent prompts
- Credential intake and one-time broker handoff
- Validation checks, model discovery orchestration, metadata persistence
- Session bootstrap and reconnect orchestration

#### Data plane (bridge runtime + adapters)
- Runtime request authorization (authoritative in bridge)
- Bridge resolves `ConnectionHandle -> CredentialRef` and performs token fetch/refresh
- Provider API invocation and stream handling
- Timeout/retry/circuit-breaker enforcement

#### Authority model
1. Extension can preflight and cache for UX responsiveness.
2. Bridge must re-verify envelope, policy, grants, and credential validity for every executable call.
3. If extension and bridge disagree, bridge decision wins.
4. Handle replay without valid request-bound proof is rejected as `request.replay_prone`.

### 4.4 Versioning and backward compatibility

#### API compatibility
- Keep `@byom-ai/web-sdk` method signatures unchanged.
- Cloud v2 behavior is internal transport/runtime enhancement; app API remains stable.

#### Protocol compatibility
- Keep protocol major version at `1.x`.
- Introduce optional envelope payload extensions for connection metadata; unknown optional fields must be tolerated.

#### Adapter/runtime compatibility
- Manifest schema remains `1.0.0` in migration phase; introduce additive optional fields:
  - `connectionMethods[]`
  - `credentialBrokerPolicy`
- Preserve current loader/sandbox/signature gates.
- New v2 adapters must still satisfy legacy `AdapterContract` methods.

---

## 5) Connection Flow Design

### 5.1 Unified Connect Provider wizard

#### Wizard stages (single flow framework for all cloud providers)
1. **Select provider** (Anthropic / Foundry / Vertex / Bedrock)
2. **Select connection method** (provider-specific auth modes)
3. **Enter credentials / identity inputs** (never persisted in extension plaintext)
4. **Run validation handshake** via bridge broker
5. **Discover models/capabilities**
6. **Review and save**
7. **Activate provider + optional default model**

#### Stage-level outputs
- `providerId`
- `methodId`
- `connectionHandle`
- `endpointProfile`
- `models[]`
- `capabilities`
- `status` (`connected|attention|disconnected`)

### 5.2 Detailed flow variants

#### A) Anthropic subscription account (OAuth/device/subscription method)

**Method ID:** `anthropic.oauth_subscription`

1. User selects **Anthropic Subscription Account**.
2. Extension requests bridge `beginConnect`.
3. Bridge adapter returns device authorization payload (`verification_uri`, `user_code`, `expires_in`, polling interval).
4. Extension displays code and polls bridge `completeConnect`.
5. Bridge exchanges code for tokens, stores tokens in keychain, returns `connectionHandle`.
6. Bridge runs `validateCredentialRef` (token introspection / lightweight API probe).
7. Adapter discovers models; extension saves provider metadata + `connectionHandle`.
8. Provider status set `connected`; active model selection allowed.

**Failure handling:**
- user denies/timeout -> `auth.invalid` (non-retryable until re-init)
- temporary network/provider outage -> `transport.transient_failure` or `provider.unavailable`

#### B) Anthropic console API key

**Method ID:** `anthropic.api_key`

1. User selects **Anthropic API Key**.
2. User enters API key in extension form.
3. Extension sends key once to bridge broker over authenticated native session.
4. Bridge stores key in keychain and returns `connectionHandle`; extension clears in-memory field immediately.
5. Bridge validates via `/v1/models` probe.
6. Adapter discovers models; extension persists metadata + `connectionHandle`.

**Failure handling:**
- invalid key -> `auth.invalid` with safe message
- rate-limited -> `transport.transient_failure` (retryable)
- endpoint outage -> `provider.unavailable`

#### C) Microsoft Foundry

**Method ID:** `foundry.aad_client_credentials` (initial), optional `foundry.aad_device_code`

1. User enters tenant ID, client ID, secret/cert reference, Foundry endpoint, optional deployment.
2. Bridge acquires AAD token for Foundry resource scope.
3. Bridge stores refresh material/secret reference in keychain, returns `connectionHandle`.
4. Adapter validates token + endpoint/deployment reachability.
5. Adapter discovers deployments/models and capabilities.
6. Extension persists normalized endpoint profile:
   - `tenantId`
   - `resourceName`
   - `deployment`
   - `apiVersion`

**Failure handling:**
- invalid tenant/client/secret -> `auth.invalid`
- insufficient RBAC -> `permission.denied` or `policy.denied` (if enterprise rule)
- regional outage -> `provider.unavailable`

#### D) Google Vertex AI

**Method IDs:** `vertex.service_account`, `vertex.workload_identity_federation`

1. User selects service account JSON or WIF configuration.
2. Bridge broker validates structure and stores secret material.
3. Bridge requests short-lived OAuth token for Vertex scope.
4. Adapter validates project/location/model endpoint.
5. Adapter discovers publisher models and allowed capabilities.
6. Extension stores `projectId`, `location`, `connectionHandle`, default model.

**Failure handling:**
- malformed key or invalid federation config -> `auth.invalid`
- IAM denial -> `permission.denied`
- quota exhaustion -> `transport.transient_failure`

#### E) Amazon Bedrock

**Method IDs:** `bedrock.aws_access_key`, `bedrock.assume_role`

1. User provides AWS access key pair or role ARN + external ID profile.
2. Bridge stores bootstrap secret and obtains STS session credentials.
3. Adapter validates region/model access through Bedrock control APIs.
4. Adapter discovers available foundation models for account/region.
5. Extension persists `region`, `connectionHandle`, model catalog snapshot timestamp.

**Failure handling:**
- invalid creds/signature mismatch -> `auth.invalid`
- missing Bedrock permissions -> `permission.denied`
- regional/model unavailability -> `provider.unavailable`

### 5.3 Health state model and reconnect lifecycle

#### Health states
`disconnected -> connecting -> connected -> attention -> degraded -> reconnecting -> failed -> revoked`

#### State semantics
- **connected:** auth valid, endpoint reachable, model catalog available.
- **attention:** credentials valid but partial issue (discovery stale, quota nearing, model removed).
- **degraded:** repeated runtime failures but recoverable.
- **reconnecting:** automatic recovery in progress (token refresh, endpoint probe).
- **failed:** hard failure requiring user/admin intervention.
- **revoked:** credentials explicitly revoked; calls denied until reconnect.

#### Reconnect lifecycle
1. Failure event occurs in data plane.
2. Bridge classifies failure:
   - token-expired -> refresh path
   - network/transient -> retry path
   - revoked/invalid -> terminal path
3. Bridge emits status update event to extension.
4. Extension updates provider status and surfaces user action if needed.
5. On successful recovery, state transitions to `connected`.

### 5.4 Model/capability discovery + caching

#### Discovery strategy
- Run discovery at connect completion, reconnect success, and scheduled background refresh.
- Keep provider-specific discovery adapters.
- Use region-aware fan-out with bounded parallelism and explicit partial outcomes.
- All discovery targets must be declared in adapter manifest egress rules before execution.
- Bridge orchestration validates each fan-out endpoint via sandbox egress checks (`assertEgressAllowed`) before request dispatch.
- Discovery calls to undeclared endpoints fail closed (`policy.denied`) and are audited.

#### Partial discovery semantics (multi-region / multi-endpoint providers)
- Discovery returns per-region status: `healthy | partial | stale | unavailable`.
- A connection is marked:
  - `connected` when at least one configured region is `healthy` and selected model is resolvable.
  - `attention` when selected model region is `partial|stale` but fallback region is healthy.
  - `degraded` when all regions are `partial|stale|unavailable`.
- Extension UI must surface which regions/models are currently degraded rather than hiding failures.

#### Cache policy
- **In-memory hot cache (bridge):** TTL 5 minutes
- **Extension persisted snapshot:** TTL 24 hours, metadata for UI/offline rendering
- **Negative cache (not found/forbidden):** TTL 60 seconds to prevent storming

#### Invalidation triggers
- credential rotation/revocation
- policy bundle change affecting provider/model access
- repeated `provider.unavailable` for model endpoint
- manual “refresh models” action

### 5.5 Error taxonomy (actionable, non-leaky)

| Category | Canonical reasonCode | Retryable | User-facing action | Internal details policy |
|---|---|---:|---|---|
| Authentication failure | `auth.invalid` / `auth.expired` | No / Conditional | Reconnect or rotate credential | Include provider/method IDs; never raw token/key |
| Authorization/policy | `permission.denied` / `policy.denied` | No | Request proper role/policy update | Include policy version + denied capability |
| Provider outage | `provider.unavailable` | Yes | Retry later / failover model | Include endpoint class + status bucket only |
| Transport timeout | `transport.timeout` | Yes | Retry with backoff | Include stage + timeout budget |
| Transient network | `transport.transient_failure` | Yes | Automatic retry | Include coarse network code class |
| Request shape/integrity | `request.invalid` / `request.replay_prone` | No | Fix client/request | Include field names, no sensitive payload |

#### Non-leak rule
All user-visible errors must be safe summaries. Raw provider error payloads can be logged only after redaction and only in protected debug channels.

---

## 6) Security Design

### 6.1 Credential broker and storage model

#### Broker architecture
1. Extension gathers credential input via trusted UI.
2. Input sent once through authenticated extension-bridge channel.
3. Bridge broker validates and stores credential in OS keychain backend.
4. Bridge stores `CredentialRef` internally and returns opaque `ConnectionHandle` to extension.

#### Storage model
- **At rest:** OS secure store via `KeychainStore` abstraction.
- **In memory:** short-lived decrypted token cache with strict TTL.
- **In extension storage:** no raw key/token and no `CredentialRef`; only `ConnectionHandle` + metadata.
- **Optional hardening (GA):** encrypt provider metadata blobs at rest in extension using a bridge-issued wrapping key.

#### Access control
- `CredentialRef` remains bridge-internal and scoped to provider + method + origin policy context.
- `ConnectionHandle` is cryptographically bound and rejected if used from a mismatched extension install/origin/policy context.
- Bridge verifies request-bound proof-of-possession for every request; handles presented without valid proof are never resolved.
- Every runtime call re-checks grant + policy + credential validity before use.

### 6.2 Token lifecycle, rotation, revocation

#### Lifecycle
1. **Issue:** initial connect -> broker stores long-lived material (where applicable).
2. **Use:** bridge requests/refreshes short-lived access token.
3. **Rotate:** proactive rotation before expiry window.
4. **Revoke:** explicit user/admin revoke invalidates cache immediately.

#### Rotation policy baseline
- refresh at 80% token lifetime
- jittered refresh window ±10%
- max refresh retries: 3
- single-flight refresh lock per `CredentialRef` to prevent refresh storms

#### Refresh exhaustion policy (must be deterministic)
- If refresh fails 3 consecutive times in one lease window:
  1. mark session `failed` with `auth.expired` (non-retryable until reconnect)
  2. stop automatic refresh attempts for cooldown window (default 5 minutes)
  3. emit actionable reconnect event to extension
  4. preserve redacted diagnostics for support/audit

#### Revocation
- On revoke event:
  - remove keychain entry (or mark invalid if shared record model)
  - clear in-memory token cache
  - transition provider to `revoked`
  - deny all subsequent runtime requests until reconnect

#### Revocation race handling (in-flight safety)
- Bridge maintains `credentialVersion`/`revocationEpoch`.
- Request admission checks epoch before dispatch.
- Request captures `admissionEpoch` before any blocking operation.
- If request waits on refresh lock, bridge must re-check current epoch immediately after lock release.
- If `currentEpoch !== admissionEpoch`, request fails closed with `auth.expired` and does not consume refreshed credentials.
- Stream/send completion path re-checks epoch before finalizing output.
- If revoke occurs mid-flight:
  - terminate stream/send with `auth.expired`
  - suppress partial completion commit
  - record `revocation_race_terminated=true` in audit metadata

### 6.3 Threat model + mitigations matrix

| Threat | Attack path | Mitigation | Owner |
|---|---|---|---|
| Credential exfiltration from app JS | App attempts direct credential access | No secrets in SDK/extension storage; bridge-only keychain storage | Bridge + extension |
| Replay/tamper of bridge requests | Reused/stolen envelope | Nonce + expiry verification, authenticated origin checks, signature validation | Bridge verifier |
| Extension stale allow bypass | Extension cache says allow | Bridge authoritative runtime evaluation (policy + grants) | Bridge runtime |
| Adapter overreach egress | Adapter calls undeclared host | Manifest egress rules + sandbox checks + deny default | Adapter runtime |
| Unsigned adapter supply chain | Malicious package load | Mandatory signature verification + key resolver policy | Adapter loader |
| Token misuse after revoke | Cached token still accepted | Immediate revoke invalidation + cache purge + deny gate | Credential broker |
| Error data leakage | Provider raw errors exposed | Safe user messages, redacted internal logs, structured details allowlist | All layers |

---

## 7) Reliability / Robustness / Performance Design

### 7.1 Timeout budgets by stage

| Stage | Budget | Notes |
|---|---:|---|
| Extension -> bridge connect handshake | 5s | Fail fast; explicit retry from UX |
| Credential validation call | 10s | Includes provider auth endpoint round-trip |
| Model discovery | 15s | Parallelizable per endpoint, capped fan-out |
| Token refresh | 8s | Trigger reconnect if exceeded |
| `chat.send` request | 60s default | Provider-specific lower cap allowed |
| `chat.stream` setup | 15s | Stream content timeout enforced separately |
| Health probe | 5s | Used by host periodic checks |

### 7.2 Retry / circuit-breaker / backpressure / hedging policy

#### Retry
- Exponential backoff with full jitter
- Base: 250ms, multiplier: 2, cap: 8s
- Max attempts:
  - control-plane validation: 2
  - data-plane send: 3
  - stream setup: 2

#### Circuit breaker
- Scope key: `tenant + origin + provider + method + region` (prevents one origin poisoning another).
- Optional global provider breaker may open separately for systemic provider outages.
- Open after 5 consecutive failures in 60s window
- Half-open after 30s cool-off
- Close after 3 consecutive successes

#### Backpressure
- Per-origin concurrent in-flight cloud requests cap (default: 3)
- Per-provider stream cap (default: 5)
- On breach: immediate `transport.transient_failure` with retry hint

#### Hedging
- Disabled by default for write-like operations
- Optional for discovery/read-only probes in high-latency regions

### 7.3 Observability + SLO/SLI model

#### Required SLIs
1. Connection success rate by provider/method
2. P95 connect-to-ready latency
3. `chat.send` success rate by provider/model
4. Stream interruption rate
5. Token refresh success rate
6. Mean time to recover from degraded state

#### Initial SLO targets
- Connect success rate: **>= 99.0%**
- Chat send success rate (excluding explicit policy denies): **>= 99.5%**
- P95 chat send latency overhead added by broker/runtime: **<= 250ms**
- Stream interruption rate: **< 1.0%**
- Recovery from transient outage: **< 60s** median

#### Telemetry requirements
- Correlation ID continuity across SDK -> extension -> bridge -> adapter
- Stage-level latency histograms
- Error code + reason code + retryability tags
- Redaction-safe structured logs only

### 7.4 Latency optimization architecture

1. Keep warm token cache in bridge with strict TTL.
2. Cache model catalogs with background refresh to avoid blocking UX.
3. Parallelize independent probes (auth validation + model discovery when possible).
4. Reuse HTTP keep-alive pools per provider endpoint.
5. Avoid extension round-trips after session activation for repeated sends.

---

## 8) Extensibility and Onboarding Design

### 8.1 Add a new provider safely

Required steps:
1. Add provider manifest and `connectionMethods` metadata.
2. Implement `CloudAdapterContractV2`.
3. Define endpoint profile schema + discovery strategy.
4. Add provider-specific error mapping to canonical taxonomy.
5. Add provider to unified wizard registry.

### 8.2 Add a new connection method safely

Required steps:
1. Define method descriptor (`methodId`, auth type, required fields, scopes).
2. Implement `beginConnect`/`completeConnect` and broker integration.
3. Add validation and revocation behavior.
4. Add migration compatibility rules if method supersedes an older one.

### 8.3 Required tests and conformance gates

#### Mandatory gates (cannot bypass)
1. **Manifest validation pass** (schema, capabilities, egress, risk level)
2. **Artifact signature verification pass**
3. **Sandbox permission + egress enforcement pass**
4. **Adapter contract conformance pass** (required methods, error shape)
5. **Health/lifecycle resilience pass** (timeouts, restart limits)
6. **Security negative tests pass** (replay, revoked credential, unauthorized egress)
7. **Version-compatibility matrix pass** (SDK/protocol/runtime)

#### Cloud-specific gates
- Credential broker integration tests
- Token refresh + revocation tests
- Discovery cache invalidation tests
- Non-leaky error redaction tests

---

## 9) Rollout and Migration Plan

### 9.1 Migration from current cloud-runtime gap to v2

#### Current baseline gap
Cloud providers can be configured/tested in extension options, but execution path currently returns `provider.unavailable` because cloud runtime broker is not wired.

#### Phased migration

**Phase 0 — groundwork**
- Add broker interfaces and `ConnectionHandle` plumbing in extension metadata.
- Keep `CredentialRef` strictly bridge-internal from day one.
- Keep existing runtime behavior unchanged behind default-off flags.

**Phase 0.5 — legacy cloud metadata normalization**
- Migrate existing cloud provider records to normalized `providerId + methodId + endpointProfile`.
- Mark migrated records as `needsReconnect` unless a valid bridge-side handle exists.
- Do not auto-promote old test-only cloud configs to executable sessions.

**Phase 1 — Anthropic API key method**
- Enable `anthropic.api_key` through full broker + runtime execution path.
- Preserve current SDK API, no app integration changes.

**Phase 2 — Anthropic subscription OAuth method**
- Add OAuth/device flow support.
- Enable reconnect + refresh + revoke lifecycle.

**Phase 3 — Foundry, Vertex, Bedrock adapters**
- Implement providers incrementally with conformance gates.
- Roll out by provider-level flags and environment allowlists.

**Phase 4 — default on**
- Promote v2 cloud path to default for supported providers.
- Keep legacy fallback path for controlled rollback window.

### 9.2 Feature flags, canary, rollback strategy

#### Feature flags
- `cloudBrokerV2Enabled`
- `cloudProvider.anthropic.apiKey.enabled`
- `cloudProvider.anthropic.oauth.enabled`
- `cloudProvider.foundry.enabled`
- `cloudProvider.vertex.enabled`
- `cloudProvider.bedrock.enabled`

#### Canary
- Start with internal/dev extension IDs + controlled origins.
- Ramp by provider and region.
- Monitor SLO and error-budget burn before each expansion.

#### Rollback
1. Disable provider-level flag (fastest blast-radius reduction).
2. Disable global `cloudBrokerV2Enabled` (fallback to current safe deny path).
3. Retain credential records; mark inactive until re-enable or explicit revoke.

---

## 10) Exit Criteria and Success Metrics

### Exit criteria
1. All five provider variants complete connect -> discover -> send/stream in staging.
2. No secret material appears in extension storage, SDK payloads, or app context.
3. Bridge remains authoritative under stale extension cache and policy mismatch scenarios.
4. Adapter runtime gates (manifest/signature/sandbox/health/conformance) are enforced in CI and release pipelines.
5. Backward compatibility validated for existing SDK consumers without code changes.

### Success metrics (first 30 days after rollout)
- Cloud connect success rate >= 99.0%
- Cloud chat send success rate >= 99.5%
- P95 cloud connect latency <= 4s
- P95 incremental runtime overhead <= 250ms
- Security incidents from credential leakage = 0
- Regression count in local/CLI providers = 0 critical regressions

---

## 11) Open Decisions

1. **Anthropic subscription flow transport:** confirm final OAuth/device flow contract and user UX constraints per browser policy.
2. **Foundry auth default:** client-secret vs cert-based bootstrap as enterprise default.
3. **Vertex primary method:** service account keys vs WIF-first posture for managed environments.
4. **Bedrock cross-account model:** default `assume_role` depth and external ID requirements.
5. **Manifest schema evolution timing:** keep additive `1.0.0` extensions vs explicit `2.0.0` schema bump.
6. **Regional failover policy:** whether automatic cross-region fallback is enabled by default or enterprise opt-in only.
7. **Token cache persistence:** strict in-memory only vs encrypted disk cache for restart performance.
