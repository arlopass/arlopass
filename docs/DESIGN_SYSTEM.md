# Arlopass Design System

> **For AI agents and developers** — the single source of truth for all Arlopass frontend surfaces: browser extension, documentation site, marketing pages, and web applications.

---

## 1. Foundations

### Design Philosophy

Clean, minimal, modern — warm where others are cold. Arlopass surfaces draw inspiration from Vercel's precision, Supabase's clarity, Cursor's warmth, and Tailwind's density. Every pixel earns its place. No decoration without function.

**Core principles:**
1. **Warm neutrals, not cool grays.** Every neutral is stone-tinted, never blue-gray.
2. **Generous whitespace.** Let content breathe. Crowded UI signals poor design.
3. **Typography-driven hierarchy.** Size, weight, and color do the work — not borders, shadows, or background fills.
4. **Dark mode is the primary context.** Design dark-first, adapt to light. Dark mode uses brown-blacks, not blue-blacks.
5. **Code is content.** Code blocks are first-class citizens with careful typographic treatment.
6. **Motion is purposeful.** Animate state changes, not decoration.

### UI Framework

- **Component library:** Mantine (v8 for examples-web, v8 for extension)
- **Icons:** Tabler Icons (`@tabler/icons-react`)
- **Fonts:** Geist Sans (body + headings), Geist Mono (code) — loaded via `geist` npm package or self-hosted from [vercel/geist-font](https://github.com/vercel/geist-font)

---

## 2. Color System

### 2.1 Token Definitions

All colors are defined as CSS custom properties on `:root` and toggled via `[data-theme="dark"]` or `[data-theme="light"]` (or Mantine's `useMantineColorScheme`).

#### Brand Colors (constant across themes)

```css
:root {
  /* Brand signature */
  --ap-brand: #DB4D12;           /* Terracotta — primary accent */
  --ap-brand-hover: #9A3412;     /* Terracotta darkened — hover state */

  /* Secondary accent */
  --ap-amber: #D97706;           /* Warm amber — secondary accent, hover */
  --ap-amber-hover: #B45309;     /* Amber darkened */

  /* Semantic */
  --ap-success: #4D7C0F;         /* Sage green — connected, approved, pass granted */
  --ap-warning: #CA8A04;         /* Gold — permission prompts, caution */
  --ap-danger: #B91C1C;          /* Crimson — denied, error, blocked */
}
```

#### Dark Theme (Primary)

```css
[data-theme="dark"], :root {
  --ap-bg-base: #1C1917;         /* Deep brown-black — page background */
  --ap-bg-surface: #292524;      /* Stone dark — elevated surfaces */
  --ap-bg-elevated: #3D3835;     /* Stone mid — modals, popovers, dropdowns */
  --ap-bg-code: #1A1412;         /* Espresso — code block background */
  --ap-bg-card: #292524;         /* Card backgrounds — same as surface in dark */

  --ap-border: #44403C;          /* Warm border — subtle dividers */
  --ap-border-strong: #57534E;   /* Stronger border — active states, inputs */

  --ap-text-primary: #FAFAF9;    /* Warm white — headings, emphasis only */
  --ap-text-body: #D6D3D1;       /* Warm stone — body text, default */
  --ap-text-secondary: #A8A29E;  /* Muted stone — labels, metadata, placeholders */
  --ap-text-tertiary: #78716C;   /* Dim stone — disabled, decorative text */

  --ap-text-link: #DB4D12;       /* Terracotta — links */
  --ap-text-link-hover: #D97706; /* Amber — link hover */

  --ap-success-subtle: #1A2E05;  /* Sage on dark */
  --ap-brand-subtle: #2C1A0E;    /* Terracotta tint on dark — theme-aware */
  --ap-warning-subtle: #2E2204;  /* Gold on dark */
  --ap-danger-subtle: #2E0505;   /* Crimson on dark */

  /* Glassmorphism */
  --ap-glass-bg: rgba(38, 35, 32, 0.6);     /* Dark translucent glass */
  --ap-glass-ring: rgba(255, 255, 255, 0.08); /* Subtle light ring */
  --ap-mosaic-overlay: rgba(28, 25, 23, 0.4); /* Dark warm overlay on mosaic images */

  /* CTA button (inverted per theme) */
  --ap-cta-bg: #FAFAF9;
  --ap-cta-text: #1C1917;
}
```

#### Light Theme

```css
[data-theme="light"] {
  --ap-bg-base: #FAFAF9;         /* Warm white — page background */
  --ap-bg-surface: #FFFFFF;      /* Pure white — elevated surfaces */
  --ap-bg-elevated: #FFFFFF;     /* Same — modals, popovers */
  --ap-bg-code: #1C1917;         /* Code blocks stay dark in light mode */
  --ap-bg-card: #FFFFFF;         /* Card backgrounds — white in light */

  --ap-border: #E7E5E4;          /* Warm light border */
  --ap-border-strong: #D6D3D1;   /* Stronger border — inputs, active states */

  --ap-text-primary: #1C1917;    /* Near-black warm — headings */
  --ap-text-body: #292524;       /* Warm charcoal — body text */
  --ap-text-secondary: #78716C;  /* Muted — labels, metadata */
  --ap-text-tertiary: #A8A29E;   /* Dim — disabled, decorative */

  --ap-text-link: #DB4D12;       /* Terracotta — links */
  --ap-text-link-hover: #9A3412; /* Terracotta dark — link hover */
}
```

### 2.2 Usage Rules

| Element | Dark | Light |
|---------|------|-------|
| Page background | `--ap-bg-base` (`#1C1917`) | `--ap-bg-base` (`#FAFAF9`) |
| Card / panel | `--ap-bg-card` (`#292524`) | `--ap-bg-card` (`#FFFFFF`) |
| Elevated surface | `--ap-bg-surface` (`#292524`) | `--ap-bg-surface` (`#FFFFFF`) |
| Headings | `--ap-text-primary` (`#FAFAF9`) | `--ap-text-primary` (`#1C1917`) |
| Body text | `--ap-text-body` (`#D6D3D1`) | `--ap-text-body` (`#292524`) |
| Secondary text | `--ap-text-secondary` (`#A8A29E`) | `--ap-text-secondary` (`#78716C`) |
| Borders | `--ap-border` (`#44403C`) | `--ap-border` (`#E7E5E4`) |
| Primary CTA | `--ap-cta-bg` / `--ap-cta-text` | `--ap-cta-bg` / `--ap-cta-text` |
| Brand subtle bg | `--ap-brand-subtle` (`#2C1A0E`) | `--ap-brand-subtle` (`#FFF7ED`) |
| Glassmorphism bg | `--ap-glass-bg` | `--ap-glass-bg` |
| Glassmorphism ring | `--ap-glass-ring` | `--ap-glass-ring` |
| Mosaic overlay | `--ap-mosaic-overlay` | `--ap-mosaic-overlay` |
| Links | `--ap-brand` | `--ap-brand` |
| Code blocks | `--ap-bg-code` (`#1A1412`) — **always dark, both themes** | `--ap-bg-code` (`#1C1917`) |
| Inline code (light) | N/A | `#F5F5F4` bg, `#DB4D12` text |
| Inline code (dark) | `#292524` bg, `#D97706` text | N/A |

**Hard rules:**
- Never use pure black (`#000000`) or pure white (`#FFFFFF`) for text. Use `--ap-text-primary` and `--ap-text-body`.
- Never use cool grays (blue-tinted: `#64748B`, `#94A3B8`, `#0F172A`). Stone tones only.
- Never use `bg-white` or `bg-black` directly. Use `--ap-bg-card` for card backgrounds, `--ap-bg-surface` for elevated surfaces.
- Never use `#FFF7ED` or `#2C1A0E` directly. Use `--ap-brand-subtle` (theme-aware).
- Code blocks are **always** on a dark background, even in light mode. The code surface is sacred.
- The brand terracotta (`#DB4D12`) is the only saturated color that appears in both themes unchanged.

---

## 3. Typography

### 3.1 Type Scale

Based on a 1.25 ratio, using `rem` units for accessibility.

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `--ap-text-xs` | `0.75rem` (12px) | 400–500 | 1.5 | Badges, micro-labels, metadata |
| `--ap-text-sm` | `0.875rem` (14px) | 400–500 | 1.5 | Body small, table cells, captions |
| `--ap-text-base` | `1rem` (16px) | 400 | 1.625 | Body text default |
| `--ap-text-lg` | `1.125rem` (18px) | 500 | 1.5 | Lead text, card headings |
| `--ap-text-xl` | `1.25rem` (20px) | 600 | 1.4 | Section headings |
| `--ap-text-2xl` | `1.5rem` (24px) | 600 | 1.333 | Page titles |
| `--ap-text-3xl` | `1.875rem` (30px) | 700 | 1.267 | Hero headlines |
| `--ap-text-4xl` | `2.25rem` (36px) | 700 | 1.222 | Marketing hero (large) |

### 3.2 Font Stacks

```css
:root {
  --ap-font-body: 'Geist Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --ap-font-code: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --ap-font-pixel: 'Geist Pixel', ui-monospace, SFMono-Regular, Menlo, monospace;
  --ap-font-display: var(--ap-font-body); /* Geist Sans serves as both body and display */
}
```

**Three font families. Sans-serif for body/headings. Monospace for code. Pixel for section annotations and UI labels.** Geist Sans, Geist Mono, and Geist Pixel — all designed as a matched set.

### 3.3 Typography Rules

- **Body text** is always Geist Sans at `--ap-text-base` (16px) / 400 weight.
- **Headings** use Geist Sans at 600–700 weight. Same font as body — hierarchy is weight and size, not font switching.
- **Code** uses Geist Mono. Inline code is `0.875em` relative to surrounding text.
- **No italic text** in UI. Use weight or color for emphasis.
- **Letter spacing:** `-0.01em` on headings ≥ 24px. `0` on body. `0.02em` on uppercase labels.
- **Max reading width:** `65ch` for body text. Never let paragraphs stretch to full viewport.

---

## 4. Spacing & Layout

### 4.1 Spacing Scale

Based on a 4px base unit. Use these tokens, not arbitrary values.

| Token | Value | Usage |
|-------|-------|-------|
| `--ap-space-0` | `0` | Reset |
| `--ap-space-1` | `4px` | Tight gaps: icon-text, badge padding |
| `--ap-space-2` | `8px` | Inline spacing, small gaps |
| `--ap-space-3` | `12px` | Component internal padding |
| `--ap-space-4` | `16px` | Default content padding, card padding |
| `--ap-space-5` | `20px` | Section padding (compact) |
| `--ap-space-6` | `24px` | Section gaps, card gaps |
| `--ap-space-8` | `32px` | Large section gaps |
| `--ap-space-10` | `40px` | Page section dividers |
| `--ap-space-12` | `48px` | Hero/marketing section vertical spacing |
| `--ap-space-16` | `64px` | Major page sections |
| `--ap-space-20` | `80px` | Marketing page hero padding |
| `--ap-space-24` | `96px` | Maximum section separation |

### 4.2 Layout Rules

- **Page max-width:** `1200px` for marketing, `1080px` for docs, `768px` for article/blog content.
- **Content padding (horizontal):** `16px` on mobile → `24px` on tablet → `32px` on desktop.
- **Cards:** `16px` padding. No nested cards. No cards-inside-cards.
- **Grid:** Use CSS Grid. 12-column on desktop, 1-column on mobile. Gap: `--ap-space-6` (24px).
- **Sidebar width (docs):** `240px` fixed. Collapsible on mobile.

### 4.3 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--ap-radius-sm` | `4px` | Buttons, badges, input fields |
| `--ap-radius-md` | `8px` | Cards, code blocks, dropdowns |
| `--ap-radius-lg` | `12px` | Modals, large cards, marketing sections |
| `--ap-radius-full` | `9999px` | Pills, avatars, circular elements |

**Rule:** Consistent radius per component type. Don't mix 8px and 12px on the same surface level.

---

## 5. Components

### 5.1 Buttons

#### Primary Button
```
Background: var(--ap-brand)           (#DB4D12)
Text:       #FAFAF9
Hover:      var(--ap-brand-hover)     (#9A3412)
Active:     #7C2D12
Border:     none
Radius:     var(--ap-radius-sm)       (4px)
Padding:    8px 16px
Font:       14px / 500 weight
Transition: background 150ms ease
```

#### Secondary Button
```
Background: transparent
Text:       var(--ap-text-body)
Border:     1px solid var(--ap-border)
Hover bg:   var(--ap-bg-surface)
Radius:     var(--ap-radius-sm)
Padding:    8px 16px
Font:       14px / 500 weight
```

#### Ghost Button
```
Background: transparent
Text:       var(--ap-text-secondary)
Border:     none
Hover text: var(--ap-text-body)
Hover bg:   var(--ap-bg-surface) at 50% opacity
Padding:    8px 12px
Font:       14px / 500 weight
```

#### Button Rules
- Max ONE primary button per visible viewport area.
- Destructive actions use `--ap-danger` background.
- Icon-only buttons: `32px × 32px`, icon at `16px`.
- Loading state: spinner replaces text, button stays same width (no layout shift).

### 5.2 Inputs

```
Background:    var(--ap-bg-surface)
Border:        1px solid var(--ap-border)
Focus border:  1px solid var(--ap-brand)
Focus ring:    0 0 0 3px var(--ap-brand-subtle) (or brand-subtle-dark)
Text:          var(--ap-text-body)
Placeholder:   var(--ap-text-tertiary)
Radius:        var(--ap-radius-sm)
Padding:       8px 12px
Font:          14px
Height:        36px
```

- Error state: border `--ap-danger`, helper text in `--ap-danger`.
- Disabled: 50% opacity, `cursor: not-allowed`.
- Labels: `--ap-text-secondary`, 12px, 500 weight, `4px` margin-bottom.

### 5.3 Cards

```
Background:    var(--ap-bg-surface)
Border:        1px solid var(--ap-border)
Radius:        var(--ap-radius-md)      (8px)
Padding:       var(--ap-space-4)        (16px)
Shadow:        none (dark mode) / 0 1px 2px rgba(0,0,0,0.04) (light mode)
```

- **No nested cards.** Flatten hierarchy.
- **No heavy shadows.** Borders define elevation, not box-shadows.
- Hover state (if interactive): border transitions to `--ap-border-strong`.

### 5.4 Code Blocks

```
Background:    var(--ap-bg-code)        (#1A1412 dark, #1C1917 light)
Text:          #D6D3D1
Border:        1px solid var(--ap-border)
Radius:        var(--ap-radius-md)      (8px)
Padding:       16px
Font:          Geist Mono, 13px, line-height 1.6
Overflow:      overflow-x: auto; scrollbar-width: thin
```

- Always dark background, even in light mode.
- Language label: top-right corner, `--ap-text-tertiary`, 11px.
- Copy button: top-right, appears on hover, ghost style.
- Syntax highlight theme: warm-toned (amber strings, sage keywords, stone comments). No neon.

#### Syntax Highlighting Tokens (Code Blocks)

| Token Type | Color | Hex |
|-----------|-------|-----|
| Default text | Warm stone | `#D6D3D1` |
| Keywords | Terracotta | `#DB4D12` |
| Strings | Amber | `#D97706` |
| Functions | Warm white | `#FAFAF9` |
| Comments | Dim stone | `#78716C` |
| Numbers | Sage green | `#4D7C0F` |
| Types / classes | Light amber | `#F59E0B` |
| Punctuation | Mid stone | `#A8A29E` |
| Variables | Stone body | `#D6D3D1` |

### 5.5 Navigation (Docs Sidebar)

```
Background:    var(--ap-bg-base)
Width:         240px
Padding:       16px 12px
```

- **Nav items:** `--ap-text-secondary` default, `--ap-text-primary` on active, `--ap-brand` left-border indicator (2px) on active.
- **Section labels:** `--ap-text-tertiary`, 11px, uppercase, `0.05em` letter-spacing, `20px` margin-top.
- **Hover:** `--ap-bg-surface` background on nav items.
- **Active item:** `--ap-brand-subtle-dark` background (dark) or `--ap-brand-subtle` background (light), `--ap-text-primary` text.

### 5.6 Badges / Status Indicators

| Status | Background | Text | Border |
|--------|-----------|------|--------|
| Connected / approved | `--ap-success-subtle` | `--ap-success` | none |
| Warning / pending | `--ap-warning-subtle` | `--ap-warning` | none |
| Error / denied | `--ap-danger-subtle` | `--ap-danger` | none |
| Neutral / info | `--ap-bg-surface` | `--ap-text-secondary` | `1px solid var(--ap-border)` |

- Radius: `--ap-radius-full` (pill shape).
- Padding: `2px 8px`.
- Font: 11px, 500 weight.

### 5.7 Tables (Docs / Data)

```
Header bg:       var(--ap-bg-surface)
Header text:     var(--ap-text-secondary), 12px, 500, uppercase, 0.03em tracking
Row border:      1px solid var(--ap-border) bottom
Row hover:       var(--ap-bg-surface) at 50% (dark) / var(--ap-bg-base) (light)
Cell padding:    12px 16px
Cell text:       var(--ap-text-body), 14px
```

### 5.8 Toast / Notifications

```
Background:      var(--ap-bg-elevated)
Border:          1px solid var(--ap-border)
Radius:          var(--ap-radius-md)
Shadow:          0 4px 12px rgba(0,0,0,0.15) (dark) / 0 4px 12px rgba(0,0,0,0.08) (light)
Text:            var(--ap-text-body)
Icon:            semantic color (success/warning/danger/brand)
```

---

## 6. Extension-Specific Rules

The browser extension popup has additional constraints.

| Property | Value |
|----------|-------|
| Popup width | `360px` fixed |
| Popup max-height | `600px` |
| Outer background | `var(--ap-bg-base)` |
| Outer padding | `10px` |
| Inner container | `var(--ap-bg-surface)`, `border-radius: 4px` |
| Content padding | `12px` horizontal, `4px` top, `12px` bottom |
| Font sizes | Only 10px, 12px, 14px, 16px — strict scale for compact UI |

The extension popup uses the same color tokens but at compressed spacing. When implementing extension UI, use the `tokens` object from `theme.ts` instead of CSS custom properties (Mantine theme approach).

---

## 7. Motion & Transitions

### Timing

| Type | Duration | Easing |
|------|----------|--------|
| Micro (hover, focus) | `150ms` | `ease` |
| Small (dropdown, tooltip) | `200ms` | `ease-out` |
| Medium (panel, modal) | `300ms` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Large (page transition) | `400ms` | `cubic-bezier(0.16, 1, 0.3, 1)` |

### Rules
- Only animate `opacity`, `transform`, `background-color`, and `border-color`. Never animate `width`, `height`, `padding`, or `margin`.
- Page load: stagger content in by `50ms` intervals (heading → body → cards → footer).
- `prefers-reduced-motion: reduce` — disable all non-essential animation. Opacity transitions stay.
- No bounce or elastic easing. Deceleration only.

---

## 8. Responsive Breakpoints

```css
/* Mobile first */
--ap-breakpoint-sm: 640px;    /* Small tablets */
--ap-breakpoint-md: 768px;    /* Tablets */
--ap-breakpoint-lg: 1024px;   /* Small desktop */
--ap-breakpoint-xl: 1280px;   /* Desktop */
```

| Breakpoint | Layout | Sidebar | Grid |
|-----------|--------|---------|------|
| < 640px | Single column, full-bleed | Hidden (hamburger) | 1 col |
| 640–768px | Single column, padded | Hidden (hamburger) | 1 col |
| 768–1024px | Content + collapsed sidebar | Collapsed (icons only) | 2 col |
| > 1024px | Content + full sidebar | Full 240px | 3–4 col |

---

## 9. Accessibility

- **Contrast:** All text meets WCAG AA (4.5:1 for body, 3:1 for large text). Verify terracotta on dark backgrounds.
- **Focus indicators:** `2px solid var(--ap-brand)` with `2px offset`. Visible on both themes.
- **Skip navigation:** First focusable element on every page.
- **ARIA labels:** All icon-only buttons, all status indicators, all interactive non-text elements.
- **Color is not the only indicator.** Status badges include text or icons alongside color.
- **Reduced motion:** Respect `prefers-reduced-motion`. Transitions become instant, animations are removed.

---

## 10. Dark / Light Mode Implementation

### Mantine Integration

```tsx
import { MantineProvider, createTheme } from '@mantine/core';

const arlopassTheme = createTheme({
  fontFamily: "'Geist Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  fontFamilyMonospace: "'Geist Mono', ui-monospace, SFMono-Regular, monospace",
  primaryColor: 'brand',
  defaultRadius: 'sm',
  colors: {
    brand: [
      '#FFF7ED', // 0 - subtle tint
      '#FFEDD5', // 1
      '#FED7AA', // 2
      '#FDBA74', // 3
      '#FB923C', // 4
      '#F97316', // 5
      '#EA580C', // 6
      '#DB4D12', // 7 - primary (terracotta)
      '#9A3412', // 8 - hover
      '#7C2D12', // 9 - active/pressed
    ],
  },
  fontSizes: {
    xs: '12px',
    sm: '14px',
    md: '16px',
    lg: '18px',
    xl: '20px',
  },
});
```

### Theme Toggle

- Default: Follow system preference (`prefers-color-scheme`).
- User override: Stored in `localStorage` key `arlopass-theme`. Values: `"dark"`, `"light"`, `"system"`.
- Toggle UI: Sun/moon icon in the top-right of docs/app. No animation on switch — instant.

---

## 11. File Naming & CSS Architecture

```
src/
├── styles/
│   ├── tokens.css              # CSS custom properties (all color/spacing/type tokens)
│   ├── reset.css               # Minimal reset (box-sizing, margin, font inheritance)
│   ├── base.css                # Global html/body styles, theme application
│   └── utilities.css           # .sr-only, .truncate, .mono — minimal utility classes
├── components/
│   └── [Component]/
│       ├── Component.tsx
│       └── Component.module.css  # Scoped styles (if not using Mantine's sx/style props)
```

- Prefer Mantine's `style` prop and theme tokens over custom CSS.
- When custom CSS is needed, use CSS Modules (`.module.css`) — never global class names.
- Never use Tailwind in this project. All styling through Mantine + CSS custom properties.

---

## 12. Quick Reference — Copy-Paste Tokens

### Mantine `style` Usage
```tsx
// Primary text
<Text c="var(--ap-text-body)">Body text</Text>

// Brand button
<Button bg="var(--ap-brand)" c="#FAFAF9">Approve</Button>

// Card
<Paper bg="var(--ap-bg-surface)" bd="1px solid var(--ap-border)" radius="md" p="md">
  Content
</Paper>

// Code block wrapper
<Box bg="var(--ap-bg-code)" p="md" style={{ borderRadius: 'var(--ap-radius-md)', border: '1px solid var(--ap-border)' }}>
  <Code fz={13} ff="var(--ap-font-code)" c="#D6D3D1">
    {code}
  </Code>
</Box>
```

### Status Colors Quick Lookup
```
Connected:  bg #1A2E05 / text #4D7C0F (dark)    bg #F7FEE7 / text #4D7C0F (light)
Warning:    bg #2E2204 / text #CA8A04 (dark)    bg #FEFCE8 / text #CA8A04 (light)
Error:      bg #2E0505 / text #B91C1C (dark)    bg #FEF2F2 / text #B91C1C (light)
Brand:      bg #2C1A0E / text #DB4D12 (dark)    bg #FFF7ED / text #DB4D12 (light)
```

---

## 13. Documentation Page Patterns

Reference: Tailwind CSS docs, Cursor docs, Supabase docs.

### 13.1 Page Layout

```
┌──────────────────────────────────────────────────────────┐
│  Topbar (logo, search, nav links, theme toggle)          │
├────────────┬─────────────────────────────────────────────┤
│  Sidebar   │  Content                                    │
│  240px     │  max-width: 768px                           │
│            │                                             │
│  Section   │  OVERLINE LABEL                             │
│  labels    │  # Page Title                               │
│  (caps)    │                                             │
│            │  Intro paragraph with lead text sizing.     │
│  Nav items │                                             │
│  with      │  ## Section Heading                         │
│  active    │                                             │
│  indicator │  Body text at 16px. Max width 65ch.         │
│            │                                             │
│            │  ┌─ Code Block ──────────────────────┐      │
│            │  │ Terminal                        ⎘  │      │
│            │  │ npm install @arlopass/web-sdk      │      │
│            │  └───────────────────────────────────┘      │
│            ├─────────────────────────────────────────────┤
│            │  On-this-page (right sidebar, optional)     │
│            │  160px, sticky, shows heading anchors       │
└────────────┴─────────────────────────────────────────────┘
```

- **Topbar height:** `56px`. Background: `--ap-bg-surface`. Bottom border: `1px solid var(--ap-border)`. Sticky.
- **Sidebar:** `240px` fixed. Background: `--ap-bg-base`. Padding: `16px 12px`. Sticky below topbar. Scroll independently.
- **Content area:** Centered within remaining space. Max width `768px`. Padding: `40px 32px` desktop, `24px 16px` mobile.
- **Right sidebar (optional):** `160px` on screens ≥ 1280px. "On this page" heading anchors. `--ap-text-tertiary`, 12px. Sticky.

### 13.2 Section Annotation Labels

Used above every section heading across marketing, docs, and app surfaces. The primary typographic branding element.

```
Font:           var(--ap-font-pixel) (Geist Pixel)
Size:           14px (text-sm)
Weight:         normal
Color:          var(--ap-brand) (#DB4D12)
Letter-spacing: 0.08em
```

Usage: Place above `<h1>` on doc pages and above `<h2>` on marketing sections. Always left-aligned (never centered). Examples: "Why Arlopass", "How it works", "For developers", "Built for privacy".

### 13.3 Section Header Pattern (Marketing)

Every marketing section follows the same left-aligned header structure:

```html
<div class="px-4 md:px-6 lg:px-8 mb-10 sm:mb-16">
  <span class="block text-sm font-pixel tracking-[0.08em] text-brand">Section label</span>
  <h2 class="mt-2 max-w-3xl text-[clamp(1.75rem,3.5vw,2.5rem)] font-bold tracking-tight text-balance text-[var(--ap-text-primary)]">
    Section headline
  </h2>
  <p class="mt-3 max-w-3xl text-base leading-relaxed text-[var(--ap-text-secondary)]">
    Section description.
  </p>
</div>
```

**Rules:**
- Always left-aligned. Never centered.
- Title max-width: `max-w-3xl` (48rem).
- Description max-width: `max-w-3xl`.
- Title uses `text-balance` for optimal line breaks.
- Annotation → 2px gap → title → 3px gap → description.

---

## 14. Marketing Page Patterns

### 14.1 Bordered Grid Cards

The primary card pattern. No rounded corners, no gaps, no shadows. Cards are defined by borders.

```html
<div class="grid grid-cols-1 md:grid-cols-3 border border-[var(--ap-border)]">
  <div class="bg-[var(--ap-bg-card)] hover:bg-[var(--ap-bg-surface)] transition-colors duration-300 p-8 sm:p-10 border-b md:border-b-0 md:border-r border-[var(--ap-border)]">
    <span class="text-sm font-pixel tracking-[0.08em] text-brand">Label</span>
    <h3 class="mt-2 text-lg font-semibold tracking-tight text-[var(--ap-text-primary)] mb-2">Title</h3>
    <p class="text-sm text-[var(--ap-text-secondary)] leading-relaxed">Description</p>
  </div>
  <!-- more cards... -->
</div>
```

**Rules:**
- Use `--ap-bg-card` for card backgrounds (theme-aware: dark surface or white).
- Hover: transition to `--ap-bg-surface`, 300ms duration.
- Borders between cards via `border-r` / `border-b`, not gaps.
- Each card has a `font-pixel` annotation label above the title.
- No rounded corners on grid cards. Sharp edges = modern, editorial feel.

### 14.2 Mosaic Backgrounds

Pixelated background images created via canvas. Used behind preview areas and visual sections.

```html
<canvas data-mosaic-src="/img/bgN.webp" class="absolute inset-0 w-full h-full"></canvas>
<div class="absolute inset-0 bg-[var(--ap-mosaic-overlay)]"></div>
```

The mosaic script downsamples images to 16px tiles then nearest-neighbor upscales with cover-crop. The overlay tint is theme-aware: warm cream in light mode, dark warm brown in dark mode.

### 14.3 Glassmorphism Frames

Used to present preview content (animated app mockups) on top of mosaic backgrounds. Two variants:

**Light glass** (bento cards, how-it-works):
```html
<div class="rounded-t-xl bg-[var(--ap-glass-bg)] pt-1 px-1 shadow-2xl ring shadow-black/80 ring-[var(--ap-glass-ring)] backdrop-blur-lg overflow-hidden">
  <div class="rounded-t-lg bg-[var(--ap-bg-base)] p-4 overflow-hidden">
    <!-- Preview content -->
  </div>
</div>
```

**Dark glass** (code editor, enterprise policy):
```html
<div class="rounded-tl-2xl bg-neutral-900/70 backdrop-blur-sm shadow-2xl shadow-black/20 border-t border-l border-neutral-800 pt-1 pl-1">
  <!-- Dark code content -->
</div>
```

**Rules:**
- Glass backgrounds use `--ap-glass-bg` (theme-aware: dark translucent in dark mode, white translucent in light).
- Ring color uses `--ap-glass-ring` (subtle light ring in dark, subtle dark ring in light).
- Bottom edges removed where glass meets a card border (`rounded-t-*`, no bottom padding).
- Use `-mb-2` to extend glass past bottom edge when needed.

### 14.4 Preview Animations

Animated in-app/in-extension mockups placed inside glass frames. Each preview:

- Uses `data-preview` attribute for carousel integration.
- Uses `data-loop="Nms"` for auto-looping.
- Elements revealed with `opacity-0` → `opacity-1` transitions, staggered via `setTimeout`.
- Resets state on `preview:loop` and `preview:done` custom events.
- Uses `MutationObserver` on `preview-active` class for carousel awareness.

### 14.5 CTA Buttons

Primary CTA uses inverted theme colors:

```html
<a class="text-[var(--ap-cta-text)] bg-[var(--ap-cta-bg)] py-3 px-6 rounded-lg hover:opacity-85 transition-opacity">
  Install for Chrome
</a>
```

Dark mode: light bg / dark text. Light mode: dark bg / light text. Never use `bg-[var(--ap-text-primary)]` with `text-stone-50` — it breaks in one theme.

### 14.6 Comparison Tables

```html
<table class="border border-[var(--ap-border)] border-collapse">
  <thead>
    <tr>
      <th class="font-pixel tracking-wider bg-[var(--ap-bg-surface)] border-b border-r">Column</th>
      <th class="font-pixel tracking-wider bg-[var(--ap-brand-subtle)] text-brand border-b border-r">Arlopass</th>
    </tr>
  </thead>
  <tbody>
    <tr class="hover:bg-[var(--ap-bg-surface)] transition-colors">
      <td class="bg-[var(--ap-bg-card)] border-b border-r">Capability</td>
      <td class="bg-[var(--ap-brand-subtle)]/30 border-b border-r">Value</td>
    </tr>
  </tbody>
</table>
```

- Header cells use `font-pixel` labels, not uppercase sans.
- Arlopass column highlighted with `--ap-brand-subtle` (theme-aware).
- Column dividers via `border-r`. Row dividers via `border-b`.
- Row hover: `bg-[var(--ap-bg-surface)]`.

### 14.7 Theme Toggle

JS-based toggle stored in `localStorage('arlopass-theme')`. Inline `<script>` in `<head>` prevents FOUC:

```html
<script>
  (function(){var t=localStorage.getItem('arlopass-theme');if(t)document.documentElement.setAttribute('data-theme',t)})();
</script>
```

Toggle button: bordered pill with sun icon (dark mode) / moon icon (light mode). Updates `data-theme` attribute, persists to localStorage, and toggles logo/icon visibility via JS `classList.toggle('hidden')`.

### 14.8 Provider Marquee

Infinite horizontal scroll of provider icons. No hover pause. Edge fade gradients mask the edges.

```css
.marquee { animation: scroll 30s linear infinite; }
@media (prefers-reduced-motion: reduce) { .marquee { animation: none; } }
```

### 13.3 Numbered Steps

Sequential tutorial content — the Tailwind docs pattern with circled step numbers.

```
┌──────────────────────────────────────────┐
│  ①  Step title                           │
│                                          │
│     Step description text.               │
│                                          │
│     ┌─ Code Block ──────────────────┐    │
│     │ Terminal                    ⎘  │    │
│     │ npm install @arlopass/web-sdk  │    │
│     └───────────────────────────────┘    │
│                                          │
│  ②  Next step title                      │
│     ...                                  │
└──────────────────────────────────────────┘
```

- **Step number:** `24px` circle. Background: `--ap-bg-surface`. Border: `1px solid var(--ap-border)`. Text: `--ap-text-secondary`. Font: 12px, 600 weight. Centered.
- **Step title:** 18px, 600 weight, `--ap-text-primary`. Inline with circle, `12px` gap.
- **Step body:** Indented to align with title (left padding: `36px`). Body text styling.
- **Vertical connector:** `1px solid var(--ap-border)` line between step circles. Height spans from bottom of circle to top of next circle.
- **Spacing between steps:** `32px`.

### 13.4 Tabs (Content Switching)

For showing alternate content like "Using Vite" / "Using PostCSS" / "Tailwind CLI" — per Tailwind docs.

```
Tabs container:    border-bottom: 1px solid var(--ap-border)
Tab item padding:  12px 16px
Tab text:          14px, 500 weight
Active tab text:   var(--ap-text-primary)
Active indicator:  2px solid var(--ap-brand) bottom border
Inactive text:     var(--ap-text-secondary)
Hover text:        var(--ap-text-body)
Background:        transparent (no bg change on hover/active)
```

### 13.5 Callout / Admonition Blocks

Info, warning, and tip blocks within documentation.

| Type | Left border | Icon | Background |
|------|-----------|------|-----------|
| **Info** | `2px solid var(--ap-brand)` | `info-circle` | `var(--ap-brand-subtle)` / `var(--ap-brand-subtle-dark)` |
| **Tip** | `2px solid var(--ap-success)` | `bulb` | `var(--ap-success-subtle)` |
| **Warning** | `2px solid var(--ap-warning)` | `alert-triangle` | `var(--ap-warning-subtle)` |
| **Danger** | `2px solid var(--ap-danger)` | `alert-circle` | `var(--ap-danger-subtle)` |

```
Padding:          12px 16px
Radius:           0 (left border acts as accent) or var(--ap-radius-md) if preferred
Icon size:        16px, color matches left border
Title:            14px, 600 weight, color matches left border
Body:             14px, var(--ap-text-body)
Margin:           24px 0
```

### 13.6 Code Blocks (Extended)

Additional patterns observed across reference sites:

**Language label:**
```
Position:       top-left inside code block
Font:           11px, 500 weight, var(--ap-text-tertiary)
Padding:        8px 16px (sits on top edge)
Background:     slightly lighter than code bg — #292524
Border-bottom:  1px solid var(--ap-border)
Full-width:     spans the code block width as a header bar
```

**Copy button:**
```
Position:       top-right inside language label bar
Icon:           clipboard (16px)
Color:          var(--ap-text-tertiary)
Hover:          var(--ap-text-secondary)
Feedback:       checkmark icon for 2s after click, color var(--ap-success)
```

**File name label** (when showing a specific file):
```
Display as language label but with file icon + filename
Example: "vite.config.ts" with a file icon
```

**Line highlighting:**
```
Highlighted lines: background var(--ap-brand-subtle-dark) (#2C1A0E)
Highlighted line left border: 2px solid var(--ap-brand)
Non-highlighted lines: transparent
```

### 13.7 Inline Badges / Keyboard Shortcuts

For referencing keyboard shortcuts or inline labels like Cursor's `Ctrl I`:

```
Background:     var(--ap-bg-surface)
Border:         1px solid var(--ap-border)
Radius:         var(--ap-radius-sm) (4px)
Padding:        1px 6px
Font:           var(--ap-font-code), 12px
Color:          var(--ap-text-secondary)
Vertical-align: baseline
```

---

## 14. Marketing Page Patterns

Reference: Supabase homepage, Ferndesk homepage, Vercel homepage.

### 14.1 Page Structure

Marketing pages follow a vertical rhythm of full-width sections with generous spacing:

```
┌──────────────────────────────────────────┐
│  Topbar (transparent → solid on scroll)  │
├──────────────────────────────────────────┤
│                                          │
│  HERO SECTION                            │
│  96px top padding, 80px bottom           │
│                                          │
├──────────────────────────────────────────┤
│  SOCIAL PROOF BAR (logos)                │
│  48px vertical padding                   │
├──────────────────────────────────────────┤
│                                          │
│  FEATURE SECTION 1                       │
│  80px vertical padding                   │
│                                          │
├──────────────────────────────────────────┤
│                                          │
│  FEATURE SECTION 2                       │
│  80px vertical padding                   │
│                                          │
├──  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ──┤
│  TESTIMONIAL / CUSTOMER QUOTE            │
│  64px vertical padding                   │
├──────────────────────────────────────────┤
│                                          │
│  MORE FEATURES (grid or alternating)     │
│                                          │
├──────────────────────────────────────────┤
│                                          │
│  CTA SECTION                             │
│  80px vertical padding                   │
│                                          │
├──────────────────────────────────────────┤
│  FOOTER                                  │
│  4-column link grid + legal              │
└──────────────────────────────────────────┘
```

- **Section separator:** No visible `<hr>`. Use spacing alone or very subtle `1px solid var(--ap-border)` if needed.
- **Max content width:** `1200px` centered. Some sections (hero, CTA) can have full-width backgrounds with content constrained.
- **Alternating backgrounds:** Alternate between `--ap-bg-base` and `--ap-bg-surface` to visually separate sections without borders.

### 14.2 Hero Section

```
┌──────────────────────────────────────────┐
│                                          │
│           OVERLINE LABEL                 │
│    Large headline text across            │
│        two or three lines                │
│                                          │
│    Supporting paragraph text at          │
│    18px, max-width 560px, centered.      │
│                                          │
│    [ Primary CTA ]  [ Secondary CTA ]    │
│                                          │
│        ┌─ Hero visual ─────────┐         │
│        │  (screenshot, demo,   │         │
│        │   or code example)    │         │
│        └───────────────────────┘         │
│                                          │
└──────────────────────────────────────────┘
```

- **Headline:** Geist Sans, 36–48px, 700 weight, `--ap-text-primary`. Centered.
- **Line height:** 1.1–1.2 for hero headlines (tighter than body).
- **Supporting text:** Geist Sans, 18px, 400 weight, `--ap-text-secondary`. Max-width `560px`. Centered.
- **CTA pair:** Primary button + secondary (outline or ghost) button. `12px` gap. Centered.
- **Hero visual:** Full-width or constrained, `40px` margin-top from CTAs. Optional subtle border + radius.
- **Top padding:** `96px` from topbar. Bottom: `80px` (or `64px` if visual extends to next section).

### 14.3 Social Proof / Logo Bar

Strip of customer or partner logos — per Supabase "Trusted by" and Ferndesk logos.

```
Label:          "Trusted by" or "Loved by" — 14px, var(--ap-text-tertiary), centered
Logo display:   Grayscale, 50% opacity → full color on hover (if interactive)
                Or always at 60% opacity grayscale (static)
Logo height:    24–32px, auto width
Spacing:        32–48px between logos
Layout:         Flex, centered, wrap on mobile
Container:      no border, no background (lives between sections naturally)
Vertical pad:   48px top and bottom
```

### 14.4 Feature Section (Text + Visual)

Alternating layout — text left / visual right, then swap.

```
┌──────────────────────────────────────────┐
│                                          │
│   OVERLINE                               │
│   ## Feature Heading                     │
│                                          │
│   Description text at 16px,       ┌────┐ │
│   max-width 480px.                │    │ │
│                                   │ ◻◻ │ │
│   • Bullet point one              │    │ │
│   • Bullet point two              └────┘ │
│   • Bullet point three                   │
│                                          │
└──────────────────────────────────────────┘
```

- **Overline:** 11px, uppercase, `--ap-brand`, 600 weight, `0.08em` letter-spacing.
- **Heading:** 24–30px, 600–700 weight, `--ap-text-primary`.
- **Body:** 16px, `--ap-text-body` (dark) / `--ap-text-secondary` (light — slightly lighter for marketing pages).
- **Bullet points:** Checkmark or small dot icon in `--ap-brand`. Text in `--ap-text-body`, 16px.
- **Visual:** Screenshot, diagram, or UI mockup. Border: `1px solid var(--ap-border)`. Radius: `--ap-radius-lg` (12px). Optional subtle shadow in light mode.
- **Grid:** 2-column on desktop (text 5fr, visual 7fr). Stack on mobile (visual below text).
- **Alternate direction:** Swap text/visual sides for each section to create visual rhythm.

### 14.5 Feature Grid (Icon Cards)

Grid of small feature highlights — per Supabase "Start building in seconds" pattern.

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  ◻ Icon     │ │  ◻ Icon     │ │  ◻ Icon     │
│  Title      │ │  Title      │ │  Title      │
│  Short      │ │  Short      │ │  Short      │
│  description│ │  description│ │  description│
└─────────────┘ └─────────────┘ └─────────────┘
```

- **Grid:** 3 columns on desktop, 2 on tablet, 1 on mobile. Gap: `24px`.
- **Card:** `--ap-bg-surface` background. `1px solid var(--ap-border)`. `--ap-radius-md`. Padding: `24px`.
- **Icon:** Tabler icon, 24px, `--ap-brand` color. `12px` margin-bottom.
- **Title:** 16px, 600 weight, `--ap-text-primary`. `4px` margin-bottom.
- **Description:** 14px, `--ap-text-secondary`. 2–3 lines max.
- **No hover effect** unless cards are links. If linked: border transitions to `--ap-border-strong` on hover.

### 14.6 Testimonial / Customer Quote

Single-quote highlight block — per Ferndesk and Supabase.

```
┌──────────────────────────────────────────┐
│                                          │
│  "Quote text in 18–20px, italic          │
│  or regular weight, centered or          │
│  left-aligned. Keep to 2-3 lines."       │
│                                          │
│  ◯ Name Surname                          │
│    Title, Company                        │
│                                          │
└──────────────────────────────────────────┘
```

- **Quote text:** 18–20px, 400 weight, `--ap-text-primary`. Optional subtle `"` quotation marks in `--ap-brand` at large size (48px) as decorative element.
- **Attribution:** `14px`, `--ap-text-secondary`. Avatar (32px circle) + name (500 weight) + title/company (400 weight).
- **Container:** No card border. Just generous padding (`64px` vertical) and a subtle top border `1px solid var(--ap-border)` to separate from adjacent sections.
- **Alternative:** Ferndesk-style card with quote + photo. Use `--ap-bg-surface` card with standard padding/radius.

### 14.7 CTA Section (Bottom)

Final call-to-action before footer.

```
┌──────────────────────────────────────────┐
│                                          │
│         Headline (24–30px)               │
│         Supporting text (16px)           │
│                                          │
│    [ Primary CTA ]  [ Secondary CTA ]    │
│                                          │
└──────────────────────────────────────────┘
```

- Centered text. Same styling as hero but slightly smaller.
- Background: Can use `--ap-bg-surface` (dark) or `--ap-brand-subtle` (light) to differentiate from page background.
- Padding: `80px` vertical.

### 14.8 Footer

```
┌──────────────────────────────────────────┐
│  Logo                                    │
│                                          │
│  Column 1    Column 2    Column 3    C4  │
│  Link        Link        Link        L   │
│  Link        Link        Link        L   │
│  Link        Link        Link        L   │
│                                          │
│  ─────────────────────────────────────── │
│  © 2026 Arlopass · Privacy · Terms       │
└──────────────────────────────────────────┘
```

- **Background:** `--ap-bg-surface` (distinct from page `--ap-bg-base`).
- **Top border:** `1px solid var(--ap-border)`.
- **Grid:** 4 columns on desktop, 2 on tablet, 1 on mobile.
- **Column heading:** 12px, 600 weight, uppercase, `--ap-text-tertiary`, `0.05em` letter-spacing.
- **Links:** 14px, `--ap-text-secondary`. Hover: `--ap-text-primary`. No underline. Underline on hover.
- **Legal row:** `14px`, `--ap-text-tertiary`. Top border: `1px solid var(--ap-border)`. `24px` padding-top.
- **Footer padding:** `48px` top, `32px` bottom.

---

## 15. Stats & Data Display

Reference: Tailwind Plus stats components.

### 15.1 Stat Cards

```
┌──────────────────┐
│  Label           │
│  $405,091.00     │  ← Large value
│           +4.75% │  ← Optional trend
└──────────────────┘
```

- **Card:** `--ap-bg-surface`. `1px solid var(--ap-border)`. `--ap-radius-md`. `20px` padding.
- **Label:** 12px, 500 weight, `--ap-text-secondary`.
- **Value:** 24–30px, 700 weight, `--ap-text-primary`.
- **Trend (positive):** 12px, 500 weight, `--ap-success`.
- **Trend (negative):** 12px, 500 weight, `--ap-danger`.
- **Grid:** 3–4 columns on desktop, 2 on tablet, 1 on mobile. Gap: `16px`.
- **Shared borders variant:** Remove individual card borders. Single container border with CSS Grid dividers using `border-right` / `border-bottom` on cells.

### 15.2 Metric Inline

For single important numbers within content (provider count, adapter count, etc.):

```
Value:          24px, 700 weight, var(--ap-text-primary)
Label:          14px, 400 weight, var(--ap-text-secondary)
Layout:         Stacked (label below value) or inline (label right of value)
```

---

## 16. Topbar / Navigation Bar

### Marketing Topbar

```
┌──────────────────────────────────────────────────────────┐
│  ◻ Arlopass        Docs  Pricing  Blog    [Sign in] [CTA]│
└──────────────────────────────────────────────────────────┘
```

- **Height:** `56px` (with content vertically centered).
- **Background (initial):** `transparent` (hero section shows through).
- **Background (scrolled):** `--ap-bg-base` with `backdrop-filter: blur(12px)` and `border-bottom: 1px solid var(--ap-border)`. Transition: `200ms ease`.
- **Position:** `sticky`, `top: 0`, `z-index: 50`.
- **Logo:** Arlopass wordmark, height `20px`.
- **Nav links:** 14px, 500 weight, `--ap-text-secondary`. Hover: `--ap-text-primary`. No underline.
- **CTA button:** Primary button, compact (padding: `6px 14px`, 13px text).
- **Mobile (< 768px):** Hamburger menu. Nav collapses to slide-in panel from right.

### Docs Topbar

```
┌──────────────────────────────────────────────────────────┐
│  ◻ Arlopass  v1.2    🔍 Search docs...   ☀/☾  GitHub ◻  │
└──────────────────────────────────────────────────────────┘
```

- **Background:** `--ap-bg-surface` (solid, not transparent).
- **Search:** Input with `--ap-bg-base` background, `--ap-border` border, placeholder "Search docs…". Keyboard shortcut badge `⌘K` / `Ctrl+K` right-aligned inside input.
- **Version badge:** 12px, `--ap-text-tertiary`, `--ap-bg-base` background, `--ap-border` border, `--ap-radius-full`.
- **Theme toggle:** Sun/moon icon, `20px`, `--ap-text-secondary`.
- **GitHub link:** GitHub icon, `20px`, `--ap-text-secondary`.
