import { MOCK_VIDEO_BASE64 } from "./mock-video";
import type { DownloadedVideo, VideoProvider, VideoTaskStatus } from "./types";

/**
 * Default provider: never touches the network and spends no tokens.
 *
 * Stateless by design — the task id encodes its creation time and outcome, so
 * any serverless instance (route, background or scheduled function) can answer
 * a status query for an id minted by another. Everything downstream of the
 * provider (polling, finalize, AiVideo insert) runs exactly as in live mode.
 */

export const MOCK_DELAY_MS = 10_000;
export const MOCK_FAIL_MARKER = "[mock-fail]";
const MOCK_VIDEO_URL = "mock://output-sample.mp4";

function parseMockId(taskId: string): { createdAt: number; fails: boolean } | null {
  const match = /^mock-(\d+)-(ok|fail)-[a-z0-9]+$/.exec(taskId);
  return match ? { createdAt: Number(match[1]), fails: match[2] === "fail" } : null;
}

export const mockProvider: VideoProvider = {
  name: "mock",

  async createTask(input) {
    const outcome = input.prompt.includes(MOCK_FAIL_MARKER) ? "fail" : "ok";
    const suffix = Math.random().toString(36).slice(2, 10) || "0";
    return { taskId: `mock-${Date.now()}-${outcome}-${suffix}`, traceId: "mock-trace" };
  },

  async getTaskStatus(taskId): Promise<VideoTaskStatus> {
    const parsed = parseMockId(taskId);
    if (!parsed) {
      return { state: "failed", error: "unknown mock task", traceId: "mock-trace" };
    }
    if (Date.now() - parsed.createdAt < MOCK_DELAY_MS) {
      return { state: "in_progress", traceId: "mock-trace" };
    }
    if (parsed.fails) {
      return { state: "failed", error: "mock failure requested", traceId: "mock-trace" };
    }
    return {
      state: "succeeded",
      videoUrl: MOCK_VIDEO_URL,
      durationSec: 1,
      completionTokens: 0,
      traceId: "mock-trace",
    };
  },

  async downloadVideo(): Promise<DownloadedVideo> {
    const buffer = Buffer.from(MOCK_VIDEO_BASE64, "base64");
    return {
      bytes: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      contentType: "video/mp4",
    };
  },
};
