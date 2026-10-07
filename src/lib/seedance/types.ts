import type { GenerationParams } from "./schema";

export interface CreateVideoTaskInput {
  prompt: string;
  params: GenerationParams;
  /** Publicly readable HTTPS URL (signed Supabase URL). Omitted for text-to-video. */
  referenceImageUrl?: string | null;
}

export interface CreateVideoTaskResult {
  taskId: string;
  traceId: string | null;
}

export type VideoTaskStatus =
  | { state: "in_progress"; traceId: string | null }
  | {
      state: "succeeded";
      videoUrl: string;
      durationSec: number | null;
      completionTokens: number | null;
      traceId: string | null;
    }
  | { state: "failed"; error: string; traceId: string | null };

export interface DownloadedVideo {
  bytes: ArrayBuffer;
  contentType: string;
}

export interface VideoProvider {
  readonly name: "ai-open-platform" | "mock";
  /** Billable. Called at most once per task (see submitTask's claim). */
  createTask(input: CreateVideoTaskInput): Promise<CreateVideoTaskResult>;
  /** Free. Safe to poll (no more often than every 5 s per task). */
  getTaskStatus(taskId: string): Promise<VideoTaskStatus>;
  downloadVideo(videoUrl: string): Promise<DownloadedVideo>;
}
