# Agentic E2E Harness Design

> **Superseded by Phase 6** (`docs/superpowers/plans/2026-08-04-infra-simplification.md`, `.superpowers/sdd/phase-6-report.md`): the hand-rolled `pg` + `supabase` (storage-api) + nginx proxy stack this design describes was replaced by the official Supabase CLI (`supabase/config.toml`, `npx supabase start`). Ports (54330/54331) and credentials (`e2e:e2e`/`brand_creator_e2e`) below no longer apply — current values are `54321` (Supabase API) / `54329` (Postgres, `postgres:postgres`). Left unmodified below as a historical record.

**Date:** 2026-05-07
**Status:** Approved (design)
**Owner:** Platform / DX
**Related:** [docs/harness.md](../../harness.md), [docs/e2e.md](../../e2e.md) (to be authored)

## 1. Goal

Provide a Playwright-based end-to-end harness that an LLM agent (Claude Code) can drive autonomously to:

1. **Author** acceptance tests from a spec via TDD (red → green).
2. **Explore** the running app via MCP Playwright and emit durable specs.
3. **Debug** failing runs from machine-readable artifacts.

Non-goals: replace unit tests; act as PR evaluator/scorer; visual regression (covered separately).

## 2. Stack & Topology

```
agent (Claude Code)
  ├── reads docs/superpowers/specs/<feat>-design.md
  ├── writes e2e/<surface>/<feat>.spec.ts
  ├── runs `npm run e2e:agent -- --grep <feat>`
  └── reads .e2e/runs/latest/{summary.md, report.json, trace-*.zip, console.log}
```

Stack defined in `docker/compose.e2e.yml`:

| Service    | Image / build           | Port  | Purpose                              |
| ---------- | ----------------------- | ----- | ------------------------------------ |
| `pg`       | `postgres:16-alpine`    | 54329 | Test DB (port differs from dev 5432) |
| `supabase` | local storage stub      | 54330 | Signed-URL upload tests              |
| `api`      | `backend/Dockerfile`    | 8001  | FastAPI                              |
| `web`      | `docker/Dockerfile.web` | 12001 | `next start` (prod-ish)              |

Compose project name: `brand-creator-e2e` (namespaces volumes).

## 3. Boot & Teardown

`scripts/e2e/up.ts`:

1. Refuse if `DATABASE_URL` points outside `:54329` (guardrail).
2. `docker compose -p brand-creator-e2e up -d --wait`.
3. Wait healthchecks: `pg_isready`, `GET /healthz` (api), `GET /` (web).
4. `prisma migrate deploy` against test DB.
5. `tsx prisma/seed.e2e.ts`.
6. Idempotent: re-running while healthy is a no-op.

`scripts/e2e/down.ts`: `docker compose -p brand-creator-e2e down -v`.

`playwright.config.ts` change: when `E2E_AGENT=1`, drop the `webServer` block; set `baseURL=http://localhost:12001`.

## 4. DB Lifecycle

- `prisma/seed.e2e.ts` — deterministic minimal fixture: 1 brand, 1 creator, 1 admin (`*@e2e.test`), 1 campaign, 1 sample. **Hardcoded IDs** for stable selectors and assertions.
- `e2e/_helpers/resetDb.ts` — `TRUNCATE … RESTART IDENTITY CASCADE` on all tables except `_prisma_migrations`, then re-seed via Prisma client. Also clears `samples/` and `outputs/` storage prefixes via supabase admin client.
- Exposed as Playwright fixture `freshDb`; called in `test.beforeAll` per spec file (truncate + reseed per file).
- Tests within a file share fixture state and run serially against shared rows.

## 5. Auth Fixtures

`e2e/_setup/global-setup.ts`:

1. Wait stack ready.
2. Run `resetDb` once.
3. For each role in `['brand','creator','admin']`:
   - POST `/api/auth/callback/credentials` with seeded creds.
   - Save `context.storageState()` to `.e2e/auth/<role>.json`.
4. `.e2e/auth/` gitignored; rebuilt every run.

Playwright fixture (`e2e/_helpers/fixtures.ts`):

```ts
export const test = base.extend<{ asBrand: Page; asCreator: Page; asAdmin: Page }>({
  asBrand: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: ".e2e/auth/brand.json" });
    await use(await ctx.newPage());
    await ctx.close();
  },
  // asCreator, asAdmin analogous
});
```

Spec usage: `test('brand creates campaign', async ({ asBrand }) => { ... })`.

## 6. Agent TDD Loop

Wrapper: `scripts/e2e/agent.ts` (`npm run e2e:agent`).

1. `up.ts` (idempotent ensure).
2. `playwright test` with:
   - `--reporter=json,line` → `.e2e/runs/<runId>/report.json`.
   - `--project=chromium` (skip mobile in inner loop).
   - `--workers=1` for deterministic agent output.
   - `trace=on`, `video=retain-on-failure`.
3. Post-run: write `.e2e/runs/<runId>/summary.md` — agent-friendly digest:

   ```
   FAIL e2e/brand/campaign-create.spec.ts › creates campaign
     selector: [data-testid="campaign-submit"]
     error:    Timeout 5000ms waiting for selector
     trace:    .e2e/runs/abc/trace-1.zip
     console:  3 errors (see console.log)
     network:  POST /api/campaigns → 422 {"detail":"missing brand_id"}
   ```

4. Symlink `.e2e/runs/latest → <runId>` so agent reads stable path.

Agent loop:

```
read spec.md
write failing test → e2e/<surface>/<feat>.spec.ts
run: npm run e2e:agent -- --grep "<title>"
read .e2e/runs/latest/summary.md
if FAIL → edit src/ or backend/app/ → rerun
if PASS → done (commit test + impl)
```

## 7. Explore Mode

`npm run e2e:explore`:

1. `up.ts` (boot only, no test runner).
2. Print MCP connect URL: `http://localhost:12001`.
3. Set `E2E_EXPLORE=1` so backend exposes `/test/login?role=<role>` shortcut for MCP context (no real password flow inside MCP).
4. Agent uses `mcp__playwright__*` tools to walk flows, snapshot, then writes durable `.spec.ts` capturing the discovered flow.
5. Drafts land at `e2e/<surface>/*.draft.ts` (gitignored) until promoted.

## 8. Debug Mode

`npm run e2e:debug -- <runId>`:

1. Print `summary.md`.
2. Extract last 50 lines of `api` and `web` stdout from compose logs.
3. `playwright show-trace --json <trace.zip>` → flattened action log to stdout.
4. Run probes registered in `e2e/_helpers/probes.ts` (each spec can declare "what DB state must exist after this test") and print results.

## 9. Repo Layout

```
docker/
  compose.e2e.yml
  Dockerfile.web
backend/Dockerfile                 # verify exists or add
scripts/e2e/
  up.ts down.ts agent.ts explore.ts debug.ts reset-db.ts
prisma/
  seed.e2e.ts
e2e/
  _setup/{global-setup.ts, global-teardown.ts}
  _helpers/{fixtures.ts, resetDb.ts, probes.ts}
  brand/         *.spec.ts
  creator/       *.spec.ts
  studio-admin/  *.spec.ts
  smoke/         *.spec.ts          # existing, unchanged
docs/e2e.md                         # operator guide
.e2e/                               # gitignored: auth/, runs/, logs/
```

## 10. Test Taxonomy

| Tier    | Location         | When                              | Goal                           |
| ------- | ---------------- | --------------------------------- | ------------------------------ |
| smoke   | `e2e/smoke/`     | every PR + Netlify preview        | site loads, auth works         |
| feature | `e2e/<surface>/` | agent TDD loop + nightly CI       | acceptance per feature spec    |
| explore | `*.draft.ts`     | agent only, gitignored until kept | discovery → promote to feature |

## 11. npm Scripts

```json
"e2e:up":      "tsx scripts/e2e/up.ts",
"e2e:down":    "tsx scripts/e2e/down.ts",
"e2e:reset":   "tsx scripts/e2e/reset-db.ts",
"e2e:agent":   "tsx scripts/e2e/agent.ts",
"e2e:explore": "tsx scripts/e2e/explore.ts",
"e2e:debug":   "tsx scripts/e2e/debug.ts",
"e2e:ci":      "E2E_AGENT=1 playwright test"
```

Existing `npm run e2e` retained for fastest local sanity (dev `webServer`, no compose). `e2e:agent` is the canonical agent path.

## 12. CI Integration

GitHub Actions / Netlify equivalent:

1. `npm ci`
2. `npm run e2e:up`
3. `npm run e2e:ci`
4. Always upload `.e2e/runs/latest` as artifact.
5. `npm run e2e:down` in `always()` block.

PR job: smoke only. Nightly + label `e2e:full`: full suite.

## 13. Guardrails

- `up.ts` refuses non-`:54329` `DATABASE_URL`.
- `seed.e2e.ts` users use `@e2e.test` domain; `prisma/seed.dev.js` untouched.
- `/test/login` route double-gated: `E2E_EXPLORE=1` AND `NODE_ENV !== 'production'`.
- `.e2e/auth/*.json` gitignored; regenerated per run; test-only sessions.
- Compose project name namespaces volumes; `down -v` only clears `brand-creator-e2e_*`.

## 14. Open Risks

| Risk                                                        | Mitigation                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| Supabase storage stub diverges from prod (signed URLs, RLS) | Nightly contract test against real Supabase project           |
| Compose cold start ~30s slows agent inner loop              | `up.ts` idempotent; reuse running stack across iterations     |
| MCP Playwright may not honor `storageState`                 | Fallback: `/test/login?role=` shortcut gated by `E2E_EXPLORE` |
| `--workers=1` hides race bugs                               | Nightly CI runs with default worker count                     |
| Trace zips bloat `.e2e/runs/`                               | `agent.ts` rotates: keep last 10 runs, prune older            |

## 15. Acceptance Criteria

- `npm run e2e:up` boots full stack from cold in < 60s on dev laptop.
- `npm run e2e:agent -- --grep <existing-test>` reruns test and produces `.e2e/runs/latest/summary.md` with failure digest within 15s after stack ready.
- Agent given a fresh feature spec writes failing test, gets actionable failure summary, implements, reaches green — without operator intervention — for at least one representative feature (campaign create).
- Auth storageState rebuilt every run; no stale-cookie failures across two sequential `e2e:agent` invocations.
- CI smoke run passes against this harness on a clean checkout.

## 16. Out of Scope

- Visual regression / screenshot baselines.
- Load/performance testing.
- Cross-browser matrix in inner agent loop (chromium only; mobile + webkit nightly).
- Evaluator/scorer agent role.
- Production data anonymization for E2E.
