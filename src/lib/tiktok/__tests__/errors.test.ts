import { describe, it, expect } from "vitest";
import { TIKTOK_MESSAGES, TikTokInitError, logDetailsFor, publicMessageFor } from "../errors";
import { UnsafeRelayTargetError } from "../relay-url-guard";

/**
 * POST-REVIEW FIX (FIX 2): UnsafeRelayTargetError carries
 * `kind: "source" | "upload"` (relay-url-guard.ts), but publicMessageFor used
 * to collapse both onto the source-flavoured message unconditionally --
 * harmless while only assertSourceTargetUrl was reachable from a route, but
 * wrong the moment assertUploadTargetUrl is ever called route-side too.
 */
describe("publicMessageFor / UnsafeRelayTargetError", () => {
  it("maps a source-kind error to the source-hosting message", () => {
    const error = new UnsafeRelayTargetError("https://victim-cdn.example/x", "source");
    expect(publicMessageFor(error)).toBe(TIKTOK_MESSAGES.sourceNotRelayable);
  });

  it("maps an upload-kind error to the distinct upload-target message, not the source one", () => {
    const error = new UnsafeRelayTargetError("https://attacker.example/sink", "upload");
    expect(publicMessageFor(error)).toBe(TIKTOK_MESSAGES.uploadTargetInvalid);
    expect(publicMessageFor(error)).not.toBe(TIKTOK_MESSAGES.sourceNotRelayable);
  });

  it("the source-hosting message states the real rule (host, not which request field) and never tells the caller to switch to video_path", () => {
    expect(TIKTOK_MESSAGES.sourceNotRelayable).not.toContain("video_path");
    expect(TIKTOK_MESSAGES.sourceNotRelayable.toLowerCase()).toContain("own storage");
  });
});

/**
 * PULL_FROM_URL failed five diagnosis attempts because TikTok's own error code
 * was never logged -- only { name, status }. logDetailsFor now surfaces
 * code/log_id/message, with URLs stripped from message because a signed
 * video_url's `?token=` is a bearer capability.
 */
describe("logDetailsFor / TikTokInitError payload", () => {
  it("surfaces TikTok's error code and log_id", () => {
    const error = new TikTokInitError(400, {
      error: {
        code: "url_ownership_unverified",
        message: "unverified url",
        log_id: "20260805-abc",
      },
    });

    expect(logDetailsFor(error)).toMatchObject({
      name: "TikTokInitError",
      status: 400,
      tiktokCode: "url_ownership_unverified",
      tiktokLogId: "20260805-abc",
    });
  });

  it("strips any URL out of TikTok's message so signed-URL tokens never reach the logs", () => {
    const error = new TikTokInitError(400, {
      error: {
        code: "invalid_param",
        message: "video_url https://cricher.ai/media/x.mp4?token=SECRET is invalid",
      },
    });

    const details = logDetailsFor(error);
    expect(details.tiktokMessage).toBe("video_url [url] is invalid");
    expect(JSON.stringify(details)).not.toContain("SECRET");
  });

  it("tolerates a non-conforming payload without throwing", () => {
    expect(logDetailsFor(new TikTokInitError(500, "<html>gateway</html>"))).toEqual({
      name: "TikTokInitError",
      status: 500,
    });
  });
});
