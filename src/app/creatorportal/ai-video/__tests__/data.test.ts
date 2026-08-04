import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { tikTokAccount: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() } },
}));

const getAiVideoLibrary = vi.fn();
vi.mock("@/lib/ai-video-library", () => ({
  getAiVideoLibrary: (...args: unknown[]) => getAiVideoLibrary(...args),
}));

import { fetchAiVideos } from "../data";

beforeEach(() => vi.clearAllMocks());

describe("fetchAiVideos", () => {
  it("returns [] without calling the library port when userId is null (no session)", async () => {
    const result = await fetchAiVideos(null);

    expect(result).toEqual([]);
    expect(getAiVideoLibrary).not.toHaveBeenCalled();
  });

  it("calls getAiVideoLibrary with the given userId (no more CAMPAIGNS_API_URL/fetch)", async () => {
    getAiVideoLibrary.mockResolvedValue([]);

    await fetchAiVideos("user-1");

    expect(getAiVideoLibrary).toHaveBeenCalledWith("user-1");
    expect(getAiVideoLibrary).toHaveBeenCalledTimes(1);
  });

  it("maps the ported response shape onto AiVideoRecord, preserving what AiVideoDashboard destructures", async () => {
    getAiVideoLibrary.mockResolvedValue([
      {
        id: "video-1",
        creator_id: "user-1",
        generated_time: "2020-01-01T00:00:00.000Z",
        video_url: "https://signed.example/video-1.mp4",
        tags: ["dance", "comedy"],
        created_at: "2019-12-31T00:00:00.000Z",
        thumbnail_url: "https://signed.example/thumb-1.jpg",
      },
    ]);

    const [record] = await fetchAiVideos("user-1");

    expect(record.id).toBe("video-1");
    expect(record.creatorId).toBe("user-1");
    expect(record.generatedAt).toBe("2020-01-01T00:00:00.000Z");
    expect(record.videoUrl).toBe("https://signed.example/video-1.mp4");
    expect(record.thumbnailUrl).toBe("https://signed.example/thumb-1.jpg");
    expect(record.tags).toEqual(["dance", "comedy"]);
    // Generated over 7 days before the fixed system date in this suite -> expired.
    expect(record.status).toBe("expired");
    expect(typeof record.expiresAt).toBe("string");
  });

  it("marks a just-generated video as ready", async () => {
    getAiVideoLibrary.mockResolvedValue([
      {
        id: "video-2",
        creator_id: "user-1",
        generated_time: new Date().toISOString(),
        video_url: "https://signed.example/video-2.mp4",
        tags: [],
        created_at: new Date().toISOString(),
        thumbnail_url: null,
      },
    ]);

    const [record] = await fetchAiVideos("user-1");

    expect(record.status).toBe("ready");
    expect(record.thumbnailUrl).toBeNull();
  });

  it("returns [] and swallows the error when the library port throws unexpectedly", async () => {
    getAiVideoLibrary.mockRejectedValue(new Error("boom"));

    const result = await fetchAiVideos("user-1");

    expect(result).toEqual([]);
  });
});
