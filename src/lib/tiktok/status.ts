import { TIKTOK_STATUS_URL } from "./constants";
import { fetchWithTimeout } from "./fetch-with-timeout";
import { TikTokStatusFetchError } from "./errors";

/**
 * Port of backend/app/main/routes/tiktok_upload.py `_fetch_publish_status`.
 * Returns TikTok's raw status payload for a single publish_id; the route layer
 * wraps this into the per-id result envelope.
 */
export async function fetchPublishStatus(accessToken: string, publishId: string): Promise<unknown> {
  const res = await fetchWithTimeout(TIKTOK_STATUS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ publish_id: publishId }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new TikTokStatusFetchError(res.status, data);
  }
  return data;
}
