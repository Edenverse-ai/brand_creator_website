import { describe, it, expect } from "vitest";
import {
  computeChunkPlan,
  buildChunkRanges,
  VideoTooLargeError,
  MAX_CHUNK_COUNT,
  DEFAULT_CHUNK_BYTES,
  SINGLE_CHUNK_MAX_BYTES,
} from "../chunking";

const MB = 1024 * 1024;

describe("computeChunkPlan", () => {
  it("uses a single chunk for a video well under the 64MB cap", () => {
    const plan = computeChunkPlan(50 * MB);
    expect(plan).toEqual({ chunkSize: 50 * MB, totalChunkCount: 1 });
  });

  it("uses a single chunk at exactly the 64MB boundary", () => {
    const plan = computeChunkPlan(SINGLE_CHUNK_MAX_BYTES);
    expect(plan).toEqual({ chunkSize: SINGLE_CHUNK_MAX_BYTES, totalChunkCount: 1 });
  });

  it("switches to 10MB parts one byte past the 64MB boundary (the bug this fixes)", () => {
    // The ported Python always sent chunk_size = video_size as a single chunk,
    // which would have declared a 64MB+1-byte single chunk here -- above
    // TikTok's documented 64MB per-chunk cap.
    const plan = computeChunkPlan(SINGLE_CHUNK_MAX_BYTES + 1);
    expect(plan.chunkSize).toBe(DEFAULT_CHUNK_BYTES);
    expect(plan.totalChunkCount).toBe(6);
  });

  it("floors total_chunk_count so the final chunk absorbs the remainder instead of dipping below the 5MB floor", () => {
    // 72MB at 10MB parts = 7.2 chunks. ceil() would produce 8 chunks and a 2MB
    // final chunk (below TikTok's 5MB minimum); floor() produces 7 chunks and a
    // 12MB final chunk instead.
    const videoSize = 72 * MB;
    const plan = computeChunkPlan(videoSize);
    expect(plan).toEqual({ chunkSize: DEFAULT_CHUNK_BYTES, totalChunkCount: 7 });

    const ranges = buildChunkRanges(videoSize, plan);
    const last = ranges[ranges.length - 1];
    expect(last.length).toBe(12 * MB);
    expect(last.length).toBeGreaterThanOrEqual(5 * MB);
  });

  it("rejects a non-positive video size", () => {
    expect(() => computeChunkPlan(0)).toThrow(RangeError);
    expect(() => computeChunkPlan(-1)).toThrow(RangeError);
  });

  it("throws VideoTooLargeError once the chunk count would exceed TikTok's 1000-chunk cap", () => {
    // (MAX_CHUNK_COUNT * DEFAULT_CHUNK_BYTES) + 1 still floors to exactly
    // MAX_CHUNK_COUNT chunks (the +1 byte is a fraction of one more chunk, which
    // floor() drops) -- one full chunk beyond that is needed to actually exceed it.
    const videoSize = (MAX_CHUNK_COUNT + 1) * DEFAULT_CHUNK_BYTES + 1;
    expect(() => computeChunkPlan(videoSize)).toThrow(VideoTooLargeError);
  });
});

describe("buildChunkRanges", () => {
  it("produces a single full-file range for a single-chunk plan", () => {
    const videoSize = 50 * MB;
    const plan = computeChunkPlan(videoSize);
    const ranges = buildChunkRanges(videoSize, plan);
    expect(ranges).toEqual([
      {
        index: 0,
        start: 0,
        end: videoSize - 1,
        length: videoSize,
        contentRange: `bytes 0-${videoSize - 1}/${videoSize}`,
      },
    ]);
  });

  it("produces correct part count and Content-Range per chunk for a >64MB video", () => {
    const videoSize = SINGLE_CHUNK_MAX_BYTES + 1; // 64MB + 1 byte
    const plan = computeChunkPlan(videoSize);
    const ranges = buildChunkRanges(videoSize, plan);

    expect(ranges).toHaveLength(6);

    // Every non-final chunk is exactly chunkSize (10MB) with contiguous, correctly
    // formatted Content-Range headers.
    expect(ranges[0]).toEqual({
      index: 0,
      start: 0,
      end: 10 * MB - 1,
      length: 10 * MB,
      contentRange: `bytes 0-${10 * MB - 1}/${videoSize}`,
    });
    expect(ranges[1].start).toBe(ranges[0].end + 1);
    expect(ranges[4]).toEqual({
      index: 4,
      start: 4 * DEFAULT_CHUNK_BYTES,
      end: 5 * DEFAULT_CHUNK_BYTES - 1,
      length: DEFAULT_CHUNK_BYTES,
      contentRange: `bytes ${4 * DEFAULT_CHUNK_BYTES}-${5 * DEFAULT_CHUNK_BYTES - 1}/${videoSize}`,
    });

    // Final chunk absorbs the remainder and stays within TikTok's bounds.
    const last = ranges[ranges.length - 1];
    expect(last).toEqual({
      index: 5,
      start: 5 * DEFAULT_CHUNK_BYTES,
      end: videoSize - 1,
      length: 14_680_065,
      contentRange: `bytes ${5 * DEFAULT_CHUNK_BYTES}-${videoSize - 1}/${videoSize}`,
    });
    expect(last.length).toBeGreaterThanOrEqual(5 * MB);
    expect(last.length).toBeLessThanOrEqual(128 * MB);

    // Ranges are contiguous and exactly cover [0, videoSize).
    const totalCovered = ranges.reduce((sum, r) => sum + r.length, 0);
    expect(totalCovered).toBe(videoSize);
  });
});
