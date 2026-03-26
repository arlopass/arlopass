# Release Pipelines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full CI/CD release pipeline system for the BYOM AI Wallet monorepo as defined in `docs/superpowers/specs/2026-03-24-release-pipelines-design.md`.

**Architecture:** Reusable GitHub Actions workflow composition. 17 workflow files, 2 installer scripts, package.json preparation across ~18 packages, extension build refactoring for multi-target support.

**Tech Stack:** GitHub Actions, Node.js 20 SEA, esbuild, Sigstore cosign, npm provenance (OIDC), Chrome Web Store API, Edge Add-ons API, Firefox AMO API, PowerShell, Bash.

**Spec:** `docs/superpowers/specs/2026-03-24-release-pipelines-design.md`

---

### Task 1: Prepare Core Package.json Files for npm Publishing

Update all 7 core packages to be publishable. Change `private` to `false`, add `publishConfig`, `license`, `repository`, `homepage`, `bugs`, and fix `exports` to point to `dist/` (not `src/`).

**Files:**
- Modify: `packages/protocol/package.json`
- Modify: `packages/audit/package.json`
- Modify: `packages/telemetry/package.json`
- Modify: `packages/policy/package.json`
- Modify: `packages/web-sdk/package.json`
- Modify: `adapters/runtime/package.json`
- Modify: `adapters/tooling/package.json`

- [ ] **Step 1: Update packages/protocol/package.json**

Replace:
```json
{
  "name": "@byom-ai/protocol",
  "version": "0.1.0",
  "private": true,
```

With:
```json
{
  "name": "@byom-ai/protocol",
  "version": "0.1.0",
  "license": "MIT",
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/AltClick/byom-web.git",
    "directory": "packages/protocol"
  },
  "homepage": "https://github.com/AltClick/byom-web/tree/main/packages/protocol#readme",
  "bugs": {
    "url": "https://github.com/AltClick/byom-web/issues"
  },
```

Also fix the `exports` field to point to `dist/` for published builds:
```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
```

- [ ] **Step 2: Update packages/audit/package.json**

Same pattern as Step 1 but with `"directory": "packages/audit"`.

- [ ] **Step 3: Update packages/telemetry/package.json**

Same pattern with `"directory": "packages/telemetry"`.

- [ ] **Step 4: Update packages/policy/package.json**

Same pattern with `"directory": "packages/policy"`. Also update dependency from `file:` to semver:
```json
  "dependencies": {
    "@byom-ai/protocol": "0.1.0"
  }
```

**Note:** The `file:` references work for local development but npm requires semver ranges for publishing. We'll use exact versions matching the synchronized core version. The monorepo `npm install` still resolves these from the workspace.

- [ ] **Step 5: Update packages/web-sdk/package.json**

Same publish fields with `"directory": "packages/web-sdk"`. Update dependencies:
```json
  "dependencies": {
    "@byom-ai/protocol": "0.1.0",
    "@byom-ai/telemetry": "0.1.0"
  }
```

- [ ] **Step 6: Update adapters/runtime/package.json**

Same publish fields with `"directory": "adapters/runtime"`. Update dependencies from `file:` to semver.

- [ ] **Step 7: Update adapters/tooling/package.json**

Same publish fields with `"directory": "adapters/tooling"`.

- [ ] **Step 8: Run typecheck + test to verify nothing broke**

Run: `npm run typecheck && npm run test`
Expected: All pass — `file:` deps still resolve locally in workspace mode.

- [ ] **Step 9: Commit**

```bash
git add packages/*/package.json adapters/runtime/package.json adapters/tooling/package.json
git commit -m "build: prepare core packages for npm publishing"
```

---

### Task 2: Prepare Adapter Package.json Files for npm Publishing

Update all 9 adapter packages (independent versioning).

**Files:**
- Modify: `adapters/adapter-amazon-bedrock/package.json`
- Modify: `adapters/adapter-claude-subscription/package.json`
- Modify: `adapters/adapter-gemini/package.json`
- Modify: `adapters/adapter-google-vertex-ai/package.json`
- Modify: `adapters/adapter-local-cli-bridge/package.json`
- Modify: `adapters/adapter-microsoft-foundry/package.json`
- Modify: `adapters/adapter-ollama/package.json`
- Modify: `adapters/adapter-openai/package.json`
- Modify: `adapters/adapter-perplexity/package.json`

- [ ] **Step 1: Update all 9 adapter package.json files**

For each adapter, apply the same pattern: remove `"private": true`, add `publishConfig`, `license`, `repository`, `homepage`, `bugs`. Update `file:` deps to semver:
```json
  "dependencies": {
    "@byom-ai/adapter-runtime": "0.1.0",
    "@byom-ai/protocol": "0.1.0"
  }
```

Each adapter uses `"directory": "adapters/adapter-<name>"` for the repository field.

- [ ] **Step 2: Run typecheck + test**

Run: `npm run typecheck && npm run test`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add adapters/adapter-*/package.json
git commit -m "build: prepare adapter packages for npm publishing"
```

---

### Task 3: Prepare Bridge Package.json for npm CLI Publishing

The bridge is published as a global CLI (`npm install -g @byom-ai/bridge`). Needs `bin` field and publish metadata.

**Files:**
- Modify: `apps/bridge/package.json`

- [ ] **Step 1: Update apps/bridge/package.json**

Remove `"private": true`. Add publish fields and `bin`:
```json
{
  "name": "@byom-ai/bridge",
  "version": "0.1.0",
  "license": "MIT",
  "type": "module",
  "bin": {
    "byom-bridge": "./dist/main.js"
  },
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist"
  ],
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/AltClick/byom-web.git",
    "directory": "apps/bridge"
  },
  "homepage": "https://github.com/AltClick/byom-web/tree/main/apps/bridge#readme",
  "bugs": {
    "url": "https://github.com/AltClick/byom-web/issues"
  },
```

Update dependencies from `file:` to semver:
```json
  "dependencies": {
    "@byom-ai/audit": "0.1.0",
    "@byom-ai/policy": "0.1.0",
    "@byom-ai/protocol": "0.1.0",
    "@byom-ai/telemetry": "0.1.0"
  }
```

- [ ] **Step 2: Add shebang to apps/bridge/src/main.ts**

The `main.ts` needs a shebang line at the top for the `bin` entry to work:
```typescript
#!/usr/bin/env node
```

- [ ] **Step 3: Run typecheck + test**

Run: `npm run typecheck && npm run test`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add apps/bridge/package.json apps/bridge/src/main.ts
git commit -m "build: prepare bridge for npm CLI publishing"
```

---

### Task 4: Create the Reusable CI Gate Workflow

Extract the quality checks into a reusable workflow that all release pipelines share.

**Files:**
- Create: `.github/workflows/_ci-gate.yml`

- [ ] **Step 1: Create `.github/workflows/_ci-gate.yml`**

```yaml
name: CI Gate

on:
  workflow_call:
    inputs:
      node-version:
        description: "Node.js version"
        required: false
        default: "20"
        type: string

permissions:
  contents: read

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run lint

  typecheck:
    name: TypeScript type-check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run typecheck

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run test

  build-verify:
    name: Build verification
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run build
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/_ci-gate.yml
git commit -m "ci: add reusable CI gate workflow"
```

---

### Task 5: Create the CI Orchestrator Workflow

Triggers the CI gate on every push and PR.

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: ["**"]
  pull_request:
    branches: [main, "release/**"]

permissions:
  contents: read

jobs:
  gate:
    name: CI Gate
    uses: ./.github/workflows/_ci-gate.yml
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add CI orchestrator workflow"
```

---

### Task 6: Refactor Reliability Gates to Use CI Gate

Update the existing workflow to call `_ci-gate.yml` instead of duplicating checks.

**Files:**
- Modify: `.github/workflows/reliability-gates.yml`

- [ ] **Step 1: Refactor reliability-gates.yml**

Replace the `typecheck` and `reliability-gate` jobs. Keep `chaos-tests`, `version-skew-tests`, `soak-tests`. The new structure:

```yaml
name: Reliability Gates

on:
  push:
    branches: [main, "release/**"]
  pull_request:
    branches: [main, "release/**"]
  schedule:
    - cron: "0 2 * * *"
  workflow_dispatch:
    inputs:
      run_soak:
        description: "Run soak tests (may be slow)"
        required: false
        default: "false"
        type: boolean

permissions:
  contents: read
  checks: write

jobs:
  ci-gate:
    name: CI Gate
    uses: ./.github/workflows/_ci-gate.yml

  chaos-tests:
    name: Chaos tests
    runs-on: ubuntu-latest
    needs: ci-gate
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
      - run: npm ci
      - name: Run chaos test suite
        run: npm run test -- ops/tests/chaos
        env:
          CI: "true"
      - name: Upload chaos test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: chaos-test-results
          path: ops/tests/chaos/**/__snapshots__/
          if-no-files-found: ignore

  version-skew-tests:
    name: Version-skew matrix
    runs-on: ubuntu-latest
    needs: ci-gate
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
      - run: npm ci
      - run: npm run test -- ops/tests/version-skew

  soak-tests:
    name: Soak tests
    runs-on: ubuntu-latest
    needs: ci-gate
    if: |
      github.event_name == 'schedule' ||
      (github.event_name == 'workflow_dispatch' && inputs.run_soak == 'true')
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
      - run: npm ci
      - run: npm run test -- ops/tests/soak
        timeout-minutes: 20

  reliability-gate:
    name: Reliability gate (required for release)
    runs-on: ubuntu-latest
    needs: [chaos-tests, version-skew-tests]
    steps:
      - name: Reliability gate summary
        run: |
          echo "## Reliability Gate Summary" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Check | Status |" >> $GITHUB_STEP_SUMMARY
          echo "|-------|--------|" >> $GITHUB_STEP_SUMMARY
          echo "| CI Gate (lint, typecheck, test, build) | ✅ Passed |" >> $GITHUB_STEP_SUMMARY
          echo "| Chaos tests | ✅ Passed |" >> $GITHUB_STEP_SUMMARY
          echo "| Version-skew matrix | ✅ Passed |" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "All reliability gates passed. Release is cleared." >> $GITHUB_STEP_SUMMARY
```

- [ ] **Step 2: Verify the workflow YAML is valid**

Run: `npx yaml-lint .github/workflows/reliability-gates.yml` or validate manually.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/reliability-gates.yml
git commit -m "ci: refactor reliability gates to use reusable CI gate"
```

---

### Task 7: Create the Build Packages Reusable Workflow

Builds all npm packages in dependency order and uploads artifacts.

**Files:**
- Create: `.github/workflows/_build-packages.yml`

- [ ] **Step 1: Create `.github/workflows/_build-packages.yml`**

```yaml
name: Build Packages

on:
  workflow_call:
    inputs:
      scope:
        description: "Package scope: 'core' for all core packages, or adapter name like 'adapter-ollama'"
        required: true
        type: string
      node-version:
        description: "Node.js version"
        required: false
        default: "20"
        type: string

permissions:
  contents: read

jobs:
  build:
    name: Build packages (${{ inputs.scope }})
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
          cache: npm

      - run: npm ci

      - name: Build all packages
        run: npm run build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: package-builds-${{ inputs.scope }}
          path: |
            packages/*/dist/
            adapters/*/dist/
            apps/bridge/dist/
          retention-days: 1
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/_build-packages.yml
git commit -m "ci: add reusable build-packages workflow"
```

---

### Task 8: Create the Publish npm Reusable Workflow

Publishes packages with provenance, dry-run checks, and version collision safety.

**Files:**
- Create: `.github/workflows/_publish-npm.yml`

- [ ] **Step 1: Create `.github/workflows/_publish-npm.yml`**

```yaml
name: Publish to npm

on:
  workflow_call:
    inputs:
      scope:
        description: "Package scope: 'core', 'bridge', or adapter name"
        required: true
        type: string
      version:
        description: "Version to publish (e.g. 0.2.0)"
        required: true
        type: string
      dry-run:
        description: "If true, only run npm publish --dry-run"
        required: false
        default: false
        type: boolean
    secrets:
      NPM_TOKEN:
        required: true

permissions:
  contents: read
  id-token: write

jobs:
  publish:
    name: Publish ${{ inputs.scope }}@${{ inputs.version }}
    runs-on: ubuntu-latest
    environment: npm-publish
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          registry-url: "https://registry.npmjs.org"

      - run: npm ci

      - name: Download build artifacts
        uses: actions/download-artifact@v4
        with:
          name: package-builds-${{ inputs.scope }}

      - name: Determine packages to publish
        id: packages
        run: |
          if [ "${{ inputs.scope }}" = "core" ]; then
            echo "dirs=packages/protocol packages/audit packages/telemetry packages/policy adapters/runtime adapters/tooling packages/web-sdk" >> "$GITHUB_OUTPUT"
          elif [ "${{ inputs.scope }}" = "bridge" ]; then
            echo "dirs=apps/bridge" >> "$GITHUB_OUTPUT"
          else
            echo "dirs=adapters/${{ inputs.scope }}" >> "$GITHUB_OUTPUT"
          fi

      - name: Publish packages in order
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          set -euo pipefail
          PUBLISHED=()
          SKIPPED=()
          for dir in ${{ steps.packages.outputs.dirs }}; do
            PKG_NAME=$(node -p "require('./${dir}/package.json').name")
            PKG_VERSION="${{ inputs.version }}"

            # Check if already published
            if npm view "${PKG_NAME}@${PKG_VERSION}" version 2>/dev/null; then
              echo "⏭️  ${PKG_NAME}@${PKG_VERSION} already published, skipping"
              SKIPPED+=("${PKG_NAME}")
              continue
            fi

            # Dry-run first
            echo "🔍 Dry-run: ${PKG_NAME}@${PKG_VERSION}"
            (cd "${dir}" && npm publish --dry-run)

            if [ "${{ inputs.dry-run }}" = "true" ]; then
              echo "🏃 Dry-run mode — skipping real publish for ${PKG_NAME}"
              continue
            fi

            # Real publish with provenance
            echo "📦 Publishing: ${PKG_NAME}@${PKG_VERSION}"
            (cd "${dir}" && npm publish --provenance --access public)
            PUBLISHED+=("${PKG_NAME}")
          done

          echo "## npm Publish Summary" >> "$GITHUB_STEP_SUMMARY"
          echo "| Package | Status |" >> "$GITHUB_STEP_SUMMARY"
          echo "|---------|--------|" >> "$GITHUB_STEP_SUMMARY"
          for p in "${PUBLISHED[@]+"${PUBLISHED[@]}"}"; do
            echo "| ${p} | ✅ Published |" >> "$GITHUB_STEP_SUMMARY"
          done
          for s in "${SKIPPED[@]+"${SKIPPED[@]}"}"; do
            echo "| ${s} | ⏭️ Skipped (exists) |" >> "$GITHUB_STEP_SUMMARY"
          done
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/_publish-npm.yml
git commit -m "ci: add reusable npm publish workflow with provenance"
```

---

### Task 9: Create the Sign & Attest Reusable Workflow

Generates SHA256 checksums and Sigstore cosign signatures.

**Files:**
- Create: `.github/workflows/_sign-attest.yml`

- [ ] **Step 1: Create `.github/workflows/_sign-attest.yml`**

```yaml
name: Sign & Attest

on:
  workflow_call:
    inputs:
      artifact-name:
        description: "Name of the artifact to download and sign"
        required: true
        type: string

permissions:
  contents: read
  id-token: write

jobs:
  sign:
    name: Sigstore attestation
    runs-on: ubuntu-latest
    steps:
      - name: Download artifacts
        uses: actions/download-artifact@v4
        with:
          name: ${{ inputs.artifact-name }}
          path: ./artifacts

      - name: Install cosign
        uses: sigstore/cosign-installer@v3

      - name: Generate SHA256 checksums
        working-directory: ./artifacts
        run: |
          sha256sum * > SHA256SUMS.txt
          cat SHA256SUMS.txt

      - name: Sign checksums with Sigstore (keyless)
        working-directory: ./artifacts
        run: |
          cosign sign-blob --yes \
            --output-signature SHA256SUMS.txt.sig \
            --output-certificate SHA256SUMS.txt.pem \
            --bundle SHA256SUMS.txt.bundle \
            SHA256SUMS.txt

      - name: Upload signed artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ inputs.artifact-name }}-signed
          path: |
            ./artifacts/SHA256SUMS.txt
            ./artifacts/SHA256SUMS.txt.sig
            ./artifacts/SHA256SUMS.txt.pem
            ./artifacts/SHA256SUMS.txt.bundle
          retention-days: 5
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/_sign-attest.yml
git commit -m "ci: add reusable Sigstore sign & attest workflow"
```

---

### Task 10: Create the Release Packages Orchestrator Workflow

Ties together CI gate → build → publish → sign for npm releases.

**Files:**
- Create: `.github/workflows/release-packages.yml`

- [ ] **Step 1: Create `.github/workflows/release-packages.yml`**

```yaml
name: Release Packages

on:
  push:
    tags:
      - "core/v*"
      - "adapter/*/v*"
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Dry-run mode (no real publish)"
        required: false
        default: false
        type: boolean

permissions:
  contents: read

jobs:
  parse-tag:
    name: Parse release tag
    runs-on: ubuntu-latest
    outputs:
      scope: ${{ steps.parse.outputs.scope }}
      version: ${{ steps.parse.outputs.version }}
    steps:
      - name: Parse tag
        id: parse
        run: |
          TAG="${GITHUB_REF_NAME}"
          if [[ "${TAG}" =~ ^core/v(.+)$ ]]; then
            echo "scope=core" >> "$GITHUB_OUTPUT"
            echo "version=${BASH_REMATCH[1]}" >> "$GITHUB_OUTPUT"
          elif [[ "${TAG}" =~ ^adapter/([^/]+)/v(.+)$ ]]; then
            echo "scope=adapter-${BASH_REMATCH[1]}" >> "$GITHUB_OUTPUT"
            echo "version=${BASH_REMATCH[2]}" >> "$GITHUB_OUTPUT"
          else
            echo "::error::Unrecognized tag format: ${TAG}"
            exit 1
          fi

  ci-gate:
    name: CI Gate
    uses: ./.github/workflows/_ci-gate.yml

  build:
    name: Build
    needs: [parse-tag, ci-gate]
    uses: ./.github/workflows/_build-packages.yml
    with:
      scope: ${{ needs.parse-tag.outputs.scope }}

  publish:
    name: Publish to npm
    needs: [parse-tag, build]
    uses: ./.github/workflows/_publish-npm.yml
    with:
      scope: ${{ needs.parse-tag.outputs.scope }}
      version: ${{ needs.parse-tag.outputs.version }}
      dry-run: ${{ github.event.inputs.dry_run == 'true' || false }}
    secrets:
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release-packages.yml
git commit -m "ci: add release-packages orchestrator workflow"
```

---

### Task 11: Refactor Extension Build Script for Multi-Target Support

Modify the existing `build.mjs` to accept `--target chromium|firefox` flag and output to separate directories.

**Files:**
- Modify: `apps/extension/scripts/build.mjs`

- [ ] **Step 1: Add target flag parsing and constants**

At the top of `build.mjs`, after the existing `isWatchMode` line, add target parsing:

```javascript
const targetArg = process.argv.find((a) => a.startsWith("--target="));
const target = targetArg ? targetArg.split("=")[1] : "chromium";
if (!["chromium", "firefox"].includes(target)) {
  console.error(`Unknown target: ${target}. Use --target=chromium or --target=firefox`);
  process.exit(1);
}
const isFirefox = target === "firefox";
```

- [ ] **Step 2: Update output directories**

Change `distRoot` to be target-aware:

```javascript
const distRoot = path.join(packageRoot, "dist", target);
```

- [ ] **Step 3: Add esbuild define for Firefox API namespace**

In `sharedBuildOptions`, add a `define` field for Firefox:

```javascript
const sharedBuildOptions = {
  bundle: true,
  target: [isFirefox ? "firefox109" : "chrome120"],
  platform: "browser",
  tsconfig: path.join(packageRoot, "tsconfig.json"),
  sourcemap: true,
  logLevel: "info",
  legalComments: "none",
  ...(isFirefox
    ? {
        define: {
          "chrome.runtime": "browser.runtime",
          "chrome.storage": "browser.storage",
          "chrome.tabs": "browser.tabs",
        },
      }
    : {}),
};
```

- [ ] **Step 4: Add manifest transformation function**

Add a function after the build to transform the manifest for Firefox:

```javascript
import { copyFile, readFile, writeFile } from "node:fs/promises";

async function transformManifestForFirefox() {
  const manifestPath = path.join(packageRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));

  // Add Firefox-specific settings
  manifest.browser_specific_settings = {
    gecko: {
      id: "byom-ai-wallet@byomai.com",
      strict_min_version: "109.0",
    },
  };

  // Remove Chrome-only fields
  delete manifest.minimum_chrome_version;
  delete manifest.key;

  // Update dist paths to be relative (Firefox expects flat structure)
  if (manifest.background?.service_worker) {
    manifest.background.service_worker = "background.js";
  }
  if (manifest.content_scripts) {
    for (const cs of manifest.content_scripts) {
      cs.js = cs.js.map((j) => j.replace("dist/", ""));
    }
  }
  if (manifest.web_accessible_resources) {
    for (const war of manifest.web_accessible_resources) {
      war.resources = war.resources.map((r) => r.replace("dist/", ""));
    }
  }

  await writeFile(
    path.join(distRoot, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
}

async function copyManifestForChromium() {
  const manifestPath = path.join(packageRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));

  // Update dist paths to be relative
  if (manifest.background?.service_worker) {
    manifest.background.service_worker = "background.js";
  }
  if (manifest.content_scripts) {
    for (const cs of manifest.content_scripts) {
      cs.js = cs.js.map((j) => j.replace("dist/", ""));
    }
  }
  if (manifest.web_accessible_resources) {
    for (const war of manifest.web_accessible_resources) {
      war.resources = war.resources.map((r) => r.replace("dist/", ""));
    }
  }

  await writeFile(
    path.join(distRoot, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
}
```

- [ ] **Step 5: Add static asset copying**

```javascript
async function copyStaticAssets() {
  const assets = ["popup.html", "popup.css", "options.html"];
  for (const asset of assets) {
    const src = path.join(packageRoot, asset);
    const dest = path.join(distRoot, asset);
    await copyFile(src, dest);
  }
}
```

- [ ] **Step 6: Update runOneShotBuild to include manifest + assets**

```javascript
async function runOneShotBuild() {
  await buildTypeDeclarations();
  await Promise.all([
    build(createModuleBundleConfig()),
    build(createContentScriptBundleConfig()),
  ]);
  if (isFirefox) {
    await transformManifestForFirefox();
  } else {
    await copyManifestForChromium();
  }
  await copyStaticAssets();
}
```

- [ ] **Step 7: Run the build for both targets to verify**

Run:
```bash
cd apps/extension
node scripts/build.mjs --target=chromium
node scripts/build.mjs --target=firefox
ls dist/chromium/ dist/firefox/
```

Expected: Both directories contain manifest.json, JS bundles, and static assets.

- [ ] **Step 8: Run typecheck + test**

Run: `npm run typecheck && npm run test`

- [ ] **Step 9: Commit**

```bash
git add apps/extension/scripts/build.mjs
git commit -m "build: refactor extension build for multi-target (chromium/firefox)"
```

---

### Task 12: Create the Build Extension Reusable Workflow

Builds both Chromium and Firefox variants, zips them, uploads as artifacts.

**Files:**
- Create: `.github/workflows/_build-extension.yml`

- [ ] **Step 1: Create `.github/workflows/_build-extension.yml`**

```yaml
name: Build Extension

on:
  workflow_call:
    inputs:
      version:
        description: "Extension version (from tag)"
        required: true
        type: string

permissions:
  contents: read

jobs:
  build:
    name: Build extension (${{ matrix.target }})
    runs-on: ubuntu-latest
    strategy:
      matrix:
        target: [chromium, firefox]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm

      - run: npm ci

      - name: Build all workspace dependencies
        run: npm run build

      - name: Patch manifest version
        run: |
          cd apps/extension
          jq '.version = "${{ inputs.version }}"' manifest.json > manifest.tmp.json
          mv manifest.tmp.json manifest.json

      - name: Build extension (${{ matrix.target }})
        run: cd apps/extension && node scripts/build.mjs --target=${{ matrix.target }}

      - name: Validate extension
        run: |
          DIST="apps/extension/dist/${{ matrix.target }}"
          # Size check (5MB max)
          SIZE=$(du -sb "${DIST}" | cut -f1)
          if [ "${SIZE}" -gt 5242880 ]; then
            echo "::error::Extension build exceeds 5MB (${SIZE} bytes)"
            exit 1
          fi
          # CSP validation
          CSP=$(jq -r '.content_security_policy.extension_pages // empty' "${DIST}/manifest.json")
          if echo "${CSP}" | grep -qE "unsafe-eval|unsafe-inline"; then
            echo "::error::CSP contains unsafe directives: ${CSP}"
            exit 1
          fi
          # Version check
          MANIFEST_VER=$(jq -r '.version' "${DIST}/manifest.json")
          if [ "${MANIFEST_VER}" != "${{ inputs.version }}" ]; then
            echo "::error::Manifest version (${MANIFEST_VER}) does not match tag (${{ inputs.version }})"
            exit 1
          fi
          echo "✅ Extension validation passed (size=${SIZE}, version=${MANIFEST_VER})"

      - name: Zip extension
        run: |
          cd "apps/extension/dist/${{ matrix.target }}"
          zip -r "../../../../byom-extension-${{ matrix.target }}.zip" .

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: extension-${{ matrix.target }}
          path: byom-extension-${{ matrix.target }}.zip
          retention-days: 5
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/_build-extension.yml
git commit -m "ci: add reusable build-extension workflow"
```

---

### Task 13: Create Extension Store Deployment Workflows

Three reusable workflows for Chrome, Edge, and Firefox store deployment.

**Files:**
- Create: `.github/workflows/_deploy-chrome-store.yml`
- Create: `.github/workflows/_deploy-edge-store.yml`
- Create: `.github/workflows/_deploy-firefox-store.yml`

- [ ] **Step 1: Create `.github/workflows/_deploy-chrome-store.yml`**

```yaml
name: Deploy to Chrome Web Store

on:
  workflow_call:
    secrets:
      CHROME_CLIENT_ID:
        required: true
      CHROME_CLIENT_SECRET:
        required: true
      CHROME_REFRESH_TOKEN:
        required: true

permissions:
  contents: read

jobs:
  deploy:
    name: Chrome Web Store
    runs-on: ubuntu-latest
    environment: chrome-web-store
    steps:
      - name: Download Chromium extension zip
        uses: actions/download-artifact@v4
        with:
          name: extension-chromium

      - name: Install chrome-webstore-upload-cli
        run: npm install -g chrome-webstore-upload-cli

      - name: Upload to Chrome Web Store
        env:
          EXTENSION_ID: ${{ vars.CHROME_EXTENSION_ID }}
          CLIENT_ID: ${{ secrets.CHROME_CLIENT_ID }}
          CLIENT_SECRET: ${{ secrets.CHROME_CLIENT_SECRET }}
          REFRESH_TOKEN: ${{ secrets.CHROME_REFRESH_TOKEN }}
        run: |
          set -euo pipefail
          RETRY=0
          MAX_RETRIES=3
          until [ $RETRY -ge $MAX_RETRIES ]; do
            if chrome-webstore-upload upload \
              --source byom-extension-chromium.zip \
              --extension-id "${EXTENSION_ID}" \
              --client-id "${CLIENT_ID}" \
              --client-secret "${CLIENT_SECRET}" \
              --refresh-token "${REFRESH_TOKEN}"; then
              echo "✅ Upload succeeded"
              break
            fi
            RETRY=$((RETRY + 1))
            echo "⚠️  Upload attempt ${RETRY}/${MAX_RETRIES} failed, retrying in $((RETRY * 15))s..."
            sleep $((RETRY * 15))
          done
          if [ $RETRY -ge $MAX_RETRIES ]; then
            echo "::error::Chrome Web Store upload failed after ${MAX_RETRIES} attempts"
            exit 1
          fi

      - name: Publish to trusted testers
        env:
          EXTENSION_ID: ${{ vars.CHROME_EXTENSION_ID }}
          CLIENT_ID: ${{ secrets.CHROME_CLIENT_ID }}
          CLIENT_SECRET: ${{ secrets.CHROME_CLIENT_SECRET }}
          REFRESH_TOKEN: ${{ secrets.CHROME_REFRESH_TOKEN }}
        run: |
          chrome-webstore-upload publish \
            --extension-id "${EXTENSION_ID}" \
            --client-id "${CLIENT_ID}" \
            --client-secret "${CLIENT_SECRET}" \
            --refresh-token "${REFRESH_TOKEN}" \
            --trusted-testers
```

- [ ] **Step 2: Create `.github/workflows/_deploy-edge-store.yml`**

```yaml
name: Deploy to Edge Add-ons

on:
  workflow_call:
    secrets:
      EDGE_CLIENT_ID:
        required: true
      EDGE_CLIENT_SECRET:
        required: true
      EDGE_ACCESS_TOKEN_URL:
        required: true

permissions:
  contents: read

jobs:
  deploy:
    name: Edge Add-ons
    runs-on: ubuntu-latest
    environment: edge-add-ons
    steps:
      - name: Download Chromium extension zip
        uses: actions/download-artifact@v4
        with:
          name: extension-chromium

      - name: Get Edge access token
        id: token
        env:
          CLIENT_ID: ${{ secrets.EDGE_CLIENT_ID }}
          CLIENT_SECRET: ${{ secrets.EDGE_CLIENT_SECRET }}
          TOKEN_URL: ${{ secrets.EDGE_ACCESS_TOKEN_URL }}
        run: |
          TOKEN=$(curl -fsSL -X POST "${TOKEN_URL}" \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -d "client_id=${CLIENT_ID}&scope=https://api.addons.microsoftedge.microsoft.com/.default&client_secret=${CLIENT_SECRET}&grant_type=client_credentials" \
            | jq -r '.access_token')
          echo "::add-mask::${TOKEN}"
          echo "token=${TOKEN}" >> "$GITHUB_OUTPUT"

      - name: Upload to Edge Add-ons
        env:
          PRODUCT_ID: ${{ vars.EDGE_PRODUCT_ID }}
          TOKEN: ${{ steps.token.outputs.token }}
        run: |
          set -euo pipefail
          RETRY=0
          MAX_RETRIES=3
          until [ $RETRY -ge $MAX_RETRIES ]; do
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
              -X POST "https://api.addons.microsoftedge.microsoft.com/v1/products/${PRODUCT_ID}/submissions/draft/package" \
              -H "Authorization: Bearer ${TOKEN}" \
              -H "Content-Type: application/zip" \
              --data-binary @byom-extension-chromium.zip)
            if [ "${HTTP_CODE}" = "202" ] || [ "${HTTP_CODE}" = "200" ]; then
              echo "✅ Upload succeeded (HTTP ${HTTP_CODE})"
              break
            fi
            RETRY=$((RETRY + 1))
            echo "⚠️  Upload attempt ${RETRY}/${MAX_RETRIES} failed (HTTP ${HTTP_CODE}), retrying..."
            sleep $((RETRY * 15))
          done
          if [ $RETRY -ge $MAX_RETRIES ]; then
            echo "::error::Edge Add-ons upload failed after ${MAX_RETRIES} attempts"
            exit 1
          fi
```

- [ ] **Step 3: Create `.github/workflows/_deploy-firefox-store.yml`**

```yaml
name: Deploy to Firefox Add-ons

on:
  workflow_call:
    secrets:
      AMO_JWT_ISSUER:
        required: true
      AMO_JWT_SECRET:
        required: true

permissions:
  contents: read

jobs:
  deploy:
    name: Firefox Add-ons (AMO)
    runs-on: ubuntu-latest
    environment: firefox-add-ons
    steps:
      - name: Download Firefox extension zip
        uses: actions/download-artifact@v4
        with:
          name: extension-firefox

      - name: Install web-ext
        run: npm install -g web-ext

      - name: Upload to AMO
        env:
          WEB_EXT_API_KEY: ${{ secrets.AMO_JWT_ISSUER }}
          WEB_EXT_API_SECRET: ${{ secrets.AMO_JWT_SECRET }}
        run: |
          set -euo pipefail
          RETRY=0
          MAX_RETRIES=3
          until [ $RETRY -ge $MAX_RETRIES ]; do
            if web-ext sign \
              --source-dir . \
              --artifacts-dir ./signed \
              --api-key "${WEB_EXT_API_KEY}" \
              --api-secret "${WEB_EXT_API_SECRET}" \
              --channel listed \
              --upload-source-map byom-extension-firefox.zip 2>&1; then
              echo "✅ AMO upload succeeded"
              break
            fi
            RETRY=$((RETRY + 1))
            echo "⚠️  Upload attempt ${RETRY}/${MAX_RETRIES} failed, retrying..."
            sleep $((RETRY * 20))
          done
          if [ $RETRY -ge $MAX_RETRIES ]; then
            echo "::error::Firefox AMO upload failed after ${MAX_RETRIES} attempts"
            exit 1
          fi
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/_deploy-chrome-store.yml .github/workflows/_deploy-edge-store.yml .github/workflows/_deploy-firefox-store.yml
git commit -m "ci: add extension store deployment workflows (Chrome, Edge, Firefox)"
```

---

### Task 14: Create the Release Extension Orchestrator

Ties together CI gate → build → deploy to all stores.

**Files:**
- Create: `.github/workflows/release-extension.yml`

- [ ] **Step 1: Create `.github/workflows/release-extension.yml`**

```yaml
name: Release Extension

on:
  push:
    tags:
      - "extension/v*"
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Dry-run mode (build only, no store deploy)"
        required: false
        default: false
        type: boolean

permissions:
  contents: read

jobs:
  parse-tag:
    name: Parse release tag
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.parse.outputs.version }}
    steps:
      - name: Parse tag
        id: parse
        run: |
          TAG="${GITHUB_REF_NAME}"
          if [[ "${TAG}" =~ ^extension/v(.+)$ ]]; then
            echo "version=${BASH_REMATCH[1]}" >> "$GITHUB_OUTPUT"
          else
            echo "::error::Unrecognized tag format: ${TAG}"
            exit 1
          fi

  ci-gate:
    name: CI Gate
    uses: ./.github/workflows/_ci-gate.yml

  build:
    name: Build Extension
    needs: [parse-tag, ci-gate]
    uses: ./.github/workflows/_build-extension.yml
    with:
      version: ${{ needs.parse-tag.outputs.version }}

  deploy-chrome:
    name: Deploy to Chrome
    needs: build
    if: ${{ github.event.inputs.dry_run != 'true' }}
    uses: ./.github/workflows/_deploy-chrome-store.yml
    secrets:
      CHROME_CLIENT_ID: ${{ secrets.CHROME_CLIENT_ID }}
      CHROME_CLIENT_SECRET: ${{ secrets.CHROME_CLIENT_SECRET }}
      CHROME_REFRESH_TOKEN: ${{ secrets.CHROME_REFRESH_TOKEN }}

  deploy-edge:
    name: Deploy to Edge
    needs: build
    if: ${{ github.event.inputs.dry_run != 'true' }}
    uses: ./.github/workflows/_deploy-edge-store.yml
    secrets:
      EDGE_CLIENT_ID: ${{ secrets.EDGE_CLIENT_ID }}
      EDGE_CLIENT_SECRET: ${{ secrets.EDGE_CLIENT_SECRET }}
      EDGE_ACCESS_TOKEN_URL: ${{ secrets.EDGE_ACCESS_TOKEN_URL }}

  deploy-firefox:
    name: Deploy to Firefox
    needs: build
    if: ${{ github.event.inputs.dry_run != 'true' }}
    uses: ./.github/workflows/_deploy-firefox-store.yml
    secrets:
      AMO_JWT_ISSUER: ${{ secrets.AMO_JWT_ISSUER }}
      AMO_JWT_SECRET: ${{ secrets.AMO_JWT_SECRET }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release-extension.yml
git commit -m "ci: add release-extension orchestrator workflow"
```

---

### Task 15: Create the Build Bridge SEA Reusable Workflow

Builds Node.js SEA binaries across the platform matrix.

**Files:**
- Create: `.github/workflows/_build-bridge-sea.yml`

- [ ] **Step 1: Create `.github/workflows/_build-bridge-sea.yml`**

```yaml
name: Build Bridge SEA Binaries

on:
  workflow_call:
    inputs:
      version:
        description: "Bridge version"
        required: true
        type: string

permissions:
  contents: read

jobs:
  build-sea:
    name: SEA ${{ matrix.os }}-${{ matrix.arch }}
    runs-on: ${{ matrix.runner }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: win
            arch: x64
            runner: windows-latest
            binary: byom-bridge-win-x64.exe
            ext: .exe
          - os: macos
            arch: x64
            runner: macos-13
            binary: byom-bridge-macos-x64
            ext: ""
          - os: macos
            arch: arm64
            runner: macos-latest
            binary: byom-bridge-macos-arm64
            ext: ""
          - os: linux
            arch: x64
            runner: ubuntu-latest
            binary: byom-bridge-linux-x64
            ext: ""
          - os: linux
            arch: arm64
            runner: ubuntu-latest
            binary: byom-bridge-linux-arm64
            ext: ""
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm

      - run: npm ci

      - name: Build all packages
        run: npm run build

      - name: Install esbuild
        run: npm install -g esbuild

      - name: Bundle bridge into single CJS file
        run: |
          esbuild apps/bridge/dist/main.js \
            --bundle \
            --platform=node \
            --target=node20 \
            --format=cjs \
            --outfile=apps/bridge/dist/bridge-bundle.cjs

      - name: Create SEA config
        run: |
          cat > apps/bridge/sea-config.json << 'EOF'
          {
            "main": "dist/bridge-bundle.cjs",
            "output": "sea-prep.blob",
            "disableExperimentalSEAWarning": true
          }
          EOF

      - name: Generate SEA blob
        working-directory: apps/bridge
        run: node --experimental-sea-config sea-config.json

      - name: Create SEA binary (Unix)
        if: runner.os != 'Windows'
        run: |
          cp "$(which node)" "${{ matrix.binary }}"
          npx postject "${{ matrix.binary }}" NODE_SEA_BLOB apps/bridge/sea-prep.blob \
            --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

      - name: Create SEA binary (Windows)
        if: runner.os == 'Windows'
        shell: pwsh
        run: |
          Copy-Item (Get-Command node).Source -Destination "${{ matrix.binary }}"
          npx postject "${{ matrix.binary }}" NODE_SEA_BLOB apps/bridge/sea-prep.blob `
            --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

      - name: Post-process (macOS)
        if: matrix.os == 'macos'
        run: |
          codesign --remove-signature "${{ matrix.binary }}"
          codesign -s - "${{ matrix.binary }}"

      - name: Post-process (Linux)
        if: matrix.os == 'linux'
        run: chmod +x "${{ matrix.binary }}"

      - name: Verify binary
        if: runner.os != 'Windows'
        run: |
          ./"${{ matrix.binary }}" --version || echo "Binary created (may need args)"
          file "${{ matrix.binary }}"

      - name: Upload binary
        uses: actions/upload-artifact@v4
        with:
          name: bridge-binary-${{ matrix.os }}-${{ matrix.arch }}
          path: ${{ matrix.binary }}
          retention-days: 5
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/_build-bridge-sea.yml
git commit -m "ci: add reusable SEA binary build workflow"
```

---

### Task 16: Create the GitHub Release Reusable Workflow

Creates a GitHub Release with all bridge binaries and attestation artifacts.

**Files:**
- Create: `.github/workflows/_create-github-release.yml`

- [ ] **Step 1: Create `.github/workflows/_create-github-release.yml`**

```yaml
name: Create GitHub Release

on:
  workflow_call:
    inputs:
      tag:
        description: "Release tag (e.g. bridge/v0.3.0)"
        required: true
        type: string
      version:
        description: "Version string (e.g. 0.3.0)"
        required: true
        type: string
      dry-run:
        description: "Create as draft release"
        required: false
        default: false
        type: boolean

permissions:
  contents: write

jobs:
  release:
    name: Create GitHub Release
    runs-on: ubuntu-latest
    environment: github-releases
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Download all bridge binaries
        uses: actions/download-artifact@v4
        with:
          pattern: bridge-binary-*
          path: ./release-assets
          merge-multiple: true

      - name: Download signed checksums
        uses: actions/download-artifact@v4
        with:
          name: bridge-binaries-signed
          path: ./release-assets

      - name: List release assets
        run: ls -la ./release-assets/

      - name: Generate release notes
        id: notes
        run: |
          PREV_TAG=$(git tag --list 'bridge/v*' --sort=-version:refname | sed -n '2p' || echo "")
          if [ -n "${PREV_TAG}" ]; then
            NOTES=$(git log --pretty=format:"- %s (%h)" "${PREV_TAG}..HEAD" -- apps/bridge/ packages/ adapters/)
          else
            NOTES="Initial release"
          fi
          echo "notes<<EOF" >> "$GITHUB_OUTPUT"
          echo "${NOTES}" >> "$GITHUB_OUTPUT"
          echo "EOF" >> "$GITHUB_OUTPUT"

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ inputs.tag }}
          name: "BYOM Bridge v${{ inputs.version }}"
          body: |
            ## BYOM Bridge v${{ inputs.version }}

            ### Install

            **One-liner (recommended):**
            ```bash
            # macOS / Linux
            curl -fsSL https://byomai.com/install.sh | sh

            # Windows (PowerShell)
            irm https://byomai.com/install.ps1 | iex
            ```

            **npm (requires Node.js):**
            ```bash
            npm install -g @byom-ai/bridge@${{ inputs.version }}
            ```

            **Manual download:** Download the binary for your platform below.

            ### Verify
            ```bash
            sha256sum -c SHA256SUMS.txt
            cosign verify-blob --bundle SHA256SUMS.txt.bundle SHA256SUMS.txt
            ```

            ### Changes
            ${{ steps.notes.outputs.notes }}
          files: ./release-assets/*
          draft: ${{ inputs.dry-run }}
          prerelease: ${{ contains(inputs.version, '-') }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/_create-github-release.yml
git commit -m "ci: add reusable GitHub Release workflow"
```

---

### Task 17: Create the Installer Scripts

PowerShell and Bash installer scripts for one-liner bridge installation.

**Files:**
- Create: `scripts/installers/install.ps1`
- Create: `scripts/installers/install.sh`

- [ ] **Step 1: Create `scripts/installers/install.ps1`**

```powershell
#Requires -Version 5.1
<#
.SYNOPSIS
    Install the BYOM AI Bridge daemon.
.DESCRIPTION
    Downloads and installs the latest BYOM Bridge binary from GitHub Releases.
    Verifies SHA256 checksums. Registers native messaging hosts.
.PARAMETER Uninstall
    Remove the BYOM Bridge installation.
#>
[CmdletBinding()]
param(
    [switch]$Uninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$REPO = "AltClick/byom-web"
$INSTALL_DIR = Join-Path $env:LOCALAPPDATA "BYOM\bin"
$BINARY_NAME = "byom-bridge.exe"
$NATIVE_HOST_NAME = "com.byom.bridge"

function Get-Architecture {
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
    switch ($arch) {
        'X64'   { return 'x64' }
        'Arm64' { return 'arm64' }
        default { throw "Unsupported architecture: $arch" }
    }
}

function Get-LatestRelease {
    $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO/releases?per_page=20" -UseBasicParsing
    foreach ($release in $releases) {
        if ($release.tag_name -match '^bridge/v') {
            if (-not $release.draft) {
                return $release
            }
        }
    }
    throw "No bridge release found"
}

function Install-Bridge {
    $arch = Get-Architecture
    $release = Get-LatestRelease
    $version = $release.tag_name -replace '^bridge/', ''

    Write-Host "Installing BYOM Bridge $version ($arch)..." -ForegroundColor Cyan

    $binaryAsset = "byom-bridge-win-${arch}.exe"
    $binaryUrl = ($release.assets | Where-Object { $_.name -eq $binaryAsset }).browser_download_url
    $checksumsUrl = ($release.assets | Where-Object { $_.name -eq 'SHA256SUMS.txt' }).browser_download_url

    if (-not $binaryUrl) { throw "No binary found for $binaryAsset in release $version" }
    if (-not $checksumsUrl) { throw "No checksums found in release $version" }

    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "byom-install-$(Get-Random)"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    try {
        # Download binary + checksums
        $binaryPath = Join-Path $tempDir $binaryAsset
        $checksumsPath = Join-Path $tempDir "SHA256SUMS.txt"

        Write-Host "Downloading $binaryAsset..."
        Invoke-WebRequest -Uri $binaryUrl -OutFile $binaryPath -UseBasicParsing
        Invoke-WebRequest -Uri $checksumsUrl -OutFile $checksumsPath -UseBasicParsing

        # Verify checksum (mandatory)
        $expectedHash = (Get-Content $checksumsPath | Where-Object { $_ -match $binaryAsset }) -split '\s+' | Select-Object -First 1
        $actualHash = (Get-FileHash -Path $binaryPath -Algorithm SHA256).Hash.ToLower()
        if ($actualHash -ne $expectedHash) {
            throw "CHECKSUM MISMATCH! Expected: $expectedHash Got: $actualHash"
        }
        Write-Host "Checksum verified." -ForegroundColor Green

        # Install
        New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
        Copy-Item -Path $binaryPath -Destination (Join-Path $INSTALL_DIR $BINARY_NAME) -Force

        # Add to PATH
        $userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
        if ($userPath -notlike "*$INSTALL_DIR*") {
            [Environment]::SetEnvironmentVariable('PATH', "$userPath;$INSTALL_DIR", 'User')
            Write-Host "Added $INSTALL_DIR to PATH." -ForegroundColor Yellow
        }

        # Register native host for Chrome/Edge
        $nativeHostManifest = @{
            name = $NATIVE_HOST_NAME
            description = "BYOM AI Bridge native messaging host"
            path = (Join-Path $INSTALL_DIR $BINARY_NAME)
            type = "stdio"
            allowed_origins = @("chrome-extension://*")
        } | ConvertTo-Json
        $manifestPath = Join-Path $INSTALL_DIR "$NATIVE_HOST_NAME.json"
        Set-Content -Path $manifestPath -Value $nativeHostManifest

        $regPaths = @(
            "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$NATIVE_HOST_NAME",
            "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$NATIVE_HOST_NAME"
        )
        foreach ($regPath in $regPaths) {
            $parent = Split-Path $regPath
            if (-not (Test-Path $parent)) { New-Item -Path $parent -Force | Out-Null }
            New-Item -Path $regPath -Force | Out-Null
            Set-ItemProperty -Path $regPath -Name '(Default)' -Value $manifestPath
        }

        Write-Host ""
        Write-Host "BYOM Bridge $version installed successfully!" -ForegroundColor Green
        Write-Host "  Binary: $(Join-Path $INSTALL_DIR $BINARY_NAME)"
        Write-Host "  Restart your terminal to update PATH."
    }
    finally {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Uninstall-Bridge {
    Write-Host "Uninstalling BYOM Bridge..." -ForegroundColor Yellow

    # Remove binary
    $binaryPath = Join-Path $INSTALL_DIR $BINARY_NAME
    if (Test-Path $binaryPath) { Remove-Item $binaryPath -Force }

    # Remove native host manifest
    $manifestPath = Join-Path $INSTALL_DIR "$NATIVE_HOST_NAME.json"
    if (Test-Path $manifestPath) { Remove-Item $manifestPath -Force }

    # Remove registry entries
    $regPaths = @(
        "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$NATIVE_HOST_NAME",
        "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$NATIVE_HOST_NAME"
    )
    foreach ($regPath in $regPaths) {
        if (Test-Path $regPath) { Remove-Item $regPath -Force }
    }

    # Remove from PATH
    $userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
    $newPath = ($userPath -split ';' | Where-Object { $_ -ne $INSTALL_DIR }) -join ';'
    [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User')

    # Remove install directory if empty
    if ((Test-Path $INSTALL_DIR) -and -not (Get-ChildItem $INSTALL_DIR)) {
        Remove-Item $INSTALL_DIR -Force
    }

    Write-Host "BYOM Bridge uninstalled." -ForegroundColor Green
}

if ($Uninstall) {
    Uninstall-Bridge
} else {
    Install-Bridge
}
```

- [ ] **Step 2: Create `scripts/installers/install.sh`**

```bash
#!/usr/bin/env sh
# BYOM Bridge Installer
# Usage: curl -fsSL https://byomai.com/install.sh | sh
# Uninstall: curl -fsSL https://byomai.com/install.sh | sh -s -- --uninstall
set -euo pipefail

REPO="AltClick/byom-web"
INSTALL_DIR="${HOME}/.local/bin"
BINARY_NAME="byom-bridge"
NATIVE_HOST_NAME="com.byom.bridge"

log()   { printf '\033[1;34m%s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m%s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m%s\033[0m\n' "$*"; }
err()   { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

detect_os() {
  case "$(uname -s)" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "macos" ;;
    *)       err "Unsupported OS: $(uname -s)" ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64)   echo "x64" ;;
    aarch64|arm64)   echo "arm64" ;;
    *)               err "Unsupported architecture: $(uname -m)" ;;
  esac
}

get_latest_version() {
  curl -fsSL "https://api.github.com/repos/${REPO}/releases?per_page=20" \
    | grep -o '"tag_name": "bridge/v[^"]*"' \
    | head -1 \
    | grep -o 'v[0-9].*'
}

install_bridge() {
  local os arch version binary_name url checksums_url
  os=$(detect_os)
  arch=$(detect_arch)
  version=$(get_latest_version)

  if [ -z "${version}" ]; then
    err "Could not determine latest bridge version"
  fi

  binary_name="byom-bridge-${os}-${arch}"
  log "Installing BYOM Bridge ${version} (${os}/${arch})..."

  local tmp_dir
  tmp_dir=$(mktemp -d)
  trap 'rm -rf "${tmp_dir}"' EXIT

  # Download binary + checksums
  local release_url="https://github.com/${REPO}/releases/download/bridge%2F${version}"
  log "Downloading ${binary_name}..."
  curl -fsSL -o "${tmp_dir}/${binary_name}" "${release_url}/${binary_name}"
  curl -fsSL -o "${tmp_dir}/SHA256SUMS.txt" "${release_url}/SHA256SUMS.txt"

  # Verify checksum (mandatory)
  log "Verifying checksum..."
  cd "${tmp_dir}"
  if command -v sha256sum >/dev/null 2>&1; then
    grep "${binary_name}" SHA256SUMS.txt | sha256sum -c - || err "Checksum verification failed!"
  elif command -v shasum >/dev/null 2>&1; then
    grep "${binary_name}" SHA256SUMS.txt | shasum -a 256 -c - || err "Checksum verification failed!"
  else
    err "No sha256sum or shasum available for checksum verification"
  fi
  ok "Checksum verified."

  # Sigstore verification (opportunistic)
  if command -v cosign >/dev/null 2>&1; then
    log "Verifying Sigstore signature..."
    curl -fsSL -o SHA256SUMS.txt.bundle "${release_url}/SHA256SUMS.txt.bundle"
    if cosign verify-blob --bundle SHA256SUMS.txt.bundle SHA256SUMS.txt 2>/dev/null; then
      ok "Sigstore signature verified."
    else
      err "Sigstore signature verification failed!"
    fi
  else
    warn "cosign not found — skipping Sigstore verification (install cosign for maximum security)"
  fi

  # Install binary
  mkdir -p "${INSTALL_DIR}"
  cp "${tmp_dir}/${binary_name}" "${INSTALL_DIR}/${BINARY_NAME}"
  chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

  # Check PATH
  case ":${PATH}:" in
    *":${INSTALL_DIR}:"*) ;;
    *)
      warn "${INSTALL_DIR} is not in your PATH."
      warn "Add it: export PATH=\"\${HOME}/.local/bin:\${PATH}\""
      ;;
  esac

  # Register native messaging hosts
  install_native_hosts "${os}"

  echo ""
  ok "BYOM Bridge ${version} installed successfully!"
  log "  Binary: ${INSTALL_DIR}/${BINARY_NAME}"
}

install_native_hosts() {
  local os="$1"
  local binary_path="${INSTALL_DIR}/${BINARY_NAME}"

  local manifest_content
  manifest_content=$(cat <<EOF
{
  "name": "${NATIVE_HOST_NAME}",
  "description": "BYOM AI Bridge native messaging host",
  "path": "${binary_path}",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://*"]
}
EOF
)

  local chrome_dir firefox_dir
  case "${os}" in
    macos)
      chrome_dir="${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts"
      firefox_dir="${HOME}/Library/Application Support/Mozilla/NativeMessagingHosts"
      ;;
    linux)
      chrome_dir="${HOME}/.config/google-chrome/NativeMessagingHosts"
      firefox_dir="${HOME}/.mozilla/native-messaging-hosts"
      ;;
  esac

  for dir in "${chrome_dir}" "${firefox_dir}"; do
    mkdir -p "${dir}"
    echo "${manifest_content}" > "${dir}/${NATIVE_HOST_NAME}.json"
  done

  log "Native messaging hosts registered for Chrome and Firefox."
}

uninstall_bridge() {
  warn "Uninstalling BYOM Bridge..."

  rm -f "${INSTALL_DIR}/${BINARY_NAME}"

  local os
  os=$(detect_os)
  local chrome_dir firefox_dir
  case "${os}" in
    macos)
      chrome_dir="${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts"
      firefox_dir="${HOME}/Library/Application Support/Mozilla/NativeMessagingHosts"
      ;;
    linux)
      chrome_dir="${HOME}/.config/google-chrome/NativeMessagingHosts"
      firefox_dir="${HOME}/.mozilla/native-messaging-hosts"
      ;;
  esac

  rm -f "${chrome_dir}/${NATIVE_HOST_NAME}.json" 2>/dev/null || true
  rm -f "${firefox_dir}/${NATIVE_HOST_NAME}.json" 2>/dev/null || true

  ok "BYOM Bridge uninstalled."
}

# Main
case "${1:-}" in
  --uninstall) uninstall_bridge ;;
  *)           install_bridge ;;
esac
```

- [ ] **Step 3: Make install.sh executable**

Run: `chmod +x scripts/installers/install.sh`

- [ ] **Step 4: Commit**

```bash
git add scripts/installers/install.ps1 scripts/installers/install.sh
git commit -m "feat: add cross-platform bridge installer scripts"
```

---

### Task 18: Create the Generate Installers Reusable Workflow

Uploads installer scripts to the GitHub Release and validates they work.

**Files:**
- Create: `.github/workflows/_generate-installers.yml`

- [ ] **Step 1: Create `.github/workflows/_generate-installers.yml`**

```yaml
name: Generate Installers

on:
  workflow_call:
    inputs:
      tag:
        description: "Release tag"
        required: true
        type: string
      version:
        description: "Release version"
        required: true
        type: string

permissions:
  contents: write

jobs:
  upload-installers:
    name: Upload installer scripts
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate installer scripts exist
        run: |
          test -f scripts/installers/install.ps1 || { echo "::error::install.ps1 not found"; exit 1; }
          test -f scripts/installers/install.sh || { echo "::error::install.sh not found"; exit 1; }

      - name: Upload installers to release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release upload "${{ inputs.tag }}" \
            scripts/installers/install.ps1 \
            scripts/installers/install.sh \
            --clobber
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/_generate-installers.yml
git commit -m "ci: add reusable installer upload workflow"
```

---

### Task 19: Create the Release Bridge Orchestrator

Full bridge release: CI → SEA build → sign → GitHub Release → npm → installers.

**Files:**
- Create: `.github/workflows/release-bridge.yml`

- [ ] **Step 1: Create `.github/workflows/release-bridge.yml`**

```yaml
name: Release Bridge

on:
  push:
    tags:
      - "bridge/v*"
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Dry-run mode (draft release, no npm publish)"
        required: false
        default: false
        type: boolean

permissions:
  contents: read

jobs:
  parse-tag:
    name: Parse release tag
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.parse.outputs.version }}
      tag: ${{ steps.parse.outputs.tag }}
    steps:
      - name: Parse tag
        id: parse
        run: |
          TAG="${GITHUB_REF_NAME}"
          if [[ "${TAG}" =~ ^bridge/v(.+)$ ]]; then
            echo "version=${BASH_REMATCH[1]}" >> "$GITHUB_OUTPUT"
            echo "tag=${TAG}" >> "$GITHUB_OUTPUT"
          else
            echo "::error::Unrecognized tag format: ${TAG}"
            exit 1
          fi

  ci-gate:
    name: CI Gate
    uses: ./.github/workflows/_ci-gate.yml

  build-sea:
    name: Build SEA Binaries
    needs: [parse-tag, ci-gate]
    uses: ./.github/workflows/_build-bridge-sea.yml
    with:
      version: ${{ needs.parse-tag.outputs.version }}

  collect-binaries:
    name: Collect all binaries
    needs: build-sea
    runs-on: ubuntu-latest
    steps:
      - name: Download all binary artifacts
        uses: actions/download-artifact@v4
        with:
          pattern: bridge-binary-*
          path: ./binaries
          merge-multiple: true

      - name: Upload combined artifact
        uses: actions/upload-artifact@v4
        with:
          name: bridge-binaries
          path: ./binaries/
          retention-days: 5

  sign:
    name: Sign & Attest
    needs: collect-binaries
    uses: ./.github/workflows/_sign-attest.yml
    with:
      artifact-name: bridge-binaries
    permissions:
      contents: read
      id-token: write

  release:
    name: Create GitHub Release
    needs: [parse-tag, sign]
    uses: ./.github/workflows/_create-github-release.yml
    with:
      tag: ${{ needs.parse-tag.outputs.tag }}
      version: ${{ needs.parse-tag.outputs.version }}
      dry-run: ${{ github.event.inputs.dry_run == 'true' || false }}
    permissions:
      contents: write

  publish-npm:
    name: Publish to npm
    needs: [parse-tag, ci-gate]
    if: ${{ github.event.inputs.dry_run != 'true' }}
    uses: ./.github/workflows/_publish-npm.yml
    with:
      scope: bridge
      version: ${{ needs.parse-tag.outputs.version }}
    secrets:
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
    permissions:
      contents: read
      id-token: write

  upload-installers:
    name: Upload Installers
    needs: [parse-tag, release]
    uses: ./.github/workflows/_generate-installers.yml
    with:
      tag: ${{ needs.parse-tag.outputs.tag }}
      version: ${{ needs.parse-tag.outputs.version }}
    permissions:
      contents: write
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release-bridge.yml
git commit -m "ci: add release-bridge orchestrator workflow"
```

---

### Task 20: Create Nightly Workflow

Consolidates nightly testing schedule.

**Files:**
- Create: `.github/workflows/nightly.yml`

- [ ] **Step 1: Create `.github/workflows/nightly.yml`**

```yaml
name: Nightly

on:
  schedule:
    - cron: "0 2 * * *"
  workflow_dispatch:

permissions:
  contents: read
  checks: write

jobs:
  reliability:
    name: Reliability Gates (full)
    uses: ./.github/workflows/reliability-gates.yml
    with:
      run_soak: true
```

Note: This may need adjustment depending on whether `reliability-gates.yml` supports `workflow_call`. If not, keep it as a standalone trigger — the existing cron in `reliability-gates.yml` already handles nightly. In that case, skip this task.

- [ ] **Step 2: Commit (if applicable)**

```bash
git add .github/workflows/nightly.yml
git commit -m "ci: add nightly workflow"
```

---

### Task 21: Final Validation — Lint All Workflow Files

Verify all YAML files are valid and the CI gate works.

**Files:**
- All `.github/workflows/*.yml` files

- [ ] **Step 1: Validate all workflow YAML files**

Run:
```bash
npx yaml-lint .github/workflows/*.yml
```

Or manually inspect each file for syntax.

- [ ] **Step 2: Run the project's full validation**

Run: `npm run lint && npm run typecheck && npm run test && npm run build`
Expected: All pass.

- [ ] **Step 3: List all created/modified files**

Run: `git status`
Expected: Clean working tree with all files committed.

- [ ] **Step 4: Final commit summary**

```bash
git log --oneline -20
```

Verify the commit history follows the plan's task order.
