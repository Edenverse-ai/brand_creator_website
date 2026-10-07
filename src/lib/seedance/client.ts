import { fetchWithTimeout } from "@/lib/tiktok/fetch-with-timeout";
import {
  CREATE_PATH,
  EXECUTION_EXPIRES_AFTER_SECONDS,
  STATUS_PATH,
  type LiveConfig,
} from "./config";
import {
  ProviderBalanceError,
  ProviderRequestError,
  ProviderSystemError,
  ProviderUnknownOutcomeError,
} from "./errors";
import type {
  CreateVideoTaskInput,
  CreateVideoTaskResult,
  DownloadedVideo,
  VideoProvider,
  VideoTaskStatus,
} from "./types";

/**
 * Live client for the AI Open Platform video API (v1.1). Not imported directly
 * by app code — use getVideoProvider() from ./index, which enforces the
 * token-spend guard. Kept free of "server-only" so scripts/seedance-dry-run.ts
 * can build requests with it.
 */

const CREATE_TIMEOUT_MS = 20_000;
const STATUS_TIMEOUT_MS = 10_000;
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;

interface Envelope {
  code?: unknown;
  message?: unknown;
  data?: Record<string, unknown> | null;
  trace_id?: unknown;
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

export function buildCreateBody(input: CreateVideoTaskInput): Record<string, unknown> {
  return {
    prompt: input.prompt,
    // Always explicit: without it the gateway validates against `fast` limits.
    mode: input.params.mode,
    resolution: input.params.resolution,
    ratio: input.params.ratio,
    duration: input.params.duration,
    generate_audio: input.params.generateAudio,
    watermark: false,
    output_format: "mp4",
    execution_expires_after: EXECUTION_EXPIRES_AFTER_SECONDS,
    ...(input.referenceImageUrl
      ? { images: [{ url: input.referenceImageUrl, role: "reference_image" }] }
      : {}),
  };
}

export function buildCreateRequest(
  input: CreateVideoTaskInput,
  config: LiveConfig
): { url: string; init: RequestInit } {
  return {
    url: joinUrl(config.baseUrl, CREATE_PATH),
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", ApiKey: config.apiKey },
      body: JSON.stringify(buildCreateBody(input)),
    },
  };
}

async function readEnvelope(res: Response): Promise<Envelope | null> {
  try {
    const json: unknown = await res.json();
    return json && typeof json === "object" ? (json as Envelope) : null;
  } catch {
    return null;
  }
}

function traceIdOf(envelope: Envelope | null): string | null {
  return typeof envelope?.trace_id === "string" ? envelope.trace_id : null;
}

function messageOf(envelope: Envelope | null): string {
  return typeof envelope?.message === "string" ? envelope.message : "";
}

export class AiOpenPlatformProvider implements VideoProvider {
  readonly name = "ai-open-platform" as const;

  constructor(private readonly config: LiveConfig) {}

  async createTask(input: CreateVideoTaskInput): Promise<CreateVideoTaskResult> {
    const { url, init } = buildCreateRequest(input, this.config);

    let res: Response;
    try {
      res = await fetchWithTimeout(url, init, CREATE_TIMEOUT_MS);
    } catch (error) {
      // The request may have reached the provider before the connection dropped.
      throw new ProviderUnknownOutcomeError(error);
    }

    const envelope = await readEnvelope(res);
    const traceId = traceIdOf(envelope);

    if (res.status === 429 && messageOf(envelope).includes("40001")) {
      throw new ProviderBalanceError(traceId);
    }
    if (res.status >= 500) {
      // A gateway error after forwarding can still leave a billable task behind.
      throw new ProviderUnknownOutcomeError(new Error(`HTTP ${res.status}`));
    }
    if (res.status !== 200) {
      throw new ProviderSystemError(res.status, traceId);
    }
    if (!envelope || typeof envelope.code !== "number") {
      throw new ProviderUnknownOutcomeError(new Error("unparseable success response"));
    }
    if (envelope.code !== 0) {
      throw new ProviderRequestError(envelope.code, messageOf(envelope), traceId);
    }

    const taskId = envelope.data?.task_id;
    if (typeof taskId !== "string" || !taskId) {
      throw new ProviderUnknownOutcomeError(new Error("success response without task_id"));
    }
    return { taskId, traceId };
  }

  async getTaskStatus(taskId: string): Promise<VideoTaskStatus> {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        joinUrl(this.config.baseUrl, STATUS_PATH),
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ApiKey: this.config.apiKey },
          body: JSON.stringify({ task_id: taskId }),
        },
        STATUS_TIMEOUT_MS
      );
    } catch {
      throw new ProviderSystemError(0, null);
    }

    const envelope = await readEnvelope(res);
    const traceId = traceIdOf(envelope);
    if (res.status !== 200 || !envelope || envelope.code !== 0 || !envelope.data) {
      throw new ProviderSystemError(res.status, traceId);
    }

    const data = envelope.data;
    if (data.status === "failed") {
      return {
        state: "failed",
        error: typeof data.error === "string" ? data.error : "",
        traceId,
      };
    }
    if (data.status === "succeeded" && typeof data.video_url === "string" && data.video_url) {
      const usage = data.usage as { completion_tokens?: unknown } | undefined;
      return {
        state: "succeeded",
        videoUrl: data.video_url,
        durationSec: typeof data.duration === "number" ? data.duration : null,
        completionTokens:
          typeof usage?.completion_tokens === "number" ? usage.completion_tokens : null,
        traceId,
      };
    }
    // pending / submitted / running — and anything unrecognised, which the next
    // poll (or the 75-minute timeout) resolves.
    return { state: "in_progress", traceId };
  }

  async downloadVideo(videoUrl: string): Promise<DownloadedVideo> {
    let res: Response;
    try {
      res = await fetchWithTimeout(videoUrl, { method: "GET" }, DOWNLOAD_TIMEOUT_MS);
    } catch {
      throw new ProviderSystemError(0, null);
    }
    if (!res.ok) throw new ProviderSystemError(res.status, null);
    return {
      bytes: await res.arrayBuffer(),
      contentType: res.headers.get("content-type")?.split(";")[0] || "video/mp4",
    };
  }
}
