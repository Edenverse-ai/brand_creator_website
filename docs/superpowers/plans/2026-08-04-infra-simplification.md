# Infra Restructure & Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the platform from ~9 hosted surfaces (Netlify + ECS + ECR + CloudWatch + 2 deploy pipelines + hand-rolled fake-Supabase docker stack) to 3 (Netlify + Supabase + Stripe) by folding the FastAPI/ECS backend into the existing Next.js app, with zero URL-contract changes for clients.

**Architecture:** Strangler-fig migration (Fowler): each Next.js API route that currently proxies to FastAPI gets its logic inlined (Prisma for CRUD, supabase-js for storage), deployed, verified, then the Python route dies. Large media moves via industry-standard presigned direct-to-storage uploads (browser → Supabase Storage, server only mints URLs). The one long-running job (TikTok publish relay) is eliminated via TikTok `PULL_FROM_URL` (TikTok fetches the file itself; server does init + poll — the standard 202/poll async pattern). AWS is decommissioned only after a traffic-drain observation window. Local/E2E infra switches from the hand-rolled 6-container fake to the official `supabase` CLI.

**Tech Stack:** Next.js 15 (App Router) on Netlify, Prisma 6 → Supabase Postgres (pooler), supabase-js v2 (storage), NextAuth 4, zod v4, vitest, Playwright, Supabase CLI.

## Global Constraints

- **URL contracts frozen:** every public path under `/api/*` keeps method, path, request and response JSON shape exactly as today. Clients must not change (except where a task explicitly updates a client for presigned upload).
- **Auth:** every ported mutating route gains `getServerSession(authOptions)` guard unless the legacy behavior is intentionally public (contact, career apply, pear auth) — those get zod validation + rate limiting via existing `check-rate-limit` pattern instead.
- **Validation:** zod at every boundary (already dependency, v4).
- **Immutability, files <800 lines, functions <50 lines** (repo rules).
- **Each phase = one PR to `main`**, passing `npm run harness:prepush` + `npm run e2e` before merge. Conventional commits (`feat:`, `fix:`, `refactor:`, `chore:`), no attribution footer.
- **Rollback lever during Phases 2–4:** FastAPI/ECS stays running untouched. A ported route rolls back by `git revert` of its commit (proxy code returns). Nothing on AWS is deleted until Phase 5 gate passes.
- **Key identifiers (copy verbatim):**
  - Netlify site: `brand-creator-portal`, id `c3651dcd-7532-4b54-a0f0-e062cf11a6ab`, prod domain `https://cricher.ai`
  - ECS: `arn:aws:ecs:us-east-2:202716106225:service/default/cricher-backend`, region `us-east-2`
  - ECR: `202716106225.dkr.ecr.us-east-2.amazonaws.com/cricher-backend`
  - CloudWatch log group: `/ecs/cricher-backend`
  - Supabase project ref: `loesykbqlhynbjmqxfxc`
  - Buckets: `campaigns`, `aivideogenerated`, `ai-video-tasks`
  - TikTok API: `https://open.tiktokapis.com/v2/post/publish/video/init/`, `https://open.tiktokapis.com/v2/post/publish/status/fetch/`

---

## Phase 0 — Safety net (do first, no code changes)

### Task 0.1: Rotate exposed secrets

`SUPABASE_SERVICE_KEY` (service_role JWT) and `SMTP_PASSWORD` (Gmail app password) are readable in plaintext by anyone with `ecs:Describe*` IAM. Treat as exposed. **User performs dashboard steps; engineer performs CLI steps.**

- [ ] **Step 1 (user):** Supabase dashboard → project `loesykbqlhynbjmqxfxc` → Settings → API Keys → rotate/regenerate the service role key (if on legacy JWT keys, migrate to new `sb_secret_...` API keys — Supabase's current standard; anon/publishable key changes too).
- [ ] **Step 2 (user):** Google account for `info@borderxmedia.com` → Security → App passwords → revoke current, create new.
- [ ] **Step 3:** Update Netlify env (both keys + publishable if rotated):

```bash
npx netlify env:set SUPABASE_SERVICE_KEY "<new>" && \
npx netlify env:set SMTP_PASSWORD "<new>" && \
npx netlify env:set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "<new-if-rotated>"
```

- [ ] **Step 4:** Update ECS env with same values (keeps backend alive during migration). Get current config, patch environment array, update:

```bash
aws ecs describe-express-gateway-service \
  --service arn:aws:ecs:us-east-2:202716106225:service/default/cricher-backend \
  --region us-east-2 --query "service.activeConfigurations[0].primaryContainer" > /tmp/pc.json
# edit /tmp/pc.json environment entries for SUPABASE_SERVICE_KEY, SMTP_PASSWORD, then:
aws ecs update-express-gateway-service \
  --service-arn arn:aws:ecs:us-east-2:202716106225:service/default/cricher-backend \
  --primary-container file:///tmp/pc.json --region us-east-2
```

- [ ] **Step 5:** Verify: `curl -s https://cricher.ai/ -o /dev/null -w "%{http_code}"` → `200`; submit contact form on prod; check a storage-backed page renders. Trigger Netlify redeploy so functions pick up env: `npx netlify deploy --build --prod` or push empty commit.
- [ ] **Step 6:** Update local `.env`, `.env.netlify` reference file. Never commit values.

### Task 0.2: Start ECS traffic baseline (observation window for Phase 5 gate)

- [ ] **Step 1:** Confirm requests are visible in logs (uvicorn access log lines in `/ecs/cricher-backend`):

```bash
aws logs start-query --log-group-name /ecs/cricher-backend --region us-east-2 \
  --start-time $(date -v-7d +%s) --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /HTTP/ | sort @timestamp desc | limit 50'
# then: aws logs get-query-results --query-id <id> --region us-east-2
```

- [ ] **Step 2:** Save the query string in `docs/superpowers/plans/notes-ecs-drain.md` with today's date. This exact query is re-run at Phase 5 as the decommission gate ("only `/health` for 7 consecutive days").

### Task 0.3: Baseline tag

- [ ] **Step 1:** `git tag pre-infra-simplification && git push origin pre-infra-simplification`

---

## Phase 1 — Dead weight removal (PR 1, zero behavior change)

### Task 1.1: Delete junk paths

**Files:** Delete: `--version/`, `src/app/frontend/`, `src/app/pages/`, `backend/app/legacy/`

- [ ] **Step 1:** Verify nothing imports them:

```bash
grep -rn "app/frontend\|app/pages\|legacy/campaigns" src backend --include="*.ts" --include="*.tsx" --include="*.py" | grep -v node_modules | grep -v .venv
```

Expected: no hits (or only self-references inside deleted dirs).

- [ ] **Step 2:** `git rm -r -- --version src/app/frontend src/app/pages backend/app/legacy`
- [ ] **Step 3:** Ensure build artifacts are ignored, not tracked: `git check-ignore playwright-report test-results .mypy_cache .ruff_cache || echo ADD-TO-GITIGNORE` — if any not ignored, add to `.gitignore` and `git rm -r --cached` them.
- [ ] **Step 4:** `npm run typecheck && npm run lint && npm run build` → all pass.
- [ ] **Step 5:** `git commit -m "chore: remove dead directories (legacy backend app, pages-router leftovers, junk)"`

### Task 1.2: Dependency dedupe

**Files:** Modify: `package.json`, the 2 files importing `bcrypt`, the 1 file importing `react-chartjs-2`, the 2 files importing `axios`, the 2 files importing `react-icons`

- [ ] **Step 1:** Locate targets: `grep -rln "\"bcrypt\"\|'bcrypt'" src/` ; `grep -rln "react-chartjs-2" src/` ; `grep -rln "axios" src/` ; `grep -rln "react-icons" src/`
- [ ] **Step 2:** `bcrypt` → `bcryptjs` (pure-JS, no native binary — the safe choice inside Lambda-backed Netlify functions). Same API surface for `hash`/`compare`:

```ts
// before: import bcrypt from "bcrypt";
import bcrypt from "bcryptjs"; // hash(pw, 10) / compare(pw, hash) unchanged
```

**Compatibility note:** both libs produce/verify `$2a$/$2b$` hashes interchangeably — existing stored hashes keep verifying.

- [ ] **Step 3:** Rewrite the single `react-chartjs-2` chart with `recharts` (already used elsewhere — copy the existing recharts usage style from the other chart file found in Step 1's grep).
- [ ] **Step 4:** Replace `axios` calls with native `fetch` (Next polyfills server-side): `axios.get(url)` → `await fetch(url)` + `await res.json()`, error check via `res.ok`.
- [ ] **Step 5:** Replace 2 `react-icons` imports with `lucide-react` equivalents (45 files already use lucide).
- [ ] **Step 6:** `npm uninstall bcrypt @types/bcrypt axios @types/node-fetch chart.js react-chartjs-2 react-icons @auth/prisma-adapter`
- [ ] **Step 7:** `npm run typecheck && npm run lint && npm run test:run && npm run build` → pass. `npm run e2e -- e2e/smoke` → pass.
- [ ] **Step 8:** `git commit -m "chore: dedupe dependencies (one bcrypt, one chart lib, one icon set, drop axios)"`

---

## Phase 2 — Presigned direct uploads (PR 2)

Standard pattern (S3/GCS/Supabase all document it): server mints short-lived signed upload URL; browser PUTs bytes directly to storage; server records the path. Removes every byte-passthrough through Netlify functions (~4.5MB effective cap today).

### Task 2.1: Shared signed-upload helper

**Files:**

- Create: `src/lib/storage/signed-upload.ts`
- Test: `src/lib/storage/__tests__/signed-upload.test.ts`

**Interfaces:**

- Consumes: `getSupabaseAdmin()` from `src/lib/supabase-admin.ts`
- Produces: `createSignedUpload(bucket: string, path: string): Promise<{ uploadUrl: string; path: string; token: string }>` — used by Tasks 2.2, 2.3, 2.4

- [ ] **Step 1: Failing test**

```ts
// src/lib/storage/__tests__/signed-upload.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const createSignedUploadUrl = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    storage: { from: () => ({ createSignedUploadUrl }) },
  }),
}));

import { createSignedUpload } from "../signed-upload";

describe("createSignedUpload", () => {
  beforeEach(() => createSignedUploadUrl.mockReset());

  it("returns url, path and token from supabase", async () => {
    createSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: "https://x/upload?token=t1", path: "a/b.mp4", token: "t1" },
      error: null,
    });
    const out = await createSignedUpload("aivideogenerated", "a/b.mp4");
    expect(out).toEqual({ uploadUrl: "https://x/upload?token=t1", path: "a/b.mp4", token: "t1" });
  });

  it("throws on supabase error", async () => {
    createSignedUploadUrl.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(createSignedUpload("campaigns", "x.jpg")).rejects.toThrow(/boom|signed/i);
  });
});
```

- [ ] **Step 2:** `npm run test:run -- signed-upload` → FAIL (module not found).
- [ ] **Step 3: Implement**

```ts
// src/lib/storage/signed-upload.ts
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export interface SignedUpload {
  uploadUrl: string;
  path: string;
  token: string;
}

export async function createSignedUpload(bucket: string, path: string): Promise<SignedUpload> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(
      `signed upload URL failed for ${bucket}/${path}: ${error?.message ?? "no data"}`
    );
  }
  return { uploadUrl: data.signedUrl, path: data.path, token: data.token };
}
```

- [ ] **Step 4:** `npm run test:run -- signed-upload` → PASS.
- [ ] **Step 5:** `git commit -m "feat(storage): shared presigned upload helper"`

### Task 2.2: AI-video assets go presigned

**Files:**

- Create: `src/app/api/ai-videos/upload-url/route.ts`
- Modify: `src/app/api/ai-videos/generate/route.ts` (accept JSON `{ prompt, voice_sample_path?, reference_image_path? }` in addition to legacy multipart during transition)
- Modify: client `src/app/creatorportal/ai-video/post/page.tsx` + `src/app/creatorportal/ai-video/data.ts` (upload direct, then submit paths)

**Interfaces:**

- Consumes: `createSignedUpload` (Task 2.1); NextAuth session
- Produces: `POST /api/ai-videos/upload-url` → `{ uploadUrl, path, token }`; browser then calls `supabase.storage.from(bucket).uploadToSignedUrl(path, token, file)` or plain `PUT uploadUrl`

- [ ] **Step 1: Route (session-guarded, zod-validated, path convention `{userId}/{uuid}.{ext}`):**

```ts
// src/app/api/ai-videos/upload-url/route.ts
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { createSignedUpload } from "@/lib/storage/signed-upload";

const Body = z.object({
  kind: z.enum(["voice_sample", "reference_image"]),
  ext: z.enum(["mp3", "wav", "m4a", "jpg", "jpeg", "png", "webp"]),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { kind, ext } = parsed.data;
  const path = `${session.user.id}/${kind}-${randomUUID()}.${ext}`;
  try {
    const signed = await createSignedUpload("aivideogenerated", path);
    return NextResponse.json(signed);
  } catch (e) {
    console.error("upload-url mint failed:", e);
    return NextResponse.json({ error: "Failed to create upload URL" }, { status: 500 });
  }
}
```

- [ ] **Step 2:** Client: on submit, for each selected file `POST /api/ai-videos/upload-url` → `PUT` bytes to `uploadUrl` with `Content-Type` of the file → collect `path`s → send JSON to `/api/ai-videos/generate` with paths instead of files. Mirror the fetch style already in `data.ts`.
- [ ] **Step 3:** `generate` route: accept the JSON body variant; when paths present, skip FastAPI multipart forwarding for assets (full CRUD port of `generate` happens in Task 4.6 — for now still forward prompt+paths as JSON to FastAPI `POST /ai-videos/generate` only if that endpoint accepts it; otherwise gate this client flip to land together with Task 4.6 in the same PR. Decision point for implementer: if FastAPI needs changes to accept paths, do NOT touch Python — land 2.2 and 4.6 together.)
- [ ] **Step 4:** Playwright: extend existing `e2e` ai-video spec (see `test-results/ai-video-tasks-*` naming for the spec file) to run the presigned flow against local stack.
- [ ] **Step 5:** `npm run harness:prepush && npm run e2e` → pass. Commit `feat(ai-video): presigned direct asset uploads`.

### Task 2.3: TikTok verification uploads → Next

**Files:**

- Create: `src/app/api/tiktokverification/upload-urls/logic.ts` (port of `generate_upload_urls` from `backend/app/main/services/tiktokverify.py` — mirror its bucket name and path scheme exactly; read that file for the bucket constant)
- Modify: `src/app/api/tiktokverification/upload-urls/route.ts` (drop proxy, call logic)
- Modify: `src/app/api/tiktokverification/route.ts` (port `submit_verification_with_paths` → Prisma `influencer_verifications` insert, field-for-field from `backend/app/main/models/tiktokverify.py`)

- [ ] **Step 1:** Read `backend/app/main/services/tiktokverify.py` `generate_upload_urls` + `upload_files`; copy bucket + path template into `logic.ts` using `createSignedUpload`.
- [ ] **Step 2:** Contract test (strangler-fig golden check) — run old and new side by side locally:

```bash
curl -s -X POST localhost:12000/api/tiktokverification/upload-urls -H 'content-type: application/json' -d '{"id_number":"TEST123","files":[{"kind":"signed_auth","ext":"pdf"}]}' | jq 'keys'
# Expected: same top-level keys as FastAPI response (compare against http://<ecs>/tiktokverification/upload-urls)
```

- [ ] **Step 3:** Multipart legacy route (`upload_verification`) is NOT ported — it's the pattern presigned replaces; frontend must already use upload-urls (verify with `grep -rn "upload-urls" src/`). If any client still posts multipart, flip it to presigned in this task.
- [ ] **Step 4:** `npm run harness:prepush && npm run e2e` → pass. Commit `feat(tiktok-verify): native presigned uploads + submission`.

### Task 2.4: Campaign image upload → presigned

**Files:**

- Modify: `src/app/api/campaigns/upload/route.ts` (mint signed URL for bucket `campaigns`, path scheme copied from `backend/app/main/services/upload_service.py` `_upload_to_campaigns_bucket` callers; enforce `image/jpeg|png|webp|gif` + 5MB via zod on declared type and client-side size check — storage-side hard cap optional via bucket file-size limit in Supabase dashboard)
- Modify: its calling client component (find via `grep -rn "campaigns/upload" src/`)

- [ ] **Step 1:** Implement route in the exact shape of Task 2.2's route (bucket `campaigns`, `kind: z.enum(["campaign_image"])`, ext enum `jpg|jpeg|png|webp|gif`).
- [ ] **Step 2 (user, dashboard):** set bucket-level file size limit 5MB + allowed MIME types on `campaigns` and `aivideogenerated` buckets (server-side enforcement, standard Supabase control).
- [ ] **Step 3:** Verify old public URL shape still returned where client expects it: `getPublicUrl` result = `https://loesykbqlhynbjmqxfxc.supabase.co/storage/v1/object/public/campaigns/<path>` — unchanged because bucket/path unchanged.
- [ ] **Step 4:** harness + e2e pass → commit `feat(campaigns): presigned image upload`.

---

## Phase 3 — TikTok publish without a relay (PR 3)

### Task 3.1: Public media proxy for PULL_FROM_URL

TikTok's `PULL_FROM_URL` requires the video URL be under a **verified URL prefix you own**. `*.supabase.co` can't be verified. Standard fix: same-domain CDN proxy rewrite (bytes flow Netlify CDN → no function, no timeout).

**Files:** Modify: `netlify.toml`; Create: `public/<tiktok-signature-file>.txt` (from TikTok console)

- [ ] **Step 1:** Append to `netlify.toml`:

```toml
[[redirects]]
  force = true
  from = "/media/*"
  to = "https://loesykbqlhynbjmqxfxc.supabase.co/storage/v1/:splat"
  status = 200
```

Query strings (the `?token=` on signed URLs) pass through on Netlify 200-proxies by default.

- [ ] **Step 2:** Deploy preview; verify by signing any object then fetching it through the proxy:

```bash
# mint a signed URL via supabase-js or dashboard, transform host:
# https://loesykbqlhynbjmqxfxc.supabase.co/storage/v1/object/sign/aivideogenerated/X?token=T
# → https://<preview>.netlify.app/media/object/sign/aivideogenerated/X?token=T
curl -s -o /dev/null -w "%{http_code}" "https://cricher.ai/media/object/sign/aivideogenerated/<path>?token=<t>"
```

Expected: `200`, correct `Content-Length`.

- [ ] **Step 3 (user):** TikTok developer console → app → URL properties → verify prefix `https://cricher.ai/media/` (place provided signature file in `public/`, deploy, click verify).
- [ ] **Step 4:** Commit `feat(media): same-domain storage proxy for TikTok PULL_FROM_URL`.

### Task 3.2: Port publish init + status to Next (PULL_FROM_URL)

**Files:**

- Create: `src/app/api/tiktok/publish/route.ts`
- Create: `src/app/api/tiktok/publish-status/route.ts`
- Modify: client `src/app/creatorportal/ai-video/post/page.tsx` (call new routes; poll status)

**Interfaces:**

- Consumes: signed URL minting (supabase-admin, 30-min expiry as today: `create_signed_url(path, 60*30)`); session auth
- Produces: `POST /api/tiktok/publish` body `{ access_token, videos: [{ id, video_path?, video_url?, title?, privacy_level, disable_comment?, disable_duet?, disable_stitch?, brand_content_toggle?, brand_organic_toggle? }] }` → `{ results: [{ id, status, publish_id?, error? }] }`; `POST /api/tiktok/publish-status` body `{ access_token, publish_ids: string[] }` → `{ results: [...] }` (same shapes as FastAPI today — see `backend/app/main/routes/tiktok_upload.py` `UploadRequest`/`PublishStatusRequest`)

- [ ] **Step 1: publish route** — mirror `_init_tiktok_publish` post_info exactly, but `source_info` becomes PULL_FROM_URL and the relay disappears:

```ts
// src/app/api/tiktok/publish/route.ts  (core logic; wrap with session guard + zod like Task 2.2)
const TIKTOK_INIT = "https://open.tiktokapis.com/v2/post/publish/video/init/";

async function signedProxyUrl(path: string): Promise<string> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage
    .from("aivideogenerated")
    .createSignedUrl(path, 60 * 30);
  if (error || !data?.signedUrl) throw new Error(`sign failed: ${error?.message}`);
  // host+/storage/v1 → cricher.ai/media  (verified TikTok prefix, Task 3.1)
  return data.signedUrl.replace(
    "https://loesykbqlhynbjmqxfxc.supabase.co/storage/v1",
    "https://cricher.ai/media"
  );
}

async function initPublish(accessToken: string, video: VideoInput, videoUrl: string) {
  const res = await fetch(TIKTOK_INIT, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      post_info: {
        title: (video.title ?? "AI video").slice(0, 150),
        privacy_level: video.privacy_level,
        disable_comment: video.disable_comment ?? true,
        disable_duet: video.disable_duet ?? true,
        disable_stitch: video.disable_stitch ?? true,
        brand_content_toggle: video.brand_content_toggle ?? false,
        brand_organic_toggle: video.brand_organic_toggle ?? true,
      },
      source_info: { source: "PULL_FROM_URL", video_url: videoUrl },
    }),
  });
  const data = await res.json().catch(() => ({}));
  const publishId = data?.data?.publish_id;
  if (!res.ok || !publishId) throw new Error(`TikTok init failed: ${JSON.stringify(data)}`);
  return publishId as string;
}
```

Route handler: session guard → zod parse → for each video: resolve `videoUrl` (`video.video_url` verbatim, else `signedProxyUrl(video.video_path)`) → `initPublish` → push `{ id, status: "ok", publish_id }`; catch per-video into `{ id, status: "error", error }`. Return `{ results }`. Whole call = a few seconds regardless of file size.

- [ ] **Step 2: publish-status route** — direct port of `_fetch_publish_status` loop (fetch per id, 30s timeout, same result envelope).
- [ ] **Step 3:** Unit tests with mocked `fetch` (vitest `vi.stubGlobal("fetch", ...)`): init success, init failure envelope, status loop partial failure. Run → PASS.
- [ ] **Step 4:** Client flip: point post page at `/api/tiktok/publish`; after `ok`, poll `/api/tiktok/publish-status` every 5s until TikTok status `PUBLISH_COMPLETE`/`FAILED` (statuses surface in the payload passthrough — same as today).
- [ ] **Step 5:** Manual verify on deploy preview with a real small video + sandbox TikTok account. Then commit `feat(tiktok): PULL_FROM_URL publish, retire byte relay`.

**Fallback (only if TikTok denies PULL_FROM_URL for the app):** implement the relay as a Netlify **background function** (15-min limit): `netlify/functions/tiktok-publish-background.mts` containing the Python `_stream_upload` logic (fetch signed URL → PUT to TikTok `upload_url` with `Content-Range`), invoked by the publish route, client polls status. Note TikTok single-chunk cap = 64MB — chunk in 10MB parts above that (fixes a latent bug in today's Python, which always sends one chunk).

---

## Phase 4 — CRUD strangler port (PRs 4a–4f, one domain each)

**Method per domain (identical every time):**

1. Read the named Python route+service+model files; write the Next route logic field-for-field (Prisma model names below are already in `prisma/schema.prisma`).
2. Golden contract check: `curl` old (ECS) vs new (localhost:12000) for the same request → `jq -S .` both → `diff`. Shapes must match byte-for-byte (key order aside).
3. `npm run harness:prepush && npm run e2e` → merge → watch Netlify function logs 48h.
4. Delete the Python route file + router registration in `backend/app/main/main.py` (backend keeps deploying smaller until Phase 5 removes it entirely).

**Domain map (source of truth for every port):**

| PR  | Next route(s)                                                                                           | Python source                                                                                                                       | Data target                                                         |
| --- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 4a  | `api/contact`                                                                                           | `routes/contact.py` + `services/contact_service.py`                                                                                 | Prisma `Contact` + `sendMail` from `src/lib/email.ts`               |
| 4b  | `api/career/apply`                                                                                      | `routes/career.py` + `services/career_service.py`                                                                                   | Prisma model per `models/career.py` + `src/lib/email.ts`            |
| 4c  | `api/pear`, `api/pear/auth`                                                                             | `routes/pear.py` + `services/pear.py`                                                                                               | Prisma `pear_brand`                                                 |
| 4d  | `api/entertainment-live`, `api/entertainment-live/[id]`                                                 | `routes/entertainment.py` + `services/entertainment_live.py`                                                                        | Prisma `entertainment_live`                                         |
| 4e  | `api/campaigns*`, `api/brand/campaigns*`, `api/creator/campaign-claims`, `api/applications/[id]/status` | `routes/campaigns.py`, `routes/claims.py`, `services/campaign_service.py`, `services/brand_service.py`, `services/claim_service.py` | Prisma `campaigns`, `campaignclaims`                                |
| 4f  | `api/ai-videos/*`                                                                                       | `routes/ai_video.py` + `services/ai_video_service.py`                                                                               | Prisma `AiVideoRequest`/`AiVideo` + storage helpers (Tasks 2.1/2.2) |

### Task 4a worked example (template for 4b–4f): contact

**Files:**

- Modify: `src/app/api/contact/route.ts`
- Test: `src/app/api/contact/__tests__/route.test.ts`

- [ ] **Step 1: Failing test** (mock prisma + mailer):

```ts
import { describe, it, expect, vi } from "vitest";
const create = vi.fn().mockResolvedValue({ id: "c1" });
vi.mock("@/lib/prisma", () => ({ prisma: { contact: { create } } }));
const sendMail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({ sendMail }));
import { POST } from "../route";

it("stores contact and sends notification", async () => {
  const req = new Request("http://x/api/contact", {
    method: "POST",
    body: JSON.stringify({ name: "A", email: "a@b.co", subject: "Hi", message: "Yo" }),
    headers: { "content-type": "application/json" },
  });
  const res = await POST(req as never);
  expect(res.status).toBe(200);
  expect(create).toHaveBeenCalledOnce();
  expect(sendMail).toHaveBeenCalledOnce();
});

it("rejects invalid payload", async () => {
  const req = new Request("http://x/api/contact", {
    method: "POST",
    body: "{}",
    headers: { "content-type": "application/json" },
  });
  const res = await POST(req as never);
  expect(res.status).toBe(400);
});
```

(Adjust `sendMail` import name to the actual export in `src/lib/email.ts`; adjust Contact fields to `backend/app/main/models/contact.py` + Prisma `Contact` — the test asserts behavior, not field lists.)

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement: zod schema mirroring `models/contact.py`, `prisma.contact.create`, fire mailer with same recipient/subject template as `contact_service.py` (copy strings verbatim), same success/error envelope as the FastAPI response today. **Step 4:** Run → PASS. Golden diff vs ECS. **Step 5:** Commit `feat(contact): native handler, drop FastAPI proxy`. Delete `backend/app/main/routes/contact.py` + its `include_router` line; commit `chore(backend): remove ported contact route`.

- [ ] Repeat 4b → 4f in order (smallest → largest blast radius). 4e/4f additionally require the session-role guards the Python never had: brand-scoped routes check the session user's brand profile owns `brand_id`; creator routes check `creator_id === session.user.id` (as `api/ai-videos/generate` already does).

---

## Phase 5 — AWS decommission (PR 5 + console/CLI)

**Gate (hard):** re-run Task 0.2 Logs Insights query — zero non-`/health` hits for 7 consecutive days. If anything else appears, find the caller before proceeding.

- [ ] **Step 1:** Repo cleanup: `git rm -r backend .github/workflows/backend-deploy.yml`; remove Python steps from `harness:prepush` and `lint-staged` in `package.json`; `npx netlify env:unset CAMPAIGNS_API_URL`; remove `SMTP_*` from ECS-only stores. `npm run harness:prepush && npm run e2e` → pass. Commit `chore: remove FastAPI backend and its deploy pipeline`.
- [ ] **Step 2:** AWS teardown (order matters; all `--region us-east-2`):

```bash
# archive last image locally (optional, cheap insurance)
docker pull 202716106225.dkr.ecr.us-east-2.amazonaws.com/cricher-backend:553f96b119a92d94e68613088c0e3058d11f5a8d
aws ecs delete-express-gateway-service --service-arn arn:aws:ecs:us-east-2:202716106225:service/default/cricher-backend --region us-east-2
aws ecr delete-repository --repository-name cricher-backend --force --region us-east-2
aws logs delete-log-group --log-group-name /ecs/cricher-backend --region us-east-2
```

- [ ] **Step 3:** Verify: `curl -s -o /dev/null -w "%{http_code}" https://cr-a3a9dccca75c4d028042debabc7691fe.ecs.us-east-2.on.aws/health` → connection failure/404. Prod smoke: contact form, campaign list, ai-video submit, TikTok publish — all green on cricher.ai.
- [ ] **Step 4:** Next billing cycle: confirm ECS/ECR line items → $0. Review IAM: remove `ecsInfrastructureRole`/`ecsTaskExecutionRole` if unused elsewhere, and the deploy workflow's CI user keys.

---

## Phase 6 — Replace hand-rolled fake-Supabase with Supabase CLI (PR 6)

The 6-container compose stack (pg + storage-api + postgrest + nginx path-rewrite + api + web) hand-reimplements `supabase start`. Official CLI is the industry-standard local stack (same images, maintained upstream).

- [ ] **Step 1:** `npx supabase init` → edit `supabase/config.toml`: `[api] port = 54321`, `[db] port = 54329` (matches every existing env/e2e reference — zero env churn).
- [ ] **Step 2:** `npx supabase start`; then `npm run dev:migrate && npm run dev:seed` against `postgres://postgres:postgres@localhost:54329/postgres` — **note** CLI uses `postgres` user/db, not `e2e:e2e/brand_creator_e2e`: update `dev:migrate`, `dev:seed`, `.env.e2e-dev` connection strings accordingly (one-line changes).
- [ ] **Step 3:** Create buckets in local stack via existing `scripts/studio-create-buckets.js` pointed at local URL + local service key (printed by `supabase start`).
- [ ] **Step 4:** Rewire `scripts/e2e/up.ts`/`up-infra.ts`: replace `docker compose` invocations with `npx supabase start` (idempotent) + web/api startup as today minus pg/postgrest/proxy/storage services. Delete `docker/compose.e2e.yml`, `docker/supabase-proxy.conf`, `docker/init/`, and the now-moot `tests/harness-e2e/compose.test.ts`; update `up-guardrail`/`wait` tests to probe `http://localhost:54321/rest/v1/` instead of the nginx proxy.
- [ ] **Step 5:** CI: in `.github/workflows/e2e.yml` add official action before `npm run e2e:up`:

```yaml
- uses: supabase/setup-cli@v1
  with: { version: latest }
```

- [ ] **Step 6:** Full local proof: `npm run e2e:down && npm run e2e:up && npm run e2e` → pass. Commit `refactor(e2e): official supabase CLI replaces hand-rolled local stack`.
- [ ] **Step 7:** Discard/rework the 4 currently-uncommitted files (`docker/compose.e2e.yml`, `docker/supabase-proxy.conf`, `package.json`, `tests/harness-e2e/compose.test.ts` postgrest additions) — superseded by this phase.

---

## End state & success metrics

```
Browser ── Netlify (Next.js: pages + all API routes + /media CDN proxy)
              ├─ Prisma ──→ Supabase Postgres (pooler)
              ├─ supabase-js ──→ Supabase Storage (presigned direct from browser)
              ├─ nodemailer ──→ SMTP
              ├─ Stripe SDK ──→ Stripe
              └─ fetch ──→ TikTok API (init/status only; TikTok pulls media itself)
Local dev/E2E ── supabase CLI + next dev + Playwright
CI ── one workflow (e2e on PR); deploy = Netlify git-push (frontend+backend as one)
```

- Hosted surfaces: 9 → 3 (Netlify, Supabase, Stripe). AWS bill line → $0.
- Deploy pipelines: 2 → 1. Languages: 2 → 1 (~6.9k Python LOC deleted).
- Every API route session/zod-guarded (today: entire ECS surface unauthenticated).
- Upload ceiling: ~4.5MB (silent) → 5GB (Supabase direct, resumable-capable).
- Publish latency: unbounded relay → seconds (init + poll).
- Rollback at every step: ECS untouched until Phase 5 gate; per-route `git revert` before that.

## Self-review notes

- Spec coverage: secrets exposure (0.1), dead weight (1.x), upload limits (2.x), long-running relay (3.x), dual-backend duplication (4.x), AWS teardown (5), harness complexity (6) — all audit findings have tasks.
- Known deliberate deferrals (YAGNI): zh/ i18n refactor, sub-product page pruning (needs owner decision), Prisma legacy-model renames, rate-limiter generalization.
- Field-level mappings for 4b–4f intentionally reference the authoritative Python files rather than inlining 4.5k LOC; the golden-diff step is the enforcement that no field drifts.
