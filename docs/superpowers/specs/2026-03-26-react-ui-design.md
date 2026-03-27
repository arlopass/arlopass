# @arlopass/react-ui — React Components Library Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Packages:** `@arlopass/react-ui` (npm primitives) + `@arlopass/ui` (registry blocks)
**Locations:** `packages/react-ui/` + `packages/ui-registry/`

---

## 1. Overview

A headless React component library built on `@arlopass/react` that provides composable, unstyled UI primitives for AI chat interfaces, plus a registry of Tailwind-styled blocks that developers copy into their projects (shadcn model).

**Dependency chain:**
```
@arlopass/react-ui  →  @arlopass/react  →  @arlopass/web-sdk  →  @arlopass/protocol
     (primitives)       (hooks/guards)      (core client)         (envelope types)

@arlopass/ui (registry CLI)
     → copies block source files into developer's project
     → blocks import from @arlopass/react-ui + @arlopass/react
```

**Four pillars:** robustness, reliability, extensibility, airtight security.

**Target:** React 18+ (peer dependency `^18.0.0 || ^19.0.0`).

**Client-only library.** All components use browser APIs and `@arlopass/react` hooks which require `'use client'`. All entry points include `'use client'` directives for RSC compatibility. Not compatible with pure React Server Components.

---

## 2. Distribution Model — Hybrid

### npm package: `@arlopass/react-ui`
- Headless, completely unstyled compound components
- Semantic HTML with `data-*` attributes for state
- Dot notation namespace API (`Chat.Root`, `Chat.Messages`, etc.)
- Controlled + uncontrolled modes
- Zero CSS shipped — developers style with their own approach
- Auto-updated via npm — breaking changes follow semver

### Registry: `@arlopass/ui`
- CLI tool: `npx @arlopass/ui add chat`
- Copies Tailwind-styled source files into the developer's project
- Full ownership — developers modify freely
- Blocks import from `@arlopass/react-ui` + `@arlopass/react`
- Dependency resolution — `chatbot` auto-installs `chat`

---

## 3. Primitives — Component API

### 3.1 Chat compound component

The core component. Manages a full conversation with streaming, tool calling, and message history.

**Parts:**

| Part | HTML Element | Purpose | Key `data-*` attributes |
|---|---|---|---|
| `Chat.Root` | `<div>` | Container + context provider | `data-state="idle\|streaming\|sending\|error"` |
| `Chat.Messages` | `<div>` | Scrollable message list with auto-scroll | `data-state="empty\|filled"` |
| `Chat.Message` | `<div>` | Single message wrapper | `data-role="user\|assistant\|system"`, `data-status="pending\|streaming\|complete\|error"` |
| `Chat.MessageContent` | `<div>` | Message text content | `data-role="user\|assistant\|system"` |
| `Chat.Input` | `<textarea>` | Auto-resizing textarea. Enter sends, Shift+Enter newline | `data-state="idle\|disabled"` |
| `Chat.SendButton` | `<button>` | Submit button. Auto-disables when empty/streaming | `data-state="idle\|disabled\|streaming"` |
| `Chat.StopButton` | `<button>` | Abort active stream | `data-state="visible\|hidden"` |
| `Chat.StreamingIndicator` | `<span>` | Streaming text accumulator | `data-state="streaming\|idle"` |
| `Chat.EmptyState` | `<div>` | Shown when no messages | — |

**Chat.Root props (uncontrolled mode):**

These map directly to `UseConversationOptions` from `@arlopass/react`:

| Prop | Type | Default | Description |
|---|---|---|---|
| `systemPrompt` | `string` | — | System prompt for the conversation |
| `tools` | `ToolDefinition[]` | — | Tool definitions |
| `maxTokens` | `number` | auto | Context window limit |
| `maxToolRounds` | `number` | `5` | Safety limit on tool loops |
| `primeTools` | `boolean` | — | Enable tool priming |
| `hideToolCalls` | `boolean` | — | Strip tool call markup from messages |
| `initialMessages` | `TrackedChatMessage[]` | — | Pre-populate conversation |

**Chat.Root props (controlled mode):**

| Prop | Type | Description |
|---|---|---|
| `messages` | `readonly TrackedChatMessage[]` | Message array (enables controlled mode when present) |
| `streamingContent` | `string \| null` | Current streaming text |
| `streamingMessageId` | `MessageId \| null` | ID of the message being streamed |
| `isStreaming` | `boolean` | Whether streaming is active |
| `isSending` | `boolean` | Whether a send is in flight (non-streaming) |
| `onSend` | `(text: string) => Promise<string>` | Send/stream handler |
| `onStop` | `() => void` | Stop handler |
| `error` | `ArlopassSDKError \| null` | Current error |

**All parts also accept:** `className`, `style`, `ref`, `id`, `data-*`, `aria-*` — forwarded to the rendered HTML element.

**Uncontrolled usage:**
```tsx
import { Chat } from '@arlopass/react-ui'

<Chat.Root systemPrompt="You are a helpful assistant.">
  <Chat.EmptyState>
    <p>Ask me anything!</p>
  </Chat.EmptyState>
  <Chat.Messages>
    {(messages) => messages.map(m => (
      <Chat.Message key={m.id} message={m}>
        <Chat.MessageContent />
      </Chat.Message>
    ))}
  </Chat.Messages>
  <Chat.StreamingIndicator />
  <Chat.Input placeholder="Type a message..." />
  <Chat.SendButton>Send</Chat.SendButton>
  <Chat.StopButton>Stop</Chat.StopButton>
</Chat.Root>
```

**Controlled usage:**
```tsx
const conv = useConversation({ systemPrompt: "..." });

<Chat.Root
  messages={conv.messages}
  streamingContent={conv.streamingContent}
  isStreaming={conv.isStreaming}
  onSend={(text) => conv.stream(text)}
  onStop={() => conv.stop()}
  error={conv.error}
>
  {/* Same children — they read from ChatContext */}
</Chat.Root>
```

**Detection logic:** Controlled mode is enabled when `messages` prop is defined (not `undefined`), including empty arrays. `messages={undefined}` is uncontrolled. When switching from uncontrolled to controlled, the component respects the provided `messages` array entirely.

**Chat.Messages render function typing:**
```ts
type ChatMessagesProps = React.ComponentProps<"div"> & {
  children: (messages: readonly TrackedChatMessage[]) => React.ReactNode;
};
```
Render function is called on every render. Wrap returned JSX with `useMemo` in the consumer if expensive.

**Unmount behavior:** Active streams are aborted on unmount. `useConversation` cleans up subscriptions and cancels pending requests. Safe to remount with same or different options.

### 3.2 Message compound component

Standalone message display (for custom layouts without full Chat).

**Message.Root props:**

| Prop | Type | Required | Description |
|---|---|---|---|
| `message` | `TrackedChatMessage` | Yes | The message to display |

| Part | HTML Element | Purpose | Key `data-*` |
|---|---|---|---|
| `Message.Root` | `<div>` | Message container | `data-role`, `data-status` |
| `Message.Content` | `<div>` | Text content | `data-role` |
| `Message.Role` | `<span>` | Role label | `data-role` |
| `Message.Timestamp` | `<time>` | Time display | — |
| `Message.Status` | `<span>` | Status indicator | `data-status` |
| `Message.ToolCalls` | `<div>` | Tool call info (read-only display) | `data-state="empty\|has-tools"` |

All parts accept `className`, `style`, `ref`, `id`, `data-*`, `aria-*` — forwarded to the DOM element.

### 3.3 StreamingText

Standalone streaming text renderer with cursor.

```tsx
<StreamingText
  content={streamingContent}
  isStreaming={isStreaming}
  cursor="▌"                    // default
/>
```

Renders `<span>` with `data-state="streaming|idle"`. Appends cursor character when streaming.

### 3.4 ProviderPicker compound component

| Part | HTML Element | Purpose | Key `data-*` |
|---|---|---|---|
| `ProviderPicker.Root` | `<div>` | Container + context | `data-state="loading\|ready\|error"` |
| `ProviderPicker.ProviderSelect` | `<select>` | Provider dropdown | `data-state="unselected\|selected"` |
| `ProviderPicker.ModelSelect` | `<select>` | Model dropdown | `data-state="unselected\|selected"` |
| `ProviderPicker.SubmitButton` | `<button>` | Confirm selection | `data-state="idle\|disabled"` |

**Uncontrolled:** uses `useProviders()` internally. **Controlled:** pass props below.

**ProviderPicker.Root controlled-mode props:**

| Prop | Type | Description |
|---|---|---|
| `providers` | `readonly ProviderDescriptor[]` | Available providers (enables controlled mode) |
| `selectedProvider` | `{ providerId: string; modelId: string } \| null` | Current selection |
| `isLoading` | `boolean` | Whether providers are loading |
| `onProviderChange` | `(providerId: string) => void` | Provider change handler |
| `onModelChange` | `(modelId: string) => void` | Model change handler |
| `onSelect` | `(input: SelectProviderInput) => Promise<void>` | Submit handler |

### 3.5 ToolActivity compound component

| Part | HTML Element | Purpose | Key `data-*` |
|---|---|---|---|
| `ToolActivity.Root` | `<div>` | Container | `data-state="idle\|active"` |
| `ToolActivity.Call` | `<div>` | Pending/executing tool call | `data-status="pending\|executing\|complete\|error"` |
| `ToolActivity.Result` | `<div>` | Tool result display | `data-status="complete\|error"` |

**ToolActivity.Call props:**

| Prop | Type | Required | Description |
|---|---|---|---|
| `toolCall` | `ToolCallInfo` | Yes | Tool call data (name, args, status) |

**ToolActivity.Result props:**

| Prop | Type | Required | Description |
|---|---|---|---|
| `toolCall` | `ToolCallInfo` | Yes | Tool call data with result |

Both are read-only display components. They render the tool name, arguments, and result as text nodes via render function children or default formatting.

### 3.6 ConnectionStatus

Single component (not compound).

```tsx
// Uncontrolled — reads from ArlopassProvider context
<ConnectionStatus />

// Controlled
<ConnectionStatus state="connected" sessionId="session.abc" />
```

Renders `<div>` with `data-state="disconnected|connecting|connected|degraded|reconnecting|failed"`.

---

## 4. Internal Architecture

### Context hierarchy

```
Chat.Root
  └── ChatContext
        ├── Chat.Messages — reads messages
        ├── Chat.Input — reads isStreaming, calls send/stream
        ├── Chat.SendButton — reads isStreaming, calls send
        └── Chat.Message
              └── MessageContext (per message)
                    ├── Chat.MessageContent — reads content
                    └── Message.Role — reads role
```

### Typed context factory (shared utility)

```ts
// utils/create-context.ts
function createComponentContext<T>(componentName: string) {
  const Context = createContext<T | null>(null);
  
  function useComponentContext(partName: string): T {
    const ctx = useContext(Context);
    if (ctx === null) {
      throw new Error(`<${partName}> must be used within <${componentName}>`);
    }
    return ctx;
  }
  
  return [Context.Provider, useComponentContext] as const;
}
```

### Controlled/uncontrolled detection

`Chat.Root` always calls `useConversation()` unconditionally (React hooks rules require this). In controlled mode, the hook's return values are ignored and the provided props are used instead:

```ts
// Inside Chat.Root — hook always called, values conditionally used
const conversation = useConversation(options); // Always called
const isControlled = messagesProp !== undefined;
const messages = isControlled ? messagesProp : conversation.messages;
const streamingContent = isControlled ? streamingContentProp : conversation.streamingContent;
// ... etc
```

This pattern is valid — the hook is called unconditionally on every render, satisfying React's rules of hooks. The overhead of an unused hook in controlled mode is negligible.

### Performance patterns

- **Stable context value** — `useMemo` keyed on actual value changes
- **Streaming via ref + RAF** — `Chat.StreamingIndicator` subscribes to ref for chunk-level updates, batches renders via `requestAnimationFrame` + 16ms `setTimeout` fallback
- **Auto-scroll throttle** — `Chat.Messages` uses `requestAnimationFrame` for scroll-to-bottom
- **Render function for messages** — `Chat.Messages` children receive messages array as function arg
- **`forwardRef` on all parts** — every part forwards ref to its DOM element

### Prop forwarding (all components)

All component parts are built with `React.forwardRef` and extend native HTML element props (`className`, `style`, `ref`, `id`, `data-*`, `aria-*`), forwarded to their rendered DOM element. Component-specific props are documented in per-component props tables. Unknown props are spread onto the root element.

Every component part extends native HTML element props:

```ts
type ChatRootProps = React.ComponentProps<"div"> & {
  // component-specific props
};
```

All unknown props (`className`, `style`, `data-*`, `aria-*`, `id`) forward to the rendered element.

### Accessibility

| Component | Element | ARIA | Keyboard |
|---|---|---|---|
| `Chat.Messages` | `<div>` | `role="log"`, `aria-live="polite"` | — |
| `Chat.Message` | `<div>` | `role="article"`, `aria-label` with role + preview | — |
| `Chat.Input` | `<textarea>` | `role="textbox"`, `aria-label="Chat message"`, `aria-disabled` | Enter send, Shift+Enter newline, Escape stop |
| `Chat.SendButton` | `<button>` | `aria-label="Send message"`, `aria-disabled` | — |
| `Chat.StopButton` | `<button>` | `aria-label="Stop generation"`, `aria-hidden` when not streaming | — |

Focus management: input auto-focuses after send completes.

---

## 5. Registry Blocks

### Available blocks (v1)

| Block ID | File | Dependencies | Description |
|---|---|---|---|
| `chat` | `chat.tsx` | — | Complete chat interface |
| `chatbot` | `chatbot.tsx` | `chat` | Floating chatbot widget |
| `provider-picker` | `provider-picker.tsx` | — | Styled provider/model selector |
| `connection-banner` | `connection-banner.tsx` | — | Connection status banner |

### CLI

```bash
npx @arlopass/ui add chat              # Install one block
npx @arlopass/ui add chat chatbot      # Install multiple (resolves deps)
npx @arlopass/ui add --all             # Install all blocks
npx @arlopass/ui list                  # List available blocks
```

**CLI flags:**

| Flag | Description |
|---|---|
| `--out <dir>` | Output directory (default: `src/components/arlopass/`) |
| `--force, -f` | Overwrite existing files without prompting |
| `--dry-run` | Show what would be installed without writing files |

**Exit codes:** `0` = success, `1` = error (network, IO), `2` = validation error (unknown block)

**Overwrite behavior:** If a target file already exists and `--force` is not set, the CLI prompts the user for confirmation. Skips the file on decline.

**Dependency resolution:** Topologically sorted — if `chatbot` depends on `chat`, `chat` is installed first. Circular dependencies are rejected at build time.

**Config file:** `arlopass-ui.json` (optional, discovered in project root):

```json
{
  "outDir": "src/components/arlopass",
  "overwrite": false
}
```

If no config file exists, defaults are used. CLI flags override config file values.

**Default output directory:** `src/components/arlopass/`

### registry.json format

```json
{
  "blocks": [
    {
      "id": "chat",
      "name": "Chat",
      "description": "Complete chat interface with messages, streaming, and input",
      "dependencies": [],
      "peerDependencies": ["@arlopass/react-ui", "@arlopass/react"],
      "files": ["chat.tsx"]
    },
    {
      "id": "chatbot",
      "name": "Chatbot Widget",
      "description": "Floating chatbot bubble with expandable chat panel",
      "dependencies": ["chat"],
      "peerDependencies": ["@arlopass/react-ui", "@arlopass/react"],
      "files": ["chatbot.tsx"]
    }
  ]
}
```

### Block styling approach

- All blocks use **Tailwind CSS** classes
- No CSS-in-JS, no module CSS — plain className strings
- Developers modify classes freely after copying
- Blocks import from `@arlopass/react-ui` for compound components and `@arlopass/react` for hooks/guards

---

## 6. Security Design

- **No `dangerouslySetInnerHTML`** — message content rendered as text nodes. Markdown/HTML rendering is the developer's responsibility (documented)
- **No `eval` or `Function`** — tool call arguments passed as typed objects
- **No inline event handlers from user props** — all events go through React synthetic events
- **Registry blocks are auditable source code** — developers inspect before adding
- **Content sanitization documented** — primitives render text safely; developers opt into HTML explicitly
- **No credential handling** — all credential management stays in the extension/bridge layer via `@arlopass/react`

---

## 7. File Structure

### `packages/react-ui/`

```
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── utils/
│   │   ├── create-context.ts
│   │   ├── forward-ref.ts
│   │   ├── use-auto-scroll.ts
│   │   └── use-controlled.ts
│   ├── chat/
│   │   ├── index.ts
│   │   ├── chat-context.ts
│   │   ├── chat-root.tsx
│   │   ├── chat-messages.tsx
│   │   ├── chat-message.tsx
│   │   ├── chat-message-content.tsx
│   │   ├── chat-input.tsx
│   │   ├── chat-send-button.tsx
│   │   ├── chat-stop-button.tsx
│   │   ├── chat-streaming-indicator.tsx
│   │   └── chat-empty-state.tsx
│   ├── message/
│   │   ├── index.ts
│   │   ├── message-context.ts
│   │   ├── message-root.tsx
│   │   ├── message-content.tsx
│   │   ├── message-role.tsx
│   │   ├── message-timestamp.tsx
│   │   ├── message-status.tsx
│   │   └── message-tool-calls.tsx
│   ├── streaming-text/
│   │   ├── index.ts
│   │   └── streaming-text.tsx
│   ├── provider-picker/
│   │   ├── index.ts
│   │   ├── provider-picker-context.ts
│   │   ├── provider-picker-root.tsx
│   │   ├── provider-picker-provider-select.tsx
│   │   ├── provider-picker-model-select.tsx
│   │   └── provider-picker-submit-button.tsx
│   ├── tool-activity/
│   │   ├── index.ts
│   │   ├── tool-activity-context.ts
│   │   ├── tool-activity-root.tsx
│   │   ├── tool-activity-call.tsx
│   │   └── tool-activity-result.tsx
│   └── connection-status/
│       ├── index.ts
│       └── connection-status.tsx
└── src/__tests__/
    ├── chat.test.tsx
    ├── message.test.tsx
    ├── streaming-text.test.tsx
    ├── provider-picker.test.tsx
    ├── tool-activity.test.tsx
    ├── connection-status.test.tsx
    └── utils.test.ts
```

### `packages/ui-registry/`

```
├── package.json
├── tsconfig.json
├── registry.json
├── bin/
│   └── cli.ts
├── src/
│   ├── cli/
│   │   ├── index.ts
│   │   ├── add.ts
│   │   ├── list.ts
│   │   └── resolve.ts
│   └── blocks/
│       ├── chat.tsx
│       ├── chatbot.tsx
│       ├── provider-picker.tsx
│       └── connection-banner.tsx
```

### Package exports

**@arlopass/react-ui:**
```json
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "@arlopass/react": ">=0.1.0"
  }
}
```

**@arlopass/ui:**
```json
{
  "bin": { "arlopass-ui": "./bin/cli.js" }
}
```

## 8. Exports

**From `@arlopass/react-ui`:**
- Components: `Chat`, `Message`, `StreamingText`, `ProviderPicker`, `ToolActivity`, `ConnectionStatus`

**Types are NOT re-exported from react-ui.** Developers import types from `@arlopass/react`:
```ts
import type { TrackedChatMessage, ToolDefinition, MessageId, ToolCallInfo } from '@arlopass/react'
import type { ArlopassSDKError, ProviderDescriptor, SelectProviderInput } from '@arlopass/react'
```

This avoids duplicate type definitions and keeps react-ui focused on components.

---

## 9. Testing Strategy

- **Vitest + @testing-library/react** with jsdom
- **`MockArlopassProvider`** from `@arlopass/react/testing` for all tests
- **Test matrix per compound component:**
  - Renders without errors
  - Uncontrolled mode: auto-creates conversation, responds to interactions
  - Controlled mode: reads from props, fires callbacks
  - `data-*` attributes reflect state correctly
  - Prop forwarding: className, style, ref, data-*, aria-*
  - Accessibility: keyboard navigation, aria attributes, focus management
  - Throws when used outside required parent context
  - Works with `createMockTransport` for end-to-end flow

---

## 9. Decisions Record

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Distribution | Hybrid: npm primitives + registry blocks | Two audiences: quick-start and customization-focused |
| 2 | Styling | Completely unstyled primitives, Tailwind blocks | Maximum flexibility for primitives, dominant ecosystem for blocks |
| 3 | Component scope | Chat, Message, StreamingText, ProviderPicker, ToolActivity, ConnectionStatus + 4 blocks | Covers all common AI chat use cases |
| 4 | API pattern | Dot notation namespace | Dominant modern pattern (Radix, Mantine, Ark) |
| 5 | State management | Controlled + uncontrolled | Progressive complexity — zero-config for 80%, full control for 20% |
| 6 | Accessibility | ARIA roles, keyboard nav, focus management | Enterprise-grade requirement |
| 7 | Security | No dangerouslySetInnerHTML, no eval, auditable source | Four pillars — airtight security |
