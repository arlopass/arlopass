# @arlopass/react-ui

Composable React UI components for Arlopass chat experiences.

Use this package together with `@arlopass/react` to build complete UI flows
with connection status, provider picker, messages, and streaming text.

## Installation

```bash
pnpm add @arlopass/react-ui @arlopass/react react react-dom
```

## Quick Start

```tsx
import { Chat, ProviderPicker, ConnectionStatus } from "@arlopass/react-ui";

export function App() {
  return (
    <>
      <ConnectionStatus />
      <ProviderPicker />
      <Chat />
    </>
  );
}
```

## Components

- `Chat`
- `Message`
- `StreamingText`
- `ConnectionStatus`
- `ProviderPicker`
- `ToolActivity`
