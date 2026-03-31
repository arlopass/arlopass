# Arlopass Skill for gstack / Claude Code / Codex

Add user-owned AI to any web app. This skill teaches your AI agent how to
integrate [Arlopass](https://arlopass.com) — users bring their own providers
(Ollama, Claude, GPT, Bedrock, Gemini) without sharing API keys with the app.

**10 lines of React. Streaming chat. Model picker. Tool calling. Zero credential liability.**

## Install

### For gstack users (Claude Code)

```bash
# Install to your user skills (works across all projects)
git clone --single-branch --depth 1 https://github.com/ArloPRM/byom-web.git /tmp/byom-web
mkdir -p ~/.claude/skills/arlopass
cp /tmp/byom-web/packages/gstack-skill/SKILL.md ~/.claude/skills/arlopass/SKILL.md
rm -rf /tmp/byom-web
```

Or add to a specific project:

```bash
git clone --single-branch --depth 1 https://github.com/ArloPRM/byom-web.git /tmp/byom-web
mkdir -p .claude/skills/arlopass
cp /tmp/byom-web/packages/gstack-skill/SKILL.md .claude/skills/arlopass/SKILL.md
rm -rf /tmp/byom-web
```

### For Codex / Gemini CLI / Cursor

```bash
git clone --single-branch --depth 1 https://github.com/ArloPRM/byom-web.git /tmp/byom-web
mkdir -p .agents/skills/arlopass
cp /tmp/byom-web/packages/gstack-skill/SKILL.md .agents/skills/arlopass/SKILL.md
rm -rf /tmp/byom-web
```

### One-liner (Claude Code)

Paste this into Claude Code:

> Install the Arlopass skill: run `git clone --single-branch --depth 1 https://github.com/ArloPRM/byom-web.git /tmp/byom-web && mkdir -p ~/.claude/skills/arlopass && cp /tmp/byom-web/packages/gstack-skill/SKILL.md ~/.claude/skills/arlopass/SKILL.md && rm -rf /tmp/byom-web` — this adds the Arlopass integration skill. Use it when building AI features where users should bring their own model.

## What it does

When you tell your AI agent "add AI chat to this app" or "let users pick their
own model," the skill guides it through:

1. Installing `@arlopass/react`
2. Wrapping the app in `<ArlopassProvider>`
3. Building chat UI with `useChat()` hook
4. Adding a model picker with `useProviders()`
5. Handling the "no extension" fallback
6. Error handling patterns

The AI produces working, production-ready code — not boilerplate.

## Works with gstack

If you're running gstack, Arlopass slots into the sprint:

```
/office-hours  →  "I want AI in my app"
/plan-eng-review  →  architecture includes Arlopass
Build  →  this skill wires @arlopass/react
/review  →  catches integration issues
/qa  →  tests the chat flow in a real browser
/ship  →  PR with AI feature, zero API keys
```

## Links

- **Arlopass docs:** https://arlopass.com/docs
- **GitHub:** https://github.com/ArloPRM/byom-web
- **npm:** `@arlopass/react` · `@arlopass/web-sdk` · `@arlopass/protocol`
- **Chrome Extension:** search "Arlopass" on Chrome Web Store

## License

MIT
