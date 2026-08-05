import { describe, it, expect } from "vitest";
import { extractErrorMessage } from "../error-message";

/**
 * Covers both response shapes the `error` field can take across the
 * FastAPI -> Next.js flip (see error-message.ts's header comment):
 * the new routes' plain string, and the old backend's `{ message }` dict.
 */
describe("extractErrorMessage", () => {
  it("returns the string directly for the new routes' plain-string error shape", () => {
    expect(extractErrorMessage("TikTok init failed", "fallback")).toBe("TikTok init failed");
  });

  it("returns .message for the old backend's object-shaped error", () => {
    expect(extractErrorMessage({ message: "raw detail" }, "fallback")).toBe("raw detail");
  });

  it("returns the fallback when error is undefined", () => {
    expect(extractErrorMessage(undefined, "Upload failed")).toBe("Upload failed");
  });

  it("returns the fallback when error is null", () => {
    expect(extractErrorMessage(null, "Status check failed")).toBe("Status check failed");
  });

  it("returns the fallback for an empty string error", () => {
    expect(extractErrorMessage("", "Upload failed")).toBe("Upload failed");
  });

  it("returns the fallback for an object with no message property", () => {
    expect(extractErrorMessage({ payload: { code: 500 } }, "Upload failed")).toBe("Upload failed");
  });

  it("returns the fallback for an object whose message is an empty string", () => {
    expect(extractErrorMessage({ message: "" }, "Upload failed")).toBe("Upload failed");
  });

  it("returns the fallback for an object whose message is not a string", () => {
    expect(extractErrorMessage({ message: 42 }, "Upload failed")).toBe("Upload failed");
  });

  it("preserves the caller's exact fallback string for the upload path", () => {
    expect(extractErrorMessage(undefined, "Upload failed")).toBe("Upload failed");
  });

  it("preserves the caller's exact fallback string for the status-check path", () => {
    expect(extractErrorMessage(undefined, "Status check failed")).toBe("Status check failed");
  });
});
