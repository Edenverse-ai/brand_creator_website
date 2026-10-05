# E2E Harness — Operator Guide

**Source of truth:** [`docs/superpowers/specs/2026-05-07-agentic-e2e-harness-design.md`](superpowers/specs/2026-05-07-agentic-e2e-harness-design.md)

## Quick reference

| Command                        | What it does                                                        |
| ------------------------------ | ------------------------------------------------------------------- |
| `npm run e2e:up`               | Boots compose stack, runs migrate + seed. Idempotent.               |
| `npm run e2e:down`             | Stops + removes containers and volumes.                             |
| `npm run e2e:reset`            | Truncates DB and re-seeds.                                          |
| `npm run e2e:agent`            | Runs Playwright in agent mode; emits `.e2e/runs/latest/summary.md`. |
| `npm run e2e:explore`          | Boots stack only; prints MCP connect info.                          |
| `npm run e2e:debug -- <runId>` | Prints summary + last 50 lines of api/web logs.                     |
| `npm run e2e:rebuild [svc]`    | Rebuild image(s) and restart. Omit `svc` for all; or `web`/`api`.   |
| `npm run e2e`                  | Legacy fast path: dev `webServer`, no compose. Smoke only.          |

## Agent TDD loop

1. Read feature spec under `docs/superpowers/specs/`.
2. Write failing test at `e2e/<surface>/<feat>.spec.ts` using `import { test, expect } from "../_helpers/fixtures"` and the `asBrand|asCreator|asAdmin` fixture.
3. Run `npm run e2e:agent -- --grep "<test title>"`.
4. Read `.e2e/runs/latest/summary.md`.
5. Edit `src/` until green.
6. Commit test + impl.

## DB state

`prisma/seed.e2e.ts` defines deterministic users with stable IDs:

| Email              | ID                 | Role         |
| ------------------ | ------------------ | ------------ |
| `brand@e2e.test`   | `e2e-user-brand`   | BRAND        |
| `creator@e2e.test` | `e2e-user-creator` | CREATOR      |
| `admin@e2e.test`   | `e2e-user-admin`   | STUDIO_ADMIN |

Plus a deterministic campaign and sample (UUIDs in seed.e2e.ts).

`globalSetup` truncates + reseeds at the start of every agent run.

## Auth

`.e2e/auth/<role>.json` holds a Playwright `storageState` per role, built fresh per run via the gated `/api/test/login?role=<role>` shortcut. Gate: `E2E_EXPLORE=1` AND `NODE_ENV !== 'production'`. Never present in prod.

## AI video generation (mock provider)

E2E never reaches the real, billable video API: the provider factory refuses live calls whenever `E2E_EXPLORE=1` or `E2E_AGENT=1`, even if live credentials are configured. The mock:

- finishes about 10 seconds after submission, returning an embedded sample clip;
- fails (still after about 10 s) when the prompt contains `[mock-fail]`;
- is stateless, because the task id encodes its own outcome, so it works across serverless instances.

Specs needing state the UI can't create cheaply (e.g. a creator already at the daily cap) use `e2e/_helpers/db.ts`, which is limited to the local test database. The success path needs the `aivideogenerated` bucket: run `node --env-file=.env.e2e-dev scripts/studio-create-buckets.js` once against the local stack.

## Files & dirs

- `.e2e/auth/` — gitignored storageState
- `.e2e/runs/<runId>/` — gitignored: `report.json`, `summary.md`, `trace-*.zip`, `console.log`
- `.e2e/runs/latest` — symlink to most recent run

`agent.ts` keeps the last 10 runs and prunes older.

## Known limitations

- First-time stack boot takes 5–15 minutes (Supabase CLI + api/web image pulls and builds).
- `api` and `web` run with `network_mode: host` in `docker/compose.e2e.yml` (not bridge + port mapping) — required so presigned Supabase Storage URLs minted server-side resolve identically for the container and the host-side Playwright browser. Supported on Linux (CI) and OrbStack.
- **Windows without WSL:** the `web` container can't use host networking. Run the app on the host instead, against the same local Supabase stack, then run Playwright in agent mode. The global setup still resets and seeds the local database, so re-run `npm run dev:seed` afterwards if you use the dev accounts.
  ```bash
  # Git Bash; local Supabase already running (npm run dev:infra)
  NEXTAUTH_URL=http://localhost:12001 npx dotenv -e .env.e2e-dev -- npx next dev -p 12001 &
  E2E_AGENT=1 npx playwright test e2e/creator/ai-video-generate.spec.ts
  ```
