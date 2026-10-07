/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { aiVideo: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

const createAiVideoDownloadUrl = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  createAiVideoDownloadUrl: (...a: unknown[]) => createAiVideoDownloadUrl(...a),
}));

import { getServerSession } from "next-auth";
import { GET } from "../route";

const OWNER = "user-1";
const VIDEO_ID = "11111111-2222-3333-4444-555555555555";
const SIGNED =
  "https://storage.example/object/sign/aivideogenerated/user-1/t1.mp4?token=t&download=x";

function call(id = VIDEO_ID) {
  return GET(new Request(`http://localhost/api/ai-videos/library/${id}/download`) as never, {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/ai-videos/library/[id]/download", () => {
  it("returns 401 without a session", async () => {
    (getServerSession as any).mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for an id that is not a UUID, without querying", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    const res = await call("../../etc");
    expect(res.status).toBe(404);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing video", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    findUnique.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
  });

  it("returns 404 (not 403) for another creator's video", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    findUnique.mockResolvedValue({
      id: VIDEO_ID,
      creator_id: "someone-else",
      video: "someone-else/t1.mp4",
      generated_time: new Date("2026-10-07T10:00:00Z"),
      created_at: new Date("2026-10-07T10:00:00Z"),
    });
    const res = await call();
    expect(res.status).toBe(404);
    expect(createAiVideoDownloadUrl).not.toHaveBeenCalled();
  });

  it("redirects to a short-lived signed URL that downloads with a readable filename", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    findUnique.mockResolvedValue({
      id: VIDEO_ID,
      creator_id: OWNER,
      video: "user-1/t1.mp4",
      generated_time: new Date("2026-10-07T10:00:00Z"),
      created_at: new Date("2026-10-07T09:00:00Z"),
    });
    createAiVideoDownloadUrl.mockResolvedValue(SIGNED);

    const res = await call();

    expect(createAiVideoDownloadUrl).toHaveBeenCalledWith(
      "user-1/t1.mp4",
      "cricher-ai-video-2026-10-07-11111111.mp4",
      60
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(SIGNED);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps the stored file extension in the download name", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    findUnique.mockResolvedValue({
      id: VIDEO_ID,
      creator_id: OWNER,
      video: "user-1/legacy-clip.mov",
      generated_time: null,
      created_at: new Date("2026-09-30T23:30:00Z"),
    });
    createAiVideoDownloadUrl.mockResolvedValue(SIGNED);

    await call();

    expect(createAiVideoDownloadUrl.mock.calls[0][1]).toBe(
      "cricher-ai-video-2026-09-30-11111111.mov"
    );
  });

  it("returns 502 when the storage URL cannot be signed", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    findUnique.mockResolvedValue({
      id: VIDEO_ID,
      creator_id: OWNER,
      video: "user-1/t1.mp4",
      generated_time: new Date("2026-10-07T10:00:00Z"),
      created_at: new Date("2026-10-07T10:00:00Z"),
    });
    createAiVideoDownloadUrl.mockResolvedValue(null);

    const res = await call();
    expect(res.status).toBe(502);
  });
});
