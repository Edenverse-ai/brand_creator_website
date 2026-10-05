/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildFinalizeAuthHeaders, isValidFinalizeAuth } from "../ai-video-finalize-auth";

beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("finalize dispatch auth", () => {
  it("accepts a fresh signature for the same task", () => {
    const headers = buildFinalizeAuthHeaders("task-1");
    expect(
      isValidFinalizeAuth(
        "task-1",
        headers["x-finalize-timestamp"],
        headers["x-finalize-signature"]
      )
    ).toBe(true);
  });

  it("rejects a signature minted for a different task", () => {
    const headers = buildFinalizeAuthHeaders("task-1");
    expect(
      isValidFinalizeAuth(
        "task-2",
        headers["x-finalize-timestamp"],
        headers["x-finalize-signature"]
      )
    ).toBe(false);
  });

  it("rejects an expired signature", () => {
    const headers = buildFinalizeAuthHeaders("task-1");
    vi.advanceTimersByTime(6 * 60 * 1000);
    expect(
      isValidFinalizeAuth(
        "task-1",
        headers["x-finalize-timestamp"],
        headers["x-finalize-signature"]
      )
    ).toBe(false);
  });

  it("rejects missing headers", () => {
    expect(isValidFinalizeAuth("task-1", null, null)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const headers = buildFinalizeAuthHeaders("task-1");
    vi.stubEnv("NEXTAUTH_SECRET", "other-secret");
    expect(
      isValidFinalizeAuth(
        "task-1",
        headers["x-finalize-timestamp"],
        headers["x-finalize-signature"]
      )
    ).toBe(false);
  });
});
