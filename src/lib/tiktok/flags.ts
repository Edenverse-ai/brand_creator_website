/**
 * PULL_FROM_URL is TikTok's primary-designed publish path: the server does a
 * quick init + status poll, TikTok fetches the video itself, and no byte relay
 * or function-timeout risk is involved. It requires the video URL to sit under
 * a URL prefix VERIFIED IN THE TIKTOK DEVELOPER CONSOLE -- a manual, owner-only
 * dashboard action (see netlify.toml's /media/* proxy from Task 3.1, and this
 * task's report at .superpowers/sdd/task-3-report.md for the exact steps).
 *
 * That verification has NOT been done yet, so this flag defaults OFF and
 * POST /api/tiktok/publish uses the Netlify background-function relay
 * (source=FILE_UPLOAD, see background-dispatch.ts) instead. Flip
 * TIKTOK_PULL_FROM_URL_ENABLED=true only after the TikTok console prefix
 * verification is complete and the /media proxy has been confirmed working.
 */
export function isPullFromUrlEnabled(): boolean {
  return process.env.TIKTOK_PULL_FROM_URL_ENABLED === "true";
}
