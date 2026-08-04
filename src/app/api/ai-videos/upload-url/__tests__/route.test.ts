import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/storage/signed-upload", () => ({ createSignedUpload: vi.fn() }));

import { getServerSession } from "next-auth";
import { createSignedUpload } from "@/lib/storage/signed-upload";
import { POST } from "../route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/ai-videos/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai-videos/upload-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const res = await POST(jsonRequest({ kind: "voice_sample", ext: "mp3" }) as never);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(createSignedUpload).not.toHaveBeenCalled();
  });

  it("returns 400 on an invalid body", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(jsonRequest({ kind: "not_a_kind", ext: "mp3" }) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
    expect(createSignedUpload).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is not valid JSON", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });

    const req = new Request("http://localhost/api/ai-videos/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    const res = await POST(req as never);

    expect(res.status).toBe(400);
  });

  it("mints a signed upload for the session user and returns it", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    (createSignedUpload as any).mockResolvedValue({
      uploadUrl: "https://x/upload?token=t1",
      path: "user-1/voice_sample-generated-uuid.mp3",
      token: "t1",
    });

    const res = await POST(jsonRequest({ kind: "voice_sample", ext: "mp3" }) as never);

    expect(createSignedUpload).toHaveBeenCalledTimes(1);
    const [bucketArg, pathArg] = (createSignedUpload as any).mock.calls[0];
    expect(bucketArg).toBe("aivideogenerated");
    // Path convention: {userId}/{kind}-{uuid}.{ext} (UUID itself is not deterministic here).
    expect(pathArg).toMatch(
      /^user-1\/voice_sample-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$/
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      uploadUrl: "https://x/upload?token=t1",
      path: "user-1/voice_sample-generated-uuid.mp3",
      token: "t1",
    });
  });

  it("returns 500 when minting the signed upload fails", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    (createSignedUpload as any).mockRejectedValue(new Error("boom"));

    const res = await POST(jsonRequest({ kind: "reference_image", ext: "png" }) as never);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to create upload URL" });
  });
});
