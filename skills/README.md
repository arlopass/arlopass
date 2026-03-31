# Arlopass Skills for AI Agents

Teach your AI coding agent how to integrate Arlopass — let users bring their own
AI providers (Ollama, Claude, GPT, Bedrock, Gemini) without sharing API keys
with your app.

These skills work with **Claude Code**, **gstack**, **Codex**, **Gemini CLI**,
**Cursor**, and any agent that supports the
[SKILL.md standard](https://github.com/anthropics/claude-code).

## Skills

| Skill | What it teaches | Best for |
|-------|----------------|----------|
| **arlopass** | Full integration guide + gstack sprint workflow | General use, gstack users |
| **arlopass-sdk** | Detailed SDK reference — all hooks, props, types, error handling | Developers who want the complete API |
| **arlopass-integrate** | Quick integration — step-by-step walkthrough | Getting started fast |

Most people should install **arlopass**. It covers everything. Install the
others if you want deeper SDK reference or a more concise quickstart.

## Install

### Claude Code — one skill (recommended)

Paste into Claude Code:

```
Install the Arlopass skill: run `git clone --single-branch --depth 1 https://github.com/arlopass/arlopass.git /tmp/arlopass && mkdir -p ~/.claude/skills/arlopass && cp /tmp/arlopass/skills/arlopass/SKILL.md ~/.claude/skills/arlopass/SKILL.md && rm -rf /tmp/arlopass`
```

### Claude Code — all three skills

```bash
git clone --single-branch --depth 1 https://github.com/arlopass/arlopass.git /tmp/arlopass
cp -r /tmp/arlopass/skills/arlopass ~/.claude/skills/arlopass
cp -r /tmp/arlopass/skills/arlopass-sdk ~/.claude/skills/arlopass-sdk
cp -r /tmp/arlopass/skills/arlopass-integrate ~/.claude/skills/arlopass-integrate
rm -rf /tmp/arlopass
```

### Add to a project (so teammates get it)

```bash
git clone --single-branch --depth 1 https://github.com/arlopass/arlopass.git /tmp/arlopass
cp -r /tmp/arlopass/skills/arlopass .claude/skills/arlopass
rm -rf /tmp/arlopass
```

Commit `.claude/skills/arlopass/` to your repo. `git clone` just works for
teammates — no extra install step.

### Codex / Gemini CLI / Cursor

```bash
git clone --single-branch --depth 1 https://github.com/arlopass/arlopass.git /tmp/arlopass
cp -r /tmp/arlopass/skills/arlopass .agents/skills/arlopass
rm -rf /tmp/arlopass
```

Skills in `.agents/skills/` are auto-discovered by Codex-compatible agents.

### Windows (PowerShell)

```powershell
git clone --single-branch --depth 1 https://github.com/arlopass/arlopass.git $env:TEMP\arlopass
New-Item -ItemType Directory -Path "$env:USERPROFILE\.claude\skills\arlopass" -Force
Copy-Item "$env:TEMP\arlopass\skills\arlopass\SKILL.md" "$env:USERPROFILE\.claude\skills\arlopass\SKILL.md"
Remove-Item -Recurse -Force "$env:TEMP\arlopass"
```

## Usage

After installing, tell your agent:

- "Add AI chat to this app"
- "Let users pick their own model"
- "Integrate Arlopass"
- "I need streaming AI without managing API keys"

The agent will use the skill to generate a correct integration with
`@arlopass/react` — provider setup, connection state, model picker, streaming
chat, error handling, and extension-not-installed fallback.

## Works with gstack

If you're running [gstack](https://github.com/garrytan/gstack), the Arlopass
skill slots into the sprint:

```
/office-hours  →  "I want AI in my app"
/plan-eng-review  →  architecture includes Arlopass
Build  →  skill wires @arlopass/react
/review  →  catches integration issues
/qa  →  tests the chat flow in a real browser
/ship  →  PR with AI feature, zero API keys
```

## Links

- **Arlopass docs:** https://arlopass.com/docs
- **GitHub:** https://github.com/arlopass/arlopass
- **npm:** `@arlopass/react` · `@arlopass/web-sdk` · `@arlopass/protocol`
- **Chrome Extension:** search "Arlopass" on Chrome Web Store

## License

MIT
