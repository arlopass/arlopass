# Design Spec: Arlopass Wallet (Sub-Project 1)

## Document Metadata

- **Date:** 2026-03-23
- **Status:** Draft for review
- **Project:** Arlopass SDK ("MetaMask for AI")
- **Spec Scope:** First implementation slice for secure provider mediation
- **Primary Pillars:** Security, Reliability, Robustness

---

## 1) Problem Statement

Web apps want to add AI chat/copilot experiences, but provider access is usually app-owned (API keys managed by the app). This creates risk for users and enterprises: reduced user control, unclear data boundaries, and difficult governance.

We need an open source, enterprise-grade mechanism that lets users bring their own AI providers (local and cloud), approve usage per app, and route requests through a trusted mediation layer.

---

## 2) Scope and Decomposition

The overall Arlopass initiative spans multiple independent subsystems. To keep planning and execution reliable, this spec intentionally focuses on **Sub-Project 1**:

**Sub-Project 1: Secure Provider Mediation Core**
- Web SDK connection and request API
- Browser wallet extension for consent/permissions
- Local bridge runtime for secure provider execution
- Initial adapters: one local (Ollama) and one cloud subscription (Claude)

This slice produces an end-to-end path that proves architecture and security model before scaling adapters and enterprise controls.

### Out of Scope for This Spec
- Full enterprise admin console
- Large adapter marketplace UX
- Advanced multi-model orchestration/routing strategies
- Hosted broker service

---

## 3) Goals and Non-Goals

### Goals
1. Let a web app request AI chat with a user-selected provider.
2. Ensure user consent is explicit, origin-scoped, and revocable.
3. Prevent provider credentials from being exposed to web app JavaScript.
4. Support streaming responses across SDK -> extension -> bridge -> adapter.
5. Enforce policy and permission checks at two layers (extension + bridge).

### Non-Goals
1. Building a generic cloud backend in v1 slice.
2. Supporting every provider-specific feature in first release.
3. Silent background provider use without visible user approval.

## v1 Support Matrix
- **Browsers:** Chromium-based browsers (Chrome, Edge) only.
- **Operating Systems:** Windows 11+, macOS 13+, Ubuntu 22.04+.
- **Out of scope for v1:** Firefox/Safari and mobile browsers.

---

## 4) Architecture Overview

## Recommended Architecture
**Extension-first wallet model with local bridge runtime** (MetaMask-inspired trust model).

### Components
1. **`@arlopass/web-sdk` (app-facing library)**
   - Public API for connect, provider selection, request, and stream.
   - No direct access to provider secrets.
   - Strongly typed request/response and typed errors.
   - **Canonical app-facing interface** (apps should not call injected provider transport directly).

2. **Browser Extension (`arlopass-wallet`)**
   - Injects a low-level provider transport into the page (`window.arlopass`-style object).
   - Owns consent prompts and permission lifecycle.
   - Stores origin-scoped grants and model/provider choices.
   - Preflight policy checks and request signing.

3. **Local Bridge (`arlopass-bridge`)**
   - Runs as a local process on user machine.
   - Hosts provider adapters and executes authorized requests.
   - Performs authoritative runtime policy enforcement.
   - Integrates with OS secure secret stores.

4. **Adapter Runtime + Adapters**
   - Contract-based adapter interfaces.
   - First-party adapters in this slice:
     - `adapter-ollama` (local models)
     - `adapter-claude-subscription` (cloud subscription via OAuth device flow)

5. **Protocol Package (`@arlopass/protocol`)**
   - Shared message schemas, capability descriptors, error taxonomy.
   - Version negotiation and compatibility rules.

## API Surface Ownership
- **Supported public API for app developers:** `@arlopass/web-sdk`.
- `window.arlopass` is transport plumbing managed by extension and SDK, not a stable app contract.
- SDK owns compatibility negotiation, retries, and typed error normalization.

## Claude Subscription Adapter Auth Contract
- **Auth mechanism:** OAuth 2.0 Device Authorization Grant (device code flow).
- **Token storage:** access/refresh tokens in OS secure store, never exposed to app.
- **Token lifecycle:** short-lived access token + refresh rotation managed by bridge.
- **Auth ownership:** login/reauth prompts are extension-mediated, never app-rendered.
- **Failure modes:**
  - Device flow denied/expired -> `AuthError` (non-retryable until user reauth)
  - Refresh token invalid/revoked -> `AuthError` (requires reconnect)
  - Provider auth endpoint timeout -> `TransientNetworkError` or `TimeoutError`

---

## 5) Trust Boundaries and Threat Model

### Trust Boundaries
1. **Untrusted app context** <-> **trusted extension context**
2. **Extension** <-> **local bridge**
3. **Bridge core** <-> **adapter process**
4. **Adapter** <-> **external provider endpoint/client**

### Primary Threats
1. Malicious origin requests hidden provider use.
2. Token/credential exfiltration into web app context.
3. Replay or tampering of extension-bridge messages.
4. Cross-origin permission confusion.
5. Adapter overreach (filesystem/network abuse).

### Security Baseline Controls
- Default deny: no permission, no request.
- Origin-scoped grants (`scheme + host + port`).
- Capability-scoped grants (chat-only capabilities in this slice).
- Request nonce + timestamp expiry for anti-replay.
- No executable unauthenticated loopback API in v1.
- Optional diagnostics endpoint (if enabled by policy) must bind to `127.0.0.1` only and expose no provider execution commands.
- Secrets stored only in OS secure stores.

## Extension <-> Bridge Trust Bootstrap
- **Primary transport:** browser Native Messaging host (`com.arlopass.bridge`) with allowlisted extension IDs.
- **Binary trust:** bridge executable must be code-signed; host registration is pinned to expected publisher and install path.
- **Handshake:** extension and bridge run challenge-response and derive an ephemeral session key before executing requests.
- **Request integrity:** every executable request carries signed envelope, nonce, and short expiry.
- **Spoofing resistance:** bridge rejects unauthenticated local-process traffic by default; only authenticated Native Messaging sessions can execute requests.
- **v1 executable path:** Native Messaging only.

---

## 6) Capability and Permission Model

## Capability Catalog (initial)
- `provider.list`
- `session.create`
- `chat.completions`
- `chat.stream`

## Permission Grant Model
- **Grant types:** one-time, session, persistent
- **Grant key:** `{origin, providerId, modelId, capabilitySet}`
- **Session boundary:** browser-tab session ID created at `connect`; ends on tab close, disconnect, or bridge session invalidation.
- **Revocation:** explicit UI in extension + immediate deny enforcement in extension and bridge + API event notifying SDK.

## Grant Lifecycle Semantics
| Grant Type | Activation | Consumption Rule | Expiry | Revocation Behavior |
|---|---|---|---|---|
| one-time | After explicit user approval | Consumed by first matching successful request attempt | Immediate after consumption or 5 min max if unused | Immediate; queued/in-flight follow-ups denied |
| session | After explicit user approval | Reusable for matching requests in same session boundary | On session end (tab close/disconnect/bridge session reset) | Immediate; subsequent requests denied |
| persistent | After explicit user approval with "remember" confirmation | Reusable across sessions for same grant key | Until user revoke or policy invalidation | Immediate; cache invalidated and bridge denies next request |

Rules:
- For `provider.list` and `session.create`, `providerId/modelId` in grant key are `*` (wildcard scope), bound only to origin + capability set.
- A changed `capabilitySet`, `providerId`, or `modelId` always requires a new grant.
- Deny decisions are not cached as allow; app must re-request to prompt user again.
- Grant checks happen in extension preflight and bridge runtime; bridge result is authoritative.

## Consent UX Rules
1. Consent prompts must be generated by extension UI, never app-rendered.
2. Prompt must show origin, provider, model, capabilities requested.
3. No high-risk capabilities are enabled in v1; extra-confirmation path is reserved for future capabilities.

---

## 7) Core Data Flows

## Flow A: Initial Connect
1. App calls `Arlopass.connect({ appId })`.
2. SDK discovers extension provider object.
3. Extension validates origin and opens Native Messaging channel to bridge.
4. Extension and bridge complete challenge-response and establish session key.
5. SDK receives connected state + available capabilities.

Failure modes:
- Extension missing -> `ProviderUnavailableError`
- Handshake timeout -> `TimeoutError`
- Bridge signature/publisher validation failure -> `AuthError`

## Flow B: Provider Selection and Permission
1. App requests provider list.
2. User selects provider/model in extension UI.
3. Extension records grant decision.
4. SDK receives selected provider context.

Failure modes:
- User rejects -> `PermissionError`
- Provider unavailable -> `ProviderUnavailableError`
- Claude account not authenticated -> `AuthError`

## Flow C: Chat Streaming
1. SDK sends `chat.stream` request with correlation ID.
2. Extension validates grant and signs request envelope.
3. Bridge verifies envelope, evaluates runtime policy, dispatches adapter.
4. Adapter emits stream chunks to bridge -> extension -> SDK -> app.
5. Completion event closes stream.

Failure modes:
- Policy block -> `PolicyViolationError`
- Adapter transient failure -> `TransientNetworkError`
- Provider timeout -> `TimeoutError`

---

## 8) Protocol and Interface Contracts

## Message Envelope (conceptual)
- `protocolVersion`
- `requestId`
- `origin`
- `capability`
- `providerId`
- `modelId`
- `issuedAt`
- `expiresAt`
- `nonce`
- `payload`
- `signature` (extension-originated for bridge verification)

## Adapter Interface (required)
- `describeCapabilities()`
- `listModels()`
- `createSession()`
- `sendMessage()`
- `streamMessage()`
- `healthCheck()`
- `shutdown()`

All adapter I/O must use shared schemas from `@arlopass/protocol`.

## Error Taxonomy (stable API)
- `AuthError`
- `PermissionError`
- `ProviderUnavailableError`
- `PolicyViolationError`
- `TimeoutError`
- `TransientNetworkError`

Every error returns:
- machine-readable code
- safe message
- retryability flag
- correlation ID

---

## 9) Security Design Details

## Secret Handling
- Provider credentials are never serialized into app-visible responses.
- Bridge stores credentials in OS keychain abstractions.
- Access mediated through short-lived in-memory tokens where supported.

## Channel Hardening
- Extension-bridge handshake uses per-session ephemeral keys.
- All executable requests must include signed envelope + freshness checks.
- Replay-protected via nonce cache + expiry window.

## Adapter Isolation Strategy
- Adapters execute with least privilege and restricted runtime permissions.
- Adapter manifest defines required capabilities and network egress rules.
- Non-declared behavior is denied by runtime policy.

## Logging and Privacy
- Prompt/response content logging is disabled by default.
- Sensitive fields are redacted in operational logs.
- Audit events are metadata-first (who/what/when/outcome), not content dumps.

---

## 10) Reliability and Robustness Design

## Session State Machine
`disconnected -> connecting -> connected -> degraded -> failed -> reconnecting`

Rules:
- Invalid transitions are rejected.
- Reconnect flow retains minimal recoverable context.

## Resilience Patterns (v1 must-have)
- Retry with exponential backoff + jitter on transient failures.
- Request timeout and cancellation propagation.
- Idempotency keys for retried operations.

## Resilience Patterns (stretch for this slice)
- Per-provider circuit breaker (enabled once baseline end-to-end stability is met).

## Compatibility and Versioning
- Semantic versioning for protocol package.
- SDK/extension/bridge compatibility matrix tested in CI.
- Controlled deprecation path for protocol fields.

## Defensive Limits
- Maximum prompt payload size per request: **128 KB** UTF-8.
- Maximum concurrent streams per origin: **3** (default), configurable by policy.
- Request timeout default: **60 seconds** (stream handshake), adapter override allowed up to policy max.
- Backpressure handling for slow consumers.

---

## 11) Observability and Auditability

## Required Telemetry
- Request lifecycle events: accepted, denied, routed, failed, retried, completed.
- Latency metrics by provider/model (P50/P95/P99).
- Stream interruption rate.
- Permission denial and policy block rates.

## Traceability
- Correlation ID propagates end-to-end across SDK, extension, bridge, adapter.
- Error events include correlation ID and source component.

## Audit Event Schema (initial)
- `timestamp`
- `origin`
- `providerId`
- `modelId`
- `capability`
- `decision` (allow/deny)
- `reasonCode`
- `correlationId`

---

## 12) Testing Strategy

## Unit Tests
- Schema validation and protocol codec tests.
- Permission decision and policy predicate tests.
- Adapter contract compliance tests.

## Integration Tests
- SDK <-> extension handshake
- Extension <-> bridge signed request validation
- Bridge <-> adapter streaming behavior

## End-to-End Tests
- Local Ollama flow
- Cloud Claude subscription flow
- Claude OAuth device flow success, denial, expiry, and refresh-recovery
- User rejection flow
- Bridge restart/reconnect flow

## Security Tests
- Replay attack simulation
- Cross-origin impersonation attempts
- Token exfiltration negative tests
- Adapter manifest policy violation tests

## Reliability/Robustness Tests
- Fault injection (adapter crash, timeout, network flap)
- Long-running stream soak tests
- Version skew compatibility tests

---

## 13) Implementation Boundaries for Planning

This spec is ready to convert into an implementation plan with tasks grouped by:
1. `packages/protocol`
2. `packages/web-sdk`
3. `apps/extension`
4. `apps/bridge`
5. `adapters/adapter-ollama`
6. `adapters/adapter-claude-subscription`
7. cross-cutting test and CI hardening

---

## 14) Success Criteria (for this sub-project)

1. A demo web app can connect via SDK and request chat.
2. User must explicitly approve provider/model/capabilities in extension.
3. Chat stream works through bridge with at least two adapters (local + cloud).
4. No provider credential is exposed to app runtime.
5. Security and reliability test suite passes for critical flows.

---

## 15) Risks and Mitigations

1. **Risk:** Bridge abuse from unauthorized local processes  
   **Mitigation:** strict handshake auth, signed envelopes, Native Messaging-only execution path, and diagnostics loopback (if enabled) bound to `127.0.0.1` without execution APIs.

2. **Risk:** Adapter quality drift  
   **Mitigation:** contract tests, signed artifacts, certification checks before default inclusion.

3. **Risk:** Browser integration complexity  
   **Mitigation:** Chromium-first support and strict compatibility matrix.

---

## 16) Deferred Items (explicitly postponed)

- `embeddings.create` capability
- Enterprise policy administration UI
- Full adapter marketplace and third-party trust program
- Advanced tool execution capability (`tools.execute`)
- Hosted relay/broker mode

---

## 17) Final Recommendation

Proceed with this extension-first, secure mediation slice as the foundation. It validates the trust model and end-to-end architecture while keeping implementation scope bounded enough for a high-confidence execution plan.
