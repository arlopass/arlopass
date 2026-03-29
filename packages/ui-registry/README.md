# @arlopass/ui

CLI registry for Arlopass UI blocks.

This package ships a command-line tool (`arlopass-ui`) and block sources for
integrating Arlopass UI components into application codebases.

## Installation

```bash
pnpm add -D @arlopass/ui
```

## CLI

```bash
npx arlopass-ui list
npx arlopass-ui add chat
```

## Included Blocks

- `chat`
- `chatbot`
- `connection-banner`
- `provider-picker`

## Build

```bash
pnpm --filter @arlopass/ui build
```
