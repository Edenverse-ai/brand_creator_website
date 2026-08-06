# Architecture

Brand + creator collaboration platform. Next.js 15 (App Router) front-end, Prisma ORM against PostgreSQL, Supabase Storage for media. Every server surface is a Next.js route — the FastAPI Python sidecar was decommissioned in Phase 5 of the infra simplification (see [legacy/ARCHIVE.md](../legacy/ARCHIVE.md)).

---

## High-Level Diagram

```
Browser ──HTTP──▶ Next.js (App Router) ─Prisma──▶ Postgres (Supabase)
                        │
                        └─────────────────▶ Supabase Storage (presigned, direct-to-browser)
```

- **Next.js** handles all page rendering (RSC + client components) and every API route under `src/app/api/`.
- **Prisma** is the ORM; it connects to a hosted PostgreSQL instance via `DATABASE_URL` / `DIRECT_URL`.
- **Supabase Storage** holds media. Uploads and downloads go browser↔storage directly via presigned URLs minted server-side; bytes do not transit a Node function.

---

## Request Flow

### Main web app

```
Browser → Next.js (App Router) → Prisma client → PostgreSQL
```

Server Components query the database directly via Prisma. Client Components call Next.js API routes (`src/app/api/**`) which in turn call Prisma.

### Media

```
Browser → Next.js API route (mints presigned URL) → Browser → Supabase Storage
```

No server surface proxies media bytes. TikTok publishing runs natively in `src/app/api/tiktok/**` plus a Netlify background function for the FILE_UPLOAD relay fallback.

---

## Repo Map

| Path                | Owns                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/app/`          | Next.js App Router — pages, layouts, API routes                                                          |
| `src/components/`   | Shared React components (`campaigns/`, `charts/`, `providers/`, `ui/`)                                   |
| `src/lib/`          | Utilities and singletons: `auth.ts`, `email.ts`, `prisma.ts`, `rate-limiter.ts`, `tokens.ts`, `utils.ts` |
| `src/styles/`       | Global CSS                                                                                               |
| `src/types/`        | Shared TypeScript types                                                                                  |
| `src/middleware.ts` | Next.js middleware (auth guards, redirects)                                                              |
| `pages/`            | Legacy error fallbacks only — do not add routes here                                                     |
| `prisma/`           | `schema.prisma`, migrations under `prisma/migrations/`, seed script `prisma/seed.js`                     |
| `legacy/`           | Decommissioned FastAPI backend + orphaned Python, kept read-only for reference — see `legacy/ARCHIVE.md` |
| `public/`           | Static assets served at `/`                                                                              |
| `plugins/`          | Local Netlify build plugins (added by later harness PRs)                                                 |
| `scripts/`          | Repo automation scripts (added by later harness PRs)                                                     |
| `docs/`             | Canonical reference — this directory                                                                     |

### Key config files

| File                   | Purpose                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `next.config.js`       | Next.js config; image domains, CORS headers, strict lint/TS flags |
| `tailwind.config.ts`   | Tailwind design tokens and content paths                          |
| `netlify.toml`         | Build command, publish dir, plugin registrations                  |
| `tsconfig.json`        | TypeScript compiler options (strict mode)                         |
| `prisma/schema.prisma` | Database schema — source of truth for models                      |

---

## Key Design Constraints

- **No GitHub Actions CI.** Quality gates will run locally (pre-commit / pre-push — not yet wired; see [harness.md](harness.md)) and on Netlify preview deploys.
- **Single Node toolchain, one `package.json`.** Python tooling was retired with the FastAPI backend; nothing under `legacy/` is built, linted, or deployed.
- **Netlify deploy.** Build command is `npx prisma generate && next build`. See [deployment.md](deployment.md).

---

## When to Update

Update this file when:

- A new top-level directory is added.
- The request flow changes (e.g., a new sidecar service, a new database).
- A major config file is added or removed.
