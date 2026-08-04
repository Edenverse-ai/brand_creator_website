/**
 * Shared constants for the TikTok publish routes (src/app/api/tiktok/publish,
 * src/app/api/tiktok/publish-status) and the background relay function
 * (netlify/functions/tiktok-publish-background.ts).
 *
 * Mirrors backend/app/main/routes/tiktok_upload.py, which remains the read-only
 * source of truth for the request/response contract during this port.
 */

export const TIKTOK_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/";
export const TIKTOK_STATUS_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

// Matches tiktok_upload.py's BUCKET_NAME.
export const AI_VIDEO_BUCKET = "aivideogenerated";

// Matches tiktok_upload.py's _signed_supabase_url: create_signed_url(path, 60 * 30).
export const SIGNED_URL_TTL_SECONDS = 60 * 30;

// Matches the Python httpx client's timeout=30 used for the TikTok init/status
// calls (backend/app/main/routes/tiktok_upload.py upload_ai_video/publish_status).
// Deliberately NOT applied to the background relay's chunk fetch/PUT calls, which
// mirror the Python's httpx.AsyncClient(timeout=None) for _stream_upload instead.
export const TIKTOK_CALL_TIMEOUT_MS = 30_000;
