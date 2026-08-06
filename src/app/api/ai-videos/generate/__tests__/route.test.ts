import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const aiVideoRequestCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { aiVideoRequest: { create: (...args: unknown[]) => aiVideoRequestCreate(...args) } },
}));

const getPublicUrl = vi.fn((path: string) => ({
  data: { publicUrl: `https://mock.supabase.co/storage/v1/object/public/aivideogenerated/${path}` },
}));
const supabaseFrom = vi.fn(() => ({ getPublicUrl }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ storage: { from: supabaseFrom } }),
}));

import { getServerSession } from "next-auth";
import { POST } from "../route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/ai-videos/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai-videos/generate (JSON path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPublicUrl.mockImplementation((path: string) => ({
      data: {
        publicUrl: `https://mock.supabase.co/storage/v1/object/public/aivideogenerated/${path}`,
      },
    }));
  });

  it("returns 401 when there is no session", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const res = await POST(jsonRequest({ prompt: "hello" }) as never);

    expect(res.status).toBe(401);
    expect(aiVideoRequestCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the body fails schema validation", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(jsonRequest({}) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
    expect(aiVideoRequestCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when prompt is blank after trimming", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(jsonRequest({ prompt: "   " }) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Prompt is required" });
    expect(aiVideoRequestCreate).not.toHaveBeenCalled();
  });

  it("returns 403 when voice_sample_path does not belong to the session user", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(
      jsonRequest({ prompt: "hi", voice_sample_path: "someone-else/voice.mp3" }) as never
    );

    expect(res.status).toBe(403);
    expect(aiVideoRequestCreate).not.toHaveBeenCalled();
  });

  it("returns 403 for a path-traversal payload that string-prefix-matches the owner (security regression guard)", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });

    // Starts with "user-1/" so a naive startsWith(ownerId + "/") check would incorrectly
    // accept this; it must be rejected by structural validation instead.
    const res = await POST(
      jsonRequest({
        prompt: "hi",
        reference_image_path: "user-1/../someone-else/reference_image.jpg",
      }) as never
    );

    expect(res.status).toBe(403);
    expect(aiVideoRequestCreate).not.toHaveBeenCalled();
  });

  it("accepts a path owned by the session user even when creator_id is overridden (override alone stays legal)", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "session-user" } });
    aiVideoRequestCreate.mockResolvedValue({ id: "req-override-owned-path" });

    // Path belongs to the authenticated session user; creator_id override only affects
    // which creator the row is attributed to, not whose paths are acceptable.
    const res = await POST(
      jsonRequest({
        prompt: "hi",
        creator_id: "other-creator",
        voice_sample_path: "session-user/voice.mp3",
      }) as never
    );

    expect(res.status).toBe(200);
    expect(aiVideoRequestCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ creator_id: "other-creator" }) })
    );
  });

  it("rejects a path owned by the creator_id override but not the session user (anti-bypass)", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "session-user" } });

    // Attacker sets creator_id to a victim id and pairs it with a path under that same
    // prefix. Ownership must anchor to the authenticated session, never the body
    // override, or this trivially passes for any path the attacker chooses.
    const res = await POST(
      jsonRequest({
        prompt: "hi",
        creator_id: "other-creator",
        voice_sample_path: "other-creator/voice.mp3",
      }) as never
    );

    expect(res.status).toBe(403);
    expect(aiVideoRequestCreate).not.toHaveBeenCalled();
  });

  it("creates the AiVideoRequest row with mapped fields and returns the frozen response shape", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    aiVideoRequestCreate.mockResolvedValue({ id: "req-123" });

    const res = await POST(
      jsonRequest({
        prompt: "  Make a video  ",
        voice_sample_path: "user-1/voice_sample-abc.mp3",
        reference_image_path: "user-1/reference_image-def.png",
      }) as never
    );

    expect(aiVideoRequestCreate).toHaveBeenCalledWith({
      data: {
        creator_id: "user-1",
        prompt: "Make a video",
        voice_sample:
          "https://mock.supabase.co/storage/v1/object/public/aivideogenerated/user-1/voice_sample-abc.mp3",
        image:
          "https://mock.supabase.co/storage/v1/object/public/aivideogenerated/user-1/reference_image-def.png",
      },
      select: { id: true },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      [
        "creator_id",
        "image_url",
        "message",
        "prompt",
        "request_id",
        "status",
        "storage_path",
        "voice_sample_url",
      ].sort()
    );
    expect(body).toEqual({
      request_id: "req-123",
      creator_id: "user-1",
      prompt: "Make a video",
      voice_sample_url:
        "https://mock.supabase.co/storage/v1/object/public/aivideogenerated/user-1/voice_sample-abc.mp3",
      image_url:
        "https://mock.supabase.co/storage/v1/object/public/aivideogenerated/user-1/reference_image-def.png",
      storage_path: "user-1/req-123",
      status: "queued",
      message: "AI video request queued successfully",
    });
  });

  it("defaults voice_sample/image to null and creator_id to the session user when omitted", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    aiVideoRequestCreate.mockResolvedValue({ id: "req-456" });

    const res = await POST(jsonRequest({ prompt: "just a prompt" }) as never);

    expect(aiVideoRequestCreate).toHaveBeenCalledWith({
      data: {
        creator_id: "user-1",
        prompt: "just a prompt",
        voice_sample: null,
        image: null,
      },
      select: { id: true },
    });
    const body = await res.json();
    expect(body.voice_sample_url).toBeNull();
    expect(body.image_url).toBeNull();
  });

  it("honors an explicit creator_id override in the body", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "session-user" } });
    aiVideoRequestCreate.mockResolvedValue({ id: "req-789" });

    await POST(jsonRequest({ prompt: "hi", creator_id: "other-creator" }) as never);

    expect(aiVideoRequestCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ creator_id: "other-creator" }) })
    );
  });

  it("returns 500 when the database insert fails", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    aiVideoRequestCreate.mockRejectedValue(new Error("db down"));

    const res = await POST(jsonRequest({ prompt: "hi" }) as never);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to save AI video request" });
  });
});

describe("POST /api/ai-videos/generate (non-JSON content types)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("refuses multipart with 415 and never reaches the DB (FastAPI proxy removed)", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    const fetchMock = vi.fn();
    global.fetch = fetchMock as never;

    const formData = new FormData();
    formData.append("prompt", "hello");
    const req = new Request("http://localhost/api/ai-videos/generate", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req as never);

    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: "Content-Type must be application/json" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(aiVideoRequestCreate).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated multipart request with 401 before the content-type check", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const req = new Request("http://localhost/api/ai-videos/generate", {
      method: "POST",
      body: new FormData(),
    });

    const res = await POST(req as never);

    expect(res.status).toBe(401);
    expect(aiVideoRequestCreate).not.toHaveBeenCalled();
  });
});
