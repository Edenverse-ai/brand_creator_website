import { buildChunkRanges, type ChunkPlan } from "./chunking";

export interface ChunkedUploadJob {
  uploadUrl: string;
  sourceUrl: string;
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
}

export class ChunkFetchError extends Error {
  constructor(
    public readonly chunkIndex: number,
    public readonly status: number,
    reason?: string
  ) {
    super(
      reason
        ? `Chunk ${chunkIndex} fetch mismatch: ${reason} (status ${status})`
        : `Failed to fetch chunk ${chunkIndex} from source (status ${status})`
    );
    this.name = "ChunkFetchError";
  }
}

export class ChunkPutError extends Error {
  constructor(
    public readonly chunkIndex: number,
    public readonly status: number
  ) {
    super(`TikTok rejected chunk ${chunkIndex} (status ${status})`);
    this.name = "ChunkPutError";
  }
}

/**
 * Port of backend/app/main/routes/tiktok_upload.py `_stream_upload`, extended to
 * chunk uploads above TikTok's 64MB single-chunk cap (see chunking.ts for the
 * rules and the bug this fixes). Each chunk is fetched from sourceUrl via an
 * HTTP Range request and PUT to uploadUrl with a matching Content-Range header,
 * sequentially -- TikTok's chunked upload is defined as an ordered sequence of
 * PUTs against the same upload_url, so chunks are not sent concurrently.
 *
 * Deliberately never logs uploadUrl or sourceUrl (both are bearer-capability
 * URLs -- the source is a signed Supabase URL). Callers should log only
 * non-sensitive fields (e.g. publishId, chunk index, HTTP status).
 */
export async function runChunkedUpload(job: ChunkedUploadJob): Promise<void> {
  const plan: ChunkPlan = { chunkSize: job.chunkSize, totalChunkCount: job.totalChunkCount };
  const ranges = buildChunkRanges(job.videoSize, plan);
  const isMultiChunk = ranges.length > 1;

  for (const range of ranges) {
    const sourceResp = await fetch(job.sourceUrl, {
      headers: { Range: `bytes=${range.start}-${range.end}` },
    });

    // POST-REVIEW FIX (CRITICAL 2): a source that ignores Range headers
    // returns 200 with the WHOLE object instead of the requested slice. For a
    // single-chunk job that's equivalent to the correct response (the "chunk"
    // IS the whole object), but for a multi-chunk job it would silently hand
    // back the wrong bytes for every chunk after the first. Require 206
    // whenever there's more than one chunk, so a Range-ignoring source fails
    // loudly on the first chunk instead of relaying corrupt data.
    const acceptableStatuses = isMultiChunk ? [206] : [200, 206];
    if (!acceptableStatuses.includes(sourceResp.status)) {
      throw new ChunkFetchError(range.index, sourceResp.status);
    }

    const body = await sourceResp.arrayBuffer();

    // POST-REVIEW FIX (CRITICAL 2): a correct status code doesn't guarantee
    // the byte count matches what Content-Range/Content-Length below are
    // about to claim -- verify before ever PUTting. Without this, a
    // short/long body still gets PUT with a manually-set Content-Length that
    // doesn't match the actual body; undici sends the declared
    // Content-Length as-is rather than reconciling it against the real body
    // size, so the peer hangs waiting for bytes that will never arrive
    // instead of failing cleanly.
    if (body.byteLength !== range.length) {
      throw new ChunkFetchError(
        range.index,
        sourceResp.status,
        `expected ${range.length} bytes, got ${body.byteLength}`
      );
    }

    const putResp = await fetch(job.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(range.length),
        "Content-Range": range.contentRange,
      },
      body,
    });
    if (!putResp.ok) {
      throw new ChunkPutError(range.index, putResp.status);
    }
  }
}
