import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PublishRequestSchema, type VideoInput } from "@/lib/tiktok/schema";
import {
  isOwnSupabaseStorageUrl,
  resolveSignedVideoUrl,
  storageObjectPath,
  toMediaProxyUrl,
} from "@/lib/tiktok/signed-source";
import { fetchVideoSize } from "@/lib/tiktok/video-size";
import { initFileUpload, initPullFromUrl } from "@/lib/tiktok/init";
import { dispatchBackgroundUpload } from "@/lib/tiktok/background-dispatch";
import { isPullFromUrlEnabled } from "@/lib/tiktok/flags";
import { assertPublicVideoUrl } from "@/lib/tiktok/public-url-guard";
import { assertSourceTargetUrl } from "@/lib/tiktok/relay-url-guard";
import { TIKTOK_MESSAGES, publicMessageFor, logDetailsFor } from "@/lib/tiktok/errors";

/**
 * POST /api/tiktok/publish
 *
 * Port of backend/app/main/routes/tiktok_upload.py `upload_ai_video`
 * (read-only reference). Two publish strategies are implemented; which one runs
 * is decided per request by isPullFromUrlEnabled() (src/lib/tiktok/flags.ts),
 * default OFF:
 *
 *   A. FILE_UPLOAD + Netlify background-function relay (the active path, see
 *      src/lib/tiktok/background-dispatch.ts and
 *      netlify/functions/tiktok-publish-background.ts): call TikTok's init
 *      endpoint to get an upload_url + publish_id, hand the byte relay off to
 *      the background function, and return immediately. No TikTok console
 *      action required.
 *   B. PULL_FROM_URL (implemented but inert until the owner verifies the
 *      /media/* prefix in the TikTok console -- see
 *      .superpowers/sdd/task-3-report.md): TikTok fetches the video itself, no
 *      relay at all.
 *
 * Either way, a successful entry here does NOT include the Python's
 * synchronous `publish_status` field -- both strategies are asynchronous by
 * nature, so callers poll POST /api/tiktok/publish-status with the returned
 * publish_id instead.
 *
 * Per-video error isolation matches the Python exactly: one video failing does
 * not abort the others, and each failure is a fixed, non-echoed message (see
 * src/lib/tiktok/errors.ts).
 */

interface VideoResult {
  id: string | null;
  status: "ok" | "error";
  publish_id?: string;
  error?: string;
}

/**
 * The URL handed to TikTok's PULL_FROM_URL init.
 *
 * TikTok will only pull from a URL under one of the app's verified properties
 * (cricher.ai); it answers 400 `url_ownership_unverified` for anything else --
 * including our own Supabase storage host, which was the actual cause of the
 * "TikTok init failed" reports (reproduced live 2026-08-06, see
 * docs/superpowers/plans/tiktok-pull-from-url-handoff.md). So ANY source on our
 * own storage host is rewritten onto the verified /media proxy, whichever
 * request field carried it -- the live client sends `videoUrl`, which the
 * previous field-based test wrongly treated as third-party.
 *
 * Sources on our host are also re-signed first: the library mints its URLs with
 * a 300-second expiry, and TikTok's download window is an hour.
 */
async function resolvePullUrl(sourceUrl: string): Promise<string> {
  if (!isOwnSupabaseStorageUrl(sourceUrl)) return sourceUrl;
  const objectPath = storageObjectPath(sourceUrl);
  const fresh = objectPath ? await resolveSignedVideoUrl(objectPath) : sourceUrl;
  return toMediaProxyUrl(fresh);
}

async function processViaPullFromUrl(
  accessToken: string,
  video: VideoInput,
  privacyLevel: string,
  sourceUrl: string
): Promise<VideoResult> {
  const id = video.id ?? null;
  const init = await initPullFromUrl(
    accessToken,
    video,
    privacyLevel,
    await resolvePullUrl(sourceUrl)
  );
  return { id, status: "ok", publish_id: init.publishId };
}

async function processViaFileUploadRelay(
  accessToken: string,
  video: VideoInput,
  privacyLevel: string,
  sourceUrl: string
): Promise<VideoResult> {
  const id = video.id ?? null;

  // POST-REVIEW FIX: the background relay's own allowlist (relay-url-guard.ts)
  // only accepts sourceUrl on our configured Supabase host -- checking that
  // HERE, before burning a TikTok init call and a dispatch, means a
  // video_url that could never be relayed fails fast with a clear per-video
  // error instead of dispatching a job that's guaranteed to be silently
  // rejected downstream with no caller-visible trace beyond function logs.
  assertSourceTargetUrl(sourceUrl);

  const videoSize = await fetchVideoSize(sourceUrl);
  const init = await initFileUpload(accessToken, video, privacyLevel, videoSize);

  await dispatchBackgroundUpload({
    uploadUrl: init.uploadUrl,
    sourceUrl,
    videoSize,
    chunkSize: init.chunkSize,
    totalChunkCount: init.totalChunkCount,
    publishId: init.publishId,
  });

  return { id, status: "ok", publish_id: init.publishId };
}

async function processVideo(accessToken: string, video: VideoInput): Promise<VideoResult> {
  const id = video.id ?? null;
  try {
    const { privacy_level: privacyLevel } = video;
    if (!privacyLevel) {
      return { id, status: "error", error: TIKTOK_MESSAGES.missingPrivacyLevel };
    }

    let sourceUrl: string | null = null;
    if (video.video_url) {
      // POST-REVIEW FIX (IMPORTANT 4): this must run before ANY fetch touches
      // video.video_url (fetchVideoSize below, for the FILE_UPLOAD strategy) --
      // previously nothing stood between a caller-supplied video_url and that
      // fetch, letting an authenticated caller use the differing fixed error
      // messages as a reachability oracle against internal network targets.
      assertPublicVideoUrl(video.video_url);
      sourceUrl = video.video_url;
    } else if (video.video_path) {
      sourceUrl = await resolveSignedVideoUrl(video.video_path);
    }
    if (!sourceUrl) {
      return { id, status: "error", error: TIKTOK_MESSAGES.missingVideoSource };
    }

    if (isPullFromUrlEnabled()) {
      return await processViaPullFromUrl(accessToken, video, privacyLevel, sourceUrl);
    }
    return await processViaFileUploadRelay(accessToken, video, privacyLevel, sourceUrl);
  } catch (error) {
    console.error("[tiktok/publish] video failed", { id, ...logDetailsFor(error) });
    return { id, status: "error", error: publicMessageFor(error) };
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = PublishRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { access_token: accessToken, videos } = parsed.data;
  const results = await Promise.all(videos.map((video) => processVideo(accessToken, video)));

  // 202: the relay is dispatched, not complete -- see the module docstring above.
  return NextResponse.json({ results }, { status: 202 });
}
