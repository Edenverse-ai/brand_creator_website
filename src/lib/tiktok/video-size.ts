import { fetchWithTimeout } from "./fetch-with-timeout";
import { TikTokVideoSizeError } from "./errors";

/**
 * Determine a source video's byte size without downloading the full object.
 * Port of backend/app/main/routes/tiktok_upload.py `_fetch_video_size`: HEAD
 * first, then fall back to a 1-byte Range GET and read Content-Range.
 */
export async function fetchVideoSize(sourceUrl: string): Promise<number> {
  try {
    const headResp = await fetchWithTimeout(sourceUrl, { method: "HEAD", redirect: "follow" });
    const contentLength = headResp.headers.get("content-length");
    if (contentLength && /^\d+$/.test(contentLength)) {
      const size = Number(contentLength);
      if (size > 0) return size;
    }
  } catch {
    // Fall through to the range-request fallback, matching the Python's broad except.
  }

  try {
    const rangeResp = await fetchWithTimeout(sourceUrl, {
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
    });
    const contentRange = rangeResp.headers.get("content-range");
    if (contentRange && contentRange.includes("/")) {
      const size = Number(contentRange.slice(contentRange.lastIndexOf("/") + 1));
      if (Number.isFinite(size) && size > 0) return size;
    }
  } catch {
    // Handled by the throw below.
  }

  throw new TikTokVideoSizeError();
}
