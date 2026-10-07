/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MOCK_DELAY_MS, mockProvider } from "../mock";

const params = {
  mode: "mini" as const,
  ratio: "9:16" as const,
  duration: 5 as const,
  resolution: "480p" as const,
  generateAudio: false,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("mock provider must not touch the network");
    })
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("mockProvider", () => {
  it("is in progress until the delay has passed, then succeeds", async () => {
    const { taskId } = await mockProvider.createTask({ prompt: "cat", params });
    expect(taskId).toMatch(/^mock-/);

    expect((await mockProvider.getTaskStatus(taskId)).state).toBe("in_progress");

    vi.advanceTimersByTime(MOCK_DELAY_MS + 1);
    const done = await mockProvider.getTaskStatus(taskId);
    expect(done).toMatchObject({ state: "succeeded", completionTokens: 0 });
  });

  it("fails after the delay when the prompt contains [mock-fail]", async () => {
    const { taskId } = await mockProvider.createTask({
      prompt: "cat [mock-fail]",
      params,
    });
    vi.advanceTimersByTime(MOCK_DELAY_MS + 1);
    await expect(mockProvider.getTaskStatus(taskId)).resolves.toMatchObject({ state: "failed" });
  });

  it("keeps no state between calls (works across serverless instances)", async () => {
    const { taskId } = await mockProvider.createTask({ prompt: "cat", params });
    vi.advanceTimersByTime(MOCK_DELAY_MS + 1);
    // A different module instance would only see the id — the id alone must be enough.
    const { mockProvider: fresh } = await import("../mock");
    await expect(fresh.getTaskStatus(taskId)).resolves.toMatchObject({ state: "succeeded" });
  });

  it("downloads the embedded sample video without network access", async () => {
    const { taskId } = await mockProvider.createTask({ prompt: "cat", params });
    vi.advanceTimersByTime(MOCK_DELAY_MS + 1);
    const status = await mockProvider.getTaskStatus(taskId);
    if (status.state !== "succeeded") throw new Error("expected success");
    const video = await mockProvider.downloadVideo(status.videoUrl);
    expect(video.contentType).toBe("video/mp4");
    expect(video.bytes.byteLength).toBeGreaterThan(1000);
  });
});
