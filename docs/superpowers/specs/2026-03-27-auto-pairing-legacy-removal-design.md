# Auto-Pairing & Legacy Secret Removal — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Scope:** Bridge (`apps/bridge/`), Extension (`apps/extension/`), Dev scripts, Docs

---

## 1. Overview

Replace the manual shared-secret-based bridge authentication with automatic pairing during onboarding. Remove all legacy shared secret code. This is a pre-release cleanup — no backwards compatibility needed.

**Three phases:**
- **Phase A:** Auto-pairing in onboarding (new `pairing.auto` message, zero-friction pairing)
- **Phase B:** Remove legacy shared secret (env var, storage keys, fallback paths)
- **Phase C:** ConnectionRegistry signing key (self-generated, persisted, independent of pairing)

**Result:** Users install the bridge, open the extension, and pairing happens automatically. No env vars, no codes, no manual steps.

---

## 2. Phase A: Auto-Pairing

### New bridge message: `pairing.auto`

An unauthenticated message type (added to `BridgeHandler.#UNAUTHENTICATED_MESSAGE_TYPES`) that combines pairing begin + complete into a single automated flow.

**Request:**
```ts
{
  type: "pairing.auto",
  extensionId: string,   // chrome.runtime.id
  hostName: string       // "com.arlopass.bridge"
}
```

**Bridge behavior (`#handlePairingAuto`):**
1. Validate `extensionId` and `hostName` are non-empty strings
2. Check if this `extensionId + hostName` already has an active pairing in `PairingManager`:
   - If yes → retrieve existing pairing handle, resolve its secret via `resolvePairingSecret`, return existing pairing info (idempotent)
3. **New method: `PairingManager.createAutoPairing(extensionId, hostName)`:**
   - Generates a random 32-byte pairing secret directly (no PAKE dance needed — both sides are local)
   - Registers the pairing with a new handle
   - Returns `{ pairingHandle, pairingKeyHex, createdAt }`
   - This is simpler than `beginPairing()` + `completePairing()` because there's no untrusted channel — the extension is already authenticated by the OS-level native messaging manifest
4. Return the result

**New PairingManager method:**
```ts
creatAutoPairing(options: {
  extensionId: string;
  hostName: string;
}): { pairingHandle: string; pairingKeyHex: string; createdAt: string }
```
This bypasses the PAKE exchange entirely. PAKE is designed for untrusted channels (e.g., user typing a code from terminal into a web page). Native messaging is already OS-authenticated — the bridge knows the caller is the real extension. A direct secret generation is both simpler and equally secure.

**Response (success):**
```ts
{
  type: "pairing.auto",
  pairingHandle: string,     // "pairh.XXXXXXXX..."
  pairingKeyHex: string,     // Derived secret for HMAC handshakes (hex)
  extensionId: string,
  hostName: string,
  createdAt: string          // ISO 8601
}
```

**Response (error):**
```ts
{
  type: "error",
  reasonCode: "request.invalid" | "pairing.failed",
  message: string
}
```

**Security:**
- Only callable via native messaging (OS enforces extension ID restriction via manifest)
- Pairing handle bound to specific `extensionId + hostName`
- Idempotent — calling twice returns the same pairing
- Extension ID validated against allowlist if configured

### Extension auto-pair flow

Runs in `BridgeCheckStep` immediately after bridge detection succeeds:

```
detectBridge() → ping succeeds
  ↓
Check chrome.storage.local for existing pairing state
  ↓
If valid pairing exists → skip (already paired)
  ↓
Send { type: "pairing.auto", extensionId, hostName }
  ↓
Receive { pairingHandle, pairingKeyHex, ... }
  ↓
Wrap pairing key with PBKDF2 + AES-256-GCM
  (using existing wrapPairingKeyMaterial from bridge-pairing.ts)
  ↓
Store wrapped state in chrome.storage.local at "arlopass.wallet.bridgePairing.v1"
  ↓
Show "✓ Bridge connected and paired"
```

User sees: "Bridge connected" — pairing is invisible.

### AddProviderWizard update

Replace `resolveBridgeSharedSecret()` (legacy) with pairing-based secret resolution:
- Read `arlopass.wallet.bridgePairing.v1` from storage
- Unwrap pairing key using `unwrapPairingKeyMaterial`
- Pass to `ensureBridgeHandshakeSession` as `resolveBridgeSharedSecret`
- Include `pairingHandle` via `resolveBridgePairingHandle`

---

## 3. Phase B: Remove Legacy Shared Secret

### Bridge removals

| File | What | Action |
|---|---|---|
| `apps/bridge/src/main.ts` | `resolveSharedSecretFromEnv()` | Delete function. Bridge no longer reads `ARLOPASS_BRIDGE_SHARED_SECRET`. |
| `apps/bridge/src/main.ts` | `deriveConnectionRegistrySigningKey(sharedSecret)` | Replace (see Phase C). |
| `apps/bridge/src/main.ts` | `sharedSecret` variable + Buffer validation | Remove. |
| `apps/bridge/src/bridge-handler.ts` | `#sharedSecret: Buffer` field | Remove. |
| `apps/bridge/src/bridge-handler.ts` | Constructor `sharedSecret` option | Remove from `BridgeHandlerOptions`. |
| `apps/bridge/src/bridge-handler.ts` | `#handleHandshakeVerify` fallback to shared secret | Remove fallback. If no `pairingHandle` in verify request → return `{ type: "error", reasonCode: "auth.required", message: "This bridge requires pairing. Send pairing.auto first." }` |
| `apps/bridge/src/bridge-handler.ts` | `#cloudConnectionCompleteIdempotencyNamespace` derived from shared secret | Derive from ConnectionRegistry signing key instead (same source as Phase C). |

**New handshake.verify behavior:**
```
handshake.verify received
  → pairingHandle field present?
    → YES: resolve via PairingManager → verify HMAC → issue session
    → NO: return { type: "error", reasonCode: "auth.required", 
            message: "This bridge requires pairing. Send pairing.auto first." }
```

Explicitly: lines 500-545 of bridge-handler.ts change from `let handshakeSecret = this.#sharedSecret` with pairing override, to a strict check that requires `pairingHandle` + `hostName` on every verify request. No fallback path.

**`#UNAUTHENTICATED_MESSAGE_TYPES` update:**
Add `"pairing.auto"` to the set alongside `handshake.challenge`, `handshake.verify`, `pairing.begin`, `pairing.complete`. Also add a `case "pairing.auto"` to the `#dispatch` switch statement.

### Extension removals

| File | What | Action |
|---|---|---|
| `src/transport/runtime.ts` | `WALLET_KEY_BRIDGE_SHARED_SECRET` constant | Delete. |
| `src/transport/runtime.ts` | Fallback path in `resolveBridgeSharedSecret` (line ~2692) | Remove. Only return pairing-derived key. If no pairing → return undefined. |
| `src/options.ts` | `STORAGE_KEY_BRIDGE_SHARED_SECRET` constant | Delete. |
| `src/options.ts` | `clearLegacyBridgeSharedSecret()` function + call site | Delete entirely. |
| `src/ui/components/onboarding/AddProviderWizard.tsx` | `WALLET_KEY_BRIDGE_SHARED_SECRET`, `resolveBridgeSharedSecret()` | Replace with pairing-based resolution. |

### Dev script removals

| File | What | Action |
|---|---|---|
| `scripts/dev/run-dev.ps1` | Secret generation, `ARLOPASS_BRIDGE_SHARED_SECRET` env var setup | Remove. Dev startup no longer needs a secret. |
| `scripts/dev/native-host/*.cmd` | `ARLOPASS_BRIDGE_SHARED_SECRET_PATH` reading | Remove. |

### Test updates

All tests that mock `WALLET_KEY_BRIDGE_SHARED_SECRET` → update to use pairing state fixtures instead:
- `apps/extension/src/__tests__/transport-runtime.test.ts`
- `apps/bridge/src/__tests__/bridge-handler-cloud.test.ts`
- `apps/bridge/src/__tests__/bridge-handler-pairing.test.ts`

Bridge tests that pass `sharedSecret` to `BridgeHandler` constructor → update to use `PairingManager` with pre-seeded pairings.

### Documentation updates

- `README.md` — Remove "Generate shared secret" section. Add "Pairing happens automatically" note.
- `RUNNING_AND_USAGE_GUIDE.md` — Remove secret setup. Simplify to: install bridge → open extension → done.

---

## 4. Phase C: ConnectionRegistry Signing Key

### Problem

`ConnectionRegistry` currently uses `deriveConnectionRegistrySigningKey(sharedSecret)` (SHA256 of env var). With the env var gone, it needs a new source.

### Solution

Bridge generates and persists its own random 32-byte signing key on first startup. Independent of any extension pairing.

```ts
// First startup (no existing state):
const signingKey = crypto.randomBytes(32);
persistToStateFile(signingKey);

// Subsequent startups:
const signingKey = loadFromStateFile();
```

### State file

Location:
- Linux/macOS: `~/.local/share/arlopass-bridge/state.json`
- Windows: `%LOCALAPPDATA%\Arlopass\state.json`

Structure:
```json
{
  "version": 1,
  "signingKey": "aabbccdd...",
  "createdAt": "2026-03-27T..."
}
```

The signing key persists across restarts. If the state file is deleted, a new key is generated and all existing cloud connection signatures become invalid (user must re-add cloud providers). This is acceptable for pre-release.

**Idempotency namespace:** `deriveCloudConnectionCompleteIdempotencyNamespace()` currently takes `sharedSecret`. After Phase C, it takes the `signingKey` from the state file instead. Same derivation function, different input.

### Why independent of pairing?

Cloud connection metadata is a bridge-internal concern. If the extension re-pairs (e.g., after reinstall), cloud connections should remain valid. Tying the signing key to pairing would break cloud connections on re-pair.

---

## 5. File Changes Summary

### New files

| File | Purpose |
|---|---|
| `apps/bridge/src/state/bridge-state.ts` | State file read/write (signing key, created timestamp) |

### Test fixture strategy

**Bridge tests:** Create a `test-helpers/pairing-fixtures.ts` that:
- Pre-seeds a `PairingManager` with a known pairing (extensionId + hostName + secret)
- Returns the `pairingHandle` and `pairingKeyHex` for assertions
- Replaces all `BridgeHandler({ sharedSecret })` instantiations

**Extension tests:** Create a storage fixture that:
- Populates `arlopass.wallet.bridgePairing.v1` with a wrapped pairing state
- Uses a known test password for unwrapping
- Replaces all `WALLET_KEY_BRIDGE_SHARED_SECRET` mock storage setups

**Handshake tests (`bridge-handshake.test.ts`):**
- Keep `resolveBridgeSharedSecret` mock pattern — it still exists, just returns pairing key instead of legacy secret
- Add `resolveBridgePairingHandle` mock alongside

### Modified files

| File | Changes |
|---|---|
| `apps/bridge/src/main.ts` | Remove env var parsing. Load signing key from state. Remove sharedSecret. |
| `apps/bridge/src/bridge-handler.ts` | Add `#handlePairingAuto`. Remove `#sharedSecret`. Require pairing in handshake.verify. |
| `apps/extension/src/ui/components/onboarding/BridgeCheckStep.tsx` | Add auto-pair after detection. |
| `apps/extension/src/ui/components/onboarding/setup-state.ts` | Add `autoPair()` function. |
| `apps/extension/src/ui/components/onboarding/AddProviderWizard.tsx` | Use pairing-based secret resolution. |
| `apps/extension/src/transport/runtime.ts` | Remove legacy fallback. |
| `apps/extension/src/options.ts` | Remove legacy secret functions. |
| `scripts/dev/run-dev.ps1` | Remove secret generation. |
| `scripts/dev/native-host/*.cmd` | Remove secret path reading. |
| Tests (multiple) | Update to pairing fixtures. |
| `README.md`, `RUNNING_AND_USAGE_GUIDE.md` | Remove secret docs. |

---

## 6. Decisions Record

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Auto-pairing method | File-based handoff via `pairing.auto` message | Zero user friction — bridge returns pairing key directly |
| 2 | Legacy removal | Complete removal, no backwards compat | Pre-release app, clean slate |
| 3 | ConnectionRegistry signing | Self-generated random key, persisted to state file | Independent of pairing — survives re-pair |
| 4 | `pairing.auto` auth | Unauthenticated (like `pairing.begin`) | OS-level native messaging manifest is the gate |
| 5 | Idempotency | `pairing.auto` returns existing pairing if already paired | Safe to call multiple times |
