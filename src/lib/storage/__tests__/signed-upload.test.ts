/* @vitest-environment node */

import { describe, it, expect, vi, beforeEach } from "vitest";

const createSignedUploadUrl = vi.fn();
const from = vi.fn(() => ({ createSignedUploadUrl }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    storage: { from },
  }),
}));

import { createSignedUpload } from "../signed-upload";

describe("createSignedUpload", () => {
  beforeEach(() => {
    from.mockReset();
    createSignedUploadUrl.mockReset();
  });

  it("returns url, path and token from supabase", async () => {
    createSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: "https://x/upload?token=t1", path: "a/b.mp4", token: "t1" },
      error: null,
    });
    const out = await createSignedUpload("aivideogenerated", "a/b.mp4");
    expect(out).toEqual({ uploadUrl: "https://x/upload?token=t1", path: "a/b.mp4", token: "t1" });
    expect(from).toHaveBeenCalledWith("aivideogenerated");
    expect(createSignedUploadUrl).toHaveBeenCalledWith("a/b.mp4");
  });

  it("throws on supabase error", async () => {
    createSignedUploadUrl.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(createSignedUpload("campaigns", "x.jpg")).rejects.toThrow(/boom|signed/i);
    expect(from).toHaveBeenCalledWith("campaigns");
    expect(createSignedUploadUrl).toHaveBeenCalledWith("x.jpg");
  });
});
