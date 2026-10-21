import type { GenerationParams, Ratio } from "./schema";

/**
 * Settings sent to the provider. Wider than what the generate form offers:
 * trend replicates use `adaptive`, so the output keeps the source video's shape.
 */
export type ProviderParams = Omit<GenerationParams, "ratio"> & { ratio: Ratio | "adaptive" };

export interface CreateVideoTaskInput {
  prompt: string;
  params: ProviderParams;
  /**
   * Publicly readable HTTPS URLs (signed Supabase URLs), in the order the prompt
   * numbers them ("Image 1", "Video 1"). Omitted for text-to-video.
   */
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
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
