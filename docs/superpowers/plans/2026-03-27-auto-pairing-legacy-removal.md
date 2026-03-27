# Auto-Pairing & Legacy Secret Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual shared-secret authentication with automatic pairing during onboarding, then remove all legacy shared secret code.

**Architecture:** New `pairing.auto` bridge message + `PairingManager.createAutoPairing()` + auto-pair in `BridgeCheckStep` + legacy removal + self-generated ConnectionRegistry signing key.

**Tech Stack:** TypeScript, Node.js crypto, Chrome Extension APIs, Web Crypto API

**Spec:** `docs/superpowers/specs/2026-03-27-auto-pairing-legacy-removal-design.md`

---

## Phase A: Auto-Pairing (Tasks 1-4)

### Task 1: PairingManager.createAutoPairing()

**Files:**
- Modify: `apps/bridge/src/session/pairing.ts`
- Modify: `apps/bridge/src/__tests__/bridge-handler-pairing.test.ts`

- [ ] **Step 1: Add `CreateAutoPairingInput` and `CreateAutoPairingResult` types**

```ts
export type CreateAutoPairingInput = Readonly<{
  extensionId: string;
  hostName: string;
}>;

export type CreateAutoPairingResult = Readonly<{
  pairingHandle: string;
  pairingKeyHex: string;
  extensionId: string;
  hostName: string;
  createdAt: string;
}>;
```

- [ ] **Step 2: Implement `createAutoPairing()` method on PairingManager**

The method should:
1. Check if extensionId + hostName already has an active pairing → if yes, resolve its secret and return existing info
2. Generate a random 32-byte secret: `crypto.randomBytes(32).toString("hex")`
3. Generate a pairing handle: `"pairh." + crypto.randomBytes(16).toString("hex")`
4. Register the pairing internally (same storage as completePairing uses)
5. Return `{ pairingHandle, pairingKeyHex, extensionId, hostName, createdAt }`

This bypasses the PAKE exchange — no challenge/response needed since native messaging is OS-authenticated.

- [ ] **Step 3: Write test for createAutoPairing**

Test: creates pairing, returns handle + key. Idempotent: second call with same extensionId/hostName returns same pairing. resolvePairingSecret works with the created pairing.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(bridge): PairingManager.createAutoPairing() — direct secret generation for native messaging"
```

---

### Task 2: Bridge `pairing.auto` message handler

**Files:**
- Modify: `apps/bridge/src/bridge-handler.ts`

- [ ] **Step 1: Add `pairing.auto` to unauthenticated message types (line ~314)**

Add `"pairing.auto"` to the `#UNAUTHENTICATED_MESSAGE_TYPES` set.

- [ ] **Step 2: Add `case "pairing.auto"` to `#dispatch` switch (line ~347)**

```ts
case "pairing.auto":
  return this.#handlePairingAuto(message);
```

- [ ] **Step 3: Implement `#handlePairingAuto`**

```ts
#handlePairingAuto(message: NativeMessage): NativeMessage {
  const extensionId = normalizeOptionalNonEmptyString(message["extensionId"]);
  const hostName = normalizeOptionalNonEmptyString(message["hostName"]);
  
  if (extensionId === undefined || hostName === undefined) {
    return errorResponse("request.invalid", "pairing.auto requires extensionId and hostName.");
  }
  
  // Validate against allowlist if configured
  if (this.#extensionIdAllowlist !== undefined) {
    const isAllowed = this.#extensionIdAllowlist.some(e => e.extensionId === extensionId);
    if (!isAllowed) {
      return errorResponse("auth.invalid", `Extension ID "${extensionId}" is not allowed.`);
    }
  }
  
  const result = this.#pairingManager.createAutoPairing({ extensionId, hostName });
  
  return {
    type: "pairing.auto",
    pairingHandle: result.pairingHandle,
    pairingKeyHex: result.pairingKeyHex,
    extensionId: result.extensionId,
    hostName: result.hostName,
    createdAt: result.createdAt,
  };
}
```

- [ ] **Step 4: Write test**

Test: sends `pairing.auto` message, gets back valid pairing. Idempotent. Invalid extensionId returns error. Missing fields return error.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(bridge): pairing.auto message handler — zero-friction auto-pairing"
```

---

### Task 3: Extension auto-pair in BridgeCheckStep

**Files:**
- Modify: `apps/extension/src/ui/components/onboarding/BridgeCheckStep.tsx`
- Modify: `apps/extension/src/ui/components/onboarding/setup-state.ts`

- [ ] **Step 1: Add `autoPair()` function to `setup-state.ts`**

```ts
export async function autoPair(): Promise<{ success: boolean; error?: string }> {
  // 1. Check if already paired
  const existingPairing = await readPairingState();
  if (existingPairing !== undefined) {
    return { success: true };
  }
  
  // 2. Send pairing.auto to bridge
  const response = await new Promise<unknown>((resolve) => {
    chrome.runtime.sendNativeMessage("com.arlopass.bridge", {
      type: "pairing.auto",
      extensionId: chrome.runtime.id ?? "",
      hostName: "com.arlopass.bridge",
    }, resolve);
  });
  
  // 3. Validate response
  // ... check type === "pairing.auto", extract pairingHandle, pairingKeyHex
  
  // 4. Wrap pairing key and store
  const pairingState = await wrapPairingKeyMaterial({
    pairingHandle,
    extensionId: chrome.runtime.id ?? "",
    hostName: "com.arlopass.bridge",
    pairingKeyHex,
    runtimeId: chrome.runtime.id ?? "",
    createdAt,
  });
  
  // 5. Store in chrome.storage.local
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ "arlopass.wallet.bridgePairing.v1": pairingState }, resolve);
  });
  
  return { success: true };
}
```

Import `wrapPairingKeyMaterial` from `../../../transport/bridge-pairing.js`.

- [ ] **Step 2: Update `BridgeCheckStep` to auto-pair after detection**

After `detectBridge()` succeeds (status: "found"), immediately call `autoPair()`:

```ts
void detectBridge().then(async (result) => {
  if (result.connected) {
    // Auto-pair silently
    const pairResult = await autoPair();
    setState({
      status: "found",
      version: result.version,
      paired: pairResult.success,
    });
    // Auto-advance
    autoAdvanceRef.current = setTimeout(onBridgeFound, 1500);
  } else {
    setState({ status: "not-found" });
  }
});
```

Update the "found" UI to show "✓ Bridge connected and paired" instead of just "✓ Bridge connected".

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(extension): auto-pair with bridge during onboarding — zero user friction"
```

---

### Task 4: Update AddProviderWizard to use pairing-based auth

**Files:**
- Modify: `apps/extension/src/ui/components/onboarding/AddProviderWizard.tsx`

- [ ] **Step 1: Replace `resolveBridgeSharedSecret()` with pairing-based resolution**

Remove the legacy `WALLET_KEY_BRIDGE_SHARED_SECRET` constant and `resolveBridgeSharedSecret()` function. Replace with:

```ts
import { parseBridgePairingState, unwrapPairingKeyMaterial } from "../../../transport/bridge-pairing.js";

const PAIRING_STATE_KEY = "arlopass.wallet.bridgePairing.v1";

async function resolvePairingSecret(): Promise<string | undefined> {
  const state = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get([PAIRING_STATE_KEY], resolve);
  });
  const pairingState = parseBridgePairingState(state[PAIRING_STATE_KEY]);
  if (pairingState === undefined) return undefined;
  const extensionId = chrome.runtime.id ?? "";
  const unwrapped = await unwrapPairingKeyMaterial({
    pairingState,
    runtimeId: extensionId,
  });
  return unwrapped?.pairingKeyHex;
}

async function resolvePairingHandle(): Promise<string | undefined> {
  const state = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get([PAIRING_STATE_KEY], resolve);
  });
  const pairingState = parseBridgePairingState(state[PAIRING_STATE_KEY]);
  return pairingState?.pairingHandle;
}
```

- [ ] **Step 2: Update `sendNativeMessage` to use pairing in handshake**

Pass `resolveBridgePairingHandle` to `ensureBridgeHandshakeSession`:

```ts
const session = await ensureBridgeHandshakeSession({
  hostName,
  extensionId: chrome.runtime.id ?? "",
  sendNativeMessage: rawSendNativeMessage,
  resolveBridgeSharedSecret: async () => resolvePairingSecret(),
  resolveBridgePairingHandle: async () => resolvePairingHandle(),
});
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(extension): AddProviderWizard uses pairing-based auth instead of legacy secret"
```

---

## Phase B: Remove Legacy Shared Secret (Tasks 5-8)

### Task 5: Remove legacy from bridge

**Files:**
- Modify: `apps/bridge/src/main.ts`
- Modify: `apps/bridge/src/bridge-handler.ts`

- [ ] **Step 1: Remove `resolveSharedSecretFromEnv()` from main.ts**

Delete the function. Remove the `sharedSecret` variable. Remove the env var validation. Bridge no longer fails if `ARLOPASS_BRIDGE_SHARED_SECRET` is not set.

- [ ] **Step 2: Remove `sharedSecret` from `BridgeHandlerOptions`**

Remove `sharedSecret: Buffer` from the options type and constructor. Remove `#sharedSecret` field.

- [ ] **Step 3: Update `#handleHandshakeVerify` — require pairing**

Replace the fallback path (lines ~500-545). If `pairingHandle` is missing → return error:

```ts
if (pairingHandle === undefined || hostName === undefined) {
  return errorResponse(
    "auth.required",
    "This bridge requires pairing. Send pairing.auto first.",
  );
}
```

Remove `let handshakeSecret = this.#sharedSecret`.

- [ ] **Step 4: Update `#cloudConnectionCompleteIdempotencyNamespace`**

Pass the ConnectionRegistry signing key instead of shared secret. This requires storing the signing key as a field (added in Task 7).

- [ ] **Step 5: Run bridge tests, fix failures**

Run: `cd apps/bridge && npx vitest run`
Fix any tests that pass `sharedSecret` to `BridgeHandler`. Use `PairingManager` with pre-seeded pairings via `createAutoPairing()`.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(bridge): remove legacy shared secret — pairing is now mandatory"
```

---

### Task 6: Remove legacy from extension

**Files:**
- Modify: `apps/extension/src/transport/runtime.ts`
- Modify: `apps/extension/src/options.ts`

- [ ] **Step 1: Remove `WALLET_KEY_BRIDGE_SHARED_SECRET` and fallback in runtime.ts**

Delete the constant (line 40). In `resolveBridgeSharedSecret` lambda (line ~2668): remove the fallback that reads the legacy key (line ~2692). Only return pairing-derived key. If no pairing state → return `undefined`.

- [ ] **Step 2: Remove `clearLegacyBridgeSharedSecret()` from options.ts**

Delete the function and its call site. Delete `STORAGE_KEY_BRIDGE_SHARED_SECRET` constant.

- [ ] **Step 3: Run extension tests, fix failures**

Run: `cd apps/extension && npx vitest run`
Fix tests that set `WALLET_KEY_BRIDGE_SHARED_SECRET` in mock storage.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(extension): remove legacy shared secret storage and fallback paths"
```

---

### Task 7: Bridge state file + ConnectionRegistry signing key

**Files:**
- Create: `apps/bridge/src/state/bridge-state.ts`
- Modify: `apps/bridge/src/main.ts`

- [ ] **Step 1: Implement bridge-state.ts**

```ts
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

type BridgeState = {
  version: 1;
  signingKey: string; // 64 hex chars (32 bytes)
  createdAt: string;
};

export function readOrCreateBridgeState(stateFilePath: string): BridgeState {
  if (existsSync(stateFilePath)) {
    const raw = JSON.parse(readFileSync(stateFilePath, "utf8"));
    if (raw?.version === 1 && typeof raw.signingKey === "string" && /^[0-9a-f]{64}$/i.test(raw.signingKey)) {
      return raw as BridgeState;
    }
  }
  
  const state: BridgeState = {
    version: 1,
    signingKey: randomBytes(32).toString("hex"),
    createdAt: new Date().toISOString(),
  };
  
  mkdirSync(dirname(stateFilePath), { recursive: true });
  writeFileSync(stateFilePath, JSON.stringify(state, null, 2), "utf8");
  return state;
}
```

- [ ] **Step 2: Update main.ts to use bridge state**

Replace `resolveSharedSecretFromEnv()` with `readOrCreateBridgeState(stateFilePath)`. Use the signing key for `ConnectionRegistry` and idempotency namespace.

```ts
const bridgeState = readOrCreateBridgeState(stateFilePath);
const signingKey = Buffer.from(bridgeState.signingKey, "hex");

const connectionRegistry = new ConnectionRegistry({
  signatureKey: signingKey,
});

const handler = new BridgeHandler({
  // No sharedSecret!
  signingKey, // For idempotency namespace
  pairingManager,
  // ...
});
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(bridge): self-generated signing key with state file persistence"
```

---

### Task 8: Cleanup dev scripts + docs

**Files:**
- Modify: `scripts/dev/run-dev.ps1`
- Modify: `scripts/dev/native-host/*.cmd` (if exists)
- Modify: `README.md`
- Modify: `RUNNING_AND_USAGE_GUIDE.md`

- [ ] **Step 1: Remove secret generation from dev scripts**

In `run-dev.ps1`: remove `ARLOPASS_BRIDGE_SHARED_SECRET` env var generation/loading. Bridge starts without it now.

In native host scripts: remove `ARLOPASS_BRIDGE_SHARED_SECRET_PATH` reading.

- [ ] **Step 2: Update documentation**

README.md and RUNNING_AND_USAGE_GUIDE.md: remove "Generate shared secret" sections. Replace with: "Pairing between the extension and bridge happens automatically on first connection."

- [ ] **Step 3: Final build + test verification**

```bash
cd apps/bridge && npx vitest run
cd apps/extension && npm run build && npx vitest run
cd d:\Projects\arlopass && npm test
```

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove legacy shared secret from dev scripts and documentation"
```
