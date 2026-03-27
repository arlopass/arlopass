# Extension Wallet UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a MetaMask-inspired Arlopass wallet popup UI for the extension, including provider/model switching, revoke actions, and connect-flow routing.

**Architecture:** Keep UI logic separated into small units: storage contract parsing, action client, rendering, and background action handlers. The popup reads normalized state from `chrome.storage.local`, sends typed `chrome.runtime.sendMessage` actions, and updates UI only from authoritative background responses. Manifest/options integration provides a concrete connect destination for v1.

**Tech Stack:** TypeScript, Chrome Extension Manifest V3, WebExtension APIs (`chrome.storage`, `chrome.runtime`), Vitest

---

## Spec Reference
- `docs/superpowers/specs/2026-03-23-extension-wallet-ui-design.md`

## Program Sequencing and Prerequisites
- **Execution order:** after current extension/bridge/policy baseline
- **Prerequisites:** extension mediation modules already implemented
- **Blocks:** none; this is an additive UI feature

## File Structure

**Create**
- `apps/extension/popup.html` — popup shell + script/style entry
- `apps/extension/popup.css` — MetaMask-inspired visual system for popup
- `apps/extension/options.html` — v1 connect-flow destination page
- `apps/extension/src/options.ts` — minimal options/connect bootstrap
- `apps/extension/src/ui/popup-state.ts` — storage contract parsing/normalization
- `apps/extension/src/ui/popup-actions.ts` — runtime message action client
- `apps/extension/src/ui/popup-render.ts` — pure render helpers from normalized view-model
- `apps/extension/src/popup.ts` — popup controller wiring data/actions/render
- `apps/extension/src/__tests__/popup-state.test.ts`
- `apps/extension/src/__tests__/popup-actions.test.ts`
- `apps/extension/src/__tests__/popup-render.test.ts`

**Modify**
- `apps/extension/manifest.json` — add `action.default_popup` + `options_page`
- `apps/extension/package.json` — include popup/options assets in package files
- `apps/extension/src/background.ts` — add `arlopass.wallet` action handlers
- `apps/extension/src/index.ts` — export popup-related modules where appropriate

---

### Task 1: Implement popup storage contract parser and normalizer

**Files:**
- Create: `apps/extension/src/ui/popup-state.ts`
- Test: `apps/extension/src/__tests__/popup-state.test.ts`

- [ ] **Step 1: Write failing tests for storage schema and active state normalization**

```ts
import { describe, expect, it } from "vitest";
import { normalizeWalletSnapshot } from "../ui/popup-state.js";

describe("normalizeWalletSnapshot", () => {
  it("normalizes missing active provider to null", () => {
    const result = normalizeWalletSnapshot({});
    expect(result.activeProvider).toBeNull();
  });

  it("drops malformed providers and records warnings", () => {
    const result = normalizeWalletSnapshot({
      "arlopass.wallet.providers.v1": [{ id: 1 }],
    });
    expect(result.providers).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- apps/extension/src/__tests__/popup-state.test.ts`  
Expected: FAIL (module/symbol missing).

- [ ] **Step 3: Implement minimal parser/normalizer**

```ts
export function normalizeWalletSnapshot(raw: unknown): WalletSnapshot {
  // parse providers, normalize active selection, collect warnings
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- apps/extension/src/__tests__/popup-state.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/ui/popup-state.ts apps/extension/src/__tests__/popup-state.test.ts
git commit -m "feat: add extension wallet popup state normalization"
```

---

### Task 2: Implement popup action client with strict message envelope

**Files:**
- Create: `apps/extension/src/ui/popup-actions.ts`
- Test: `apps/extension/src/__tests__/popup-actions.test.ts`

- [ ] **Step 1: Write failing tests for action envelope and error mapping**

```ts
import { describe, expect, it, vi } from "vitest";
import { createWalletActionClient } from "../ui/popup-actions.js";

describe("wallet action client", () => {
  it("sends arlopass.wallet envelope with requestId", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    const client = createWalletActionClient(sendMessage);
    await client.setActiveProvider({ providerId: "ollama" });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "arlopass.wallet", action: "wallet.setActiveProvider" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- apps/extension/src/__tests__/popup-actions.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement minimal action client**

```ts
export function createWalletActionClient(sendMessage: SendMessageFn): WalletActionClient {
  // setActiveProvider, setActiveModel, revokeProvider, openConnectFlow
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- apps/extension/src/__tests__/popup-actions.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/ui/popup-actions.ts apps/extension/src/__tests__/popup-actions.test.ts
git commit -m "feat: add wallet popup action client"
```

---

### Task 3: Build wallet popup renderer and controller

**Files:**
- Create: `apps/extension/src/ui/popup-render.ts`
- Create: `apps/extension/src/popup.ts`
- Create: `apps/extension/popup.html`
- Create: `apps/extension/popup.css`
- Test: `apps/extension/src/__tests__/popup-render.test.ts`

- [ ] **Step 1: Write failing render tests for key UI states**

```ts
import { describe, expect, it } from "vitest";
import { renderWalletView } from "../ui/popup-render.js";

describe("renderWalletView", () => {
  it("renders empty state when no providers exist", () => {
    const html = renderWalletView({ providers: [], activeProvider: null, warnings: [] });
    expect(html).toContain("No providers connected");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- apps/extension/src/__tests__/popup-render.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement minimal render + controller**

```ts
// popup-render.ts
export function renderWalletView(model: WalletViewModel): string { /* ... */ }

// popup.ts
async function bootPopup(): Promise<void> { /* load storage, render, bind actions */ }
```

- [ ] **Step 4: Add MetaMask-inspired style system**

Implement in `popup.css`:
- card surfaces, rounded radius, subtle shadows
- status chips and primary CTA styling
- keyboard focus-visible states

- [ ] **Step 5: Run tests**

Run: `npm run test -- apps/extension/src/__tests__/popup-render.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/extension/src/ui/popup-render.ts apps/extension/src/popup.ts apps/extension/popup.html apps/extension/popup.css apps/extension/src/__tests__/popup-render.test.ts
git commit -m "feat: add metamask-inspired arlopass wallet popup ui"
```

---

### Task 4: Add background wallet action handlers

**Files:**
- Modify: `apps/extension/src/background.ts`
- Test: `apps/extension/src/__tests__/background.test.ts`

- [ ] **Step 1: Write failing tests for wallet action handling**

Add cases for:
- `wallet.setActiveProvider`
- `wallet.setActiveModel` (provider-switching semantics)
- `wallet.revokeProvider` (clear active on revoke)
- `wallet.openConnectFlow` (`chrome.runtime.openOptionsPage`)
- unknown `action` returns `{ ok: false, errorCode: "unsupported_action", ... }`

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- apps/extension/src/__tests__/background.test.ts`  
Expected: FAIL in new action paths.

- [ ] **Step 3: Implement handler map in background**

```ts
const walletHandlers: Record<string, (payload: unknown) => Promise<WalletActionResponse>> = {
  "wallet.setActiveProvider": async (payload) => { /* ... */ },
  "wallet.setActiveModel": async (payload) => { /* ... */ },
  "wallet.revokeProvider": async (payload) => { /* ... */ },
  "wallet.openConnectFlow": async () => { /* openOptionsPage */ },
};
```

- [ ] **Step 4: Wire message routing for popup transport envelope**

Add explicit `chrome.runtime.onMessage` dispatcher in background:
- route only messages where `channel === "arlopass.wallet"`
- validate shape (`action`, `requestId`, `payload`)
- invoke `walletHandlers[action]`
- return success/failure response envelope

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- apps/extension/src/__tests__/background.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/extension/src/background.ts apps/extension/src/__tests__/background.test.ts
git commit -m "feat: add wallet popup action handlers in extension background"
```

---

### Task 5: Wire manifest/options packaging and connect flow destination

**Files:**
- Modify: `apps/extension/manifest.json`
- Modify: `apps/extension/package.json`
- Create: `apps/extension/options.html`
- Create: `apps/extension/src/options.ts`
- Modify: `apps/extension/src/index.ts`

- [ ] **Step 1: Add failing manifest validation check**

Run:
`Get-Content 'apps/extension/manifest.json' -Raw | ConvertFrom-Json | Out-Null`

Expected: current manifest missing required UI routes for popup/options behavior.

- [ ] **Step 2: Implement manifest/options wiring**

Add:
- `"action": { "default_popup": "popup.html", ... }`
- `"options_page": "options.html"`

Ensure package files include:
- `popup.html`, `popup.css`, `options.html`

- [ ] **Step 3: Add dashboard placeholder route/link contract**

Ensure popup quick action supports “Open Full Dashboard (placeholder)” by routing to options page for v1.
Add/verify text and action wiring in popup render/controller tests.

- [ ] **Step 4: Build and typecheck extension workspace**

Run:
- `npm run --workspace @arlopass/extension build`
- `npm run --workspace @arlopass/extension typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/manifest.json apps/extension/package.json apps/extension/options.html apps/extension/src/options.ts apps/extension/src/index.ts
git commit -m "chore: wire extension popup and options routes"
```

---

### Task 6: Add popup error contract and state tests

**Files:**
- Modify: `apps/extension/src/popup.ts`
- Modify: `apps/extension/src/ui/popup-render.ts`
- Modify: `apps/extension/src/ui/popup-state.ts`
- Test: `apps/extension/src/__tests__/popup-render.test.ts`
- Test: `apps/extension/src/__tests__/popup-actions.test.ts`

- [ ] **Step 1: Write failing tests for error-contract states**

Cover:
- render banner from `arlopass.wallet.ui.lastError.v1`
- `connect_flow_unavailable` shows toast/banner and keeps state unchanged
- `invalid_selection` shows banner and retains previous active model/provider in UI

- [ ] **Step 2: Run targeted tests to verify failures**

Run:
`npm run test -- apps/extension/src/__tests__/popup-render.test.ts apps/extension/src/__tests__/popup-actions.test.ts`

Expected: FAIL in new error-path assertions.

- [ ] **Step 3: Implement error contract behavior**

Add deny-safe state retention and explicit error banner/toast rendering from action failures.

- [ ] **Step 4: Re-run targeted tests**

Run:
`npm run test -- apps/extension/src/__tests__/popup-render.test.ts apps/extension/src/__tests__/popup-actions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/popup.ts apps/extension/src/ui/popup-render.ts apps/extension/src/ui/popup-state.ts apps/extension/src/__tests__/popup-render.test.ts apps/extension/src/__tests__/popup-actions.test.ts
git commit -m "test: enforce wallet popup error contract and deny-safe state handling"
```

---

### Task 7: Full extension UI validation and regression checks

**Files:**
- Test: extension test suite + typecheck/build

- [ ] **Step 1: Run extension tests**

Run:
`npm run test -- apps/extension/src/__tests__`

Expected: PASS including new popup/background tests.

- [ ] **Step 2: Run targeted bridge compatibility tests**

Run:
`npm run test -- apps/bridge/src/__tests__/policy-integration.test.ts apps/bridge/src/__tests__/integration.native-messaging.test.ts`

Expected: PASS (no regression from action contract changes).

- [ ] **Step 3: Run workspace typecheck**

Run:
`npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Run extension build**

Run:
`npm run --workspace @arlopass/extension build`

Expected: PASS and `dist/popup.js` + `dist/options.js` emitted.

- [ ] **Step 5: Commit final validation pass**

```bash
git add .
git commit -m "test: validate arlopass wallet extension ui integration"
```

---

## Definition of Done

- Extension popup renders wallet UI in empty/populated/error states.
- Provider/model switching, revoke, and connect-flow actions function through background handlers.
- Manifest and options routing are valid and resolvable.
- UI behavior is deterministic and deny-safe on failures.
- Extension tests, build, and workspace typecheck pass.
