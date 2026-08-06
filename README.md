# brand_creator_website

> Brand + creator collaboration platform. Next.js 15 (App Router) + Prisma + Postgres + Supabase Storage, deployed on Netlify.

The Next.js app is the only server surface — the FastAPI sidecar was decommissioned in Phase 5 of the infra simplification (see [legacy/ARCHIVE.md](legacy/ARCHIVE.md)). End-to-end tests run against the official Supabase CLI stack plus a containerised web app, so local development, CI, and AI agents all hit the same surfaces.

---

## Tech Stack

| Layer    | Tech                                                                         |
| -------- | ---------------------------------------------------------------------------- |
| Web      | Next.js 15 (App Router), React, TypeScript, Tailwind                         |
| ORM / DB | Prisma · Postgres                                                            |
| Storage  | Supabase Storage (same official stack in prod and e2e, via the Supabase CLI) |
| E2E      | Playwright · Supabase CLI · Docker Compose (web)                             |
| Hosting  | Netlify                                                                      |

---

## Quickstart (E2E stack)

The recommended local path. Boots the official Supabase CLI (real Postgres + Storage + Auth + REST, not a stub) plus Next.js in a container, runs migrations, seeds deterministic users. Requires Docker and will fetch the Supabase CLI via `npx` on first run.

```bash
git clone https://github.com/borderxais/brand_creator_website.git
cd brand_creator_website
npm install
npm run e2e:up
```

Then open the app:

| Surface          | URL                                                     |
| ---------------- | ------------------------------------------------------- |
| Web              | http://localhost:12001                                  |
| Login as brand   | http://localhost:12001/api/test/login?role=brand        |
| Login as creator | http://localhost:12001/api/test/login?role=creator      |
| Login as admin   | http://localhost:12001/api/test/login?role=admin        |
| Backend API      | http://localhost:8001                                   |
| API health       | http://localhost:8001/health                            |
| Supabase Studio  | http://localhost:54323                                  |
| Supabase API     | http://localhost:54321                                  |
| Postgres         | `postgres://postgres:postgres@localhost:54329/postgres` |

Seeded users (password `e2e-password` for all):

| Email              | Role         |
| ------------------ | ------------ |
| `brand@e2e.test`   | BRAND        |
| `creator@e2e.test` | CREATOR      |
| `admin@e2e.test`   | STUDIO_ADMIN |

> The gated `/api/test/login?role=…` shortcut sets a session cookie without a password. Active only when `E2E_EXPLORE=1` and `NODE_ENV !== 'production'` — never present in prod.

A live status dashboard for the running stack is at [docs/e2e-dashboard.html](docs/e2e-dashboard.html) (`open docs/e2e-dashboard.html`).

First boot pulls images and builds; expect 5–15 minutes. Subsequent boots are seconds.

---

## Repo Layout

```
src/            Next.js App Router (pages, components, API routes, lib)
legacy/         decommissioned FastAPI backend, kept read-only (see legacy/ARCHIVE.md)
prisma/         schema, migrations, seed scripts (incl. seed.e2e.ts)
e2e/            Playwright specs + fixtures (asBrand/asCreator/asAdmin)
supabase/       Supabase CLI config (supabase/config.toml)
docker/         compose.e2e.yml (web) + Dockerfile.web
scripts/        e2e/* harness scripts, harness/* pre-push checks
docs/           canonical reference; start at docs/README.md
tests/          unit / integration tests (vitest)
public/         static assets
pages/          legacy error fallbacks (do not add new routes here)
```

---

## E2E Harness Cheatsheet

| Command                        | What it does                                                               |
| ------------------------------ | -------------------------------------------------------------------------- |
| `npm run e2e:up`               | Boot compose stack, run migrations, seed. Idempotent.                      |
| `npm run e2e:explore`          | Boot only. Stack stays up for manual testing or MCP-driven agents.         |
| `npm run e2e:reset`            | Truncate DB and re-seed.                                                   |
| `npm run e2e:down`             | Stop and remove containers + volumes.                                      |
| `npm run e2e:agent`            | Run Playwright in agent mode; emits `.e2e/runs/latest/summary.md`.         |
| `npm run e2e:debug -- <runId>` | Print run summary plus the last 50 lines of api/web logs.                  |
| `npm run e2e:rebuild [svc]`    | Rebuild image(s) and restart in place. Omit `svc` for all, or `web`/`api`. |
| `npm run e2e`                  | Legacy fast path: dev `webServer`, no compose. Smoke only.                 |

Full operator guide: [docs/e2e.md](docs/e2e.md).

---

## Common Dev Commands

| Command                   | What it does                                                              |
| ------------------------- | ------------------------------------------------------------------------- |
| `npm run dev`             | Next.js dev server on `:3000` (no compose, bring own DB).                 |
| `npm run build`           | Production build.                                                         |
| `npm run lint`            | ESLint (`next/core-web-vitals` + unused-var enforcement).                 |
| `npm run typecheck`       | `tsc --noEmit`.                                                           |
| `npm run test:run`        | Vitest unit + integration suite.                                          |
| `npm run prisma:migrate`  | Apply pending Prisma migrations.                                          |
| `npm run prisma:seed`     | Seed local DB (`prisma/seed.js`).                                         |
| `npm run harness:prepush` | Full pre-push gate: typecheck + lint + drift + tests + backend ruff/mypy. |

---

## Documentation

Canonical reference lives in [docs/](docs/README.md). Recommended reading order:

1. [architecture.md](docs/architecture.md) — system overview
2. [frontend.md](docs/frontend.md) — Next.js app
3. [backend.md](docs/backend.md) — decommissioned FastAPI service (historical)
4. [database.md](docs/database.md) — Prisma + Postgres
5. [deployment.md](docs/deployment.md) — Netlify
6. [harness.md](docs/harness.md) — dev pipeline (read before first commit)
7. [e2e.md](docs/e2e.md) — E2E harness operator guide
8. [contributing.md](docs/contributing.md) — workflow

Design specs live under [docs/superpowers/specs/](docs/superpowers/specs/).

---

## Contributing

- Conventions and review expectations: [docs/contributing.md](docs/contributing.md)
- Repo guidelines and agent operating rules: [AGENTS.md](AGENTS.md)
- Conventional Commits required (`feat:`, `fix:`, `chore:`, `docs:`, …); subject lines ≤ 72 chars.
- Run `npm run harness:prepush` before pushing.
