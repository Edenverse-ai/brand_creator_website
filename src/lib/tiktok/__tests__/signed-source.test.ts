import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isOwnSupabaseStorageUrl, storageObjectPath, toMediaProxyUrl } from "../signed-source";

/**
 * Root cause of the PULL_FROM_URL failure (2026-08-06): the publish route only
 * rewrote a source onto the TikTok-verified /media prefix when it came from the
 * `video_path` branch. The live client
 * (creatorportal/ai-video/post/AiVideoPostPage.tsx) sends `videoUrl` -- a signed
 * URL on the Supabase host, which is NOT a verified TikTok property -- so the
 * pull path handed TikTok a supabase.co URL and got a 400
 * `url_ownership_unverified` (reproduced live against the inbox endpoint).
 * These helpers let the route recognise our own storage host whichever field
 * carried it.
 */
const SUPABASE = "https://loesykbqlhynbjmqxfxc.supabase.co";
const OBJECT_PATH = "creator/abc-123/video.mp4";
const SIGNED = `${SUPABASE}/storage/v1/object/sign/aivideogenerated/${OBJECT_PATH}?token=tok`;

let previous: string | undefined;

beforeEach(() => {
  previous = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = SUPABASE;
});

afterEach(() => {
  if (previous === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = previous;
});

describe("isOwnSupabaseStorageUrl", () => {
  it("recognises a signed URL on the configured Supabase project's storage API", () => {
    expect(isOwnSupabaseStorageUrl(SIGNED)).toBe(true);
  });

  it("tolerates a trailing slash on SUPABASE_URL", () => {
    process.env.SUPABASE_URL = `${SUPABASE}/`;
    expect(isOwnSupabaseStorageUrl(SIGNED)).toBe(true);
  });

  it("rejects a third-party host, so a caller-supplied video_url is passed through untouched", () => {
    expect(isOwnSupabaseStorageUrl("https://cdn.example/video.mp4")).toBe(false);
  });

  it("rejects a look-alike host that merely starts with the project ref", () => {
    expect(
      isOwnSupabaseStorageUrl(
        `${SUPABASE}.evil.example/storage/v1/object/sign/aivideogenerated/x.mp4`
      )
    ).toBe(false);
  });

  it("returns false rather than throwing when SUPABASE_URL is unset", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(isOwnSupabaseStorageUrl(SIGNED)).toBe(false);
  });
});

describe("storageObjectPath", () => {
  it("extracts the bucket-relative object path, dropping the signing token", () => {
    expect(storageObjectPath(SIGNED)).toBe(OBJECT_PATH);
  });

  it("returns null for a URL that is not a signed object in the AI video bucket", () => {
    expect(storageObjectPath(`${SUPABASE}/storage/v1/object/sign/other-bucket/x.mp4`)).toBeNull();
    expect(storageObjectPath("https://cdn.example/video.mp4")).toBeNull();
  });
});

describe("toMediaProxyUrl", () => {
  it("rewrites onto the TikTok-verified prefix, preserving path and token", () => {
    expect(toMediaProxyUrl(SIGNED)).toBe(
      `https://cricher.ai/media/object/sign/aivideogenerated/${OBJECT_PATH}?token=tok`
    );
  });
});
