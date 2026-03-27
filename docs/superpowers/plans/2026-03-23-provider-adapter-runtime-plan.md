# Provider Adapter Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure, extensible adapter runtime that hosts provider adapters with strict contracts, isolation, and conformance testing.

**Architecture:** Implement adapter host and manifest validation first, then wire first-party adapters (Ollama, Claude subscription, and local CLI bridge), and finally enforce certification gates (security, reliability, contract conformance, signed artifacts).

**Tech Stack:** TypeScript, Node.js worker processes, Zod, Vitest, contract test harness

---

## Spec Reference
- `docs/superpowers/specs/2026-03-23-provider-adapter-runtime-design.md`

## Program Sequencing and Prerequisites

- **Execution order:** 4 of 5
- **Prerequisites:** complete
  - `docs/superpowers/plans/2026-03-23-core-protocol-sdk-plan.md`
  - `docs/superpowers/plans/2026-03-23-secure-mediation-surface-plan.md`
  - `docs/superpowers/plans/2026-03-23-enterprise-security-policy-plan.md`
- **Blocks:** reliability operations

## File Structure

**Create**
- `adapters/runtime/package.json`
- `adapters/runtime/src/adapter-host.ts`
- `adapters/runtime/src/adapter-loader.ts`
- `adapters/runtime/src/manifest-schema.ts`
- `adapters/runtime/src/artifact-signature.ts`
- `adapters/runtime/src/sandbox.ts`
- `adapters/runtime/src/errors.ts`
- `adapters/runtime/src/__tests__/manifest-schema.test.ts`
- `adapters/runtime/src/__tests__/artifact-signature.test.ts`
- `adapters/runtime/src/__tests__/adapter-host.test.ts`
- `adapters/runtime/src/__tests__/sandbox.test.ts`
- `adapters/adapter-ollama/package.json`
- `adapters/adapter-ollama/src/index.ts`
- `adapters/adapter-ollama/src/__tests__/contract.test.ts`
- `adapters/adapter-claude-subscription/package.json`
- `adapters/adapter-claude-subscription/src/index.ts`
- `adapters/adapter-claude-subscription/src/auth.ts`
- `adapters/adapter-claude-subscription/src/__tests__/contract.test.ts`
- `adapters/adapter-local-cli-bridge/package.json`
- `adapters/adapter-local-cli-bridge/src/index.ts`
- `adapters/adapter-local-cli-bridge/src/__tests__/contract.test.ts`
- `adapters/tooling/create-arlopass-adapter.ts`
- `adapters/tooling/contract-harness.ts`

---

### Task 1: Build adapter manifest and loader foundation

**Files:**
- Create: `adapters/runtime/src/manifest-schema.ts`, `adapter-loader.ts`
- Test: `adapters/runtime/src/__tests__/manifest-schema.test.ts`

- [ ] **Step 1: Write failing manifest validation tests**

Cases:
- missing required fields
- invalid `authType`
- undeclared egress rules
- unsupported capability definitions

- [ ] **Step 2: Run manifest tests to verify failure**

Run: `npm run test -- adapters/runtime/src/__tests__/manifest-schema.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement manifest schema and loader checks**

Implement strict parser and reject-by-default behavior.

- [ ] **Step 4: Re-run manifest tests**

Run: `npm run test -- adapters/runtime/src/__tests__/manifest-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit manifest foundation**

```bash
git add adapters/runtime/src
git commit -m "feat: add adapter manifest schema and loader validation"
```

---

### Task 2: Implement adapter host lifecycle and sandbox policies

**Files:**
- Create: `adapters/runtime/src/adapter-host.ts`, `sandbox.ts`, `errors.ts`
- Test: `adapters/runtime/src/__tests__/adapter-host.test.ts`, `sandbox.test.ts`

- [ ] **Step 1: Write failing host lifecycle tests**

Cover:
- load/start/shutdown lifecycle
- health check timeout behavior
- crash isolation and restart limit policy

- [ ] **Step 2: Run host lifecycle tests**

Run: `npm run test -- adapters/runtime/src/__tests__/adapter-host.test.ts adapters/runtime/src/__tests__/sandbox.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement host lifecycle and sandbox constraints**

Implement per-adapter isolation boundaries and controlled egress rules.

- [ ] **Step 4: Re-run runtime tests**

Run: `npm run test -- adapters/runtime/src/__tests__`
Expected: PASS.

- [ ] **Step 5: Commit runtime host**

```bash
git add adapters/runtime/src
git commit -m "feat: implement adapter host lifecycle and sandbox controls"
```

---

### Task 3: Implement Ollama, Claude, and Local CLI bridge adapters with contract tests

**Files:**
- Create: `adapters/adapter-ollama/src/index.ts`
- Create: `adapters/adapter-claude-subscription/src/index.ts`, `auth.ts`
- Create: `adapters/adapter-local-cli-bridge/src/index.ts`
- Test: `adapters/adapter-ollama/src/__tests__/contract.test.ts`, `adapters/adapter-claude-subscription/src/__tests__/contract.test.ts`, `adapters/adapter-local-cli-bridge/src/__tests__/contract.test.ts`

- [ ] **Step 1: Write failing contract tests for all three adapters**

Assert required interface and deterministic error mapping behavior.

- [ ] **Step 2: Run adapter contract tests**

Run: `npm run test -- adapters/adapter-ollama/src/__tests__/contract.test.ts adapters/adapter-claude-subscription/src/__tests__/contract.test.ts adapters/adapter-local-cli-bridge/src/__tests__/contract.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement minimal adapter contracts**

Implement required methods and map provider failures to canonical errors.

- [ ] **Step 4: Re-run contract tests**

Run: same command as Step 2
Expected: PASS.

- [ ] **Step 5: Commit first-party adapters**

```bash
git add adapters/adapter-ollama adapters/adapter-claude-subscription adapters/adapter-local-cli-bridge
git commit -m "feat: add first-party ollama claude and local-cli adapters"
```

---

### Task 4: Add adapter tooling and certification gates

**Files:**
- Create: `adapters/tooling/create-arlopass-adapter.ts`, `contract-harness.ts`
- Create: `adapters/runtime/src/artifact-signature.ts`
- Test: `adapters/runtime/src/__tests__/artifact-signature.test.ts`
- Modify: runtime tests and adapter tests for certification matrix

- [ ] **Step 1: Write failing tooling tests**

Cover scaffold generation, contract harness pass/fail reporting, and unsigned/invalid-signature adapter artifact rejection.

- [ ] **Step 2: Run tooling tests**

Run: `npm run test -- adapters/tooling adapters/runtime/src/__tests__/artifact-signature.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement scaffold + harness tooling**

Generate boilerplate adapter files, enforce signed artifact verification before activation, and run contract/security gate checks.

- [ ] **Step 4: Run full adapter validation suite**

Run: `npm run test -- adapters/runtime/src/__tests__ adapters/adapter-ollama/src/__tests__ adapters/adapter-claude-subscription/src/__tests__ adapters/adapter-local-cli-bridge/src/__tests__`
Expected: PASS.

- [ ] **Step 5: Commit certification tooling**

```bash
git add adapters
git commit -m "feat: add adapter onboarding certification and signing gates"
```

---

## Definition of Done

- Adapter runtime enforces manifest schema and sandbox constraints.
- Signed adapter artifacts are required and validated before activation.
- Three first-party adapters (Ollama, Claude, local CLI bridge) pass contract tests.
- Scaffold + contract harness accelerate safe onboarding.
- Adapter failures are isolated and visible via canonical errors.
