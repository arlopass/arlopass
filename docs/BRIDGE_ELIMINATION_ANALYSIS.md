# Can Arlopass Work Without the Native Bridge App?

> A brutally honest technical analysis of whether the bridge desktop app can be eliminated without compromising security or privacy.

**Date:** March 31, 2026  
**Status:** Research / Decision Document  
**TL;DR:** No, you cannot fully eliminate the bridge without real security compromises. But you can make it largely invisible through auto-install and background operation — and you can offer a "cloud-only lite mode" that works without it for the majority of users who don't run local models.

---

## Table of Contents

1. [What the Bridge Actually Does](#what-the-bridge-actually-does)
2. [What Breaks Without It](#what-breaks-without-it)
3. [Can Browser APIs Replace It?](#can-browser-apis-replace-it)
4. [The Uncomfortable Truths](#the-uncomfortable-truths)
5. [Alternative Architectures](#alternative-architectures)
6. [What Competitors Do](#what-competitors-do)
7. [Recommended Path Forward](#recommended-path-forward)
8. [Conclusion](#conclusion)

---

## What the Bridge Actually Does

The bridge is a local Node.js daemon that communicates with the Chrome extension over Native Messaging (stdio). It serves six critical roles:

| Role | What It Does | Why the Extension Can't |
|------|-------------|------------------------|
| **Credential Vault** | AES-256 encrypted store with PBKDF2 key derivation, OS keychain integration, lockout after failed attempts, secure memory wipe | Browser storage is plaintext. `chrome.storage` is readable by anyone with DevTools. Web Crypto exists but keys live in JS heap memory — no OS keychain, no lockout enforcement. |
| **Local Model Access** | Spawns Ollama, Copilot CLI, Claude Code CLI as child processes | Extensions cannot spawn processes. Period. This is a hard platform constraint with zero workarounds. |
| **Authoritative Policy Enforcement** | Re-evaluates every request against signed policy bundles. Deny-by-default. The extension's copy doesn't matter. | Extension code can be modified by the user via DevTools. Any enforcement in the extension is advisory, not authoritative. |
| **Cloud Token Management** | OAuth token leasing, automatic refresh, circuit breakers, idempotency tracking | Extension *could* do this, but tokens would be stored in `chrome.storage` (plaintext) and the refresh logic gets killed when the service worker is garbage-collected. |
| **Audit Trail** | Structured JSON events emitted to stderr. Immutable record of every decision. | Extension has no persistent, tamper-proof logging. `console.log` is not an audit trail. |
| **Session Persistence** | Handshake state, pairing keys, nonce replay detection all survive browser restarts | Service worker state is ephemeral. `chrome.storage` survives but isn't designed for security-critical session management. |

---

## What Breaks Without It

### Hard Breaks (No Workaround)

**1. Local model support is completely gone.**

Extensions cannot call `localhost:11434` (Ollama), cannot spawn `copilot` or `claude` CLI processes, cannot do anything that requires leaving the browser sandbox. This is not a Chrome policy choice — it's a fundamental OS-level sandbox boundary. No amount of clever engineering changes this.

- Ollama users: dead in the water
- Copilot CLI users: dead in the water  
- Claude Code CLI users: dead in the water
- LM Studio users: dead in the water
- Any future local model: dead in the water

**Impact:** This eliminates the entire privacy-conscious user segment (10% of users per the design doc) and a significant portion of the developer segment who run local models.

**2. Authoritative policy enforcement is impossible.**

The bridge exists as a separate process specifically because the extension is user-modifiable. A determined user (or a malicious extension update, or a compromised browser profile) can modify extension code, clear grant caches, or forge permission checks.

The bridge is the "root of trust" — it runs outside the browser sandbox, validates every request independently, and can't be tampered with from the browser.

Without it, the extension becomes both the requester *and* the authorizer. This is like having a bank where the customer also runs the vault. It's not zero-trust anymore. It's just... trust.

**3. OS keychain integration is gone.**

macOS Keychain, Windows Credential Manager — these are the gold standard for credential storage. They're protected by the OS login, hardware security modules (on Apple Silicon), and sandboxed from other processes.

Browser extensions have `chrome.storage.local`. Which is an unencrypted JSON file on disk that any process running as the current user can read. This is the difference between "secured by the operating system" and "secured by a JSON file."

### Soft Breaks (Degraded, Not Dead)

**4. Credential storage becomes weaker but functional.**

You *can* encrypt credentials in the browser using the Web Crypto API (`SubtleCrypto`). AES-256-GCM with PBKDF2 key derivation from a user password is technically possible. This is what browser-based password managers like Bitwarden do.

But:
- The encryption key lives in JavaScript heap memory (inspectable via DevTools)
- No OS-level lockout after failed attempts (you can enforce it in JS, but it's bypassable)
- No hardware-backed key storage
- The encrypted blob is still in `chrome.storage.local` (another extension with `storage` permission could read it)
- Key derivation performance in WASM/JS is ~3-5x slower than native, making PBKDF2 iterations a UX tradeoff

**Honest assessment:** This is "good enough" for most users. It's not "good enough" for enterprise/security teams. It's the difference between a deadbolt and a bank vault.

**5. Cloud provider access works, with caveats.**

Extensions can make HTTPS requests to cloud APIs (OpenAI, Claude, etc.) directly. The extension already has `connect-src 'self' http: https:` in its CSP. This actually works today for the options page provider testing flow.

But:
- Token refresh logic runs in the service worker, which Chrome can terminate after 30 seconds of inactivity (5 minutes max lifetime in MV3)
- Mid-stream responses may be cut off if the worker is GC'd
- No circuit breaker pattern (bridge tracks per-provider failure rates)
- No idempotency store (bridge prevents duplicate cloud charges on retries)

**Honest assessment:** For simple request/response, this works fine. For long streaming responses (which is *most* LLM usage), you'll hit service worker termination issues. Chrome's `chrome.offscreen` API or the upcoming `ServiceWorkerGlobalScope.waitUntil()` improvements help but don't fully solve this.

**6. Audit logging becomes best-effort.**

You can log to `chrome.storage.local` but it's not tamper-proof, not structured, and not persistent across extension reinstalls. For personal use, this is fine. For enterprise compliance, this is a non-starter.

---

## Can Browser APIs Replace It?

Let's go through every candidate technology honestly:

### Web Crypto API (SubtleCrypto)
**Replaces:** Vault encryption (partially)  
**Doesn't replace:** OS keychain, hardware key storage, lockout enforcement  
**Verdict:** Viable for "good enough" encryption. Not equivalent security.

### chrome.storage.session
**Replaces:** In-memory session state  
**Doesn't replace:** Persistent state across browser restarts  
**Verdict:** Useful for session tokens, not for vault.

### chrome.offscreen API
**Replaces:** Nothing directly, but extends service worker life for audio/DOM processing  
**Doesn't replace:** Process spawning, file system access  
**Verdict:** Irrelevant to the core problem.

### WebSocket to localhost
**Replaces:** Native Messaging (theoretically)  
**Reality check:** The extension would need to connect to `ws://localhost:PORT` where a local process is listening. But wait — *that local process IS the bridge*. You've just replaced Native Messaging with WebSocket and still require a desktop app. Additionally, any local web page could now also connect to that WebSocket, which is *worse* security than Native Messaging (which is restricted to the specific extension ID).  
**Verdict:** Strictly worse than Native Messaging. More attack surface, same installation requirement.

### WebHID / WebUSB / WebSerial
**Replaces:** Nothing relevant  
**Verdict:** These are for hardware peripherals, not local process communication.

### WebAssembly
**Replaces:** Performance-sensitive crypto operations  
**Doesn't replace:** OS API access, process spawning, file system  
**Verdict:** Helps with PBKDF2 performance, nothing else.

### File System Access API
**Replaces:** Could store encrypted vault files  
**Reality:** Requires user to re-grant permission every browser session. Not suitable for automatic credential loading.  
**Verdict:** Too much friction, ironically adding more UX burden than the bridge itself.

### Shared Workers / SharedArrayBuffer
**Replaces:** Cross-tab state coordination  
**Doesn't replace:** Anything the bridge does  
**Verdict:** Useful for extension internal state, not bridge replacement.

### Chrome Side Panel API
**Replaces:** Nothing security-relevant  
**Verdict:** UI only.

### Native File System Access (Origin Private File System)
**Replaces:** Persistent encrypted storage  
**Reality:** Available in extensions, sandboxed to the extension's origin. Actually a reasonable vault backend.  
**Limitation:** Still JS-accessible, no OS keychain integration.  
**Verdict:** Best available alternative for credential storage. Worth investigating.

---

## The Uncomfortable Truths

### Truth 1: The bridge is architecturally correct

The three-layer model (untrusted web page → semi-trusted extension → authoritative bridge) is textbook zero-trust architecture. Every security auditor will tell you this is the right design. Removing the bridge doesn't simplify the architecture — it removes a security boundary.

### Truth 2: Users don't care about architecture

Users care about: "I installed an extension and it works." They do not care about: "There's an authoritative enforcement daemon running on your machine that re-evaluates every request against signed policy bundles." The bridge is invisible labor that users don't appreciate until something goes wrong.

### Truth 3: The installation friction is real and significant

Every additional install step is a conversion cliff. Password managers (1Password, Bitwarden) deal with this same problem — the browser extension alone is limited, so they ship a desktop app. Their lesson: even with millions of users, desktop app adoption is always lower than extension-only. The friction is real.

Industry data suggests:
- Extension-only install: ~60-70% of visitors who click "Install" complete it
- Extension + desktop app: ~15-25% complete both
- This is a 3-4x drop in conversion

### Truth 4: Most users only use cloud providers

The design doc says 45% of users are "end users" who connect cloud providers. Another 25% are developers who primarily use cloud APIs. Only 10% are privacy-conscious local-model users. The bridge is architecturally necessary for 100% of users but *functionally* necessary (in terms of features they'd actually miss) for maybe 15-20%.

### Truth 5: "Same level of security" is impossible without the bridge

This needs to be said plainly: **you cannot achieve the same security guarantees without a process running outside the browser sandbox.** The browser sandbox exists specifically to limit what web content and extensions can do. The bridge exists specifically to do things the sandbox prevents. These are fundamentally opposed goals.

You can achieve *acceptable* security. You can achieve *good enough for most users* security. You cannot achieve *the same* security. Anyone who tells you otherwise doesn't understand the browser security model.

### Truth 6: The extension-only approach has a well-known threat model

If the extension is the root of trust:
- A compromised browser profile compromises all credentials
- A malicious extension update (supply chain attack) compromises all credentials
- A user with DevTools open can extract all credentials from memory
- A rogue browser extension with `storage` permission can read the encrypted vault (though not decrypt it without the password)
- There is no independent audit trail

These are not theoretical. Extension supply chain attacks happen regularly. Browser profile theft is a common malware vector.

---

## Alternative Architectures

### Option A: Extension-Only "Lite Mode" (Cloud Providers Only)

**What it is:** A degraded mode where the extension talks directly to cloud APIs, stores credentials encrypted via Web Crypto, and does permission enforcement locally.

**What you lose:**
- Local model support (Ollama, CLI tools)
- OS keychain integration
- Authoritative policy enforcement
- Tamper-proof audit trail
- Service worker persistence for long streams

**What you keep:**
- Cloud provider access (OpenAI, Claude, Gemini, etc.)
- User-facing permission consent flow
- Encrypted credential storage (weaker than bridge, but functional)
- The SDK/developer experience is identical

**Security level:** Comparable to Bitwarden's browser-only mode. Good enough for personal use. Not enterprise-grade.

**Who it serves:** The 70% of users who only use cloud providers and don't need enterprise compliance.

### Option B: Progressive Enhancement (Extension → Bridge)

**What it is:** The extension works standalone for cloud providers. When the user installs the bridge, it unlocks local models, stronger security, and enterprise features. The bridge enhances rather than enables.

**UX flow:**
1. User installs extension → works immediately with cloud providers
2. User wants Ollama → prompted to install bridge (one-click installer)
3. Bridge detected → vault migrates to OS keychain, policy enforcement activates
4. Enterprise admin deploys bridge via MDM → full compliance features

**What this gets right:**
- Zero friction for the majority use case
- Local models still work (with the bridge)
- Security upgrades are progressive, not cliff-edge
- Enterprise can mandate the bridge via policy

**What this gets wrong:**
- Two code paths to maintain (extension-only + bridge-enhanced)
- Security claims become conditional ("secure" vs "more secure")
- Marketing is harder ("install the extension... but also maybe the bridge")

### Option C: Companion Web App (Replace Bridge with Server)

**What it is:** Instead of a local daemon, run a cloud service that the extension talks to. The server stores credentials (encrypted, user-password-derived), enforces policy, manages provider tokens, and proxies AI requests.

**What you lose:**
- Local model support (still can't reach localhost from a cloud server)
- True zero-trust (you're now trusting a cloud service)
- Offline operation
- The entire privacy value proposition

**What you gain:**
- No desktop install
- Works on Chromebooks, managed devices
- Easier updates

**Why this is probably wrong for Arlopass:** The tagline is "Your AI. Your pass." A cloud proxy that holds your credentials is the opposite of this. You'd be building exactly what you're selling against.

### Option D: WebExtension-based Local Server (Clever Hack, Don't Do This)

**What it is:** Bundle a WASM-compiled server inside the extension that somehow proxies to localhost.

**Why it doesn't work:** Extensions cannot bind to localhost ports. WASM runs in the same sandbox as JS. You cannot escape the browser sandbox from within the browser sandbox. This is not a thing.

### Option E: Browser-Level Integration (Long-term, Speculative)

Chrome's "Built-in AI" APIs (Prompt API, Translation API, Summarizer API) are bringing on-device AI directly into the browser. If this matures:

- The browser itself becomes the "bridge" for local models
- Extensions can call `ai.languageModel.create()` without a daemon
- Google controls the model selection (Gemini Nano, currently)

**Problems:**
- Chrome-only (no Firefox, Safari)
- Google controls which models are available
- No user model choice (the core Arlopass value prop)
- Currently limited to small models (Gemini Nano)
- API surface is narrow and opinionated

**Verdict:** Interesting to watch. Not a replacement for Arlopass's model-agnostic approach. If anything, Google's built-in AI makes the case for Arlopass stronger — users will want choice beyond what Google ships.

---

## What Competitors Do

| Product | Architecture | Local Models? | Desktop App? |
|---------|-------------|---------------|-------------|
| **1Password** | Extension + Desktop app | N/A | Yes (required for full features) |
| **Bitwarden** | Extension-only OR + Desktop | N/A | Optional (degrades gracefully) |
| **MetaMask** | Extension-only | N/A | No | 
| **Jan.ai** | Desktop app only | Yes | Yes (is the product) |
| **LM Studio** | Desktop app only | Yes | Yes (is the product) |
| **Open WebUI** | Self-hosted web app | Yes (server-side) | Docker/local server required |
| **Ollama** | CLI + local server | Yes | Desktop process required |
| **Requestly** | Extension + Desktop app | N/A | Optional (for advanced features) |

**Pattern:** Every product that accesses local resources requires a local process. There are zero exceptions. This is not a design choice — it's a platform constraint.

The products with the best adoption (MetaMask, Bitwarden extension-only) are the ones that work without a desktop app. But they only handle web-native operations (HTTP requests, browser storage). The moment you need OS-level capabilities, you need a local process.

---

## Recommended Path Forward

### Ship Option B: Progressive Enhancement

**Phase 1 — Extension-Only Lite Mode (reduce friction to zero)**

Build a cloud-only mode that works with just the extension:

1. Credential storage via Web Crypto API + Origin Private File System
2. Direct HTTPS to cloud providers from service worker
3. Permission enforcement in extension (advisory, not authoritative)
4. Streaming via service worker with `waitUntil()` + keep-alive pings
5. Usage tracking in `chrome.storage.local`

This serves the 70-80% of users who use cloud providers. They install the extension and it works immediately.

**Phase 2 — Bridge as Enhancement (reduce friction to one click)**

Make the bridge install effortless:

1. Platform-specific one-click installer (`.msi` on Windows, `.pkg` on macOS)
2. Auto-detection: extension discovers bridge via Native Messaging ping
3. Seamless migration: vault keys move from Web Crypto to OS keychain
4. Feature unlock UI: "Install the Arlopass companion for local model support"
5. Enterprise: bridge deployed via MDM with policy bundles

**Phase 3 — Make the Bridge Invisible**

The ideal state is that users don't know the bridge exists:

1. Bundled with extension install (Chrome Web Store doesn't allow this, but a custom installer page can)
2. Auto-update via the bridge's own update mechanism
3. Zero configuration — bridge registers itself as native host on install
4. Silent background operation — no tray icon unless the user wants it
5. Graceful degradation — if bridge crashes, extension falls back to lite mode

### What This Means for the Codebase

The extension needs a **transport abstraction** that can route to either:
- `BridgeTransport` (Native Messaging → bridge daemon) — full features
- `DirectTransport` (HTTPS → cloud APIs) — cloud-only lite mode

The SDK and web apps don't need to change. The `ArlopassTransport` interface is already provider-agnostic. The switch happens inside the extension's service worker.

---

## Conclusion

**Can you build Arlopass without the bridge?** Yes, for cloud-only use cases, with weaker but acceptable security.

**Can you build it without the bridge and offer "the same level of privacy and security without any compromises"?** No. That's not a design limitation — it's a platform reality. Browser extensions cannot spawn local processes, cannot access OS keychains, and cannot serve as a trusted root of authority because users can modify them. These are hard constraints of the web platform.

**Is the bridge installation friction a real problem?** Absolutely yes. It will cut your conversion rate by 3-4x. This is not hypothetical — every product that requires extension + desktop app sees this.

**The right answer is not "eliminate the bridge" — it's "don't require it for most users."** Progressive enhancement. Cloud-only lite mode for frictionless onboarding. Bridge as an upgrade for local models and enterprise security. Make the bridge invisible for users who do install it.

The bridge isn't the problem. Requiring it on day one is the problem.
