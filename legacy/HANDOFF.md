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
| ALB `ecs-express-gateway-alb-a39a3db4` + both `ecs-gateway-tg-*` target groups | **Reaped by ECS itself** once the last task finished draining — no manual deletion needed. Do not hand-delete `AmazonECSManaged` load balancers; give ECS a few minutes first. |
| IAM roles `ecsInfrastructureRole`, `ecsTaskExecutionRole` | Deleted (one AWS-managed policy detached from each; no inline policies). Both showed a last-used timestamp from ECS's own teardown minutes earlier and nothing else in any region used them. |
| ECS cluster `default`                                  | Deleted (empty).                                                 |

Verification after the fact: `aws ecs list-services` → empty · `describe-repositories`
no longer lists `cricher-backend` · `describe-log-groups` prefix `/ecs/cricher` → empty ·
`list-task-definitions --family-prefix default-cricher-backend` → empty ·
`GET https://cr-a3a9dccca75c4d028042debabc7691fe.ecs.us-east-2.on.aws/health` → **503**.

Production smoke (`cricher.ai`): `/`, `/campaigns`, `/contact`, `/api/campaigns` all 200.
`/api/campaigns` returns `[]` — confirmed correct, the `campaigns` table has 0 rows. That
route swallows errors into `[]` at HTTP 200, so an empty body there is never by itself
evidence of health; it was checked against the database directly.

Final sweep: no ECS clusters, services, or task definitions in any region checked
(us-east-1/2, us-west-1/2, eu-west-1, ap-southeast-1, ap-northeast-1) · no load balancers
or target groups in us-east-2 · no `/ecs*` log groups · both IAM roles return
`NoSuchEntity` · the ECS endpoint no longer resolves. Production re-smoked green after.

## Deliberately left alone

- **ECR repository `robotx-crm-api`** (us-east-2) — a different project, untouched.
- **IAM user `jason-cli`** — it created the service, but it is also the identity these
  teardown commands ran as. Deleting it would remove the account's CLI access. If it was
  only ever used for this backend, remove it from a different admin identity.

## Still to watch

- Next billing cycle: confirm ECS / ECR / ELB line items are $0.
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
