# AI Video: Trend Replicate

**Status:** implemented, mock-tested; not yet live-tested against the provider.
**Builds on:** [Seedance video generation](2026-10-05-seedance-video-generation-design.md). The provider, spend safety and task lifecycle are unchanged.

## 1. What it does

A creator uploads a trending TikTok (the "original video") and 1–3 photos of their product. They enter a product name and, optionally, a target audience and selling points. The app generates a new TikTok e-commerce ad. It follows the original's shot order, camera moves and pacing, and features the creator's product.

**Route:** `/creatorportal/ai-video/replicate`. A tool bar on top of it and of `/generate` reads **Video Gen | Trend Replicate**.

**Out of scope:** an LLM step (no "Analyze Product"), an assets library ("Select from Assets"), and trimming long videos in the app.

## 2. Provider request

One create call per task, as for Video Gen (`src/lib/seedance/client.ts` `buildCreateBody`):

- `videos: [{ url, role: "reference_video" }]` is the original video ("Video 1").
- `images: [{ url, role: "reference_image" }, …]` are the product photos ("Image 1..3"), in upload order.
- `ratio: "adaptive"` makes the output keep the source's shape. On Seedance 2.5 it is also the only ratio accepted if the model reads the task as a video edit.
- `duration: -1`. The task is a Seedance **video edit**, and edit tasks take their length and ratio from the source; a fixed `duration` makes them fail. If the model reads the task as a reference generation instead, `-1` lets it choose the length. The source itself is capped (§4).
- `prompt` is composed server-side (§3). Creators never write it.

URLs are 6-hour signed Supabase URLs, as before.

## 3. Prompt template

The template is `buildReplicatePrompt` in `src/lib/seedance/replicate.ts`. Its full text and an example are pinned in `src/lib/seedance/__tests__/replicate.test.ts`.

**It is an edit instruction.** The prompt asks Seedance to put the creator's product into Video 1 and keep everything else. In order, it:

1. Replaces Video 1's product with the named product from Image 1..N.
2. Keeps everything else unchanged: camera angle, framing and shot size; camera movement, including handheld motion; hands and poses; background and setting; lighting direction, brightness and color temperature; color grading; and pacing and cut timing.
3. Puts the new product in the same position, at the same size and angle, held and moved the same way. It keeps the product's look exactly as pictured and removes every brand name and logo of the original product.
4. **On-screen text:** none of Video 1's own text may appear. Wherever Video 1 shows text, the product name goes in the same position and style. When selling points are given, a few of their words go there too, if there is room. No prices or watermarks.
5. **With audio on:** keeps Video 1's music and replaces the voiceover with one in the same language and tone. The voiceover:
   - recommends the product by name and, when given, speaks to the target buyers;
   - mentions only the one or two selling points that matter most, since creators paste long lists;
   - stays within 2 words per second of the expected output length (`voiceoverWordBudget`, `expectedOutputSeconds`).

Without audio, the voiceover lines and the audience are dropped.

**History.**

- The first version treated Video 1 only as a style reference: a "brand-new" ad with a hook, a closing hero shot, a setting matched to the buyers, and a different presenter. In a live test it produced a different framing, background and lighting, and a rushed voiceover.
- The second version asked for a shot-for-shot recreation but kept a fixed `duration`. Seedance classified it as a video edit and rejected it ("Seedance identified your task as video editing … duration … is not valid").
- Edit mode is now deliberate, with `duration: -1`. The old rule against edit verbs in the prompt is gone.

## 4. Limits and entitlements

The limits are in `src/lib/ai-video-entitlements.ts`. They come from the session email, with no database lookup.

| Tier                                  | Video Gen / day        | Replicate / day | Replicate source length                         |
| ------------------------------------- | ---------------------- | --------------- | ----------------------------------------------- |
| Free (everyone)                       | `AI_VIDEO_DAILY_LIMIT` | 1               | 2–15 s                                          |
| Listed in `AI_VIDEO_UNLIMITED_EMAILS` | unlimited              | unlimited       | 2 s up to the model max (2.5: 30 s, Mini: 15 s) |

The two tools have separate counts (`AiVideoTask.kind`). A paid tier would be one more entitlements value.

**Other limits:**

- **Original video:** MP4 or MOV, up to 50 MB, each side 300–6000 px (confirmed by the provider: `InvalidParameter: Width must be between 300px and 6000px`), aspect ratio 0.4–2.5.
- **Duration:** the browser reads it from the file's metadata, and the server re-checks it against the creator's ceiling, allowing 0.5 s of slack for clips that measure 15.0x s. The server can't probe the file. A forged duration only gets the task rejected by the provider, and rejected tasks are not billed.
- **Product images:** the same rules as the Video Gen reference image: JPG/PNG/WebP, ≤ 10 MB, 300–6000 px per side, aspect ratio 0.4–2.5.

**To confirm with the provider.** The gateway doc lists only how many files a request can carry. The per-file limits above are Seedance 2.0's published reference limits: 2–15 s per reference video, at most 15 s across all of them, about 50 MB per file. It is not documented whether Seedance 2.5 accepts a 30 s reference video. If it doesn't, sources over 15 s for unlimited accounts need splitting into ≤ 15 s segments, which requires server-side ffmpeg (a follow-up).

## 5. API and storage

- **`POST /api/ai-videos/tasks/upload-url`** gains `kind` values `reference_video` (mp4/mov) and `product_1..3` (jpg/png/webp). Files are stored at `{uid}/{taskId}/reference-video.{ext}` and `{uid}/{taskId}/product-{n}.{ext}` in `ai-video-tasks`.
- **`POST /api/ai-videos/replicate`** takes `{ taskId, reference_video_path, product_image_paths[], input }`. It checks, in order:
  1. Ownership of every path, against this user and this task (`isOwnedTaskPath`), and the expected file names.
  2. The input schema.
  3. The source-length ceiling.
  4. The replicate daily cap (429).

  It then composes the prompt, inserts the task (`kind: "replicate"`) and submits it. Its response matches `POST /api/ai-videos/tasks`, so the client polls `GET /api/ai-videos/tasks/:id`.

- **`submitTask`** signs the reference video and every product image. It refuses to submit (FAILED, unbilled) if any of them can't be signed.

## 6. UI

- **Left column:** Original video (drop zone and preview), Product images (click, drag or paste; up to 3), Product name, Target audience, Selling points, Model, Resolution and Generate audio. Below it: the remaining count ("1 free replicate left today" or "Unlimited replicates") and "Output ≈ N s".
- **Right column:** **History** shows the creator's last 20 replicates. In-flight ones poll every 10 s, and delivered ones play inline. **Example** shows `REPLICATE_SAMPLE` (`src/lib/ai-video-samples.ts`), which is a placeholder until showcase assets are uploaded to `studio-samples`.
- **Task list (`/tasks`):** replicates carry a "Replicate" badge, the product name and the first product photo.

## 7. Testing

- **Unit:**
  - `src/lib/seedance/__tests__/replicate.test.ts`: the template, sanitising, params (`duration: -1`), expected output length and the voiceover word cap.
  - `src/lib/__tests__/ai-video-entitlements.test.ts`.
  - `src/app/api/ai-videos/replicate/__tests__/route.test.ts`.
  - Additions to the client, lifecycle, upload-url and tasks-route tests.
- **E2E (mock provider):** `e2e/creator/ai-video-replicate.spec.ts`. The fixtures `e2e/fixtures/replicate-source-{3s,16s}.mp4` are VP9-in-MP4 canvas clips recorded with Playwright's Chromium.
- **Dry run:** `npx tsx scripts/seedance-dry-run.ts --replicate …` prints the create request without sending it.
- **Live (manual only):**
  - A ≤ 15 s replicate on Mini.
  - A 30 s replicate on 2.5 with an unlimited account.
  - Whether the "Video 1 / Image N" references are respected.
  - Whether real faces in the source are rejected.
  - Selling points containing "remove", to check the task isn't treated as a video edit.
