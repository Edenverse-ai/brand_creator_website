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

### AI video generation

```
Browser → POST /api/ai-videos/tasks → video provider (create, billable)
Browser → GET  /api/ai-videos/tasks/:id (every 10 s) → video provider (status)
                    └─ on success → ai-video-finalize-background (Netlify, 15 min)
                                      → copies the video into Supabase Storage (aivideogenerated)
                                      → AiVideo row (My Videos)
Netlify schedule (every 10 min) → ai-video-sync-scheduled → same status/finalize path
```

Generation goes through the AI Open Platform video API (Seedance). The client in `src/lib/seedance/` is **mock by default**. It only calls the real, billable API when `SEEDANCE_LIVE=1`, `VIDEO_API_KEY` and `VIDEO_API_BASE_URL` are all set, and never under test or E2E. The task lifecycle (`src/lib/ai-video-generation.ts`) makes at most one billable create call per task and copies each finished video exactly once. See [the design spec](superpowers/specs/2026-10-05-seedance-video-generation-design.md).

Code that runs inside Netlify functions must not import `server-only`: outside Next.js that package throws on import. Shared helpers therefore live in `src/lib/supabase-admin-core.ts`; `src/lib/supabase-admin.ts` adds the marker for Next.js code.

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

- **Quality gates.** Pre-commit and pre-push hooks run locally (see [harness.md](harness.md)). GitHub Actions (`.github/workflows/e2e.yml`) runs the E2E smoke suite and the AI video specs (mock provider) on every PR to `main`. Netlify preview deploys run their own smoke plugin.
- **Single Node toolchain, one `package.json`.** Python tooling was retired with the FastAPI backend; nothing under `legacy/` is built, linted, or deployed.
- **Netlify deploy.** Build command is `npx prisma generate && next build`. See [deployment.md](deployment.md).

---

## When to Update

Update this file when:

- A new top-level directory is added.
- The request flow changes (e.g., a new sidecar service, a new database).
- A major config file is added or removed.
