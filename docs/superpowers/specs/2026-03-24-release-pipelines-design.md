# Arlopass Wallet — Release Pipelines Design Spec

## Overview

Comprehensive CI/CD release pipeline system for the Arlopass Wallet monorepo. Produces three classes of artifacts — npm packages, browser extensions, and native bridge binaries — with automated publishing to npm, Chrome Web Store, Edge Add-ons, Firefox Add-ons (AMO), and GitHub Releases.

**Non-negotiable pillars:** Robustness, Reliability, Extensibility, Airtight Security.

---

## 1. Architecture: Reusable Workflow Composition

The pipeline is a library of small, focused **reusable workflows** (prefixed `_`) composed by **orchestrator workflows** triggered by git tags and events.

### 1.1 Reusable Building Blocks

Each workflow is called via `workflow_call` and does exactly one thing:

| Workflow | Responsibility |
|---|---|
| `_ci-gate.yml` | Lint, typecheck, full test suite, build verification — quality gate |
| `_build-packages.yml` | Build all npm packages (tsc), output artifacts |
| `_publish-npm.yml` | Publish packages to npm with SLSA provenance |
| `_build-extension.yml` | Build extension for Chromium + Firefox variants |
| `_deploy-chrome-store.yml` | Upload to Chrome Web Store via API |
| `_deploy-edge-store.yml` | Upload to Edge Add-ons via Partner Center API |
| `_deploy-firefox-store.yml` | Upload to Firefox Add-ons (AMO) via web-ext/API |
| `_build-bridge-sea.yml` | Build SEA binaries (Win/macOS/Linux, x64/arm64) |
| `_sign-attest.yml` | Sigstore cosign attestation + SHA256 checksums |
| `_create-github-release.yml` | Create GitHub Release with binaries + checksums |
| `_generate-installers.yml` | Update installer scripts with new version constants |

### 1.2 Orchestrator Workflows

| Workflow | Trigger | Composition |
|---|---|---|
| `ci.yml` | Push/PR to any branch | `_ci-gate` |
| `release-packages.yml` | Tag `core/v*` or `adapter/*/v*` | `_ci-gate` → `_build-packages` → `_publish-npm` → `_sign-attest` |
| `release-extension.yml` | Tag `extension/v*` | `_ci-gate` → `_build-extension` → `_deploy-chrome-store` + `_deploy-edge-store` + `_deploy-firefox-store` |
| `release-bridge.yml` | Tag `bridge/v*` | `_ci-gate` → `_build-bridge-sea` → `_sign-attest` → `_create-github-release` → `_publish-npm` → `_generate-installers` |
| `reliability-gates.yml` | Push to main/release, nightly cron, manual | Chaos, version-skew, soak tests (existing, enhanced) |
| `nightly.yml` | Cron 02:00 UTC | Full integration + soak tests |

### 1.3 Tag Convention

```
core/v0.2.0            → release-packages.yml (all core packages)
adapter/ollama/v1.0.0  → release-packages.yml (scoped to that adapter)
extension/v0.2.0       → release-extension.yml
bridge/v0.3.0          → release-bridge.yml
```

### 1.4 Security Model

- All reusable workflows run with **minimal permissions** (`contents: read` by default)
- Write permissions (`id-token: write`, `packages: write`) granted only in the specific job that needs them
- Secrets passed as explicit `workflow_call` inputs — never via blanket `secrets: inherit`
- OIDC token federation for npm provenance and Sigstore — no long-lived signing keys
- GitHub Environment protection rules require manual approval for all production deployments
- Branch protection: release tags can only be pushed from `main` or `release/**` branches

---

## 2. npm Package Publishing Pipeline

### 2.1 Versioning Strategy (Hybrid)

**Synchronized core packages** (share same version):
- `@arlopass/protocol`
- `@arlopass/web-sdk`
- `@arlopass/policy`
- `@arlopass/audit`
- `@arlopass/telemetry`
- `@arlopass/adapter-runtime`
- `@arlopass/adapter-tooling`

**Independent adapter packages** (own semver):
- `@arlopass/adapter-amazon-bedrock`
- `@arlopass/adapter-claude-subscription`
- `@arlopass/adapter-google-vertex-ai`
- `@arlopass/adapter-local-cli-bridge`
- `@arlopass/adapter-microsoft-foundry`
- `@arlopass/adapter-ollama`

**Apps:**
- `@arlopass/extension` and `@arlopass/examples-web` remain `private: true` (never published to npm)
- `@arlopass/bridge` is published to npm as a **global CLI package** with `bin` field. Its `package.json` must be changed to `private: false` and given `publishConfig`, `bin`, `license`, `repository`, `homepage`, `bugs` fields. The bridge npm package and the SEA binary are **different distribution formats of the same artifact** — they share the same version from the `bridge/v*` tag.

### 2.2 Package Preparation

Each publishable package needs these fields added to `package.json`:
- `"private": false` (or remove `"private"` entirely)
- `"publishConfig": { "access": "public", "provenance": true }`
- `"license": "MIT"` (or chosen license)
- `"repository": { "type": "git", "url": "https://github.com/<org>/arlopass", "directory": "<package-path>" }`
- `"homepage"` and `"bugs"` URLs

### 2.3 Core Package Release Flow

```
git tag core/v0.2.0
  ↓
release-packages.yml triggers
  ↓
_ci-gate.yml (lint + typecheck + test + build-verify)
  ↓ all pass
_build-packages.yml
  ├─ tsc all core packages in dependency order:
  │   protocol → audit → telemetry → policy → adapter-runtime → adapter-tooling → web-sdk
  └─ Upload dist/ artifacts
  ↓
_publish-npm.yml
  ├─ Dry-run: npm publish --dry-run (catch issues before real publish)
  ├─ Version collision check: npm view <pkg>@<version> (skip if exists)
  ├─ Dependency resolution: verify all @arlopass/* deps available on npm
  ├─ Publish: npm publish --provenance (OIDC-backed SLSA attestation)
  └─ Per-package: publishes in dependency order
  ↓
_sign-attest.yml
  └─ SLSA provenance manifest for published versions
```

### 2.4 Adapter Package Release Flow

```
git tag adapter/ollama/v1.0.0
  ↓
release-packages.yml triggers (scoped to that adapter)
  ↓
_ci-gate.yml (full suite)
  ↓
_build-packages.yml (builds only the tagged adapter)
  ↓
_publish-npm.yml (publishes only that adapter)
  ↓
_sign-attest.yml
```

### 2.5 Publish Safety Guards

- **Dry-run first**: Every publish runs `npm publish --dry-run` before the real publish
- **Version collision check**: Skip already-published versions gracefully (idempotency)
- **Dependency resolution check**: Verify all `@arlopass/*` dependencies exist on npm at required versions
- **Partial failure handling**: If any package in a core batch fails to publish:
  - The workflow **stops** — it does not continue publishing dependent packages
  - It posts a failure summary to the configured notification channel listing which packages succeeded and which failed
  - Already-published packages are NOT rolled back (they are valid artifacts)
  - A maintainer must fix the issue and re-run the workflow (it skips already-published versions due to the version collision check)
- **npm provenance**: Published with `--provenance`, using GitHub Actions OIDC to attest build origin. Consumers verify via `npm audit signatures`.

---

## 3. Browser Extension Release Pipeline

### 3.1 Build Matrix

| Variant | Target | Manifest | API | Stores |
|---|---|---|---|---|
| Chromium | Chrome 120+, Edge | Manifest V3 | `chrome.*` | Chrome Web Store, Edge Add-ons |
| Firefox | Firefox 109+ | Manifest V3 + gecko keys | `browser.*` | Firefox Add-ons (AMO) |

### 3.2 Build Script Refactoring

The existing `apps/extension/scripts/build.mjs` currently outputs flat to `dist/`. It must be refactored to support multi-target builds:

**Changes to `build.mjs`:**
1. Accept a `--target` flag: `chromium` (default) or `firefox`
2. Set `esbuild.define` to replace `chrome.*` with `browser.*` for Firefox target (the extension only uses a small API surface: `chrome.runtime`, `chrome.storage`, `chrome.tabs`)
3. Output to `dist/chromium/` or `dist/firefox/` based on target
4. For Firefox: run a manifest transform step after build that:
   - Reads the base `manifest.json`
   - Adds `browser_specific_settings.gecko.id`: `arlopass-wallet@arlopassai.com` (email-style ID, Firefox standard format)
   - Adds `browser_specific_settings.gecko.strict_min_version`: `"109.0"`
   - Removes Chrome-only fields (`minimum_chrome_version`)
   - Writes to `dist/firefox/manifest.json`
5. Copy static assets (`popup.html`, `popup.css`, `options.html`) to the target output directory

**CI builds both targets sequentially:**
```bash
node scripts/build.mjs --target chromium
node scripts/build.mjs --target firefox
```

### 3.3 Build Output

```
dist/
  chromium/
    manifest.json
    background.js, content-script.js, inpage-provider.js
    popup.html, popup.js, popup.css
    options.html, options.js
  firefox/
    manifest.json (transformed with gecko settings)
    background.js (browser.* API calls)
    content-script.js, inpage-provider.js
    popup.html, popup.js, popup.css
    options.html, options.js
```

Both variants are zipped as workflow artifacts.

### 3.4 Store Deployment

**Chrome Web Store** (`_deploy-chrome-store.yml`):
- Tool: `chrome-webstore-upload-cli`
- Secrets: `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`
- Flow: Upload zip → publish to trusted testers → separate manual promotion to public
- GitHub Environment: `chrome-web-store` (required reviewers)

**Edge Add-ons** (`_deploy-edge-store.yml`):
- Tool: Edge Add-ons API (REST)
- Secrets: `EDGE_CLIENT_ID`, `EDGE_CLIENT_SECRET`, `EDGE_ACCESS_TOKEN_URL`
- Uses same Chromium zip — no separate build
- GitHub Environment: `edge-add-ons` (required reviewers)

**Firefox Add-ons** (`_deploy-firefox-store.yml`):
- Tool: `web-ext sign` / AMO Submission API
- Secrets: `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`
- Uses Firefox-specific zip
- AMO review process (1-5 days typical)
- GitHub Environment: `firefox-add-ons` (required reviewers)

### 3.5 Release Flow

```
git tag extension/v0.2.0
  ↓
release-extension.yml
  ↓
_ci-gate.yml
  ↓ passes
_build-extension.yml
  ├─ Build Chromium variant (esbuild)
  ├─ Build Firefox variant (esbuild + manifest transform)
  └─ Zip both → upload as artifacts
  ↓
Parallel deployment (each requires manual approval):
  ├─ _deploy-chrome-store.yml  (Chromium zip)
  ├─ _deploy-edge-store.yml    (same Chromium zip)
  └─ _deploy-firefox-store.yml (Firefox zip)
```

### 3.6 Extension Version Synchronization

The `manifest.json` version is updated **automatically** during the release build:
1. The `_build-extension.yml` workflow extracts the version from the git tag (`extension/v0.2.0` → `0.2.0`)
2. Before building, it patches `manifest.json` with the tag version using a simple `sed`/`jq` command
3. The patched manifest is used for the build — the repo's `manifest.json` stays at its development version
4. This ensures the built artifact always matches the release tag

### 3.7 Extension Safety Guards

- **Size check**: Fail if zip exceeds 5MB — prevents bundling node_modules
- **Manifest version check**: Verify built `manifest.json` version matches git tag (should always pass due to 3.6, but acts as a safety net)
- **CSP validation**: Parse built manifest, verify no `unsafe-eval` or `unsafe-inline`
- **Permissions audit**: Diff permissions list against previous release, flag new permissions
- **Environment protection**: Each store requires manual approval from designated reviewer

---

## 4. Bridge SEA Binary Release Pipeline

### 4.1 SEA Build Matrix

Node.js Single Executable Applications (SEA) compile the bridge into self-contained binaries with zero runtime dependencies.

| Platform | Runner | Binary Name | Arch |
|---|---|---|---|
| Windows | `windows-latest` | `arlopass-bridge-win-x64.exe` | x64 |
| macOS | `macos-latest` | `arlopass-bridge-macos-x64` | x64 |
| macOS | `macos-latest` | `arlopass-bridge-macos-arm64` | arm64 |
| Linux | `ubuntu-latest` | `arlopass-bridge-linux-x64` | x64 |
| Linux | `ubuntu-latest` | `arlopass-bridge-linux-arm64` | arm64 |

**Note on arm64:** macOS arm64 (Apple Silicon) is built natively on `macos-latest` (which runs arm64). Linux arm64 uses QEMU cross-compilation via `docker run --platform linux/arm64`. Windows arm64 is **deferred** — GitHub Actions `windows-latest` is x64-only and cross-compiling Node.js SEA for Windows arm64 is not reliably supported. Windows arm64 can be added when GitHub provides arm64 Windows runners.

### 4.2 SEA Build Process (per platform)

```
1. npm ci
2. npm run build (tsc the bridge + all dependencies)
3. esbuild bundle: single-file ESM → single CJS bundle
   Entry: apps/bridge/dist/main.js
   Output: apps/bridge/dist/bridge-bundle.cjs
   All @arlopass/* deps inlined (no external requires)
4. Generate SEA blob:
   sea-config.json: { "main": "bridge-bundle.cjs", "output": "sea-prep.blob" }
   node --experimental-sea-config sea-config.json
   NOTE: Node 20 still requires the --experimental-sea-config flag (the SEA API
   is not fully stable until Node 22+). Pin workflow to Node 20.x for consistency
   with the existing CI. When the project upgrades to Node 22+, remove the flag.
5. Copy node binary + inject blob:
   cp $(which node) arlopass-bridge-<platform>-<arch>
   postject arlopass-bridge-<platform>-<arch> NODE_SEA_BLOB sea-prep.blob \
     --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
   NOTE: The sentinel fuse value above is the standard Node.js SEA fuse defined
   in the Node.js source code. It is NOT project-specific — all SEA applications
   use this exact value. Do not change it.
6. Platform post-processing:
   Windows: (no additional signing — provenance-only model)
   macOS: codesign --remove-signature → codesign -s - (ad-hoc re-sign)
   Linux: chmod +x
```

### 4.3 Sigstore Attestation

Each release produces:
- `SHA256SUMS.txt` — checksums for all 5 binaries
- `SHA256SUMS.txt.sig` — Sigstore cosign signature (keyless, OIDC-backed)
- `SHA256SUMS.txt.bundle` — Sigstore transparency log proof

Verification:
```bash
cosign verify-blob --bundle SHA256SUMS.txt.bundle SHA256SUMS.txt
sha256sum -c SHA256SUMS.txt
```

### 4.4 GitHub Release

`_create-github-release.yml`:
1. Creates GitHub Release tagged `bridge/v0.3.0`
2. Uploads all 5 binaries + checksums + signature + bundle
3. Auto-generates release notes from conventional commits
4. Attaches native host manifest templates

### 4.5 npm Global Install Fallback

`@arlopass/bridge` is also published to npm as a global CLI:
```bash
npm install -g @arlopass/bridge
arlopass-bridge
```
Same tag triggers both SEA build and npm publish.

### 4.6 Release Flow

```
git tag bridge/v0.3.0
  ↓
release-bridge.yml
  ↓
_ci-gate.yml
  ↓ passes
_build-bridge-sea.yml (matrix: 5 platform/arch combos)
  ├─ windows-latest: x64
  ├─ macos-latest: x64, arm64
  └─ ubuntu-latest: x64, arm64
  ↓
_sign-attest.yml
  └─ SHA256SUMS.txt + cosign signature + transparency log proof
  ↓
_create-github-release.yml
  └─ GitHub Release with all binaries + attestation artifacts
  ↓
_publish-npm.yml (bridge as global CLI)
  ↓
_generate-installers.yml
  └─ Update install.ps1 + install.sh version constants
```

---

## 5. Installer Scripts

### 5.1 One-Liner Installation

**Windows (PowerShell):**
```powershell
irm https://arlopassai.com/install.ps1 | iex
```

**macOS / Linux (Bash):**
```bash
curl -fsSL https://arlopassai.com/install.sh | sh
```

### 5.2 install.ps1 Design

1. Detect architecture (x64 vs arm64)
2. Fetch latest bridge release from GitHub API (`GET .../releases/latest`, filter bridge/* tags)
3. Download matching binary + `SHA256SUMS.txt` + `.sig`
4. **Mandatory checksum verification** (fail if mismatch)
5. **Opportunistic Sigstore verification** (warn if cosign unavailable; fail if cosign present but verification fails)
6. Install to `$env:LOCALAPPDATA\Arlopass\bin\`
7. Add to User PATH if not present
8. Generate + register native host manifests for Chrome/Edge/Firefox
9. Print success with version + verification status

**Security:** TLS-only, mandatory checksum, no arbitrary redirect following, binary written to disk (not piped to execution).

### 5.3 install.sh Design

1. Detect OS (`uname -s`: Linux vs Darwin) and architecture (`uname -m`: x86_64 vs aarch64/arm64)
2. Fetch latest bridge release from GitHub API
3. Download matching binary + checksums + signature
4. **Mandatory checksum verification** (`sha256sum -c` or `shasum -a 256 -c`)
5. **Opportunistic Sigstore verification**
6. Install to `~/.local/bin/arlopass-bridge` (or `/usr/local/bin` with sudo confirmation)
7. `chmod +x`
8. Generate + install native host manifests for Chrome/Firefox
9. Print success + next steps

**Security:** `set -euo pipefail`, `mktemp -d` for downloads, HTTP status verification, TLS-only.

### 5.4 Installer Versioning

Scripts live at `scripts/installers/install.ps1` and `scripts/installers/install.sh`:
- Committed to repo, reviewed like any code
- Uploaded to GitHub Releases as assets
- `arlopassai.com/install.ps1` → redirect to latest release asset URL

**The installer scripts do NOT contain hardcoded versions.** Instead, they always fetch the latest release dynamically from the GitHub API at install time:
```bash
# install.sh fetches latest bridge release:
LATEST=$(curl -fsSL "https://api.github.com/repos/<org>/arlopass/releases?per_page=20" \
  | grep -o '"tag_name": "bridge/v[^"]*"' | head -1 | grep -o 'v[0-9].*')
```

The `_generate-installers.yml` workflow:
1. Runs after a new bridge release is published
2. Validates that the installer scripts can correctly resolve + download the new version
3. If the installers need logic changes (e.g., new platform support), those changes are made via normal PRs — not auto-committed by CI
4. Uploads the current installer scripts as assets on the new GitHub Release

### 5.5 Native Host Registration

| Platform | Chrome | Firefox |
|---|---|---|
| Windows | Registry: `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.arlopass.bridge` | Registry: `HKCU\Software\Mozilla\NativeMessagingHosts\com.arlopass.bridge` |
| macOS | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.arlopass.bridge.json` | `~/Library/Application Support/Mozilla/NativeMessagingHosts/com.arlopass.bridge.json` |
| Linux | `~/.config/google-chrome/NativeMessagingHosts/com.arlopass.bridge.json` | `~/.mozilla/native-messaging-hosts/com.arlopass.bridge.json` |

Edge uses the same paths as Chrome on all platforms.

### 5.6 Uninstall

Both scripts support `--uninstall`:
- Remove binary
- Remove native host manifests + registry entries
- Remove PATH entry (Windows)

---

## 6. CI Gate, Secrets & Error Handling

### 6.1 Enhanced CI Gate — Relationship to Existing Workflow

The existing `reliability-gates.yml` has a `reliability-gate` job that runs lint, typecheck, and tests. We **refactor** this:

1. Extract the fast quality checks into the new `_ci-gate.yml` reusable workflow
2. The existing `reliability-gates.yml` is updated to **call** `_ci-gate.yml` as its first job (replacing its inline typecheck + reliability-gate jobs)
3. `reliability-gates.yml` keeps its unique jobs: `chaos-tests`, `version-skew-tests`, `soak-tests` — these are NOT duplicated into `_ci-gate.yml`
4. All orchestrator release workflows call `_ci-gate.yml` — getting the same fast quality gate without duplicating the logic

```
_ci-gate.yml (reusable, extracted from reliability-gates.yml):
  ├─ Job 1: lint (eslint across all workspaces)
  ├─ Job 2: typecheck (tsc --noEmit across all workspaces)
  ├─ Job 3: test (vitest run — unit + integration)
  ├─ Job 4: build-verify (npm run build — ensures build succeeds)
  └─ All 4 must pass before any downstream job proceeds

reliability-gates.yml (refactored):
  ├─ Calls _ci-gate.yml (replaces inline typecheck + reliability-gate)
  ├─ chaos-tests (depends on _ci-gate)
  ├─ version-skew-tests (depends on _ci-gate)
  └─ soak-tests (nightly/manual only)
```

This eliminates duplication while preserving the existing reliability test suite.

### 6.2 Secrets Inventory

| Secret | Used By | Notes |
|---|---|---|
| `NPM_TOKEN` | `_publish-npm.yml` | 90-day rotation, scoped to `@arlopass` |
| `CHROME_CLIENT_ID` | `_deploy-chrome-store.yml` | Google OAuth2 |
| `CHROME_CLIENT_SECRET` | `_deploy-chrome-store.yml` | Google OAuth2 |
| `CHROME_REFRESH_TOKEN` | `_deploy-chrome-store.yml` | Google OAuth2 |
| `EDGE_CLIENT_ID` | `_deploy-edge-store.yml` | MS Partner Center API |
| `EDGE_CLIENT_SECRET` | `_deploy-edge-store.yml` | MS Partner Center API |
| `EDGE_ACCESS_TOKEN_URL` | `_deploy-edge-store.yml` | MS Partner Center API |
| `AMO_JWT_ISSUER` | `_deploy-firefox-store.yml` | Mozilla AMO API |
| `AMO_JWT_SECRET` | `_deploy-firefox-store.yml` | Mozilla AMO API |

**No signing keys** — Sigstore uses OIDC (keyless), npm provenance uses GitHub OIDC.

### 6.3 GitHub Environments

| Environment | Protection | Used By |
|---|---|---|
| `npm-publish` | 1 reviewer, branches: main/release/** | `_publish-npm.yml` |
| `chrome-web-store` | 1 reviewer, branches: main/release/** | `_deploy-chrome-store.yml` |
| `edge-add-ons` | 1 reviewer, branches: main/release/** | `_deploy-edge-store.yml` |
| `firefox-add-ons` | 1 reviewer, branches: main/release/** | `_deploy-firefox-store.yml` |
| `github-releases` | 1 reviewer, branches: main/release/** | `_create-github-release.yml` |

### 6.4 Error Handling

**Retry strategy:**
- Store API uploads: 3 retries, exponential backoff (APIs are flaky)
- npm publish: 2 retries (transient network errors)
- SEA builds: no retries (deterministic)
- All retries logged with attempt number

**Failure notifications:**
- All release failures post to configurable notification channel
- Failed releases tagged as "draft" — never published publicly

**Rollback (always manual):**
- npm: `npm unpublish` within 72 hours, or `npm deprecate` after
- Extension stores: rollback to previous version via store dashboards
- Bridge: delete GitHub Release; installer scripts always fetch latest non-draft release

---

## 7. File Structure

```
.github/
  workflows/
    ci.yml                        # PR/push → _ci-gate
    release-packages.yml          # core/v* or adapter/*/v* tags
    release-extension.yml         # extension/v* tags
    release-bridge.yml            # bridge/v* tags
    reliability-gates.yml         # existing (enhanced)
    nightly.yml                   # cron schedule
    _ci-gate.yml                  # reusable: lint+typecheck+test+build
    _build-packages.yml           # reusable: tsc all packages
    _publish-npm.yml              # reusable: npm publish --provenance
    _build-extension.yml          # reusable: chromium + firefox builds
    _deploy-chrome-store.yml      # reusable: Chrome Web Store upload
    _deploy-edge-store.yml        # reusable: Edge Add-ons upload
    _deploy-firefox-store.yml     # reusable: Firefox AMO upload
    _build-bridge-sea.yml         # reusable: SEA binary matrix build
    _sign-attest.yml              # reusable: Sigstore cosign
    _create-github-release.yml    # reusable: GH Release creation
    _generate-installers.yml      # reusable: installer script updates
scripts/
  installers/
    install.ps1                   # Windows installer
    install.sh                    # macOS/Linux installer
```

---

## 8. Testing Strategy

### 8.1 Workflow Testing

- **Act** (local GitHub Actions runner): test workflows locally before pushing
- **Dry-run mode**: All orchestrator workflows accept a `dry_run` input parameter (boolean, default: false). When `dry_run: true`:
  - `_publish-npm.yml` runs `npm publish --dry-run` only (no actual publish)
  - `_deploy-*-store.yml` skips the upload step, logs what would be uploaded
  - `_create-github-release.yml` creates a draft release (not published)
  - Dry-run mode can be triggered via `workflow_dispatch` with `dry_run: true`, or by convention via pre-release tags like `core/v0.0.0-rc.1`
- **Canary releases**: test the full publish path using pre-release versions (e.g., `0.2.0-canary.1`) on the real npm registry with the `canary` dist-tag

### 8.2 Installer Testing

- **Unit tests**: PowerShell Pester tests for install.ps1, BATS tests for install.sh
- **Integration tests**: Run installers in clean container images (Windows Server Core, Ubuntu, macOS) — verify binary is installed, PATH is set, native host is registered
- **Smoke tests**: After install, verify `arlopass-bridge --version` returns expected version

---

## 9. Future Extensibility

This design explicitly supports future additions:
- **Safari extension**: Add `_deploy-safari-store.yml` reusable workflow + Xcode build step — wire into `release-extension.yml`
- **Full code signing**: Add certificate-based signing step before SEA binary upload — insert into `_build-bridge-sea.yml`
- **Auto-update**: Bridge binary can check GitHub Releases API for newer versions and prompt the user
- **Additional adapters**: New adapters get their own `adapter/<name>/v*` tag namespace — no pipeline changes needed
- **Homebrew/Chocolatey/APT/RPM**: Add `_deploy-package-manager.yml` reusable workflow — wire into `release-bridge.yml`
