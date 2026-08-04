import { TIKTOK_INIT_URL } from "./constants";
import { computeChunkPlan } from "./chunking";
import { fetchWithTimeout } from "./fetch-with-timeout";
import { TikTokInitError } from "./errors";
import type { VideoInput } from "./schema";

interface PostInfo {
  title: string;
  privacy_level: string;
  brand_content_toggle: boolean;
  brand_organic_toggle: boolean;
  disable_comment: boolean;
  disable_duet: boolean;
  disable_stitch: boolean;
}

/**
 * Port of _required_brand_flags: defaults to organic posts unless explicitly
 * overridden by the caller.
 */
function requiredBrandFlags(video: VideoInput): { brandContent: boolean; brandOrganic: boolean } {
  return {
    brandContent: video.brand_content_toggle ?? false,
    brandOrganic: video.brand_organic_toggle ?? true,
  };
}

/**
 * Port of the `post_info` block in _init_tiktok_publish. `privacyLevel` is taken
 * as an explicit parameter (rather than read off `video.privacy_level`, which is
 * optional at the schema level) so callers must resolve the "missing
 * privacy_level" per-video error before this can be called at all.
 */
function buildPostInfo(video: VideoInput, privacyLevel: string): PostInfo {
  const { brandContent, brandOrganic } = requiredBrandFlags(video);
  return {
    title: (video.title || "AI video").slice(0, 150),
    privacy_level: privacyLevel,
    brand_content_toggle: brandContent,
    brand_organic_toggle: brandOrganic,
    disable_comment: video.disable_comment ?? true,
    disable_duet: video.disable_duet ?? true,
    disable_stitch: video.disable_stitch ?? true,
  };
}

export interface FileUploadInit {
  uploadUrl: string;
  publishId: string;
  chunkSize: number;
  totalChunkCount: number;
}

/**
 * Port of _init_tiktok_publish (source=FILE_UPLOAD variant) -- the active path.
 * Computes the chunk plan via computeChunkPlan (see chunking.ts for the bug this
 * fixes vs. the Python original, which always sent a single chunk_size ==
 * video_size chunk) and calls TikTok's init endpoint.
 */
export async function initFileUpload(
  accessToken: string,
  video: VideoInput,
  privacyLevel: string,
  videoSize: number
): Promise<FileUploadInit> {
  const { chunkSize, totalChunkCount } = computeChunkPlan(videoSize);

  const res = await fetchWithTimeout(TIKTOK_INIT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      post_info: buildPostInfo(video, privacyLevel),
      source_info: {
        source: "FILE_UPLOAD",
        video_size: videoSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount,
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  const uploadUrl = data?.data?.upload_url;
  const publishId = data?.data?.publish_id;
  if (!res.ok || !uploadUrl || !publishId) {
    throw new TikTokInitError(res.status, data);
  }
  return { uploadUrl, publishId, chunkSize, totalChunkCount };
}

export interface PullFromUrlInit {
  publishId: string;
}

/**
 * Port of the PULL_FROM_URL variant described in .superpowers/sdd/task-3.2-brief.md
 * -- implemented but INERT. TikTok fetches videoUrl itself; there's no
 * upload_url and no relay. videoUrl MUST already sit under the TikTok-verified
 * URL prefix (the /media proxy added to netlify.toml, Task 3.1) -- see
 * toMediaProxyUrl in signed-source.ts. Only called when
 * TIKTOK_PULL_FROM_URL_ENABLED is "true" (src/lib/tiktok/flags.ts); see that
 * file and the task report for the exact owner steps required before flipping it.
 */
export async function initPullFromUrl(
  accessToken: string,
  video: VideoInput,
  privacyLevel: string,
  videoUrl: string
): Promise<PullFromUrlInit> {
  const res = await fetchWithTimeout(TIKTOK_INIT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      post_info: buildPostInfo(video, privacyLevel),
      source_info: { source: "PULL_FROM_URL", video_url: videoUrl },
    }),
  });

  const data = await res.json().catch(() => ({}));
  const publishId = data?.data?.publish_id;
  if (!res.ok || !publishId) {
    throw new TikTokInitError(res.status, data);
  }
  return { publishId };
}
