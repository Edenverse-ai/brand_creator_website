import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/storage/signed-upload", () => ({ createSignedUpload: vi.fn() }));

import { getServerSession } from "next-auth";
import { createSignedUpload } from "@/lib/storage/signed-upload";
import { POST } from "../route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/campaigns/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/campaigns/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session (preserves the pre-existing auth contract)", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const res = await POST(jsonRequest({ kind: "campaign_image", ext: "jpg" }) as never);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(createSignedUpload).not.toHaveBeenCalled();
  });

  it("returns 400 on an invalid kind", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(jsonRequest({ kind: "product_photo", ext: "jpg" }) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
    expect(createSignedUpload).not.toHaveBeenCalled();
  });

  it("returns 400 on an invalid ext", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(jsonRequest({ kind: "campaign_image", ext: "bmp" }) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
    expect(createSignedUpload).not.toHaveBeenCalled();
  });

  it("returns 400 when required fields are missing", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(jsonRequest({ kind: "campaign_image" }) as never);

    expect(res.status).toBe(400);
    expect(createSignedUpload).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is not valid JSON", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });

    const req = new Request("http://localhost/api/campaigns/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    const res = await POST(req as never);

    expect(res.status).toBe(400);
    expect(createSignedUpload).not.toHaveBeenCalled();
  });

  it("mints a signed upload in the campaigns bucket, following the general/upload_<hex>.<ext> path scheme", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    (createSignedUpload as any).mockResolvedValue({
      uploadUrl: "https://x/upload?token=t1",
      path: "general/upload_generatedhex.jpg",
      token: "t1",
    });

    const res = await POST(jsonRequest({ kind: "campaign_image", ext: "jpg" }) as never);

    expect(createSignedUpload).toHaveBeenCalledTimes(1);
    const [bucketArg, pathArg] = (createSignedUpload as any).mock.calls[0];
    expect(bucketArg).toBe("campaigns");
    // Path convention: general/upload_{32-char hex}.{ext}, mirroring
    // backend/app/main/services/upload_service.py upload_general_file's
    // `general/upload_{uuid.uuid4().hex}.{ext}` (the uuid itself is not deterministic here).
    expect(pathArg).toMatch(/^general\/upload_[0-9a-f]{32}\.jpg$/);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      uploadUrl: "https://x/upload?token=t1",
      path: "general/upload_generatedhex.jpg",
      token: "t1",
    });
  });

  it("does not scope the path to the session user — matches the Python general/ scheme verbatim, which has no owner segment", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    (createSignedUpload as any).mockResolvedValue({
      uploadUrl: "https://x/upload?token=t1",
      path: "general/upload_generatedhex.png",
      token: "t1",
    });

    await POST(jsonRequest({ kind: "campaign_image", ext: "png" }) as never);

    const [, pathArg] = (createSignedUpload as any).mock.calls[0];
    expect(pathArg).not.toContain("user-1");
    expect(pathArg.startsWith("general/")).toBe(true);
  });

  it.each(["jpg", "jpeg", "png", "webp", "gif"] as const)("accepts ext=%s", async (ext) => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    (createSignedUpload as any).mockResolvedValue({
      uploadUrl: "https://x/upload",
      path: `general/upload_x.${ext}`,
      token: "t1",
    });

    const res = await POST(jsonRequest({ kind: "campaign_image", ext }) as never);

    expect(res.status).toBe(200);
    const [, pathArg] = (createSignedUpload as any).mock.calls[0];
    expect(pathArg).toMatch(new RegExp(`\\.${ext}$`));
  });

  it("returns 500 when minting the signed upload fails", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1" } });
    (createSignedUpload as any).mockRejectedValue(new Error("boom"));

    const res = await POST(jsonRequest({ kind: "campaign_image", ext: "gif" }) as never);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to create upload URL" });
  });
});
