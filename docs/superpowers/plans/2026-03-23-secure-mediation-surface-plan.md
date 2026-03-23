# Secure Mediation Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the trusted mediation boundary (extension + bridge) that enforces consent, permissions, and authenticated request forwarding.

**Architecture:** Implement extension consent and grant lifecycle first, then bridge native-messaging execution with signed request envelopes. Keep extension preflight and bridge runtime enforcement consistent through shared contract tests.

**Tech Stack:** TypeScript, WebExtension APIs, Node.js (bridge), Native Messaging, Vitest, Playwright

---

## Spec Reference
- `docs/superpowers/specs/2026-03-23-secure-mediation-surface-design.md`
- Related: `docs/superpowers/specs/2026-03-23-core-protocol-sdk-design.md`

## Program Sequencing and Prerequisites

- **Execution order:** 2 of 5
- **Prerequisites:** complete `docs/superpowers/plans/2026-03-23-core-protocol-sdk-plan.md`
- **Blocks:** provider runtime, enterprise policy, reliability operations

## File Structure

**Create**
- `apps/extension/package.json`
- `apps/extension/src/background.ts`
- `apps/extension/src/provider-injection.ts`
- `apps/extension/src/consent/consent-controller.ts`
- `apps/extension/src/permissions/grant-store.ts`
- `apps/extension/src/permissions/grant-types.ts`
- `apps/extension/src/events.ts`
- `apps/extension/src/__tests__/grant-store.test.ts`
- `apps/extension/src/__tests__/consent-controller.test.ts`
- `apps/bridge/package.json`
- `apps/bridge/src/main.ts`
- `apps/bridge/src/native-host.ts`
- `apps/bridge/src/native-host-manifest.ts`
- `apps/bridge/src/session/handshake.ts`
- `apps/bridge/src/session/publisher-verifier.ts`
- `apps/bridge/src/session/request-verifier.ts`
- `apps/bridge/src/permissions/runtime-enforcer.ts`
- `apps/bridge/src/__tests__/handshake.test.ts`
- `apps/bridge/src/__tests__/publisher-verifier.test.ts`
- `apps/bridge/src/__tests__/runtime-enforcer.test.ts`
- `apps/bridge/src/__tests__/integration.native-messaging.test.ts`

---

### Task 1: Implement extension grant lifecycle and consent flow

**Files:**
- Create: `apps/extension/src/permissions/*`, `apps/extension/src/consent/*`
- Test: `apps/extension/src/__tests__/grant-store.test.ts`, `consent-controller.test.ts`

- [ ] **Step 1: Write failing tests for grant semantics**

Include:
- one-time grant consumption
- session grant expiration
- persistent grant revocation
- wildcard `providerId/modelId` behavior for `provider.list` and `session.create`

- [ ] **Step 2: Run extension unit tests to confirm failures**

Run: `npm run test -- apps/extension/src/__tests__/grant-store.test.ts`
Expected: FAIL with missing symbols/incorrect behavior.

- [ ] **Step 3: Implement `grant-store` and consent controller**

Implement explicit grant key model and deterministic revoke behavior.

- [ ] **Step 4: Run tests and validate deterministic transitions**

Run: `npm run test -- apps/extension/src/__tests__/grant-store.test.ts apps/extension/src/__tests__/consent-controller.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit extension permission baseline**

```bash
git add apps/extension/src
git commit -m "feat: add extension consent and grant lifecycle"
```

---

### Task 2: Implement bridge native messaging host and trust bootstrap

**Files:**
- Create: `apps/bridge/src/native-host.ts`, `native-host-manifest.ts`, `session/handshake.ts`, `session/publisher-verifier.ts`, `session/request-verifier.ts`
- Test: `apps/bridge/src/__tests__/handshake.test.ts`, `publisher-verifier.test.ts`

- [ ] **Step 1: Write failing handshake tests**

Cover:
- extension ID allowlist enforcement
- bridge binary code-signature verification
- native-host install path pinning
- challenge-response success and failure
- nonce replay rejection
- envelope expiry rejection

- [ ] **Step 2: Run bridge handshake tests**

Run: `npm run test -- apps/bridge/src/__tests__/handshake.test.ts apps/bridge/src/__tests__/publisher-verifier.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement native host and handshake modules**

Implement authenticated session establishment, signed publisher verification, pinned host-manifest path checks, and envelope verification.

- [ ] **Step 4: Re-run handshake tests**

Run: `npm run test -- apps/bridge/src/__tests__/handshake.test.ts apps/bridge/src/__tests__/publisher-verifier.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit bridge transport baseline**

```bash
git add apps/bridge/src
git commit -m "feat: add bridge native messaging trust bootstrap"
```

---

### Task 3: Wire extension preflight and bridge runtime enforcement

**Files:**
- Modify: `apps/extension/src/background.ts`
- Modify: `apps/bridge/src/main.ts`
- Create: `apps/bridge/src/permissions/runtime-enforcer.ts`
- Test: `apps/bridge/src/__tests__/runtime-enforcer.test.ts`

- [ ] **Step 1: Add failing enforcement parity tests**

Assert extension preflight and bridge runtime make the same decision for identical grant context.

- [ ] **Step 2: Run parity tests and verify failure**

Run: `npm run test -- apps/bridge/src/__tests__/runtime-enforcer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement runtime enforcer with shared rules**

Bridge should be authoritative when extension state is stale or conflicting.

- [ ] **Step 4: Run unit + integration tests**

Run: `npm run test -- apps/extension/src/__tests__ apps/bridge/src/__tests__/runtime-enforcer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit enforcement parity work**

```bash
git add apps/extension/src apps/bridge/src
git commit -m "feat: align extension preflight with bridge runtime enforcement"
```

---

### Task 4: End-to-end mediation tests and hardening

**Files:**
- Create: `apps/bridge/src/__tests__/integration.native-messaging.test.ts`
- Modify: extension and bridge tests as needed

- [ ] **Step 1: Write failing E2E mediation tests**

Flows:
- connect/consent/stream success
- unauthorized origin denied
- revoked grant denied immediately

- [ ] **Step 2: Run E2E tests and confirm failures**

Run: `npm run test -- apps/bridge/src/__tests__/integration.native-messaging.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement minimal fixes**

Patch extension event propagation and bridge session invalidation paths.

- [ ] **Step 4: Run full checks**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: PASS.

- [ ] **Step 5: Commit mediation hardening**

```bash
git add apps/extension apps/bridge
git commit -m "test: add secure mediation e2e coverage"
```

---

## Definition of Done

- Consent/grant/revoke lifecycle is deterministic and test-covered.
- Native messaging trust bootstrap is enforced.
- Bridge publisher signature checks and native-host install path pinning are enforced.
- Bridge denies unauthenticated execution requests.
- End-to-end mediation flows pass for approved and denied scenarios.
