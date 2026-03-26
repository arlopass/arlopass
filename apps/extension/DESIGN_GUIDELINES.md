# BYOM Extension – Design Implementation Guidelines

> **Source of truth**: Figma file `BYOM` (XIhjQLd0oI8hQ6KL56G4Y8)  
> **UI Library**: Mantine v7 (React)  
> **This document is prescriptive**: AI agents MUST follow every rule below when implementing or modifying extension popup UI.

---

## 1. Layout & Container Rules

| Property | Value | Notes |
|---|---|---|
| Popup width | `360px` (fixed) | Set via CSS on `<html>`, `<body>`, and root container |
| Outer background | `#f3f3f3` | Applied to body / root wrapper |
| Outer padding | `10px` all sides | Wraps the white container |
| Inner container | `background: #fff`, `border-radius: 4px`, `overflow: hidden` | Single white card that holds everything |
| Content area padding | `12px` horizontal, `4px` top, `12px` bottom | Inside the container, below header |
| Gap between sections | `12px` | Consistent vertical gap between tab content items |

### Strict Rules
- The popup MUST always be exactly 360px wide. Never use responsive/fluid widths.
- The outer wrapper MUST have `#f3f3f3` background with 10px padding.
- The inner container MUST be a single white card with 4px border-radius.
- Never add horizontal scrolling. Content must fit within the 360px constraint.

---

## 2. Color System

### Primary Palette (use Mantine theme tokens)

| Token Name | Hex | Usage |
|---|---|---|
| `dark.9` / `--byom-text-primary` | `#202225` | Primary text, active tab text, provider names, header title |
| `gray.5` / `--byom-text-secondary` | `#808796` | Secondary text, inactive tab text, metadata labels |
| `gray.3` / `--byom-border` | `#dfe1e8` | Card borders, inactive tab bottom borders, dividers |
| `gray.1` / `--byom-bg-surface` | `#f3f3f3` | Outer background, popup body |
| `white` / `--byom-bg-card` | `#ffffff` | Card backgrounds, header background |
| `dark.9` / `--byom-btn-primary-bg` | `#202225` | Primary button background |
| `white` / `--byom-btn-primary-text` | `#ffffff` | Primary button text |

### Strict Rules
- NEVER use arbitrary hex colors inline. Always reference the theme tokens defined above.
- The dark text color is `#202225`, NOT pure black (`#000`). This is intentional.
- Secondary text is `#808796`. Do NOT use Mantine's default gray shades unless they match exactly.
- Card borders are always `1px solid #dfe1e8` — use the `--byom-border` token.

---

## 3. Typography

| Element | Font | Weight | Size | Color |
|---|---|---|---|---|
| Header title ("Synapse Wallet") | Inter | 600 (Semi Bold) | 16px | `#202225` |
| Tab labels | Inter | 500 (Medium) | 12px | Active: `#202225`, Inactive: `#808796` |
| Category selector ("All Providers") | Inter | 500 (Medium) | 12px | `#202225` |
| Provider name | Inter | 600 (Semi Bold) | 12px | `#202225` |
| Provider metadata (model count, apps, tokens) | Inter | 500 (Medium) | 10px | `#808796` |
| Primary button text | Inter | 500 (Medium) | 14px | `#ffffff` |

### Strict Rules
- The ONLY font is **Inter**. Configure Mantine's theme to use `Inter` as the primary font family.
- Never use font sizes outside the defined scale: 10px, 12px, 14px, 16px.
- Provider names are 12px Semi Bold, NOT 14px. This is a compact popup — do not inflate sizes.
- Metadata text is 10px — the smallest in the scale. Do not round up or substitute.
- All text uses `line-height: normal` (browser default for the font size).
- No italic text anywhere in the design.

---

## 4. Component Specifications

### 4.1 Header

```
┌─────────────────────────────────────┐
│ ▼  Synapse Wallet              ⚙   │
└─────────────────────────────────────┘
```

- Padding: `16px` all sides (14px bottom specifically not needed — use 16px)
- Background: `#ffffff`
- Bottom border: `1px solid #f3f3f3` (matches outer bg, subtle separator)
- Left: Collapse chevron (16x16px) + 8px gap + title
- Right: Settings icon (20x20px)
- Chevron icon: `tabler:chevron-down` (16px)
- Settings icon: `tabler:settings` (20px)

### 4.2 Tabs

```
┌──────────┬──────────┬──────────┬──────────┐
│ Providers│  Models  │   Apps   │  Vault   │
└──────────┴──────────┴──────────┴──────────┘
```

- Use Mantine `<Tabs>` component
- Tabs fill the full width equally (each tab is `flex: 1`)
- Active tab: bottom border `1px solid #202225`, text `#202225`
- Inactive tab: bottom border `1px solid #dfe1e8`, text `#808796`
- Tab label padding: `12px` vertical
- Tab text: 12px Medium
- No background color change on hover/active — only border and text color change
- No rounded corners on tab indicators — straight bottom border only

### 4.3 Category Selector

```
All Providers ▾
```

- Displayed below tabs, above the provider list
- Text: 12px Medium `#202225`
- Chevron: 12x12px icon, inline after text with 4px gap
- Clickable — should open a dropdown/popover for category filtering
- No border, no background — just text + icon

### 4.4 Provider Card

```
┌─────────────────────────────────────┐
│ [icon]  Provider Name            >  │
│         N models · N apps · N tok   │
└─────────────────────────────────────┘
```

- Background: `#ffffff`
- Border: `1px solid #dfe1e8`
- Border radius: `8px`
- Padding: `12px`
- Layout: flex row, `justify-content: space-between`, `align-items: center`
- Left side: 32x32px provider icon + 10px gap + text column
- Right side: Chevron icon (20x20px, rotated -90° = pointing right)
- Provider icon: 32x32px, `object-fit: cover`
- Text column: provider name (12px Semi Bold) stacked above metadata row
- Metadata row: stats separated by vertical line dividers
  - Each stat: 10px Medium `#808796`
  - Divider: vertical 12px line in `#dfe1e8`, with 8px horizontal gap on each side
  - Pattern: `{N} models available | {N} allowed apps | {N} tokens used`
- Text column height: ~29px (name + metadata tightly packed)
- The card is clickable (chevron indicates navigation)
- Gap between provider cards: `12px`

### 4.5 Primary Action Button ("Manage providers")

- Full width within the content area
- Background: `#202225`
- Text: white, 14px Medium, centered
- Padding: `16px` vertical
- Border radius: `8px`
- No border
- Overflow: hidden (for ripple/hover effects)

### Strict Rules
- Provider cards MUST have 8px border-radius. The outer container has 4px. Do not mix these up.
- The metadata separator is a real vertical line, NOT a pipe character (`|`). Use a styled divider element.
- Provider icons are always 32x32px. Never scale them to any other size.
- The right chevron on provider cards points RIGHT (it's a chevron-down rotated -90°). Do not use a different icon.

---

## 5. Icon System

### Provider Icons
- Icon source: **@lobehub/icons** — AI/LLM brand SVG logo collection
- Use `ProviderIcon` component: `<ProviderIcon provider="openai" size={32} type="color" />`
- Available provider keys: `anthropic`, `openai`, `ollama`, `gemini`, `microsoft`, `githubcopilot`, `opencode`, `bedrock`, `perplexity`, etc.
- Provider icons are always 32x32px inside provider cards
- Use `type="color"` for colored brand icons (matches the Figma design)
- For the full provider key list, see `@lobehub/icons` `ModelProvider` enum or the [icons gallery](https://icons.lobehub.com/)

### UI Icons (navigation, actions)
- Icon source: **Tabler Icons** (`@tabler/icons-react`)
- Icon sizes (from design):
  - Header collapse chevron: `16px`
  - Header settings: `20px`
  - Category selector chevron: `12px`
  - Provider card right chevron: `20px`
- Icon color inherits from parent text color (use `currentColor`)
- NEVER add new icon packages beyond `@lobehub/icons` and `@tabler/icons-react`.

---

## 6. Mantine Configuration Rules

### Theme Setup
```typescript
// These are the REQUIRED theme overrides for the extension
{
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  primaryColor: "dark",
  defaultRadius: "sm",
  colors: {
    // Override or extend as needed to match the exact hex values
  }
}
```

### Component Style Overrides
- `Tabs`: Remove default Mantine tab styling. Use custom classNames to match the flat bottom-border-only style.
- `Button`: Override to match the flat dark design (no gradient, no shadow).
- `Card` / `Paper`: Use Mantine's `Paper` for provider cards with explicit border and radius.

### Strict Rules
- NEVER use Mantine's default blue primary color. The primary color for this extension is `#202225` (near-black).
- NEVER use Mantine's built-in color scheme toggle (light/dark mode). The extension is light-only per the design.
- NEVER use Mantine's default font. Always override with Inter.
- NEVER add box shadows to cards. The design uses borders only, no shadows.
- Supply `forceColorScheme="light"` to the MantineProvider.

---

## 7. Spacing & Sizing Reference

| Context | Value |
|---|---|
| Outer wrapper padding | 10px |
| Header padding | 16px |
| Content area horizontal padding | 12px |
| Content area top padding | 4px |
| Content area bottom padding | 12px |
| Gap between tab and tab-content | 12px |
| Gap between provider cards | 12px |
| Provider card padding | 12px |
| Provider icon size | 32x32px |
| Icon-to-text gap (provider card) | 10px |
| Metadata stat gap (between items) | 8px |
| Button vertical padding | 16px |
| Tab label vertical padding | 12px |

---

## 8. Interactive States (Guidelines)

The Figma design shows the static state. For interactive states, follow these conventions:

- **Hover on provider card**: Subtle background change to `#f8f9fa` or border color darken to `#c8ccd4`. Keep it minimal.
- **Hover on button**: Slightly lightened background (`#33363a`). No transforms.
- **Active/pressed button**: Darken to `#111214`.
- **Hover on tabs**: No background change. Optionally darken text slightly.
- **Focus ring**: Use Mantine's default focus ring for accessibility. Do not remove it.
- **Transitions**: Use `150ms ease` for color/background transitions. No spring animations.

---

## 9. Accessibility Requirements

- All interactive elements MUST be keyboard accessible (tab-navigable).
- Provider cards should use `role="button"` or be wrapped in a focusable element if clickable.
- Icons that are decorative MUST have `aria-hidden="true"`.
- The settings button needs `aria-label="Settings"`.
- The collapse chevron needs `aria-label="Collapse wallet"` / `"Expand wallet"`.
- Tab panel content must be associated with tabs via Mantine's built-in Tabs accessibility.
- Metadata separators (vertical lines) are decorative — use `aria-hidden="true"`.

---

## 10. File & Folder Structure

All new React/Mantine components go under `apps/extension/src/ui/components/`:

```
src/ui/
  components/
    theme.ts           — Mantine theme configuration
    WalletPopup.tsx     — Root popup component
    WalletHeader.tsx    — Header with title, collapse, settings
    WalletTabs.tsx      — Tab navigation (Providers, Models, Apps, Vault)
    ProviderCard.tsx    — Individual provider card
    ProviderList.tsx    — List of provider cards
    CategorySelector.tsx — "All Providers ▾" dropdown
    PrimaryButton.tsx   — Full-width dark action button
    MetadataDivider.tsx — Vertical line divider for metadata rows
    PopupShell.tsx      — Outer layout wrapper (background, padding, sizing)
```

### Strict Rules
- One component per file. No god-files.
- Keep components focused. `ProviderCard` renders ONE card. `ProviderList` renders the array.
- All styles MUST go through Mantine's `createStyles`, `classNames`, or CSS modules — NO inline style objects unless absolutely needed for dynamic values.
- Export types from each component file for props.

---

## 11. Build & Integration Notes

- The extension currently uses esbuild with vanilla TS. Adding React + Mantine requires:
  1. Add `react`, `react-dom`, `@mantine/core`, `@mantine/hooks`, `@tabler/icons-react` as dependencies.
  2. Update esbuild config to handle `.tsx` files and JSX.
  3. Update `popup.html` to include Mantine's CSS (either bundled or via a `<link>` to the built CSS).
  4. The popup entry point (`popup.ts`) must become a React root render.
  5. Update CSP in `manifest.json` if needed for styles (Mantine uses CSS-in-JS, may need `style-src 'unsafe-inline'` or use CSS modules approach).

---

## 12. Checklist for AI Implementers

Before marking any Figma-driven task as complete:

- [ ] Popup renders at exactly 360px wide
- [ ] Outer background is `#f3f3f3` with 10px padding
- [ ] Inner container is white with 4px border-radius
- [ ] Font is Inter at the correct weights (500, 600)
- [ ] All font sizes match: 10px, 12px, 14px, 16px
- [ ] Colors match exactly (no close approximations)
- [ ] Provider cards have 8px border-radius and 1px `#dfe1e8` border
- [ ] Provider icons are 32x32px
- [ ] Metadata uses vertical line dividers, NOT pipe characters
- [ ] Primary button is dark `#202225` with white text
- [ ] No box shadows anywhere
- [ ] No Tailwind classes (project uses Mantine)
- [ ] Provider icons use `@lobehub/icons` `ProviderIcon` component with `type="color"`
- [ ] UI icons (chevrons, settings) are from `@tabler/icons-react`
- [ ] Compare final render against the Figma screenshot for pixel-accuracy
