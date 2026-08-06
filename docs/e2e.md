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

## Files & dirs

- `.e2e/auth/` — gitignored storageState
- `.e2e/runs/<runId>/` — gitignored: `report.json`, `summary.md`, `trace-*.zip`, `console.log`
- `.e2e/runs/latest` — symlink to most recent run

`agent.ts` keeps the last 10 runs and prunes older.

## Known limitations

- First-time stack boot takes 5–15 minutes (Supabase CLI + api/web image pulls and builds).
- `api` and `web` run with `network_mode: host` in `docker/compose.e2e.yml` (not bridge + port mapping) — required so presigned Supabase Storage URLs minted server-side resolve identically for the container and the host-side Playwright browser. Supported on Linux (CI) and OrbStack.
