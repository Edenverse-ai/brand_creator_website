import { describe, it, expect } from "vitest";
import { TIKTOK_MESSAGES, publicMessageFor } from "../errors";
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
