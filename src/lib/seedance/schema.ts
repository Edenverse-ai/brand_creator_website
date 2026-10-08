import { z } from "zod";
import { DEFAULT_MODE, VIDEO_MODES, limitsFor } from "./models";

/**
 * Generation settings the creator can choose. Shared by the generate form
 * (client) and POST /api/ai-videos/tasks (server).
 *
 * What is valid depends on the model (see VIDEO_MODELS): the schema rejects a
 * resolution or duration the chosen model can't produce, so the app never sends
 * a create request the provider is bound to refuse.
 */
export const RATIOS = ["9:16", "16:9", "1:1", "3:4", "4:3"] as const;
export const RESOLUTIONS = ["1080p", "720p", "480p"] as const;
export const DURATION_MIN = 4;
/** The longest any model allows; each model's own ceiling is in VIDEO_MODELS. */
export const DURATION_MAX = 30;

export type Ratio = (typeof RATIOS)[number];
export type Resolution = (typeof RESOLUTIONS)[number];

export const generationParamsSchema = z
  .object({
    mode: z.enum(VIDEO_MODES).default(DEFAULT_MODE),
    ratio: z.enum(RATIOS).default("9:16"),
    duration: z.number().int().min(DURATION_MIN).max(DURATION_MAX).default(5),
    resolution: z.enum(RESOLUTIONS).default("720p"),
    generateAudio: z.boolean().default(true),
  })
  .superRefine((params, ctx) => {
    const limits = limitsFor(params.mode);
    if (!limits.resolutions.includes(params.resolution)) {
      ctx.addIssue({
        code: "custom",
        path: ["resolution"],
        message: `${params.resolution} is not available for this model`,
      });
    }
    if (params.duration > limits.maxDuration) {
      ctx.addIssue({
        code: "custom",
        path: ["duration"],
        message: `This model generates up to ${limits.maxDuration} seconds`,
      });
    }
  });

export type GenerationParams = z.infer<typeof generationParamsSchema>;
