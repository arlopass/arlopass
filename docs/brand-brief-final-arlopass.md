# Arlopass — Unified Brand Identity & Marketing Strategy Brief

**Version:** 2.0 Final · **Date:** March 2026 · **Classification:** Internal Strategy  
**Positioning Weight:** 45% AI Wallet · 25% Developer Platform · 10% Privacy Shield · 8% Trust Layer · 2% Open Standard

---

## 1. Executive Summary

Arlopass is your pass to any AI. It is an open-source browser extension, developer SDK, and local bridge that lets any web application use a user's own AI providers without the application ever seeing, touching, or storing the user's API keys.

The brand leads with a single, emotionally powerful idea: **"Your AI. Your pass."** Users install Arlopass, connect their providers, approve requests with a click, and stay in total control. Developers integrate in ~10 lines of code and never manage a single API key. Enterprises get zero-trust policy enforcement, cryptographic audit trails, and compliance-ready architecture — without changing application code. The protocol is open-source, MIT-licensed, because AI access on the web should be a standard, not a moat.

The 12-month go-to-market strategy drives a compounding flywheel: developers build Arlopass-powered apps → users install the extension → usage validates enterprise value → enterprise adoption funds ecosystem growth. Channel allocation mirrors the positioning ratios throughout — 45% wallet/user, 25% developer, 10% privacy, 8% enterprise, 2% open standard.

One pass. Any model. Your rules.

---

## 2. Brand Story & Essence

### The World Before Arlopass

Every web application that wants AI forces the same ugly bargain: paste your API key into a text field and hope the developer doesn't log it, leak it, or go out of business with it sitting in a plaintext database. Users are locked to whatever model the app chose. Developers burn weeks building server-side proxy routes just to keep keys safe. Enterprises have zero visibility into which AI providers their people are using, what data is flowing where, or whether any policy governs the interaction.

The result: AI access is fragmented, insecure, and controlled by the wrong party.

### The World With Arlopass

You install Arlopass — a browser extension. You connect your providers: Ollama running locally, your Claude subscription, your company's Bedrock account. When a web app needs AI, it asks Arlopass. A clean consent prompt appears. You pick the model. You approve the request. Your keys never leave your machine — they live in your OS keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service). The app gets intelligence. You keep sovereignty.

For the developer, integration is `connect()`, `chat.send()`, `chat.stream()`. Ten lines. Ship this afternoon.

For the enterprise, every request is policy-checked, every decision is audit-logged, and every adapter is capability-scoped. Zero trust from browser to model.

### The Core Metaphor: Your AI Pass

Arlopass is the pass you carry everywhere. Like a transit pass or an access badge — you tap it, you're in. Apps request AI access, Arlopass checks with you, and you decide what gets through. The pass metaphor captures the full experience: approval, choice, portability, and personal control.

"Arlo" gives the pass a personality. It's the capable, friendly presence that handles your AI access with warmth and reliability — like a trusted friend who's good with technology and happy to help.

### Supporting Identities

Beneath the pass story, three reinforcing layers add depth without competing:

- **The Developer Platform (25%).** For builders, Arlopass is a Stripe-quality SDK: `connect()`, `chat.send()`, `chat.stream()`. Ten lines to production AI. Beautiful docs. Type-safe. The best DX in the category.
- **The Privacy Shield (10%).** Your keys stay home. Your prompts stay local. Arlopass replaces the knot in your stomach when you paste an API key into a web app with calm confidence. It makes AI feel safe.
- **The Trust Layer (8%).** For enterprises that need governance, Arlopass enforces org-wide AI policies — approved providers, audit trails, signed policy bundles — at the browser level, without requiring a single line of app code to change.
- **The Open Standard (2%).** The protocol is open-source, MIT-licensed, and designed to become the interoperability layer between web apps and AI providers. We believe in openness, but we lead with what openness enables — not openness itself.

### Brand Essence

> **Your AI. Your pass.**

This phrase sits at the center of everything: personal control, developer freedom, privacy assurance, and enterprise governance. It works on a billboard and it works in a terminal.

---

## 3. Unified Brand Identity

### Name & Wordmark

**Arlopass** — a compound of "Arlo" (a warm, capable, gender-neutral name meaning "between two hills" in Old English — a pass between two places) and "pass" (your access credential, your approval, the thing that gets you through).

- **Primary:** `Arlopass` in a clean, slightly rounded sans-serif. The "A" and "p" are the visual anchors — the capital A opens strong, the lowercase "pass" flows naturally.
- **Short form:** `Arlo` in informal/internal contexts.
- **Icon:** A rounded rectangle (the pass/badge shape) with a stylized "A" integrated. Minimal, geometric, works at 16px favicon and on a conference banner.
- **Badge variant:** `⟐ Powered by Arlopass` for integrated apps — the pass icon + text.

### Color Palette

A warm, distinctive palette built on dark neutral foundations with terracotta/amber accents. Inspired by the warmth of the "Arlo" name — premium, grounded, and immediately recognizable against the sea of blue/purple developer tools.

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Primary / Brand** | Terracotta | `#C2410C` | Brand anchor — logo mark, primary buttons, links, key interactive elements. The signature color. |
| **Accent / Hover** | Warm Amber | `#D97706` | Hover states, secondary highlights, active nav items, emphasis text |
| **Connected / Success** | Sage Green | `#4D7C0F` | Pass approved, connected, build passed, adapter healthy |
| **Warning** | Gold | `#CA8A04` | Permission prompts, attention states, policy advisories |
| **Danger** | Crimson | `#B91C1C` | Denied, disconnected, error, policy violation |
| **Body Text (light)** | Warm Charcoal | `#292524` | Primary body text on light backgrounds — warm, readable |
| **Body Text (dark)** | Warm Stone | `#D6D3D1` | Primary body text on dark backgrounds — soft, never harsh white |
| **Light Background** | Warm White | `#FAFAF9` | Marketing pages, docs light mode — stone-tinted, not clinical |
| **Dark Background** | Deep Brown-Black | `#1C1917` | Developer docs, code playgrounds, dark-mode extension UI, primary dark surface |
| **Code Surface** | Editor Dark | `#1A1412` | Code blocks, terminal screenshots — warmest dark, a shade of espresso |
| **Muted Surface** | Dark Stone | `#292524` | Cards, sidebars, secondary surfaces on dark backgrounds |
| **Border / Divider** | Warm Border | `#44403C` | Subtle borders on dark, nav dividers, card edges |
| **Subtle Tint** | Terracotta Wash | `#FFF7ED` | Light-mode highlight surfaces, callout backgrounds — terracotta at 5% |

**Design rules:**
- **Terracotta (`#C2410C`) is the constant.** It appears in every branded asset — logo, buttons, links, accent elements. It is the visual signature of Arlopass.
- **Dark surfaces are warm, not cool.** The background is brown-black (`#1C1917`), not blue-black. This is the Cursor-inspired distinction: warmth in the darkness.
- **Text is never pure white on dark.** Use Warm Stone (`#D6D3D1`) for body text. Pure white (`#FFFFFF`) is reserved for headlines and high-emphasis elements only.
- **Success is earthy green, not neon.** Sage Green (`#4D7C0F`) signals approval/connection without breaking the warm palette.
- **Light mode uses stone tints.** Backgrounds are warm white (`#FAFAF9`), not clinical white. Highlight surfaces use Terracotta Wash (`#FFF7ED`).

### Typography Stack

| Role | Typeface | Fallback | Context |
|------|----------|----------|---------|
| **Headlines** | Geist Sans | system-ui, sans-serif | All contexts — geometric, modern, confident |
| **Body** | Geist Sans | system-ui, sans-serif | All contexts — proven readability, matched pair with code font |
| **Code** | Geist Mono | monospace | Code blocks, CLI output, API references |

**One type system. One sans-serif family. One monospace family.** Geist Sans and Geist Mono are designed as a matched pair by Vercel — consistent baseline, x-height, and character proportions. Hierarchy is controlled through weight and size, not typeface switching.

### Voice & Tone

The default voice is **Arlo's voice** — friendly, capable, clear. The user is the hero. Arlopass is the helpful companion.

| Context | Voice Register | Example |
|---------|---------------|---------|
| **Default (Consumer)** | Friendly, capable, clear | *"Your AI, your pass, your call."* |
| **Developer** | Add code fluency, concision, show-don't-tell | *"10 lines. No proxy. No key management. Ship it."* |
| **Privacy** | Add warmth, empathy, reassurance | *"Your keys stay home. Always."* |
| **Enterprise** | Add precision, compliance literacy, measured authority | *"Dual enforcement at every trust boundary. Audit-ready from day one."* |

**Universal rules:** Active voice. Short sentences. The user is the hero — Arlopass is the tool, not the protagonist. Show, don't tell. Every claim is backed by a code example, a diagram, or a spec citation. No stock photos. No fear-based marketing. No superlatives.

### Visual Language & Iconography

- **Pass/badge UI patterns as hero visuals** — Permission prompts, approval flows, provider selectors, connection status indicators. The pass being tapped/approved is the signature visual.
- **Code as hero content** — Syntax-highlighted Arlopass SDK code front and center. If it can be shown in code, show it in code.
- **Architecture diagrams** — Clean trust-boundary and data-flow diagrams. Technical but clear — never enterprise-complexity theater.
- **Before/after contrasts** — "Without Arlopass" (API keys in `.env` files, provider lock-in) vs. "With Arlopass" (approval popup, user choice, keys local).
- **Warm illustrations for privacy** — Rounded, friendly iconography: house (local), shield (protected), eye-slash (private), checkmark-circle (approved).
- **No stock photography.** Diagrams, code, abstract illustrations, and real UI screenshots only.

---

## 4. Master Positioning Statement

> For **anyone building or using AI-powered web applications**, Arlopass is the **open-source AI access pass and developer SDK** that lets users connect their own models and providers — local or cloud — while keeping credentials on their device, consent in their hands, and policy enforcement at every trust boundary. Unlike embedded API keys, vendor-locked SDKs, or server-side AI gateways, Arlopass gives users **sovereignty**, developers **simplicity**, and enterprises **governance** — in a single, zero-trust architecture.

**Category Arlopass creates:** **AI Access Management** — the user-controlled layer between web applications and AI providers, mediating access through consent, policy, and a universal SDK.

---

## 5. Messaging Architecture

### Primary Tagline

> **Your AI. Your pass.**

### Secondary Taglines

- "Your pass to any AI." — Descriptive, action-oriented.
- "One pass. Any model." — Compressed value prop.
- "Tap to approve. Pick your model." — UX-descriptive.

### 3-Tier Messaging Hierarchy

| Tier | Length | Message |
|------|--------|---------|
| **L1 — Headline** | 10 words | Let web apps use your AI without touching your keys. |
| **L2 — Value Prop** | 30 words | Arlopass is an open-source AI access pass that lets you connect your own models — Ollama, Claude, GPT, Bedrock — to any web app, without exposing credentials or losing control. |
| **L3 — Full Pitch** | 100 words | Web apps need AI, but today that means handing over API keys, getting locked into one provider, and trusting the app with your prompts. Arlopass changes the architecture. Install the browser extension, connect your providers, and every AI request goes through your pass. You see every request. You approve and select a model. Requests route through a local bridge on your machine — keys never leave. For developers, it's a 10-line SDK integration. For privacy-conscious users, everything stays local. For enterprises, it's zero-trust AI governance with policy enforcement and audit trails. Open source. MIT licensed. Your AI, your pass. |

### Elevator Pitches by Audience

**End User (The Pass Pitch):**
> "Arlopass is your personal AI pass. Install the extension, connect your AI providers, and use them in any web app. You approve every request, pick the model, and your keys never leave your machine."

**Developer (The SDK Pitch):**
> "Add `@arlopass/web-sdk` to your app, call `connect()` and `chat.send()`. The user's Arlopass handles provider selection, auth, and routing. You never touch an API key. Ten lines, any model."

**Enterprise (The Governance Pitch):**
> "Arlopass enforces org-wide AI policies at the browser level — approved providers, audit trails, signed policy bundles — without requiring developers to change a line of code. Zero-trust, locally enforced, compliance-grade evidence."

**Privacy-Conscious User:**
> "Tired of pasting API keys into apps you don't fully trust? Arlopass keeps your keys in your OS keychain. The app gets AI. You keep control."

### Scenario-Based Messaging

| Scenario | Message |
|----------|---------|
| User sees Arlopass prompt for the first time | "This app wants to use AI. Pick your model, approve, done." |
| User doesn't trust an app with their API key | "Install Arlopass. Connect your provider once. Now every supported app uses your AI — without ever seeing your key." |
| User wants local models in web apps | "Arlopass connects your local Ollama models to any web app. Everything stays on your machine. Zero cloud, zero exposure." |
| User uses Claude at home and GPT at work | "Connect both to Arlopass. Switch between them in any web app with one click. Your subscriptions, your choice." |
| Team shares API keys in Slack and `.env` files | "Each person installs Arlopass and connects their own providers. No shared keys. No credential sprawl." |
| Developer evaluating the SDK | "`npm install @arlopass/web-sdk` — 10 lines to streaming AI chat. TypeScript-first, async iterators. No API keys." |
| Developer wants AI without backend proxy | "No server, no proxy, no key management. The user's Arlopass handles it. You write `chat.send()` and ship." |
| CISO evaluating for org deployment | "Zero-trust enforcement from browser to model. Every request policy-checked, every decision audit-logged." |
| Conference booth / elevator | "Arlopass — your personal AI pass. Pick your model, approve the request, and your keys never leave your machine." |

---

## 6. Audience-Weighted Value Propositions

### For End Users — Your AI Pass (45% — LEAD)

The pass is the product. Every consumer touchpoint leads with the pass metaphor.

> **You decide which AI powers the apps you use.**

- **Install and connect** — Browser extension, 30-second setup, connect Ollama / Claude / GPT / Bedrock
- **Approve with confidence** — Clear consent prompt shows exactly what the app is requesting
- **Choose your model** — Switch providers per-app, per-request, per-mood
- **Keys stay home** — OS keychain storage, zero cloud dependency, nothing to leak
- **One pass, every app** — Install once, use everywhere any Arlopass-enabled web app

### For Developers — 10-Line Integration (25% — SECONDARY)

Developers are the distribution engine. They build the apps that drive installs.

> **Add AI to your app in 10 lines. No API keys to manage.**

- **10-line integration** — `connect()`, `chat.send()`, `chat.stream()`. Ship this afternoon
- **Zero key management** — No server proxy, no `.env` files, no key rotation headaches
- **Any model, no code change** — User switches providers; your code doesn't change
- **Type-safe, streaming-first** — TypeScript-native, Zod-validated schemas, async iterator streaming
- **Stripe-level DX** — Clean API surface, comprehensive docs, copy-paste examples that work
- **Free infrastructure** — Users bring their own AI subscriptions; you don't pay for their inference

### For Privacy-Conscious Users (10% — SUPPORTING EMOTION)

Privacy is not a separate product. It is the emotional reason the pass matters.

> **Your keys stay home. Your prompts stay local.**

- **Keys never leave your device** — OS keychain, not browser localStorage, not a server
- **Prompts stay local** — Raw content routes through your machine, not through the app
- **Works with fully local models** — Ollama, LM Studio for zero-cloud, zero-exposure AI
- **Transparent data flow** — See exactly where every request goes, revoke access with one click
- **No accounts, no cloud** — Arlopass itself has no backend, no user accounts, no telemetry phone-home

### For Enterprise IT & Security (8% — CREDIBILITY)

Enterprise messaging is precise, audit-grade, and lives in its own lane.

> **AI access you can audit, enforce, and trust.**

- **Zero-trust architecture** — HMAC handshake, ephemeral session keys, anti-replay nonces at every trust boundary
- **Signed policy bundles** — Org-wide rules: provider allowlists, model restrictions, data-handling policies, Ed25519-signed
- **Audit trails** — JSONL and OTLP export, every grant/revoke/request logged with cryptographic evidence
- **Compliance-ready** — Pre-mapped control alignment for SOC 2, ISO 27001, NIST 800-53, GDPR, HIPAA
- **No app-code changes** — Deploy policies to the extension layer; applications are unmodified
- **Standard deployment** — MDM-deployed extension (Intune, Jamf), no new cloud infrastructure

### For the Open-Source Community (2% — SIGNAL)

> **An open protocol for AI access on the web.**

- **MIT licensed** — Use it, fork it, extend it, contribute
- **Open adapter contract** — Build a new provider adapter in a single TypeScript file
- **Community-governed** — RFC process for protocol changes, contributor-friendly governance
- **No vendor lock-in** — The protocol is a standard, not a proprietary moat

---

## 7. Unified Competitive Positioning

| Capability | Arlopass | Paste API Key into App | AI Gateways (LiteLLM, Portkey) | Vendor SDKs (Vercel AI, LangChain) | Browser AI Plugins |
|------------|:-:|:-:|:-:|:-:|:-:|
| User chooses the model | ✅ | App-dependent | ❌ (server-configured) | ❌ | Partial |
| Keys never leave user's device | ✅ | ❌ | ❌ | ❌ | Varies |
| Works with local models (Ollama) | ✅ | Rarely | Sometimes | ❌ | Sometimes |
| Zero server-side infrastructure | ✅ | ❌ | ❌ | ❌ | ✅ |
| Developer integration effort | ~10 lines | ~40+ lines + proxy | ~30 lines | ~15 lines | N/A |
| Provider switching (code change) | 0 lines | Full rewrite | Config change | Moderate | N/A |
| Enterprise policy & audit | ✅ | ❌ | ✅ | ❌ | ❌ |
| User approves each request | ✅ | ❌ | ❌ | ❌ | ❌ |
| Zero-trust architecture | ✅ | ❌ | Partial | ❌ | ❌ |
| Open source | ✅ (MIT) | Varies | Some | Some | Rarely |

**Arlopass's core advantage:** It is the only solution where the developer writes zero credential management code AND the user retains full model choice and per-request approval authority. Every competitor forces a trade-off between developer simplicity and user sovereignty. Arlopass eliminates that trade-off.

**Positioning line:** *"Others ask you to trust them with your keys. Arlopass asks you to keep them."*

---

## 8. 12-Month Go-to-Market Strategy

### Phase 1: Ignition — Launch & Developer Adoption (Months 1–4)

The extension and SDK launch together. The consumer "pass" metaphor leads; the developer tools make it real.

| Track | Channel | Tactic | KPI |
|-------|---------|--------|-----|
| **Wallet (45%)** | Chrome Web Store | Extension launch: privacy-forward listing, approval-flow screenshots, demo video | 2,000 installs |
| | Product Hunt | "Your personal AI pass" coordinated launch with live playground | Top 5 Product of the Day |
| | Reddit | r/LocalLLaMA, r/selfhosted, r/ollama — "Use your local models in any web app" | 500+ upvotes |
| | AI newsletters | TLDR AI, Ben's Bites — consumer-angle feature placement | 2,000 CTR |
| | YouTube | "I stopped giving apps my API keys — here's how" (5-min walkthrough) | 5,000 views |
| **Developer (25%)** | GitHub | Obsessive README quality, issue templates, first-timer labels, architecture docs | 2,000 stars |
| | Hacker News | "Show HN: Add AI to your web app in 10 lines (no API keys)" | Front-page placement |
| | npm | Polished package README, working examples, weekly downloads tracking | 1,000/week |
| | Dev.to / Hashnode | "Build an AI chat in React without an API key" tutorial series | 10,000 total views |
| | StackBlitz / CodeSandbox | Live-editable templates: React, Next.js, Svelte, Vue | 200 forks |
| | Discord | Community: `#help`, `#showcase`, `#adapters`, `#rfc` | 500 members |
| **Privacy (10%)** | Reddit | r/privacy, r/degoogle — "Your API keys never leave your machine" | Upvotes, referral installs |
| | Privacy podcasts | Surveillance Report, Opt Out Pod — guest appearances | Mentions, referral traffic |
| | Mastodon / Fediverse | Privacy-forward social engagement | Follows, boosts |
| **Enterprise (8%)** | Security blog | Threat model and trust-boundary deep-dive posts | Views, shares by security engineers |
| | SECURITY.md | Public responsible disclosure policy with clear SLAs | Researcher engagement |
| **Standard (2%)** | GitHub governance | CODEOWNERS, RFC process, contributor guide published | Contributors, forks |

**Phase 1 Milestones:** SDK 1.0 stable. 5 provider adapters. Chrome Web Store live. 2,000 installs. 4 framework starter templates (React, Next.js, Svelte, Vue).

### Phase 2: Expansion — Ecosystem Growth & User Scale (Months 5–8)

Scale installs through network effects. Expand developer ecosystem. Begin enterprise credibility.

| Track | Channel | Tactic | KPI |
|-------|---------|--------|-----|
| **Wallet (45%)** | Cross-promotion | Partner with Ollama, LM Studio communities for co-marketing | 1,000 referral installs |
| | Tech press | Pitch Ars Technica, The Verge: "The browser extension that keeps your AI keys private" | 2+ articles |
| | Chrome Web Store | Updated screenshots, comparison content, review campaign | 10,000 cumulative installs |
| | Short-form video | TikTok/YT Shorts: "Where your API key actually goes" animated explainer | 50,000 views |
| | "Powered by Arlopass" badge | Apps display badge → user discovery loop → installs | 10 badge adopters |
| **Developer (25%)** | React SDK | Ship `@arlopass/react` with `useChat`, `useProvider`, `useConnection` hooks | npm downloads |
| | Framework starters | Official templates for all major frameworks | Template forks |
| | Conference talks | ReactConf, ViteConf, NodeConf — "The end of API key management" | 3 talk acceptances |
| | Adapter bounties | Fund community adapters for Gemini, Groq, Mistral, Cohere | 5 new adapters |
| **Privacy (10%)** | Ollama community | "Use your Ollama models in any web app" deep integration content | Adapter usage stats |
| | Privacy directories | PrivacyGuides.org, awesome-privacy, AlternativeTo listings | Referral traffic |
| **Enterprise (8%)** | LinkedIn | "Shadow AI is the new shadow IT" thought leadership series | Impressions, inbound leads |
| | Whitepaper | "The AI Access Control Gap: Why Network Blocks Aren't Enough" | 500 downloads |
| | Webinars | "Governing AI at the browser edge" co-hosted with compliance vendors | Registrations |
| **Standard (2%)** | Interop demos | 8+ working adapters (local + cloud) demonstrated publicly | Demo views |

**Phase 2 Milestones:** 10,000 installs. 50 Arlopass-powered apps. 8 adapters. 3 enterprise pilot conversations. Press coverage.

### Phase 3: Compounding — Enterprise Pipeline & Network Effects (Months 9–12)

Convert enterprise interest into pipeline. Achieve critical mass for the flywheel.

| Track | Channel | Tactic | KPI |
|-------|---------|--------|-----|
| **Wallet (45%)** | App integrations | Help top web apps integrate Arlopass → drives installs | 100 Arlopass-powered apps |
| | SEO | "What happens when you paste your API key into a web app" — shareable explainer | Search ranking |
| | Mainstream press | Pitch consumer angle to Wired, Lifehacker | 3+ press mentions |
| | Monthly active users | Drive repeat engagement through multi-app use | 25,000 MAU |
| **Developer (25%)** | Community advocacy | Developer ambassadors, #BuiltWithArlopass campaign | Submissions, reach |
| | Hackathons | "Best Arlopass Integration" prize at AI/web dev hackathons | Novel use cases |
| | Documentation | World-class docs: quickstart < 5 min, dark mode, CI-tested examples | 4.5/5 satisfaction |
| | Developer NPS | Quarterly DX audit + satisfaction survey | NPS > 50 |
| **Privacy (10%)** | Privacy advocacy | EFF, Access Now partnerships on AI privacy awareness | Endorsements |
| | Push press | Guest posts on The Markup, EFF blog | Reads, backlinks |
| **Enterprise (8%)** | SIEM integrations | Splunk, Elastic, Datadog — audit export documentation | Integration listings |
| | MDM guides | Intune, Jamf deployment documentation published | Published guides |
| | Case studies | 2–3 early adopter compliance wins published | Pipeline influence |
| | Analyst briefings | Gartner, Forrester — emerging AI governance category | Report mentions |
| **Standard (2%)** | Protocol spec | v1.0 specification published, community RFC process active | Spec downloads |
| | Ecosystem report | Annual "State of Arlopass" — apps, adapters, providers, requests | Published report |

**Phase 3 Milestones:** 25,000+ MAU. 100 Arlopass-powered apps. 10+ enterprise pilots. Protocol spec v1.0. Developer NPS > 50.

---

## 9. Content Pillars

Ranked by priority and volume, reflecting the 45/25/10/8/2 weighting:

### 1. "Your AI Pass" — User Empowerment & Control (45%)
Origin stories ("Why Arlopass exists"). The problem with API key sharing. Before/after visuals. User testimonials. Approval-flow demos. Provider switching showcases. "Apps that work with Arlopass" directory. This is the heartbeat of the brand. **Publish weekly** across blog, social, and video.

### 2. "Ship AI in 10 Lines" — Developer Quickstarts & Integration Recipes (25%)
Fastest-path-to-working-AI tutorials. React + Arlopass, Next.js + Arlopass, Svelte + Arlopass, vanilla JS + Arlopass. SDK deep dives. Adapter spotlights. "How we built it" architecture posts. Code-first, copy-paste-friendly, always runnable. **Publish bi-weekly.**

### 3. "Your Keys Stay Home" — Privacy & Local-First AI (10%)
Where your data goes with Arlopass vs. without. Ollama integration guides. OS keychain explainer. Emotional, warm, shareable. **Monthly** long-form posts + short-form social clips.

### 4. "AI Governance That Works" — Enterprise Security & Compliance (8%)
Zero-trust architecture walkthroughs. Compliance framework mappings (SOC 2, ISO 27001, NIST, GDPR, HIPAA). Policy bundle tutorials. Audit trail case studies. **Quarterly** whitepapers + monthly enterprise blog posts.

### 5. "Building in the Open" — Protocol & Open Source Community (2%)
RFC-style protocol decisions. Contributor spotlights. Ecosystem health reports. **Published quarterly**, referenced in other pillars as context warrants.

---

## 10. Growth Flywheel & Compounding Loops

Arlopass's audiences feed each other in a self-reinforcing cycle. The flywheel's gravity center is the **install base** — every loop feeds it or feeds from it.

```
    Developer integrates SDK (~10 lines)
                    │
                    ▼
    App prompts user to install Arlopass
                    │
                    ▼
    User installs Arlopass, connects providers
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
  User finds    More devs    Enterprise
  more Arlo-    see install  notices org
  pass apps     base and     adoption,
                integrate    deploys
                             policies
        │           │           │
        └───────────┼───────────┘
                    ▼
          Larger install base
          = more apps, users,
          and adapter demand
```

**Loop 1 — Developer ↔ User (Primary).** Developer integrates SDK → app prompts users to install Arlopass → users install and connect → users discover more Arlopass-powered apps → users ask other developers "why doesn't your app support Arlopass?" → more integrations.

**Loop 2 — Adapter Ecosystem.** New adapter (e.g., Gemini) → users of that provider adopt Arlopass → more apps integrate → more adapter demand → community builds new adapters. Adapter contribution is the long-term ecosystem moat.

**Loop 3 — "Powered by Arlopass" Badge.** Apps display the badge → users learn about Arlopass → install the extension → discover more Arlopass apps → tell other developers. The badge is a low-friction distribution channel.

**Loop 4 — Enterprise Pull.** Enterprise IT adopts Arlopass for governance → requires approved apps to support Arlopass → app developers integrate → creates non-enterprise user adoption as a side effect.

**Loop 5 — Privacy Word-of-Mouth.** Privacy community champions Arlopass → organic installs from r/privacy, r/selfhosted, Mastodon → users discover non-privacy apps also support Arlopass → broadens the user base beyond the privacy niche.

---

## 11. Unified Success Metrics

### North Star Metric
**npm weekly downloads × cumulative extension installs.** Arlopass is a two-sided product — the SDK supply and the extension demand. Neither number alone tells the full story. Both must grow together.

### KPI Dashboard

| Metric | Month 3 | Month 6 | Month 9 | Month 12 | Track |
|--------|:-------:|:-------:|:-------:|:--------:|-------|
| Extension installs (cumulative) | 2,000 | 10,000 | 40,000 | 100,000 | Wallet |
| Monthly active users | 500 | 3,000 | 15,000 | 25,000 | Wallet |
| Arlopass-powered apps | 10 | 50 | 200 | 500 | Wallet + Dev |
| npm weekly downloads | 1,000 | 5,000 | 20,000 | 50,000 | Developer |
| GitHub stars | 2,000 | 4,000 | 7,000 | 10,000 | Developer |
| Active contributors | 20 | 50 | 100 | 200 | Developer |
| Framework starter templates | 4 | 6 | 8 | 10 | Developer |
| Provider adapters | 5 | 8 | 12 | 20 | Ecosystem |
| Community Discord members | 500 | 1,000 | 2,000 | 3,000 | Developer |
| Documentation satisfaction | — | 4.5/5 | 4.5/5 | 4.5/5 | Developer |
| Developer NPS | — | — | > 40 | > 50 | Developer |
| Privacy directory listings | 1 | 3 | 5 | 5+ | Privacy |
| Press mentions (tech/privacy) | 0 | 2 | 4 | 6+ | Privacy + Wallet |
| Enterprise pilot conversations | 0 | 3 | 8 | 15 | Enterprise |
| Enterprise contracts | 0 | 0 | 3 | 10 | Enterprise |
| "Powered by Arlopass" badge adoptions | 0 | 10 | 30 | 50+ | Ecosystem |
| Analyst report mentions | 0 | 0 | 0 | 1 | Enterprise |

---

## 12. Brand Governance & Guidelines

### Naming Rules

| Rule | Detail |
|------|--------|
| Primary name | **Arlopass** (one word, capital A, lowercase p) |
| Short form | **Arlo** (informal/internal contexts only) |
| Product names | **Arlopass** (extension), **Arlopass Bridge** (local daemon), **Arlopass SDK** |
| Package names | `@arlopass/web-sdk`, `@arlopass/react`, `@arlopass/protocol` |
| Hashtags | `#Arlopass`, `#BuiltWithArlopass`, `#PoweredByArlopass` |
| Never | "Arlo Pass" (two words), "ArloPass" (camelCase), "ARLOPASS" (all caps), "arlopass" (no cap), "Arlo-Pass" (hyphenated), "Arlopass AI" (redundant — AI is implied), "Arlopass Cloud" (there is no cloud) |

### Voice Rules

| Do | Don't |
|----|-------|
| Active voice, short sentences | Passive constructions, corporate run-on sentences |
| Make the user the hero | Make Arlopass the protagonist |
| Lead with what the user/developer gets | Lead with internal architecture details |
| Show code, diagrams, real UI screenshots | Use stock photos or AI-generated faces |
| State facts plainly — "keys never leave your device" | Use superlatives — "the best", "the most secure", "revolutionary" |
| Refer to "Arlopass" or just "Arlo" informally | Say "our platform" or "the Arlopass solution" |
| Acknowledge trade-offs honestly | Overstate capabilities or make false promises |
| Use "you" and "your" | Use "our platform leverages" or "we utilize" |

### Visual Rules

| Element | Specification |
|---------|---------------|
| Primary color | Terracotta `#C2410C` — must appear in every branded asset as the signature accent |
| Accent color | Warm Amber `#D97706` — hover states, secondary highlights |
| Success state | Sage Green `#4D7C0F` — reserved for connected/approved states, never decorative |
| Dark surfaces | Deep Brown-Black `#1C1917` — warm dark, never blue-black or pure black |
| Code blocks | Always render on Editor Dark `#1A1412`. No light-mode code blocks in brand materials. |
| Body text (dark) | Warm Stone `#D6D3D1` — never pure white for body text |
| Light surfaces | Warm White `#FAFAF9` — stone-tinted, not clinical |
| Headline typeface | Geist Sans |
| Body typeface | Geist Sans |
| Code typeface | Geist Mono |
| Logo minimum size | 24px height |
| Logo clear space | 1× logo height on all sides |
| Dark mode support | Required for all developer-facing content |
| Imagery | Diagrams, code blocks, UI screenshots, abstract illustrations only |
| Font stack | Geist Sans → Geist Mono is the ONLY approved stack. No per-audience substitutions |

### Prohibited Elements

- Stock photography of any kind
- AI-generated human faces or people
- Generic padlock/shield illustrations from stock icon packs
- Fear-based privacy messaging ("Hackers want your keys!", "You're exposed!")
- Separate visual identities for "consumer Arlopass" vs. "enterprise Arlopass"
- The word "blockchain" in Arlopass materials (the wallet analogy is structural, not technological)
- Hype words: "revolutionary", "game-changing", "next-generation", "disruptive", "synergy"
- Unsubstantiated security claims ("military-grade", "bank-level", "unhackable")
- Competitor bashing by name in advertising (competitive tables in documentation are fine)
- Promising privacy protections Arlopass doesn't provide (e.g., we don't encrypt prompts end-to-end)
- Claiming compliance certifications not yet completed — reference architecture readiness only
- Using "AI" as a standalone product noun ("an AI" vs. "an AI pass")
- Light-mode code blocks, serif fonts in headlines, or separate enterprise color palettes
- Blue, purple, or cool-toned primary accents — the warm palette is the brand's visual differentiation
- Pure white (#FFFFFF) body text on dark backgrounds — always use Warm Stone (#D6D3D1)
- Cool-black backgrounds (#0F172A, #09090B) — always use warm brown-black (#1C1917)

---

## 13. Brand Architecture

**Model:** Branded House

All products live under the Arlopass master brand:

```
Arlopass
├── Arlopass (browser extension — the product IS the brand)
├── Arlopass SDK (@arlopass/web-sdk)
├── Arlopass Bridge (local daemon)
├── Arlopass Adapters (provider connectors)
└── Arlopass Enterprise (policy + audit layer)
```

Users say "I use Arlopass" — the extension doesn't need a sub-brand. Developers say "Arlopass SDK." Enterprise buyers say "Arlopass for Enterprise" or "Arlopass Enterprise." One name, one brand, one identity across every audience.

---

## 14. Migration Plan: BYOM → Arlopass

Since the product hasn't launched yet, this is a clean rename, not a migration. Key actions:

| Area | Action |
|------|--------|
| **npm packages** | Publish under `@arlopass/*` scope from day one. No `@byom-ai/*` packages ever ship publicly. |
| **GitHub** | Rename org to `arlopass`. Repository: `arlopass/arlopass`. |
| **Domain** | `arlopass.com` (primary), `arlopass.dev` (developer docs if desired). |
| **Extension** | Chrome Web Store listing as "Arlopass." Extension ID set once, never changes. |
| **Injected API** | `window.arlopass` as the injected transport. No `window.byom` alias needed. |
| **Internal references** | Find-and-replace all `byom`, `BYOM`, `byom-ai` references in codebase to `arlopass`. |
| **Social accounts** | Register `@arlopass` on GitHub, Twitter/X, Discord, npm, Chrome Web Store immediately. |
