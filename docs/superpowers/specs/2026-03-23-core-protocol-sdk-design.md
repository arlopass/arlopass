# Design Spec: Core Protocol + SDK (Sub-Project 1)

## Metadata
- **Date:** 2026-03-23
- **Status:** Draft for review
- **Program:** BYOM AI SDK
- **Pillars:** Security, Reliability, Robustness

---

## 1) Problem and Scope

The platform needs a canonical protocol and app-facing SDK so every client app can talk to the BYOM stack safely and consistently. Without a strict contract, extension, bridge, and adapters will diverge and become insecure.

### In Scope
- Shared protocol package (`@byom-ai/protocol`)
- App-facing SDK (`@byom-ai/web-sdk`)
- Message schemas, version negotiation, error taxonomy
- Session lifecycle, streaming abstractions, typed events

### Out of Scope
- Consent UI rendering
- Adapter implementation internals
- Enterprise admin policy UI

---

## 2) Goals and Non-Goals

### Goals
1. Provide a stable SDK API for `connect`, `selectProvider`, `send`, and `stream`.
2. Define canonical protocol envelopes and schema validation rules.
3. Guarantee compatibility behavior for version skew.
4. Enforce secure-by-default request metadata requirements.

### Non-Goals
1. Provider-specific custom capabilities in v1.
2. Business logic for enterprise policy authoring.

---

## 3) Architecture

### Packages
- `packages/protocol`
  - Message schema definitions
  - Capability catalog
  - Error codes and semantics
  - Reason-code catalog for policy/deny outcomes
  - Correlation ID conventions
  - Version negotiation algorithm
- `packages/web-sdk`
  - Public API facade
  - Connection/session state machine
  - Streaming controller
  - Retry/timeout policies

### Canonical Envelope
- `protocolVersion`
- `requestId`
- `correlationId`
- `origin`
- `sessionId`
- `capability`
- `providerId`
- `modelId`
- `issuedAt`, `expiresAt`, `nonce`
- `payload`

---

## 4) Security Design

1. Strict schema validation on every inbound/outbound message.
2. No implicit defaults for security-sensitive fields (`origin`, `capability`, `expiresAt`).
3. SDK never accepts credentials or provider secrets in API calls.
4. Protocol requires replay-resistant metadata (`nonce`, short expiry windows).
5. All failure responses use safe, non-leaking error messages.
6. Deny/error responses carry standardized `reasonCode` values from protocol catalog.

---

## 5) Reliability and Robustness Design

### State Machine
`disconnected -> connecting -> connected -> degraded -> reconnecting -> failed`

### Reliability Controls
- Deterministic retry with capped exponential backoff + jitter
- Timeout propagation and cancellation tokens
- Idempotency key support for retriable operations

### Robustness Controls
- Strict decoding for required fields
- Forward-compatible optional extensions
- Protocol compatibility matrix checks in CI

---

## 6) API Contract (v1)

```ts
type ConnectOptions = { appId: string };
type SelectProviderInput = { providerId: string; modelId: string };
type ChatInput = { messages: Array<{ role: "user" | "assistant" | "system"; content: string }> };
```

Core methods:
- `connect(options)`
- `listProviders()`
- `selectProvider(input)`
- `chat.send(input)`
- `chat.stream(input)`
- `disconnect()`

---

## 7) Testing Strategy

- Unit: schemas, version negotiation, error mapping, state transitions
- Unit: reason-code normalization and correlation-id validation
- Integration: SDK request lifecycle against mocked extension provider transport
- Integration: correlation-id propagation across request/response/stream events
- Compatibility: SDK x protocol versions matrix
- Fuzzing: protocol envelope decoding and stream chunk parsing

---

## 8) Dependencies and Handoffs

### Depends On
- Program-level capability catalog decisions

### Provides To Other Sub-Projects
- Stable contracts consumed by mediation surface and adapter runtime
- Common error taxonomy consumed by policy and operations layers
- Canonical `reasonCode` and `correlationId` standards for policy, audit, and telemetry

---

## 9) Exit Criteria

1. SDK API finalized and documented with examples.
2. Protocol schemas versioned and published.
3. Compatibility tests passing for supported versions.
4. Security checks reject malformed and replay-prone requests.
