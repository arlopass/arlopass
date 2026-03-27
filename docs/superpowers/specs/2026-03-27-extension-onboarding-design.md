# Extension Onboarding Experience — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Location:** `apps/extension/` (popup + options page)

---

## 1. Overview

A warm, guided onboarding flow for first-time Arlopass extension users. Targets non-technical users who want to use AI on the web. The flow introduces Arlopass, checks for/installs the Bridge, guides through first provider setup, and celebrates success with a quick tour.

**Audience:** Non-technical browser users, not developers.
**Tone:** Warm and guiding — encouraging, simple language, no jargon, time estimates, progress indicators.
**Surfaces:** Popup (360px) for quick steps, Options page (full screen) for installation and provider wizard.

---

## 2. Flow Summary

```
Step 1: Welcome         (popup)    → Intro card: what is Arlopass, value props
Step 2: Bridge Check    (popup)    → Auto-detect bridge, show status
Step 3: Bridge Install  (options)  → OS-specific guided installation
Step 4: Add Provider    (options)  → Existing AddProviderWizard (reused)
Step 5: Success + Tour  (popup)    → Celebration + 3 tip cards
```

### State detection on popup open

| Condition | Action |
|---|---|
| Has providers | Normal wallet view (skip onboarding) |
| No providers, bridge connected | Skip to Step 4 (add provider) |
| No providers, no bridge | Start at Step 1 (welcome) |
| Onboarding `completed: true` in storage | Normal wallet view |

### Persistence

Onboarding state in `chrome.storage.local` key `arlopass.onboarding.setup`:

```ts
type OnboardingSetupState = {
  completed: boolean;
  bridgeInstalled: boolean;
  currentStep: number; // 1-5
};
```

Note: this is distinct from the existing `onboarding-state.ts` which manages the AddProviderWizard flow. The new file is named `setup-state.ts` to avoid collision.

If user closes popup mid-onboarding, resume from `currentStep` on next open.

**Storage recovery:** If `arlopass.onboarding.setup` is missing, corrupted, or has invalid `currentStep`, fall back to state detection (check bridge + providers). If `chrome.storage.local` is cleared externally, the onboarding restarts — this is safe since the bridge and providers still exist and will be detected.

### Back navigation

All steps support going back:
- Step 2 (Bridge Check): "← Back" returns to Step 1
- Step 3 (Bridge Install, options page): "← Back" returns to popup at Step 2
- Step 4 (Add Provider, options page): "← Back" returns to Step 3
- Step 5 (Success Tour): No back — this is the final destination

### Bridge detection timeouts

- `chrome.runtime.sendNativeMessage` timeout: **5 seconds** (matches existing pattern in AddProviderWizard)
- If timeout: treat as "bridge not found" (same as error)
- Step 3 auto-polling interval: **3 seconds** between checks
- When bridge detected during polling: status card immediately turns green, "Continue" button appears, auto-advance after **2 seconds**

### Mobile / unsupported platforms

If `navigator.platform` indicates iOS, Android, or another non-desktop platform, show a message: "Arlopass requires a desktop browser (Chrome, Firefox, or Edge). Visit arlopassai.com on your computer to get started." No installation flow.

---

## 3. Step 1 — Welcome (Popup)

**Purpose:** Introduce Arlopass. Build trust and excitement. Set expectations.

### Content

- **Icon:** `IconShieldCheck` (Tabler), 48px, color `#202225`
- **Heading:** "Welcome to Arlopass" (16px semibold)
- **Subheading:** "Your AI Wallet" (12px regular, `#808796`)
- **Description:** "Arlopass lets you use AI on any website — with your own providers, your own models, and your own rules." (12px regular)

### Three value prop cards

Each card: `#f8f9fa` background, `1px solid #dfe1e8` border, 12px padding, 4px border-radius.

| Icon | Heading | Description |
|---|---|---|
| `IconLock` (16px) | Your keys stay safe | Credentials never leave your device. |
| `IconHandStop` (16px) | You're in control | Choose which apps can use your AI. |
| `IconPlug` (16px) | Works everywhere | Ollama, Claude, OpenAI and more. |

### Actions

- **"Let's get started →"** — full-width primary button (`#202225` bg, white text, 14px medium)
- **"Setup takes about 3 minutes"** — 10px regular, `#808796`, centered below button

### Behavior

- No step indicator on welcome — it's the doorway
- Button press advances to Step 2 and saves `currentStep: 2`

---

## 4. Step 2 — Bridge Check (Popup)

**Purpose:** Automatically detect bridge. Route user to install or continue.

### Detection

Call `chrome.runtime.sendNativeMessage("com.arlopass.bridge", { type: "ping" })`:
- Response received → bridge installed (parse version from response if available)
- Error → bridge not installed

Detection runs automatically on mount (no user action).

### Step indicator

"Step 1 of 3" — 10px medium, `#808796`. The three user-visible steps are: Bridge → Provider → Done.

### States

**Detecting:**
- Heading: "Checking your setup…"
- `<Loader size="sm">` spinner, color `#202225`
- Description: "Looking for the Arlopass Bridge on your computer."

**Bridge found (happy path):**
- Icon: `IconCircleCheck`, green/teal color
- Heading: "Bridge connected"
- Status card: "✓ Arlopass Bridge v{version} — Running on your computer"
- Description: "Everything looks good. Let's connect your first AI provider."
- Button: "Continue →" (primary)
- Auto-advance to Step 4 after 1.5 seconds

**Bridge not found:**
- Heading: "Bridge not found"
- Description: "The Arlopass Bridge is a small helper app that runs on your computer. It connects the extension to your AI providers securely."
- Primary button: "Install the Bridge →" — opens options page at Step 3
- Secondary button (outline): "I already installed it — Check again ↻" — re-runs detection

---

## 5. Step 3 — Bridge Installation (Options Page)

**Purpose:** OS-specific guided installation. Full screen for space.

### OS detection

Use `navigator.platform` / `navigator.userAgent` to detect Windows, macOS, Linux. Show correct instructions automatically. Provide "Change OS ▾" dropdown to switch if wrong.

### Page layout

- Onboarding progress banner at top: "Step 1 of 3: Install the Bridge"
- Description: "The Bridge is a small app that runs quietly in the background. It connects this extension to your AI providers — like Ollama, ChatGPT, or Claude — without exposing your credentials to websites."
- OS indicator card with change-OS dropdown
- OS-specific instructions (below)
- "I've installed it — check now" button (primary)
- Auto-polling status card

### Windows instructions

**① Download**
- Button: "Download Arlopass Bridge for Windows" with file size
- URL: `https://github.com/AltClick/arlopass/releases/latest/download/arlopass-bridge-win-x64.exe`
- Label below: "arlopass-bridge-win-x64.exe · ~12 MB"

**② Run the installer**
- "Open your Downloads folder and double-click the file."
- SmartScreen warning (proactive): "If Windows SmartScreen appears, click 'More info' then 'Run anyway' — the installer is safe."

**③ That's it!**
- "The Bridge starts automatically. Come back here and click the button below."

### macOS / Linux instructions

**① Copy and run this command**
- Code block with copy button: `curl -fsSL https://arlopassai.com/install.sh | sh`
- How to open Terminal:
  - macOS: "Press ⌘ + Space, type 'Terminal', press Enter"
  - Linux: "Press Ctrl + Alt + T"
- "Paste the command and press Enter. The installer downloads the Bridge and sets it up automatically."

### Auto-polling status

Status card at the bottom polls `chrome.runtime.sendNativeMessage` every 3 seconds:
- ⏳ "Waiting for Bridge…" (gray, pulsing dot)
- ✓ "Bridge connected!" (green, version shown) — shows "Continue to add your first provider →" button, auto-advances after 2 seconds
- ✗ "Couldn't reach the Bridge" (red) — shows "Try again" and "Need help?" links

### Troubleshooting (expandable)

Collapsible section with common issues:
- "Bridge not detected after installing?" — re-run installer, restart browser, antivirus
- "Getting a 'not recognized' error on macOS/Linux?" — System Settings security, chmod +x
- "Still stuck?" — docs link, Discord link

---

## 6. Step 4 — Add Provider (Options Page)

**Purpose:** Connect first AI provider. Reuses existing `AddProviderWizard`.

### Layout

- Thin onboarding progress banner above wizard: "✓ Bridge connected · Step 2 of 3: Add a provider"
- `AddProviderWizard` rendered below (unchanged)
- Small "Skip for now" link below wizard (10px, `#808796`)

### Behavior

- Wizard steps are unchanged: Select provider → Credentials → Test → Result
- On successful completion: update onboarding state `{ currentStep: 5 }`
- Show "Provider added!" message, then auto-redirect text: "Heading back to the extension…" (2s delay)
- Popup will detect the new provider and render Step 5
- "Skip for now" marks bridge as installed, leaves at empty wallet with a "Add Provider" button

---

## 7. Step 5 — Success + Quick Tour (Popup)

**Purpose:** Celebrate, teach 3 key concepts, transition to normal wallet.

### Celebration screen

- Icon: `IconConfetti` (Tabler), 48px
- Heading: "You're all set!" (16px semibold)
- Description: "Arlopass is ready to use. Here are a few things to know before you start."
- Button: "Next →" (primary)
- "Skip tour" link in top-right (10px, `#808796`)

### 3 tip cards (swipeable)

Each tip: icon (48px), heading (14px semibold), description (12px regular, `#808796`), dot indicator at bottom.

**Tip 1: Permissions**
- Icon: `IconShieldCheck`
- Heading: "Websites ask, you decide"
- Copy: "When a website wants to use your AI, you'll see a prompt asking for your permission. You can approve, deny, or choose which models to share."

**Tip 2: Credentials**
- Icon: `IconLock`
- Heading: "Your keys never leave your device"
- Copy: "API keys and passwords are stored locally in your browser's secure vault. Websites never see them — the Bridge handles all the communication."

**Tip 3: Wallet**
- Icon: `IconWallet`
- Heading: "Your AI wallet"
- Copy: "Click the Arlopass icon anytime to see your providers, connected apps, and usage. You can add more providers, revoke access, or change settings whenever you want."

### Navigation

- 3 dots: `#808796` inactive, `#202225` active
- "Next →" advances through tips
- Last tip shows "Done ✓" instead
- Card transition: CSS `transform: translateX()`, 250ms ease

### Completion

- "Done ✓" button sets `chrome.storage.local` `arlopass.onboarding.completed = true`
- Transitions to normal wallet view
- Onboarding never shows again unless storage is cleared

---

## 8. Bridge Uninstall

### Location

Extension settings (gear icon → options page), under a "Bridge" section:

```
Bridge
  ✓ Connected · v1.2.0
  [Uninstall Bridge]
```

### Behavior

1. Confirmation dialog: "This will remove the Arlopass Bridge from your computer. You'll need to reinstall it to use Arlopass again."
2. On confirm: the extension sends a message to the bridge to execute `--uninstall`
3. Bridge `--uninstall` flag: removes binary, native messaging host manifests (Chrome, Firefox, Edge), and Windows registry entries
4. After uninstall: settings page shows "Bridge not installed" state with "Install Bridge" button

### Implementation note

The `--uninstall` flag must be added to the bridge binary. It should:
- **Windows:** Delete binary from `%LOCALAPPDATA%\Arlopass\bin\`, remove registry keys for all browsers
- **macOS:** Delete binary from `~/.local/bin/`, remove JSON manifests from `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` and `~/.mozilla/native-messaging-hosts/`
- **Linux:** Delete binary from `~/.local/bin/`, remove JSON manifests from `~/.config/google-chrome/NativeMessagingHosts/` and `~/.mozilla/native-messaging-hosts/`

### Error handling

- If uninstall command fails (bridge process not responding): show error message "Couldn't remove the Bridge automatically. You can delete it manually from {path}." with the OS-specific path.
- If bridge is missing but extension is enabled (bridge was removed outside Arlopass): settings page shows "Bridge not installed" with "Install Bridge" button. The onboarding does NOT re-trigger — the user is past onboarding. They can reinstall from settings.
- If bridge crashes/disconnects after setup is complete: the normal wallet view shows a connection warning banner (not the onboarding flow). Onboarding only triggers when `completed` is false.

---

## 9. File Structure (New/Modified)

### New files

```
apps/extension/src/ui/components/onboarding/
  ├── OnboardingController.tsx    # Main controller: detects state, routes to step
  ├── WelcomeStep.tsx             # Step 1: welcome card
  ├── BridgeCheckStep.tsx         # Step 2: auto-detect bridge
  ├── BridgeInstallGuide.tsx      # Step 3: OS-specific install (options page)
  ├── OnboardingBanner.tsx        # Progress banner for options page
  ├── SuccessStep.tsx             # Step 5: celebration
  ├── TourCards.tsx               # Step 5: tip card carousel
  └── setup-state.ts              # Storage helpers for onboarding setup state (distinct from onboarding-state.ts)
```

### Modified files

- `apps/extension/src/ui/popup-render.ts` — check onboarding state on mount, render `OnboardingController` if not completed
- `apps/extension/src/ui/options-render.ts` — add route for bridge install guide
- `apps/extension/src/ui/components/onboarding/AddProviderWizard.tsx` — add onboarding banner wrapper variant, add "← Back" support when rendered inside onboarding flow

---

## 10. Decisions Record

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Flow location | Popup-first, overflow to options | Users click extension icon first; install guide needs more space |
| 2 | Bridge install | Smart hybrid (download on Windows, command on macOS/Linux) | Windows users shouldn't need a terminal |
| 3 | Tone | Warm and guiding | Primary extension users are non-technical |
| 4 | Post-setup | Success celebration + 3 tip cards | Builds confidence and teaches key concepts |
| 5 | Bridge uninstall | Bridge binary `--uninstall` flag | Clean removal of binary + native host manifests |
| 6 | Provider step | Reuse existing AddProviderWizard | No redesign needed, add onboarding banner |
