import type { Resolution } from "./schema";

/**
 * Models a creator can pick on the generate page, default first, with what each
 * one can produce. `mode` is the provider's tier id and the limits follow its
 * matrix (API doc v1.1, "分档参数矩阵"), minus 4k: the longest clips need
 * seedance2.5, the sharpest need mini. Every model is free to use; the daily
 * cap (AI_VIDEO_DAILY_LIMIT) is the only limit.
 */
export const VIDEO_MODELS = [
  {
    mode: "seedance2.5",
    label: "Seedance 2.5",
    resolutions: ["720p", "480p"],
    maxDuration: 30,
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
