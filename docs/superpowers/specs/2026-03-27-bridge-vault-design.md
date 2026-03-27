# Bridge Encrypted Vault — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Scope:** Bridge (`apps/bridge/`), Extension (`apps/extension/`)

---

## 1. Overview

Move all user state (credentials, providers, app connections, token usage) from per-browser `chrome.storage.local` to a centralized encrypted vault on the bridge. Extensions become thin clients that read/write state via `vault.*` native messages.

**Goals:**
- Cross-browser state sharing — set up once, use everywhere
- Credentials encrypted at rest with AES-256-GCM
- Master password (primary) or OS keychain (convenience fallback)
- Token usage: recent entries (last 30 days) with timestamps + compacted additive totals for older data
- Usage flushed from extension on browser close, additive merge at bridge

---

## 2. Architecture

```
┌──────────────┐     ┌──────────────┐
│    Chrome     │     │     Edge     │
│  Extension    │     │  Extension   │
│  (thin client)│     │ (thin client)│
└──────┬───────┘     └──────┬───────┘
       │ native msg          │ native msg
       └──────┬──────────────┘
              │
   ┌──────────▼──────────┐
   │       Bridge        │
   │                     │
   │  vault.encrypted    │  ← AES-256-GCM
   │  ├── credentials    │
   │  ├── providers      │
   │  ├── app connections│
   │  └── token usage    │
   │                     │
   │  Master key from:   │
   │  ├── Password (PBKDF2 210K)
   │  └── OS Keychain (optional)
   └─────────────────────┘
```

### Data location split

| Data | Location | Rationale |
|---|---|---|
| Credentials | Bridge vault | Cross-browser |
| Providers | Bridge vault | Cross-browser |
| App connections | Bridge vault | Cross-browser |
| Token usage | Bridge vault (flushed on close) | Cross-browser aggregate |
| Active provider selection | `chrome.storage.local` | Per-browser preference |
| Bridge pairing state | `chrome.storage.local` | Per-browser pairing key |
| Pending connection request | `chrome.storage.local` | Ephemeral UI state |
| Connection result | `chrome.storage.local` | Ephemeral |
| UI last error | `chrome.storage.local` | Ephemeral |
| Popup view state | `chrome.storage.session` | Per-browser session |

---

## 3. Vault Storage Format

### Plaintext structure

```ts
type Vault = {
  version: 1;
  credentials: VaultCredential[];
  providers: VaultProvider[];
  appConnections: VaultAppConnection[];
  usage: VaultUsage;
};

type VaultCredential = {
  id: string;                     // "cred.<random>"
  connectorId: string;            // "anthropic", "openai", etc.
  name: string;                   // "My Anthropic Key"
  fields: Record<string, string>; // { apiKey: "sk-ant-..." }
  createdAt: string;              // ISO 8601
  lastUsedAt: string;
};

type VaultProvider = {
  id: string;
  name: string;
  type: "local" | "cloud" | "cli";
  connectorId: string;
  credentialId: string;           // References VaultCredential.id
  metadata: Record<string, string>;
  models: string[];
  status: string;
  createdAt: string;
};

type VaultAppConnection = {
  id: string;                     // "app.<origin-hash>"
  origin: string;
  displayName: string;
  approvedProviders: string[];
  approvedModels: string[];
  permissions: Record<string, unknown>;
  rules: Record<string, unknown>;
  limits: Record<string, unknown>;
  createdAt: string;
  lastUsedAt: string;
};

type VaultUsage = {
  recentEntries: UsageEntry[];    // Last 30 days, full detail
  totals: Record<string, UsageTotals>; // key: "origin\0providerId\0modelId"
};

type UsageEntry = {
  origin: string;
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  timestamp: string;
};

type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  lastUpdated: string;
};
```

### Encrypted file format

```
vault.encrypted:
┌──────────────────────────────────┐
│  Header (plaintext)              │
│  ├── magic: "ARLO" (4 bytes)   │
│  ├── version: 1 (1 byte)       │
│  ├── keyMode: 0=password,      │
│  │            1=keychain (1 byte)│
│  ├── salt: 32 bytes (PBKDF2)   │
│  ├── iv: 12 bytes (GCM nonce)  │
│  ├── reserved: 14 bytes        │
├──────────────────────────────────┤
│  Ciphertext (AES-256-GCM)       │
│  └── encrypted vault JSON       │
│       + 16-byte auth tag        │
└──────────────────────────────────┘
```

### Key derivation

**Password mode:**
```
salt = random 32 bytes, generated ONCE at vault.setup, stored permanently in header
key = PBKDF2(password, salt, iterations=210000, keyLength=32, hash=SHA-256)
```
The salt NEVER changes after initial creation. The IV is freshly randomized on every write. The key derivation is deterministic given the same password + salt.

**OS keychain mode:**
```
key = random 32 bytes, stored in:
  - Windows: Credential Manager (target: "Arlopass Bridge Vault")
  - macOS: Keychain Services (service: "com.arlopass.bridge", account: "vault-key")
  - Linux: Secret Service via libsecret (schema: "com.arlopass.bridge.vault")
```

---

## 4. Bridge Vault API

All `vault.*` messages require authenticated session. Vault must be unlocked for CRUD operations.

### Setup & Lock/Unlock

| Message | Purpose |
|---|---|
| `vault.status` | Check state: uninitialized / locked / unlocked |
| `vault.setup` | First-time creation (keyMode + optional password) |
| `vault.unlock` | Unlock with password or keychain |
| `vault.lock` | Re-encrypt and lock |

### Credentials

| Message | Purpose |
|---|---|
| `vault.credentials.list` | List credentials (fields REDACTED) |
| `vault.credentials.get` | Get single credential with full fields |
| `vault.credentials.save` | Upsert credential |
| `vault.credentials.delete` | Delete credential |

### Providers

| Message | Purpose |
|---|---|
| `vault.providers.list` | List all providers |
| `vault.providers.save` | Upsert provider |
| `vault.providers.delete` | Delete provider |

### App Connections

| Message | Purpose |
|---|---|
| `vault.apps.list` | List all app connections |
| `vault.apps.save` | Upsert app connection |
| `vault.apps.delete` | Delete app connection |

### Token Usage

| Message | Purpose |
|---|---|
| `vault.usage.read` | Get totals + recent entries |
| `vault.usage.flush` | Append session deltas (additive merge for totals, append for recent entries) |

### Error responses

| Condition | reasonCode | Message |
|---|---|---|
| Vault not initialized | `vault.uninitialized` | Vault not set up. Send vault.setup first. |
| Vault locked | `vault.locked` | Vault is locked. Send vault.unlock first. |
| Wrong password | `auth.invalid` | Incorrect password. |
| Locked out (brute force) | `vault.locked_out` | Too many failed attempts. Try again in {N} seconds. |
| Vault file corrupted | `vault.corrupted` | Vault file is corrupted or tampered. Re-setup required. |
| Disk full / write failed | `vault.write_failed` | Failed to write vault to disk. Check disk space and permissions. |
| File permission denied | `vault.inaccessible` | Cannot read/write vault file. Check file permissions. |
| OS keychain unavailable | `vault.keychain_unavailable` | OS credential store is unavailable. Switch to password mode. |
| Invalid request fields | `request.invalid` | {field} is required / invalid. |
| Credential not found | `vault.not_found` | Credential/provider/app with ID {id} not found. |

### Concurrent access

The bridge is a single process serving all browsers. All vault operations are serialized in-memory (single-threaded Node.js). File writes are atomic (tmp + rename). There is no concurrent access problem — the bridge is the sole writer.

---

## 5. Token Usage Merge Strategy

**Additive merge for totals.** No deduplication for timestamps — if two browsers used tokens at the same time, both entries are kept.

**Extension flow:**
1. On connect: `vault.usage.read` → get baseline totals + recent entries
2. During session: accumulate deltas in memory as `UsageEntry[]`
3. On browser close (or every 5 min): `vault.usage.flush({ entries })` → bridge appends entries
4. Bridge compaction: entries older than 30 days → additive merge into `totals`, remove from `recentEntries`

**Compaction algorithm:**

For each entry in `recentEntries` older than 30 days:
1. Compute key: `"${entry.origin}\0${entry.providerId}\0${entry.modelId}"`
2. If key exists in `totals`: add `entry.inputTokens` to `totals[key].inputTokens`, add `entry.outputTokens` to `totals[key].outputTokens`, increment `totals[key].requestCount` by 1, set `totals[key].lastUpdated` to current time
3. If key doesn't exist: create `{ inputTokens: entry.inputTokens, outputTokens: entry.outputTokens, requestCount: 1, lastUpdated: now }`
4. Remove entry from `recentEntries`

Each `UsageEntry` counts as 1 request. `lastUpdated` is always set to the time compaction runs (current time), not the entry timestamp.

**Compaction runs on:**
- Every `vault.usage.flush` call
- Bridge startup

---

## 6. Extension Changes

### Startup flow

```
Extension opens
  → auto-pair + handshake (existing) — must complete before vault calls
  → vault.status
    → ERROR (bridge unreachable / timeout) → show "Bridge not connected" with retry button
    → "uninitialized" → vault setup screen
    → "locked" → unlock screen
      → keychain mode: auto-unlock, show spinner (5s timeout)
        → keychain timeout or access denied → fall back to password prompt with note: "Keychain unavailable"
      → password mode: show password input
      → wrong password → show error, allow retry (brute force protection on bridge side)
      → locked out → show "Too many attempts" with countdown timer
    → "unlocked" → load data
  → vault.providers.list → wallet UI
  → vault.apps.list → app connections
  → vault.usage.read → token usage display
  → If vault becomes locked during use (auto-lock timer): extension detects vault.locked
    error on next operation → show unlock screen overlay
```

**Partial initialization recovery:** `vault.setup` is atomic — if it fails mid-way, no file is created (write is tmp + rename). The vault stays in `uninitialized` state. User can retry.

**Session integrity:** vault.unlock does NOT require re-authentication (session token is independent of vault lock state). The authenticated session persists; only vault data access is gated.

**Bridge restart recovery:** If the bridge process crashes/restarts, all sessions are lost (in-memory). The extension will receive an error on the next `vault.*` call, triggering re-handshake via auto-pair. After re-handshake, the vault will be in `locked` state (encrypted on disk), requiring `vault.unlock` again. This is the existing session lifecycle — not vault-specific.

### App connection auto-use

When a website requests access and the bridge already has an approved `VaultAppConnection` for that origin, the extension skips the approval wizard and uses the existing connection. Wizard only shows for new/unknown origins.

### New UI screens

- **Vault Setup** — choose master password or OS keychain. Shown once on first use.
- **Vault Unlock** — enter master password (password mode) or auto-unlock spinner (keychain mode). Shown when vault is locked.

---

## 7. Security Model

### Encryption

### Encryption details

- AES-256-GCM for vault encryption
- PBKDF2 with 210,000 iterations (OWASP 2024 recommendation) for password mode
- Random 32-byte key stored in OS keychain for keychain mode
- **Salt:** generated once at `vault.setup`, stored permanently in file header, never regenerated
- **IV:** fresh random 12 bytes on every write (required for GCM security)
- Password mode key derivation: `PBKDF2(password, stored_salt, 210K, 32, SHA-256)`

### Secure memory handling

- Plaintext vault held in memory only while unlocked
- `secureWipe()` utility: zero-fill all key material and plaintext buffers before dereferencing
- `vault.lock` wipes all in-memory state

### Brute force protection

- Track failed **password-mode** `vault.unlock` attempts **persisted to disk** in `vault-lockout.json` (not in-memory — survives bridge restarts)
- Keychain failures are NOT counted as brute force attempts (they are infrastructure errors, not auth failures)
- Structure: `{ failedAttempts: number, lastFailedAt: string, lockedUntil: string | null }`
- After 5 failures: 30 second delay before next attempt allowed
- After 10 failures: 5 minute delay
- After 20 failures: 30 minute delay
- Resets only after successful unlock (NOT on bridge restart)
- Lockout file checked on every `vault.unlock` — if `lockedUntil` is in the future, reject immediately with `vault.locked_out` error
- Lockout file is plaintext (not sensitive — only contains counts and timestamps)

### Auto-lock

- Timer resets on every `vault.*` message (rate-limited: max 1 reset per 10 seconds to prevent keep-alive abuse)
- Default timeout: 30 minutes of inactivity
- On expiry: re-encrypt vault to disk, wipe memory, set state to locked
- Configurable via `ARLOPASS_VAULT_AUTO_LOCK_MS` environment variable
- If auto-lock fires during an in-flight mutation: the mutation completes atomically first, then lock triggers (lock is checked at RPC entry, not mid-operation)

### Atomic writes

Every vault mutation:
1. Modify in-memory plaintext
2. Re-encrypt entire vault
3. Write to `vault.encrypted.tmp` (using `fs.writeFileSync` which flushes to disk)
4. `fs.renameSync(vault.encrypted.tmp, vault.encrypted)` — atomic on all OSes

Since all vault operations are serialized in the single-threaded Node.js event loop, no concurrent reads can occur during a write. The bridge never reads from disk while unlocked — it serves from the in-memory plaintext copy.

### Credential redaction

`vault.credentials.list` returns only `{ id, connectorId, name, createdAt, lastUsedAt }`. Full `fields` (containing API keys) only returned via `vault.credentials.get` with a specific `credentialId`.

### File format versioning

The `version` byte in the header identifies the encryption format, not the vault schema. If the format changes:
- v1 code encountering a v2 file: returns `vault.corrupted` with message "Vault format version 2 is not supported by this bridge. Please update."
- v2 code encountering a v1 file: auto-upgrades by decrypting with v1 logic, re-encrypting with v2 format, backing up original to `vault.encrypted.v1.bak`
- `keyMode` byte (0=password, 1=keychain) has 254 unused values for future auth methods

### Existing defenses (no new work)

- **Native messaging manifest** — restricts which extension IDs can connect to the bridge
- **HMAC handshake** — authenticates every session via pairing-derived secrets
- **Session tokens** — all `vault.*` messages require authenticated `sessionToken`

---

## 8. File Structure

### New bridge files

```
apps/bridge/src/vault/
  ├── vault-types.ts              # Vault, VaultCredential, etc.
  ├── vault-encryption.ts         # AES-256-GCM encrypt/decrypt, PBKDF2 key derivation
  ├── vault-store.ts              # VaultStore class — CRUD operations, auto-lock, persistence
  ├── vault-keychain.ts           # OS keychain integration (Windows/macOS/Linux)
  ├── vault-lockout.ts            # Brute force protection
  ├── vault-compaction.ts         # Usage entry compaction (30-day window)
  └── secure-wipe.ts              # Zero-fill buffers
```

### Modified bridge files

```
apps/bridge/src/bridge-handler.ts # Add vault.* message routing
apps/bridge/src/main.ts           # Initialize VaultStore on startup
```

### Modified extension files

```
apps/extension/src/popup.tsx                      # Vault status check on mount
apps/extension/src/ui/hooks/useWalletProviders.ts # Read from vault.providers.list
apps/extension/src/ui/components/onboarding/      # Vault setup + unlock screens
apps/extension/src/ui/components/WalletPopup.tsx   # Pass through vault data
apps/extension/src/transport/runtime.ts            # Remove chrome.storage reads for providers/credentials
```

### Removed extension storage

These `chrome.storage.local` keys are eliminated entirely:
- `arlopass.wallet.providers.v1`
- `arlopass.wallet.credentials.v1`
- `arlopass.token-usage.v1`

---

## 9. Decisions Record

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Encryption model | Master password + optional OS keychain | Password is strongest; keychain is zero-friction fallback |
| 2 | Data scope | Credentials + providers + app connections + token usage | Full wallet sync minus per-browser ephemeral state |
| 3 | Usage merge | Additive totals + append timestamped entries | No dedup needed; both browsers' entries are valid |
| 4 | Recent window | 30 days detailed, older compacted to totals | Keeps file size bounded while preserving analysis data |
| 5 | API style | Dedicated vault.* message types | Follows existing bridge handler pattern |
| 6 | Migration | None | Pre-release, no legacy users |
| 7 | Auto-lock | 30 min inactivity timeout | Balances security with usability |
| 8 | Brute force | Exponential delay after 5/10 failures | Prevents offline brute force without permanent lockout |
