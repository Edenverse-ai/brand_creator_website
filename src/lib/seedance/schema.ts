import { z } from "zod";

/**
 * Generation settings the creator can choose. Shared by the generate form
 * (client) and POST /api/ai-videos/tasks (server).
 *
 * Deliberately narrower than the provider accepts: 480p/720p and 5–15 s are
 * valid for every mode (fast/pro/mini/seedance2.5), so switching
 * SEEDANCE_MODE never makes a saved setting invalid. 1080p is H.265 10-bit on
 * seedance2.5 and isn't offered (playback/TikTok compatibility unverified).
 */
export const RATIOS = ["9:16", "16:9", "1:1", "3:4", "4:3"] as const;
export const DURATIONS = [5, 10, 15] as const;
export const RESOLUTIONS = ["720p", "480p"] as const;

export type Ratio = (typeof RATIOS)[number];
export type Duration = (typeof DURATIONS)[number];
export type Resolution = (typeof RESOLUTIONS)[number];

export const generationParamsSchema = z.object({
  ratio: z.enum(RATIOS).default("9:16"),
  duration: z.union([z.literal(5), z.literal(10), z.literal(15)]).default(5),
  resolution: z.enum(RESOLUTIONS).default("720p"),
  generateAudio: z.boolean().default(true),
});

export type GenerationParams = z.infer<typeof generationParamsSchema>;
