import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PublishRequestSchema, type VideoInput } from "@/lib/tiktok/schema";
import { resolveSignedVideoUrl, toMediaProxyUrl } from "@/lib/tiktok/signed-source";
import { fetchVideoSize } from "@/lib/tiktok/video-size";
import { initFileUpload, initPullFromUrl } from "@/lib/tiktok/init";
import { dispatchBackgroundUpload } from "@/lib/tiktok/background-dispatch";
import { isPullFromUrlEnabled } from "@/lib/tiktok/flags";
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

async function processViaPullFromUrl(
  accessToken: string,
  video: VideoInput,
  privacyLevel: string,
  sourceUrl: string,
  sourceIsSignedSupabaseUrl: boolean
): Promise<VideoResult> {
  const id = video.id ?? null;
  // Only OUR OWN signed Supabase URLs (the video_path branch) get rewritten onto
  // the verified /media prefix -- a caller-supplied video_url is passed through
  // as-is; it either already sits under a verified prefix or TikTok will reject
  // it, which surfaces as a normal per-video TikTokInitError below.
  const pullUrl = sourceIsSignedSupabaseUrl ? toMediaProxyUrl(sourceUrl) : sourceUrl;
  const init = await initPullFromUrl(accessToken, video, privacyLevel, pullUrl);
  return { id, status: "ok", publish_id: init.publishId };
}

async function processViaFileUploadRelay(
  accessToken: string,
  video: VideoInput,
  privacyLevel: string,
  sourceUrl: string
): Promise<VideoResult> {
  const id = video.id ?? null;
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
    let sourceIsSignedSupabaseUrl = false;
    if (video.video_url) {
      sourceUrl = video.video_url;
    } else if (video.video_path) {
      sourceUrl = await resolveSignedVideoUrl(video.video_path);
      sourceIsSignedSupabaseUrl = true;
    }
    if (!sourceUrl) {
      return { id, status: "error", error: TIKTOK_MESSAGES.missingVideoSource };
    }

    if (isPullFromUrlEnabled()) {
      return await processViaPullFromUrl(
        accessToken,
        video,
        privacyLevel,
        sourceUrl,
        sourceIsSignedSupabaseUrl
      );
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
