# Docs → Astro Migration: Phase 1 — Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up all Astro infrastructure inside `apps/landing` so that a single test doc page renders at `/docs/getting-started/welcome` with the correct layout, design tokens, SEO meta, and docs components.

**Architecture:** Add `@astrojs/react`, `@astrojs/mdx`, and `@astrojs/sitemap` integrations. Create a Content Collection for docs with typed frontmatter. Build a `DocsLayout.astro` three-column shell (sidebar, content, ToC) that matches the landing page aesthetic exactly. Build reusable Astro components (`CodeBlock`, `Callout`, `ApiTable`, `StepList`, `Breadcrumb`, `PrevNextNav`, `CopyAsMarkdown`). Convert one page (`Welcome`) to MDX to validate the full pipeline.

**Tech Stack:** Astro 6.x, MDX, React 19, Tailwind CSS 4, Content Collections, Shiki

**Spec:** `docs/superpowers/specs/2026-03-29-docs-astro-migration-design.md`

---

## File Structure

```
apps/landing/
├── astro.config.ts                          # Modify: add react, mdx, sitemap integrations
├── package.json                             # Modify: add dependencies
├── src/
│   ├── content/
│   │   ├── config.ts                        # Create: docs collection schema
│   │   └── docs/
│   │       └── getting-started/
│   │           └── welcome.mdx              # Create: first test page
│   ├── layouts/
│   │   └── DocsLayout.astro                 # Create: docs shell (sidebar + content + ToC)
│   ├── pages/
│   │   └── docs/
│   │       ├── index.astro                  # Create: docs landing page
│   │       └── [...slug].astro              # Create: dynamic route from collection
│   ├── components/
│   │   └── docs/                            # Create: all new
│   │       ├── DocsHeader.astro             # Sticky header for docs
│   │       ├── DocsSidebar.astro            # Navigation sidebar
│   │       ├── TableOfContents.astro        # Right rail ToC with scroll-spy
│   │       ├── Breadcrumb.astro             # Category > Page breadcrumb
│   │       ├── PrevNextNav.astro            # Previous/Next page links
│   │       ├── CopyAsMarkdown.astro         # Copy page content as Markdown
│   │       ├── CodeBlock.astro              # Syntax-highlighted code with copy button
│   │       ├── Callout.astro                # Info/warning/success/tip callout
│   │       ├── ApiTable.astro               # Structured API property table
│   │       └── StepList.astro               # Numbered step list
│   └── data/
│       └── docs-nav.ts                      # Create: navigation structure definition
```

---

### Task 1: Install Dependencies

**Files:**
- Modify: `apps/landing/package.json`

- [ ] **Step 1: Install Astro integrations and React**

```bash
cd apps/landing
npm install @astrojs/react @astrojs/mdx @astrojs/sitemap
npm install react react-dom
npm install -D @types/react @types/react-dom
```

- [ ] **Step 2: Verify `astro check` still passes**

Run: `cd apps/landing && npx astro check`
Expected: No errors — existing landing page unaffected.

- [ ] **Step 3: Commit**

```bash
git add apps/landing/package.json
git commit -m "chore(landing): add react, mdx, sitemap dependencies"
```

---

### Task 2: Configure Astro Integrations

**Files:**
- Modify: `apps/landing/astro.config.ts`
- Modify: `apps/landing/tsconfig.json`

- [ ] **Step 1: Update `astro.config.ts`**

Replace the entire file with:

```typescript
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://arlopass.com',
  compressHTML: true,

  integrations: [
    react(),
    mdx(),
    sitemap({
      serialize(item) {
        if (item.url.includes('/docs/getting-started/')) item.priority = 0.9;
        else if (item.url.includes('/docs/tutorials/')) item.priority = 0.8;
        else if (item.url.includes('/docs/interactive/')) item.priority = 0.5;
        else if (item.url.includes('/docs/')) item.priority = 0.7;
        return item;
      },
    }),
  ],

  build: {
    inlineStylesheets: 'auto',
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
```

- [ ] **Step 2: Update `tsconfig.json` for JSX**

Replace the entire file with:

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

- [ ] **Step 3: Run `astro check` to verify config**

Run: `cd apps/landing && npx astro check`
Expected: Passes. Existing landing page still works.

- [ ] **Step 4: Run `astro build` to verify production build**

Run: `cd apps/landing && npx astro build`
Expected: Builds successfully. `dist/index.html` still exists and is correct.

- [ ] **Step 5: Commit**

```bash
git add apps/landing/astro.config.ts apps/landing/tsconfig.json
git commit -m "chore(landing): configure react, mdx, sitemap integrations"
```

---

### Task 3: Create Navigation Data + Content Collection Schema

**Files:**
- Create: `apps/landing/src/data/docs-nav.ts`
- Create: `apps/landing/src/content/config.ts`

- [ ] **Step 1: Create navigation data structure**

Create `apps/landing/src/data/docs-nav.ts`:

```typescript
export type NavItem = {
  label: string;
  slug: string;
};

export type NavCategory = {
  label: string;
  items: NavItem[];
};

export const DOCS_NAV: NavCategory[] = [
  {
    label: 'Getting Started',
    items: [
      { slug: 'getting-started/welcome', label: 'Welcome' },
      { slug: 'getting-started/installation', label: 'Installation' },
      { slug: 'getting-started/quickstart-web-sdk', label: 'Quickstart: Web SDK' },
      { slug: 'getting-started/quickstart-react', label: 'Quickstart: React SDK' },
    ],
  },
  {
    label: 'Tutorials',
    items: [
      { slug: 'tutorials/first-chat-app', label: 'Build your first chat app' },
      { slug: 'tutorials/streaming-responses', label: 'Streaming responses' },
      { slug: 'tutorials/provider-selection', label: 'Provider selection UI' },
      { slug: 'tutorials/adding-tool-calling', label: 'Adding tool calling' },
    ],
  },
  {
    label: 'How-to Guides',
    items: [
      { slug: 'guides/conversation-management', label: 'Conversation management' },
      { slug: 'guides/tool-calling', label: 'Tool calling' },
      { slug: 'guides/error-handling', label: 'Error handling' },
      { slug: 'guides/testing', label: 'Testing your app' },
      { slug: 'guides/guard-components', label: 'Guard components' },
      { slug: 'guides/security', label: 'Security model' },
    ],
  },
  {
    label: 'Components Library',
    items: [
      { slug: 'components/overview', label: 'Overview' },
      { slug: 'components/chat', label: 'Chat' },
      { slug: 'components/message', label: 'Message' },
      { slug: 'components/streaming-text', label: 'StreamingText' },
      { slug: 'components/provider-picker', label: 'ProviderPicker' },
      { slug: 'components/tool-activity', label: 'ToolActivity' },
      { slug: 'components/connection-status', label: 'ConnectionStatus' },
      { slug: 'components/registry', label: 'Block registry' },
    ],
  },
  {
    label: 'React SDK Reference',
    items: [
      { slug: 'reference/react/provider', label: 'ArlopassProvider' },
      { slug: 'reference/react/hooks', label: 'Hooks' },
      { slug: 'reference/react/guards', label: 'Guard components' },
      { slug: 'reference/react/types', label: 'Types' },
      { slug: 'reference/react/testing', label: 'Testing utilities' },
    ],
  },
  {
    label: 'Web SDK Reference',
    items: [
      { slug: 'reference/web-sdk/client', label: 'ArlopassClient' },
      { slug: 'reference/web-sdk/conversation-manager', label: 'ConversationManager' },
      { slug: 'reference/web-sdk/types', label: 'Types' },
      { slug: 'reference/web-sdk/error-codes', label: 'Error codes' },
    ],
  },
  {
    label: 'Concepts',
    items: [
      { slug: 'concepts/how-arlopass-works', label: 'How Arlopass works' },
      { slug: 'concepts/transport-model', label: 'Transport model' },
      { slug: 'concepts/state-management', label: 'State management' },
      { slug: 'concepts/web-sdk-vs-react', label: 'Web SDK vs React SDK' },
    ],
  },
  {
    label: 'Interactive',
    items: [
      { slug: 'interactive/playground', label: 'Playground' },
      { slug: 'interactive/connection', label: 'Connection' },
      { slug: 'interactive/providers', label: 'Providers' },
      { slug: 'interactive/chat', label: 'Chat' },
      { slug: 'interactive/streaming', label: 'Streaming' },
      { slug: 'interactive/event-log', label: 'Event log' },
    ],
  },
];

/** Flat list of all pages for lookup */
export const ALL_DOCS: NavItem[] = DOCS_NAV.flatMap((cat) => cat.items);

/** Get category for a slug */
export function getCategory(slug: string): NavCategory | undefined {
  return DOCS_NAV.find((cat) => cat.items.some((item) => item.slug === slug));
}

/** Get prev/next pages */
export function getPrevNext(slug: string): { prev: NavItem | null; next: NavItem | null } {
  const idx = ALL_DOCS.findIndex((p) => p.slug === slug);
  return {
    prev: idx > 0 ? ALL_DOCS[idx - 1]! : null,
    next: idx < ALL_DOCS.length - 1 ? ALL_DOCS[idx + 1]! : null,
  };
}
```

- [ ] **Step 2: Create content collection schema**

Create `apps/landing/src/content/config.ts`:

```typescript
import { defineCollection, z } from 'astro:content';

const docs = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    order: z.number(),
    lastUpdated: z.coerce.date(),
    keywords: z.array(z.string()).default([]),
    schema: z.enum(['TechArticle', 'HowTo', 'Article', 'WebApplication']).default('TechArticle'),
    interactive: z.boolean().default(false),
  }),
});

export const collections = { docs };
```

- [ ] **Step 3: Commit**

```bash
git add apps/landing/src/data/docs-nav.ts apps/landing/src/content/config.ts
git commit -m "feat(docs): add navigation data and content collection schema"
```

---

### Task 4: Create Doc Components — CodeBlock, Callout

**Files:**
- Create: `apps/landing/src/components/docs/CodeBlock.astro`
- Create: `apps/landing/src/components/docs/Callout.astro`

- [ ] **Step 1: Create CodeBlock.astro**

Create `apps/landing/src/components/docs/CodeBlock.astro`:

```astro
---
interface Props {
  code: string;
  lang?: string;
  filename?: string;
}

const { code, lang = 'typescript', filename } = Astro.props;
---

<div class="rounded-lg overflow-hidden border border-[var(--ap-border)] my-6">
  {/* Browser chrome */}
  <div class="flex items-center h-10 gap-6 px-4 py-2 bg-[var(--ap-bg-surface)] border-b border-[var(--ap-border)] shrink-0">
    <div class="flex gap-1.5">
      <div class="h-3 w-3 rounded-full bg-red-500"></div>
      <div class="h-3 w-3 rounded-full bg-yellow-500"></div>
      <div class="h-3 w-3 rounded-full bg-green-500"></div>
    </div>
    {filename && (
      <span class="text-[11px] text-stone-500 font-mono">{filename}</span>
    )}
    <button
      class="ml-auto text-stone-500 hover:text-stone-300 transition-colors cursor-pointer"
      data-copy-code
      aria-label="Copy code"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    </button>
  </div>
  {/* Code area */}
  <pre
    class="p-5 overflow-x-auto font-mono text-sm leading-[1.7] text-stone-300 bg-[var(--ap-bg-code)] m-0"
    style="tab-size: 2"
    data-lang={lang}
  ><code set:html={code} /></pre>
</div>

<script>
  document.querySelectorAll('[data-copy-code]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pre = btn.closest('div')?.parentElement?.querySelector('pre');
      if (!pre) return;
      const text = pre.textContent || '';
      navigator.clipboard.writeText(text).then(() => {
        const svg = btn.querySelector('svg');
        if (svg) {
          const original = svg.innerHTML;
          svg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
          setTimeout(() => { svg.innerHTML = original; }, 2000);
        }
      });
    });
  });
</script>
```

> **Note:** For Phase 1 we use raw code strings. In Phase 2 during the MDX conversion, Astro's built-in Shiki integration handles syntax highlighting for fenced code blocks automatically. This component is used when you need the browser-chrome frame and filename label.

- [ ] **Step 2: Create Callout.astro**

Create `apps/landing/src/components/docs/Callout.astro`:

```astro
---
interface Props {
  type?: 'info' | 'warning' | 'success' | 'tip';
  title?: string;
}

const { type = 'info', title } = Astro.props;

const borderColor: Record<string, string> = {
  info: 'border-brand',
  warning: 'border-warning',
  success: 'border-success',
  tip: 'border-[var(--ap-border-strong)]',
};

const iconColor: Record<string, string> = {
  info: 'text-brand',
  warning: 'text-amber',
  success: 'text-success',
  tip: 'text-[var(--ap-text-tertiary)]',
};

const icons: Record<string, string> = {
  info: 'M12 16v-4m0-4h.01M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
  warning: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  success: 'M9 12l2 2 4-4m6 2a10 10 0 11-20 0 10 10 0 0120 0z',
  tip: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
};
---

<aside role="note" class={`rounded-md bg-[var(--ap-bg-card)] border-l-2 ${borderColor[type]} p-4 my-6`}>
  <div class="flex items-start gap-3">
    <svg
      class={`shrink-0 mt-0.5 ${iconColor[type]}`}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d={icons[type]}></path>
    </svg>
    <div>
      {title && <p class="font-semibold text-sm text-[var(--ap-text-primary)] mb-1">{title}</p>}
      <div class="text-sm text-[var(--ap-text-body)] [&>p]:mb-2 [&>p:last-child]:mb-0">
        <slot />
      </div>
    </div>
  </div>
</aside>
```

- [ ] **Step 3: Verify no build errors**

Run: `cd apps/landing && npx astro check`
Expected: Pass.

- [ ] **Step 4: Commit**

```bash
git add apps/landing/src/components/docs/
git commit -m "feat(docs): add CodeBlock and Callout components"
```

---

### Task 5: Create Doc Components — ApiTable, StepList

**Files:**
- Create: `apps/landing/src/components/docs/ApiTable.astro`
- Create: `apps/landing/src/components/docs/StepList.astro`

- [ ] **Step 1: Create ApiTable.astro**

Create `apps/landing/src/components/docs/ApiTable.astro`:

```astro
---
interface Prop {
  name: string;
  type: string;
  required?: boolean;
  default?: string;
  description: string;
}

interface Props {
  props: Prop[];
}

const { props } = Astro.props;
---

<div class="overflow-x-auto rounded-lg border border-[var(--ap-border)] my-6">
  <table class="w-full text-sm border-collapse">
    <thead>
      <tr class="bg-[var(--ap-bg-surface)]">
        <th class="px-4 py-3 text-left text-xs font-medium text-[var(--ap-text-tertiary)] uppercase tracking-wide">Prop</th>
        <th class="px-4 py-3 text-left text-xs font-medium text-[var(--ap-text-tertiary)] uppercase tracking-wide">Type</th>
        <th class="px-4 py-3 text-left text-xs font-medium text-[var(--ap-text-tertiary)] uppercase tracking-wide">Default</th>
        <th class="px-4 py-3 text-left text-xs font-medium text-[var(--ap-text-tertiary)] uppercase tracking-wide">Description</th>
      </tr>
    </thead>
    <tbody>
      {props.map((prop) => (
        <tr class="border-t border-[var(--ap-border)]">
          <td class="px-4 py-3 align-top">
            <code class="font-mono text-amber text-[0.875em]">{prop.name}</code>
            {prop.required && (
              <span class="ml-1.5 text-xs bg-brand/10 text-brand rounded px-1.5 py-0.5">required</span>
            )}
          </td>
          <td class="px-4 py-3 align-top">
            <code class="font-mono text-[var(--ap-text-tertiary)] text-[0.875em]">{prop.type}</code>
          </td>
          <td class="px-4 py-3 align-top text-[var(--ap-text-tertiary)]">
            {prop.default ? <code class="font-mono text-[0.875em]">{prop.default}</code> : '—'}
          </td>
          <td class="px-4 py-3 align-top text-[var(--ap-text-body)]">{prop.description}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

- [ ] **Step 2: Create StepList.astro**

Create `apps/landing/src/components/docs/StepList.astro`:

```astro
---
interface Step {
  title: string;
  body: string;
}

interface Props {
  steps: Step[];
}

const { steps } = Astro.props;
---

<div class="my-6 space-y-0">
  {steps.map((step, i) => (
    <div class="flex gap-4">
      {/* Number + connecting line */}
      <div class="flex flex-col items-center">
        <div class="h-8 w-8 rounded-full bg-brand text-white text-sm font-bold flex items-center justify-center shrink-0">
          {i + 1}
        </div>
        {i < steps.length - 1 && (
          <div class="w-px flex-1 bg-[var(--ap-border)] min-h-6"></div>
        )}
      </div>
      {/* Content */}
      <div class="pb-8 last:pb-0">
        <p class="font-semibold text-[var(--ap-text-primary)] mb-1">{step.title}</p>
        <p class="text-sm text-[var(--ap-text-body)] leading-relaxed">{step.body}</p>
      </div>
    </div>
  ))}
</div>
```

- [ ] **Step 3: Verify no build errors**

Run: `cd apps/landing && npx astro check`
Expected: Pass.

- [ ] **Step 4: Commit**

```bash
git add apps/landing/src/components/docs/ApiTable.astro apps/landing/src/components/docs/StepList.astro
git commit -m "feat(docs): add ApiTable and StepList components"
```

---

### Task 6: Create Layout Components — Breadcrumb, PrevNextNav, CopyAsMarkdown

**Files:**
- Create: `apps/landing/src/components/docs/Breadcrumb.astro`
- Create: `apps/landing/src/components/docs/PrevNextNav.astro`
- Create: `apps/landing/src/components/docs/CopyAsMarkdown.astro`

- [ ] **Step 1: Create Breadcrumb.astro**

Create `apps/landing/src/components/docs/Breadcrumb.astro`:

```astro
---
interface Props {
  category: string;
  title: string;
}

const { category, title } = Astro.props;
---

<nav aria-label="Breadcrumb" class="flex items-center gap-1.5 text-sm mb-2">
  <a href="/docs" class="text-[var(--ap-text-tertiary)] hover:text-[var(--ap-text-secondary)] transition-colors no-underline">
    Docs
  </a>
  <span class="text-[var(--ap-text-tertiary)]">/</span>
  <span class="text-[var(--ap-text-tertiary)]">{category}</span>
  <span class="text-[var(--ap-text-tertiary)]">/</span>
  <span class="text-[var(--ap-text-secondary)] font-medium">{title}</span>
</nav>
```

- [ ] **Step 2: Create PrevNextNav.astro**

Create `apps/landing/src/components/docs/PrevNextNav.astro`:

```astro
---
import type { NavItem } from '../../data/docs-nav';

interface Props {
  prev: NavItem | null;
  next: NavItem | null;
}

const { prev, next } = Astro.props;
---

{(prev || next) && (
  <nav class="border-t border-[var(--ap-border)] mt-16 pt-8 flex justify-between" aria-label="Page navigation">
    {prev ? (
      <a
        href={`/docs/${prev.slug}`}
        class="text-sm text-[var(--ap-text-link)] hover:text-[var(--ap-text-link-hover)] transition-colors no-underline"
      >
        ← {prev.label}
      </a>
    ) : <span />}
    {next ? (
      <a
        href={`/docs/${next.slug}`}
        class="text-sm text-[var(--ap-text-link)] hover:text-[var(--ap-text-link-hover)] transition-colors no-underline"
      >
        {next.label} →
      </a>
    ) : <span />}
  </nav>
)}
```

- [ ] **Step 3: Create CopyAsMarkdown.astro**

Create `apps/landing/src/components/docs/CopyAsMarkdown.astro`:

```astro
---
interface Props {
  rawContent: string;
}

const { rawContent } = Astro.props;
---

<button
  class="inline-flex items-center gap-1.5 text-xs text-[var(--ap-text-tertiary)] hover:text-[var(--ap-text-secondary)] transition-colors border border-[var(--ap-border)] rounded px-2 py-1 cursor-pointer bg-transparent"
  data-copy-md
  aria-label="Copy page as Markdown"
>
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
  <span data-copy-label>Copy as Markdown</span>
</button>

<template data-md-source>{rawContent}</template>

<script>
  document.querySelectorAll('[data-copy-md]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tmpl = btn.parentElement?.querySelector('[data-md-source]') ??
                   btn.closest('[data-md-source]') ??
                   document.querySelector('[data-md-source]');
      const md = tmpl?.textContent || '';
      navigator.clipboard.writeText(md).then(() => {
        const label = btn.querySelector('[data-copy-label]');
        if (label) {
          const original = label.textContent;
          label.textContent = 'Copied!';
          setTimeout(() => { label.textContent = original; }, 2000);
        }
      });
    });
  });
</script>
```

- [ ] **Step 4: Commit**

```bash
git add apps/landing/src/components/docs/Breadcrumb.astro apps/landing/src/components/docs/PrevNextNav.astro apps/landing/src/components/docs/CopyAsMarkdown.astro
git commit -m "feat(docs): add Breadcrumb, PrevNextNav, CopyAsMarkdown components"
```

---

### Task 7: Create DocsSidebar and DocsHeader

**Files:**
- Create: `apps/landing/src/components/docs/DocsSidebar.astro`
- Create: `apps/landing/src/components/docs/DocsHeader.astro`

- [ ] **Step 1: Create DocsSidebar.astro**

Create `apps/landing/src/components/docs/DocsSidebar.astro`:

```astro
---
import { DOCS_NAV } from '../../data/docs-nav';

interface Props {
  currentSlug: string;
}

const { currentSlug } = Astro.props;
---

<nav class="h-full overflow-y-auto py-4 px-3" aria-label="Documentation navigation">
  {DOCS_NAV.map((cat, catIdx) => (
    <div class:list={[catIdx > 0 && 'mt-6']}>
      <p class="text-xs font-pixel tracking-[0.08em] text-[var(--ap-text-tertiary)] uppercase mb-2 px-2">
        {cat.label}
      </p>
      <ul class="list-none space-y-0.5">
        {cat.items.map((item) => {
          const isActive = currentSlug === item.slug;
          return (
            <li>
              <a
                href={`/docs/${item.slug}`}
                class:list={[
                  'block text-sm py-1.5 px-2 rounded-r-sm no-underline transition-colors duration-300',
                  isActive
                    ? 'text-[var(--ap-text-primary)] font-medium border-l-2 border-brand bg-[var(--ap-brand-subtle)] -ml-px'
                    : 'text-[var(--ap-text-secondary)] hover:bg-[var(--ap-bg-card)] hover:text-[var(--ap-text-primary)] border-l-2 border-transparent -ml-px',
                ]}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  ))}
</nav>
```

- [ ] **Step 2: Create DocsHeader.astro**

Create `apps/landing/src/components/docs/DocsHeader.astro`:

```astro
---
---

<header
  class="sticky top-0 z-50 bg-[var(--ap-bg-surface)] border-b border-[var(--ap-border)] h-14"
>
  <div class="h-full px-4 md:px-6 flex items-center gap-4">
    {/* Logo */}
    <a href="/" class="flex items-center shrink-0 no-underline" aria-label="Arlopass home">
      <img src="/ArlopassLogo-Light.svg" alt="Arlopass" class="h-5 w-auto" id="docs-logo-light" />
      <img src="/ArlopassLogo-Dark.svg" alt="Arlopass" class="h-5 w-auto hidden" id="docs-logo-dark" />
    </a>

    {/* Docs label */}
    <a href="/docs" class="text-sm font-pixel tracking-[0.08em] text-brand no-underline">
      Docs
    </a>

    {/* Spacer */}
    <div class="flex-1"></div>

    {/* Search pill (placeholder — Pagefind wired in Phase 5) */}
    <button
      class="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--ap-bg-card)] border border-[var(--ap-border)] text-sm text-[var(--ap-text-tertiary)] cursor-pointer hover:border-[var(--ap-border-strong)] transition-colors"
      id="docs-search-trigger"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <span>Search docs...</span>
      <kbd class="ml-2 text-[10px] text-[var(--ap-text-tertiary)] bg-[var(--ap-bg-surface)] border border-[var(--ap-border)] rounded px-1.5 py-0.5 font-mono">Ctrl+K</kbd>
    </button>

    {/* Back to site link */}
    <a
      href="/"
      class="text-sm text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] transition-colors no-underline hidden md:block"
    >
      ← arlopass.com
    </a>

    {/* Theme toggle */}
    <button
      id="docs-theme-toggle"
      class="flex items-center justify-center w-8 h-8 rounded-md bg-transparent border border-[var(--ap-border)] text-[var(--ap-text-tertiary)] hover:text-[var(--ap-text-primary)] hover:border-[var(--ap-border-strong)] transition-all cursor-pointer"
      aria-label="Toggle theme"
    >
      <svg class="docs-theme-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
      <svg class="docs-theme-moon hidden" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path></svg>
    </button>

    {/* Mobile sidebar toggle */}
    <button
      class="lg:hidden flex items-center justify-center w-8 h-8 rounded-md bg-transparent border border-[var(--ap-border)] text-[var(--ap-text-tertiary)] hover:text-[var(--ap-text-primary)] transition-colors cursor-pointer"
      id="docs-sidebar-toggle"
      aria-label="Toggle sidebar"
      aria-expanded="false"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
    </button>
  </div>
</header>

<script>
  // Theme toggle (same pattern as landing Nav.astro)
  const themeBtn = document.getElementById('docs-theme-toggle');
  const logoLight = document.getElementById('docs-logo-light');
  const logoDark = document.getElementById('docs-logo-dark');

  function updateDocsThemeUI() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeBtn?.querySelector('.docs-theme-sun')?.classList.toggle('hidden', !isDark);
    themeBtn?.querySelector('.docs-theme-moon')?.classList.toggle('hidden', isDark);
    logoLight?.classList.toggle('hidden', isDark);
    logoDark?.classList.toggle('hidden', !isDark);
  }

  const saved = localStorage.getItem('arlopass-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  updateDocsThemeUI();

  themeBtn?.addEventListener('click', () => {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('arlopass-theme', next);
    updateDocsThemeUI();
  });

  // Sidebar toggle (mobile)
  const sidebarToggle = document.getElementById('docs-sidebar-toggle');
  const sidebar = document.getElementById('docs-sidebar');
  sidebarToggle?.addEventListener('click', () => {
    const open = sidebar?.classList.toggle('!translate-x-0');
    sidebar?.classList.toggle('-translate-x-full', !open);
    sidebarToggle.setAttribute('aria-expanded', String(!!open));
  });
</script>
```

- [ ] **Step 3: Commit**

```bash
git add apps/landing/src/components/docs/DocsSidebar.astro apps/landing/src/components/docs/DocsHeader.astro
git commit -m "feat(docs): add DocsSidebar and DocsHeader components"
```

---

### Task 8: Create TableOfContents Component

**Files:**
- Create: `apps/landing/src/components/docs/TableOfContents.astro`

- [ ] **Step 1: Create TableOfContents.astro**

Create `apps/landing/src/components/docs/TableOfContents.astro`:

```astro
---
import type { MarkdownHeading } from 'astro';

interface Props {
  headings: MarkdownHeading[];
}

const { headings } = Astro.props;
const tocHeadings = headings.filter((h) => h.depth === 2 || h.depth === 3);
---

{tocHeadings.length > 0 && (
  <nav class="sticky top-20" aria-label="Table of contents">
    <p class="text-xs font-pixel tracking-[0.08em] text-[var(--ap-text-tertiary)] uppercase mb-3">
      On this page
    </p>
    <ul class="list-none space-y-1.5">
      {tocHeadings.map((h) => (
        <li>
          <a
            href={`#${h.slug}`}
            class:list={[
              'block text-sm no-underline transition-colors hover:text-[var(--ap-text-secondary)]',
              h.depth === 3 ? 'pl-3 text-[var(--ap-text-tertiary)]' : 'text-[var(--ap-text-tertiary)]',
            ]}
            data-toc-link={h.slug}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  </nav>
)}

<script>
  // Scroll-spy: highlight active heading
  const tocLinks = document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]');
  if (tocLinks.length > 0) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            tocLinks.forEach((link) => {
              const isActive = link.dataset.tocLink === entry.target.id;
              link.classList.toggle('text-brand', isActive);
              link.classList.toggle('font-medium', isActive);
              if (!isActive) {
                link.classList.add('text-[var(--ap-text-tertiary)]');
              } else {
                link.classList.remove('text-[var(--ap-text-tertiary)]');
              }
            });
          }
        }
      },
      { rootMargin: '0px 0px -80% 0px', threshold: 0 }
    );

    document.querySelectorAll('h2[id], h3[id]').forEach((heading) => {
      observer.observe(heading);
    });
  }
</script>
```

- [ ] **Step 2: Commit**

```bash
git add apps/landing/src/components/docs/TableOfContents.astro
git commit -m "feat(docs): add TableOfContents with scroll-spy"
```

---

### Task 9: Create DocsLayout.astro

**Files:**
- Create: `apps/landing/src/layouts/DocsLayout.astro`

- [ ] **Step 1: Create the docs layout**

Create `apps/landing/src/layouts/DocsLayout.astro`:

```astro
---
import type { MarkdownHeading } from 'astro';
import '../styles/global.css';
import DocsHeader from '../components/docs/DocsHeader.astro';
import DocsSidebar from '../components/docs/DocsSidebar.astro';
import TableOfContents from '../components/docs/TableOfContents.astro';
import Breadcrumb from '../components/docs/Breadcrumb.astro';
import PrevNextNav from '../components/docs/PrevNextNav.astro';
import CopyAsMarkdown from '../components/docs/CopyAsMarkdown.astro';
import Footer from '../components/Footer.astro';
import { getCategory, getPrevNext } from '../data/docs-nav';

interface Props {
  frontmatter: {
    title: string;
    description: string;
    category: string;
    lastUpdated: Date;
    schema?: string;
    keywords?: string[];
    interactive?: boolean;
  };
  headings: MarkdownHeading[];
  slug: string;
  rawContent?: string;
}

const { frontmatter, headings, slug, rawContent } = Astro.props;
const category = getCategory(slug);
const { prev, next } = getPrevNext(slug);
const canonicalUrl = `https://arlopass.com/docs/${slug}`;
const lastModified = frontmatter.lastUpdated.toISOString();

// JSON-LD structured data
const jsonLd: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': frontmatter.schema || 'TechArticle',
  headline: frontmatter.title,
  description: frontmatter.description,
  dateModified: lastModified,
  url: canonicalUrl,
  author: { '@type': 'Organization', name: 'Arlopass', url: 'https://arlopass.com' },
  publisher: { '@type': 'Organization', name: 'Arlopass', url: 'https://arlopass.com' },
};

const breadcrumbLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://arlopass.com' },
    { '@type': 'ListItem', position: 2, name: 'Docs', item: 'https://arlopass.com/docs' },
    ...(category ? [{ '@type': 'ListItem', position: 3, name: category.label, item: canonicalUrl }] : []),
    { '@type': 'ListItem', position: category ? 4 : 3, name: frontmatter.title, item: canonicalUrl },
  ],
};
---

<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <script is:inline>
      (function () {
        var t = localStorage.getItem("arlopass-theme");
        if (t) document.documentElement.setAttribute("data-theme", t);
      })();
    </script>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />

    {/* Primary SEO */}
    <title>{frontmatter.title} — Arlopass Docs</title>
    <meta name="description" content={frontmatter.description} />
    <link rel="canonical" href={canonicalUrl} />

    {/* Favicon */}
    <link rel="icon" type="image/svg+xml" href="/ArlopassIcon.svg" />

    {/* Open Graph */}
    <meta property="og:type" content="article" />
    <meta property="og:url" content={canonicalUrl} />
    <meta property="og:title" content={frontmatter.title} />
    <meta property="og:description" content={frontmatter.description} />
    <meta property="og:site_name" content="Arlopass" />
    <meta property="article:modified_time" content={lastModified} />

    {/* Twitter */}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={frontmatter.title} />
    <meta name="twitter:description" content={frontmatter.description} />
    <meta name="twitter:site" content="@arlopass" />

    {/* AI crawlers */}
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
    <meta name="last-modified" content={lastModified} />
    {frontmatter.keywords && frontmatter.keywords.length > 0 && (
      <meta name="keywords" content={frontmatter.keywords.join(', ')} />
    )}

    <meta name="author" content="Arlopass" />
    <meta name="theme-color" content="#1C1917" />
    <meta name="color-scheme" content="dark light" />

    {/* JSON-LD */}
    <script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
    <script type="application/ld+json" set:html={JSON.stringify(breadcrumbLd)} />
  </head>

  <body class="bg-[var(--ap-bg-base)] text-[var(--ap-text-body)]">
    <div class="mx-auto max-w-7xl border-x border-[var(--ap-border)] min-h-screen flex flex-col">
      <DocsHeader />

      <div class="flex flex-1 min-h-0">
        {/* Sidebar — hidden on mobile, shown on lg+ */}
        <aside
          id="docs-sidebar"
          class="w-60 shrink-0 border-r border-[var(--ap-border)] bg-[var(--ap-bg-base)] hidden lg:block overflow-y-auto
                 fixed lg:static inset-y-14 left-0 z-40 -translate-x-full lg:translate-x-0 transition-transform duration-300"
        >
          <DocsSidebar currentSlug={slug} />
        </aside>

        {/* Main content */}
        <main class="flex-1 min-w-0 px-4 md:px-8 lg:px-12 py-8">
          <article class="max-w-[65ch] mx-auto">
            <Breadcrumb category={category?.label || frontmatter.category} title={frontmatter.title} />

            {/* Page title + copy button */}
            <div class="flex items-start justify-between gap-4 mb-8">
              <h1 class="text-[clamp(1.75rem,3.5vw,2.5rem)] font-bold tracking-tight text-[var(--ap-text-primary)]">
                {frontmatter.title}
              </h1>
              {rawContent && <CopyAsMarkdown rawContent={rawContent} />}
            </div>

            {/* MDX content rendered here */}
            <div class="
              prose-docs
              [&>p]:text-base [&>p]:leading-relaxed [&>p]:text-[var(--ap-text-body)] [&>p]:mb-4
              [&>h2]:text-[clamp(1.25rem,2.5vw,1.75rem)] [&>h2]:font-bold [&>h2]:tracking-tight [&>h2]:text-[var(--ap-text-primary)] [&>h2]:mt-12 [&>h2]:mb-4
              [&>h3]:text-lg [&>h3]:font-semibold [&>h3]:tracking-tight [&>h3]:text-[var(--ap-text-primary)] [&>h3]:mt-8 [&>h3]:mb-3
              [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:mb-4 [&>ul]:space-y-1.5 [&>ul]:text-[var(--ap-text-body)]
              [&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:mb-4 [&>ol]:space-y-1.5 [&>ol]:text-[var(--ap-text-body)]
              [&>pre]:rounded-lg [&>pre]:bg-[var(--ap-bg-code)] [&>pre]:p-5 [&>pre]:overflow-x-auto [&>pre]:my-6 [&>pre]:text-sm [&>pre]:leading-[1.7]
              [&>blockquote]:border-l-2 [&>blockquote]:border-[var(--ap-border-strong)] [&>blockquote]:pl-4 [&>blockquote]:text-[var(--ap-text-secondary)] [&>blockquote]:my-4
              [&_code]:font-mono [&_:not(pre)>code]:text-amber [&_:not(pre)>code]:bg-[var(--ap-bg-surface)] [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:rounded [&_:not(pre)>code]:text-[0.875em]
              [&_a]:text-[var(--ap-text-link)] [&_a]:no-underline hover:[&_a]:text-[var(--ap-text-link-hover)] [&_a]:transition-colors
              [&>hr]:border-[var(--ap-border)] [&>hr]:my-8
              [&_strong]:text-[var(--ap-text-primary)] [&_strong]:font-semibold
              [&_table]:w-full [&_table]:text-sm [&_table]:border-collapse [&_table]:my-6
              [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-[var(--ap-text-tertiary)] [&_th]:uppercase [&_th]:tracking-wide [&_th]:bg-[var(--ap-bg-surface)] [&_th]:border-b [&_th]:border-[var(--ap-border)]
              [&_td]:px-4 [&_td]:py-3 [&_td]:border-b [&_td]:border-[var(--ap-border)] [&_td]:text-[var(--ap-text-body)]
            ">
              <slot />
            </div>

            <PrevNextNav prev={prev} next={next} />
          </article>
        </main>

        {/* Table of Contents — lg+ only */}
        <aside class="w-[200px] shrink-0 hidden lg:block py-8 pr-4">
          <TableOfContents headings={headings} />
        </aside>
      </div>

      <Footer />
    </div>
  </body>
</html>
```

- [ ] **Step 2: Verify no build errors**

Run: `cd apps/landing && npx astro check`
Expected: Pass.

- [ ] **Step 3: Commit**

```bash
git add apps/landing/src/layouts/DocsLayout.astro
git commit -m "feat(docs): add DocsLayout with three-column shell, SEO meta, JSON-LD"
```

---

### Task 10: Create Dynamic Route and Docs Landing Page

**Files:**
- Create: `apps/landing/src/pages/docs/[...slug].astro`
- Create: `apps/landing/src/pages/docs/index.astro`

- [ ] **Step 1: Create `[...slug].astro`**

Create `apps/landing/src/pages/docs/[...slug].astro`:

```astro
---
import { getCollection } from 'astro:content';
import DocsLayout from '../../layouts/DocsLayout.astro';

export async function getStaticPaths() {
  const docs = await getCollection('docs');
  return docs.map((entry) => ({
    params: { slug: entry.id },
    props: { entry },
  }));
}

const { entry } = Astro.props;
const { Content, headings } = await entry.render();
---

<DocsLayout frontmatter={entry.data} headings={headings} slug={entry.id} rawContent={entry.body}>
  <Content />
</DocsLayout>
```

- [ ] **Step 2: Create `docs/index.astro`**

Create `apps/landing/src/pages/docs/index.astro`:

```astro
---
import '../../styles/global.css';
import DocsHeader from '../../components/docs/DocsHeader.astro';
import DocsSidebar from '../../components/docs/DocsSidebar.astro';
import Footer from '../../components/Footer.astro';
import { DOCS_NAV, ALL_DOCS } from '../../data/docs-nav';

const title = 'Arlopass Documentation';
const description = 'Guides, tutorials, and API reference for the Arlopass AI wallet SDK.';
const canonicalUrl = 'https://arlopass.com/docs';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: title,
  description,
  url: canonicalUrl,
  publisher: { '@type': 'Organization', name: 'Arlopass' },
};

const itemListLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  numberOfItems: ALL_DOCS.length,
  itemListElement: ALL_DOCS.map((item, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: item.label,
    url: `https://arlopass.com/docs/${item.slug}`,
  })),
};
---

<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <script is:inline>
      (function () {
        var t = localStorage.getItem("arlopass-theme");
        if (t) document.documentElement.setAttribute("data-theme", t);
      })();
    </script>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonicalUrl} />
    <link rel="icon" type="image/svg+xml" href="/ArlopassIcon.svg" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content={canonicalUrl} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:site_name" content="Arlopass" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    <meta name="robots" content="index, follow, max-snippet:-1" />
    <meta name="theme-color" content="#1C1917" />
    <meta name="color-scheme" content="dark light" />
    <script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
    <script type="application/ld+json" set:html={JSON.stringify(itemListLd)} />
  </head>

  <body class="bg-[var(--ap-bg-base)] text-[var(--ap-text-body)]">
    <div class="mx-auto max-w-7xl border-x border-[var(--ap-border)] min-h-screen flex flex-col" data-pagefind-ignore>
      <DocsHeader />

      <div class="flex flex-1 min-h-0">
        <aside
          id="docs-sidebar"
          class="w-60 shrink-0 border-r border-[var(--ap-border)] bg-[var(--ap-bg-base)] hidden lg:block overflow-y-auto
                 fixed lg:static inset-y-14 left-0 z-40 -translate-x-full lg:translate-x-0 transition-transform duration-300"
        >
          <DocsSidebar currentSlug="" />
        </aside>

        <main class="flex-1 min-w-0 px-4 md:px-8 lg:px-12 py-8">
          <div class="max-w-3xl mx-auto">
            <span class="block text-sm font-pixel tracking-[0.08em] text-brand">Documentation</span>
            <h1 class="mt-2 text-[clamp(1.75rem,3.5vw,2.5rem)] font-bold tracking-tight text-[var(--ap-text-primary)]">
              Arlopass Docs
            </h1>
            <p class="mt-3 text-base leading-relaxed text-[var(--ap-text-secondary)] max-w-[520px]">
              Everything you need to integrate Arlopass into your web app — from quickstart to API reference.
            </p>

            <div class="mt-12 space-y-10">
              {DOCS_NAV.map((cat) => (
                <section>
                  <h2 class="text-lg font-semibold tracking-tight text-[var(--ap-text-primary)] mb-4">{cat.label}</h2>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {cat.items.map((item) => (
                      <a
                        href={`/docs/${item.slug}`}
                        class="block p-4 rounded-md bg-[var(--ap-bg-card)] border border-[var(--ap-border)] hover:bg-[var(--ap-bg-surface)] hover:border-[var(--ap-border-strong)] transition-colors duration-300 no-underline"
                      >
                        <span class="text-sm font-medium text-[var(--ap-text-primary)]">{item.label}</span>
                      </a>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </main>
      </div>

      <Footer />
    </div>
  </body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add apps/landing/src/pages/docs/
git commit -m "feat(docs): add dynamic route and docs landing page"
```

---

### Task 11: Create Test MDX Page — Welcome

**Files:**
- Create: `apps/landing/src/content/docs/getting-started/welcome.mdx`

- [ ] **Step 1: Create the first MDX page**

Create `apps/landing/src/content/docs/getting-started/welcome.mdx`:

```mdx
---
title: "Welcome to Arlopass"
description: "Arlopass is an open-source AI wallet that lets web apps use a user's own AI providers — Ollama, Claude, GPT, Gemini, Bedrock — without touching API keys."
category: "Getting Started"
order: 1
lastUpdated: 2026-03-29
keywords: ["arlopass", "ai wallet", "browser extension", "sdk", "getting started"]
schema: "TechArticle"
---

import Callout from '../../../components/docs/Callout.astro';

Arlopass lets users bring their own AI provider to any web app. Instead of locking into a single model or forcing users to trust you with API keys, your app connects to whatever provider the user already has — through a browser extension that acts as a universal AI wallet.

## How it works

The architecture has three layers:

- **The Arlopass browser extension** holds the user's provider credentials and exposes a secure transport on the page.
- **The Web SDK** (`@arlopass/web-sdk`) connects to that transport and gives you a client for sending messages, streaming responses, and calling tools.
- **The React SDK** (`@arlopass/react`) wraps the Web SDK in hooks and components so you can build AI-powered UIs with minimal boilerplate.

## Key features

| Feature | Description |
|---------|-------------|
| **Provider Agnostic** | Connect to OpenAI, Anthropic, Google, Ollama, or any provider your users choose. One API, every model. |
| **Secure by Default** | API keys never touch your servers. The browser extension manages credentials, so you ship zero secrets. |
| **Developer Friendly** | Full TypeScript support, React hooks, streaming out of the box, and guard components for common UI states. |

## Choose your path

**Web SDK** — Framework-agnostic. Use with vanilla JS, Svelte, Vue, or any framework. Full control over every call. [Get started with the Web SDK →](/docs/getting-started/quickstart-web-sdk)

**React SDK** — Hooks, providers, and guard components. The fastest way to add AI to a React app. [Get started with the React SDK →](/docs/getting-started/quickstart-react)

<Callout type="tip" title="New to Arlopass?">
  Start with the Installation guide to set up the extension and SDK, then follow the quickstart for your framework.
</Callout>
```

- [ ] **Step 2: Build and verify the page renders**

Run: `cd apps/landing && npx astro build`
Expected: Builds successfully. Check `dist/docs/getting-started/welcome/index.html` exists and contains server-rendered HTML with:
- The full page content (headings, paragraphs, table, callout)
- JSON-LD structured data in `<head>`
- Correct meta tags (title, description, canonical)
- Three-column layout structure

- [ ] **Step 3: Start dev server and visually verify**

Run: `cd apps/landing && npx astro dev`
Navigate to: `http://localhost:4321/docs/getting-started/welcome`

Verify:
- Page renders with correct DocsLayout (header, sidebar, content, ToC)
- Sidebar shows all navigation categories with "Welcome" highlighted as active
- Table of Contents shows "How it works", "Key features", "Choose your path"
- Breadcrumb shows "Docs / Getting Started / Welcome to Arlopass"
- Callout renders with the tip styling
- Copy as Markdown button works
- Theme toggle works
- Links to other docs pages use correct `/docs/` paths
- Landing page at `http://localhost:4321/` is unchanged

Also verify: `http://localhost:4321/docs` shows the docs landing page.

- [ ] **Step 4: Verify existing landing page is unaffected**

Navigate to: `http://localhost:4321/`
Verify: Landing page renders identically to before.

- [ ] **Step 5: Commit**

```bash
git add apps/landing/src/content/docs/getting-started/welcome.mdx
git commit -m "feat(docs): add Welcome page as first MDX test page"
```

---

### Task 12: Update Footer Links

**Files:**
- Modify: `apps/landing/src/components/Footer.astro`

- [ ] **Step 1: Update documentation links to use internal routes**

In `apps/landing/src/components/Footer.astro`, update the `product` links array to point to the new internal docs routes instead of external `https://docs.arlopass.com` URLs:

Change:
```typescript
product: [
    { label: "Install Extension", href: "https://chrome.google.com/webstore" },
    { label: "Documentation", href: "https://docs.arlopass.com" },
    { label: "Quickstart", href: "https://docs.arlopass.com/quickstart" },
    { label: "SDK Reference", href: "https://docs.arlopass.com/sdk" },
  ],
```

To:
```typescript
product: [
    { label: "Install Extension", href: "https://chrome.google.com/webstore" },
    { label: "Documentation", href: "/docs" },
    { label: "Quickstart", href: "/docs/getting-started/quickstart-web-sdk" },
    { label: "SDK Reference", href: "/docs/reference/web-sdk/client" },
  ],
```

- [ ] **Step 2: Build and verify**

Run: `cd apps/landing && npx astro build`
Expected: Builds successfully.

- [ ] **Step 3: Commit**

```bash
git add apps/landing/src/components/Footer.astro
git commit -m "fix(landing): update footer doc links to internal /docs routes"
```

---

### Task 13: Final Verification

- [ ] **Step 1: Full production build**

Run: `cd apps/landing && npx astro build`
Expected: Builds with zero errors. Output includes:
- `dist/index.html` (landing page — unchanged)
- `dist/docs/index.html` (docs landing)
- `dist/docs/getting-started/welcome/index.html` (test doc page)
- `dist/sitemap-0.xml` (includes `/docs/getting-started/welcome`)

- [ ] **Step 2: Preview production build**

Run: `cd apps/landing && npx astro preview`
Navigate to all pages and verify they work:
- `http://localhost:4321/` — landing page
- `http://localhost:4321/docs` — docs landing
- `http://localhost:4321/docs/getting-started/welcome` — test doc page

- [ ] **Step 3: Verify server-rendered HTML**

Run: `cat apps/landing/dist/docs/getting-started/welcome/index.html | head -50`
Expected: Full HTML document with content visible — not an empty div waiting for JS.

- [ ] **Step 4: Check sitemap includes docs**

Run: `cat apps/landing/dist/sitemap-0.xml`
Expected: Contains `<url><loc>https://arlopass.com/docs/getting-started/welcome</loc>...</url>`

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(docs): complete Phase 1 foundation — docs infrastructure ready"
```
