# Design Spec: Secure Mediation Surface (Sub-Project 2)

## Metadata
- **Date:** 2026-03-23
- **Status:** Draft for review
- **Program:** Arlopass SDK
- **Pillars:** Security, Reliability, Robustness

---

## 1) Problem and Scope

The system needs a trusted mediation boundary between untrusted web apps and user-owned AI providers. This boundary must own consent, permissions, and secure request forwarding.

### In Scope
- Browser extension wallet (`apps/extension`)
- Local bridge process (`apps/bridge`)
- Extension-to-bridge trust bootstrap and authenticated transport
- Permission lifecycle and revocation UX

### Out of Scope
- Adapter internals
- Enterprise policy authoring UI

---

## 2) Goals and Non-Goals

### Goals
1. Ensure explicit, origin-scoped user consent.
2. Enforce permissions in both extension preflight and bridge runtime.
3. Use authenticated transport for executable requests.
4. Provide deterministic reconnect and revocation behavior.

### Non-Goals
1. Silent auto-connect without user awareness.
2. Broad wildcard origin grants.

---

## 3) Architecture

### Components
- `apps/extension`
  - Provider injection transport (`window.arlopass` low-level bridge only)
  - Consent dialogs and grant management UI
  - Origin registry and permission cache
- `apps/bridge`
  - Native messaging host endpoint
  - Runtime permission enforcement
  - Adapter dispatch gateway

### Transport Model
- Native Messaging is the executable request path in v1.
- Optional diagnostics endpoint may exist on loopback, but must expose no execution operations.

---

## 4) Security Design

### Trust Bootstrap
1. Extension identity allowlist at bridge host registration.
2. Bridge binary code-signature verification and pinned install path.
3. Challenge-response handshake to derive ephemeral session keys.
4. Signed request envelopes with nonce + expiry.

### Permission Model
- Grant key: `{origin, providerId|*, modelId|*, capabilitySet}`
- Grant types: one-time, session, persistent
- Immediate revocation enforcement at both extension and bridge

### Hardening
- Default deny posture
- No credential exposure to app context
- Strict message schema checks at each hop

---

## 5) Reliability and Robustness Design

### Reliability
- Reconnect workflow for extension reload and bridge restart
- Transaction-safe grant persistence
- Timeout-aware request forwarding

### Robustness
- Explicit error families for permission and transport failures
- Deterministic behavior on stale sessions and expired grants
- Backward-compatible transport protocol evolution

---

## 6) Critical User Flows

1. **Connect Flow**
   - SDK requests connect
   - Extension verifies origin
   - Extension establishes bridge session
2. **Grant Flow**
   - App requests capability
   - Extension prompts user
   - Grant persisted and mirrored to bridge cache
3. **Revoke Flow**
   - User revokes in extension UI
   - Extension emits revoke event
   - Bridge invalidates runtime grants immediately

---

## 7) Testing Strategy

- UI automation for consent and revoke paths
- Integration tests for extension-bridge handshake
- Security tests for replay and spoofed local-process attempts
- Recovery tests for extension restart and bridge restart

---

## 8) Dependencies and Handoffs

### Depends On
- Protocol schema and SDK event contracts

### Provides To Other Sub-Projects
- Secure execution boundary for adapter runtime
- Permission/audit signal inputs for enterprise policy layer

---

## 9) Exit Criteria

1. End-to-end connect and consent flow succeeds.
2. Unauthorized origins are consistently denied.
3. Revocations take effect immediately across both layers.
4. Handshake and signed envelope validation are fully enforced.
