# Seedance Video Generation — Design

**Date:** 2026-10-05
**Status:** Draft — awaiting review
**Scope:** Replace the manual-fulfillment form at `/creatorportal/ai-video/generate` with real AI video generation through the AI Open Platform video API (Seedance), and deliver finished videos straight into the creator's AI Video library so they can be posted to TikTok.

**Relation to prior specs:** Builds on [`2026-05-08-ai-video-task-workflow-design.md`](./2026-05-08-ai-video-task-workflow-design.md) (the `AiVideoTask` model and creator task list) and [`2026-05-09-ai-video-fulfillment-design.md`](./2026-05-09-ai-video-fulfillment-design.md) (manual output upload). The manual admin path keeps working; this spec adds an automated path on the same model.

## 1. Goal

A creator can:

1. Open `/creatorportal/ai-video/generate`, write a prompt, optionally add a reference image, and choose aspect ratio, duration, resolution and audio.
2. Submit, and watch the task move from generating to done on the same page.
3. Find the finished video in **My Videos** on `/creatorportal/ai-video` and post it to TikTok with the existing flow.

Each creator has a daily generation cap.

## 2. Non-Goals

- Other generation tabs (viral remake etc.), video editing, video extension, super-resolution, copyright `ips`, 1080p/4k.
- Subscription/Stripe quota. The daily cap is a flat env-configured number.
- Auth on `/storyclaw-admin` (still deferred, tracked separately).
- Retention or cleanup of stored videos (kept indefinitely for now).
- Thumbnail generation.
- Voice cloning. The voice upload is removed from the form; `voicePath` stays in the schema.

## 3. Provider: AI Open Platform video API v1.1

| Item                 | Value                                                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base URL             | From the provider console. Read from `VIDEO_API_BASE_URL`; **no default in code**.                                                                                                       |
| Auth                 | Header `ApiKey: <key>`. Keys may carry a source-IP allowlist.                                                                                                                            |
| Create               | `POST {BASE_URL}/ai-open-platform-api/v1/lz/video/task/create` → `data.task_id`                                                                                                          |
| Status               | `POST {BASE_URL}/ai-open-platform-api/v1/lz/video/task/status`, body `{ "task_id" }`                                                                                                     |
| Envelope             | Success only when HTTP 200 **and** `code == 0`. HTTP 200 with `code != 0` is a business error. Non-200 is a system error. Every response carries `trace_id`.                             |
| Insufficient balance | HTTP 429, `message` contains `40001`.                                                                                                                                                    |
| Status values        | `pending` / `submitted` / `running` (in progress), `succeeded` (`video_url`, `duration`, `usage.completion_tokens`), `failed` (`error` string). Terminal states never change. No cancel. |
| Billing              | Failed tasks are not charged. **No idempotency key** — every create call is a new, billable task.                                                                                        |
| Output               | `video_url` is not guaranteed to persist; copy it on success.                                                                                                                            |
| Polling              | No more often than every 5 s. Generation usually takes minutes.                                                                                                                          |

Request fields used: `prompt`, `mode`, `images[{url, role}]`, `resolution`, `ratio`, `duration`, `generate_audio`, `watermark`, `output_format`, `execution_expires_after`.

- `mode` is always sent explicitly (default `seedance2.5` via `SEEDANCE_MODE`). Without it the gateway validates as `fast`.
- `seedance2.5` supports only `480p` / `720p` and 4–30 s. The UI offers `480p` / `720p` and 5 / 10 / 15 s, valid for every mode.
- Reference images use `role: "reference_image"`, so any `ratio` is allowed. (`first_frame` would force `adaptive` on 2.5.)
- Image `url` must be HTTP(S) or `asset://`. We pass a Supabase signed URL valid for 6 hours.
- The platform auto-whitelists real people in directly passed image URLs, so a creator may use their own photo.
- `execution_expires_after: 3600` (the minimum), so a stuck task fails within an hour at no charge.
- `watermark: false`, `output_format: "mp4"`.

## 4. Token-Spend Safety (hard requirement)

No billable call may happen until the integration is verified, and billable calls are only ever made by a human.

1. **Mock by default.** The live client is used only when `SEEDANCE_LIVE=1`, `VIDEO_API_KEY` and `VIDEO_API_BASE_URL` are all set. None of them are committed to any env file.
2. **Tests can never go live.** When `NODE_ENV === "test"`, `E2E_EXPLORE=1` or `E2E_AGENT=1`, the client throws instead of calling the provider, even if fully configured. A unit test asserts this.
3. **One create call per task.** Because the provider has no idempotency key:
   - The task row is written first.
   - Submission atomically claims `submitStartedAt` (`updateMany … where submitStartedAt is null`), so concurrent requests cannot both submit.
   - A timeout or unknown outcome on create is **never retried**. The task becomes `FAILED` ("submission outcome unknown") with `traceId` stored for manual reconciliation.
4. Status polling is free and unrestricted (beyond the 5 s minimum).
5. In mock mode the form shows a "Mock mode — no video credits used" banner.

## 5. Architecture

```
Creator browser
  │ 1. POST /api/ai-videos/tasks/upload-url   (optional reference image, existing)
  │ 2. PUT  <signed upload URL> → Supabase ai-video-tasks
  │ 3. POST /api/ai-videos/tasks              (prompt + params)
  │       └─ daily-cap check → insert AiVideoTask(QUEUED) → submitTask()
  │             └─ claim submitStartedAt → provider create → GENERATING
  │ 4. GET  /api/ai-videos/tasks/:id  every 10 s
  │       └─ syncTask() → provider status
  ▼
syncTask() on `succeeded`
  └─ claim finalizeStartedAt → finalize:
        download video_url → upload aivideogenerated/${creatorId}/${taskId}.mp4
        → insert AiVideo row → task DELIVERED (aiVideoId, completionTokens)

Netlify scheduled function, every 10 min
  └─ for each GENERATING task: syncTask()      (no reliance on the creator returning)
```

**Where finalize runs.** A 15 s 720p video can be tens of MB, too risky for a normal Netlify function timeout. On Netlify, `syncTask` dispatches `netlify/functions/ai-video-finalize-background.ts` (15-minute budget) with only `{ taskId }`. The background function re-reads the task and the provider status, so the payload carries no URLs. The dispatch is HMAC-signed with a new `src/lib/ai-video-finalize-auth.ts`. It follows the same pattern as `src/lib/tiktok/relay-auth.ts` (secret derived from `NEXTAUTH_SECRET`, timestamp window), with its own context string, because the TikTok signer is typed to the TikTok relay payload. Off Netlify (local `next dev`), finalize runs inline, using the same environment detection as `src/lib/tiktok/background-dispatch.ts`.

**Scheduled sweep.** `netlify/functions/ai-video-sync-scheduled.ts` (`schedule: "*/10 * * * *"`):

- Selects `GENERATING` tasks ordered by `lastCheckedAt` (never-checked first), so tasks rotate fairly and a few slow ones can't starve the rest.
- Checks up to 5 tasks at a time, each status call with a 10 s timeout.
- Stops starting new checks after 20 s, leaving headroom under Netlify's 30 s limit for scheduled functions. Whatever is left is picked up on the next run.
- Calls `syncTask` for each. One task's error does not stop the others.
- Never downloads video bytes itself; finalize is handed to the background function.

It only runs on published production deploys; preview and local rely on page polling plus manual invocation.

**Why 10 minutes.** Each run costs one indexed query plus free status calls. The interval only affects creators who left the page; anyone watching gets the result from the 10 s page polling. Task expiry is 1 hour, so a 10-minute sweep has ample margin. The 30 s limit applies to every run regardless of interval, so running more often would not help with it. If volume grows, raise the per-run concurrency rather than the frequency.

**No `server-only` in function code paths.** Outside Next.js, the `server-only` package throws on import, which would crash both functions at load. The lifecycle modules (`src/lib/ai-video-generation.ts`, `src/lib/seedance/`) therefore don't import it. The Supabase helpers live in `src/lib/supabase-admin-core.ts`, and `src/lib/supabase-admin.ts` adds the marker for Next.js code. This was verified by bundling both functions with esbuild and loading them in plain Node.

**Concurrency.** Page polling (possibly several tabs), task-list rendering and the scheduled sweep can all call `syncTask` on the same task. The `finalizeStartedAt` claim guarantees exactly one finalize. A finalize that crashes after claiming is re-claimable once `finalizeStartedAt` is older than 20 minutes.

## 6. Data Model

`AiVideoTask` changes (single migration):

| Field               | Type                 | Purpose                                                                                                |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| `portraitPath`      | `String` → `String?` | Reference image is optional (text-to-video).                                                           |
| `provider`          | `String?`            | `"ai-open-platform"` or `"mock"`.                                                                      |
| `providerTaskId`    | `String?`            | Provider `task_id`.                                                                                    |
| `params`            | `Json?`              | `{ mode, ratio, duration, resolution, generateAudio }`.                                                |
| `errorMessage`      | `String?`            | Creator-facing failure reason.                                                                         |
| `failureCode`       | `String?`            | `submit_rejected`, `unknown_outcome`, `provider_failed` or `timeout`. Drives the daily-cap rule below. |
| `lastCheckedAt`     | `DateTime?`          | Last provider status check; orders the scheduled sweep.                                                |
| `traceId`           | `String?`            | Last provider `trace_id`, for support.                                                                 |
| `completionTokens`  | `Int?`               | `usage.completion_tokens` on success, for reconciliation.                                              |
| `submitStartedAt`   | `DateTime?`          | Submit claim (one create per task).                                                                    |
| `finalizeStartedAt` | `DateTime?`          | Finalize claim (one copy per task).                                                                    |
| `aiVideoId`         | `String? @db.Uuid`   | The `AiVideo` row created on delivery.                                                                 |

`AiVideoTaskStatus` gains `FAILED`. Status flow:

```
QUEUED ──submit ok──▶ GENERATING ──succeeded + finalize──▶ DELIVERED
   │                       │
   └─ submit failed/unknown └─ failed, or no result after 75 min
            ▼                          ▼
          FAILED                     FAILED
```

**Daily cap counting.** A task counts toward the creator's daily cap only if it may have used provider tokens. The v1.1 doc states failed tasks are not charged, so:

| Task state                                                  | Counts? | Why                                                 |
| ----------------------------------------------------------- | ------- | --------------------------------------------------- |
| `GENERATING` or `DELIVERED`                                 | Yes     | In progress or charged.                             |
| `FAILED`, `failureCode = unknown_outcome`                   | Yes     | The provider may have created and charged the task. |
| `FAILED`, `submit_rejected`, `provider_failed` or `timeout` | No      | Rejected before creation, or failed (not charged).  |
| `QUEUED` with `submitStartedAt` set (submission in flight)  | Yes     | A create call may already be under way.             |
| `QUEUED` (never submitted)                                  | No      | No provider call was made.                          |
| `IN_REVIEW` (manual workflow)                               | Yes     | Counted conservatively.                             |

The day boundary is UTC midnight, based on `submitStartedAt`. If the manual live test shows that a failed task does carry `usage.completion_tokens`, the rule changes to "counts if `completionTokens > 0`" and `completionTokens` is also recorded on failure.

`AiVideo` is unchanged. On delivery: `creator_id`, `generated_time = now`, `video = <storage path>`, `tag = '["ai-generated"]'`, `thumbnail_url = null`. The existing library code (`src/lib/ai-video-library.ts`) and TikTok publish (`aivideogenerated` bucket) pick it up with no changes.

**Storage.** A new private bucket `aivideogenerated` is created locally by `scripts/studio-create-buckets.js`, with a 200 MB per-file limit. It already exists in production. Production Supabase is on Pro (500 GB per-file max), so capacity is not a concern. Only the storage path is persisted, never a URL.

## 7. API

### `POST /api/ai-videos/tasks` (JSON branch changed; multipart branch untouched)

Body:

```json
{
  "prompt": "string (1–5000)",
  "taskId": "cuid",
  "portrait_path": "optional, owned by session + taskId",
  "params": { "ratio": "9:16", "duration": 5, "resolution": "720p", "generateAudio": true }
}
```

| Case                   | Response                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| No session             | 401                                                                                                     |
| Invalid body or params | 400                                                                                                     |
| Path not owned         | 403                                                                                                     |
| Daily cap reached      | 429 `{ error, remaining: 0 }`                                                                           |
| Created                | 200 `{ id, status }`. Status is `GENERATING`, or `FAILED` with `errorMessage` if the submission failed. |

`taskId` is optional when there is no reference image; the server then mints one with `createId()`.

### `GET /api/ai-videos/tasks/[id]` (new)

- 401 without a session. 404 if the task is missing or belongs to someone else (no existence leak).
- Runs `syncTask(id)`, then returns `{ id, status, errorMessage, videoUrl }`. `videoUrl` is a 1-hour signed URL of the `aivideogenerated` object once delivered.

### Error mapping (creator-facing, English)

| Provider condition                                  | Message                                                                             |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Content review rejection                            | "Your prompt or image didn't pass content review. Please revise and try again."     |
| Insufficient balance (429/40001), auth or IP errors | "Video generation is temporarily unavailable. Please try again later."              |
| Other business errors (`code != 0`)                 | "We couldn't start this video. Please adjust your settings and try again."          |
| Timeout or unknown outcome on create                | "We couldn't confirm your submission. Please check your tasks before trying again." |
| Expired / no result after 75 min                    | "Generation timed out. You were not charged."                                       |

Raw provider messages and `trace_id` go to server logs only. The API key is never logged.

## 8. UI — `/creatorportal/ai-video/generate`

Existing portal styling (white `rounded-2xl` cards, slate text, indigo accents, the existing gradient primary button). Two columns on desktop, stacked on mobile.

**Left column — inputs:**

- Prompt textarea with a character counter (5000) and a hint line: subject + action + scene + style + camera + sound.
- Optional reference image upload: preview, remove, client-side validation (jpg/png/webp, ≤ 10 MB, 300–6000 px per side, aspect ratio 0.4–2.5). Note: "Only upload images you have the rights to use."
- Aspect ratio segmented control: 9:16 (default), 16:9, 1:1, 3:4, 4:3.
- Duration: 5 / 10 / 15 s. Resolution: 720p / 480p.
- "Generate audio" toggle (on by default).
- "N generations left today".
- Generate button: disabled while submitting or when the cap is reached; small print "Generation can't be cancelled once started."

**Right column — result:** a portrait preview frame.

- Idle: placeholder.
- Generating: status plus elapsed time; polls every 10 s.
- Delivered: inline `<video>` and a link to `/creatorportal/ai-video` ("Post it to TikTok from My Videos").
- Failed: message plus a "Try again" action that keeps the form values.

**Related pages:**

- `/creatorportal/ai-video/tasks`: handles a null reference image and the `FAILED` status, and calls `syncTask` once for `GENERATING` rows when rendering.
- `/storyclaw-admin`: tolerates a null reference image and the new status.

## 9. Configuration

| Variable               | Default       | Notes                                         |
| ---------------------- | ------------- | --------------------------------------------- |
| `VIDEO_API_BASE_URL`   | —             | From the provider console. Required for live. |
| `VIDEO_API_KEY`        | —             | Required for live. Never logged or committed. |
| `SEEDANCE_LIVE`        | off           | `1` enables live calls (with the two above).  |
| `SEEDANCE_MODE`        | `seedance2.5` | `fast` / `pro` / `mini` / `seedance2.5`.      |
| `AI_VIDEO_DAILY_LIMIT` | `5`           | Per creator per UTC day.                      |

**Production note:** Netlify functions have no fixed egress IP. The production key must not have a source-IP allowlist (or a static egress must be arranged).

## 10. Testing

**Unit (Vitest, `__tests__/` beside code):**

- Seedance client: endpoint paths, `ApiKey` header, explicit `mode`, request body snake_case.
- Envelope parsing: `code`, `trace_id`, 429/40001.
- Status mapping and error mapping.
- Live-guard: throws under test/E2E; mock is selected unless all three env vars are set.
- Lifecycle:
  - Submit claim: a second concurrent submit does nothing.
  - Unknown outcome is not retried.
  - Finalize claim: concurrent syncs finalize once; a stale claim is re-claimable.
  - 75-minute timeout.
  - Daily cap.
- Routes: 401 / 400 / 403 / 404 / 429 and the success paths.
- Background function: auth and payload checks. Scheduled function: no-op when empty, per-task error isolation, batch limit.

**E2E** (`e2e/creator/ai-video-generate.spec.ts`, `asCreator`, mock provider):

- Submit → generating → delivered → visible in My Videos.
- `[mock-fail]` prompt → failed state.
- Cap reached → button disabled with message.

Update `e2e/ai-video-tasks.spec.ts` (portrait no longer required; new success copy).

**Dry run:** `npx tsx scripts/seedance-dry-run.ts` prints the exact create request (URL, headers with the key masked, body) without sending it.

**Manual live test (human only, after everything above passes):** cheapest call first (`mode=mini`, text-only, 5 s, 480p, audio off), then `seedance2.5`. Reference-image live tests run on a Netlify preview, because a local Supabase URL is not reachable by the provider.

## 11. Risks

| Risk                                 | Mitigation                                                               |
| ------------------------------------ | ------------------------------------------------------------------------ |
| Double charge (no idempotency key)   | Submit claim, no automatic retry, disabled button.                       |
| Video lost if never finalized        | 10-minute scheduled sweep plus page polling; stale-claim recovery.       |
| Provider URL can't read local images | Live image tests on preview only; documented.                            |
| IP allowlist blocks Netlify          | Documented in `docs/deployment.md`; key configured without an allowlist. |
| H.265 / 1080p playback issues        | 1080p not offered.                                                       |
| Cost runaway                         | Daily cap, 15 s max, mock by default.                                    |
