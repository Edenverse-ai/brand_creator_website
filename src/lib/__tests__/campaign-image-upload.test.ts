import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CAMPAIGN_IMAGE_BUCKET,
  CAMPAIGN_IMAGE_MAX_BYTES,
  CAMPAIGN_IMAGE_MIME_TO_EXT,
  validateCampaignImageFile,
  buildCampaignImagePublicUrl,
  uploadCampaignImage,
} from "@/lib/campaign-image-upload";

describe("CAMPAIGN_IMAGE_MIME_TO_EXT", () => {
  it("maps every MIME type upload_service.py's _validate_file allows", () => {
    expect(CAMPAIGN_IMAGE_MIME_TO_EXT).toEqual({
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    });
  });
});

describe("validateCampaignImageFile", () => {
  it("accepts a small JPEG/PNG/WebP/GIF", () => {
    for (const type of Object.keys(CAMPAIGN_IMAGE_MIME_TO_EXT)) {
      const f = new File(["x"], "p", { type });
      expect(validateCampaignImageFile(f)).toEqual({ ok: true });
    }
  });

  it("rejects a file over 5MB with the pre-existing size message", () => {
    const big = new File([new Uint8Array(CAMPAIGN_IMAGE_MAX_BYTES + 1)], "p.jpg", {
      type: "image/jpeg",
    });
    expect(validateCampaignImageFile(big)).toEqual({
      ok: false,
      error: "Product photo must be less than 5MB",
    });
  });

  it("rejects an unsupported MIME type", () => {
    const f = new File(["x"], "p.pdf", { type: "application/pdf" });
    expect(validateCampaignImageFile(f)).toEqual({
      ok: false,
      error: "Product photo must be a JPEG, PNG, WebP, or GIF image",
    });
  });

  it("reports the size error (not the type error) when a file is both oversized and an unsupported type", () => {
    const big = new File([new Uint8Array(CAMPAIGN_IMAGE_MAX_BYTES + 1)], "p.pdf", {
      type: "application/pdf",
    });
    expect(validateCampaignImageFile(big)).toEqual({
      ok: false,
      error: "Product photo must be less than 5MB",
    });
  });
});

describe("buildCampaignImagePublicUrl", () => {
  const ORIGINAL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_ENV;
  });

  it("matches upload_service.py's _get_public_url fallback formula byte-for-byte", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://loesykbqlhynbjmqxfxc.supabase.co";
    expect(buildCampaignImagePublicUrl("general/upload_abc123.jpg")).toBe(
      "https://loesykbqlhynbjmqxfxc.supabase.co/storage/v1/object/public/campaigns/general/upload_abc123.jpg"
    );
  });

  it("strips a trailing slash from the base URL", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://loesykbqlhynbjmqxfxc.supabase.co/";
    expect(buildCampaignImagePublicUrl("general/x.png")).toBe(
      "https://loesykbqlhynbjmqxfxc.supabase.co/storage/v1/object/public/campaigns/general/x.png"
    );
  });

  it("uses the campaigns bucket constant", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://loesykbqlhynbjmqxfxc.supabase.co";
    expect(CAMPAIGN_IMAGE_BUCKET).toBe("campaigns");
    expect(buildCampaignImagePublicUrl("p")).toContain(`/public/${CAMPAIGN_IMAGE_BUCKET}/p`);
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL is not configured", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => buildCampaignImagePublicUrl("general/x.jpg")).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL is not configured"
    );
  });
});

describe("uploadCampaignImage", () => {
  const ORIGINAL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://loesykbqlhynbjmqxfxc.supabase.co";
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_ENV;
  });

  it("rejects an invalid file before making any network call", async () => {
    const f = new File(["x"], "p.pdf", { type: "application/pdf" });
    await expect(uploadCampaignImage(f)).rejects.toThrow(
      "Product photo must be a JPEG, PNG, WebP, or GIF image"
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("mints an upload URL, PUTs the bytes, and returns the public URL for the minted path", async () => {
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: "https://storage.example/upload?token=t1",
          path: "general/upload_abc123.jpg",
          token: "t1",
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const url = await uploadCampaignImage(file);

    expect(url).toBe(
      "https://loesykbqlhynbjmqxfxc.supabase.co/storage/v1/object/public/campaigns/general/upload_abc123.jpg"
    );

    expect(global.fetch).toHaveBeenCalledTimes(2);

    const [mintUrl, mintInit] = (global.fetch as any).mock.calls[0];
    expect(mintUrl).toBe("/api/campaigns/upload");
    expect(mintInit.method).toBe("POST");
    expect(JSON.parse(mintInit.body)).toEqual({ kind: "campaign_image", ext: "jpg" });

    const [putUrl, putInit] = (global.fetch as any).mock.calls[1];
    expect(putUrl).toBe("https://storage.example/upload?token=t1");
    expect(putInit.method).toBe("PUT");
    expect(putInit.headers["Content-Type"]).toBe("image/jpeg");
    expect(putInit.body).toBe(file);
  });

  it("throws the server error message when minting the upload URL fails", async () => {
    const file = new File(["x"], "photo.png", { type: "image/png" });
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Failed to create upload URL" }),
    });

    await expect(uploadCampaignImage(file)).rejects.toThrow("Failed to create upload URL");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("throws when the direct-to-storage PUT fails", async () => {
    const file = new File(["x"], "photo.webp", { type: "image/webp" });
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: "https://storage.example/upload?token=t1",
          path: "general/upload_x.webp",
          token: "t1",
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => "token expired",
      });

    await expect(uploadCampaignImage(file)).rejects.toThrow(/Failed to upload product photo/);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
