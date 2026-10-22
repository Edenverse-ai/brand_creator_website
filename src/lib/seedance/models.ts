import type { Resolution } from "./schema";

/**
 * Models a creator can pick on the generate page (Video Gen), default first, with
 * what each one can produce. `mode` is the provider's tier id and the limits follow
 * its matrix (API doc v1.1, "分档参数矩阵"), minus 4k. Every model is free to use;
 * the daily cap (AI_VIDEO_DAILY_LIMIT) is the only limit.
 */
export const VIDEO_MODELS = [
  {
    mode: "seedance2.5",
    label: "Seedance 2.5",
    resolutions: ["720p", "480p"],
    maxDuration: 30,
  },
  {
    mode: "pro",
    label: "Seedance 2.0 Pro",
    resolutions: ["1080p", "720p", "480p"],
    maxDuration: 15,
  },
  {
    mode: "fast",
    label: "Seedance 2.0 Fast",
    resolutions: ["1080p", "720p", "480p"],
    maxDuration: 15,
  },
  {
    mode: "mini",
    label: "Seedance 2.0 Mini",
    resolutions: ["1080p", "720p", "480p"],
    maxDuration: 15,
  },
] as const satisfies readonly {
  mode: string;
  label: string;
  resolutions: readonly Resolution[];
  maxDuration: number;
}[];

export type VideoModel = (typeof VIDEO_MODELS)[number];
export type VideoMode = VideoModel["mode"];

export const VIDEO_MODES = VIDEO_MODELS.map((model) => model.mode) as [VideoMode, ...VideoMode[]];
export const DEFAULT_MODE: VideoMode = "seedance2.5";

/** What a model can produce. */
export type ModelLimits = { resolutions: readonly Resolution[]; maxDuration: number };

export function limitsFor(mode: VideoMode): ModelLimits {
  return VIDEO_MODELS.find((model) => model.mode === mode) ?? VIDEO_MODELS[0];
}

/**
 * Models offered for Trend Replicate, a request with a reference video ("r2v").
 * Mini is left out: the provider rejects it at 1080p in r2v ("resolution … is not
 * valid for model doubao-seedance-2-0-mini in r2v"), although the API doc lists
 * 1080p for it. 2.5 replicates sources up to 30 s (its documented output limit);
 * the edit's output follows the source.
 */
export const REPLICATE_MODELS = VIDEO_MODELS.filter(
  (model): model is Extract<VideoModel, { mode: "seedance2.5" | "pro" }> =>
    model.mode === "seedance2.5" || model.mode === "pro"
);

export type ReplicateMode = (typeof REPLICATE_MODELS)[number]["mode"];

export const REPLICATE_MODES = ["seedance2.5", "pro"] as const satisfies readonly ReplicateMode[];
export const DEFAULT_REPLICATE_MODE: ReplicateMode = "seedance2.5";

export function replicateLimitsFor(mode: ReplicateMode): ModelLimits {
  return REPLICATE_MODELS.find((model) => model.mode === mode) ?? REPLICATE_MODELS[0];
}
