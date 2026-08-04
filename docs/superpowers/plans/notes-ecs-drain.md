# ECS Traffic Drain — Observation Log

Decommission gate (plan Phase 5): zero non-`/health` product traffic for 7 consecutive days.

## Gate query (CloudWatch Logs Insights, log group `/ecs/cricher-backend`, us-east-2)

```
fields @message
| filter @message like /HTTP\/1.1/ and @message not like /GET \/health/
| parse @message /"(?<method>[A-Z]+) (?<path>[^ ]+) HTTP/
| stats count() as hits by method, path
| sort hits desc
| limit 25
```

## 2026-08-04 baseline (window: 7 days back)

- 121,211 total HTTP log lines; effectively all `/health` (ALB checks every ~5s from 3 targets) plus paired httpx→Supabase ping per check.
- Non-health hits: `GET /` ×16, `favicon.ico` ×3, remainder = internet scanner probes (gradio/agent.json/rpc/wp batch etc.), ≤2 hits each.
- **Zero product API traffic** (`/campaigns`, `/contact`, `/tiktokverification`, `/ai-videos`, `/pear`, `/entertainment-live`, `/career`): 0 hits in 7 days.

Conclusion: backend serves no live product traffic today; routes remain wired from Next proxies, so strangler port still required before decommission, but blast radius ≈ 0.

## Follow-up checks

- [ ] Re-run at Phase 5 gate; require same zero-product-traffic result for the 7 days preceding decommission.
