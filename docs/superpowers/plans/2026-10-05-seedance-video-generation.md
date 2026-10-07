# Seedance Video Generation Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking. Work test-first: write the failing test, run it, implement, run it green, commit.

**Goal:** Creators generate AI videos from `/creatorportal/ai-video/generate` through the AI Open Platform video API (Seedance). Finished videos land in My Videos, ready for the existing Post to TikTok flow, with a per-creator daily cap.

**Architecture:**

- `AiVideoTask` gains provider fields, claim timestamps and a `FAILED` status.
- A provider client in `src/lib/seedance/` has a mock implementation used by default, plus a hard live-guard.
- `src/lib/ai-video-generation.ts` owns the task lifecycle: submit with an atomic claim, sync, and finalize with an atomic claim.
- Finalize copies the provider video into the `aivideogenerated` bucket and inserts an `AiVideo` row. It runs in a Netlify background function in production and inline locally.
- A Netlify scheduled function sweeps `GENERATING` tasks every 10 minutes.
- The generate page is rewritten to submit and poll.

**Tech Stack:** Next.js 15 App Router, Prisma (Postgres), Supabase Storage (service role), Zod, Vitest, Playwright, Netlify Functions (background + scheduled).

**Spec:** [`docs/superpowers/specs/2026-10-05-seedance-video-generation-design.md`](../specs/2026-10-05-seedance-video-generation-design.md)

**Branch:** `feat/ai-video-seedance-generation`

**Token rule:** No step in this plan makes a live provider call. Live calls happen only in the human-run "Manual live test" after the PR is green.

---

## File Map

### Created

- `prisma/migrations/<timestamp>_ai_video_task_generation/migration.sql`: Prisma-generated.
- `src/lib/seedance/config.ts`: env reading, mode, allowed UI values, `isLiveEnabled()`.
- `src/lib/seedance/schema.ts`: zod `generationParamsSchema`, shared by client and server.
- `src/lib/seedance/types.ts`: `VideoProvider` interface, `ProviderStatus`, error classes.
- `src/lib/seedance/client.ts`: live provider (create, status, envelope parsing, error classes).
- `src/lib/seedance/mock.ts`: mock provider (in-memory, about 10 s to success, `[mock-fail]`).
- `src/lib/seedance/index.ts`: `getVideoProvider()` selects mock or live and applies the live-guard.
- `src/lib/seedance/errors.ts`: provider error → creator-facing message.
- `src/lib/seedance/__tests__/{client,mock,index,errors,schema}.test.ts`
- `src/lib/ai-video-generation.ts`: `submitTask`, `syncTask`, `finalizeTask`, `countTodayGenerations`, `remainingToday`.
- `src/lib/__tests__/ai-video-generation.test.ts`
- `src/lib/ai-video-finalize-auth.ts`: HMAC sign/verify for `{ taskId }`, same pattern as `src/lib/tiktok/relay-auth.ts`.
- `src/lib/__tests__/ai-video-finalize-auth.test.ts`
- `src/app/api/ai-videos/tasks/[id]/route.ts`: GET, ownership check, `syncTask`, signed video URL.
- `src/app/api/ai-videos/tasks/[id]/__tests__/route.test.ts`
- `netlify/functions/ai-video-finalize-background.ts`
- `netlify/functions/ai-video-sync-scheduled.ts`
- `netlify/functions/__tests__/ai-video-finalize-background.test.ts`
- `netlify/functions/__tests__/ai-video-sync-scheduled.test.ts`
- `scripts/seedance-dry-run.ts`: prints the create request without sending it.
- `e2e/creator/ai-video-generate.spec.ts`

### Modified

- `prisma/schema.prisma`: `AiVideoTask` fields and the `FAILED` enum value (spec §6).
- `src/lib/ai-video-task.ts`: `FAILED` in `STATUS_DISPLAY` and `baseStatusSchema`.
- `src/lib/supabase-admin.ts`: `AI_VIDEO_BUCKET` constant, plus `uploadToAiVideoBucket` and `createAiVideoSignedUrl` helpers. Bucket-specific variants keep existing call sites unchanged.
- `src/app/api/ai-videos/tasks/route.ts`: JSON branch accepts `params`, optional `portrait_path`, daily cap, `submitTask`.
- `src/app/api/ai-videos/tasks/__tests__/route.test.ts`: new cases.
- `src/app/creatorportal/ai-video/generate/page.tsx`: copy; passes `remaining`, `limit`, `isMock`.
- `src/app/creatorportal/ai-video/generate/GenerateVideoForm.tsx`: rewritten (spec §8).
- `src/app/creatorportal/ai-video/tasks/page.tsx` and `TaskRow.tsx`: null portrait, `FAILED`, sync of `GENERATING` rows.
- `src/app/storyclaw-admin/page.tsx` and `TaskAdminRow.tsx`: null portrait, `FAILED`.
- `scripts/studio-create-buckets.js`: add the `aivideogenerated` bucket (private, 200 MB).
- `e2e/ai-video-tasks.spec.ts`: portrait optional, new success copy.
- `.env.example`: new variables (names and comments only).
- `docs/architecture.md`, `docs/database.md`, `docs/deployment.md`, `docs/e2e.md`.

---

## Task 0: Pre-flight

- [ ] **Step 1:** Confirm the local stack is up (`npm run dev:infra`) and the local DB is migrated. Run in Git Bash with `DATABASE_URL`/`DIRECT_URL` exported to `postgres://postgres:postgres@localhost:54329/postgres`.
- [ ] **Step 2:** Baseline `npm run harness:prepush` (Git Bash) is green before any change.
- [ ] **Step 3:** Confirm no live env vars are set in `.env.local`: `grep -E '^(SEEDANCE_LIVE|VIDEO_API_KEY|VIDEO_API_BASE_URL)=' .env.local` returns nothing.

## Task 1: Schema and migration

**Files:** `prisma/schema.prisma`, new migration.

- [ ] **Step 1:** Edit `AiVideoTask` and `AiVideoTaskStatus` per spec §6. No new index is needed; the existing `@@index([status, createdAt])` covers the scheduled sweep.
- [ ] **Step 2:** Generate the migration against the **local** DB only:
  ```bash
  DATABASE_URL=postgres://postgres:postgres@localhost:54329/postgres \
  DIRECT_URL=postgres://postgres:postgres@localhost:54329/postgres \
  npx prisma migrate dev --name ai_video_task_generation
  ```
- [ ] **Step 3:** Review `migration.sql`. Expect: `ALTER TYPE "AiVideoTaskStatus" ADD VALUE 'FAILED'`, `ALTER COLUMN "portraitPath" DROP NOT NULL`, and new nullable columns only. No data loss.
- [ ] **Step 4:** `npm run prisma:generate && npm run typecheck`. Fix any `portraitPath: string | null` fallout in the admin and tasks pages; those changes go in Task 7.
- [ ] **Step 5:** Commit together with the Task 2 code that first uses the fields (schema and migration ship with dependent code, per `docs/database.md`).

## Task 2: Provider client (`src/lib/seedance/`)

- [ ] **Step 1: Tests first.** `src/lib/seedance/__tests__/client.test.ts` with `fetch` mocked:
  - Create posts to `${BASE}/ai-open-platform-api/v1/lz/video/task/create` with header `ApiKey`, `Content-Type: application/json`, and body:
    - `prompt`, explicit `mode`, `resolution`, `ratio`, `duration`, `generate_audio`;
    - `watermark: false`, `output_format: "mp4"`, `execution_expires_after: 3600`;
    - `images: [{ url, role: "reference_image" }]` only when an image is given.
  - Success requires HTTP 200 and `code === 0`. Returns `{ taskId, traceId }`.
  - HTTP 200 with `code != 0` → `ProviderRequestError` (message and traceId kept).
  - HTTP 429 with `40001` in the message → `ProviderBalanceError`.
  - Other non-200 → `ProviderSystemError`.
  - Abort/timeout → `ProviderUnknownOutcomeError` (create only).
  - Status posts `{ task_id }` and maps:
    - `pending` / `submitted` / `running` → `in_progress`;
    - `succeeded` → `{ videoUrl, completionTokens, duration }`;
    - `failed` → `{ error }`.
  - The API key never appears in any thrown error message.
- [ ] **Step 2:** `index.test.ts`, the live-guard:
  - Mock is selected unless `SEEDANCE_LIVE=1`, `VIDEO_API_KEY` and `VIDEO_API_BASE_URL` are all set.
  - With all three set but `NODE_ENV=test`, or `E2E_EXPLORE=1`, or `E2E_AGENT=1`, `getVideoProvider()` returns the mock (it originally threw; changed so a developer's `.env.local` can't affect E2E runs).
- [ ] **Step 3:** `mock.test.ts`:
  - Create returns a `mock-` id.
  - Status is `in_progress` before 10 s and `succeeded` after (use fake timers). The `videoUrl` points at the fixture source.
  - A `[mock-fail]` prompt yields `failed`.
- [ ] **Step 4:** `errors.test.ts`: each row of spec §7 "Error mapping".
- [ ] **Step 5:** `schema.test.ts`: allowed ratio, duration and resolution values; defaults.
- [ ] **Step 6:** Implement the code until all tests are green. Use `fetchWithTimeout` from `src/lib/tiktok/fetch-with-timeout.ts` (20 s for create, 10 s for status).
- [ ] **Step 7: Mock video source.** The mock's "provider URL" is served by downloading `e2e/fixtures/output-sample.mp4` from disk inside `finalizeTask` when `provider === "mock"`. No network needed. Keep this branch inside the provider abstraction (`provider.downloadVideo(result)`), so the lifecycle code is identical for both.
- [ ] **Step 8:** `scripts/seedance-dry-run.ts`: builds the create request with the real builder and prints the method, URL (or `{BASE_URL}` when unset), headers with the key masked, and pretty JSON body. It never calls `fetch`.
- [ ] **Step 9:** Commit: `feat(ai-video): add seedance provider client with mock default`.

## Task 3: Lifecycle (`src/lib/ai-video-generation.ts`)

- [ ] **Step 1: Tests first** (`src/lib/__tests__/ai-video-generation.test.ts`, with Prisma, provider and storage mocked):
  - `submitTask`:
    - Claims via `updateMany({ where: { id, submitStartedAt: null } })`. When `count === 0` it does not call the provider.
    - On success it writes `providerTaskId`, `traceId` and `GENERATING`.
    - On `ProviderUnknownOutcomeError` it writes `FAILED`, `failureCode = unknown_outcome` and the unknown-outcome message, and is **not retried** (provider called exactly once).
    - On other errors it writes `FAILED`, `failureCode = submit_rejected` and the mapped message.
  - `syncTask`:
    - No-op unless `GENERATING`. Always updates `lastCheckedAt` after a status call.
    - `in_progress` and older than 75 min → `FAILED`, `failureCode = timeout`.
    - `failed` → `FAILED`, `failureCode = provider_failed`.
    - `succeeded` → triggers finalize (dispatch on Netlify, inline otherwise).
  - `finalizeTask`:
    - Claims `finalizeStartedAt` (null, or older than 20 min).
    - Downloads, uploads to `aivideogenerated/${creatorId}/${taskId}.mp4`, inserts `AiVideo`, sets `DELIVERED`, `aiVideoId` and `completionTokens`.
    - Two concurrent calls → one upload, one `AiVideo` row.
    - An upload failure releases the claim (sets `finalizeStartedAt` back to null) so the next sync retries.
  - `countTodayGenerations`: counts the creator's tasks with `submitStartedAt >= start of UTC day` that may have used tokens (spec §6 "Daily cap counting"):
    - `GENERATING` and `DELIVERED` count.
    - `FAILED` counts only with `failureCode = unknown_outcome`.
    - `submit_rejected`, `provider_failed`, `timeout` and never-submitted `QUEUED` do not count.
    - Test each case, plus the UTC day boundary. `remainingToday` = `max(0, limit - count)`.
- [ ] **Step 2:** Implement until green. Reference-image URL: `createSignedUrl(portraitPath, 6 * 3600)` from `src/lib/supabase-admin.ts`.
- [ ] **Step 3:** Commit: `feat(ai-video): add generation task lifecycle with atomic claims`.

## Task 4: API routes

- [ ] **Step 1: Tests first.**
  - Extend `src/app/api/ai-videos/tasks/__tests__/route.test.ts`:
    - Params are validated.
    - `portrait_path` is optional; `taskId` is minted when absent.
    - 429 when `remainingToday === 0`.
    - `submitTask` is called after insert.
    - The response carries the post-submit status.
    - The multipart branch is unchanged (existing tests still pass).
  - New `src/app/api/ai-videos/tasks/[id]/__tests__/route.test.ts`:
    - 401 without a session.
    - 404 for a missing task or another creator's task.
    - Calls `syncTask`.
    - `videoUrl` only when `DELIVERED`.
- [ ] **Step 2:** Implement until green.
- [ ] **Step 3:** Commit: `feat(ai-video): submit and poll generation tasks via API`.

## Task 5: Netlify functions

- [ ] **Step 1: Tests first.**
  - `ai-video-finalize-auth.test.ts`: sign/verify round trip; rejects a tampered taskId, an expired timestamp and a missing header.
  - `ai-video-finalize-background.test.ts`:
    - 405 on non-POST.
    - 400 on a bad payload.
    - 401 on bad auth.
    - Calls `finalizeTask(taskId)` on success.
    - A thrown error is logged with no URLs.
  - `ai-video-sync-scheduled.test.ts`:
    - Empty → one query, no provider calls.
    - Orders by `lastCheckedAt` ascending, never-checked first.
    - Runs at most 5 checks at a time.
    - Starts no new check after the 20 s budget (fake timers); the remaining tasks are left for the next run.
    - One `syncTask` throwing does not stop the rest.
    - Exports `config.schedule === "*/10 * * * *"`.
- [ ] **Step 2:** Implement. The background dispatch mirrors `src/lib/tiktok/background-dispatch.ts`: base URL from `DEPLOY_PRIME_URL || URL`; when neither is set (local `next dev`), finalize runs inline.
- [ ] **Step 3:** Commit: `feat(ai-video): add finalize background and scheduled sync functions`.

## Task 6: Generate page

- [ ] **Step 1: E2E first.** `e2e/creator/ai-video-generate.spec.ts` (mock provider, `asCreator`):
  - Fill the prompt and pick 9:16 / 5 s / 480p → Generate → "Generating" is visible → within 30 s a `<video>` is visible → `/creatorportal/ai-video` shows one more video in My Videos.
  - A `[mock-fail]` prompt shows a failed message and a "Try again" button.
  - Mock banner visible.
  - Cap: set `AI_VIDEO_DAILY_LIMIT=1` for the run, generate once, reload → button disabled with "0 generations left today".
- [ ] **Step 2:** Run `npm run e2e:agent -- --grep "ai-video generate"`, then read `.e2e/runs/latest/summary.md`. If the Docker E2E stack can't run on this Windows machine (`network_mode: host`), say so explicitly in the PR and use `npm run e2e -- e2e/creator/ai-video-generate.spec.ts` against `npm run dev:e2e`.
- [ ] **Step 3:** Rewrite `GenerateVideoForm.tsx` per spec §8:
  - Reuse `requestUploadUrl`/`putFile` from the current file.
  - Reuse `PORTRAIT_MIME_TO_EXT` / `PORTRAIT_MAX_BYTES` from `src/lib/ai-video-task.ts`.
  - Read image dimensions with `createImageBitmap` for the 300–6000 px and 0.4–2.5 checks.
  - Keep the existing card and button classes.
- [ ] **Step 4:** Update `page.tsx` (server): session → `remainingToday`, `limit`, `isMock` → props.
- [ ] **Step 5:** Update `e2e/ai-video-tasks.spec.ts`.
- [ ] **Step 6:** Commit: `feat(ai-video): rebuild generate page around seedance tasks`.

## Task 7: Related pages and bucket

- [ ] **Step 1:** `tasks/page.tsx` and `TaskRow.tsx`:
  - Skip signing a null `portraitPath`.
  - Show `FAILED` with `errorMessage`.
  - Before rendering, `await Promise.allSettled` of `syncTask` for `GENERATING` rows (at most 10).
- [ ] **Step 2:** `storyclaw-admin/page.tsx` and `TaskAdminRow.tsx`: null portrait, `FAILED` option display.
- [ ] **Step 3:** `src/lib/ai-video-task.ts`: `FAILED` in `STATUS_DISPLAY` (`bg-rose-100 text-rose-700`) and `baseStatusSchema`. Update `src/lib/__tests__/ai-video-task.test.ts`.
- [ ] **Step 4:** `scripts/studio-create-buckets.js`: add `{ id: "aivideogenerated", public: false, fileSizeLimit: 200 * 1024 * 1024 }`. Run it against local Supabase.
- [ ] **Step 5:** Commit: `feat(ai-video): show failed generations and add library bucket`.

## Task 8: Docs and env

- [ ] **Step 1:** `.env.example`: `VIDEO_API_BASE_URL=`, `VIDEO_API_KEY=`, `SEEDANCE_LIVE=`, `SEEDANCE_MODE=seedance2.5`, `AI_VIDEO_DAILY_LIMIT=5`, with comments explaining the mock default and the live rule.
- [ ] **Step 2:** `docs/architecture.md`: add the video provider and the scheduled and background functions to the request-flow section.
- [ ] **Step 3:** `docs/database.md`: `AiVideoTask` field changes and the `FAILED` status.
- [ ] **Step 4:** `docs/deployment.md`: required env vars; the no-IP-allowlist note; scheduled functions run only on published deploys.
- [ ] **Step 5:** `docs/e2e.md`: mock provider behaviour and `[mock-fail]`.
- [ ] **Step 6:** Commit: `docs(ai-video): document seedance generation setup`.

## Task 9: Verify and PR

- [ ] **Step 1:** `npm run harness:prepush` (Git Bash) is green.
- [ ] **Step 2:** Manual mock run: `npm run dev`, log in as `creator-starter@test.local`, then generate, see the video, find it in My Videos, check the fail path, and hit the cap. Capture screenshots.
- [ ] **Step 3:** `npx tsx scripts/seedance-dry-run.ts`, and attach the output (key masked) to the PR for comparison with the provider doc.
- [ ] **Step 4:** Push the branch (the pre-push hook runs). Open a PR with motivation, changes, validation commands, screenshots and a link to this plan. Wait for the Netlify preview smoke to be green.
- [ ] **Step 5:** On the preview (mock mode), trigger the scheduled function manually and confirm a `GENERATING` task gets finalized.

## Manual live test (human only; billable; after Task 9)

1. Get the Base URL and ApiKey from the provider console. Confirm the balance, and that the key has no IP allowlist (or your IP is on it).
2. In your local `.env.local` only: `VIDEO_API_BASE_URL`, `VIDEO_API_KEY`, `SEEDANCE_LIVE=1`, `SEEDANCE_MODE=mini`. Restart `npm run dev`; the mock banner should be gone.
3. Run `npx tsx scripts/seedance-dry-run.ts` and compare with the doc.
4. Generate once: text only, 5 s, 480p, audio off. Confirm it is delivered, plays in My Videos, and `completionTokens` and `traceId` are recorded.
5. Switch to `SEEDANCE_MODE=seedance2.5` and repeat once. Test reference images (including a creator photo) on a Netlify preview.
6. Remove `SEEDANCE_LIVE` locally. Enable it in Netlify env only at launch.
