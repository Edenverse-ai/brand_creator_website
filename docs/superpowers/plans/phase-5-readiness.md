# Phase 5 Readiness — FastAPI/ECS Decommission

Status as of **2026-08-05**. Phase 5 is **not complete** and must not be started until the blockers below clear. Nothing on AWS has been deleted.

## Why it is blocked

Removing `backend/` today breaks live paths. Two remain:

### 1. TikTok publish client — needs a live end-to-end test

`src/app/creatorportal/ai-video/post/page.tsx:13` still reads `CAMPAIGNS_API_URL` and posts to the FastAPI `/upload-ai-video` and `/publish-status` endpoints.

Phase 3 shipped native replacements (`POST /api/tiktok/publish`, `POST /api/tiktok/publish-status`) plus a Netlify background function for the byte relay, but deliberately did **not** flip the client. Flipping requires:

- One real publish against a live TikTok account, including a >64MB video to exercise chunking (the FastAPI implementation always sent a single chunk, which TikTok caps at 64MB — large videos have been failing).
- Reconciling two client-side shape mismatches, both documented in `.superpowers/sdd/task-3-report.md`:
  - the client sends camelCase; the new routes accept both spellings, so this is already handled server-side,
  - the client reads `result.error?.message`, but the new routes return `error` as a plain string (deliberate — the old dict echoed TikTok's raw payload back to the caller).

### 2. Career applications — needs a product decision

`src/app/api/career/apply/route.ts` still proxies to FastAPI. It was **not** ported because the Python writes to a `CareerApplications` table that **does not exist**.

Verified 2026-08-05: the Supabase REST API returns `PGRST205 — Could not find the table 'public.CareerApplications'`, and a read-only `prisma db pull` against `DIRECT_URL` shows the live database contains exactly the same 30 models as `prisma/schema.prisma`. The Python's insert throws and the exception is swallowed, so every career application has only ever produced an email.

Persisting these means storing passport name, ID number, nationality, gender and date of birth. That is a retention decision, not a migration step. Options are laid out in the spawned task "Decide whether to persist career applications".

### Harmless — no action needed

These still proxy to FastAPI but have **zero callers** anywhere in `src/`, `pages/`, or `e2e/` (independently verified during review). They die with the backend:

- `GET`/`PUT`/`PATCH /api/contact`
- `POST /api/pear`
- `POST /api/ai-videos/generate` (ported natively in Phase 2; the proxy branch is the legacy multipart path)
- `tiktokverification` legacy multipart branch
- Python-side: `ensure-profile`, claim-check GET/POST, entertainment-live PUT/DELETE, several contact admin endpoints

## Traffic gate

The plan requires **7 consecutive days of zero non-`/health` product traffic** before deleting AWS resources.

Query (CloudWatch Logs Insights, log group `/ecs/cricher-backend`, region `us-east-2`):

```
fields @message
| filter @message like /HTTP\/1.1/ and @message not like /GET \/health/
| parse @message /"(?<method>[A-Z]+) (?<path>[^ ]+) HTTP/
| stats count() as hits by method, path
| sort hits desc
| limit 25
```

**Readings so far**

| Date       | Window   | Result                                                                                     |
| ---------- | -------- | ------------------------------------------------------------------------------------------ |
| 2026-08-04 | 7 days   | Zero product traffic. `GET /` ×16, favicon ×3, rest internet scanner probes (≤2 hits each) |
| 2026-08-05 | 24 hours | `GET /campaigns/` ×1, `GET /` ×2                                                           |

The single `GET /campaigns/` hit is attributable to a Netlify deploy preview during Phase 4 work — `/api/campaigns` proxied to FastAPI until PR #18 merged. That proxy is now native Prisma, so this source is gone. **Re-run the query and confirm a clean 7-day window before proceeding**; do not treat the 2026-08-04 reading as still valid.

Earliest valid teardown on the original gate: **~2026-08-11**.

## Teardown steps (do not run until blockers clear AND the gate passes)

### Repo-side

```bash
git rm -r backend .github/workflows/backend-deploy.yml
```

Then remove from `package.json`: the Python segment of `harness:prepush` (`cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/mypy app`) and the `backend/**/*.py` entry in `lint-staged`. Reduce `docker/compose.e2e.yml` further — the `api` service exists only to run FastAPI locally.

```bash
npx netlify env:unset CAMPAIGNS_API_URL
```

Verify `npm run harness:prepush && npm run e2e` before committing.

### AWS

Run in this order, all `--region us-east-2`:

```bash
# optional insurance: pull the last image locally first
docker pull 202716106225.dkr.ecr.us-east-2.amazonaws.com/cricher-backend:553f96b119a92d94e68613088c0e3058d11f5a8d

aws ecs delete-express-gateway-service \
  --service-arn arn:aws:ecs:us-east-2:202716106225:service/default/cricher-backend \
  --region us-east-2

aws ecr delete-repository --repository-name cricher-backend --force --region us-east-2

aws logs delete-log-group --log-group-name /ecs/cricher-backend --region us-east-2
```

Then confirm the endpoint is gone:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://cr-a3a9dccca75c4d028042debabc7691fe.ecs.us-east-2.on.aws/health
```

Finally: smoke prod (contact form, campaign list, AI-video library, TikTok publish), and next billing cycle confirm ECS/ECR line items are $0. Review `ecsInfrastructureRole` / `ecsTaskExecutionRole` and the deploy workflow's CI user for removal if unused elsewhere.

## Note on secrets

Rotation of `SUPABASE_SERVICE_KEY` and `SMTP_PASSWORD` was explicitly skipped by the repo owner on 2026-08-04; both remain readable in plaintext to anyone with `ecs:Describe*` on the account until the service is deleted. Deleting the ECS service removes that exposure path.
