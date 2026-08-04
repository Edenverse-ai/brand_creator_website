import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { AI_VIDEO_BUCKET, SIGNED_URL_TTL_SECONDS } from "./constants";
import { TikTokSignError } from "./errors";

/**
 * Signed URL for a video_path in the aivideogenerated bucket, 30-minute expiry --
 * matches backend/app/main/routes/tiktok_upload.py `_signed_supabase_url`
 * (`create_signed_url(path, 60 * 30)`).
 *
 * NOTE: this bucket is distinct from AI_VIDEO_TASK_BUCKET ("ai-video-tasks") in
 * src/lib/supabase-admin.ts, which holds task INPUT assets (portraits/voice
 * samples), not generated output video. Signing is done directly against the
 * admin client here rather than via that module's createSignedUrl helper, which
 * is hardcoded to AI_VIDEO_TASK_BUCKET.
 */
export async function resolveSignedVideoUrl(path: string): Promise<string> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage
    .from(AI_VIDEO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new TikTokSignError(error);
  }
  return data.signedUrl;
}

// Matches netlify.toml's /media/* redirect target (Task 3.1) and -- critically --
// the exact URL prefix the owner must verify in the TikTok developer console
// (see .superpowers/sdd/task-3-report.md for the steps). Hardcoded rather than
// derived from NEXT_PUBLIC_APP_URL: PULL_FROM_URL only works against the literal
// domain TikTok verified, and a drifted env var would silently break it with no
// type/lint signal. This mirrors task-3.2-brief.md's own example code verbatim.
const TIKTOK_VERIFIED_MEDIA_PREFIX = "https://cricher.ai/media";

/**
 * Rewrites a Supabase-hosted signed URL onto the same-domain /media proxy
 * (netlify.toml redirect, Task 3.1) so TikTok's PULL_FROM_URL can fetch it from
 * a TikTok-verified URL prefix. Only reachable when TIKTOK_PULL_FROM_URL_ENABLED
 * is "true" (src/lib/tiktok/flags.ts) -- see src/lib/tiktok/init.ts.
 */
export function toMediaProxyUrl(signedUrl: string): string {
  const supabaseBase = (
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    ""
  ).replace(/\/$/, "");
  if (!supabaseBase) {
    throw new TikTokSignError(new Error("SUPABASE_URL not configured"));
  }
  const storagePrefix = `${supabaseBase}/storage/v1`;
  if (!signedUrl.startsWith(storagePrefix)) {
    throw new TikTokSignError(
      new Error("signed URL host does not match the configured Supabase project")
    );
  }
  return signedUrl.replace(storagePrefix, TIKTOK_VERIFIED_MEDIA_PREFIX);
}
