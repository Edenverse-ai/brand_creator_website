import { SEEDANCE_MODES, type SeedanceMode } from "./config";

/**
 * Models a creator can pick on the generate page, cheapest first. `mode` is the
 * provider's tier id (API doc v1.1, "分档参数矩阵"); the label is ours.
 */
export const VIDEO_MODELS: readonly { mode: SeedanceMode; label: string }[] = [
  { mode: "mini", label: "Seedance 2.0 Mini" },
  { mode: "fast", label: "Seedance 2.0 Fast" },
  { mode: "pro", label: "Seedance 2.0 Pro" },
  { mode: "seedance2.5", label: "Seedance 2.5" },
];

/** The cheapest model: always available, and the default. */
export const FREE_MODE: SeedanceMode = "mini";

export function modelLabel(mode: SeedanceMode): string {
  return VIDEO_MODELS.find((model) => model.mode === mode)?.label ?? mode;
}

/**
 * Modes creators may generate with. Everything else is shown as PRO and
 * rejected by POST /api/ai-videos/tasks. There is no upgrade purchase yet, so
 * this is site-wide: AI_VIDEO_UNLOCKED_MODELS (comma-separated mode ids) widens
 * it, e.g. to test another model on a deploy preview. Server-only.
 */
export function getUnlockedModes(): SeedanceMode[] {
  const requested = (process.env.AI_VIDEO_UNLOCKED_MODELS ?? "")
    .split(",")
    .map((value) => value.trim());
  return SEEDANCE_MODES.filter((mode) => mode === FREE_MODE || requested.includes(mode));
}
