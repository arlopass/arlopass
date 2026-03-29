# Extension Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a warm, guided onboarding flow for first-time Arlopass extension users — welcome screen, bridge detection/installation, provider setup, and success tour.

**Architecture:** OnboardingController in popup detects state and routes to the right step. Bridge install guide opens in options page. Existing AddProviderWizard is reused with an onboarding banner wrapper. Setup state persisted in `chrome.storage.local`.

**Tech Stack:** React 18, Mantine 7, TypeScript, Tabler Icons, Chrome Extension APIs

**Spec:** `docs/superpowers/specs/2026-03-27-extension-onboarding-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/ui/components/onboarding/setup-state.ts` | Setup state type + chrome.storage helpers |
| `src/ui/components/onboarding/OnboardingController.tsx` | State detection + step routing |
| `src/ui/components/onboarding/WelcomeStep.tsx` | Step 1: welcome intro card |
| `src/ui/components/onboarding/BridgeCheckStep.tsx` | Step 2: bridge auto-detection |
| `src/ui/components/onboarding/BridgeInstallGuide.tsx` | Step 3: OS-specific install guide (options) |
| `src/ui/components/onboarding/OnboardingBanner.tsx` | Progress banner for options page |
| `src/ui/components/onboarding/SuccessStep.tsx` | Step 5: celebration screen |
| `src/ui/components/onboarding/TourCards.tsx` | Step 5: 3 tip card carousel |
| `src/popup.tsx` | Modified: add onboarding view type + controller |
| `src/options.tsx` / options mount | Modified: add bridge install route |

---

## Task 1: Setup state module

**Files:**
- Create: `apps/extension/src/ui/components/onboarding/setup-state.ts`

- [ ] **Step 1: Implement setup state types and storage helpers**

```ts
// Distinct from onboarding-state.ts (which is the AddProviderWizard flow)

export type SetupStep = 1 | 2 | 3 | 4 | 5;

export type OnboardingSetupState = {
  completed: boolean;
  bridgeInstalled: boolean;
  currentStep: SetupStep;
};

const STORAGE_KEY = "arlopass.onboarding.setup";

const DEFAULT_STATE: OnboardingSetupState = {
  completed: false,
  bridgeInstalled: false,
  currentStep: 1,
};

export async function readSetupState(): Promise<OnboardingSetupState> {
  // Read from chrome.storage.local, validate, return DEFAULT_STATE on corruption
}

export async function writeSetupState(state: OnboardingSetupState): Promise<void> {
  // Write to chrome.storage.local
}

export async function markSetupComplete(): Promise<void> {
  // Set completed: true
}

export async function detectBridge(): Promise<{ connected: boolean; version?: string }> {
  // chrome.runtime.sendNativeMessage("com.arlopass.bridge", { type: "ping" })
  // 5 second timeout
  // Return { connected: true, version } or { connected: false }
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(extension): onboarding setup state module with bridge detection"
```

---

## Task 2: Welcome step (popup)

**Files:**
- Create: `apps/extension/src/ui/components/onboarding/WelcomeStep.tsx`

- [ ] **Step 1: Implement WelcomeStep**

Props: `onNext: () => void`

Content from spec Section 3:
- IconShieldCheck (48px, #202225)
- "Welcome to Arlopass" heading, "Your AI Wallet" subheading
- 3 value prop cards (IconLock, IconHandStop, IconPlug)
- "Let's get started →" primary button
- "Setup takes about 3 minutes" hint text
- All styling per DESIGN_GUIDELINES.md (360px, #202225, #808796, #dfe1e8, Inter font)

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(extension): welcome step — intro card with value props"
```

---

## Task 3: Bridge check step (popup)

**Files:**
- Create: `apps/extension/src/ui/components/onboarding/BridgeCheckStep.tsx`

- [ ] **Step 1: Implement BridgeCheckStep**

Props: `onBridgeFound: () => void; onInstallNeeded: () => void; onBack: () => void`

Three states from spec Section 4:
- **Detecting:** spinner + "Checking your setup…" — runs `detectBridge()` on mount
- **Found:** green IconCircleCheck + "Bridge connected" + version + "Continue →" button + 1.5s auto-advance
- **Not found:** "Bridge not found" + explanation + "Install the Bridge →" button (opens options) + "Check again ↻" button

Step indicator: "Step 1 of 3"

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(extension): bridge check step with auto-detection and retry"
```

---

## Task 4: Bridge install guide (options page)

**Files:**
- Create: `apps/extension/src/ui/components/onboarding/BridgeInstallGuide.tsx`
- Create: `apps/extension/src/ui/components/onboarding/OnboardingBanner.tsx`

- [ ] **Step 1: Implement OnboardingBanner**

Simple progress banner: "✓ Bridge connected · Step {n} of 3: {label}" or "Step {n} of 3: {label}"
Props: `step: number; label: string; bridgeConnected?: boolean`

- [ ] **Step 2: Implement BridgeInstallGuide**

Full-page component for the options page. Content from spec Section 5:
- OnboardingBanner at top
- Description of what the Bridge is (non-technical language)
- OS detection with "Change OS ▾" dropdown
- **Windows flow:** download button + "Run the installer" instructions + SmartScreen warning
- **macOS/Linux flow:** copy-paste command with copy button + "How to open Terminal" instructions
- "I've installed it — check now" primary button
- Auto-polling status card (every 3 seconds via `detectBridge()`)
- Status states: waiting (pulsing), connected (green), failed (red + try again)
- Expandable troubleshooting section
- "← Back" link to return to popup

Download URL: `https://github.com/arlopass/arlopass/releases/latest/download/arlopass-bridge-{os}-{arch}{ext}`

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(extension): bridge install guide with OS detection and auto-polling"
```

---

## Task 5: Success step + tour cards (popup)

**Files:**
- Create: `apps/extension/src/ui/components/onboarding/SuccessStep.tsx`
- Create: `apps/extension/src/ui/components/onboarding/TourCards.tsx`

- [ ] **Step 1: Implement TourCards**

Props: `onComplete: () => void`

3 tip cards from spec Section 6:
1. IconShieldCheck — "Websites ask, you decide"
2. IconLock — "Your keys never leave your device"
3. IconWallet — "Your AI wallet"

Navigation: dot indicators (3 dots), "Next →" / "Done ✓" button
Slide animation: CSS transform translateX, 250ms ease
"Skip tour" link in top-right

- [ ] **Step 2: Implement SuccessStep**

Props: `onComplete: () => void`

Celebration screen:
- IconConfetti (48px)
- "You're all set!" heading
- "Arlopass is ready to use." description
- "Next →" button advances to TourCards
- After TourCards completes, calls `markSetupComplete()` then `onComplete()`

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(extension): success celebration and tour cards with slide animation"
```

---

## Task 6: OnboardingController

**Files:**
- Create: `apps/extension/src/ui/components/onboarding/OnboardingController.tsx`

- [ ] **Step 1: Implement OnboardingController**

Props: `onComplete: () => void; onOpenOptions: (route: string) => void`

The main router component:
1. On mount: reads `SetupState` from storage
2. Detects state: has providers? bridge connected? currentStep?
3. Routes to the correct step component
4. Manages step transitions, persists `currentStep` on each change
5. Handles "Install Bridge" → opens options page with bridge install route
6. Handles "Add Provider" → opens options page with add-provider route
7. On Step 5 complete → calls `markSetupComplete()` + `onComplete()`

Step routing logic:
```
if (setupState.completed) → onComplete() (show wallet)
if (providers exist) → skip to Step 5 or complete
if (bridge connected && no providers) → Step 4
if (!bridge) → Step 2
default → Step 1
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(extension): onboarding controller with state detection and step routing"
```

---

## Task 7: Wire into popup.tsx

**Files:**
- Modify: `apps/extension/src/popup.tsx`

- [ ] **Step 1: Add onboarding view type and controller**

Modifications to the existing popup.tsx:
1. Add `"onboarding"` to `PopupView` union type
2. On mount (inside the existing `useEffect`): check if onboarding is needed:
   - Call `readSetupState()` — if `completed: false` AND no providers loaded → show onboarding
3. Add a new branch before the existing view rendering:
   ```tsx
   if (view.type === "onboarding") {
     return (
       <MantineProvider theme={arlopassTheme} forceColorScheme="light">
         <OnboardingController
           onComplete={() => { updateView({ type: "main" }); refresh(); }}
           onOpenOptions={(route) => { chrome.tabs.create({ url: chrome.runtime.getURL(`options.html#${route}`) }); }}
         />
       </MantineProvider>
     );
   }
   ```
4. The `restoreView` logic should check onboarding state first — if not completed, force `{ type: "onboarding" }`

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(extension): wire onboarding controller into popup entry point"
```

---

## Task 8: Wire bridge install into options page

**Files:**
- Modify: options page HTML/mount to support hash-based routing for `#bridge-install`

- [ ] **Step 1: Add bridge install route to options page**

The options page needs to render `BridgeInstallGuide` when opened with `#bridge-install` hash. And render `AddProviderWizard` with `OnboardingBanner` when opened with `#add-provider-onboarding`.

Read the current options.html to understand the mount point, then add:
- Hash-based route detection on mount
- Render BridgeInstallGuide for `#bridge-install`
- Render AddProviderWizard with OnboardingBanner for `#add-provider-onboarding`
- "← Back" returns to popup (closes tab)

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(extension): options page routes for bridge install and onboarding provider wizard"
```

---

## Task 9: Build + typecheck verification

- [ ] **Step 1: Run typecheck**

Run: `cd apps/extension && npx tsc --noEmit`

- [ ] **Step 2: Build extension**

Run: `cd apps/extension && npm run build`

- [ ] **Step 3: Run extension tests**

Run: `cd apps/extension && npx vitest run`

- [ ] **Step 4: Manual verification checklist**

- [ ] Popup shows welcome step when no providers + no bridge
- [ ] Welcome → Bridge Check transition works
- [ ] Bridge Check detects bridge (or shows "not found")
- [ ] "Install the Bridge" opens options page at bridge install guide
- [ ] OS detection works on the install guide
- [ ] Auto-polling detects bridge when installed
- [ ] Provider wizard shows with onboarding banner
- [ ] Success celebration + tour cards render
- [ ] "Done" marks onboarding complete
- [ ] Subsequent popup opens show normal wallet

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(extension): complete onboarding flow — welcome, bridge install, provider setup, tour"
```
