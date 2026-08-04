import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const getAiVideoLibrary = vi.fn();
vi.mock("@/lib/ai-video-library", () => ({
  getAiVideoLibrary: (...args: unknown[]) => getAiVideoLibrary(...args),
}));

import { getServerSession } from "next-auth";
import { GET } from "../route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/ai-videos/library", () => {
  it("returns 401 when there is no session", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(getAiVideoLibrary).not.toHaveBeenCalled();
  });

  it("returns 401 when the session has no user id", async () => {
    (getServerSession as any).mockResolvedValue({ user: {} });

    const res = await GET();

    expect(res.status).toBe(401);
    expect(getAiVideoLibrary).not.toHaveBeenCalled();
  });

  it("scopes the library lookup to the session user id and returns it verbatim", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "session-user" } });
    const items = [
      {
        id: "video-1",
        creator_id: "session-user",
        generated_time: "2026-01-02T00:00:00.000Z",
        video_url: "https://signed.example/video-1.mp4",
        tags: ["dance"],
        created_at: "2026-01-01T00:00:00.000Z",
        thumbnail_url: null,
      },
    ];
    getAiVideoLibrary.mockResolvedValue(items);

    const res = await GET();

    expect(getAiVideoLibrary).toHaveBeenCalledWith("session-user");
    expect(getAiVideoLibrary).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(items);
  });

  it("has no request-derived creator_id input at all, so a foreign id in the URL cannot widen the result set", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "session-user" } });
    getAiVideoLibrary.mockResolvedValue([]);

    // GET() intentionally takes no `request` parameter -- there is no query string
    // or body for a caller to smuggle a foreign creator_id into. This test pins
    // that shape: even constructing a request with a spoofed creator_id has no
    // effect, because nothing in the route ever reads it.
    const spoofedRequest = new Request(
      "http://localhost/api/ai-videos/library?creator_id=someone-elses-id"
    );
    void spoofedRequest;

    await GET();

    expect(getAiVideoLibrary).toHaveBeenCalledWith("session-user");
    expect(getAiVideoLibrary).not.toHaveBeenCalledWith("someone-elses-id");
  });

  it("returns [] at 200 instead of leaking an error message when getAiVideoLibrary throws unexpectedly", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "session-user" } });
    getAiVideoLibrary.mockRejectedValue(
      new Error("PrismaClientValidationError: full record dump would go here")
    );

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
