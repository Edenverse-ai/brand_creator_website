# Archive — decommissioned FastAPI backend

**Archived 2026-08-06.** Nothing in this directory is built, linted, type-checked,
formatted, tested, or deployed. It is kept in-tree as readable reference for the
behaviour that the native Next.js routes were ported from. Treat it as read-only.

The last commit in which this code was live at its original paths is **`8aade91`**.
To read a file as it stood then: `git show 8aade91:backend/app/main/main.py`.

---

## Why

The infra simplification (`docs/superpowers/plans/2026-08-04-infra-simplification.md`)
collapsed ~9 hosted surfaces to 3 — Netlify + Supabase + Stripe — by folding the
FastAPI/ECS backend into Next.js. Phases 1–4 (PRs #14–#25) ported every live route
natively. This is Phase 5: removing the dead weight from the working tree.

## What moved here

| Path                        | Was                                            | Why it is dead                                                             |
| --------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| `backend/`                  | `backend/`                                     | The FastAPI service. No application code has called it since PR #24.        |
| `workflows/backend-deploy.yml` | `.github/workflows/backend-deploy.yml`      | Built and pushed the ECR image. Moved out of `.github/` so it stops firing. |
| `harness/claude-ruff.js`    | `scripts/harness/claude-ruff.js`               | Claude Code PostToolUse hook for `backend/**/*.py`. No Python left.         |
| `harness/mypy-staged.js`    | `scripts/harness/mypy-staged.js`               | Pre-push mypy wrapper. No Python left.                                      |
| `orphaned-python/advertiser/` | `src/app/api/advertiser/*.py` + `src/app/api/routes.js` | GAE/`next-connect`-era code sitting inside the App Router tree. `routes.js` imported `./advertiser/api_endpoints` — a **`.py` file** — so it could never have loaded under Next. Dead before this change. |
| `orphaned-python/creators/creator_info.py` | `src/app/api/creators/creator_info.py` | Same: Python inside the App Router tree, unreachable.                       |
| `orphaned-python/contact/app.py` | `src/app/api/contact/app.py`             | Same.                                                                       |
| `orphaned-python/campaigns/app.yaml` | `src/app/api/campaigns/app.yaml`     | Google App Engine service descriptor from a pre-Netlify deployment.         |

## What was deleted outright (not moved)

These were proxy branches inside otherwise-live Next.js routes. Their surrounding
routes still exist and are native; only the FastAPI-calling code paths went. Recover
any of them with `git show 8aade91:<path>`.

| Route                                | Removed                                              | Replacement / behaviour now                                          |
| ------------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------- |
| `src/app/api/contact/route.ts`       | `GET` (hardcoded stub), `PUT` (test-email proxy), `PATCH` (get-messages proxy) | Route exports `POST` only; Next returns 405 for the others.          |
| `src/app/api/pear/route.ts`          | `POST` (create-store proxy)                          | Route exports `GET` only. No admin UI ever created a pear store.      |
| `src/app/api/ai-videos/generate/route.ts` | `handleMultipartGenerate` + `PYTHON_API_BASE`   | Non-JSON `Content-Type` now returns **415**. JSON + presigned upload-url is the only shape. |
| `src/app/api/tiktokverification/route.ts` | `handleMultipartSubmission` + `PYTHON_API_BASE` | Non-JSON `Content-Type` now returns **415**. The live client already posts JSON (`creatorportal/tiktok-verify/page.tsx`). |

All four had zero live callers, verified by grep across `src/`, `pages/`, and `e2e/`
before removal. The two 415 branches are covered by tests asserting the DB is never
touched and `fetch` is never called; the two removed-verb cases are covered by tests
asserting the route module no longer exports them.

## Harness changes that went with it

| Where                        | Change                                                                     |
| ---------------------------- | -------------------------------------------------------------------------- |
| `package.json`               | `harness:prepush` drops the `cd backend && ruff … && mypy app` tail.        |
| `package.json`               | `lint-staged` drops the `backend/**/*.py` glob.                             |
| `package.json`               | `dev:infra` / `dev:infra:down` are now just `npx supabase start` / `stop` — the only thing the compose file contributed to local dev was the sidecar. |
| `.claude/settings.json`      | Drops the `claude-ruff.js` PostToolUse hook.                                |
| `docker/compose.e2e.yml`     | `api` service gone; `web` no longer `depends_on` it, and loses `CAMPAIGNS_API_URL` / `NEXT_PUBLIC_API_URL`. |
| `scripts/e2e/{up,up-infra,explore,rebuild}.ts` | No longer start, wait on, advertise, or rebuild `api`/`:8001`. |
| `eslint.config.js`, `.prettierignore`, `tsconfig.json` | `backend/**` ignore replaced with `legacy/**`.       |
| `docs/backend.md`            | Kept verbatim under a DECOMMISSIONED banner.                                |
| `docs/{architecture,harness,frontend,e2e,README}.md`, `README.md` | Sidecar removed from the described architecture. |

## Bugs found on the way out — read before reviving anything

- **`PULL_FROM_URL` "url ownership" failures were ours.** The publish route decided
  whether to rewrite a source onto the TikTok-verified `/media` prefix from *which
  request field* carried it, and the live client sends a raw signed `supabase.co`
  URL. Fixed by deciding on **host** (PR #25). Flag `TIKTOK_PULL_FROM_URL_ENABLED`
  is now `true`.
- **TikTok issues upload hosts on `tiktokapis.us`,** not only `.com`. A `.com`-only
  SSRF allowlist rejected every real upload and stalled at `uploaded_bytes: 0`.
- **Netlify answers `202` when a background function is merely queued,** so a failing
  relay is indistinguishable from success from outside. Keep the gate-rejection
  logging in the relay function.
- **`CareerApplications` never existed.** The Python insert always threw and was
  swallowed; applications have only ever produced an email. Ported email-only by
  owner decision — no passport/ID/DOB at rest.
- **Three phantom `campaigns` filter columns** (`status`, `start_date`, `end_date`)
  crash and are masked to a 200 with empty results. Pre-existing, still open.
- **A harness test ran `prisma migrate deploy` against production** when `DIRECT_URL`
  was unset. Pre-existing, fixed during the migration.

## Known issues left in live code (pre-existing, not caused by this change)

- **`src/app/api/advertiser/route.js` hardcodes a Supabase `service_role` JWT** for
  project `jmbibmulwznrgtrkwrxk` (a different project from the one this app uses).
  It is committed in git history. That key should be rotated or the project
  confirmed dead. Its `POST` branch also proxies to `http://localhost:8000` — a
  FastAPI port nothing has ever served in production — so the "send notification"
  action on `/advertiserservice` cannot work in prod.
- The AI-video library signed-URL TTL is really 300 s, not the 30 days its comment
  claims.
- A >64 MB TikTok video has never been published; that is the only case that
  exercises the chunking path in the FILE_UPLOAD relay.

## AWS

Torn down 2026-08-06 — ECS service, ECR repository, log group, and all four task
definition revisions are gone, and `CAMPAIGNS_API_URL` is unset on Netlify. See
[HANDOFF.md](HANDOFF.md) for what was run, what was verified, and the one resource
still worth re-checking.

## Deleting this directory

Safe once nobody needs the reference. `git rm -r legacy` — the history keeps
everything. Note that the container image is gone from ECR; the only remaining way to
run this service is to rebuild it from `legacy/backend/Dockerfile`.
