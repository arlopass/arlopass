# Design Spec: Provider Adapter Runtime (Sub-Project 3)

## Metadata
- **Date:** 2026-03-23
- **Status:** Draft for review
- **Program:** Arlopass SDK
- **Pillars:** Security, Reliability, Robustness

---

## 1) Problem and Scope

Providers differ widely (local engines, cloud APIs, local CLIs). We need a standardized adapter runtime that onboards new providers safely without weakening the trust model.

### In Scope
- Adapter host runtime in bridge
- Adapter SDK and manifest contract
- First-party adapters baseline:
  - Ollama
  - Claude subscription
  - Local CLI bridge adapters
- Adapter certification pipeline requirements

### Out of Scope
- Public marketplace UX
- Third-party adapter trust program operations

---

## 2) Goals and Non-Goals

### Goals
1. Define strict adapter lifecycle and interface contracts.
2. Isolate adapter permissions and egress by policy.
3. Ensure predictable adapter behavior under failures.
4. Make provider onboarding fast but safe.

### Non-Goals
1. Permitting arbitrary script execution by adapters.
2. Bypassing manifest declarations at runtime.

---

## 3) Runtime Architecture

### Core Units
- `adapter-host`: lifecycle, loading, health supervision
- `adapter-sdk`: typed contracts and helper abstractions
- `adapter-registry`: manifest validation and versioning
- `adapter-sandbox`: process/runtime permission boundaries

### Adapter Interface (required)
- `describeCapabilities()`
- `listModels()`
- `createSession()`
- `sendMessage()`
- `streamMessage()`
- `healthCheck()`
- `shutdown()`

### Adapter Manifest
- `providerId`, `version`
- `authType`
- `capabilities`
- `requiredPermissions`
- `egressRules`
- `riskLevel`

---

## 4) Security Design

1. Manifest schema validation before adapter load.
2. Least-privilege runtime execution and restricted filesystem access.
3. Egress control derived from manifest + policy layer decisions.
4. Signed adapter artifact verification before activation.
5. Credential operations delegated to bridge secret vault, not adapters.

---

## 5) Reliability and Robustness Design

### Reliability
- Adapter health probes and restart policy
- Per-adapter failure isolation (one crash does not take down host)
- Timeouts and cancellation propagation from runtime to adapter

### Robustness
- Versioned contract compatibility checks at load time
- Graceful fallback on adapter unavailable states
- Defensive limits for stream size and event throughput

---

## 6) Onboarding Flow for New Providers

1. Scaffold adapter using `create-arlopass-adapter`.
2. Fill manifest and implement required interface.
3. Run local contract conformance test suite.
4. Execute security and soak test gates.
5. Sign and publish adapter artifact.

---

## 7) Testing Strategy

- Unit: manifest parser, lifecycle manager, error mapping
- Integration: host <-> adapter IPC and streaming
- Security: manifest abuse, privilege escalation attempts
- Reliability: crash loops, latency spikes, long-running sessions

---

## 8) Dependencies and Handoffs

### Depends On
- Protocol contracts
- Mediation runtime and auth context
- Enterprise policy decisions for egress/permissions

### Provides To Other Sub-Projects
- Standardized provider execution interface to SDK consumers
- Health and telemetry events to operations platform

---

## 9) Exit Criteria

1. Two first-party adapters pass full conformance and security gates.
2. Adapter host isolates faults and recovers cleanly.
3. New adapter onboarding docs and tooling are usable end-to-end.
4. Signed adapter validation is enforced in runtime.
