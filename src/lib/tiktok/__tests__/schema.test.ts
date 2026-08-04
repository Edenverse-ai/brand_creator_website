import { describe, it, expect } from "vitest";
import { PublishRequestSchema, PublishStatusRequestSchema, VideoInputSchema } from "../schema";

/**
 * POST-REVIEW FIX (IMPORTANT 3): the first version of this schema only
 * declared snake_case field names. zod's default z.object() behavior SILENTLY
 * STRIPS unrecognized keys rather than rejecting them, so a camelCase body
 * (which is what the live client actually sends) parsed "successfully" with
 * every meaningful field dropped -- producing a bogus "Missing
 * privacy_level" per-video error instead of surfacing the real problem.
 * These tests lock in that both spellings genuinely work, and that a mix of
 * the two resolves sensibly rather than silently.
 */
describe("VideoInputSchema", () => {
  it("accepts snake_case field names", () => {
    const result = VideoInputSchema.parse({
      id: "v1",
      video_path: "user/task/out.mp4",
      privacy_level: "SELF_ONLY",
      disable_comment: true,
      disable_duet: false,
      disable_stitch: true,
      brand_content_toggle: true,
      brand_organic_toggle: false,
    });
    expect(result).toEqual({
      id: "v1",
      video_url: undefined,
      video_path: "user/task/out.mp4",
      title: undefined,
      privacy_level: "SELF_ONLY",
      disable_comment: true,
      disable_duet: false,
      disable_stitch: true,
      brand_content_toggle: true,
      brand_organic_toggle: false,
    });
  });

  it("accepts camelCase field names (the live client's actual wire format) and coalesces them onto the same canonical shape", () => {
    const result = VideoInputSchema.parse({
      id: "v1",
      videoPath: "user/task/out.mp4",
      privacyLevel: "SELF_ONLY",
      disableComment: true,
      disableDuet: false,
      disableStitch: true,
      brandContent: true,
      brandOrganic: false,
    });
    expect(result).toEqual({
      id: "v1",
      video_url: undefined,
      video_path: "user/task/out.mp4",
      title: undefined,
      privacy_level: "SELF_ONLY",
      disable_comment: true,
      disable_duet: false,
      disable_stitch: true,
      brand_content_toggle: true,
      brand_organic_toggle: false,
    });
  });

  it("does NOT silently drop a camelCase privacyLevel down to undefined (the exact regression this fixes)", () => {
    const result = VideoInputSchema.parse({
      videoUrl: "https://cdn.example.com/x.mp4",
      privacyLevel: "SELF_ONLY",
    });
    expect(result.privacy_level).toBe("SELF_ONLY");
    expect(result.video_url).toBe("https://cdn.example.com/x.mp4");
  });

  it("prefers the snake_case value when both spellings are present", () => {
    const result = VideoInputSchema.parse({
      privacy_level: "SELF_ONLY",
      privacyLevel: "PUBLIC_TO_EVERYONE",
    });
    expect(result.privacy_level).toBe("SELF_ONLY");
  });

  it("leaves privacy_level undefined (not a parse failure) when neither spelling is present", () => {
    const result = VideoInputSchema.parse({ video_path: "user/task/out.mp4" });
    expect(result.privacy_level).toBeUndefined();
  });

  it.each(["video_url", "videoUrl"])(
    "rejects a non-https %s (ftp/file/javascript schemes)",
    (field) => {
      expect(VideoInputSchema.safeParse({ [field]: "ftp://cdn.example.com/x.mp4" }).success).toBe(
        false
      );
      expect(VideoInputSchema.safeParse({ [field]: "file:///etc/passwd" }).success).toBe(false);
      expect(VideoInputSchema.safeParse({ [field]: "javascript:alert(1)" }).success).toBe(false);
      expect(VideoInputSchema.safeParse({ [field]: "http://cdn.example.com/x.mp4" }).success).toBe(
        false
      );
    }
  );

  it.each(["video_url", "videoUrl"])("accepts a plain https %s", (field) => {
    expect(VideoInputSchema.safeParse({ [field]: "https://cdn.example.com/x.mp4" }).success).toBe(
      true
    );
  });
});

describe("PublishRequestSchema", () => {
  it("accepts a request whose video uses camelCase fields end to end", () => {
    const result = PublishRequestSchema.parse({
      access_token: "t",
      videos: [{ id: "v1", videoUrl: "https://cdn.example.com/x.mp4", privacyLevel: "SELF_ONLY" }],
    });
    expect(result.videos[0].privacy_level).toBe("SELF_ONLY");
    expect(result.videos[0].video_url).toBe("https://cdn.example.com/x.mp4");
  });

  it("rejects an empty videos array", () => {
    expect(PublishRequestSchema.safeParse({ access_token: "t", videos: [] }).success).toBe(false);
  });

  it("rejects a missing access_token", () => {
    expect(
      PublishRequestSchema.safeParse({ videos: [{ id: "v1", privacy_level: "SELF_ONLY" }] }).success
    ).toBe(false);
  });
});

describe("PublishStatusRequestSchema", () => {
  it("defaults publish_ids to an empty array when omitted", () => {
    const result = PublishStatusRequestSchema.parse({ access_token: "t" });
    expect(result.publish_ids).toEqual([]);
  });

  it("rejects a missing access_token", () => {
    expect(PublishStatusRequestSchema.safeParse({ publish_ids: ["p1"] }).success).toBe(false);
  });
});
