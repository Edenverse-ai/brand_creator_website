# Phase 5 Readiness — FastAPI/ECS Decommission

Status as of **2026-08-05**. Both code blockers are **cleared**. The only remaining gate is the traffic observation window. Nothing on AWS has been deleted.

## Blockers — both closed

### 1. TikTok publish client — ✅ verified live 2026-08-05

The client was flipped to the native routes in PR #23 and a real publish to a live TikTok account reached `PUBLISH_COMPLETE`.

Getting there surfaced two genuine bugs, both now fixed:

- **`PULL_FROM_URL` fails domain verification.** `cricher.ai` is listed as a verified _Domain_ property in the TikTok console, and TikTok's own UI says that covers all URLs beneath it — but init consistently returned a failure until the flag was turned off. `TIKTOK_PULL_FROM_URL_ENABLED` is therefore **`false`**, and the FILE*UPLOAD relay is the working path. Re-verifying the prefix (as a \_URL prefix* property with a signature file, rather than relying on the Domain one) is the way back to the cheaper design; it is optional, not required.
- **The SSRF allowlist rejected TikTok's real upload host.** TikTok issued `open-upload.tiktokapis.us` — a `.us` TLD — while the allowlist permitted only `tiktokapis.com`. Every upload was refused by our own guard and stalled at `uploaded_bytes: 0`. Fixed in `relay-url-guard.ts` with regression tests; lookalike hosts are still rejected.

Both failures were invisible from the outside because Netlify answers `202` the moment a background function is queued, and all three of the function's rejection paths returned silently. The function now logs which gate refused (hostnames only — the URLs are bearer capabilities). Keep that logging; it turned a multi-attempt guessing exercise into a single decisive run.

Still untested: a video over 64MB, which is the only case that exercises the chunking fix. All library fixtures are ~2.6MB.

### 2. Career applications — ✅ resolved 2026-08-05

Ported email-only in PR #24, per the owner's decision. The `CareerApplications` table never existed (`PGRST205`, confirmed against the live database), the Python's insert always threw and was swallowed, so applications have only ever produced an email. The dead insert is gone; no Prisma model, no migration, and no passport/ID/DOB at rest.

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

Since no application code has called FastAPI since PR #24 merged on 2026-08-05, the window should now run clean. **This is the only thing still gating teardown.**

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
