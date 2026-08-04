import { describe, it, expect, vi, beforeEach } from "vitest";

const aiVideoFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { aiVideo: { findMany: (...args: unknown[]) => aiVideoFindMany(...args) } },
}));

const createSignedUrl = vi.fn();
const storageFrom = vi.fn(() => ({ createSignedUrl }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ storage: { from: storageFrom } }),
}));

import { deserializeTags, getAiVideoLibrary } from "../ai-video-library";

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "video-1",
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    creator_id: "creator-1",
    generated_time: new Date("2026-01-02T00:00:00.000Z"),
    video: "creator-1/video-1.mp4",
    tag: null,
    thumbnail_url: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://signed.example/mock" },
    error: null,
  });
});

describe("deserializeTags", () => {
  it("returns an empty array for null/empty input", () => {
    expect(deserializeTags(null)).toEqual([]);
    expect(deserializeTags("")).toEqual([]);
  });

  it("parses a JSON array and stringifies every element", () => {
    expect(deserializeTags('["a","b"]')).toEqual(["a", "b"]);
    expect(deserializeTags("[1,2,3]")).toEqual(["1", "2", "3"]);
  });

  it("falls back to comma-splitting on invalid JSON", () => {
    expect(deserializeTags("tag1,tag2, tag3 ")).toEqual(["tag1", "tag2", "tag3"]);
  });

  it("drops empty segments when comma-splitting", () => {
    expect(deserializeTags("tag1,,tag2,")).toEqual(["tag1", "tag2"]);
  });

  it("falls through to comma-split when JSON parses but is not an array (matches Python's fall-through, not an early return)", () => {
    // "42" is valid JSON (a number) but not an array -- Python's _deserialize_tags
    // does not return early here, it falls through to the comma-split of the
    // original raw string.
    expect(deserializeTags("42")).toEqual(["42"]);
    expect(deserializeTags('{"a":1}')).toEqual(['{"a":1}']);
  });
});

describe("getAiVideoLibrary", () => {
  it("queries AiVideo scoped to creatorId, ordered by generated_time desc", async () => {
    aiVideoFindMany.mockResolvedValue([]);

    await getAiVideoLibrary("creator-1");

    expect(aiVideoFindMany).toHaveBeenCalledWith({
      where: { creator_id: "creator-1" },
      orderBy: { generated_time: "desc" },
    });
  });

  it("returns [] and logs only the error name when the query fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    aiVideoFindMany.mockRejectedValue(new Error("connection refused: secret-detail-in-message"));

    const result = await getAiVideoLibrary("creator-1");

    expect(result).toEqual([]);
    const loggedArgs = consoleSpy.mock.calls.flat().join(" ");
    expect(loggedArgs).not.toContain("secret-detail-in-message");
    expect(loggedArgs).toContain("Error");
    consoleSpy.mockRestore();
  });

  it("returns [] immediately for an empty row set without touching storage", async () => {
    aiVideoFindMany.mockResolvedValue([]);

    const result = await getAiVideoLibrary("creator-1");

    expect(result).toEqual([]);
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it("drops rows with no video path (never included as null/error entries)", async () => {
    aiVideoFindMany.mockResolvedValue([row({ id: "no-video", video: null })]);

    const result = await getAiVideoLibrary("creator-1");

    expect(result).toEqual([]);
  });

  it("resolves the video via a signed URL from the aivideogenerated bucket at a 300s TTL", async () => {
    aiVideoFindMany.mockResolvedValue([row({ video: "creator-1/video-1.mp4" })]);

    const result = await getAiVideoLibrary("creator-1");

    expect(storageFrom).toHaveBeenCalledWith("aivideogenerated");
    expect(createSignedUrl).toHaveBeenCalledWith("creator-1/video-1.mp4", 300);
    expect(result[0].video_url).toBe("https://signed.example/mock");
  });

  it("drops the row when signing the video fails, without throwing", async () => {
    createSignedUrl.mockResolvedValueOnce({ data: null, error: { name: "StorageApiError" } });
    aiVideoFindMany.mockResolvedValue([row()]);

    const result = await getAiVideoLibrary("creator-1");

    expect(result).toEqual([]);
  });

  it("passes an http(s) thumbnail value through unchanged (no signing call)", async () => {
    aiVideoFindMany.mockResolvedValue([
      row({ thumbnail_url: "https://cdn.example.com/thumb.jpg" }),
    ]);

    const result = await getAiVideoLibrary("creator-1");

    expect(result[0].thumbnail_url).toBe("https://cdn.example.com/thumb.jpg");
    // Only the video path should have been signed, not the thumbnail URL.
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    expect(createSignedUrl).toHaveBeenCalledWith("creator-1/video-1.mp4", 300);
  });

  it("signs a bare thumbnail storage path", async () => {
    createSignedUrl.mockImplementation((path: string) =>
      Promise.resolve({ data: { signedUrl: `https://signed.example/${path}` }, error: null })
    );
    aiVideoFindMany.mockResolvedValue([row({ thumbnail_url: "creator-1/thumb.jpg" })]);

    const result = await getAiVideoLibrary("creator-1");

    expect(createSignedUrl).toHaveBeenCalledWith("creator-1/thumb.jpg", 300);
    expect(result[0].thumbnail_url).toBe("https://signed.example/creator-1/thumb.jpg");
  });

  it("returns null thumbnail_url (not a dropped row) when there is no thumbnail", async () => {
    aiVideoFindMany.mockResolvedValue([row({ thumbnail_url: null })]);

    const result = await getAiVideoLibrary("creator-1");

    expect(result).toHaveLength(1);
    expect(result[0].thumbnail_url).toBeNull();
  });

  it("keeps resolving other rows when one row's signing throws unexpectedly", async () => {
    createSignedUrl
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({ data: { signedUrl: "https://signed.example/ok" }, error: null });
    aiVideoFindMany.mockResolvedValue([
      row({ id: "bad-row", video: "creator-1/bad.mp4" }),
      row({ id: "good-row", video: "creator-1/good.mp4" }),
    ]);

    const result = await getAiVideoLibrary("creator-1");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("good-row");
  });

  it("falls back generated_time to created_at when generated_time is null", async () => {
    aiVideoFindMany.mockResolvedValue([
      row({ generated_time: null, created_at: new Date("2026-03-04T05:06:07.000Z") }),
    ]);

    const result = await getAiVideoLibrary("creator-1");

    expect(result[0].generated_time).toBe("2026-03-04T05:06:07.000Z");
  });

  it("formats created_at/generated_time as ISO strings", async () => {
    aiVideoFindMany.mockResolvedValue([
      row({
        generated_time: new Date("2026-01-02T00:00:00.000Z"),
        created_at: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ]);

    const result = await getAiVideoLibrary("creator-1");

    expect(result[0].generated_time).toBe("2026-01-02T00:00:00.000Z");
    expect(result[0].created_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("parses the tag column into the tags array", async () => {
    aiVideoFindMany.mockResolvedValue([row({ tag: '["dance","comedy"]' })]);

    const result = await getAiVideoLibrary("creator-1");

    expect(result[0].tags).toEqual(["dance", "comedy"]);
  });

  it("always stamps creator_id from the trusted input parameter, not the row", async () => {
    // Defense in depth: even if a row's own creator_id column somehow diverged
    // from the scope we queried by, the response must reflect the identity we
    // actually authorized against, not raw row data.
    aiVideoFindMany.mockResolvedValue([row({ creator_id: "some-other-id" })]);

    const result = await getAiVideoLibrary("creator-1");

    expect(result[0].creator_id).toBe("creator-1");
  });

  it("never logs the resolved signed URL or storage path when a per-row error occurs", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    createSignedUrl.mockRejectedValue(new Error("https://signed.example/leaked-secret-token"));
    aiVideoFindMany.mockResolvedValue([row({ video: "creator-1/secret-path.mp4" })]);

    await getAiVideoLibrary("creator-1");

    const loggedArgs = consoleSpy.mock.calls.flat().join(" ");
    expect(loggedArgs).not.toContain("leaked-secret-token");
    expect(loggedArgs).not.toContain("secret-path");
    consoleSpy.mockRestore();
  });
});
