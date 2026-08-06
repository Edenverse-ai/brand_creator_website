# Handoff — what is left of the FastAPI decommission

**Written 2026-08-06.** The repo side is done (see [ARCHIVE.md](ARCHIVE.md)). What
remains is AWS, one Netlify variable, and two verifications. Nothing below has been
executed.

## State at handoff

| Surface                            | State                                                                |
| ---------------------------------- | -------------------------------------------------------------------- |
| Application code calling FastAPI   | **None.** Zero references in `src/` outside historical comments.      |
| `backend/` in the build            | **Out.** Moved to `legacy/`, excluded from lint/format/typecheck.     |
| `backend-deploy.yml`               | **Disarmed.** Moved out of `.github/workflows/`.                      |
| ECS service `cricher-backend`      | **Still running** (us-east-2).                                        |
| ECR repo, `/ecs/cricher-backend`   | **Still there.**                                                      |
| `CAMPAIGNS_API_URL` on Netlify     | **Still set.** Now unread by any code path.                           |
| Traffic gate                       | **Observed clean** — see below.                                       |

## Traffic gate

The plan required 7 consecutive days of zero non-`/health` product traffic before
deleting AWS resources.

Reading taken 2026-08-06 over Jul 30 → Aug 6 (CloudWatch Logs Insights, log group
`/ecs/cricher-backend`, `us-east-2`):

```
GET /            14
GET /favicon.ico  3
~20 internet-scanner probes (/redoc, /v1/models, /gradio_api/*, /.well-known/agent.json …), ≤2 hits each
```

**Zero product paths.** The single `GET /campaigns/` seen on 2026-08-05 (a deploy
preview, before PR #18 landed) is gone from the window.

Use this query — note the `httpx` exclusion, which the earlier version lacked:

```
fields @message
| filter @message like /HTTP\/1.1/ and @message not like /GET \/health/ and @message not like /httpx/
| parse @message /"(?<method>[A-Z]+) (?<path>[^ ]+) HTTP/
| stats count() as hits by method, path
| sort hits desc
| limit 25
```

Without that exclusion the top row is ~62,000 hits with no method or path. Those are
**outbound** calls — the health check's own `GET .../rest/v1/campaigns?select=id&limit=1`
to Supabase, logged by `httpx`. They are not inbound traffic and are not a gate
failure. (They are, incidentally, ~62k Supabase requests per week spent keeping a dead
service green; deleting the service stops them.)

The conservative floor from the readiness doc is **2026-08-12** — seven days after
PR #24, the last change that removed an application call path. The evidence is already
clean; whether to wait for the letter of the gate is the owner's call.

## Remaining steps

### 1. Netlify

```bash
npx netlify env:unset CAMPAIGNS_API_URL
```

### 2. AWS — irreversible, in this order

```bash
# optional insurance: keep the last image locally
docker pull 202716106225.dkr.ecr.us-east-2.amazonaws.com/cricher-backend:553f96b119a92d94e68613088c0e3058d11f5a8d

aws ecs delete-express-gateway-service \
  --service-arn arn:aws:ecs:us-east-2:202716106225:service/default/cricher-backend \
  --region us-east-2

aws ecr delete-repository --repository-name cricher-backend --force --region us-east-2

aws logs delete-log-group --log-group-name /ecs/cricher-backend --region us-east-2
```

Confirm the endpoint is gone:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://cr-a3a9dccca75c4d028042debabc7691fe.ecs.us-east-2.on.aws/health
```

### 3. After

- Smoke production: contact form, campaign list, AI-video library, TikTok publish.
- Next billing cycle: confirm ECS/ECR line items are $0.
- Review `ecsInfrastructureRole` / `ecsTaskExecutionRole` and the deploy workflow's CI
  user for removal if unused elsewhere.
- Once the reference is no longer wanted: `git rm -r legacy`.

## Secrets

Rotation of `SUPABASE_SERVICE_KEY` and `SMTP_PASSWORD` was declined by the repo owner
on 2026-08-04. Both remain readable in plaintext in the ECS task definition to anyone
holding `ecs:Describe*` on the account **until the service is deleted**. Deleting it is
what closes that path.

Separately, and unrelated to the backend: `src/app/api/advertiser/route.js` has a
hardcoded Supabase `service_role` JWT committed in the repo. See ARCHIVE.md.

## Verification not yet done

- A TikTok publish through the app **after** `TIKTOK_PULL_FROM_URL_ENABLED` was
  flipped to `true`. The fix was proven with direct API calls, not through the UI.
- A >64 MB video, the only case exercising the relay's chunking path.
- The verification run left a `SELF_ONLY` (private) test post on `jason.liu851`.
