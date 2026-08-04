/**
 * TikTok chunked-upload math (Content Posting API, source=FILE_UPLOAD).
 *
 * Rules below verified against TikTok's official docs on 2026-08-05:
 * https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
 *
 *   "Each chunk must be at least 5 MB but no greater than 64 MB, except for the
 *   final chunk, which can be greater than chunk_size (up to 128 MB)"
 *   "The value of total_chunk_count should be equal to video_size divided by
 *   chunk_size, rounded down to the nearest integer."
 *   "Content-Range: bytes {FIRST_BYTE}-{LAST_BYTE}/{TOTAL_BYTE_LENGTH}"
 *   Minimum 1 chunk, maximum 1000 chunks per upload.
 *
 * backend/app/main/routes/tiktok_upload.py (_init_tiktok_publish /
 * upload_ai_video, read-only reference for this port) always sent
 * `chunk_size = video_size` as a single chunk. That's only valid while
 * video_size <= 64MB -- a single chunk larger than that violates the
 * "no greater than 64MB" rule above (a lone chunk is simultaneously the first
 * AND final chunk, and the 128MB final-chunk allowance is for a trailing
 * remainder after other chunks, not a blanket single-chunk ceiling). This
 * module fixes that: videos over SINGLE_CHUNK_MAX_BYTES are split into
 * DEFAULT_CHUNK_BYTES (10MB) parts.
 */

export const MIN_CHUNK_BYTES = 5 * 1024 * 1024; // 5MB - per-chunk floor
export const MAX_CHUNK_BYTES = 64 * 1024 * 1024; // 64MB - per-chunk ceiling (non-final)
export const MAX_FINAL_CHUNK_BYTES = 128 * 1024 * 1024; // 128MB - final-chunk ceiling
export const SINGLE_CHUNK_MAX_BYTES = MAX_CHUNK_BYTES; // videos at/under this go as 1 chunk
export const DEFAULT_CHUNK_BYTES = 10 * 1024 * 1024; // 10MB - conventional part size above the cap
export const MAX_CHUNK_COUNT = 1000;

export interface ChunkPlan {
  chunkSize: number;
  totalChunkCount: number;
}

export interface ChunkRange {
  index: number;
  start: number;
  end: number; // inclusive
  length: number;
  contentRange: string; // "bytes {start}-{end}/{videoSize}"
}

export class VideoTooLargeError extends Error {
  constructor(
    public readonly videoSize: number,
    public readonly totalChunkCount: number
  ) {
    super(
      `Video of ${videoSize} bytes needs ${totalChunkCount} chunks, exceeding TikTok's ${MAX_CHUNK_COUNT}-chunk limit`
    );
    this.name = "VideoTooLargeError";
  }
}

/**
 * Decide chunk_size + total_chunk_count for a given video size, per the rules
 * in this module's header.
 */
export function computeChunkPlan(videoSize: number): ChunkPlan {
  if (!Number.isInteger(videoSize) || videoSize <= 0) {
    throw new RangeError(`videoSize must be a positive integer, got ${videoSize}`);
  }

  if (videoSize <= SINGLE_CHUNK_MAX_BYTES) {
    return { chunkSize: videoSize, totalChunkCount: 1 };
  }

  const chunkSize = DEFAULT_CHUNK_BYTES;
  // Flooring (not ceiling) is deliberate: it folds any remainder into the final
  // chunk instead of creating an undersized trailing chunk that could dip below
  // MIN_CHUNK_BYTES. E.g. a 72MB video at 10MB chunks: ceil(7.2) = 8 chunks would
  // leave a 2MB final chunk (below the 5MB floor); floor(7.2) = 7 chunks folds
  // that remainder into a 12MB final chunk instead.
  const totalChunkCount = Math.floor(videoSize / chunkSize);
  if (totalChunkCount > MAX_CHUNK_COUNT) {
    throw new VideoTooLargeError(videoSize, totalChunkCount);
  }
  return { chunkSize, totalChunkCount };
}

/**
 * Expand a chunk plan into concrete byte ranges + Content-Range header values,
 * one per PUT request the relay will issue against TikTok's upload_url.
 */
export function buildChunkRanges(videoSize: number, plan: ChunkPlan): ChunkRange[] {
  const { chunkSize, totalChunkCount } = plan;
  const ranges: ChunkRange[] = [];
  for (let index = 0; index < totalChunkCount; index++) {
    const start = index * chunkSize;
    const isLast = index === totalChunkCount - 1;
    const end = isLast ? videoSize - 1 : start + chunkSize - 1;
    const length = end - start + 1;
    ranges.push({ index, start, end, length, contentRange: `bytes ${start}-${end}/${videoSize}` });
  }
  return ranges;
}
