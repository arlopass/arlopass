# Reliability & Operations Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver production-grade observability, SLO measurement, and release hardening for SDK, extension, bridge, and adapters.

**Architecture:** Standardize telemetry contracts first, then instrument each subsystem with correlation-aware metrics/traces/logs, and finally enforce reliability gates with chaos/soak testing and runbooks.

**Tech Stack:** TypeScript, OpenTelemetry, Vitest, Playwright, Node.js tooling, CI workflows

---

## Spec Reference
- `docs/superpowers/specs/2026-03-23-reliability-operations-platform-design.md`

## Program Sequencing and Prerequisites

- **Execution order:** 5 of 5
- **Prerequisites:** complete
  - `docs/superpowers/plans/2026-03-23-core-protocol-sdk-plan.md`
  - `docs/superpowers/plans/2026-03-23-secure-mediation-surface-plan.md`
  - `docs/superpowers/plans/2026-03-23-provider-adapter-runtime-plan.md`
  - `docs/superpowers/plans/2026-03-23-enterprise-security-policy-plan.md`
- **Blocks:** none (final cross-cutting hardening stage)

## File Structure

**Create**
- `packages/telemetry/package.json`
- `packages/telemetry/src/index.ts`
- `packages/telemetry/src/metrics.ts`
- `packages/telemetry/src/tracing.ts`
- `packages/telemetry/src/redaction.ts`
- `packages/telemetry/src/__tests__/metrics.test.ts`
- `packages/telemetry/src/__tests__/tracing.test.ts`
- `ops/slo/slo-definitions.md`
- `ops/slo/alert-rules.md`
- `ops/runbooks/bridge-unavailable.md`
- `ops/runbooks/adapter-crash-loop.md`
- `ops/runbooks/auth-failure-spike.md`
- `ops/runbooks/stream-interruption.md`
- `ops/tests/chaos/bridge-restart.test.ts`
- `ops/tests/chaos/adapter-kill.test.ts`
- `ops/tests/soak/stream-soak.test.ts`
- `ops/tests/version-skew/matrix.test.ts`
- `.github/workflows/reliability-gates.yml`

---

### Task 1: Build telemetry package and redaction baseline

**Files:**
- Create: `packages/telemetry/src/*`
- Test: `packages/telemetry/src/__tests__/metrics.test.ts`, `tracing.test.ts`

- [ ] **Step 1: Write failing telemetry contract tests**

Cover:
- metric names and labels
- required trace attributes (`correlationId`, `origin`, `providerId`)
- token redaction behavior

- [ ] **Step 2: Run telemetry tests to confirm failures**

Run: `npm run test -- packages/telemetry/src/__tests__/metrics.test.ts packages/telemetry/src/__tests__/tracing.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement telemetry modules**

Implement emitters for metrics/traces/logs with metadata-first and redaction defaults.

- [ ] **Step 4: Re-run telemetry tests**

Run: same command as Step 2
Expected: PASS.

- [ ] **Step 5: Commit telemetry package**

```bash
git add packages/telemetry
git commit -m "feat: add telemetry package with redaction defaults"
```

---

### Task 2: Instrument SDK, extension, bridge, and adapter host

**Files:**
- Modify: `packages/web-sdk/src/client.ts`
- Modify: `apps/extension/src/background.ts`
- Modify: `apps/bridge/src/main.ts`
- Modify: `adapters/runtime/src/adapter-host.ts`

- [ ] **Step 1: Add failing integration tests for correlation continuity**

Assert one request has same `correlationId` across all layers.

- [ ] **Step 2: Run integration tests and verify failure**

Run: `npm run test -- apps/bridge/src/__tests__ packages/web-sdk/src/__tests__`
Expected: FAIL in correlation assertions.

- [ ] **Step 3: Implement instrumentation wiring**

Attach telemetry hooks at:
- request start
- decision point
- provider dispatch
- stream completion/error

- [ ] **Step 4: Re-run integration tests**

Run: same command as Step 2
Expected: PASS.

- [ ] **Step 5: Commit cross-layer instrumentation**

```bash
git add packages/web-sdk/src apps/extension/src apps/bridge/src adapters/runtime/src
git commit -m "feat: instrument byom stack with end-to-end telemetry"
```

---

### Task 3: Build reliability test suites (chaos, soak, version skew)

**Files:**
- Create: `ops/tests/chaos/*.test.ts`, `ops/tests/soak/*.test.ts`, `ops/tests/version-skew/matrix.test.ts`

- [ ] **Step 1: Write failing chaos and soak tests**

Cases:
- bridge restart recovery
- adapter kill and restart
- long-running streaming stability
- protocol version skew compatibility

- [ ] **Step 2: Run reliability test suites and confirm failures**

Run: `npm run test -- ops/tests/chaos ops/tests/soak ops/tests/version-skew`
Expected: FAIL.

- [ ] **Step 3: Implement stabilization fixes in runtime hooks**

Add necessary retry/timeout/recovery hooks in stack components.

- [ ] **Step 4: Re-run reliability suites**

Run: same command as Step 2
Expected: PASS.

- [ ] **Step 5: Commit reliability suites**

```bash
git add ops/tests
git commit -m "test: add chaos, soak, and version-skew reliability suites"
```

---

### Task 4: Add SLO docs, runbooks, and CI reliability gates

**Files:**
- Create: `ops/slo/*.md`, `ops/runbooks/*.md`, `.github/workflows/reliability-gates.yml`

- [ ] **Step 1: Write SLO and alert definition docs**

Document v1 targets:
- success rate
- P95 latency
- interruption rate
- MTTR

- [ ] **Step 2: Add failing CI gate (expected to fail pre-criteria)**

Set workflow to require chaos/soak suites and SLO threshold checks.

- [ ] **Step 3: Wire gate inputs and reporting**

Add machine-readable summaries from test suites for CI consumption.

- [ ] **Step 4: Validate workflow locally (if supported) and in CI**

Run: `npm run test && npm run lint && npm run typecheck`
Expected: PASS; CI gate config loads without syntax errors.

- [ ] **Step 5: Commit operational hardening assets**

```bash
git add ops .github/workflows/reliability-gates.yml
git commit -m "chore: add slo docs runbooks and reliability gates"
```

---

## Definition of Done

- Telemetry is consistent across all major runtime components.
- Reliability suites run automatically and gate releases.
- SLOs, alerting, and runbooks exist and are actionable.
- Sensitive content remains redacted in telemetry outputs.
