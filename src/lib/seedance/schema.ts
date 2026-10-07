import { z } from "zod";
import { SEEDANCE_MODES } from "./config";

/**
 * Generation settings the creator can choose. Shared by the generate form
 * (client) and POST /api/ai-videos/tasks (server).
 *
 * Deliberately narrower than the provider accepts (API doc v1.1): 480p/720p
 * and 4–15 s are valid for every mode, so no combination of model and format is
 * ever invalid. 1080p is H.265 10-bit on seedance2.5 and isn't offered
 * (playback/TikTok compatibility unverified).
 */
export const RATIOS = ["9:16", "16:9", "1:1", "3:4", "4:3"] as const;
export const RESOLUTIONS = ["720p", "480p"] as const;
export const DURATION_MIN = 4;
export const DURATION_MAX = 15;

export type Ratio = (typeof RATIOS)[number];
export type Resolution = (typeof RESOLUTIONS)[number];

export const generationParamsSchema = z.object({
  mode: z.enum(SEEDANCE_MODES).default("mini"),
  ratio: z.enum(RATIOS).default("9:16"),
  duration: z.number().int().min(DURATION_MIN).max(DURATION_MAX).default(5),
  resolution: z.enum(RESOLUTIONS).default("720p"),
  generateAudio: z.boolean().default(true),
});

export type GenerationParams = z.infer<typeof generationParamsSchema>;
