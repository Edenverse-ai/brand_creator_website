import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/storage/signed-upload", () => ({ createSignedUpload: vi.fn() }));
vi.mock("@paralleldrive/cuid2", () => ({ createId: vi.fn() }));

import { getServerSession } from "next-auth";
import { createSignedUpload } from "@/lib/storage/signed-upload";
import { createId } from "@paralleldrive/cuid2";
import { POST } from "../route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/ai-videos/tasks/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai-videos/tasks/upload-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createSignedUpload as any).mockResolvedValue({
      uploadUrl: "https://x/upload?token=t1",
      path: "unused-in-most-assertions",
      token: "t1",
    });
  });

  it("returns 401 when there is no session", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const res = await POST(jsonRequest({ kind: "portrait", ext: "jpg" }) as never);

    expect(res.status).toBe(401);
    expect(createSignedUpload).not.toHaveBeenCalled();
    expect(createId).not.toHaveBeenCalled();
  });

  it("returns 400 on an invalid kind", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(jsonRequest({ kind: "thumbnail", ext: "jpg" }) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
    expect(createSignedUpload).not.toHaveBeenCalled();
  });

  it("returns 400 when ext does not match kind (voice ext for a portrait)", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(jsonRequest({ kind: "portrait", ext: "mp3" }) as never);

    expect(res.status).toBe(400);
    expect(createSignedUpload).not.toHaveBeenCalled();
  });

  it("returns 400 when taskId contains path-unsafe characters", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(
      jsonRequest({ kind: "portrait", ext: "jpg", taskId: "../other-user" }) as never
    );

    expect(res.status).toBe(400);
    expect(createSignedUpload).not.toHaveBeenCalled();
  });

  it("mints a fresh taskId and follows the {creatorId}/{taskId}/{kind}.{ext} path convention", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    (createId as any).mockReturnValue("generatedtaskid1");

    const res = await POST(jsonRequest({ kind: "portrait", ext: "jpg" }) as never);

    expect(createId).toHaveBeenCalledTimes(1);
    expect(createSignedUpload).toHaveBeenCalledWith(
      "ai-video-tasks",
      "user-1/generatedtaskid1/portrait.jpg"
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.taskId).toBe("generatedtaskid1");
  });

  it("reuses a provided taskId instead of minting a new one (second-asset call)", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(
      jsonRequest({ kind: "voice", ext: "mp3", taskId: "existingtaskid1" }) as never
    );

    expect(createId).not.toHaveBeenCalled();
    expect(createSignedUpload).toHaveBeenCalledWith(
      "ai-video-tasks",
      "user-1/existingtaskid1/voice.mp3"
    );
    const body = await res.json();
    expect(body.taskId).toBe("existingtaskid1");
  });

  it("returns 500 when minting the signed upload fails", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    (createSignedUpload as any).mockRejectedValue(new Error("boom"));

    const res = await POST(jsonRequest({ kind: "voice", ext: "wav" }) as never);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to create upload URL" });
  });
});
