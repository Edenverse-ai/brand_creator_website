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
    public readonly status: number
  ) {
    super(`Failed to fetch chunk ${chunkIndex} from source (status ${status})`);
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

  for (const range of ranges) {
    const sourceResp = await fetch(job.sourceUrl, {
      headers: { Range: `bytes=${range.start}-${range.end}` },
    });
    if (sourceResp.status !== 200 && sourceResp.status !== 206) {
      throw new ChunkFetchError(range.index, sourceResp.status);
    }
    const body = await sourceResp.arrayBuffer();

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
