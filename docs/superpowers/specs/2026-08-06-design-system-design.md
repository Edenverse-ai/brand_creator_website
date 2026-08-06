# Design System — brand_creator_website

**Date:** 2026-08-06
**Status:** Approved (brainstorm complete)
**Scope:** Public marketing + marketplace surfaces, EN + zh. Portals (brandportal, creatorportal, admin) excluded — phase 2.

## Goal

Replace the ad-hoc styling layer (inline Tailwind defaults, 23 unstructured `ui/` components, empty token files, boilerplate globals) with a token-driven design system. Direction: **premium / editorial**, keeping the existing purple + white brand identity, with light and dark themes from day one.

## Decisions (locked during brainstorm)

| Question      | Decision                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| Scope first   | Public + marketplace (home, how-it-works, membership, join pages, find-creators, creator/[id]); portals later |
| Personality   | Premium / editorial                                                                                           |
| Palette       | Keep purple + white; dark mode = **violet-tinted dark** (option A)                                            |
| Themes        | Light + dark from day one                                                                                     |
| zh typography | Subsetted CJK serif webfont (Noto Serif SC)                                                                   |
| Foundation    | **Approach A:** shadcn/ui skeleton + custom editorial token skin                                              |

## Architecture

### Token layers

Two-layer CSS custom properties, oklch preferred:

```
src/styles/
├── variables.css   # Layer 1 primitives: color ramps, fluid type scale, space, radius, shadow, motion
├── themes.css      # Layer 2 semantic: :root (light) + [data-theme="dark"] remaps
├── globals.css     # imports + base element styles (removes span/input/textarea color overrides)
└── portals.css     # untouched this phase
```

- Tailwind `tailwind.config.ts` extends theme from semantic vars (`colors.surface = "var(--surface)"` …). `darkMode: ["class", '[data-theme="dark"]']`.
- Theme switching: `data-theme` on `<html>` via `next-themes` (system preference + persistence, no FOUC). Provider added in `src/app/providers.tsx`. Toggle in Navigation.
- Cleanup: delete dead `tailwind.config.js`; drop deprecated `@tailwindcss/line-clamp` plugin; remove boilerplate `--foreground-rgb` vars and global `span { color: black }` / `input` / `textarea` overrides in `globals.css`.
- Portal pages pinned to light theme until phase 2.

### Color tokens (semantic)

| Token              | Light               | Dark (violet-tinted) |
| ------------------ | ------------------- | -------------------- |
| `--surface`        | `#FCFCFD`           | `#131020`            |
| `--surface-raised` | `#FFFFFF`           | `#1B1730`            |
| `--surface-sunken` | `#F4F2F9`           | `#241E3E`            |
| `--ink`            | `#17151F`           | `#EDEAF6`            |
| `--ink-muted`      | `#565264`           | `#9C96B0`            |
| `--accent`         | `#7C3AED`           | `#A78BFA`            |
| `--accent-strong`  | `#6D28D9`           | `#8B5CF6`            |
| `--accent-soft`    | `#F1EBFD`           | `#2A2350`            |
| `--line`           | `#DDD9E8`           | `#35304E`            |
| `--ring` (focus)   | accent              | accent               |
| `--gradient-hero`  | `#7C3AED → #4F46E5` | `#8B5CF6 → #6366F1`  |

Plus per-theme status tokens: `--success`, `--warning`, `--danger`, `--info`.

Rules:

- Purple is the **single semantic accent** (CTAs, links, active states, kickers). Existing scattered `purple-*`/`indigo-*` utility usage collapses into these tokens.
- Gradients reserved for hero/featured moments; never body UI.
- All pairings WCAG AA in both themes (accent-on-surface, ink-muted-on-surface, white-on-accent).
- Platform brand colors (TikTok, YouTube, RED badge gradients e.g. `orange→red`, `green→emerald`) become separate `--platform-*` tokens; they are third-party brand colors, not ours.

### Typography

- **Display serif:** Fraunces (variable; optical size + weight axes) — headlines, hero numerals, pull quotes. Weights 400/600.
- **Body sans:** Inter (variable) — body, UI, labels. Weights 400/500/600.
- **zh:** Noto Serif SC (subsetted) for display; Noto Sans SC + system CJK stack for body.
- Loaded via `next/font` → CSS vars `--font-display`, `--font-body`. `src/app/zh/layout.tsx` overrides the same two vars — components are locale-agnostic.
- Fluid scale in `variables.css`: `--text-hero: clamp(3rem, 1rem + 7vw, 7rem)`, `--text-h1/h2/h3`, `--text-base`, `--text-small`, `--text-micro` (uppercase tracked kicker style).
- Display sizes: tight leading, slight negative tracking. Body: generous leading. zh override: looser leading, zero tracking.
- Budget: max 2 families per locale; preload only critical display weight.

### Components

**shadcn/ui setup:** `npx shadcn init`, CSS-variables mode wired to `themes.css` tokens (not defaults), `components.json` → `src/components/ui/`. Install: button, card, input, textarea, dialog, popover, tabs, calendar, badge, skeleton, select, dropdown-menu, sheet, tooltip.

**Re-skin pass:** radius tokens (`--radius-card: 16px`, controls `10px`, pill CTAs), serif headings in cards, focus ring = `--ring`.

**Replacement map:**

| Current `src/components/ui/`                                                                               | Disposition                                       |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Button, Card, Input, Textarea, Dialog, Popover, tabs, Calendar                                             | Replaced by shadcn equivalents; old files deleted |
| Loading                                                                                                    | Skeleton + spinner variant                        |
| SearchBar, CategorySelector                                                                                | Rebuilt on shadcn Input/Select primitives         |
| Navigation, Stats, PlatformIcon, TikTokIcon, SocialLinks, ScrollButtons, ErrorHandlingImage, SearchHandler | Kept; restyled via tokens                         |
| CreatorCard, PortfolioGallery, AnalyticsCharts, PlatformSection                                            | Hero components — bespoke redesign on tokens      |
| CreatorTradingCard + rarity.ts, DigitalHumanSection                                                        | Bespoke; rarity colors become own token subset    |

### Depth & motion

- Elevation: `--shadow-raised` (cards) + `--shadow-overlay` (dialogs/popovers). Dark mode: depth via surface steps + 1px `--line` borders + subtle violet hover glow (`--glow-accent`) on hero cards.
- Texture: faint grain overlay (inline SVG noise, ~2KB) on hero sections only.
- Motion tokens: `--dur-fast: 150ms`, `--dur-normal: 300ms`, `--dur-slow: 600ms`; `--ease-out-expo` primary.
- Compositor-friendly properties only (transform / opacity / clip-path).
- Patterns: card lift 2px + glow on hover; scroll-reveal fade-up via IntersectionObserver; hero headline clip-path reveal.
- All motion gated by `prefers-reduced-motion`.

## Migration order

1. Token layer + fonts + globals cleanup (incl. dead config + line-clamp removal)
2. shadcn install + re-skin
3. Navigation + footer (shared shell) + theme toggle
4. Home (`src/app/page.tsx` + home components)
5. find-creators + CreatorCard grid
6. creator/[id] profile + PortfolioGallery
7. membership
8. Each step migrates its zh twin page in the same PR (shared components make this mostly free; verify CJK type + text-length overflow)

## Error handling

- Token contract: missing dark override for any semantic token is a test failure, not a silent fallback.
- Fonts: `font-display: swap`; system-stack fallbacks defined for both locales so failed font loads degrade gracefully.
- Theme: `next-themes` handles unknown/absent stored preference → system default; no FOUC via its inline script.

## Testing

- **Visual regression (Playwright):** home, find-creators, creator profile, membership × viewports {320, 768, 1024, 1440} × {light, dark} × {en, zh}.
- **A11y:** automated checks, keyboard navigation, contrast assertions computed from the token file (unit test parses tokens, runs WCAG math on defined pairs).
- **Unit:** token contract test (every semantic token defined in both themes); rarity.ts logic.
- **Performance:** Lighthouse on home + find-creators; CWV targets per project rules; font budget (subsetted CJK, preload critical weight only); JS budget unchanged.

## Out of scope

- Portal surfaces (`brandportal`, `creatorportal`, `storyclaw-admin`) and `portals.css` — phase 2 on the same tokens.
- Storybook / design-sync documentation site — optional follow-up.
- Pencil (.pen) token mirroring — optional follow-up once tokens land.
