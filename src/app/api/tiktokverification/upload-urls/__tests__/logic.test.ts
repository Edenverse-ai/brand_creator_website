/* @vitest-environment node */

import { describe, it, expect, vi, beforeEach } from "vitest";

const createSignedUpload = vi.fn();
vi.mock("@/lib/storage/signed-upload", () => ({
  createSignedUpload: (...args: unknown[]) => createSignedUpload(...args),
}));

import { generateUploadUrls, VERIFICATION_ASSETS_BUCKET } from "../logic";

describe("generateUploadUrls", () => {
  beforeEach(() => {
    createSignedUpload.mockReset();
    createSignedUpload.mockImplementation(async (_bucket: string, path: string) => ({
      uploadUrl: `https://x/upload?path=${path}`,
      path,
      token: `token-for-${path}`,
    }));
  });

  it("uses the verification-assets bucket (mirrors TikTokVerificationService)", () => {
    expect(VERIFICATION_ASSETS_BUCKET).toBe("verification-assets");
  });

  it("builds the {id_number}/{name}.{extension} path for every recognized file key", async () => {
    const result = await generateUploadUrls("TEST123", [
      { key: "id_front_file", extension: "png" },
      { key: "handheld_id_file", extension: "jpg" },
      { key: "backend_ss_file", extension: "jpg" },
      { key: "signed_auth_file", extension: "pdf" },
      { key: "identity_video_file", extension: "mp4" },
    ]);

    expect(createSignedUpload).toHaveBeenCalledWith("verification-assets", "TEST123/id_front.png");
    expect(createSignedUpload).toHaveBeenCalledWith(
      "verification-assets",
      "TEST123/id_handheld.jpg"
    );
    expect(createSignedUpload).toHaveBeenCalledWith(
      "verification-assets",
      "TEST123/backend_ss.jpg"
    );
    expect(createSignedUpload).toHaveBeenCalledWith(
      "verification-assets",
      "TEST123/authorization.pdf"
    );
    expect(createSignedUpload).toHaveBeenCalledWith(
      "verification-assets",
      "TEST123/identity_video.mp4"
    );

    expect(Object.keys(result).sort()).toEqual(
      [
        "id_front_file",
        "handheld_id_file",
        "backend_ss_file",
        "signed_auth_file",
        "identity_video_file",
      ].sort()
    );
    expect(result.id_front_file).toEqual({
      upload_url: "https://x/upload?path=TEST123/id_front.png",
      file_path: "TEST123/id_front.png",
      token: "token-for-TEST123/id_front.png",
    });
  });

  it("echoes the locally-built file_path rather than whatever signed-upload returns as path", async () => {
    createSignedUpload.mockResolvedValue({
      uploadUrl: "https://x/upload",
      path: "SOME/OTHER/PATH.png",
      token: "t1",
    });

    const result = await generateUploadUrls("TEST123", [
      { key: "id_front_file", extension: "png" },
    ]);

    expect(result.id_front_file.file_path).toBe("TEST123/id_front.png");
  });

  it("silently skips unrecognized file keys (matches Python's `if file_key in file_mappings` guard)", async () => {
    const result = await generateUploadUrls("TEST123", [
      { key: "unknown_key", extension: "png" },
      { key: "id_front_file", extension: "png" },
    ]);

    expect(createSignedUpload).toHaveBeenCalledTimes(1);
    expect(Object.keys(result)).toEqual(["id_front_file"]);
  });

  it("returns an empty map for an empty files array", async () => {
    const result = await generateUploadUrls("TEST123", []);
    expect(result).toEqual({});
    expect(createSignedUpload).not.toHaveBeenCalled();
  });

  it("defaults token to null when the signed upload doesn't include one", async () => {
    createSignedUpload.mockResolvedValue({
      uploadUrl: "https://x/upload",
      path: "TEST123/id_front.png",
      token: undefined,
    });

    const result = await generateUploadUrls("TEST123", [
      { key: "id_front_file", extension: "png" },
    ]);

    expect(result.id_front_file.token).toBeNull();
  });
});
