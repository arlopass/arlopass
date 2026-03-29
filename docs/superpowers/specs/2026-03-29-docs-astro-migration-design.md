# Docs → Astro Migration Design Spec

**Date:** 2026-03-29
**Status:** Draft
**Author:** Copilot + Human
**Scope:** Migrate documentation from `apps/examples-web` (React SPA) into `apps/landing` (Astro SSG) with full SEO/GEO optimization.

---

## 1. Problem Statement

The current documentation app (`apps/examples-web`) is a React SPA rendered entirely client-side behind a single `index.html`. Search engines and AI crawlers see nothing — zero indexable content, no structured data, no sitemap entries for doc pages, no server-rendered HTML. The landing page (`apps/landing`) already has excellent SEO infrastructure but no docs.

**Goal:** Unify docs into the landing page Astro codebase so that all 41 documentation pages are server-rendered, SEO-optimized, GEO-optimized, and visually consistent with the landing page aesthetic — while preserving the 6 live interactive pages and AI chat sidebar as React islands. Plus a new `/docs/` landing page (42 routes total).

---

## 2. Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Interactive pages | React islands inside Astro | Best UX — single site, Astro islands arch designed for this |
| Static page authoring | MDX + Content Collections | Standard for docs, auto-routing, type-safe frontmatter, portable |
| URL structure | `/docs/{slug}` prefix | Clean IA, separates marketing from docs, standard pattern |
| Search | Pagefind (replaces Mantine Spotlight) | ~6KB WASM, build-time index, zero framework dependency, full-text |
| ChatSidebar | Persistent React island (`client:idle`) | Product demo embedded in docs, loads after idle, doesn't block paint |
| Migration strategy | Incremental (6 phases) | Low risk, landing page never breaks, SEO value ships early |
| Visual design | Match landing page exactly | Same `--ap-*` tokens, Geist fonts, section header conventions, card patterns |

---

## 3. Architecture

### 3.1 File Structure

```
apps/landing/
├── astro.config.ts              # Modified: add @astrojs/react, @astrojs/mdx, @astrojs/sitemap
├── src/
│   ├── content/
│   │   ├── config.ts            # Content Collection schema
│   │   └── docs/                # 41 MDX files (28 static + 7 hybrid + 6 interactive wrappers)
│   │       ├── getting-started/
│   │       │   ├── welcome.mdx
│   │       │   ├── installation.mdx
│   │       │   ├── quickstart-web-sdk.mdx
│   │       │   └── quickstart-react.mdx
│   │       ├── tutorials/
│   │       │   ├── first-chat-app.mdx
│   │       │   ├── streaming-responses.mdx
│   │       │   ├── provider-selection.mdx
│   │       │   └── adding-tool-calling.mdx
│   │       ├── guides/
│   │       │   ├── conversation-management.mdx
│   │       │   ├── tool-calling.mdx
│   │       │   ├── error-handling.mdx
│   │       │   ├── testing.mdx
│   │       │   ├── guard-components.mdx
│   │       │   └── security.mdx
│   │       ├── components/
│   │       │   ├── overview.mdx
│   │       │   ├── chat.mdx
│   │       │   ├── message.mdx
│   │       │   ├── streaming-text.mdx
│   │       │   ├── provider-picker.mdx
│   │       │   ├── tool-activity.mdx
│   │       │   ├── connection-status.mdx
│   │       │   └── registry.mdx
│   │       ├── reference/
│   │       │   ├── react/
│   │       │   │   ├── provider.mdx
│   │       │   │   ├── hooks.mdx
│   │       │   │   ├── guards.mdx
│   │       │   │   ├── types.mdx
│   │       │   │   └── testing.mdx
│   │       │   └── web-sdk/
│   │       │       ├── client.mdx
│   │       │       ├── conversation-manager.mdx
│   │       │       ├── types.mdx
│   │       │       └── error-codes.mdx
│   │       ├── concepts/
│   │       │   ├── how-arlopass-works.mdx
│   │       │   ├── transport-model.mdx
│   │       │   ├── state-management.mdx
│   │       │   └── web-sdk-vs-react.mdx
│   │       └── interactive/
│   │           ├── playground.mdx
│   │           ├── connection.mdx
│   │           ├── providers.mdx
│   │           ├── chat.mdx
│   │           ├── streaming.mdx
│   │           └── event-log.mdx
│   ├── layouts/
│   │   ├── Layout.astro         # Existing (marketing) — unchanged
│   │   └── DocsLayout.astro     # New: docs shell
│   ├── pages/
│   │   ├── index.astro          # Existing landing — unchanged
│   │   └── docs/
│   │       ├── index.astro      # Docs landing page
│   │       └── [...slug].astro  # Dynamic route from content collection
│   ├── components/
│   │   ├── (existing landing components — untouched)
│   │   ├── docs/                # Astro doc components
│   │   │   ├── DocsSidebar.astro
│   │   │   ├── DocsHeader.astro
│   │   │   ├── TableOfContents.astro
│   │   │   ├── PrevNextNav.astro
│   │   │   ├── Breadcrumb.astro
│   │   │   ├── CodeBlock.astro
│   │   │   ├── Callout.astro
│   │   │   ├── ApiTable.astro
│   │   │   ├── StepList.astro
│   │   │   └── CopyAsMarkdown.astro
│   │   └── islands/             # React islands
│   │       ├── ChatSidebar.tsx
│   │       ├── InteractivePlayground.tsx
│   │       ├── InteractiveConnection.tsx
│   │       ├── InteractiveProviders.tsx
│   │       ├── InteractiveChat.tsx
│   │       ├── InteractiveStreaming.tsx
│   │       ├── InteractiveEventLog.tsx
│   │       ├── InteractiveContext.tsx
│   │       └── TabGroup.tsx
│   └── styles/
│       └── global.css           # Existing — shared across landing + docs
├── scripts/
│   └── generate-llms-txt.ts     # Post-build: generates llms.txt + llms-full.txt
└── public/
    ├── llms.txt                 # Existing (will be replaced by build output)
    ├── robots.txt               # Existing — add llms.txt references
    └── sitemap.xml              # Replaced by @astrojs/sitemap auto-generation
```

### 3.2 Astro Configuration Changes

```typescript
// astro.config.ts — additions
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://arlopass.com',
  integrations: [
    react(),           // React islands
    mdx(),             // MDX content
    sitemap({          // Auto-generated sitemap
      serialize(item) {
        // Per-category priority weighting
        if (item.url.includes('/docs/getting-started/')) item.priority = 0.9;
        else if (item.url.includes('/docs/tutorials/')) item.priority = 0.8;
        else if (item.url.includes('/docs/interactive/')) item.priority = 0.5;
        else if (item.url.includes('/docs/')) item.priority = 0.7;
        return item;
      },
    }),
  ],
  // ... existing config
});
```

### 3.3 Content Collection Schema

```typescript
// src/content/config.ts
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
    prev: z.string().optional(),
    next: z.string().optional(),
  }),
});

export const collections = { docs };
```

### 3.4 Dynamic Route

```astro
---
// src/pages/docs/[...slug].astro
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

<DocsLayout frontmatter={entry.data} headings={headings} slug={entry.id}>
  <Content />
</DocsLayout>
```

---

## 4. Docs Layout Design

### 4.1 Three-Column Layout

```
┌─────────────────────────────────────────────────────────┐
│  DocsHeader (sticky, h-14)                              │
│  Logo → / | "Docs" label | Nav links | Search ⌘K | ☐   │
├──────────┬──────────────────────────────┬───────────────┤
│ Sidebar  │  Content                     │ ToC (desktop) │
│ 240px    │  max-w-[65ch] mx-auto        │ 200px         │
│          │                              │               │
│ Overline │  Breadcrumb                  │ On this page  │
│  • Link  │  # Page Title [Copy as MD]   │  • Heading 2  │
│  • Link  │                              │  • Heading 2  │
│  ·active │  Body content from MDX       │    • Heading 3│
│          │  Code blocks, callouts,      │               │
│          │  tables, step lists           │               │
│          │                              │               │
│          │  ─── ← Prev / Next → ───     │               │
├──────────┴──────────────────────────────┴───────────────┤
│  Footer (reuse landing Footer.astro)                    │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Design Token Usage (matching landing page exactly)

**DocsHeader (sticky)**
- Background: `bg-[var(--ap-bg-surface)]`
- Border: `border-b border-[var(--ap-border)]`
- Height: `h-14` (56px)
- Logo: links to `/` (marketing home)
- "Docs" label: `text-sm font-pixel tracking-[0.08em] text-brand`
- Nav links: `text-sm text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] transition-colors`
- Search pill: `bg-[var(--ap-bg-card)] border border-[var(--ap-border)] rounded-md px-3 py-1.5 text-sm text-[var(--ap-text-tertiary)]` with `Ctrl+K` kbd

**DocsSidebar**
- Background: `bg-[var(--ap-bg-base)]`
- Border: `border-r border-[var(--ap-border)]`
- Width: `w-60` (240px)
- Category labels: `text-xs font-pixel tracking-[0.08em] text-[var(--ap-text-tertiary)] uppercase`
- Page links: `text-sm text-[var(--ap-text-secondary)]`
- Active state: `text-[var(--ap-text-primary)] font-medium border-l-2 border-brand bg-[var(--ap-brand-subtle)]`
- Hover: `bg-[var(--ap-bg-card)] transition-colors duration-300`
- Category spacing: `mt-6` between groups, `mb-2` after label

**Content Area**
- Max width: `max-w-[65ch]` for prose
- Heading H1: `text-[clamp(1.75rem,3.5vw,2.5rem)] font-bold tracking-tight text-[var(--ap-text-primary)]`
- Heading H2: `text-[clamp(1.25rem,2.5vw,1.75rem)] font-bold tracking-tight text-[var(--ap-text-primary)] mt-12 mb-4`
- Heading H3: `text-lg font-semibold tracking-tight text-[var(--ap-text-primary)] mt-8 mb-3`
- Body: `text-base leading-relaxed text-[var(--ap-text-body)]`
- Paragraphs: `mb-4`
- Links: `text-[var(--ap-text-link)] hover:text-[var(--ap-text-link-hover)] transition-colors`
- Lists: `list-disc pl-6 mb-4 space-y-1 text-[var(--ap-text-body)]`

**Table of Contents (right rail)**
- Width: `w-[200px]`
- Sticky: `sticky top-20`
- Label: `text-xs font-pixel tracking-[0.08em] text-[var(--ap-text-tertiary)] uppercase mb-3`
- Links: `text-sm text-[var(--ap-text-tertiary)] hover:text-[var(--ap-text-secondary)] transition-colors`
- Active: `text-brand font-medium`
- Scroll-spy: IntersectionObserver in a vanilla JS `<script>` tag
- Hidden below `lg:` breakpoint

**Prev/Next Navigation**
- Separator: `border-t border-[var(--ap-border)] mt-16 pt-8`
- Links: `text-sm text-[var(--ap-text-link)]` with arrow indicators
- Hover: `text-[var(--ap-text-link-hover)] transition-colors`

### 4.3 Responsive Behavior

| Breakpoint | Sidebar | Content | ToC |
|------------|---------|---------|-----|
| `< sm` (mobile) | Hidden — hamburger toggle overlay | Full width, `px-4` | Hidden |
| `sm – lg` (tablet) | Hidden — hamburger toggle overlay | Full width, `px-6` | Hidden |
| `lg+` (desktop) | Visible, fixed 240px | Centered `max-w-[65ch]` | Visible, fixed 200px |

---

## 5. Astro Doc Components

### 5.1 CodeBlock.astro

Built on Astro's native Shiki integration. Always dark background regardless of theme.

- Container: `bg-[var(--ap-bg-code)] rounded-lg overflow-hidden`
- Browser chrome: traffic-light dots (`h-3 w-3 rounded-full` red/yellow/green), file label in `text-[11px] text-stone-500 font-mono`, copy button
- Code area: `p-5 overflow-x-auto font-mono text-sm leading-[1.7] text-stone-300`
- Tab size: `tab-size: 2`
- Syntax highlighting: Shiki theme configured to match landing page keyword colors:
  - Keywords: `#db4d12` (brand terracotta)
  - Strings: `#d97706` (amber)
  - Comments: `#78716c` (tertiary)
  - Identifiers: `#fafaf9` (primary)
  - Properties: `#d6d3d1` (body)
- Copy button: top-right, `text-stone-500 hover:text-stone-300 transition-colors`

### 5.2 Callout.astro

Four semantic variants with left-border accent:

| Variant | Border | Icon color | Use case |
|---------|--------|------------|----------|
| `info` | `border-l-2 border-brand` | terracotta | General information |
| `warning` | `border-l-2 border-warning` | amber | Cautions |
| `success` | `border-l-2 border-success` | sage green | Tips, confirmations |
| `tip` | `border-l-2 border-[var(--ap-border-strong)]` | neutral | Helpful hints |

- Surface: `bg-[var(--ap-bg-card)] rounded-md p-4`
- Title: `font-semibold text-sm text-[var(--ap-text-primary)]`
- Body: `text-sm text-[var(--ap-text-body)] mt-1`
- Semantic HTML: `<aside role="note">` for AI extractability

### 5.3 ApiTable.astro

Props passed as structured data, rendered as a real HTML `<table>`:

- Container: `overflow-x-auto rounded-lg border border-[var(--ap-border)]`
- Header: `bg-[var(--ap-bg-surface)] text-xs font-medium text-[var(--ap-text-tertiary)] uppercase tracking-wide`
- Cells: `px-4 py-3 border-b border-[var(--ap-border)] text-sm`
- Prop names: `font-mono text-amber` (same as inline code)
- Types: `font-mono text-[var(--ap-text-tertiary)]`
- Descriptions: `text-[var(--ap-text-body)]`
- Required badge: `text-xs bg-brand/10 text-brand rounded px-1.5 py-0.5`

### 5.4 StepList.astro

Numbered workflow matching landing page HowItWorks pattern:

- Number circles: `h-8 w-8 rounded-full bg-brand text-white text-sm font-bold flex items-center justify-center`
- Connecting line: `border-l-2 border-[var(--ap-border)] ml-4`
- Step title: `font-semibold text-[var(--ap-text-primary)]`
- Step body: `text-[var(--ap-text-body)] text-sm leading-relaxed`

### 5.5 CopyAsMarkdown.astro

Button in `DocsHeader` area next to page title:

- Appearance: `text-xs text-[var(--ap-text-tertiary)] hover:text-[var(--ap-text-secondary)] transition-colors border border-[var(--ap-border)] rounded px-2 py-1`
- Icon: clipboard icon (Tabler)
- Behavior: vanilla JS `<script>` reads a `<template>` element containing the page's raw Markdown (injected at build time via Astro's `entry.body` property — the raw MDX source with frontmatter stripped), copies to clipboard
- Success feedback: icon briefly changes to checkmark, reverts after 2s

---

## 6. React Islands

### 6.1 Island Inventory

| Island | File | Directive | Pages | Dependencies |
|--------|------|-----------|-------|-------------|
| ChatSidebar | `islands/ChatSidebar.tsx` | `client:idle` | All docs pages (in DocsLayout) | React, Mantine subset, `@arlopass/react` |
| InteractivePlayground | `islands/InteractivePlayground.tsx` | `client:load` | `/docs/interactive/playground` | React, Mantine, InteractiveContext, `@arlopass/web-sdk` |
| InteractiveConnection | `islands/InteractiveConnection.tsx` | `client:load` | `/docs/interactive/connection` | Same as above |
| InteractiveProviders | `islands/InteractiveProviders.tsx` | `client:load` | `/docs/interactive/providers` | Same as above |
| InteractiveChat | `islands/InteractiveChat.tsx` | `client:load` | `/docs/interactive/chat` | Same as above |
| InteractiveStreaming | `islands/InteractiveStreaming.tsx` | `client:load` | `/docs/interactive/streaming` | Same as above |
| InteractiveEventLog | `islands/InteractiveEventLog.tsx` | `client:load` | `/docs/interactive/event-log` | Same as above |
| TabGroup | `islands/TabGroup.tsx` | `client:visible` | 7 hybrid component-doc pages (chat, message, streaming-text, provider-picker, tool-activity, connection-status, registry) | React only (tiny) |

### 6.2 ChatSidebar Architecture

The ChatSidebar is ported from `examples-web` with these adaptations:

- **Trigger**: A button in `DocsHeader.astro` (pure HTML/CSS) dispatches `CustomEvent('toggle-chat')` on `document`
- **Island mount**: `<ChatSidebar client:idle />` in `DocsLayout.astro`, listens for the custom event
- **Provider**: Wraps itself in `<ArlopassProvider>` — isolated from the rest of the page
- **Navigation**: `onNavigate` prop calls `window.location.href = '/docs/' + pageId` (full page navigation, not SPA routing)
- **Doc search tool**: The `searchDocs()` function is ported to work against the content collection metadata (titles + descriptions + keywords from frontmatter)
- **Collapsed state**: When closed, the React tree is still mounted but the slide-out panel is hidden via CSS — no re-initialization lag on reopen

### 6.3 Interactive Pages Architecture

The 6 interactive pages share `InteractiveContext.tsx` (ported from `examples-web`). Each interactive MDX page is a thin wrapper:

```mdx
---
title: "Playground"
description: "Live SDK sandbox — connect, list providers, send messages, stream responses."
category: "Interactive"
order: 1
lastUpdated: 2026-03-29
schema: "WebApplication"
interactive: true
---
import InteractivePlayground from '../../components/islands/InteractivePlayground';

<InteractivePlayground client:load />
```

The React subtree for interactive pages renders inside a `<MantineProvider>` + `<ArlopassProvider>` + `<InteractiveProvider>` wrapper — self-contained, no leaking into the Astro shell.

### 6.4 TabGroup Island

Minimal React component for switching between Web SDK and React SDK code:

```tsx
// islands/TabGroup.tsx
import { useState } from 'react';

type Tab = { label: string; content: string };

export function TabGroup({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(0);
  return (
    <div>
      <div role="tablist" className="flex gap-0 border-b border-[var(--ap-border)]">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`px-4 py-2 text-sm transition-colors ${
              i === active
                ? 'text-brand border-b-2 border-brand font-medium'
                : 'text-[var(--ap-text-tertiary)] hover:text-[var(--ap-text-secondary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-4">
        {/* Rendered code block content */}
      </div>
    </div>
  );
}
```

---

## 7. Search (Pagefind)

### 7.1 Build-time Integration

Pagefind runs after `astro build` to index the rendered HTML:

```json
// package.json scripts
{
  "build": "astro build && npx pagefind --site dist"
}
```

Configuration via `pagefind.yml`:
```yaml
site: dist
glob: "docs/**/*.html"
exclude_selectors:
  - "[data-pagefind-ignore]"  # Exclude nav, footer, interactive islands
```

### 7.2 Search Trigger (Ctrl+K)

A lightweight Astro component in `DocsHeader.astro`:

- **Trigger button**: Styled as a search pill — `bg-[var(--ap-bg-card)] border border-[var(--ap-border)] rounded-md` with "Search docs..." text and `<kbd>Ctrl+K</kbd>`
- **Modal**: Vanilla HTML `<dialog>` element, styled with landing page tokens
- **Pagefind UI**: Lazy-loaded via dynamic `import('/pagefind/pagefind.js')` when the dialog opens
- **Keyboard shortcut**: Vanilla JS listener for `Ctrl+K` / `Cmd+K`
- **No React** — the entire search is framework-free

### 7.3 Result Styling

Pagefind UI is minimally styled to match the landing page:
- Result background: `bg-[var(--ap-bg-card)]`
- Result hover: `bg-[var(--ap-bg-surface)] transition-colors duration-300`
- Title: `text-sm font-medium text-[var(--ap-text-primary)]`
- Excerpt: `text-sm text-[var(--ap-text-secondary)]`
- Highlight: `text-brand font-medium` (terracotta matching)

---

## 8. SEO & GEO Optimization

### 8.1 Per-page Meta (DocsLayout.astro `<head>`)

Generated from frontmatter for every doc page:

```html
<title>{title} — Arlopass Docs</title>
<meta name="description" content={description} />
<link rel="canonical" href={`https://arlopass.com/docs/${slug}`} />

<!-- Open Graph -->
<meta property="og:type" content="article" />
<meta property="og:url" content={canonicalUrl} />
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:image" content={ogImage} />
<meta property="og:site_name" content="Arlopass" />
<meta property="article:modified_time" content={lastUpdated.toISOString()} />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content={title} />
<meta name="twitter:description" content={description} />
<meta name="twitter:image" content={ogImage} />

<!-- AI crawlers -->
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta name="last-modified" content={lastUpdated.toISOString()} />
```

### 8.2 JSON-LD Structured Data

Each page gets a JSON-LD block based on its `schema` frontmatter field:

| Page type | JSON-LD schema | Key fields |
|-----------|---------------|------------|
| Tutorials (`HowTo`) | `HowTo` + `BreadcrumbList` | name, step[].text, totalTime |
| Reference (`TechArticle`) | `TechArticle` + `BreadcrumbList` | headline, dateModified, author, about, proficiencyLevel |
| Guides (`Article`) | `Article` + `BreadcrumbList` | headline, dateModified, author, articleSection |
| Interactive (`WebApplication`) | `WebApplication` + `BreadcrumbList` | name, applicationCategory, operatingSystem |
| Docs landing | `CollectionPage` + `ItemList` | numberOfItems, itemListElement[] |

All pages also include:
- `BreadcrumbList` — `Home > Docs > {Category} > {Page}`
- `Organization` — Arlopass (linked from article author)
- `WebSite` with `SearchAction` — links to Pagefind

### 8.3 GEO Content Structure Rules

Every MDX doc page follows these structural rules for AI extractability:

1. **Answer-first**: First paragraph is a direct, self-contained answer (40-60 words optimal for snippet extraction)
2. **Heading hierarchy**: Strict H1 > H2 > H3, headings phrased as natural-language queries where possible (e.g., "How does the transport model work?" not "Transport Model Overview")
3. **Code blocks as first-class content**: Always rendered as `<pre><code>` with language attribute — AI crawlers index code
4. **Tables over prose**: API parameters, comparisons, and options always in tables
5. **Lists over paragraphs**: Enumerable content always in ordered/unordered lists
6. **Semantic HTML**: `<aside>` for callouts, `<table>` for data, `<code>` for identifiers, `<article>` for page content

### 8.4 llms.txt (Build-time Generated)

**`/llms.txt`** — Concise index file:

```
# Arlopass Documentation

> Open-source AI access management for the web.

## Getting Started
- [Welcome](https://arlopass.com/docs/getting-started/welcome): Introduction to Arlopass and core concepts.
- [Installation](https://arlopass.com/docs/getting-started/installation): Install the browser extension and SDK.
...

## Tutorials
- [Build your first chat app](https://arlopass.com/docs/tutorials/first-chat-app): ...
...
```

Auto-generated from Content Collection at build time. Groups pages by category, includes title + description for each.

**`/llms-full.txt`** — Full content dump:

```
# Arlopass Documentation — Full Content

---

## Welcome to Arlopass

Arlopass is an open-source AI wallet...

[Full rendered Markdown of each page, stripped of JSX/React islands]

---

## Installation

Prerequisites: ...

---
```

Built by `scripts/generate-llms-txt.ts` which:
1. Reads all content collection entries
2. Strips frontmatter and JSX components
3. Renders MDX as clean Markdown
4. Concatenates with `---` separators
5. Writes to `dist/llms.txt` and `dist/llms-full.txt`

### 8.5 Sitemap

- Generated by `@astrojs/sitemap` integration
- Includes all `/docs/*` pages with `lastmod` from frontmatter
- Priority: getting-started → 0.9, tutorials → 0.8, reference → 0.7, interactive → 0.5
- Replaces the current static `sitemap.xml`

### 8.6 robots.txt Updates

```
# Existing rules unchanged
User-agent: *
Allow: /

# ... (existing AI bot rules)

Sitemap: https://arlopass.com/sitemap.xml
```

---

## 9. Migration Phases

### Phase 1: Foundation

**Goal:** Astro infrastructure ready — can render a single test doc page.

- Add `@astrojs/react`, `@astrojs/mdx`, `@astrojs/sitemap` to `astro.config.ts`
- Add React, Mantine, Tabler Icons to `package.json`
- Create `src/content/config.ts` with docs collection schema
- Create `DocsLayout.astro` (header, sidebar, content area, ToC, footer)
- Create `src/pages/docs/[...slug].astro` dynamic route
- Create `src/pages/docs/index.astro` docs landing
- Create all Astro doc components: `CodeBlock`, `Callout`, `ApiTable`, `StepList`, `Breadcrumb`, `PrevNextNav`, `CopyAsMarkdown`
- Create one test MDX page (`getting-started/welcome.mdx`) to validate the pipeline
- Configure Shiki theme for code highlighting to match landing page colors

### Phase 2: Static Pages (28 pages)

**Goal:** All static documentation live at `/docs/*`, server-rendered, indexable.

- Convert all 28 static React pages to MDX files
- Rewrite visual presentation: replace Mantine Stack/Title/Text with landing-page heading conventions (pixel-font labels, clamp headings, secondary body text)
- Preserve all code examples, callouts, API tables, step lists
- Add frontmatter (title, description, category, order, lastUpdated, keywords, schema)
- Wire up prev/next navigation from frontmatter
- Validate: all 28 pages render correctly, heading hierarchy is correct

### Phase 3: Hybrid Pages (8 pages)

**Goal:** Component documentation pages with interactive tab switchers.

- Create `TabGroup.tsx` React island
- Convert 7 component-doc pages to MDX with `<TabGroup client:visible />` for code switching (chat, message, streaming-text, provider-picker, tool-activity, connection-status, registry — `overview.mdx` is fully static, no TabGroup needed)
- Validate: tabs switch correctly, code blocks render, no unnecessary JS on static sections

### Phase 4: Interactive Pages + ChatSidebar

**Goal:** Live SDK playground and AI chat assistant working as React islands.

- Port `InteractiveContext.tsx` from `examples-web`
- Port all 6 interactive page components as islands
- Port `ChatSidebar.tsx` — adapt for full-page navigation, wrap in `ArlopassProvider`
- Wire ChatSidebar into `DocsLayout.astro` with `client:idle`
- Wire interactive pages via thin MDX wrappers with `client:load`
- Validate: SDK connection, streaming, tool calls, provider selection all working

### Phase 5: Search + SEO Pass

**Goal:** Full Pagefind search, structured data, llms.txt, sitemap.

- Install and configure Pagefind
- Build search trigger UI (Ctrl+K dialog)
- Add JSON-LD structured data to `DocsLayout.astro` (per-page schema from frontmatter)
- Create `scripts/generate-llms-txt.ts` — generates `/llms.txt` and `/llms-full.txt`
- Update `robots.txt` with llms.txt references
- Configure `@astrojs/sitemap` with priority weighting
- Run structured data validation (Google Rich Results Test)
- Validate all pages render complete HTML (view source confirms server-rendered content)

### Phase 6: Deprecate examples-web

**Goal:** Single source of truth for documentation.

- Update all external links (landing page, README, extension) to point to `/docs/*`
- Add redirect shim in old `examples-web` for any bookmarked hash routes
- Remove `examples-web` from build pipeline
- Update monorepo workspace config

---

## 10. JS Budget Analysis

| Page type | JavaScript shipped | Explanation |
|-----------|-------------------|-------------|
| Static doc page (28 pages) | ~8KB (Pagefind trigger + theme toggle) | Zero React |
| Hybrid doc page (7 pages) | ~12KB (above + TabGroup island) | Tiny React island |
| Interactive page (6 pages) | ~180KB (React + Mantine + SDK + islands) | Full interactive app |
| ChatSidebar JS (all pages) | +~120KB (loaded via `client:idle` after page idle) | Ships on every page but deferred — does not block paint or LCP. Cost is download + parse, not interaction-gated. |

**Comparison with current SPA:** The current `examples-web` ships ~350KB+ on every page load regardless of content type. After migration, 28 of 41 pages ship essentially zero framework JS (only Pagefind + theme toggle). The ChatSidebar idle-load adds ~120KB deferred JS to all pages but does not affect Core Web Vitals since it loads after the browser is idle.



---

## 11. What Stays Unchanged

- `apps/landing/src/pages/index.astro` — marketing landing page (untouched)
- All existing landing page components in `src/components/` (untouched)
- `src/styles/global.css` — shared design tokens (no modifications needed)
- `src/layouts/Layout.astro` — marketing layout (unchanged, docs use separate `DocsLayout.astro`)
- `public/fonts/`, `public/ArlopassIcon.svg`, logos — shared assets (untouched)

---

## 12. Out of Scope

- Blog section (`/blog/`)
- Pricing page (`/pricing/`)
- Changelog page
- i18n / multi-language docs
- Server-side rendering (docs remain static — SSG is sufficient for SEO)
- Automated OG image generation (can be added later)
- Analytics integration
