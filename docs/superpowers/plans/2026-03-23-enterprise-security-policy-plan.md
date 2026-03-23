# Enterprise Security & Policy Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement policy-as-code enforcement and auditability that enterprises can trust for BYOM request governance.

**Architecture:** Build a signed policy bundle model and deterministic evaluator first, then wire enforcement hooks into extension and bridge, and finally ship audit exporters with privacy-first defaults.

**Tech Stack:** TypeScript, Node.js, JSON schema/Zod, cryptographic signatures (Sigstore/cosign-compatible), Vitest

---

## Spec Reference
- `docs/superpowers/specs/2026-03-23-enterprise-security-policy-design.md`

## Program Sequencing and Prerequisites

- **Execution order:** 3 of 5
- **Prerequisites:** complete
  - `docs/superpowers/plans/2026-03-23-core-protocol-sdk-plan.md`
  - `docs/superpowers/plans/2026-03-23-secure-mediation-surface-plan.md`
- **Blocks:** provider runtime, reliability operations

## File Structure

**Create**
- `packages/policy/package.json`
- `packages/policy/src/index.ts`
- `packages/policy/src/schema.ts`
- `packages/policy/src/evaluator.ts`
- `packages/policy/src/reason-codes.ts`
- `packages/policy/src/signature.ts`
- `packages/policy/src/key-management.ts`
- `packages/policy/src/__tests__/evaluator.test.ts`
- `packages/policy/src/__tests__/signature.test.ts`
- `packages/policy/src/__tests__/key-management.test.ts`
- `packages/audit/package.json`
- `packages/audit/src/index.ts`
- `packages/audit/src/event-schema.ts`
- `packages/audit/src/exporters/jsonl-exporter.ts`
- `packages/audit/src/exporters/otlp-exporter.ts`
- `packages/audit/src/__tests__/event-schema.test.ts`
- `apps/extension/src/policy/preflight-evaluator.ts`
- `apps/bridge/src/policy/runtime-evaluator.ts`
- `apps/bridge/src/audit/audit-emitter.ts`
- `apps/bridge/src/secrets/keychain-store.ts`
- `apps/bridge/src/secrets/rotation.ts`
- `apps/bridge/src/secrets/revoke-invalidator.ts`
- `apps/bridge/src/__tests__/secrets-governance.test.ts`

---

### Task 1: Build signed policy bundle schema and evaluator

**Files:**
- Create: `packages/policy/src/schema.ts`, `evaluator.ts`, `reason-codes.ts`, `signature.ts`, `key-management.ts`
- Test: `packages/policy/src/__tests__/evaluator.test.ts`, `signature.test.ts`, `key-management.test.ts`

- [ ] **Step 1: Write failing tests for policy decisions**

Cover:
- default deny behavior
- allowlist and denylist precedence
- conflict resolution
- invalid signature rejection
- key material lifecycle contract validation (create/rotate/revoke hooks)

- [ ] **Step 2: Run policy tests and confirm failures**

Run: `npm run test -- packages/policy/src/__tests__/evaluator.test.ts packages/policy/src/__tests__/signature.test.ts packages/policy/src/__tests__/key-management.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement evaluator and signature verification**

Implement deterministic decision output:
```ts
{ decision: "allow" | "deny", reasonCode: string, policyVersion: string }
```

- [ ] **Step 4: Re-run policy tests**

Run: same as Step 2
Expected: PASS.

- [ ] **Step 5: Commit policy core**

```bash
git add packages/policy
git commit -m "feat: add signed policy evaluator and reason codes"
```

---

### Task 2: Implement audit schema and exporters

**Files:**
- Create: `packages/audit/src/event-schema.ts`, exporters, tests

- [ ] **Step 1: Write failing audit schema tests**

Assert required fields:
- `timestamp`, `origin`, `providerId`, `modelId`, `capability`, `decision`, `reasonCode`, `correlationId`, `policyVersion`

- [ ] **Step 2: Run audit tests to confirm failures**

Run: `npm run test -- packages/audit/src/__tests__/event-schema.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement schema and exporter contracts**

Implement JSONL and OTLP-friendly exporter interfaces with redaction hooks.

- [ ] **Step 4: Re-run audit tests**

Run: `npm run test -- packages/audit/src/__tests__/event-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit audit package**

```bash
git add packages/audit
git commit -m "feat: add audit schema and exporter interfaces"
```

---

### Task 3: Wire policy enforcement into extension and bridge

**Files:**
- Create/Modify: `apps/extension/src/policy/preflight-evaluator.ts`
- Create/Modify: `apps/bridge/src/policy/runtime-evaluator.ts`
- Create: `apps/bridge/src/audit/audit-emitter.ts`

- [ ] **Step 1: Write failing integration tests**

Cover:
- extension deny + bridge deny parity
- bridge authoritative deny when extension cache stale
- audit event emitted on every allow/deny decision

- [ ] **Step 2: Run integration tests and verify failures**

Run: `npm run test -- apps/extension/src/__tests__ apps/bridge/src/__tests__`
Expected: FAIL in policy/audit scenarios.

- [ ] **Step 3: Implement enforcement and audit emitter**

Wire policy package into both enforcement points; emit structured audit events.

- [ ] **Step 4: Re-run integration and package tests**

Run: `npm run test -- packages/policy/src/__tests__ packages/audit/src/__tests__ apps/extension/src/__tests__ apps/bridge/src/__tests__`
Expected: PASS.

- [ ] **Step 5: Commit policy wiring**

```bash
git add packages/policy packages/audit apps/extension/src/policy apps/bridge/src/policy apps/bridge/src/audit
git commit -m "feat: enforce enterprise policy and emit audit events"
```

---

### Task 4: Implement key management and secret governance hooks

**Files:**
- Create: `apps/bridge/src/secrets/keychain-store.ts`, `rotation.ts`, `revoke-invalidator.ts`
- Test: `apps/bridge/src/__tests__/secrets-governance.test.ts`
- Modify: `apps/bridge/src/policy/runtime-evaluator.ts`, `apps/bridge/src/audit/audit-emitter.ts`

- [ ] **Step 1: Add failing tests for secret governance hooks**

Cases:
- OS keychain lookup failures deny by default
- key rotation updates policy-bound references safely
- revoke event invalidates cached token material immediately

- [ ] **Step 2: Run governance tests and confirm failures**

Run: `npm run test -- apps/bridge/src/__tests__/secrets-governance.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement keychain, rotation, and revoke invalidation modules**

Wire governance hooks so policy decisions can trigger secure rotation and invalidation.

- [ ] **Step 4: Re-run governance + integration tests**

Run: `npm run test -- packages/policy/src/__tests__ apps/bridge/src/__tests__/secrets-governance.test.ts apps/extension/src/__tests__ apps/bridge/src/__tests__`
Expected: PASS.

- [ ] **Step 5: Commit secret governance integration**

```bash
git add packages/policy apps/bridge/src/secrets apps/bridge/src/policy apps/bridge/src/audit
git commit -m "feat: add key management and secret governance hooks"
```

---

### Task 5: Harden compliance and failure paths

**Files:**
- Modify: policy and audit tests
- Modify: bridge policy integration as needed

- [ ] **Step 1: Add failing negative-path tests**

Cases:
- malformed policy bundle
- expired/revoked policy signature
- exporter failure handling without decision-path interruption

- [ ] **Step 2: Run hardening tests**

Run: `npm run test -- packages/policy/src/__tests__ packages/audit/src/__tests__`
Expected: FAIL.

- [ ] **Step 3: Implement robustness fixes**

Ensure evaluator and emitters fail safely while preserving deny defaults.

- [ ] **Step 4: Run full repository checks**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: PASS.

- [ ] **Step 5: Commit compliance hardening**

```bash
git add packages/policy packages/audit apps/bridge/src/policy
git commit -m "test: harden policy and audit compliance paths"
```

---

## Definition of Done

- Signed policy bundles are required and validated.
- Deterministic reason-coded decisions are enforced at both control points.
- Key management, rotation, and revoke invalidation hooks are integrated and test-covered.
- Audit events are complete, schema-valid, and privacy-safe by default.
- Negative-path security and compliance tests pass.
