# Bridge Vault Extension Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the extension popup into the bridge vault so providers, credentials, app connections, and token usage are read/written via `vault.*` native messages instead of `chrome.storage.local`.

**Architecture:** A new `useVault` hook manages the vault lifecycle (status → setup/unlock → unlocked). It provides a `sendVaultMessage` function that other hooks use to communicate with the bridge. The popup gates all UI on vault state: uninitialized → setup screen, locked → unlock screen, unlocked → normal wallet UI. Existing `chrome.storage.local` reads/writes for providers, credentials, and usage are replaced with vault messages.

**Tech Stack:** React hooks, Mantine v8, existing `PersistentBridgePort` + `ensureBridgeHandshakeSession` from `transport/runtime.ts`

**Spec:** `docs/superpowers/specs/2026-03-27-bridge-vault-design.md` (Section 6: Extension Changes)

**Depends on:** Phase 1 (bridge vault module) — complete

---

## File Structure

### New extension files

| File | Responsibility |
|---|---|
| `apps/extension/src/ui/hooks/useVault.ts` | Vault lifecycle hook: status check, setup, unlock, lock, sendVaultMessage helper, auto-reconnect on vault.locked errors |
| `apps/extension/src/ui/components/VaultSetup.tsx` | First-time vault setup screen: password input + confirm, mode selection |
| `apps/extension/src/ui/components/VaultUnlock.tsx` | Unlock screen: password input, error display, lockout countdown |
| `apps/extension/src/ui/components/VaultGate.tsx` | Wrapper that gates children on vault state (uninitialized → setup, locked → unlock, unlocked → children) |

### Modified extension files

| File | Change |
|---|---|
| `apps/extension/src/popup.tsx` | Add VaultGate as top-level wrapper, pass vault context down |
| `apps/extension/src/ui/hooks/useWalletProviders.ts` | Replace `chrome.storage.local.get` with `vault.providers.list` via sendVaultMessage |
| `apps/extension/src/ui/hooks/useTokenUsage.ts` | Replace `TokenUsageService` with `vault.usage.read` / `vault.usage.flush` |
| `apps/extension/src/ui/components/onboarding/AddProviderWizard.tsx` | Write to vault instead of `chrome.storage.local` on save |
| `apps/extension/src/ui/components/onboarding/credential-storage.ts` | Replace `chrome.storage.local` with vault credential messages |
| `apps/extension/src/background.ts` | Read/write providers from vault instead of `chrome.storage.local` |

### New extension test files

No new unit tests — the vault UI depends on `chrome.runtime.sendNativeMessage` which requires a real bridge. Full integration coverage via existing Playwright e2e tests (`e2e/tests/`).

---

## Task 1: useVault Hook — Vault Lifecycle Manager

**Files:**
- Create: `apps/extension/src/ui/hooks/useVault.ts`

This hook owns the vault lifecycle. It establishes a bridge session, checks vault status, and provides `sendVaultMessage` for all vault operations. It cannot be unit tested because it depends on `chrome.runtime.sendNativeMessage` — the full flow is covered by Playwright e2e tests.

- [ ] **Step 1: Create the useVault hook**

```ts
// apps/extension/src/ui/hooks/useVault.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { ensureBridgeHandshakeSession } from "../../transport/bridge-handshake.js";
import {
  BRIDGE_PAIRING_STATE_STORAGE_KEY,
  parseBridgePairingState,
  unwrapPairingKeyMaterial,
} from "../../transport/bridge-pairing.js";

const HOST_NAME = "com.arlopass.bridge";

export type VaultStatus =
  | { state: "connecting" }
  | { state: "bridge-unavailable"; error: string }
  | { state: "uninitialized" }
  | { state: "locked"; keyMode?: "password" | "keychain" }
  | { state: "unlocked" }
  | { state: "locked_out"; secondsRemaining: number };

export type UseVaultResult = {
  status: VaultStatus;
  /** Send an authenticated vault.* message to the bridge. Returns the response. */
  sendVaultMessage: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** Run vault.setup with password mode. */
  setup: (password: string) => Promise<void>;
  /** Unlock with password. */
  unlock: (password: string) => Promise<void>;
  /** Lock the vault. */
  lock: () => Promise<void>;
  /** Re-check vault status (e.g. after bridge reconnect). */
  refresh: () => void;
  /** True when vault was unlocked but auto-locked mid-session. Show overlay, not full re-gate. */
  needsReauth: boolean;
};

type SessionRef = {
  sessionToken: string;
};

async function sendNativeMessage(
  hostName: string,
  message: Record<string, unknown>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendNativeMessage(hostName, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message ?? "Native messaging error"));
        } else {
          resolve(response);
        }
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function establishSession(): Promise<SessionRef> {
  const extensionId = chrome.runtime.id;
  const pairingData = await chrome.storage.local.get([BRIDGE_PAIRING_STATE_STORAGE_KEY]);
  const pairingState = parseBridgePairingState(pairingData[BRIDGE_PAIRING_STATE_STORAGE_KEY]);
  const pairingKeyMaterial = pairingState !== null ? unwrapPairingKeyMaterial(pairingState) : null;

  const session = await ensureBridgeHandshakeSession({
    hostName: HOST_NAME,
    extensionId,
    sendNativeMessage,
    resolveBridgeSharedSecret: async () => null,
    resolveBridgePairingHandle: pairingKeyMaterial !== null
      ? async () => pairingKeyMaterial.pairingHandle
      : undefined,
  });

  return { sessionToken: session.sessionToken };
}

export function useVault(): UseVaultResult {
  const [status, setStatus] = useState<VaultStatus>({ state: "connecting" });
  const sessionRef = useRef<SessionRef | null>(null);
  const mountedRef = useRef(true);
  // Tracks whether vault was unlocked then auto-locked mid-session.
  // When true, VaultGate shows an unlock overlay instead of full re-gating.
  const [needsReauth, setNeedsReauth] = useState(false);

  const sendVaultMessage = useCallback(async (message: Record<string, unknown>): Promise<Record<string, unknown>> => {
    if (sessionRef.current === null) {
      throw new Error("No bridge session. Vault not ready.");
    }
    const response = await sendNativeMessage(HOST_NAME, {
      ...message,
      sessionToken: sessionRef.current.sessionToken,
    });
    if (!isRecord(response)) {
      throw new Error("Invalid bridge response.");
    }
    // If vault became locked mid-session (auto-lock), set needsReauth overlay
    if (response["type"] === "error" && response["reasonCode"] === "vault.locked") {
      setNeedsReauth(true);
      setStatus({ state: "locked" });
    }
    if (response["type"] === "error" && response["reasonCode"] === "auth.expired") {
      // Session expired — need to re-establish
      sessionRef.current = null;
      setStatus({ state: "connecting" });
    }
    return response as Record<string, unknown>;
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const session = await establishSession();
      if (!mountedRef.current) return;
      sessionRef.current = session;

      const resp = await sendNativeMessage(HOST_NAME, {
        type: "vault.status",
        sessionToken: session.sessionToken,
      });
      if (!mountedRef.current) return;
      if (!isRecord(resp)) {
        setStatus({ state: "bridge-unavailable", error: "Invalid response from bridge." });
        return;
      }
      const vaultState = resp["state"] as string;
      if (vaultState === "uninitialized") {
        setStatus({ state: "uninitialized" });
      } else if (vaultState === "locked") {
        setStatus({ state: "locked" });
      } else if (vaultState === "unlocked") {
        setStatus({ state: "unlocked" });
      } else {
        setStatus({ state: "bridge-unavailable", error: `Unknown vault state: ${vaultState}` });
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setStatus({
        state: "bridge-unavailable",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const setup = useCallback(async (password: string) => {
    const resp = await sendVaultMessage({ type: "vault.setup", keyMode: "password", password });
    if (resp["type"] === "error") {
      throw new Error(resp["message"] as string ?? "Setup failed.");
    }
    setStatus({ state: "unlocked" });
  }, [sendVaultMessage]);

  const unlock = useCallback(async (password: string) => {
    const resp = await sendVaultMessage({ type: "vault.unlock", password });
    if (resp["type"] === "error") {
      const code = resp["reasonCode"] as string;
      if (code === "vault.locked_out") {
        // Parse seconds from message: "Too many failed attempts. Try again in N seconds."
        const match = (resp["message"] as string)?.match(/(\d+) seconds/);
        const seconds = match ? Number.parseInt(match[1], 10) : 60;
        setStatus({ state: "locked_out", secondsRemaining: seconds });
        throw new Error(resp["message"] as string);
      }
      throw new Error(resp["message"] as string ?? "Unlock failed.");
    }
    setNeedsReauth(false);
    setStatus({ state: "unlocked" });
  }, [sendVaultMessage]);

  const lock = useCallback(async () => {
    await sendVaultMessage({ type: "vault.lock" });
    setStatus({ state: "locked" });
  }, [sendVaultMessage]);

  useEffect(() => {
    mountedRef.current = true;
    void checkStatus();
    return () => { mountedRef.current = false; };
  }, [checkStatus]);

  return { status, sendVaultMessage, setup, unlock, lock, refresh: checkStatus, needsReauth };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/extension && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/ui/hooks/useVault.ts
git commit -m "feat(vault): add useVault hook for vault lifecycle management"
```

---

## Task 2: VaultSetup Component

**Files:**
- Create: `apps/extension/src/ui/components/VaultSetup.tsx`

The vault setup screen shown when vault status is `uninitialized`. Password-only for now (keychain stub not ready).

- [ ] **Step 1: Create VaultSetup component**

```tsx
// apps/extension/src/ui/components/VaultSetup.tsx
import { useState, useCallback } from "react";
import { Box, Text, TextInput, Button, Stack, PasswordInput } from "@mantine/core";
import { tokens } from "./theme.js";

export type VaultSetupProps = {
  onSetup: (password: string) => Promise<void>;
};

export function VaultSetup({ onSetup }: VaultSetupProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordsMatch = password.length > 0 && password === confirm;
  const passwordTooShort = password.length > 0 && password.length < 8;

  const handleSubmit = useCallback(async () => {
    if (!passwordsMatch || passwordTooShort) return;
    setLoading(true);
    setError(null);
    try {
      await onSetup(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
    } finally {
      setLoading(false);
    }
  }, [password, passwordsMatch, passwordTooShort, onSetup]);

  return (
    <Box
      style={{
        padding: tokens.spacing.contentHPadding,
        paddingTop: 32,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        minHeight: 400,
      }}
    >
      <Text size="xl" fw={700} style={{ color: tokens.color.textPrimary }}>
        Set up your vault
      </Text>
      <Text
        size="sm"
        style={{ color: tokens.color.textSecondary, textAlign: "center", maxWidth: 280 }}
      >
        Your credentials are encrypted with a master password. Choose something strong — the bridge never sees your password in plaintext.
      </Text>

      <Stack gap="sm" style={{ width: "100%", maxWidth: 280, marginTop: 8 }}>
        <PasswordInput
          label="Master password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          error={passwordTooShort ? "Must be at least 8 characters" : undefined}
          autoFocus
        />
        <PasswordInput
          label="Confirm password"
          placeholder="Re-enter your password"
          value={confirm}
          onChange={(e) => setConfirm(e.currentTarget.value)}
          error={confirm.length > 0 && !passwordsMatch ? "Passwords don't match" : undefined}
        />
        {error !== null && (
          <Text size="xs" style={{ color: tokens.color.danger }}>
            {error}
          </Text>
        )}
        <Button
          fullWidth
          loading={loading}
          disabled={!passwordsMatch || passwordTooShort}
          onClick={handleSubmit}
          style={{ marginTop: 8 }}
        >
          Create vault
        </Button>
      </Stack>

      <Text
        size="xs"
        style={{ color: tokens.color.textTertiary, textAlign: "center", maxWidth: 280, marginTop: "auto", paddingBottom: 16 }}
      >
        If you forget this password, you'll need to reset the vault and re-add your providers.
      </Text>
    </Box>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/extension && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/ui/components/VaultSetup.tsx
git commit -m "feat(vault): add VaultSetup component for first-time password creation"
```

---

## Task 3: VaultUnlock Component

**Files:**
- Create: `apps/extension/src/ui/components/VaultUnlock.tsx`

The unlock screen shown when vault status is `locked` or `locked_out`.

- [ ] **Step 1: Create VaultUnlock component**

```tsx
// apps/extension/src/ui/components/VaultUnlock.tsx
import { useState, useCallback, useEffect } from "react";
import { Box, Text, Button, Stack, PasswordInput } from "@mantine/core";
import { tokens } from "./theme.js";

export type VaultUnlockProps = {
  onUnlock: (password: string) => Promise<void>;
  lockedOut?: boolean;
  secondsRemaining?: number;
};

export function VaultUnlock({ onUnlock, lockedOut, secondsRemaining: initialSeconds }: VaultUnlockProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(initialSeconds ?? 0);

  useEffect(() => {
    if (!lockedOut || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedOut, countdown]);

  const handleSubmit = useCallback(async () => {
    if (password.length === 0 || (lockedOut && countdown > 0)) return;
    setLoading(true);
    setError(null);
    try {
      await onUnlock(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed.");
      setPassword("");
    } finally {
      setLoading(false);
    }
  }, [password, onUnlock, lockedOut, countdown]);

  const isDisabled = password.length === 0 || (lockedOut === true && countdown > 0);

  return (
    <Box
      style={{
        padding: tokens.spacing.contentHPadding,
        paddingTop: 48,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        minHeight: 400,
      }}
    >
      <Text size="xl" fw={700} style={{ color: tokens.color.textPrimary }}>
        Unlock your vault
      </Text>
      <Text
        size="sm"
        style={{ color: tokens.color.textSecondary, textAlign: "center", maxWidth: 280 }}
      >
        Enter your master password to access your providers and credentials.
      </Text>

      <Stack gap="sm" style={{ width: "100%", maxWidth: 280, marginTop: 8 }}>
        {lockedOut === true && countdown > 0 ? (
          <Text size="sm" style={{ color: tokens.color.warning, textAlign: "center" }}>
            Too many failed attempts. Try again in {countdown} seconds.
          </Text>
        ) : (
          <PasswordInput
            label="Master password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(); }}
            autoFocus
          />
        )}
        {error !== null && (
          <Text size="xs" style={{ color: tokens.color.danger }}>
            {error}
          </Text>
        )}
        <Button
          fullWidth
          loading={loading}
          disabled={isDisabled}
          onClick={handleSubmit}
        >
          Unlock
        </Button>
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/extension && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/ui/components/VaultUnlock.tsx
git commit -m "feat(vault): add VaultUnlock component with lockout countdown"
```

---

## Task 4: VaultGate Component

**Files:**
- Create: `apps/extension/src/ui/components/VaultGate.tsx`

Thin wrapper that shows setup/unlock/loading screens based on vault status, and renders children when unlocked. When `needsReauth` is true (vault auto-locked mid-session), shows the unlock screen as an overlay on top of the existing content to preserve UI state.

- [ ] **Step 1: Create VaultGate component**

```tsx
// apps/extension/src/ui/components/VaultGate.tsx
import type { ReactNode } from "react";
import { Box, Text, Button, Loader, Modal } from "@mantine/core";
import { tokens } from "./theme.js";
import { VaultSetup } from "./VaultSetup.js";
import { VaultUnlock } from "./VaultUnlock.js";
import type { VaultStatus } from "../hooks/useVault.js";

export type VaultGateProps = {
  status: VaultStatus;
  onSetup: (password: string) => Promise<void>;
  onUnlock: (password: string) => Promise<void>;
  onRetry: () => void;
  /** When true, vault was unlocked then auto-locked. Show unlock as overlay, not full gate. */
  needsReauth: boolean;
  children: ReactNode;
};

export function VaultGate({ status, onSetup, onUnlock, onRetry, needsReauth, children }: VaultGateProps) {
  // Auto-lock mid-session: show unlock overlay on top of existing content
  if (needsReauth && (status.state === "locked" || status.state === "locked_out")) {
    return (
      <>
        {children}
        <Modal
          opened
          onClose={() => {/* cannot dismiss — must unlock */}}
          withCloseButton={false}
          centered
          size="sm"
          overlayProps={{ backgroundOpacity: 0.7 }}
        >
          {status.state === "locked_out" ? (
            <VaultUnlock onUnlock={onUnlock} lockedOut secondsRemaining={status.secondsRemaining} />
          ) : (
            <VaultUnlock onUnlock={onUnlock} />
          )}
        </Modal>
      </>
    );
  }

  if (status.state === "connecting") {
    return (
      <Box style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400, flexDirection: "column", gap: 12 }}>
        <Loader size="sm" color={tokens.color.terracotta} />
        <Text size="sm" style={{ color: tokens.color.textSecondary }}>
          Connecting to bridge...
        </Text>
      </Box>
    );
  }

  if (status.state === "bridge-unavailable") {
    return (
      <Box style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400, flexDirection: "column", gap: 12, padding: tokens.spacing.contentHPadding }}>
        <Text size="lg" fw={600} style={{ color: tokens.color.textPrimary }}>
          Bridge not connected
        </Text>
        <Text size="sm" style={{ color: tokens.color.textSecondary, textAlign: "center", maxWidth: 280 }}>
          {status.error}
        </Text>
        <Button variant="outline" onClick={onRetry} style={{ marginTop: 8 }}>
          Retry
        </Button>
      </Box>
    );
  }

  if (status.state === "uninitialized") {
    return <VaultSetup onSetup={onSetup} />;
  }

  if (status.state === "locked") {
    return <VaultUnlock onUnlock={onUnlock} />;
  }

  if (status.state === "locked_out") {
    return (
      <VaultUnlock
        onUnlock={onUnlock}
        lockedOut
        secondsRemaining={status.secondsRemaining}
      />
    );
  }

  // state === "unlocked"
  return <>{children}</>;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/extension && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/ui/components/VaultGate.tsx
git commit -m "feat(vault): add VaultGate wrapper component"
```

---

## Task 5: Wire VaultGate into Popup

**Files:**
- Modify: `apps/extension/src/popup.tsx`

The popup must check vault status before showing any wallet UI. VaultGate wraps the existing app content.

- [ ] **Step 1: Add useVault and VaultGate to popup.tsx**

In `apps/extension/src/popup.tsx`:

**1a. Add imports** at the top:
```ts
import { useVault } from "./ui/hooks/useVault.js";
import { VaultGate } from "./ui/components/VaultGate.js";
```

**1b. In the `App` component**, add the useVault hook call near the top alongside existing hooks:
```ts
const vault = useVault();
```

**1c. Wrap the entire return** — the existing `if (view.type === "onboarding") ... if (view.type === "add-provider") ...` block should be wrapped inside VaultGate. The vault gate should be inside MantineProvider but wrap ALL view branches:

Find the existing `if (!restored) return null;` line and the main return. The structure should become:

```tsx
if (!restored) return null;

return (
  <MantineProvider theme={arlopassTheme} forceColorScheme="dark">
    <VaultGate
      status={vault.status}
      onSetup={vault.setup}
      onUnlock={vault.unlock}
      onRetry={vault.refresh}
      needsReauth={vault.needsReauth}
    >
      {/* ... existing view branches (onboarding, add-provider, connect-app, main/wallet) ... */}
    </VaultGate>
  </MantineProvider>
);
```

Note: The existing view branches that already have their own `<MantineProvider>` wrappers should be refactored to drop the inner MantineProvider since VaultGate is now always inside one. The `if (view.type === "onboarding") return (<MantineProvider>...)` pattern should become just the inner content without the redundant provider.

**1d. Pass `vault.sendVaultMessage`** to components that need it. For now, thread it through to `useWalletProviders` via React context or prop drilling. We'll create a context in the next task.

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/extension && npx tsc --noEmit`

- [ ] **Step 3: Test manually** — load the extension, verify the vault setup screen appears on first use

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/popup.tsx
git commit -m "feat(vault): wrap popup with VaultGate for vault lifecycle gating"
```

---

## Task 6: Vault Context Provider

**Files:**
- Create: `apps/extension/src/ui/hooks/VaultContext.tsx`

A React context that provides `sendVaultMessage` to child components without prop drilling.

- [ ] **Step 1: Create the context**

```tsx
// apps/extension/src/ui/hooks/VaultContext.tsx
import { createContext, useContext, type ReactNode } from "react";

export type VaultContextValue = {
  sendVaultMessage: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({
  sendVaultMessage,
  children,
}: VaultContextValue & { children: ReactNode }) {
  return (
    <VaultContext.Provider value={{ sendVaultMessage }}>
      {children}
    </VaultContext.Provider>
  );
}

export function useVaultContext(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (ctx === null) {
    throw new Error("useVaultContext must be used inside a VaultProvider.");
  }
  return ctx;
}
```

- [ ] **Step 2: Wire into popup.tsx** — wrap with `<VaultProvider sendVaultMessage={vault.sendVaultMessage}>` inside VaultGate's children (so it's only available when unlocked).

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/ui/hooks/VaultContext.tsx apps/extension/src/popup.tsx
git commit -m "feat(vault): add VaultContext for sendVaultMessage propagation"
```

---

## Task 7: Rewrite useWalletProviders to Use Vault

**Files:**
- Modify: `apps/extension/src/ui/hooks/useWalletProviders.ts`

Replace `chrome.storage.local.get("arlopass.wallet.providers.v1")` with `vault.providers.list` native message.

- [ ] **Step 1: Rewrite the hook**

The hook should:
1. Use `useVaultContext()` to get `sendVaultMessage`
2. On mount, call `vault.providers.list` to get providers
3. Map the vault response to `ProviderCardData[]` (same as current `toProviderCardData`)
4. Remove the `chrome.storage.onChanged` listener (no longer needed — vault is the source of truth)
5. Keep the `refresh()` function that re-fetches from vault

Key changes:
- Remove: `chrome.storage.local.get(["arlopass.wallet.providers.v1", ...])` 
- Remove: `normalizeWalletSnapshot` (came from chrome storage format)
- Add: `const { sendVaultMessage } = useVaultContext();`
- Add: `const resp = await sendVaultMessage({ type: "vault.providers.list" });`
- Parse `resp["providers"]` as the provider array
- The vault providers have slightly different shape (VaultProvider vs WalletProvider) — map `VaultProvider.models: string[]` to `WalletProviderModel[]` (vault stores model IDs as strings, popup needs `{ id, name }`)

Note: `vault.providers.list` returns `VaultProvider[]` which has `models: string[]` while the popup `WalletProvider` has `models: WalletProviderModel[]`. The mapping is: `models.map(id => ({ id, name: id }))`.

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/extension && npx tsc --noEmit`

- [ ] **Step 3: Test manually** — verify providers load from vault after adding one

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/ui/hooks/useWalletProviders.ts
git commit -m "feat(vault): rewrite useWalletProviders to read from vault"
```

---

## Task 8: Rewrite AddProviderWizard Save to Use Vault

**Files:**
- Modify: `apps/extension/src/ui/components/onboarding/AddProviderWizard.tsx`

The `handleSave` callback currently writes to `chrome.storage.local`. Replace with vault messages.

- [ ] **Step 1: Modify handleSave**

In `AddProviderWizard.tsx`, find the `handleSave` callback (currently around line 550-630). Replace the save logic:

**Current flow:**
1. `saveCredential(...)` → writes to `chrome.storage.local["arlopass.wallet.credentials.v1"]`
2. `chrome.storage.local.get(["arlopass.wallet.providers.v1", ...])` → reads existing
3. `chrome.storage.local.set({ "arlopass.wallet.providers.v1": [...existing, newProvider] })` → writes back

**New flow:**
1. Import `useVaultContext` and get `sendVaultMessage`
2. Generate credential ID: `const credId = "cred." + crypto.getRandomValues(new Uint8Array(12)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");`
3. Save credential: `await sendVaultMessage({ type: "vault.credentials.save", id: credId, connectorId, name, fields: config })`
4. Save provider: `await sendVaultMessage({ type: "vault.providers.save", id: providerId, name, providerType: type, connectorId, credentialId: credId, metadata: sanitized, models: testResult.models, status: "connected" })`

**Important:** The `vault.providers.save` message uses `providerType` (not `type`) to avoid collision with the message routing `type` field. This matches the bridge handler's `#handleVaultProvidersSave` which reads `message[\"providerType\"]` (see `apps/bridge/src/bridge-handler.ts`). The field maps to `VaultProvider.type` in the vault.

- [ ] **Step 2: Remove credential-storage.ts chrome.storage calls** — the `saveCredential`, `touchCredential`, `loadCredentials` functions should be replaced with vault messages or removed entirely.

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/extension && npx tsc --noEmit`

- [ ] **Step 4: Test manually** — add a provider, verify it writes to vault and appears in wallet

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/ui/components/onboarding/AddProviderWizard.tsx apps/extension/src/ui/components/onboarding/credential-storage.ts
git commit -m "feat(vault): rewrite AddProviderWizard save to use vault messages"
```

---

## Task 9: Rewrite useTokenUsage to Use Vault

**Files:**
- Modify: `apps/extension/src/ui/hooks/useTokenUsage.ts`

Replace `TokenUsageService` + `chrome.storage.local` with `vault.usage.read`.

- [ ] **Step 1: Rewrite the hook**

```ts
// apps/extension/src/ui/hooks/useTokenUsage.ts
import { useCallback, useEffect, useState } from "react";
import { useVaultContext } from "./VaultContext.js";

export type OriginUsageSummary = {
  origin: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalRequestCount: number;
};

export function useTokenUsage() {
  const { sendVaultMessage } = useVaultContext();
  const [summaries, setSummaries] = useState<OriginUsageSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await sendVaultMessage({ type: "vault.usage.read" });
      if (resp["type"] === "error") {
        console.error("Failed to load token usage:", resp["message"]);
        return;
      }
      // Aggregate totals by origin from the totals map
      const totals = (resp["totals"] ?? {}) as Record<string, { inputTokens: number; outputTokens: number; requestCount: number }>;
      const byOrigin = new Map<string, OriginUsageSummary>();
      for (const [key, val] of Object.entries(totals)) {
        const origin = key.split("\0")[0] ?? "unknown";
        const existing = byOrigin.get(origin);
        if (existing !== undefined) {
          existing.totalInputTokens += val.inputTokens;
          existing.totalOutputTokens += val.outputTokens;
          existing.totalRequestCount += val.requestCount;
        } else {
          byOrigin.set(origin, {
            origin,
            totalInputTokens: val.inputTokens,
            totalOutputTokens: val.outputTokens,
            totalRequestCount: val.requestCount,
          });
        }
      }
      // Also aggregate recent entries
      const recent = (resp["recentEntries"] ?? []) as Array<{ origin: string; inputTokens: number; outputTokens: number }>;
      for (const entry of recent) {
        const existing = byOrigin.get(entry.origin);
        if (existing !== undefined) {
          existing.totalInputTokens += entry.inputTokens;
          existing.totalOutputTokens += entry.outputTokens;
          existing.totalRequestCount += 1;
        } else {
          byOrigin.set(entry.origin, {
            origin: entry.origin,
            totalInputTokens: entry.inputTokens,
            totalOutputTokens: entry.outputTokens,
            totalRequestCount: 1,
          });
        }
      }
      setSummaries(Array.from(byOrigin.values()));
    } catch (error) {
      console.error("Failed to load token usage", error);
    } finally {
      setLoading(false);
    }
  }, [sendVaultMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  return { summaries, loading, reload: load };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/extension && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/ui/hooks/useTokenUsage.ts
git commit -m "feat(vault): rewrite useTokenUsage to read from vault"
```

---

## Task 10: Update background.ts Provider Reads/Writes

**Files:**
- Modify: `apps/extension/src/background.ts`

The background script reads providers from `chrome.storage.local` for wallet actions (set active, revoke). These need to read from vault instead. However, the background script doesn't have a persistent vault session — it uses `chrome.runtime.sendMessage` to the popup, not native messaging directly.

**Approach:** For background.ts, keep `activeProvider` and `viewState` in `chrome.storage.local` (per-browser, ephemeral per spec). For the `walletHandleRevokeProvider` action, dispatch a `vault.providers.delete` message through native messaging. The background script already has access to `chrome.runtime.sendNativeMessage`.

- [ ] **Step 1: Add vault message helper to background.ts**

Add a helper that establishes a bridge session and sends a vault message:

```ts
async function sendVaultMessageFromBackground(
  message: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Establish session via auto-pair + handshake
  const extensionId = chrome.runtime.id;
  const pairingData = await chrome.storage.local.get([BRIDGE_PAIRING_STATE_STORAGE_KEY]);
  const pairingState = parseBridgePairingState(pairingData[BRIDGE_PAIRING_STATE_STORAGE_KEY]);
  const pairingKeyMaterial = pairingState !== null ? unwrapPairingKeyMaterial(pairingState) : null;

  const session = await ensureBridgeHandshakeSession({
    hostName: "com.arlopass.bridge",
    extensionId,
    sendNativeMessage: (host, msg) => new Promise((resolve, reject) => {
      chrome.runtime.sendNativeMessage(host, msg, (resp) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(resp);
      });
    }),
    resolveBridgeSharedSecret: async () => null,
    resolveBridgePairingHandle: pairingKeyMaterial !== null
      ? async () => pairingKeyMaterial.pairingHandle
      : undefined,
  });

  const resp = await new Promise<unknown>((resolve, reject) => {
    chrome.runtime.sendNativeMessage(
      "com.arlopass.bridge",
      { ...message, sessionToken: session.sessionToken },
      (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(response);
      },
    );
  });

  if (typeof resp !== "object" || resp === null) {
    throw new Error("Invalid vault response from bridge.");
  }
  return resp as Record<string, unknown>;
}
```

- [ ] **Step 2: Update `walletHandleRevokeProvider`** to call `vault.providers.delete` instead of removing from `chrome.storage.local`.

- [ ] **Step 3: Update `walletHandleSetActiveProvider` and `walletHandleSetActiveModel`** — these only write `activeProvider` which stays in `chrome.storage.local` (per-browser preference per spec). But they currently read providers from storage to validate the ID exists. Change the validation read to `vault.providers.list`.

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/extension && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/background.ts
git commit -m "feat(vault): update background.ts wallet actions to use vault messages"
```

---

## Task 11: Remove Dead Storage Keys and Cleanup

**Files:**
- Modify: `apps/extension/src/transport/runtime.ts` — remove `WALLET_KEY_PROVIDERS` constant and any `chrome.storage.local` reads for providers
- Modify: `apps/extension/src/ui/popup-state.ts` — remove `arlopass.wallet.providers.v1` references
- Modify: `apps/extension/src/options.ts` — remove `STORAGE_KEY_PROVIDERS` if present

- [ ] **Step 1: Remove dead storage references**

Search for and remove all references to these storage keys that are no longer used:
- `arlopass.wallet.providers.v1` — now in vault
- `arlopass.wallet.credentials.v1` — now in vault  
- `arlopass.token-usage.v1` — now in vault

**Keep** these (per-browser, per spec):
- `arlopass.wallet.activeProvider.v1` — per-browser preference
- `arlopass.wallet.bridgePairing.v1` — per-browser pairing key
- `arlopass.popup.viewState.v1` — ephemeral UI state
- `arlopass.onboarding.setup` — onboarding completion flag

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/extension && npx tsc --noEmit`

- [ ] **Step 3: Run extension tests**

Run: `cd apps/extension && npx vitest run`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(vault): remove dead chrome.storage keys replaced by vault"
```

---

## Task 12: Typecheck + Lint + Full Test Suite

**Files:** All modified files

- [ ] **Step 1: Run extension typecheck**

Run: `cd apps/extension && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Run extension lint**

Run: `cd apps/extension && npm run lint`
Expected: 0 new errors

- [ ] **Step 3: Run extension tests**

Run: `cd apps/extension && npx vitest run`
Expected: All tests pass (some may need updates for removed storage keys)

- [ ] **Step 4: Run full monorepo test suite**

Run: `npm test`
Expected: All pass

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore(vault): fix lint and type errors in extension vault integration"
```

---

## Summary

| Task | Files | Description |
|---|---|---|
| 1 | useVault.ts | Vault lifecycle hook: session, status, setup, unlock |
| 2 | VaultSetup.tsx | First-time setup screen with password creation |
| 3 | VaultUnlock.tsx | Unlock screen with lockout countdown |
| 4 | VaultGate.tsx | Wrapper gating UI on vault state |
| 5 | popup.tsx (mod) | Wrap popup with VaultGate |
| 6 | VaultContext.tsx | React context for sendVaultMessage |
| 7 | useWalletProviders.ts (mod) | Read providers from vault |
| 8 | AddProviderWizard.tsx (mod) | Write providers/credentials to vault |
| 9 | useTokenUsage.ts (mod) | Read usage from vault |
| 10 | background.ts (mod) | Vault messages for wallet actions |
| 11 | Cleanup | Remove dead chrome.storage keys |
| 12 | Verification | Typecheck + lint + full test pass |

**New files:** 4 (useVault.ts, VaultSetup.tsx, VaultUnlock.tsx, VaultGate.tsx, VaultContext.tsx)
**Modified files:** ~6 (popup.tsx, useWalletProviders.ts, useTokenUsage.ts, AddProviderWizard.tsx, background.ts, credential-storage.ts)
**Removed storage keys:** 3 (providers, credentials, token-usage)
