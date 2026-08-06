# Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Token-driven editorial design system (purple/white, light + violet-tinted dark) across public + marketplace surfaces, EN/zh, on a shadcn/ui foundation.

**Architecture:** Two-layer CSS custom properties (`variables.css` primitives → `themes.css` semantic, light `:root` + `[data-theme="dark"]`), Tailwind utilities mapped to semantic vars, `next-themes` switching, shadcn/ui components re-skinned via tokens. Hero components stay bespoke on the same tokens.

**Tech Stack:** Next 15.5 (app router), Tailwind 3.4, shadcn/ui (Radix), next-themes, next/font (Fraunces, Inter, Noto Serif SC, Noto Sans SC), Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-06-design-system-design.md` — token value tables live there; copy values exactly.

## Global Constraints

- Scope: public + marketing + marketplace pages only. Never touch `src/styles/portals.css`, `brandportal/`, `creatorportal/`, `storyclaw-admin/`.
- Purple is the single semantic accent; gradients only on hero/featured moments.
- Animate only transform/opacity/clip-path; gate motion with `prefers-reduced-motion`.
- Max 2 font families per locale; preload only critical display weight.
- Every semantic token must exist in BOTH theme blocks (contract test enforces).
- Token values in `themes.css` written as hex (contrast test does WCAG math on them).
- All commits conventional format, no attribution footer.
- Each page task migrates its `src/app/zh/` twin in the same task.

---

### Task 1: Token layer + Tailwind wiring + globals cleanup

**Files:**

- Create: `src/styles/variables.css`, `src/styles/themes.css` (currently 0 bytes — overwrite)
- Create: `tests/design/tokens.test.ts`, `tests/design/wcag.ts`
- Modify: `src/styles/globals.css`, `tailwind.config.ts`
- Delete: `tailwind.config.js`

**Interfaces:**

- Produces: CSS vars `--surface`, `--surface-raised`, `--surface-sunken`, `--ink`, `--ink-muted`, `--accent`, `--accent-strong`, `--accent-soft`, `--line`, `--ring`, `--success`, `--warning`, `--danger`, `--info`, `--gradient-hero`; Tailwind utilities `bg-surface`, `bg-surface-raised`, `bg-surface-sunken`, `text-ink`, `text-ink-muted`, `bg-accent`, `text-accent`, `border-line`, `ring-ring`; radius `rounded-card` (16px) / `rounded-control` (10px); shadows `shadow-raised`, `shadow-overlay`; durations `duration-fast|normal|slow`; easing `ease-out-expo`.

- [ ] **Step 1: Write failing token contract + contrast tests**

`tests/design/wcag.ts`:

```ts
export function relLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [l1, l2] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
```

`tests/design/tokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { contrast } from "./wcag";

const css = readFileSync("src/styles/themes.css", "utf8");

function block(selector: string): Record<string, string> {
  const m = css.match(new RegExp(`${selector.replace(/[[\]"=]/g, "\\$&")}\\s*{([^}]*)}`));
  if (!m) throw new Error(`missing block ${selector}`);
  return Object.fromEntries(
    [...m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()])
  );
}
const light = block(":root");
const dark = block('[data-theme="dark"]');

test("every semantic token defined in both themes", () => {
  expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
});

describe.each([
  ["light", light],
  ["dark", dark],
])("%s contrast", (_, t) => {
  test("ink on surface >= 7", () =>
    expect(contrast(t["ink"], t["surface"])).toBeGreaterThanOrEqual(7));
  test("ink-muted on surface >= 4.5", () =>
    expect(contrast(t["ink-muted"], t["surface"])).toBeGreaterThanOrEqual(4.5));
  test("accent-contrast on accent >= 4.5 (button text)", () =>
    expect(contrast(t["accent-contrast"], t["accent"])).toBeGreaterThanOrEqual(4.5));
});
```

- [ ] **Step 2: Run — verify fails** — `npm run test:run -- tests/design` → FAIL (`missing block :root`, empty file).

- [ ] **Step 3: Write `themes.css` + `variables.css`**

`src/styles/themes.css` — copy hex values from spec table verbatim; structure:

```css
:root {
  --surface: #fcfcfd;
  --surface-raised: #ffffff;
  --surface-sunken: #f4f2f9;
  --ink: #17151f;
  --ink-muted: #565264;
  --accent: #7c3aed;
  --accent-strong: #6d28d9;
  --accent-soft: #f1ebfd;
  --accent-contrast: #ffffff;
  --line: #ddd9e8;
  --ring: #7c3aed;
  --success: #15803d;
  --warning: #b45309;
  --danger: #b91c1c;
  --info: #1d4ed8;
  --gradient-hero: linear-gradient(135deg, #7c3aed, #4f46e5);
  --shadow-raised: 0 1px 2px rgb(23 21 31 / 0.06), 0 8px 24px rgb(23 21 31 / 0.08);
  --shadow-overlay: 0 4px 12px rgb(23 21 31 / 0.12), 0 24px 60px rgb(23 21 31 / 0.18);
  --glow-accent: 0 0 0 1px var(--line), 0 8px 24px rgb(124 58 237 / 0.1);
}
[data-theme="dark"] {
  --surface: #131020;
  --surface-raised: #1b1730;
  --surface-sunken: #241e3e;
  --ink: #edeaf6;
  --ink-muted: #9c96b0;
  --accent: #a78bfa;
  --accent-strong: #8b5cf6;
  --accent-soft: #2a2350;
  --accent-contrast: #131020;
  --line: #35304e;
  --ring: #a78bfa;
  --success: #4ade80;
  --warning: #fbbf24;
  --danger: #f87171;
  --info: #93c5fd;
  --gradient-hero: linear-gradient(135deg, #8b5cf6, #6366f1);
  --shadow-raised: 0 0 0 1px #35304e;
  --shadow-overlay: 0 0 0 1px #35304e, 0 24px 60px rgb(0 0 0 / 0.5);
  --glow-accent: 0 0 0 1px #35304e, 0 8px 32px rgb(139 92 246 / 0.35);
}
```

`src/styles/variables.css` (theme-independent primitives):

```css
:root {
  --font-display: var(--font-fraunces);
  --font-body: var(--font-inter);
  --text-hero: clamp(3rem, 1rem + 7vw, 7rem);
  --text-h1: clamp(2.25rem, 1.5rem + 2.5vw, 3.5rem);
  --text-h2: clamp(1.75rem, 1.35rem + 1.4vw, 2.5rem);
  --text-h3: clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem);
  --text-base: clamp(1rem, 0.95rem + 0.2vw, 1.0625rem);
  --text-small: 0.875rem;
  --text-micro: 0.6875rem;
  --leading-display: 1.05;
  --leading-body: 1.6;
  --tracking-display: -0.015em;
  --tracking-micro: 0.18em;
  --radius-card: 16px;
  --radius-control: 10px;
  --space-section: clamp(4rem, 3rem + 5vw, 9rem);
  --dur-fast: 150ms;
  --dur-normal: 300ms;
  --dur-slow: 600ms;
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
}
```

- [ ] **Step 4: Rewrite `globals.css`** — keep `@import "./portals.css";`, tailwind directives, hide-scrollbar utility. DELETE: `--foreground-rgb`/`--background-*` vars, the `@media (prefers-color-scheme: dark)` block, `body` color rules, `input`/`textarea`/`span` color overrides. ADD:

```css
@import "./variables.css";
@import "./themes.css";

body {
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-body), ui-sans-serif, system-ui, sans-serif;
}
```

- [ ] **Step 5: Rewrite `tailwind.config.ts` theme + delete `tailwind.config.js`**

```ts
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "var(--surface)",
          raised: "var(--surface-raised)",
          sunken: "var(--surface-sunken)",
        },
        ink: { DEFAULT: "var(--ink)", muted: "var(--ink-muted)" },
        accent: {
          DEFAULT: "var(--accent)",
          strong: "var(--accent-strong)",
          soft: "var(--accent-soft)",
          contrast: "var(--accent-contrast)",
        },
        line: "var(--line)",
        ring: "var(--ring)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        info: "var(--info)",
        // temporary aliases for unmigrated pages; removed in Task 11
        background: "var(--surface)",
        foreground: "var(--ink)",
      },
      borderRadius: { card: "var(--radius-card)", control: "var(--radius-control)" },
      boxShadow: {
        raised: "var(--shadow-raised)",
        overlay: "var(--shadow-overlay)",
        glow: "var(--glow-accent)",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui"],
      },
      fontSize: {
        hero: [
          "var(--text-hero)",
          { lineHeight: "var(--leading-display)", letterSpacing: "var(--tracking-display)" },
        ],
        h1: [
          "var(--text-h1)",
          { lineHeight: "var(--leading-display)", letterSpacing: "var(--tracking-display)" },
        ],
        h2: ["var(--text-h2)", { lineHeight: "1.15" }],
        h3: ["var(--text-h3)", { lineHeight: "1.25" }],
        micro: ["var(--text-micro)", { letterSpacing: "var(--tracking-micro)" }],
      },
      transitionDuration: { fast: "150ms", normal: "300ms", slow: "600ms" },
      transitionTimingFunction: { "out-expo": "var(--ease-out-expo)" },
      backgroundImage: { "gradient-hero": "var(--gradient-hero)" },
    },
  },
  plugins: [],
} satisfies Config;
```

Also `rm tailwind.config.js`. Note: `@tailwindcss/line-clamp` plugin removed — built into Tailwind 3.4; `line-clamp-*` classes keep working. Leave the npm package uninstall to Task 11 cleanup.

- [ ] **Step 6: Run tests** — `npm run test:run -- tests/design` → PASS. Then `npm run build` → succeeds.
- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(design): token layer, themed Tailwind mapping, globals cleanup"`

---

### Task 2: Fonts (EN + zh layouts)

**Files:**

- Modify: `src/app/layout.tsx`
- Create: `src/app/zh/layout.tsx`

**Interfaces:**

- Consumes: `--font-display`/`--font-body` indirection from Task 1 (`variables.css` maps them to `--font-fraunces`/`--font-inter`).
- Produces: root `<html>` carries `inter.variable fraunces.variable` classes; zh subtree wrapper overrides `--font-fraunces`/`--font-inter` with CJK fonts, so all components inherit correct fonts with zero locale awareness.

- [ ] **Step 1: Root layout fonts** — in `src/app/layout.tsx` replace `const inter = Inter({ subsets: ["latin"] })` with:

```tsx
import { Fraunces, Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});
```

`<html lang="en" className={`${inter.variable} ${fraunces.variable}`} suppressHydrationWarning>` and `<body className="font-body">`. (`suppressHydrationWarning` needed for next-themes in Task 3.)

- [ ] **Step 2: zh layout** — create `src/app/zh/layout.tsx`:

```tsx
import { Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";

const notoSans = Noto_Sans_SC({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-noto-sans",
  display: "swap",
  preload: false,
});
const notoSerif = Noto_Serif_SC({
  weight: ["600"],
  subsets: ["latin"],
  variable: "--font-noto-serif",
  display: "swap",
});

export default function ZhLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      lang="zh-CN"
      className={`${notoSans.variable} ${notoSerif.variable} zh-typography`}
      style={{
        ["--font-fraunces" as string]: "var(--font-noto-serif)",
        ["--font-inter" as string]: "var(--font-noto-sans)",
      }}
    >
      {children}
    </div>
  );
}
```

Add to `variables.css`: `.zh-typography { --leading-display: 1.25; --tracking-display: 0; --tracking-micro: 0.08em; }`

- [ ] **Step 3: Verify** — `npm run build` passes; `npm run dev`, check `/` serif headline vs `/zh` CJK serif via browser preview; confirm only Fraunces/Inter/Noto-Serif-critical weights preloaded in `<head>` (no Noto Sans preload).
- [ ] **Step 4: Commit** — `git commit -m "feat(design): Fraunces/Inter + zh CJK font layer via font-var indirection"`

---

### Task 3: Theme switching (next-themes + toggle)

**Files:**

- Modify: `src/app/providers.tsx`, `src/app/layout.tsx`, `src/components/ui/Navigation.tsx`
- Create: `src/components/ui/ThemeToggle.tsx`, `tests/components/ThemeToggle.test.tsx`

**Interfaces:**

- Produces: `<ThemeToggle />` client component (no props); app wrapped in `ThemeProvider attribute="data-theme"`. Pages under portal routes NOT affected yet (they keep light because portal layouts are untouched and tokens only restyle migrated pages).

- [ ] **Step 1: Install** — `npm i next-themes`
- [ ] **Step 2: Failing test** — `tests/components/ThemeToggle.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { describe, expect, test } from "vitest";
import ThemeToggle from "@/components/ui/ThemeToggle";

describe("ThemeToggle", () => {
  test("cycles theme and sets data-theme attribute", async () => {
    render(
      <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem={false}>
        <ThemeToggle />
      </ThemeProvider>
    );
    const btn = await screen.findByRole("button", { name: /switch to dark theme/i });
    await userEvent.click(btn);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    await userEvent.click(screen.getByRole("button", { name: /switch to light theme/i }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
```

Run `npm run test:run -- tests/components/ThemeToggle` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/components/ui/ThemeToggle.tsx`:

```tsx
"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="inline-block h-9 w-9" aria-hidden />;
  const next = resolvedTheme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      onClick={() => setTheme(next)}
      className="inline-flex h-9 w-9 items-center justify-center rounded-control border border-line text-ink transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {resolvedTheme === "dark" ? "☾" : "☀"}
    </button>
  );
}
```

(Swap glyphs for lucide `Sun`/`Moon` icons after Task 4 installs lucide-react.)

- [ ] **Step 4: Wire provider** — `src/app/providers.tsx`:

```tsx
"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
        {children}
      </ThemeProvider>
    </SessionProvider>
  );
}
```

Ensure `layout.tsx` uses this `Providers` wrapper (it currently imports a separate `SessionProvider` component — consolidate). Add `<ThemeToggle />` to `Navigation.tsx` desktop + mobile menus.

- [ ] **Step 5: Test passes** — `npm run test:run -- tests/components/ThemeToggle` → PASS; build passes.
- [ ] **Step 6: Commit** — `git commit -m "feat(design): next-themes dual theme + ThemeToggle in navigation"`

---

### Task 4: shadcn/ui foundation + re-skin

**Files:**

- Create: `components.json`, `src/lib/utils.ts` (cn helper; if a `cn` already exists keep that path)
- Create/overwrite in `src/components/ui/`: `button.tsx`, `card.tsx`, `input.tsx`, `textarea.tsx`, `dialog.tsx`, `popover.tsx`, `tabs.tsx`, `calendar.tsx`, `badge.tsx`, `skeleton.tsx`, `select.tsx`, `dropdown-menu.tsx`, `sheet.tsx`, `tooltip.tsx`
- Delete after consumers migrate (Task 11): `Button.tsx`, `Card.tsx`, `Input.tsx`, `Textarea.tsx`, `Dialog.tsx`, `Popover.tsx`, `Calendar.tsx`, `Loading.tsx`
- Test: `tests/components/button.test.tsx`

**Interfaces:**

- Produces: shadcn exports (`Button` with `variant: default|secondary|ghost|outline|destructive|link`, `size: sm|default|lg|icon`; `Card`+`CardHeader/Title/Content/Footer`; etc.), all styled by semantic tokens. Old PascalCase files coexist until each consumer migrates (case-differing filenames — safe on git, watch imports).

- [ ] **Step 1: Init** — `npx shadcn@latest init` (style: default, base color: neutral, CSS variables: yes → point to existing `src/styles/globals.css`, alias `@/components`, `@/lib/utils`). Review generated diff: REJECT any overwrite of our `:root`/`[data-theme]` blocks — shadcn wants its own `--background/--primary` vars; instead append a mapping block to `themes.css`:

```css
:root,
[data-theme="dark"] {
  --background: var(--surface);
  --foreground: var(--ink);
  --card: var(--surface-raised);
  --card-foreground: var(--ink);
  --popover: var(--surface-raised);
  --popover-foreground: var(--ink);
  --primary: var(--accent);
  --primary-foreground: var(--accent-contrast);
  --secondary: var(--surface-sunken);
  --secondary-foreground: var(--ink);
  --muted: var(--surface-sunken);
  --muted-foreground: var(--ink-muted);
  --accent-ui: var(--accent-soft);
  --destructive: var(--danger);
  --border: var(--line);
  --input: var(--line);
  --radius: var(--radius-control);
}
```

and add shadcn's expected `hsl()`-free color entries to `tailwind.config.ts` (`border: "var(--border)"`, `input: "var(--input)"`, `card: …`, `popover: …`, `primary: …`, `secondary: …`, `muted: …`, `destructive: …` — plain `var()`, not `hsl(var())`; adjust generated components accordingly).

- [ ] **Step 2: Add components** — `npx shadcn@latest add button card input textarea dialog popover tabs calendar badge skeleton select dropdown-menu sheet tooltip`. Note collision: existing `tabs.tsx` is overwritten (it is already shadcn-style — verify diff), PascalCase files remain separate.
- [ ] **Step 3: Re-skin pass** — in generated files: buttons/controls `rounded-control`, cards `rounded-card shadow-raised`, dialogs/popovers `shadow-overlay`, CardTitle `font-display`, focus rings `focus-visible:ring-ring`. Pill CTA: add `variant: "pill"` to buttonVariants → `rounded-full bg-accent text-accent-contrast hover:bg-accent-strong`.
- [ ] **Step 4: Failing test → pass** — `tests/components/button.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Button } from "@/components/ui/button";

test("pill variant renders accent pill", () => {
  render(<Button variant="pill">Browse creators</Button>);
  const b = screen.getByRole("button", { name: "Browse creators" });
  expect(b.className).toContain("rounded-full");
  expect(b.className).toContain("bg-accent");
});
```

Run → PASS. `npm run build` passes.

- [ ] **Step 5: Commit** — `git commit -m "feat(design): shadcn foundation re-skinned on semantic tokens"`

---

### Task 5: Shared shell — Navigation + Footer

**Files:**

- Modify: `src/components/ui/Navigation.tsx`, `src/app/layout.tsx`
- Create: `src/components/ui/Footer.tsx`

**Interfaces:**

- Produces: `<Footer />` (no props; reads same nav link lists currently inlined in `layout.tsx`). Navigation restyled tokens-only, same props/behavior.

- [ ] **Step 1: Extract footer** — move the inline `<footer>` JSX from `layout.tsx` into `Footer.tsx`; restyle: `bg-surface-sunken border-t border-line`, headings `text-micro font-medium uppercase tracking-micro text-ink-muted`, links `text-ink-muted hover:text-ink transition-colors duration-fast`.
- [ ] **Step 2: Navigation restyle** — mapping (apply throughout file): `bg-white→bg-surface/80 backdrop-blur border-b border-line`, `text-gray-*→text-ink|text-ink-muted`, `text-purple-600|bg-purple-*→text-accent|bg-accent-soft`, CTA button → `<Button variant="pill" size="sm">`, active link `text-accent` + `after:` underline bar `after:bg-accent`. Keep `<ThemeToggle />` from Task 3.
- [ ] **Step 3: Verify** — dev server: check EN + zh, mobile menu, both themes, keyboard focus rings. `npm run test:run` green.
- [ ] **Step 4: Commit** — `git commit -m "refactor(design): navigation + extracted footer on tokens"`

---

### Task 6: Home page (EN + zh)

**Files:**

- Modify: `src/app/page.tsx`, `src/app/zh/page.tsx`, `src/components/home/DigitalHumanSection.tsx`
- Create: `src/components/home/HeroSection.tsx`, `src/styles/animations.css` (currently 0 bytes)

**Interfaces:**

- Consumes: tokens, `Button`, `Card`, fonts.
- Produces: `<HeroSection locale="en" | "zh">` (headline/copy/CTA strings passed as props from each page — pages own copy, component owns layout); `animations.css` classes `.reveal-up` (IntersectionObserver target) and `.hero-clip-reveal`.

- [ ] **Step 1: animations.css**

```css
.reveal-up {
  opacity: 0;
  transform: translateY(16px);
  transition:
    opacity var(--dur-normal) var(--ease-out-expo),
    transform var(--dur-normal) var(--ease-out-expo);
}
.reveal-up.is-visible {
  opacity: 1;
  transform: none;
}
.hero-clip-reveal {
  clip-path: inset(0 0 100% 0);
  animation: hero-clip var(--dur-slow) var(--ease-out-expo) forwards;
}
@keyframes hero-clip {
  to {
    clip-path: inset(0 0 0% 0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .reveal-up,
  .hero-clip-reveal {
    opacity: 1;
    transform: none;
    clip-path: none;
    animation: none;
    transition: none;
  }
}
```

Import from `globals.css`. Create `src/hooks/useRevealOnScroll.ts`: IntersectionObserver adding `.is-visible` once, threshold 0.15.

- [ ] **Step 2: HeroSection** — editorial layout: `text-micro uppercase tracking-micro text-accent` kicker, `font-display text-hero hero-clip-reveal` headline, grain overlay (`before:` inline-SVG noise at 4% opacity), gradient reserved to CTA panel / headline accent span (`bg-gradient-hero bg-clip-text text-transparent` on one word max). CTAs: pill Button + outline Button.
- [ ] **Step 3: Migrate `page.tsx` + `zh/page.tsx`** — replace hero markup with `<HeroSection …copy/>`; remaining sections: gray/purple utility classes → token utilities (same mapping table as Task 5), cards → `Card` + `shadow-raised rounded-card`, section wrappers `py-[--space-section]` with `.reveal-up`. `DigitalHumanSection`: token colors only, keep behavior.
- [ ] **Step 4: Verify** — both locales, both themes, 320/768/1440 widths in preview; reduced-motion check (devtools emulation); `npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "feat(design): editorial home hero + token migration (en/zh)"`

---

### Task 7: find-creators (EN + zh)

**Files:**

- Modify: `src/app/find-creators/page.tsx`, `src/app/zh/find-creators/page.tsx`, `src/components/ui/CreatorCard.tsx`, `src/components/ui/SearchBar.tsx`, `src/components/ui/CategorySelector.tsx`

**Interfaces:**

- Consumes: `Input`, `Select`, `Badge`, `Skeleton`, tokens. Component props unchanged — restyle only.

- [ ] **Step 1: SearchBar** — rebuild on shadcn `Input` (keep debounce/URL-state behavior identical): `rounded-control border-line bg-surface-raised focus-visible:ring-ring`, search icon `text-ink-muted`.
- [ ] **Step 2: CategorySelector** — rebuild on shadcn `Select`/`DropdownMenu` primitives; active category chip `bg-accent-soft text-accent`; inactive `border-line text-ink-muted`.
- [ ] **Step 3: CreatorCard (hero component)** — bespoke redesign: `rounded-card bg-surface-raised shadow-raised overflow-hidden`, hover `hover:-translate-y-0.5 hover:shadow-glow transition duration-fast ease-out-expo`, name `font-display text-h3`, category kicker `text-micro uppercase tracking-micro text-accent`, platform badges keep platform brand colors via new `--platform-tiktok/--platform-youtube/--platform-red` tokens added to `themes.css` (same values both themes; also add to the contract-test expectations automatically since test derives from file).
- [ ] **Step 4: Grid pages** — both locales: filters bar sticky `bg-surface/80 backdrop-blur border-b border-line`, grid gap rhythm, loading state → `Skeleton` cards, empty state `text-ink-muted` + serif heading.
- [ ] **Step 5: Verify + commit** — dev check (locales × themes × 320/768/1440), tests green, `git commit -m "feat(design): find-creators marketplace on tokens (en/zh)"`

---

### Task 8: Creator profile (EN + zh)

**Files:**

- Modify: `src/app/creator/[id]/page.tsx`, `src/app/zh/creator/[id]/page.tsx`, `src/components/ui/PortfolioGallery.tsx`, `src/components/ui/Stats.tsx`, `src/components/ui/SocialLinks.tsx`, `src/components/ui/PlatformSection.tsx`

**Interfaces:**

- Consumes: `Tabs`, `Dialog` (lightbox), `Badge`, tokens. Props unchanged.

- [ ] **Step 1: Profile header** — editorial: serif `font-display text-h1` name, kicker category, stats row using `Stats` restyled (`font-display` numerals `text-h2`, labels `text-micro uppercase text-ink-muted`).
- [ ] **Step 2: PortfolioGallery (hero component)** — masonry-ish grid `rounded-card overflow-hidden`, hover scale `hover:scale-[1.02] transition duration-normal ease-out-expo`, lightbox → shadcn `Dialog` with `shadow-overlay`.
- [ ] **Step 3: PlatformSection + SocialLinks** — token mapping; platform colors from `--platform-*` tokens.
- [ ] **Step 4: Verify + commit** — both locales/themes/viewports; `git commit -m "feat(design): creator profile + portfolio gallery on tokens (en/zh)"`

---

### Task 9: Membership (EN + zh)

**Files:**

- Modify: `src/app/membership/` page(s), `src/app/zh/membership/` page(s), `src/components/membership/MembershipContent.tsx`

**Interfaces:**

- Consumes: `Card`, `Badge`, pill `Button`, tokens. `src/lib/membership.ts` logic untouched.

- [ ] **Step 1: Tier cards** — editorial pricing: featured tier `border-accent shadow-glow` + `bg-gradient-hero` header band (allowed: featured moment), serif tier names, `text-h1 font-display` prices, check-list rows `text-ink-muted` with `text-accent` check icons.
- [ ] **Step 2: Token mapping across page** — same mapping table; CTA pill buttons.
- [ ] **Step 3: Verify + commit** — locales/themes/viewports; `git commit -m "feat(design): membership tiers on tokens (en/zh)"`

---

### Task 10: Visual regression + a11y suite

**Files:**

- Create: `e2e/visual/design-system.spec.ts`
- Modify: `playwright.config.ts` (only if snapshot settings absent: add `expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } }`)

**Interfaces:**

- Consumes: running app (existing e2e setup/fixtures in `e2e/_setup`).

- [ ] **Step 1: Write suite**

```ts
import { expect, test } from "@playwright/test";

const pages = [
  { name: "home", en: "/", zh: "/zh" },
  { name: "find-creators", en: "/find-creators", zh: "/zh/find-creators" },
  { name: "membership", en: "/membership", zh: "/zh/membership" },
];
const viewports = [320, 768, 1024, 1440];
const themes = ["light", "dark"] as const;

for (const p of pages)
  for (const locale of ["en", "zh"] as const)
    for (const theme of themes)
      for (const width of viewports)
        test(`${p.name} ${locale} ${theme} ${width}`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
          await page.goto(p[locale]);
          await expect(page.locator("h1").first()).toBeVisible();
          await expect(page).toHaveScreenshot(`${p.name}-${locale}-${theme}-${width}.png`, {
            fullPage: true,
          });
        });

test("no horizontal overflow at 320", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow).toBe(false);
});

test("keyboard: theme toggle reachable and operable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /switch to (dark|light) theme/i }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", /dark|light/);
});
```

(Creator profile page needs a seeded creator id — reuse existing e2e fixtures from `e2e/fixtures`; add `creator` page entry with that id if fixture exists, else leave the three public pages.)

- [ ] **Step 2: Baseline + run** — `npx playwright test e2e/visual --update-snapshots` then plain run → PASS.
- [ ] **Step 3: Commit** — `git commit -m "test(design): visual regression + a11y/keyboard suite"` (commit baseline PNGs).

---

### Task 11: Cleanup + performance verification

**Files:**

- Delete: `src/components/ui/Button.tsx`, `Card.tsx`, `Input.tsx`, `Textarea.tsx`, `Dialog.tsx`, `Popover.tsx`, `Calendar.tsx`, `Loading.tsx` (after `grep -r` confirms no remaining imports in migrated scope; portal pages still importing them keep them — if so, move file to `src/components/legacy/` and update portal imports instead of deleting)
- Modify: `tailwind.config.ts` (drop `background`/`foreground` aliases if unused), `package.json`

**Interfaces:** none new.

- [ ] **Step 1: Import sweep** — `grep -rn "components/ui/\(Button\|Card\|Input\|Textarea\|Dialog\|Popover\|Calendar\|Loading\)" src/` → migrate or legacy-move each hit.
- [ ] **Step 2: Uninstall** — `npm rm @tailwindcss/line-clamp` (verify no `plugins` reference remains).
- [ ] **Step 3: Full gates** — `npm run test:run` + `npx playwright test e2e/visual` + `npm run build` all green.
- [ ] **Step 4: Lighthouse** — against `npm run dev` (or `next start` of prod build) on `/` and `/find-creators`: LCP < 2.5s, CLS < 0.1, no render-blocking fonts (swap), record scores in PR description.
- [ ] **Step 5: Commit** — `git commit -m "chore(design): remove legacy ui components + perf verification"`

---

## Self-review notes

- Spec coverage: tokens (T1), fonts/zh (T2), theming (T3), shadcn (T4), shell (T5), home (T6), find-creators (T7), profile (T8), membership (T9), tests (T10), cleanup/perf (T11). Spec's "how-it-works/join pages" are inside "public marketing" scope but low-risk — they inherit shell + tokens automatically; explicit migration folded into Task 11 import sweep if they reference legacy components.
- Platform tokens introduced in T7 satisfy spec's platform-color rule.
- Type consistency: token names, `variant="pill"`, `--font-fraunces`/`--font-inter` indirection used consistently across tasks.
