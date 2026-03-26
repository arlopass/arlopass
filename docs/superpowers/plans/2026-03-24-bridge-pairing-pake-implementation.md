# Bridge Pairing (PAKE-style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual raw bridge shared-secret input with secure one-time-code pairing and pairing-handle based handshake material for cloud/CLI bridge execution.

**Architecture:** Add a dedicated bridge pairing manager that issues one-time code sessions and derives bound pairing keys, then migrate extension handshake secret resolution to prefer wrapped pairing material keyed by extension runtime ID and host binding. Keep fail-closed behavior with policy-grade reason codes, explicit throttling, and revoke/rotate lifecycle endpoints.

**Tech Stack:** TypeScript, Node crypto (bridge), WebCrypto (extension), Chrome native messaging/storage, Vitest.

---

### Task 1: Bridge pairing protocol + lifecycle endpoints

**Files:**
- Create: `apps/bridge/src/session/pairing.ts`
- Modify: `apps/bridge/src/bridge-handler.ts`
- Test: `apps/bridge/src/__tests__/pairing.test.ts`
- Test: `apps/bridge/src/__tests__/bridge-handler-pairing.test.ts`

- [ ] **Step 1: Write failing tests for pairing manager and handler routing**
- [ ] **Step 2: Run bridge tests and capture failures**
- [ ] **Step 3: Implement pairing manager (begin/complete/list/revoke/rotate + throttle/ttl/max attempts)**
- [ ] **Step 4: Wire `pairing.*` messages into `BridgeHandler` and pairing-aware `handshake.verify`**
- [ ] **Step 5: Re-run bridge tests for pairing scope**

### Task 2: Extension cryptographic pairing helpers + wrapped material

**Files:**
- Create: `apps/extension/src/transport/bridge-pairing.ts`
- Modify: `apps/extension/src/transport/bridge-handshake.ts`
- Modify: `apps/extension/src/transport/runtime.ts`
- Modify: `apps/extension/src/transport/cloud-native.ts`
- Test: `apps/extension/src/__tests__/bridge-pairing.test.ts`
- Test: `apps/extension/src/__tests__/transport-runtime.test.ts`

- [ ] **Step 1: Add failing extension tests for wrapped pairing state and runtime handshake usage**
- [ ] **Step 2: Run extension tests and capture failures**
- [ ] **Step 3: Implement extension pairing crypto helpers (ECDH/PBKDF2/HMAC/HKDF + AES-GCM wrapping)**
- [ ] **Step 4: Extend handshake/runtime dependencies to resolve pairing handle and wrapped secret by host**
- [ ] **Step 5: Re-run extension tests for handshake/pairing scope**

### Task 3: Options UX migration to Pair Bridge flow

**Files:**
- Modify: `apps/extension/options.html`
- Modify: `apps/extension/src/options.ts`
- Modify: `apps/extension/popup.css` (if layout adjustments needed)
- Test: `apps/extension/src/__tests__/options-cloud-connectors.test.ts` (if connector expectations impacted)

- [ ] **Step 1: Replace manual secret controls in options markup with Pair Bridge controls**
- [ ] **Step 2: Implement Pair Bridge begin/complete/refresh/revoke/rotate handlers in options runtime**
- [ ] **Step 3: Ensure legacy `bridgeSharedSecret` value is cleared after successful pairing**
- [ ] **Step 4: Validate validation-only provider behavior remains blocked/explicit**
- [ ] **Step 5: Re-run options/extension tests**

### Task 4: Security hardening, docs, and full validation

**Files:**
- Modify: `RUNNING_AND_USAGE_GUIDE.md`
- (Optional) Modify/add bridge tests for reason-code paths if gaps remain

- [ ] **Step 1: Document pairing operational flow and handshake troubleshooting updates**
- [ ] **Step 2: Run package checks**
  - `npm run -w @byom-ai/bridge typecheck && npm run -w @byom-ai/bridge lint && npm run -w @byom-ai/bridge test`
  - `npm run -w @byom-ai/extension typecheck && npm run -w @byom-ai/extension lint && npm run -w @byom-ai/extension test`
- [ ] **Step 3: Run workspace checks**
  - `npm run typecheck && npm run lint && npm run test`
- [ ] **Step 4: Build verification**
  - `npm run -w @byom-ai/bridge build && npm run -w @byom-ai/extension build`

