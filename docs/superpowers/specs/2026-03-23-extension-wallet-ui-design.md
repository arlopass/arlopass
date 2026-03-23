# Design Spec: BYOM Extension Wallet UI (MetaMask-Inspired)

## Metadata
- **Date:** 2026-03-23
- **Status:** Draft for implementation
- **Scope:** Extension wallet popup UI only
- **Design Goal:** MetaMask-inspired aesthetics and interaction model without pixel-perfect cloning

---

## 1) Problem

The extension currently has backend mediation logic but no user-facing wallet UI. Users cannot discover connected AI providers, switch active model/provider quickly, or perform wallet-style actions from the extension popup.

---

## 2) Goals and Non-Goals

## Goals
1. Add a polished extension popup with wallet-style structure.
2. Present connected providers/models with clear status and active selection.
3. Support user actions: connect provider, switch active provider/model, revoke provider.
4. Match MetaMask-like visual language (card surfaces, hierarchy, controls) while using BYOM branding.

## Non-Goals
1. Pixel-perfect cloning of MetaMask assets/UI.
2. Building full settings/onboarding multi-page flows in this slice.
3. Implementing cloud backend dependencies.

---

## 3) UX Structure

## Popup Layout
1. **Top bar**
   - BYOM Wallet title + status chip.
2. **Primary account card**
   - Active provider + active model.
   - Connection confidence/status.
3. **Provider list**
   - Cards for providers (Ollama, Claude, Copilot CLI, etc.) with:
     - connected/disconnected badge
     - active marker
     - quick actions (set active, revoke)
4. **Quick actions row**
   - Connect Provider
   - Open Full Dashboard (placeholder)
5. **Security footer**
   - brief text: origin-scoped approvals, local credential safety.

## States
- Empty state: no providers connected
- Populated state: one or more providers
- Error state: storage/load failure

---

## 4) Visual Direction (MetaMask-Inspired, BYOM-Branded)

1. White/light-neutral cards on soft gray background.
2. Rounded corners, subtle borders/shadows, bold primary CTA.
3. Compact typography hierarchy (title, secondary labels, metadata).
4. Color-coded status chips:
   - green (connected)
   - amber (needs attention)
   - gray (disconnected)
5. Smooth hover/focus states with clear keyboard focus rings.

---

## 5) Architecture and Files

## New/Updated Files
- `apps/extension/manifest.json` (add popup entry)
- `apps/extension/popup.html`
- `apps/extension/popup.css`
- `apps/extension/src/popup.ts`
- `apps/extension/options.html` (connect-provider destination page for v1)
- `apps/extension/src/options.ts` (minimal options/connect flow bootstrapping)
- `apps/extension/src/background.ts` (add wallet action handlers)
- `apps/extension/package.json` (include popup assets in package files)

## Data Source
- Use `chrome.storage.local` as the single source of truth.
- Do not use runtime mock providers in production popup behavior.
- Keep logic deterministic and no silent failures (show explicit UI error block).

## Storage Contract (v1)
- `byom.wallet.providers.v1`:
  - `Array<{ id: string; name: string; type: "local" | "cloud" | "cli"; status: "connected" | "disconnected" | "attention"; models: Array<{ id: string; name: string }>; lastSyncedAt?: number }>`
- `byom.wallet.activeProvider.v1`:
  - `{ providerId: string; modelId?: string } | null`
- `byom.wallet.ui.lastError.v1` (optional):
  - `{ code: string; message: string; at: number }`

`byom.wallet.activeProvider.v1` is the single source of truth for active selection.
When no provider is active, value MUST be `null` (or key absent and normalized to `null` at read-time).
On revoke of the active provider, background sets value to `null` before emitting refresh.
Unknown or malformed records are dropped from render and surfaced as non-fatal warnings.

## Action Contract (popup -> background)
Transport envelope (all actions):
- request: `{ channel: "byom.wallet"; action: string; requestId: string; payload: object }` via `chrome.runtime.sendMessage`
- response: `{ ok: true; data?: object } | { ok: false; errorCode: string; message: string }`

- `wallet.setActiveProvider` payload: `{ providerId: string; modelId?: string }`
- `wallet.setActiveModel` payload: `{ providerId: string; modelId: string }`
- `wallet.revokeProvider` payload: `{ providerId: string }`
- `wallet.openConnectFlow` payload: `{}`

All actions return:
- success: `{ ok: true }`
- failure: `{ ok: false; errorCode: string; message: string }`

`wallet.openConnectFlow` must call `chrome.runtime.openOptionsPage()` as the concrete destination for v1.
Manifest must define `"options_page": "options.html"` so the route is always resolvable.
If unavailable, return `{ ok: false, errorCode: "connect_flow_unavailable", message: string }` and show toast/banner.

## Model Switching UX Contract
- Each connected provider card includes a model dropdown (if `models.length > 0`).
- On model change, popup calls `wallet.setActiveModel`.
- Success updates active badge immediately from refreshed storage snapshot.
- Failure keeps previous selection and displays error banner with `errorCode`.
- `wallet.setActiveModel` semantics are provider-switching by design:
  - if `providerId` differs from current active provider, background atomically sets active provider to `providerId` and active model to `modelId`.
  - if provider is already active, only `modelId` is updated.
  - unknown provider/model returns `{ ok: false, errorCode: "invalid_selection", message: string }`.

---

## 6) Error Handling

1. Storage read errors surface user-friendly banner and console-safe detail.
2. Unknown provider shape is ignored with explicit warning count.
3. Action failures keep previous UI state and show inline toast/banner with `errorCode`.
4. Background timeout/failure uses deny-safe UX (no optimistic state mutation).

---

## 7) Testing and Validation

1. Build/typecheck must pass for extension workspace.
2. Existing extension tests remain green.
3. Manifest JSON validity check passes.
4. Basic UI logic smoke behavior validated through popup-state rendering paths.

---

## 8) Security and Robustness Constraints

1. No credentials displayed in popup UI.
2. No privileged action without explicit user click.
3. Never trust arbitrary storage payloads; validate before rendering.
4. Preserve extension performance (fast popup render, minimal blocking calls).

---

## 9) Recommendation

Implement a single high-quality popup UI now using static HTML/CSS + TypeScript controller logic. This delivers immediate wallet UX value, keeps complexity controlled, and aligns with the broader enterprise-grade extension roadmap.
