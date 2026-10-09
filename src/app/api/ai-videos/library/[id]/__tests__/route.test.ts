/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const db = {
  findUnique: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  taskUpdateMany: vi.fn(),
  transaction: vi.fn(),
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiVideo: {
      findUnique: (...a: unknown[]) => db.findUnique(...a),
      update: (...a: unknown[]) => db.update(...a),
      delete: (...a: unknown[]) => db.remove(...a),
    },
    aiVideoTask: { updateMany: (...a: unknown[]) => db.taskUpdateMany(...a) },
    $transaction: (...a: unknown[]) => db.transaction(...a),
  },
}));

const deleteFromAiVideoBucket = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  deleteFromAiVideoBucket: (...a: unknown[]) => deleteFromAiVideoBucket(...a),
}));

import { getServerSession } from "next-auth";
import { DELETE, PATCH } from "../route";

const OWNER = "user-1";
const VIDEO_ID = "11111111-2222-3333-4444-555555555555";
const OWN_VIDEO = { id: VIDEO_ID, creator_id: OWNER, video: "user-1/t1.mp4" };

const context = (id = VIDEO_ID) => ({ params: Promise.resolve({ id }) });

function rename(body: unknown, id = VIDEO_ID) {
  return PATCH(
    new Request(`http://localhost/api/ai-videos/library/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    context(id)
  );
}

function remove(id = VIDEO_ID) {
  return DELETE(
    new Request(`http://localhost/api/ai-videos/library/${id}`, { method: "DELETE" }) as never,
    context(id)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (getServerSession as any).mockResolvedValue({ user: { id: OWNER } });
  db.findUnique.mockResolvedValue(OWN_VIDEO);
  db.transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
  deleteFromAiVideoBucket.mockResolvedValue(undefined);
});

describe.each([
  ["PATCH", () => rename({ name: "New name" })],
  ["DELETE", () => remove()],
])("%s /api/ai-videos/library/[id] — access", (_method, call) => {
  it("returns 401 without a session", async () => {
    (getServerSession as any).mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(db.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing video", async () => {
    db.findUnique.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("returns 404 (not 403) for another creator's video, and changes nothing", async () => {
    db.findUnique.mockResolvedValue({ ...OWN_VIDEO, creator_id: "someone-else" });
    expect((await call()).status).toBe(404);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.remove).not.toHaveBeenCalled();
    expect(deleteFromAiVideoBucket).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/ai-videos/library/[id]", () => {
  it("returns 404 for an id that is not a UUID, without querying", async () => {
    expect((await rename({ name: "x" }, "../../etc")).status).toBe(404);
    expect(db.findUnique).not.toHaveBeenCalled();
  });

  it("saves the trimmed name", async () => {
    const res = await rename({ name: "  Summer launch  " });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: VIDEO_ID, name: "Summer launch" });
    expect(db.update).toHaveBeenCalledWith({
      where: { id: VIDEO_ID },
      data: { name: "Summer launch" },
    });
  });

  it.each([
    ["an empty name", { name: "" }],
    ["a name of only spaces", { name: "   " }],
    ["a name over 80 characters", { name: "x".repeat(81) }],
    ["a missing name", {}],
    ["a name that isn't text", { name: 42 }],
  ])("returns 400 for %s", async (_label, body) => {
    const res = await rename(body);
    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("accepts a name of exactly 80 characters", async () => {
    expect((await rename({ name: "x".repeat(80) })).status).toBe(200);
  });

  it("returns 409 when the creator already has a video with that name", async () => {
    db.update.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));

    const res = await rename({ name: "ai-video-1" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "You already have a video with this name." });
  });

  it("returns 500 when the update fails for another reason", async () => {
    db.update.mockRejectedValue(new Error("db down"));
    expect((await rename({ name: "ok" })).status).toBe(500);
  });
});

describe("DELETE /api/ai-videos/library/[id]", () => {
  it("deletes the row, detaches the generation task and removes the file", async () => {
    db.taskUpdateMany.mockReturnValue("detach-op");
    db.remove.mockReturnValue("delete-op");

    const res = await remove();

    expect(res.status).toBe(200);
    expect(db.taskUpdateMany).toHaveBeenCalledWith({
      where: { aiVideoId: VIDEO_ID },
      data: { aiVideoId: null },
    });
    expect(db.remove).toHaveBeenCalledWith({ where: { id: VIDEO_ID } });
    expect(db.transaction).toHaveBeenCalledWith(["detach-op", "delete-op"]);
    expect(deleteFromAiVideoBucket).toHaveBeenCalledWith(["user-1/t1.mp4"]);
  });

  it("leaves the file alone when the database delete fails", async () => {
    db.transaction.mockRejectedValue(new Error("db down"));

    const res = await remove();

    expect(res.status).toBe(500);
    expect(deleteFromAiVideoBucket).not.toHaveBeenCalled();
  });

  it("skips storage for a row with no file", async () => {
    db.findUnique.mockResolvedValue({ ...OWN_VIDEO, video: null });

    expect((await remove()).status).toBe(200);
    expect(deleteFromAiVideoBucket).not.toHaveBeenCalled();
  });
});
