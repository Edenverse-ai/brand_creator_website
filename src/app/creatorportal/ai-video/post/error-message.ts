/**
 * Extracts a display-safe message from a per-item `error` field returned by
 * the TikTok publish endpoints.
 *
 * Shape history: the old FastAPI backend (`backend/app/main/routes/tiktok_upload.py`)
 * returned `error` as a dict that echoed TikTok's raw payload back to the
 * caller (e.g. `exc.detail`, often `{ message, payload }`). The native
 * Next.js routes (`src/app/api/tiktok/publish`, `publish-status`) deliberately
 * return `error` as a fixed, caller-safe **string** instead (never TikTok's
 * raw payload -- see `src/lib/tiktok/errors.ts`). This helper tolerates both
 * shapes so the client renders a correct message whether it's talking to the
 * old backend or the new one.
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string") {
    return error || fallback;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) {
      return message;
    }
  }
  return fallback;
}
