# Docs → Astro Migration: Phase 2 — Static Page Conversion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all 28 static documentation pages from React TSX to MDX content collection files, preserving all content while adapting the visual presentation to match the landing page aesthetic.

**Architecture:** Each React page becomes an MDX file in `src/content/docs/`. Mantine components (Stack, Title, Text, Card, etc.) are replaced with semantic Markdown (headings, paragraphs, lists, tables). Custom components (CodeBlock, Callout, ApiTable, StepList) are replaced with their Astro equivalents built in Phase 1. `CodeComparison` (tab switcher for Web SDK vs React SDK) is replaced with sequential code blocks under clear headings — better for SEO since all content is visible to crawlers. Navigation `onClick` handlers become standard `<a href>` links.

**Tech Stack:** MDX, Astro Content Collections, existing Phase 1 Astro components

**Spec:** `docs/superpowers/specs/2026-03-29-docs-astro-migration-design.md`

---

## Conversion Pattern

Every page follows this transformation:

**React TSX (before):**
```tsx
import { Stack, Title, Text } from "@mantine/core";
import { CodeBlock, Callout } from "../../components";
import { navigate } from "../../router";

export default function PageName() {
  return (
    <Stack gap="lg">
      <Title order={2}>Page Title</Title>
      <Text>Body content here.</Text>
      <CodeBlock code={`const x = 1;`} title="example.ts" />
      <Callout type="tip" title="Tip">Helpful hint</Callout>
      <Text onClick={() => navigate("other/page")}>Link text</Text>
    </Stack>
  );
}
```

**MDX (after):**
```mdx
---
title: "Page Title"
description: "Brief description for SEO meta."
category: "Category Name"
order: 1
lastUpdated: 2026-03-29
keywords: ["keyword1", "keyword2"]
schema: "TechArticle"
---

import Callout from '../../../components/docs/Callout.astro';

Body content here.

```typescript title="example.ts"
const x = 1;
```

<Callout type="tip" title="Tip">
  Helpful hint
</Callout>

[Link text](/docs/other/page)
```

## Component Mapping

| React (examples-web) | MDX/Astro (landing) | Notes |
|----------------------|---------------------|-------|
| `<Title order={2}>` | `## Heading` | Markdown heading |
| `<Title order={3}>` | `### Heading` | Markdown heading |
| `<Text>paragraph</Text>` | `paragraph` | Plain Markdown |
| `<Text fw={600}>bold</Text>` | `**bold**` | Markdown bold |
| `<CodeBlock code={...} title={...}>` | Fenced code block with meta | ` ```typescript title="file.ts" ` |
| `<Callout type="tip">` | `<Callout type="tip">` | Import Astro component |
| `<ApiTable props={[...]}>` | `<ApiTable props={[...]}>` | Import Astro component |
| `<StepList steps={[...]}>` | `<StepList steps={[...]}>` | Import Astro component |
| `<CodeComparison webSdk={...} reactSdk={...}>` | Two fenced code blocks under h4 headings | Sequential, not tabbed |
| `<InlineCode>x</InlineCode>` | `` `x` `` | Markdown inline code |
| `navigate("path")` onClick | `[text](/docs/path)` | Standard link |
| `<SimpleGrid>` with Cards | Markdown list or table | Semantic HTML |
| `<Divider />` | `---` | Markdown horizontal rule |
| `<List>` with items | `- item` / `1. item` | Markdown lists |
| Mantine `<Table>` | Markdown table | `\| col \| col \|` |

## Import Boilerplate

Each MDX file that uses custom components needs imports after the frontmatter. Common patterns:

```mdx
{/* Pages with callouts only */}
import Callout from '../../../components/docs/Callout.astro';

{/* Pages with callouts + API tables */}
import Callout from '../../../components/docs/Callout.astro';
import ApiTable from '../../../components/docs/ApiTable.astro';

{/* Pages with callouts + step lists */}
import Callout from '../../../components/docs/Callout.astro';
import StepList from '../../../components/docs/StepList.astro';
```

The relative path depth varies by folder:
- `getting-started/*.mdx` → `'../../../components/docs/Component.astro'`
- `tutorials/*.mdx` → `'../../../components/docs/Component.astro'`
- `guides/*.mdx` → `'../../../components/docs/Component.astro'`
- `components/*.mdx` → `'../../../components/docs/Component.astro'`
- `reference/react/*.mdx` → `'../../../../components/docs/Component.astro'`
- `reference/web-sdk/*.mdx` → `'../../../../components/docs/Component.astro'`
- `concepts/*.mdx` → `'../../../components/docs/Component.astro'`

---

### Task 1: Getting Started (3 remaining pages)

`welcome.mdx` already exists from Phase 1. Convert the other 3 pages.

**Files:**
- Read: `apps/examples-web/src/pages/getting-started/Installation.tsx`
- Read: `apps/examples-web/src/pages/getting-started/QuickstartWebSDK.tsx`
- Read: `apps/examples-web/src/pages/getting-started/QuickstartReact.tsx`
- Create: `apps/landing/src/content/docs/getting-started/installation.mdx`
- Create: `apps/landing/src/content/docs/getting-started/quickstart-web-sdk.mdx`
- Create: `apps/landing/src/content/docs/getting-started/quickstart-react.mdx`

- [ ] **Step 1: Read source files and convert**

For each file:
1. Read the React TSX source
2. Extract all text content, code blocks, callouts, step lists
3. Create the MDX with proper frontmatter following the schema in `content.config.ts`
4. Replace Mantine components with Markdown equivalents
5. Replace `navigate()` calls with `[text](/docs/slug)` links
6. Import Callout/StepList Astro components where needed
7. Replace `CodeComparison` with two sequential code blocks under `#### Web SDK` / `#### React SDK` headings

**Frontmatter for each:**

`installation.mdx`:
```yaml
title: "Installation"
description: "Install the Arlopass browser extension and SDK packages to start building AI-powered web apps."
category: "Getting Started"
order: 2
lastUpdated: 2026-03-29
keywords: ["install", "npm", "browser extension", "setup"]
schema: "HowTo"
```

`quickstart-web-sdk.mdx`:
```yaml
title: "Quickstart: Web SDK"
description: "Get started with the Arlopass Web SDK in 5 steps — connect, list providers, select a model, and send your first message."
category: "Getting Started"
order: 3
lastUpdated: 2026-03-29
keywords: ["quickstart", "web sdk", "typescript", "getting started"]
schema: "HowTo"
```

`quickstart-react.mdx`:
```yaml
title: "Quickstart: React SDK"
description: "Build your first AI-powered React app with Arlopass in 5 steps using hooks, providers, and streaming."
category: "Getting Started"
order: 4
lastUpdated: 2026-03-29
keywords: ["quickstart", "react", "hooks", "getting started"]
schema: "HowTo"
```

- [ ] **Step 2: Build and verify**

Run: `cd apps/landing && npx astro build`
Expected: All 4 getting-started pages build. Check `dist/docs/getting-started/` has 4 directories.

- [ ] **Step 3: Commit**

```bash
git add apps/landing/src/content/docs/getting-started/
git commit -m "feat(docs): convert Getting Started pages to MDX (3 pages)"
```

---

### Task 2: Tutorials (4 pages)

**Files:**
- Read: `apps/examples-web/src/pages/tutorials/FirstChatApp.tsx`
- Read: `apps/examples-web/src/pages/tutorials/StreamingResponses.tsx`
- Read: `apps/examples-web/src/pages/tutorials/ProviderSelection.tsx`
- Read: `apps/examples-web/src/pages/tutorials/AddingToolCalling.tsx`
- Create: `apps/landing/src/content/docs/tutorials/first-chat-app.mdx`
- Create: `apps/landing/src/content/docs/tutorials/streaming-responses.mdx`
- Create: `apps/landing/src/content/docs/tutorials/provider-selection.mdx`
- Create: `apps/landing/src/content/docs/tutorials/adding-tool-calling.mdx`

- [ ] **Step 1: Read source files and convert**

Same conversion pattern. These are tutorial pages — use `schema: "HowTo"`.

**Frontmatter:**

`first-chat-app.mdx`:
```yaml
title: "Build your first chat app"
description: "Build a complete AI chat interface with streaming responses using the Arlopass SDK."
category: "Tutorials"
order: 1
lastUpdated: 2026-03-29
keywords: ["tutorial", "chat app", "streaming", "react"]
schema: "HowTo"
```

`streaming-responses.mdx`:
```yaml
title: "Streaming responses"
description: "Add real-time streaming tokens, typing indicators, and stop functionality to your AI chat."
category: "Tutorials"
order: 2
lastUpdated: 2026-03-29
keywords: ["streaming", "real-time", "tokens", "tutorial"]
schema: "HowTo"
```

`provider-selection.mdx`:
```yaml
title: "Provider selection UI"
description: "Build provider and model dropdown selectors using the useProviders hook."
category: "Tutorials"
order: 3
lastUpdated: 2026-03-29
keywords: ["providers", "models", "selection", "dropdown", "tutorial"]
schema: "HowTo"
```

`adding-tool-calling.mdx`:
```yaml
title: "Adding tool calling"
description: "Configure AI tools with auto-execution, manual mode, and streaming lifecycle events."
category: "Tutorials"
order: 4
lastUpdated: 2026-03-29
keywords: ["tools", "function calling", "auto-execute", "tutorial"]
schema: "HowTo"
```

- [ ] **Step 2: Build and verify**

Run: `cd apps/landing && npx astro build`
Expected: All tutorial pages build. Check `dist/docs/tutorials/` has 4 directories.

- [ ] **Step 3: Commit**

```bash
git add apps/landing/src/content/docs/tutorials/
git commit -m "feat(docs): convert Tutorials pages to MDX (4 pages)"
```

---

### Task 3: How-to Guides (6 pages)

**Files:**
- Read: `apps/examples-web/src/pages/guides/ConversationManagement.tsx`
- Read: `apps/examples-web/src/pages/guides/ToolCallingGuide.tsx`
- Read: `apps/examples-web/src/pages/guides/ErrorHandling.tsx`
- Read: `apps/examples-web/src/pages/guides/TestingGuide.tsx`
- Read: `apps/examples-web/src/pages/guides/GuardComponents.tsx`
- Read: `apps/examples-web/src/pages/guides/SecurityModel.tsx`
- Create: `apps/landing/src/content/docs/guides/conversation-management.mdx`
- Create: `apps/landing/src/content/docs/guides/tool-calling.mdx`
- Create: `apps/landing/src/content/docs/guides/error-handling.mdx`
- Create: `apps/landing/src/content/docs/guides/testing.mdx`
- Create: `apps/landing/src/content/docs/guides/guard-components.mdx`
- Create: `apps/landing/src/content/docs/guides/security.mdx`

- [ ] **Step 1: Read source files and convert**

These are how-to guides — use `schema: "Article"`. These pages are the most code-heavy (250-420 lines each). Preserve ALL code examples exactly. `CodeComparison` blocks become sequential code blocks.

**Frontmatter (order 1-6):**

| File | title | description | order |
|------|-------|-------------|-------|
| conversation-management | "Conversation management" | "Manage context windows, pin messages, auto-summarize, and monitor token usage." | 1 |
| tool-calling | "Tool calling" | "Configure auto-execute and manual tool modes, handle streaming events, and set maxToolRounds." | 2 |
| error-handling | "Error handling" | "Handle retryable errors, use error boundaries, and reference SDK error codes." | 3 |
| testing | "Testing your app" | "Mock transports, test streaming, simulate errors, and verify tool calls." | 4 |
| guard-components | "Guard components" | "Gate UI on connection, provider, and chat readiness with positive and negative guards." | 5 |
| security | "Security model" | "Understand endpoint validation, origin enforcement, vault encryption, and zero-trust architecture." | 6 |

All use `keywords` relevant to the topic and `category: "How-to Guides"`.

- [ ] **Step 2: Build and verify**

Run: `cd apps/landing && npx astro build`
Expected: All 6 guide pages build.

- [ ] **Step 3: Commit**

```bash
git add apps/landing/src/content/docs/guides/
git commit -m "feat(docs): convert How-to Guides to MDX (6 pages)"
```

---

### Task 4: Components Overview (1 page)

**Files:**
- Read: `apps/examples-web/src/pages/components/Overview.tsx`
- Create: `apps/landing/src/content/docs/components/overview.mdx`

- [ ] **Step 1: Read and convert**

This page has a table of components with onClick navigation — convert to a Markdown table with links.

```yaml
title: "Overview"
description: "Overview of the Arlopass UI component primitives — Chat, Message, StreamingText, ProviderPicker, and more."
category: "Components Library"
order: 1
lastUpdated: 2026-03-29
keywords: ["components", "primitives", "ui", "library"]
schema: "TechArticle"
```

- [ ] **Step 2: Build and verify**

Run: `cd apps/landing && npx astro build`

- [ ] **Step 3: Commit**

```bash
git add apps/landing/src/content/docs/components/overview.mdx
git commit -m "feat(docs): convert Components Overview to MDX"
```

---

### Task 5: React SDK Reference (5 pages)

**Files:**
- Read: `apps/examples-web/src/pages/reference/react/ReactProvider.tsx`
- Read: `apps/examples-web/src/pages/reference/react/HooksAPI.tsx`
- Read: `apps/examples-web/src/pages/reference/react/GuardsAPI.tsx`
- Read: `apps/examples-web/src/pages/reference/react/ReactTypes.tsx`
- Read: `apps/examples-web/src/pages/reference/react/TestingAPI.tsx`
- Create: `apps/landing/src/content/docs/reference/react/provider.mdx`
- Create: `apps/landing/src/content/docs/reference/react/hooks.mdx`
- Create: `apps/landing/src/content/docs/reference/react/guards.mdx`
- Create: `apps/landing/src/content/docs/reference/react/types.mdx`
- Create: `apps/landing/src/content/docs/reference/react/testing.mdx`

- [ ] **Step 1: Read and convert**

These are API reference pages heavy on `ApiTable` components and type definitions. Use `schema: "TechArticle"` and `category: "React SDK Reference"`. Import paths for components at this depth: `'../../../../components/docs/Component.astro'`.

**Important:** `ApiTable` accepts structured props data. In MDX, pass props as JSX expressions:
```mdx
<ApiTable props={[
  { name: "appId", type: "string", required: true, description: "Application identifier" },
  { name: "timeout", type: "number", default: "30000", description: "Connection timeout in ms" },
]} />
```

**Frontmatter (order 1-5):**

| File | title | order |
|------|-------|-------|
| provider | "ArlopassProvider" | 1 |
| hooks | "Hooks" | 2 |
| guards | "Guard components" | 3 |
| types | "Types" | 4 |
| testing | "Testing utilities" | 5 |

- [ ] **Step 2: Build and verify**

Run: `cd apps/landing && npx astro build`
Expected: All 5 reference/react pages build.

- [ ] **Step 3: Commit**

```bash
git add apps/landing/src/content/docs/reference/
git commit -m "feat(docs): convert React SDK Reference to MDX (5 pages)"
```

---

### Task 6: Web SDK Reference (4 pages)

**Files:**
- Read: `apps/examples-web/src/pages/reference/web-sdk/WebSDKClient.tsx`
- Read: `apps/examples-web/src/pages/reference/web-sdk/ConversationManagerAPI.tsx`
- Read: `apps/examples-web/src/pages/reference/web-sdk/WebSDKTypes.tsx`
- Read: `apps/examples-web/src/pages/reference/web-sdk/ErrorCodes.tsx`
- Create: `apps/landing/src/content/docs/reference/web-sdk/client.mdx`
- Create: `apps/landing/src/content/docs/reference/web-sdk/conversation-manager.mdx`
- Create: `apps/landing/src/content/docs/reference/web-sdk/types.mdx`
- Create: `apps/landing/src/content/docs/reference/web-sdk/error-codes.mdx`

- [ ] **Step 1: Read and convert**

Same pattern as React SDK Reference. Heavy on `ApiTable` and type definitions. Use `category: "Web SDK Reference"`.

**Frontmatter (order 1-4):**

| File | title | order |
|------|-------|-------|
| client | "ArlopassClient" | 1 |
| conversation-manager | "ConversationManager" | 2 |
| types | "Types" | 3 |
| error-codes | "Error codes" | 4 |

- [ ] **Step 2: Build and verify**

Run: `cd apps/landing && npx astro build`

- [ ] **Step 3: Commit**

```bash
git add apps/landing/src/content/docs/reference/
git commit -m "feat(docs): convert Web SDK Reference to MDX (4 pages)"
```

---

### Task 7: Concepts (4 pages)

**Files:**
- Read: `apps/examples-web/src/pages/concepts/HowArlopassWorks.tsx`
- Read: `apps/examples-web/src/pages/concepts/TransportModel.tsx`
- Read: `apps/examples-web/src/pages/concepts/StateManagement.tsx`
- Read: `apps/examples-web/src/pages/concepts/WebSDKvsReact.tsx`
- Create: `apps/landing/src/content/docs/concepts/how-arlopass-works.mdx`
- Create: `apps/landing/src/content/docs/concepts/transport-model.mdx`
- Create: `apps/landing/src/content/docs/concepts/state-management.mdx`
- Create: `apps/landing/src/content/docs/concepts/web-sdk-vs-react.mdx`

- [ ] **Step 1: Read and convert**

Concept pages explain architecture and design decisions. Use `schema: "Article"` and `category: "Concepts"`. These pages have onClick navigation links — all become `<a href>` links.

**Frontmatter (order 1-4):**

| File | title | order |
|------|-------|-------|
| how-arlopass-works | "How Arlopass works" | 1 |
| transport-model | "Transport model" | 2 |
| state-management | "State management" | 3 |
| web-sdk-vs-react | "Web SDK vs React SDK" | 4 |

- [ ] **Step 2: Build and verify**

Run: `cd apps/landing && npx astro build`

- [ ] **Step 3: Commit**

```bash
git add apps/landing/src/content/docs/concepts/
git commit -m "feat(docs): convert Concepts pages to MDX (4 pages)"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Full production build**

Run: `cd apps/landing && npx astro build`
Expected: 29 doc pages + landing page + docs index = 31 pages total. Zero errors.

- [ ] **Step 2: Count output pages**

Run (PowerShell): `(Get-ChildItem -Recurse apps/landing/dist/docs -Filter index.html).Count`
Expected: 29 (28 static pages + 1 docs index)

- [ ] **Step 3: Spot-check rendered HTML**

Check a few representative pages have actual content:

```powershell
# Check a tutorial page has code blocks
Select-String -Path "apps/landing/dist/docs/tutorials/first-chat-app/index.html" -Pattern "<pre" | Measure-Object | Select-Object Count
# Expected: Multiple <pre> tags (code blocks)

# Check a reference page has table content
Select-String -Path "apps/landing/dist/docs/reference/react/hooks/index.html" -Pattern "<table" | Measure-Object | Select-Object Count
# Expected: At least 1 table

# Check a concepts page has heading structure
Select-String -Path "apps/landing/dist/docs/concepts/how-arlopass-works/index.html" -Pattern "<h2" | Measure-Object | Select-Object Count
# Expected: Multiple h2 tags
```

- [ ] **Step 4: Check sitemap has all pages**

Run: `Get-Content apps/landing/dist/sitemap-*.xml | Select-String "/docs/" | Measure-Object | Select-Object Count`
Expected: 29 entries (28 static docs + 1 docs index)

- [ ] **Step 5: Verify landing page unchanged**

Run: `Get-Content apps/landing/dist/index.html -First 5`
Expected: Same `<!doctype html>` landing page structure.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(docs): complete Phase 2 — all 28 static pages converted to MDX"
```
