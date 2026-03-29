# Contributing to Arlopass

Thank you for your interest in contributing to Arlopass. This guide covers everything you need to get started.

## Prerequisites

- **Node.js** 20+
- **pnpm** 10.11+ — enable via `corepack enable`
- **Chrome or Chromium** for browser extension development

## Getting Started

```bash
git clone https://github.com/arlopass/arlopass.git
cd arlopass
pnpm install
pnpm run build
pnpm run lint && pnpm run typecheck && pnpm test
```

## Development Workflow

1. Fork the repository and clone your fork.
2. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/my-feature main
   ```
3. Make your changes and add tests.
4. Run the full check suite before pushing:
   ```bash
   pnpm run lint
   pnpm run typecheck
   pnpm test
   ```
5. Push your branch and open a pull request against `main`.

## Project Structure

| Directory | Description |
| --- | --- |
| `packages/` | Core libraries — protocol, web-sdk, react-sdk, react-ui, policy, audit, telemetry, ai-sdk-transport, ui-registry |
| `adapters/` | AI provider adapters (ollama, openai, claude, bedrock, vertex-ai, gemini, perplexity, etc.) plus runtime and tooling |
| `apps/` | Applications — bridge daemon, browser extension, examples app, landing page |
| `ops/` | SLO definitions, runbooks, reliability tests |
| `e2e/` | Playwright end-to-end tests |

> Note
> `ops/` is intentionally excluded from `pnpm-workspace.yaml` globs.
> This keeps operational tooling isolated from default recursive workspace runs.
> Run ops checks explicitly with:
>
> ```bash
> pnpm --filter @arlopass/ops run typecheck
> pnpm --filter @arlopass/ops run test
> ```

## Code Style

- TypeScript strict mode is enforced across all packages.
- ESLint rules are configured at the project root — run `pnpm run lint` to check.
- Follow existing patterns in the codebase.
- Unit tests use **Vitest**; end-to-end tests use **Playwright**.

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Purpose |
| --- | --- |
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation changes |
| `chore:` | Maintenance and tooling |
| `test:` | Test additions or changes |
| `refactor:` | Code restructuring without behavior change |

Example: `feat(web-sdk): add streaming abort support`

## Pull Requests

- Link to a related issue if one exists.
- Describe what changed and why.
- Ensure CI passes — lint, typecheck, test, and build must all succeed.
- Keep each PR to one logical change.

## Reporting Issues

- Use [GitHub Issues](https://github.com/arlopass/arlopass/issues) with the provided templates.
- For **security vulnerabilities**, follow the process in `SECURITY.md` — do **not** file public issues.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
