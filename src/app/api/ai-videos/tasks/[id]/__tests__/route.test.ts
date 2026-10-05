/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { aiVideoTask: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

const syncTask = vi.fn();
vi.mock("@/lib/ai-video-generation", () => ({
  syncTask: (...a: unknown[]) => syncTask(...a),
}));

const createAiVideoSignedUrl = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  createAiVideoSignedUrl: (...a: unknown[]) => createAiVideoSignedUrl(...a),
}));

import { getServerSession } from "next-auth";
import { GET } from "../route";

const OWNER = "user-1";

function call(id = "task1") {
  return GET(new Request(`http://localhost/api/ai-videos/tasks/${id}`) as never, {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  syncTask.mockResolvedValue(undefined);
});

describe("GET /api/ai-videos/tasks/[id]", () => {
  it("returns 401 without a session", async () => {
    (getServerSession as any).mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(syncTask).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing task", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    findUnique.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
    expect(syncTask).not.toHaveBeenCalled();
  });

  it("returns 404 (not 403) for another creator's task", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    findUnique.mockResolvedValue({ id: "task1", creatorId: "someone-else" });
    const res = await call();
    expect(res.status).toBe(404);
    expect(syncTask).not.toHaveBeenCalled();
  });

  it("syncs, then returns status without a video while generating", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    findUnique.mockResolvedValue({
      id: "task1",
      creatorId: OWNER,
      status: "GENERATING",
      errorMessage: null,
      aiVideoId: null,
    });

    const res = await call();

    expect(syncTask).toHaveBeenCalledWith("task1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "task1",
      status: "GENERATING",
      errorMessage: null,
      videoUrl: null,
    });
    expect(createAiVideoSignedUrl).not.toHaveBeenCalled();
  });

  it("returns a signed library URL once delivered", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    findUnique.mockResolvedValue({
      id: "task1",
      creatorId: OWNER,
      status: "DELIVERED",
      errorMessage: null,
      aiVideoId: "11111111-1111-1111-1111-111111111111",
    });
    createAiVideoSignedUrl.mockResolvedValue("https://storage.example/signed.mp4");

    const res = await call();

    expect(createAiVideoSignedUrl).toHaveBeenCalledWith(`${OWNER}/task1.mp4`, 3600);
    expect(await res.json()).toMatchObject({
      status: "DELIVERED",
      videoUrl: "https://storage.example/signed.mp4",
    });
  });

  it("still answers when the sync itself throws", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
    findUnique.mockResolvedValue({
      id: "task1",
      creatorId: OWNER,
      status: "GENERATING",
      errorMessage: null,
      aiVideoId: null,
    });
    syncTask.mockRejectedValue(new Error("db hiccup"));

    const res = await call();
    expect(res.status).toBe(200);
  });
});
