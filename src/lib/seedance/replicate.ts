import { z } from "zod";
import { DEFAULT_MODE, VIDEO_MODES, limitsFor } from "./models";
import { DURATION_MAX, DURATION_MIN, RESOLUTIONS } from "./schema";
import type { ProviderParams } from "./types";

/**
 * Trend replicate: the creator's product in a new TikTok ad that copies the shots,
 * camera moves and pacing of a trending video. The provider gets the trending video
 * as `videos[0]` ("Video 1"), the product photos as `images[0..2]` ("Image 1..3"),
 * and a prompt composed here from a fixed template — creators never write it.
 *
 * Shared by the replicate form (client) and POST /api/ai-videos/replicate (server).
 * See docs/superpowers/specs/2026-10-21-ai-video-trend-replicate-design.md.
 */

export const PRODUCT_NAME_MAX = 100;
export const TARGET_AUDIENCE_MAX = 100;
export const SELLING_POINTS_MAX = 500;
/** Shortest reference video the provider accepts. */
export const REFERENCE_DURATION_MIN_SEC = 2;
/**
 * Slack on the source-length ceiling: a "15 second" phone clip often measures
 * 15.0x s. The generated length is still capped at the ceiling itself.
 */
export const SOURCE_DURATION_TOLERANCE_SEC = 0.5;

/**
 * Creator text goes into the prompt as quoted data: one line, no double quotes
 * (they would close the quote) and no template-like brackets.
 */
export function sanitizePromptText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/"/g, "'")
    .replace(/[<>{}]/g, "")
    .trim();
}

const promptText = (max: number) => z.string().max(max).transform(sanitizePromptText);

export const replicateInputSchema = z
  .object({
    productName: promptText(PRODUCT_NAME_MAX).pipe(z.string().min(1, "Product name required")),
    targetAudience: promptText(TARGET_AUDIENCE_MAX).default(""),
    sellingPoints: promptText(SELLING_POINTS_MAX).default(""),
    referenceDurationSec: z.number().finite().min(REFERENCE_DURATION_MIN_SEC),
    mode: z.enum(VIDEO_MODES).default(DEFAULT_MODE),
    resolution: z.enum(RESOLUTIONS).default("720p"),
    generateAudio: z.boolean().default(true),
  })
  .superRefine((input, ctx) => {
    if (!limitsFor(input.mode).resolutions.includes(input.resolution)) {
      ctx.addIssue({
        code: "custom",
        path: ["resolution"],
        message: `${input.resolution} is not available for this model`,
      });
    }
  });

export type ReplicateInput = z.infer<typeof replicateInputSchema>;

/** Settings saved on a replicate task and sent to the provider as-is. */
export const replicateParamsSchema = z.object({
  mode: z.enum(VIDEO_MODES),
  ratio: z.literal("adaptive"),
  duration: z.number().int().min(DURATION_MIN).max(DURATION_MAX),
  resolution: z.enum(RESOLUTIONS),
  generateAudio: z.boolean(),
});

/**
 * `adaptive` keeps the source's aspect ratio, and is also the only ratio Seedance
 * 2.5 accepts if it reads the task as a video edit (TaskTypeConstraint). The output
 * runs as long as the source, within 4 s and `maxSec` (the creator's source ceiling
 * for this model — see replicateSourceCeiling).
 */
export function buildReplicateParams(input: ReplicateInput, maxSec: number): ProviderParams {
  const duration = Math.min(maxSec, Math.max(DURATION_MIN, Math.ceil(input.referenceDurationSec)));
  return {
    mode: input.mode,
    ratio: "adaptive",
    duration,
    resolution: input.resolution,
    generateAudio: input.generateAudio,
  };
}

function imageList(count: number): string {
  const names = Array.from({ length: count }, (_, i) => `Image ${i + 1}`);
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * The fixed wording never uses edit/extend verbs (replace, swap, remove, extend…):
 * the provider infers "video edit" or "video extension" tasks from prompt intent,
 * and those fail unless the duration is left to the model.
 */
export function buildReplicatePrompt(
  input: Pick<ReplicateInput, "productName" | "targetAudience" | "sellingPoints">,
  options: { imageCount: number; duration: number; generateAudio: boolean }
): string {
  const { imageCount, duration, generateAudio } = options;
  const lines = [
    `Create a brand-new ${duration}-second TikTok e-commerce ad for the product below. Its purpose is to promote this product and make viewers want to buy it.`,
    "It should feel like a native, authentic TikTok creator video (UGC style), not a polished TV commercial.",
    "Video 1 is a trending TikTok video. Use it only as the style reference: follow its shot order, shot sizes, camera movement, pacing, transitions, lighting mood and overall energy as closely as possible.",
    "Like Video 1, open with a strong hook in the first 2 seconds that puts the product, or the problem it solves, front and center.",
    imageCount > 1
      ? `The product being advertised is the one shown in ${imageList(imageCount)}; these images are different views of the same product.`
      : "The product being advertised is the one shown in Image 1.",
    "Wherever a product appears in Video 1, show this product in its place, held, used and framed the same way.",
    "Keep the product's shape, proportions, colors, materials, logo and printed details exactly as pictured, and keep it the clear visual focus of every shot.",
    "Show the product in real use so its benefits are obvious at a glance.",
    `Product name: "${input.productName}".`,
    input.targetAudience
      ? `Target buyers: "${input.targetAudience}". Cast, styling and setting should feel natural and relatable for them.`
      : null,
    input.sellingPoints
      ? `Selling points to demonstrate on camera: "${input.sellingPoints}".`
      : null,
    "Make the final shot a clear, well-lit hero shot of the product so viewers remember exactly what to buy.",
    "If Video 1 features a person, cast a different creator with a similar role, pose and energy; do not reproduce the person from Video 1.",
    "Do not show any product, brand name or logo from Video 1.",
    "Do not include subtitles, captions, prices, watermarks or any on-screen text.",
    generateAudio
      ? `Match the music style and voiceover tone of Video 1, in the same spoken language; the voiceover should sound like an excited creator genuinely recommending "${input.productName}" and mention it by name.`
      : null,
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}
