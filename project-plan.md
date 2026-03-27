# Project Plan: Arlopass SDK ("MetaMask for AI")

## 1) Executive Summary

Build an open source, enterprise-grade SDK that enables any web app to use a user's own AI providers, including local runtimes and paid subscriptions, without exposing credentials or private model access to the web app.

The product acts like a wallet for AI access:
- The app requests AI capabilities
- The user selects and approves a provider/model
- A secure mediation layer enforces permissions and policy
- Requests are routed to local or cloud providers through hardened adapters

This plan prioritizes three non-negotiable pillars:
- **Security:** explicit user consent, least privilege, zero trust boundaries, hardened bridge.
- **Reliability:** deterministic behavior, resilience under failures, observable and operable runtime.
- **Robustness:** strict contracts, version negotiation, graceful degradation, compatibility over time.

---

## 2) Product Vision, Goals, and Non-Goals

### Vision
Enable developers to integrate AI chat/copilot capabilities into web apps while ensuring users keep control over which provider/model is used and how data flows.

### Primary Goals (v1)
1. Let users connect one or more AI providers (local and cloud) and select one per app/session.
2. Provide a simple web SDK API (`connect`, `listProviders`, `sendMessage`, `stream`).
3. Enforce permission prompts and policy decisions outside app control.
4. Support at least these provider types:
   - Local Ollama models
   - Claude subscription account
   - Locally running CLI/client bridges (e.g., GitHub Copilot CLI, Claude Code/Desktop bridge)
5. Ship with enterprise controls: policy packs, audit events, allow/deny lists.

### Non-Goals (v1)
1. Building/training models.
2. Replacing provider-specific advanced features entirely.
3. Multi-tenant cloud hosting of user credentials by default.
4. "Silent" auto-use of providers without explicit consent.

---

## 3) Scope Decomposition (Large Project -> Sub-Projects)

This initiative is too large to execute as a single undifferentiated stream. It should be decomposed:

1. **Core Protocol + SDK**  
   Type-safe API, session lifecycle, capability model, streaming abstraction.

2. **Secure Mediation Surface**  
   Browser extension (wallet-style prompt UX) + local bridge daemon/native connector.

3. **Provider Adapter Runtime**  
   Adapter SDK + built-in adapters (Ollama, Claude subscription, local CLI bridge).

4. **Enterprise Security & Policy Layer**  
   Org policy engine, audit log schema, key management, compliance hooks.

5. **Reliability/Operations Platform**  
   Telemetry, health checks, retries, circuit breakers, chaos tests, release hardening.

Each sub-project should have its own spec -> implementation plan -> execution cycle. This document is the master program plan.

---

## 4) Architecture Approaches Considered

### Approach A (Recommended): Extension-First Wallet + Local Bridge
- Browser extension mediates app requests and user consent.
- Extension communicates with local bridge daemon/native host.
- Daemon hosts provider adapters.

**Pros**
- Strongest browser security posture and origin isolation.
- Familiar trust model (MetaMask-like).
- Centralized permission prompts and policy enforcement.

**Cons**
- Requires extension install.
- Native messaging setup complexity.

### Approach B: Localhost Daemon Only (No Extension)
- Web SDK talks to local daemon over loopback (`127.0.0.1`).

**Pros**
- Lower UX friction initially.
- Works without extension ecosystems.

**Cons**
- Higher attack surface (CORS/origin spoofing risks if not airtight).
- Harder to provide trusted consent UI independent of web app.

### Approach C: Hosted Broker Service
- App talks to cloud broker that routes to user providers.

**Pros**
- Simplifies browser integration.
- Easier centralized monitoring.

**Cons**
- Weakens user-control/privacy model.
- Significant credential and trust burden.

### Recommendation
Use **Approach A** as the primary architecture, with a tightly restricted Approach B fallback for non-extension environments.

---

## 5) Reference Architecture

## Components
1. **Web SDK (`@arlopass/web-sdk`)**
   - JS/TS library used by app developers.
   - Talks to extension provider API.
   - Handles session state, streaming, and typed errors.

2. **Provider Injection Layer**
   - `window.arlopass` style API exposed by extension.
   - EIP-1193-inspired request/response/event model adapted for AI capabilities.

3. **Browser Extension (`arlopass-wallet`)**
   - Trusted consent and permission UI.
   - Origin-aware permission store.
   - Policy evaluation and request signing.
   - Secure channel to local bridge/native host.

4. **Local Bridge Daemon (`arlopass-bridge`)**
   - Runs on user machine, loopback-only binding.
   - Adapter host runtime and health manager.
   - Secret storage integration (OS keychain).
   - Enforces policy and capabilities at execution point.

5. **Provider Adapters**
   - `adapter-ollama`
   - `adapter-claude-subscription`
   - `adapter-copilot-cli-bridge`
   - `adapter-claude-local-client-bridge`
   - Pluggable adapter contract with strict capability descriptors.

6. **Enterprise Policy Bundle (`@arlopass/policy`)**
   - Allow/deny provider and model rules.
   - Data handling policies (PII guardrails, redaction hooks).
   - Egress restrictions and audit sinks.

7. **Observability Package (`@arlopass/telemetry`)**
   - Metrics/traces/log schema.
   - OpenTelemetry exporters.
   - Health and reliability dashboards.

---

## 6) Trust Boundaries and Threat Model

## Critical Assets
- User provider credentials/tokens
- Prompt and response content
- Provider selection and permission grants
- Enterprise policy definitions
- Audit evidence integrity

## Trust Boundaries
1. Untrusted web app <-> trusted extension boundary
2. Extension <-> local bridge boundary
3. Local bridge <-> provider adapters boundary
4. Adapter <-> external provider API/CLI boundary
5. User device <-> enterprise policy/audit backend boundary

## Top Threats to Mitigate
1. Malicious web app attempting silent provider use.
2. Token exfiltration via compromised app or adapter.
3. Privilege escalation from one origin to another.
4. Prompt injection trying to trigger unsafe tools/actions.
5. Adapter supply-chain compromise.
6. Localhost bridge abuse by non-approved origins/processes.
7. Replay/tampering of bridge requests.
8. Data leakage in logs/telemetry.

---

## 7) Security Plan (Pillar 1: Security)

## 7.1 Identity, AuthZ, and Consent
- Per-origin app identity (`scheme + host + port`) with explicit user approval.
- Capability-scoped permissions:
  - `provider.list`
  - `session.create`
  - `chat.completions`
  - `embeddings.create`
  - `tools.execute` (optional, high risk)
- One-time and persistent grants; persistent grants require stronger UX confirmation.
- Every high-risk action requires user-visible confirmation.

## 7.2 Credential and Secret Handling
- Tokens never exposed to web app JS.
- Tokens stored only in OS secure stores (Windows Credential Manager, macOS Keychain, Linux Secret Service).
- Short-lived access tokens with refresh rotation.
- Optional hardware-backed keys where available.

## 7.3 Channel Security
- Extension <-> bridge communication authenticated with ephemeral session keys.
- Anti-replay nonces and strict request expiry.
- Loopback endpoints bind to `127.0.0.1` only, random high port, rotating session identifiers.
- Strict origin allowlist with explicit handshake challenge.

## 7.4 Policy Enforcement
- Dual enforcement points:
  - Preflight in extension (UX + intent validation)
  - Runtime in bridge (authoritative final check)
- Default-deny policy posture.
- Enterprise override policies signed and versioned.

## 7.5 Adapter Isolation and Sandboxing
- Adapters run with least privilege and restricted process permissions.
- No arbitrary filesystem access unless explicitly granted by policy.
- Signed adapter packages and integrity verification.
- Adapter API must be declarative and schema-validated.

## 7.6 Supply Chain Security
- SLSA-aligned build provenance.
- Sigstore/cosign signing for release artifacts.
- Dependency pinning, SBOM generation, license scanning.
- Mandatory security review for new first-party adapters.

## 7.7 Secure Defaults
- No auto-connect without consent.
- No wildcard origins.
- Sensitive fields redacted from logs by default.
- Dangerous capabilities disabled unless explicitly enabled.

## 7.8 Security Assurance Program
- Threat model reviews each release.
- SAST + DAST + dependency scans in CI.
- Fuzzing for protocol parsers and stream handling.
- External penetration test before GA.
- Public `SECURITY.md` with disclosure and response SLAs.

---

## 8) Reliability Plan (Pillar 2: Reliability)

## 8.1 Reliability Objectives
- Deterministic session lifecycle and reconnect behavior.
- Graceful handling of provider downtime or local bridge restart.
- Stable streaming even under intermittent connectivity.

## 8.2 Runtime Resilience Patterns
- Exponential backoff with jitter for retries.
- Circuit breakers per provider/adapter.
- Health probes:
  - Liveness (process up)
  - Readiness (provider reachable + auth valid)
- Request timeouts and cancellation propagation.
- Idempotency keys for retriable operations.

## 8.3 Session State Machine
- `disconnected -> connecting -> connected -> degraded -> failed -> reconnecting`
- Explicit transitions only; invalid transitions rejected and logged.
- Persist minimal session metadata for recovery after restart.

## 8.4 Observability and Operations
- Standardized events: request accepted, denied, routed, failed, retried, timed out.
- Metrics:
  - Success rate per provider/model
  - P50/P95/P99 latency
  - Stream interruption rate
  - Permission-denied and policy-block rates
- Trace request path across SDK -> extension -> bridge -> adapter.
- Provide enterprise alert templates and runbooks.

## 8.5 Error Taxonomy
- Stable typed error families:
  - `AuthError`
  - `PermissionError`
  - `ProviderUnavailableError`
  - `PolicyViolationError`
  - `TimeoutError`
  - `TransientNetworkError`
- Every error includes:
  - machine code
  - human-safe message
  - retryability flag
  - correlation id

---

## 9) Robustness Plan (Pillar 3: Robustness)

## 9.1 Strict Contracts and Validation
- Versioned JSON schemas for all protocol messages.
- Strict decoding; unknown required fields fail fast.
- Forward-compatible optional fields with negotiated capabilities.

## 9.2 Version Negotiation
- SDK, extension, bridge, and adapters publish semantic protocol versions.
- Compatibility matrix in CI.
- Controlled deprecation windows for breaking changes.

## 9.3 Degradation Strategy
- If a selected provider fails:
  - Show deterministic failure reason
  - Offer user-approved fallback provider
- If bridge unavailable:
  - Return explicit unavailable state, avoid silent failure
- If policy blocks request:
  - Return explainable block reason safe for app display

## 9.4 Cross-Platform and Browser Robustness
- Support Chromium first, then Firefox/Safari pathways.
- OS support baseline with conformance tests per platform.
- Character encoding, streaming chunk, and tool-call edge-case tests.

## 9.5 Abuse and Load Robustness
- Rate limits per origin and per provider.
- Backpressure-aware stream handling.
- Defensive limits for prompt size, tool payload size, and concurrent sessions.

---

## 10) Extensibility Model (New Provider Onboarding)

## 10.1 Adapter Contract
Each adapter must implement:
- `describeCapabilities()`
- `listModels()`
- `createSession()`
- `sendMessage()`
- `streamMessage()`
- `shutdown()`
- `healthCheck()`

Each method uses shared request/response schemas and error taxonomy.

## 10.2 Provider Manifest
Adapter manifest includes:
- provider id and version
- supported capabilities
- auth type (`local`, `oauth`, `api_key`, `cli_session`)
- data residency metadata
- risk level classification

## 10.3 Adapter Certification Pipeline
1. Static checks and linting
2. Contract conformance tests
3. Security policy tests
4. Reliability soak tests
5. Manual security review (for first-party/default adapters)

## 10.4 Developer Experience
- `create-arlopass-adapter` scaffolder
- Local adapter sandbox runner
- Contract test harness
- Example adapters and docs

---

## 11) API and UX Plan

## 11.1 Web SDK API (Conceptual)
```ts
const arlopass = await Arlopass.connect({ appId: "acme-copilot" });

const providers = await arlopass.listProviders();
await arlopass.selectProvider({ providerId: "ollama", model: "llama3.2" });

const stream = arlopass.chat.stream({
  messages: [{ role: "user", content: "Help me refactor this function." }],
});

for await (const chunk of stream) {
  render(chunk);
}
```

## 11.2 Permission UX Principles
- Clear human-readable prompt: app, provider, model, capabilities, retention policy.
- User can grant once, for session, or persistent.
- Easy revoke UI with origin-specific history.

## 11.3 Enterprise UX
- Admin policy view (what is blocked/allowed and why).
- Audit trail export for compliance workflows.

---

## 12) Implementation Workstreams and Milestones

## Workstream A: Foundation and Governance
- Repository structure, contribution model, coding standards.
- Security baseline (`SECURITY.md`, dependency policy, signing pipeline).

## Workstream B: Core Protocol and SDK
- Request/event protocol spec
- Type-safe SDK
- Error taxonomy and schema package

## Workstream C: Extension Wallet Surface
- Consent UI
- Permission store
- Provider injection API

## Workstream D: Local Bridge Runtime
- Adapter host process
- Secure channel and handshake
- Health manager and telemetry pipeline

## Workstream E: First-Party Adapters
- Ollama adapter
- Claude subscription adapter
- Copilot CLI local bridge adapter
- Claude local client bridge adapter

## Workstream F: Enterprise Controls
- Policy engine
- Audit schema/exporters
- Governance and compliance hooks

## Workstream G: Reliability Hardening
- Chaos tests
- Soak tests
- Compatibility matrix automation

## Milestone Exit Criteria (No Dates, Quality-Gated)
- **Alpha:** End-to-end happy path with one local adapter and one cloud adapter.
- **Beta:** Full permission model, policy engine, telemetry, and conformance tests.
- **RC:** Security review complete, reliability SLO evidence, migration docs.
- **GA:** Multi-platform support validated, adapter certification workflow live.

---

## 13) Testing and Verification Strategy

## 13.1 Test Layers
- Unit tests for SDK, policy engine, and schema validation.
- Integration tests for extension <-> bridge <-> adapters.
- End-to-end tests using real local runtimes and mocked cloud providers.
- Browser automation for permission UX and revocation flows.

## 13.2 Security Testing
- Threat-driven abuse case tests.
- Fuzzing protocol decoders and stream parsers.
- Red-team scenarios (token theft, replay attacks, malicious origin simulation).

## 13.3 Reliability Testing
- Soak tests with long-running streams.
- Fault injection (adapter crash, network loss, auth expiry).
- Restart/recovery tests for extension and bridge.

## 13.4 Robustness Testing
- Version skew tests across SDK/extension/bridge.
- Schema compatibility tests for old/new clients.
- Performance regression tests per release.

---

## 14) Open Source, Licensing, and Governance

## 14.1 Project Layout (Monorepo Recommended)
- `packages/web-sdk`
- `packages/protocol`
- `packages/policy`
- `packages/telemetry`
- `apps/extension`
- `apps/bridge`
- `adapters/*`
- `examples/*`
- `docs/*`

## 14.2 Governance
- Maintainer model with CODEOWNERS by subsystem.
- RFC process for protocol changes and high-impact security decisions.
- Backward compatibility policy and release channels.

## 14.3 Compliance and Legal
- SPDX headers, license checks, third-party notices.
- Export control review where required for cryptography.

---

## 15) Risk Register and Mitigations

1. **Risk:** Local bridge exploitation  
   **Mitigation:** Extension-first mediation, strict loopback hardening, signed requests, nonce expiry.

2. **Risk:** Credential leakage  
   **Mitigation:** OS keychain storage, no token exposure to app, log redaction by default.

3. **Risk:** Adapter ecosystem quality variance  
   **Mitigation:** Certification pipeline, conformance tests, signed adapter distribution.

4. **Risk:** Browser compatibility fragmentation  
   **Mitigation:** Chromium-first baseline, compatibility matrix, staged browser expansion.

5. **Risk:** Enterprise trust concerns  
   **Mitigation:** Auditability, policy-as-code, transparent architecture docs, external audit.

---

## 16) Definition of Done for "Enterprise-Grade"

The project is considered enterprise-ready when all are true:
1. Security threat model is current and validated against implementation.
2. Permission model is enforced at both UX and runtime layers.
3. Reliability SLO evidence is published with repeatable test data.
4. Versioning/compatibility policy is active and tested in CI.
5. At least three adapters pass certification and production soak tests.
6. Audit events and policy controls are available and documented.
7. Vulnerability disclosure and patch release process is operational.

---

## 17) Immediate Next Steps

1. Approve this architecture direction (extension-first + bridge runtime).
2. Draft protocol RFC (`request/event schema`, `capability model`, `error taxonomy`).
3. Define security baseline controls and CI gates.
4. Build minimal end-to-end vertical slice:
   - Web SDK connect flow
   - Extension consent prompt
   - Bridge handshake
   - Ollama adapter chat streaming
5. Add telemetry and policy checks to the vertical slice before expanding adapters.

---

## 18) Final Recommendation

Use an **extension-first, zero-trust, policy-enforced architecture** that treats AI access as a user-owned permissioned resource, not an app-owned integration secret.

This gives the strongest long-term foundation for secure local bridging, cloud subscription routing, and enterprise adoption while staying open source and extensible.
