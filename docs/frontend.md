# Frontend

Next.js 15 with the App Router, TypeScript (strict), and Tailwind CSS.

See [architecture.md](architecture.md) for the broader system context.

---

## App Router Layout (`src/app/`)

The entire Next.js application lives under `src/app/`. Each folder is a route segment unless prefixed with `_` or wrapped in `()`.

### Primary Route Groups

The following route groups are the core portals of the platform:

| Segment          | Purpose                                                   |
| ---------------- | --------------------------------------------------------- |
| `brandportal/`   | Brand-side portal — campaign management, creator search   |
| `creatorportal/` | Creator-side portal — profile, campaign applications      |
| `find-creators/` | Public creator discovery page                             |
| `login/`         | Authentication entry point                                |
| `api/`           | Next.js API routes — every server surface, no proxy layer |

### Additional Routes

Other top-level segments present in `src/app/`: `about/`, `advertiserservice/`, `avocadata/`, `campaigns/`, `career/`, `contact/`, `creator/`, `entertainment-live/`, `frontend/`, `how-it-works/`, `join-brand/`, `join-creator/`, `pages/`, `pear/`, `private-community/`, `privacy/`, `success/`, `terms/`, `zh/`.

Root files: `layout.tsx` (root layout), `page.tsx` (home page), `not-found.tsx`, `providers.tsx`, `favicon.ico`.

---

## Shared Code

### `src/components/`

Shared React components, grouped by concern:

| Subfolder    | Contents                                       |
| ------------ | ---------------------------------------------- |
| `campaigns/` | Campaign-related UI components                 |
| `charts/`    | Data visualization components                  |
| `providers/` | React context providers (session, theme, etc.) |
| `ui/`        | General-purpose UI primitives                  |

### `src/lib/`

Utilities and singletons shared across the app:

| File              | Purpose                            |
| ----------------- | ---------------------------------- |
| `auth.ts`         | NextAuth configuration and helpers |
| `email.ts`        | Email sending utilities            |
| `prisma.ts`       | Prisma client singleton            |
| `rate-limiter.ts` | API rate limiting logic            |
| `tokens.ts`       | Token generation / validation      |
| `utils.ts`        | General-purpose helpers            |

### `src/styles/`

Global CSS. Tailwind base styles are imported here.

### `src/types/`

Shared TypeScript type definitions used across `src/`.

### `src/middleware.ts`

Next.js middleware for auth guards and route-level redirects. Runs at the edge before any page is rendered.

---

## Tailwind

Config: `tailwind.config.ts`. Extend design tokens — colors, spacing, typography — in the `theme.extend` section rather than writing ad-hoc CSS. Tailwind plugins in use: `@tailwindcss/line-clamp`.

---

## Naming Conventions

These are enforced by [`AGENTS.md`](../AGENTS.md) and the ESLint config:

| Thing              | Convention    | Example                                 |
| ------------------ | ------------- | --------------------------------------- |
| React components   | PascalCase    | `BrandPortalLayout.tsx`                 |
| Helper functions   | camelCase     | `formatCurrency`                        |
| Route folders      | kebab-case    | `find-creators/`                        |
| Import alias       | `@/` → `src/` | `import { prisma } from '@/lib/prisma'` |
| Unused identifiers | `_` prefix    | `_unusedParam`                          |

TypeScript strict mode is enabled. All new files must be `.ts` or `.tsx`.

---

## Development Commands

```bash
npm run dev      # start Next.js dev server on port 3000
npm run build    # production build
npm run lint     # ESLint (next/core-web-vitals ruleset)
```

See [harness.md](harness.md) for the full pre-commit / pre-push hook chain (not yet wired; lands in PRs 3–4).

---

## When to Update

Update this file when:

- A new significant route group or top-level segment is added to `src/app/`.
- A new shared directory is added under `src/`.
- Naming conventions change.
- A new Tailwind plugin or major token pattern is introduced.
