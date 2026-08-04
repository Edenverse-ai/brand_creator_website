import { describe, it, expect } from "vitest";
import {
  TIKTOK_VERIFY_IMAGE_EXTENSIONS,
  TIKTOK_VERIFY_VIDEO_EXTENSIONS,
  TIKTOK_VERIFY_DOCUMENT_EXTENSIONS,
  TIKTOK_VERIFY_ALLOWED_EXTENSIONS,
  TIKTOK_VERIFY_ALLOWED_EXTENSIONS_LABEL,
  isAllowedTikTokVerifyExtension,
  describeUnsupportedTikTokVerifyExtension,
  resolveTikTokVerifyFileSelection,
} from "@/lib/tiktok-verify-upload";

describe("TIKTOK_VERIFY_ALLOWED_EXTENSIONS", () => {
  it("is the union of the image, document, and video groups with no duplicates", () => {
    const expected = [
      ...TIKTOK_VERIFY_IMAGE_EXTENSIONS,
      ...TIKTOK_VERIFY_DOCUMENT_EXTENSIONS,
      ...TIKTOK_VERIFY_VIDEO_EXTENSIONS,
    ];
    expect(TIKTOK_VERIFY_ALLOWED_EXTENSIONS).toEqual(expected);
    expect(new Set(TIKTOK_VERIFY_ALLOWED_EXTENSIONS).size).toBe(
      TIKTOK_VERIFY_ALLOWED_EXTENSIONS.length
    );
  });

  it('covers what a real accept="image/*" picker can hand back for the three image fields, beyond the old label-derived set', () => {
    // Task 2.3 re-review FIX 1: the previous allowlist rejected these even though
    // accept="image/*" (id_front_file, handheld_id_file, backend_ss_file) let a real
    // browser picker select them. jfif added in the final-polish pass: Chrome on
    // Windows has historically written .jfif instead of .jpg for "Save image as",
    // which is plausible on the backend_ss_file screenshot field.
    for (const ext of ["webp", "heic", "heif", "avif", "bmp", "tif", "tiff", "jfif"]) {
      expect(TIKTOK_VERIFY_IMAGE_EXTENSIONS).toContain(ext);
    }
  });

  it('covers what a real accept="video/*" picker can hand back for identity_video_file, beyond mp4/mov', () => {
    for (const ext of ["webm", "m4v", "avi", "3gp"]) {
      expect(TIKTOK_VERIFY_VIDEO_EXTENSIONS).toContain(ext);
    }
  });

  it('keeps pdf for signed_auth_file (whose accept is the literal ".pdf,.jpg,.jpeg,.png", not image/*)', () => {
    expect(TIKTOK_VERIFY_DOCUMENT_EXTENSIONS).toEqual(["pdf"]);
    expect(TIKTOK_VERIFY_ALLOWED_EXTENSIONS).toContain("pdf");
  });
});

describe("isAllowedTikTokVerifyExtension", () => {
  it("accepts every extension in the shared allowlist", () => {
    for (const ext of TIKTOK_VERIFY_ALLOWED_EXTENSIONS) {
      expect(isAllowedTikTokVerifyExtension(ext)).toBe(true);
    }
  });

  it("rejects an extension outside the allowlist", () => {
    expect(isAllowedTikTokVerifyExtension("html")).toBe(false);
    expect(isAllowedTikTokVerifyExtension("exe")).toBe(false);
  });

  it("rejects extensions containing extra path segments", () => {
    expect(isAllowedTikTokVerifyExtension("png/a/b")).toBe(false);
  });

  it("is case-sensitive (callers are expected to lowercase first, matching getFileExtension)", () => {
    expect(isAllowedTikTokVerifyExtension("PNG")).toBe(false);
  });
});

describe("describeUnsupportedTikTokVerifyExtension", () => {
  it("names the file and its extension, and lists what's accepted", () => {
    const message = describeUnsupportedTikTokVerifyExtension("id-scan.html", "html");
    expect(message).toBe(
      `"id-scan.html" has an unsupported file type (.html). Accepted types: ${TIKTOK_VERIFY_ALLOWED_EXTENSIONS_LABEL}.`
    );
    expect(message).toContain("webp");
    expect(message).toContain("heic");
  });
});

describe("resolveTikTokVerifyFileSelection", () => {
  it("accepts a file whose extension is in the allowlist, returning the same File with no error", () => {
    const file = new File(["content"], "id-front.png", { type: "image/png" });
    expect(resolveTikTokVerifyFileSelection(file, "png")).toEqual({ file, error: "" });
  });

  it("accepts every extension in the shared allowlist", () => {
    for (const ext of TIKTOK_VERIFY_ALLOWED_EXTENSIONS) {
      const file = new File(["content"], `sample.${ext}`, { type: "application/octet-stream" });
      expect(resolveTikTokVerifyFileSelection(file, ext).file).toBe(file);
    }
  });

  it("rejects a file whose extension is outside the allowlist, resolving to a null file and the shared unsupported-type message", () => {
    // Regression guard for the Task 2.3 final-polish stale-state bug: page.tsx's
    // handleFileChange writes this `file: null` straight into formData[name] on
    // every rejection — including when the field already held a previously-accepted
    // file — so the input and form state can never disagree about whether a file is
    // selected.
    const file = new File(["content"], "id-front.exe", { type: "application/octet-stream" });
    expect(resolveTikTokVerifyFileSelection(file, "exe")).toEqual({
      file: null,
      error: describeUnsupportedTikTokVerifyExtension("id-front.exe", "exe"),
    });
  });
});
