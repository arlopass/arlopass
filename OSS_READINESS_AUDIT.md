# Open Source Readiness Audit

**Date:** 2026-03-29
**Scope:** Full monorepo — packages, adapters, apps, CI/CD, legal, security, documentation
**Verdict:** Not yet ready for public release. Critical blockers must be resolved first.

---

## Summary

| Category | Status | Score |
|----------|--------|-------|
| Licensing & Legal | Blocked | 2/10 |
| Security Posture | Good | 8/10 |
| CI/CD & Release Automation | Excellent | 9/10 |
| Documentation | Good | 7/10 |
| Package Metadata | Needs Work | 6/10 |
| Community Governance | Missing | 1/10 |
| Code Quality & Hygiene | Good | 8/10 |

---

## P0 — Must Fix Before Going Public

### 1. No LICENSE file exists

The repository claims MIT licensing in the README badge, in individual `package.json` files, and on the landing page — but no `LICENSE` file exists at the root.

- The README links to `[LICENSE](LICENSE)` which is a dead link
- GitHub cannot auto-detect the license without this file
- npm will flag packages as unlicensed
- 19 publishable packages declare `"license": "MIT"` but there is no license text to back it up

**Fix:** Create `LICENSE` at the root with the standard MIT license text, including the correct copyright holder and year.

### 2. No SECURITY.md file exists

The README states: _"For security vulnerabilities, please see our [SECURITY.md](SECURITY.md)"_ — but this file does not exist. A broken link to a security policy is worse than no mention at all.

The project plan (§7.8) specifies this as a requirement: _"Public SECURITY.md with disclosure and response SLAs."_

**Fix:** Create `SECURITY.md` with:
- Supported versions
- How to report a vulnerability (email: `security@arlopass.com` per landing page docs)
- Expected response timeline
- Disclosure policy

### 3. No CONTRIBUTING.md

No contribution guidelines exist. Contributors will not know:
- Fork/branch/PR workflow
- Code style expectations (ESLint, strict TypeScript)
- How to run tests and builds
- Commit message conventions
- What requires a CLA or DCO sign-off (if any)

**Fix:** Create `CONTRIBUTING.md` covering the above.

### 4. No CODE_OF_CONDUCT.md

Expected by GitHub, npm, and modern OSS communities. Without one, contributors have no behavioral guidelines and maintainers have no enforcement framework.

**Fix:** Adopt Contributor Covenant v2.1 or similar.

### 5. .gitignore does not cover nested .env files

The current `.gitignore` has:
```
.env
```
This only matches `.env` at the repository root. Any `.env` file in a subdirectory (e.g. `apps/landing/.env`, `apps/bridge/.env`) would not be excluded.

Currently no nested `.env` files are tracked in git — but this is only by luck, not by design.

**Fix:** Change `.env` to `**/.env` in `.gitignore`.

### 6. Root package.json missing `license` field

The root `package.json` declares `"private": true` (correct for monorepo root) but has no `"license"` field. Adding `"license": "MIT"` makes the intent unambiguous.

### 7. `@arlopass/ai-sdk-transport` has wrong repository URL

`packages/ai-sdk-transport/package.json` points to:
```json
"url": "https://github.com/arlopass/arlopass-web.git"
```
Should be:
```json
"url": "https://github.com/arlopass/arlopass.git"
```
This breaks npm package page links and GitHub integration.

---

## P1 — Should Fix Before First Stable Release

### 8. No `.github/ISSUE_TEMPLATE/` directory

No structured issue templates exist. Bug reports and feature requests will arrive in unstructured formats, making triage harder.

**Fix:** Create at minimum:
- `.github/ISSUE_TEMPLATE/bug_report.yml` (steps to reproduce, environment, expected vs actual)
- `.github/ISSUE_TEMPLATE/feature_request.yml` (use case, proposed solution)
- `.github/ISSUE_TEMPLATE/config.yml` (optional: link to discussions)

### 9. No `.github/pull_request_template.md`

PRs lack a standard template guiding contributors to document changes, link issues, and confirm test coverage.

### 10. No automated dependency updates

No `dependabot.yml` or `renovate.json` configuration exists. Contributors and maintainers get no automated security patch PRs.

**Fix:** Add `.github/dependabot.yml`:
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

### 11. No Node.js version enforcement

CI workflows pin Node 20, the README says "Node.js 20+", but there is no:
- `engines` field in root `package.json`
- `.nvmrc` or `.node-version` file

Contributors on Node 18 or 22 may encounter subtle issues.

**Fix:** Add to root `package.json`:
```json
"engines": { "node": ">=20" }
```
And create `.nvmrc`:
```
20
```

### 12. Missing README files (8 packages)

These publishable or visible packages have no README:

| Package | Path |
|---------|------|
| `@arlopass/adapter-openai` | `adapters/adapter-openai/` |
| `@arlopass/adapter-gemini` | `adapters/adapter-gemini/` |
| `@arlopass/adapter-perplexity` | `adapters/adapter-perplexity/` |
| `@arlopass/react` | `packages/react-sdk/` |
| `@arlopass/react-ui` | `packages/react-ui/` |
| `@arlopass/ui` | `packages/ui-registry/` |
| `@arlopass/landing` | `apps/landing/` |

For planned/stub adapters, even a one-paragraph README with status is better than nothing. For react, react-ui, and ui-registry, usage examples are essential.

### 13. Missing `description` in package.json (7 packages)

Empty descriptions make npm package pages unhelpful and hurt discoverability:

- `@arlopass/adapter-tooling`
- `@arlopass/extension`
- `@arlopass/examples-web`
- `@arlopass/landing`
- `@arlopass/audit`
- `@arlopass/telemetry`
- `@arlopass/ui` (ui-registry)

### 14. No CHANGELOG.md

A web changelog page exists at `apps/landing/src/pages/changelog.astro`, but there is no machine-readable `CHANGELOG.md` at the repository root. Many OSS consumers and tooling (npm, GitHub Releases) expect this file.

### 15. No `.github/CODEOWNERS`

Without CODEOWNERS, GitHub cannot auto-assign reviewers to PRs. As the contributor base grows, this becomes important for code quality.

### 16. Private packages missing explicit license declarations

These `private: true` packages have no `"license"` field:
- `@arlopass/landing`
- `@arlopass/extension`
- `@arlopass/examples-web`
- `@arlopass/ops`

While private packages don't get published, explicit licensing in every `package.json` removes ambiguity for contributors and forks.

---

## P2 — Nice to Have

### 17. No pre-commit hooks

No `.husky/` directory or `lint-staged` configuration exists. Contributors can push code that fails CI locally. Consider adding a lightweight pre-commit hook that runs `pnpm lint`.

### 18. No `.editorconfig`

No `.editorconfig` at the root. While ESLint covers formatting, `.editorconfig` ensures consistent indentation and line endings across editors for contributors who don't use VS Code.

### 19. No SPDX license headers in source files

The project plan (§14.3) specifies: _"SPDX headers, license checks, third-party notices."_ No source files currently have `// SPDX-License-Identifier: MIT` headers. This is common for MIT-licensed projects but improves compliance tooling compatibility.

### 20. No `.github/FUNDING.yml`

Optional, but if you want GitHub Sponsors or other funding visibility, create this file.

### 21. `ops/` excluded from pnpm workspace

`pnpm-workspace.yaml` lists `packages/*`, `apps/*`, `adapters/*` — but `ops/` has its own `package.json` and is not included. This may be intentional (ops has its own dependency tree) but should be documented.

### 22. No NOTICE file

For MIT-licensed projects, a NOTICE file is not strictly required, but it is good practice for attributing significant third-party dependencies.

---

## What's Working Well

These areas are strong and need no changes:

### CI/CD & Release Automation (9/10)
- 17 GitHub Actions workflows covering CI, multi-platform builds, npm publishing, and browser store deployments
- Tag-based release pipeline (`core/v*`, `adapter/*/v*`, `bridge/v*`, `extension/v*`)
- SLSA provenance signing via Sigstore for all npm packages
- Multi-store extension deployment (Chrome Web Store, Edge Add-ons, Firefox AMO)
- Multi-platform bridge binaries (Windows x64, macOS x64/arm64, Linux x64/arm64)
- Extension size and CSP validation in CI

### Security Architecture
- Proper `escapeHtml()` everywhere in extension `innerHTML` usage
- `DOMPurify.sanitize()` for the one `dangerouslySetInnerHTML` usage (Markdown component)
- GitHub Actions secrets for all credentials (NPM_TOKEN, Chrome/Edge/Firefox store secrets)
- No hardcoded secrets in any source file
- Test credentials are clearly fake (`sk-test-key`)
- `e2e/.env.e2e.example` template provided with explicit "NEVER commit" warning
- All publishable packages enable `"provenance": true`
- Comprehensive security documentation in landing page docs

### TypeScript Configuration
- Strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- Consistent `tsconfig.base.json` inheritance across all packages
- Proper `declaration` and `declarationMap` for library consumers

### Package Structure
- All publishable packages have `"files": ["dist"]` — only built output gets published
- All set `"publishConfig": { "access": "public", "provenance": true }`
- Consistent package naming under `@arlopass/` scope
- Root `package.json` correctly marked `"private": true`

### Testing Infrastructure
- Vitest workspace covering all packages, apps, and adapters
- Playwright E2E with 5 projects (extension, webapp, integration, live-setup, live-providers)
- Reliability gates: chaos, version-skew, adapter conformance, soak tests
- SLO definitions and runbooks in `ops/`

### README Quality (Root)
- Comprehensive, well-structured README with architecture diagram
- Code examples for all major use cases (connect, stream, adapters, custom transport)
- Clear getting started instructions for Windows and macOS/Linux
- Complete package index with status

---

## Checklist

Copy this into an issue or PR to track progress:

```markdown
### P0 — Blockers
- [ ] Create `LICENSE` (MIT) at repository root
- [ ] Create `SECURITY.md` with disclosure policy
- [ ] Create `CONTRIBUTING.md` with dev workflow
- [ ] Create `CODE_OF_CONDUCT.md`
- [ ] Fix `.gitignore`: change `.env` → `**/.env`
- [ ] Add `"license": "MIT"` to root `package.json`
- [ ] Fix `ai-sdk-transport` repository URL (`arlopass-web` → `arlopass`)

### P1 — Before Stable Release
- [ ] Add `.github/ISSUE_TEMPLATE/` (bug, feature)
- [ ] Add `.github/pull_request_template.md`
- [ ] Add `.github/dependabot.yml`
- [ ] Add `engines` field to root `package.json` and create `.nvmrc`
- [ ] Add README to: adapter-openai, adapter-gemini, adapter-perplexity, react-sdk, react-ui, ui-registry
- [ ] Add `description` to 7 packages missing it
- [ ] Create `CHANGELOG.md` at root
- [ ] Add `.github/CODEOWNERS`
- [ ] Add `"license": "MIT"` to private packages (extension, examples-web, landing, ops)

### P2 — Polish
- [ ] Add `.husky/` pre-commit hooks
- [ ] Add `.editorconfig`
- [ ] Add SPDX headers to source files
- [ ] Add `.github/FUNDING.yml`
- [ ] Document `ops/` workspace exclusion
- [ ] Create `NOTICE` file
```
