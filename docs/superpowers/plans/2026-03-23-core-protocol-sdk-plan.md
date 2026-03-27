# Core Protocol + SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the canonical Arlopass protocol package and app-facing web SDK with strict contracts, typed errors, and deterministic session behavior.

**Architecture:** Create `packages/protocol` as the source of truth for envelopes/capabilities/errors/versioning, then build `packages/web-sdk` on top with a state machine and transport abstraction. Validate with unit and integration tests before downstream sub-projects depend on it.

**Tech Stack:** TypeScript, Node.js, npm workspaces, Zod (schema validation), Vitest, ESLint

---

## Spec Reference
- `docs/superpowers/specs/2026-03-23-core-protocol-sdk-design.md`

## Program Sequencing and Prerequisites

- **Execution order:** 1 of 5 (foundation plan)
- **Prerequisites:** none
- **Blocks:** secure mediation, provider runtime, enterprise policy, reliability operations

## File Structure

**Create**
- `package.json` (workspace root)
- `tsconfig.base.json`
- `vitest.workspace.ts`
- `packages/protocol/package.json`
- `packages/protocol/tsconfig.json`
- `packages/protocol/src/index.ts`
- `packages/protocol/src/envelope.ts`
- `packages/protocol/src/capabilities.ts`
- `packages/protocol/src/errors.ts`
- `packages/protocol/src/reason-codes.ts`
- `packages/protocol/src/versioning.ts`
- `packages/protocol/src/__tests__/envelope.test.ts`
- `packages/protocol/src/__tests__/versioning.test.ts`
- `packages/protocol/src/__tests__/reason-codes.test.ts`
- `packages/web-sdk/package.json`
- `packages/web-sdk/tsconfig.json`
- `packages/web-sdk/src/index.ts`
- `packages/web-sdk/src/client.ts`
- `packages/web-sdk/src/state-machine.ts`
- `packages/web-sdk/src/transport.ts`
- `packages/web-sdk/src/types.ts`
- `packages/web-sdk/src/__tests__/client.test.ts`
- `packages/web-sdk/src/__tests__/state-machine.test.ts`

---

### Task 1: Bootstrap workspace and test harness

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.workspace.ts`
- Create: `packages/protocol/package.json`, `packages/web-sdk/package.json`

- [ ] **Step 1: Write a failing workspace smoke test**

Create `packages/protocol/src/__tests__/envelope.test.ts` with:
```ts
import { describe, expect, it } from "vitest";
import { parseEnvelope } from "../envelope";

describe("protocol workspace smoke test", () => {
  it("loads parser symbol", () => {
    expect(typeof parseEnvelope).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL with module/file not found errors.

- [ ] **Step 3: Create minimal workspace config and scripts**

Add root `package.json` scripts:
- `build`, `test`, `lint`, `typecheck`

- [ ] **Step 4: Install deps and rerun tests**

Run: `npm install && npm run test`
Expected: FAIL now points to missing implementation symbols only.

- [ ] **Step 5: Commit bootstrap**

Run:
```bash
git add package.json tsconfig.base.json vitest.workspace.ts packages/protocol/package.json packages/web-sdk/package.json
git commit -m "chore: bootstrap protocol and sdk workspace"
```

---

### Task 2: Implement protocol contracts and validation

**Files:**
- Create: `packages/protocol/src/envelope.ts`, `capabilities.ts`, `errors.ts`, `reason-codes.ts`, `versioning.ts`, `index.ts`
- Test: `packages/protocol/src/__tests__/envelope.test.ts`, `versioning.test.ts`, `reason-codes.test.ts`

- [ ] **Step 1: Write failing tests for envelope validation and version negotiation**

Add tests that:
- accept valid envelope
- reject missing `origin`, `nonce`, and `correlationId`
- reject expired envelopes
- reject unsupported major versions
- normalize unsupported reason-code inputs to deterministic protocol errors

- [ ] **Step 2: Run protocol tests and confirm failures**

Run: `npm run test -- packages/protocol/src/__tests__/envelope.test.ts packages/protocol/src/__tests__/versioning.test.ts packages/protocol/src/__tests__/reason-codes.test.ts`
Expected: FAIL with missing exports/assertion failures.

- [ ] **Step 3: Implement minimal passing protocol modules**

Implement:
- `parseEnvelope(input)`
- `isCapabilityAllowed(capability)`
- `negotiateProtocolVersion(client, server)`
- `normalizeReasonCode(input)`
- typed error classes and machine codes

- [ ] **Step 4: Run tests and typecheck**

Run: `npm run test -- packages/protocol/src/__tests__ && npm run typecheck`
Expected: PASS for protocol tests and no TS errors.

- [ ] **Step 5: Commit protocol package**

```bash
git add packages/protocol
git commit -m "feat: add canonical arlopass protocol package"
```

---

### Task 3: Implement SDK state machine and API facade

**Files:**
- Create: `packages/web-sdk/src/client.ts`, `state-machine.ts`, `transport.ts`, `types.ts`, `index.ts`
- Test: `packages/web-sdk/src/__tests__/client.test.ts`, `state-machine.test.ts`

- [ ] **Step 1: Write failing SDK tests**

Cover:
- valid state transitions
- invalid transition rejection
- `connect` -> `connected`
- `disconnect` from connected state
- timeout propagation on `chat.stream`

- [ ] **Step 2: Run SDK tests to confirm failure**

Run: `npm run test -- packages/web-sdk/src/__tests__`
Expected: FAIL with missing implementation.

- [ ] **Step 3: Implement minimal SDK to pass tests**

Implement:
- `ArlopassClient` with `connect`, `listProviders`, `selectProvider`, `chat.send`, `chat.stream`, `disconnect`
- transport adapter interface used by extension provider bridge
- correlation-id generation and propagation across request/response/stream APIs
- typed error normalization from protocol errors

- [ ] **Step 4: Run SDK + protocol tests together**

Run: `npm run test -- packages/protocol/src/__tests__ packages/web-sdk/src/__tests__`
Expected: PASS.

- [ ] **Step 5: Commit SDK package**

```bash
git add packages/web-sdk
git commit -m "feat: implement arlopass web sdk core api"
```

---

### Task 4: Add compatibility and security regression tests

**Files:**
- Modify: `packages/protocol/src/__tests__/versioning.test.ts`
- Modify: `packages/web-sdk/src/__tests__/client.test.ts`
- Create: `packages/web-sdk/src/__tests__/security.test.ts`

- [ ] **Step 1: Add failing regression tests**

Cases:
- replay-prone envelope rejected
- unsupported major protocol mismatch returns deterministic error
- missing `correlationId` rejected at protocol boundary
- unknown required fields fail fast

- [ ] **Step 2: Run target tests and verify failures**

Run: `npm run test -- packages/web-sdk/src/__tests__/security.test.ts`
Expected: FAIL with assertion mismatches.

- [ ] **Step 3: Implement fixes and guards**

Update parser and SDK normalization to satisfy deterministic failures.

- [ ] **Step 4: Run full workspace checks**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: PASS.

- [ ] **Step 5: Commit hardening**

```bash
git add packages/protocol packages/web-sdk
git commit -m "test: add protocol and sdk security regressions"
```

---

## Definition of Done

- Protocol and SDK packages are publishable and documented.
- All tests pass locally and in CI.
- Error taxonomy and version negotiation are stable.
- `reasonCode` and `correlationId` standards are defined and consumed by downstream plans.
- Downstream sub-projects can consume contracts without ad-hoc extensions.
