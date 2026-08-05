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

/** `${SUPABASE_URL}/storage/v1`, or null when no Supabase project is configured. */
function storageApiPrefix(): string | null {
  const base = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(
    /\/$/,
    ""
  );
  return base ? `${base}/storage/v1` : null;
}

/**
 * True when `url` is served by our own configured Supabase project's storage API.
 *
 * ROOT CAUSE OF THE PULL_FROM_URL FAILURE: the publish route used to decide
 * "does this need rewriting onto the verified /media prefix?" from which REQUEST
 * FIELD carried the source (video_path => yes, video_url => no). But the live
 * client sends `videoUrl`, and that value is itself a signed Supabase URL
 * (src/lib/ai-video-library.ts mints it) -- so the pull path handed TikTok a
 * `supabase.co` URL, which is not one of the app's verified URL properties, and
 * TikTok answered 400 `url_ownership_unverified`. The question is about the
 * HOST, not the field, so it is answered here.
 */
export function isOwnSupabaseStorageUrl(url: string): boolean {
  const prefix = storageApiPrefix();
  return prefix !== null && (url === prefix || url.startsWith(`${prefix}/`));
}

/**
 * Bucket-relative object path of a signed AI-video URL, token dropped, or null
 * if `url` is not a signed object in AI_VIDEO_BUCKET on our own project. Used to
 * re-sign a source at SIGNED_URL_TTL_SECONDS: the library mints its URLs with a
 * 300-second expiry (ai-video-library.ts), which can lapse inside TikTok's
 * one-hour PULL_FROM_URL download window.
 */
export function storageObjectPath(url: string): string | null {
  const prefix = storageApiPrefix();
  if (prefix === null) return null;
  const signedPrefix = `${prefix}/object/sign/${AI_VIDEO_BUCKET}/`;
  if (!url.startsWith(signedPrefix)) return null;
  const path = url.slice(signedPrefix.length).split("?")[0];
  return path ? decodeURIComponent(path) : null;
}

/**
 * Rewrites a Supabase-hosted signed URL onto the same-domain /media proxy
 * (netlify.toml redirect, Task 3.1) so TikTok's PULL_FROM_URL can fetch it from
 * a TikTok-verified URL prefix. Only reachable when TIKTOK_PULL_FROM_URL_ENABLED
 * is "true" (src/lib/tiktok/flags.ts) -- see src/lib/tiktok/init.ts.
 */
export function toMediaProxyUrl(signedUrl: string): string {
  const storagePrefix = storageApiPrefix();
  if (storagePrefix === null) {
    throw new TikTokSignError(new Error("SUPABASE_URL not configured"));
  }
  if (!signedUrl.startsWith(storagePrefix)) {
    throw new TikTokSignError(
      new Error("signed URL host does not match the configured Supabase project")
    );
  }
  return signedUrl.replace(storagePrefix, TIKTOK_VERIFIED_MEDIA_PREFIX);
}
