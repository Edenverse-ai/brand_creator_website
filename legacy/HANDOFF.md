# Handoff — FastAPI decommission

**Repo side completed 2026-08-06** (see [ARCHIVE.md](ARCHIVE.md)).
**AWS side executed 2026-08-06.** This file is now a record of what was done and what
is left to watch.

## Executed

| Step                                                   | Result                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `docker pull …/cricher-backend:553f96b1…`              | Pulled locally as insurance before deletion (`sha256:a8fa76aa…`). |
| ECS service `cricher-backend`                          | Deleted. `delete-service` refuses this service — it is `ResourceManagementType=ECS`, so `aws ecs delete-express-gateway-service --service-arn …` is the correct call. |
| ECR repository `cricher-backend`                       | Deleted (`--force`, 4 images).                                   |
| Log group `/ecs/cricher-backend`                       | Deleted.                                                         |
| Task definitions `default-cricher-backend:1–4`         | Deregistered **and deleted.** Not in the original plan, and necessary: task definitions survive service deletion and held `SUPABASE_SERVICE_KEY` and `SMTP_PASSWORD` in plaintext `environment` entries readable by anyone with `ecs:DescribeTaskDefinition`. |
| `netlify env:unset CAMPAIGNS_API_URL`                   | Unset in all contexts.                                           |

Verification after the fact: `aws ecs list-services` → empty · `describe-repositories`
no longer lists `cricher-backend` · `describe-log-groups` prefix `/ecs/cricher` → empty ·
`list-task-definitions --family-prefix default-cricher-backend` → empty ·
`GET https://cr-a3a9dccca75c4d028042debabc7691fe.ecs.us-east-2.on.aws/health` → **503**.

Production smoke (`cricher.ai`): `/`, `/campaigns`, `/contact`, `/api/campaigns` all 200.
`/api/campaigns` returns `[]` — confirmed correct, the `campaigns` table has 0 rows. That
route swallows errors into `[]` at HTTP 200, so an empty body there is never by itself
evidence of health; it was checked against the database directly.

## Still to watch

- **`ecs-express-gateway-alb-a39a3db4`** (us-east-2) was still `active` immediately after
  deletion, with the old target group draining. It is tagged `AmazonECSManaged=true`, so
  ECS owns its lifecycle — it should disappear once draining completes. **Re-check it.**
  An idle ALB is roughly $16–20/month, and it is the one resource that could silently keep
  billing. Do not delete an `AmazonECSManaged` load balancer by hand unless it is still
  there long after the last service is gone.
- Next billing cycle: confirm ECS/ECR line items are $0.
- `ecsInfrastructureRole` / `ecsTaskExecutionRole` and the `jason-cli` IAM user that
  created the service: review for removal if unused elsewhere. The `default` ECS cluster
  is now empty.
- Once the reference is no longer wanted: `git rm -r legacy`.

## Secrets

`SUPABASE_SERVICE_KEY` (project `loesykbqlhynbjmqxfxc`) and `SMTP_PASSWORD` sat in
plaintext in the deleted task definitions. Rotation was declined by the repo owner on
2026-08-04; deleting the task definitions removes the AWS read path, but **anyone who
read them before today still holds working credentials.** Rotation is still the only
thing that invalidates them.

Separately, and unrelated to the backend: `src/app/api/advertiser/route.js` has a
hardcoded Supabase `service_role` JWT committed in the repo. See ARCHIVE.md.

## Verification not yet done

- A TikTok publish through the app **after** `TIKTOK_PULL_FROM_URL_ENABLED` was flipped
  to `true`. The fix was proven with direct API calls, not through the UI.
- A >64 MB video, the only case exercising the relay's chunking path.
- The verification run left a `SELF_ONLY` (private) test post on `jason.liu851`.

---

## Appendix — the traffic gate as it stood

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

The conservative floor from the readiness doc was **2026-08-12** — seven days after
PR #24, the last change that removed an application call path. Teardown was executed on
2026-08-06 by owner decision, on the strength of the clean observed window rather than
the calendar floor.
