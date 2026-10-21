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
 * Voiceover budget: about two words per second reads at a relaxed pace. Without a
 * cap the model crams the creator's selling points into a rushed monologue.
 */
export const VOICEOVER_WORDS_PER_SECOND = 2;

export function voiceoverWordBudget(duration: number): number {
  return Math.max(8, Math.floor(duration * VOICEOVER_WORDS_PER_SECOND));
}

/**
 * Video 1 is the master: the result recreates it shot for shot (framing, camera
 * movement, poses, background, lighting, timing) and differs only in the product.
 * Creator inputs feed the voiceover, never the visuals, so they can't pull the
 * picture away from Video 1.
 *
 * The fixed wording never uses edit/extend verbs (replace, swap, remove, change,
 * extend…): the provider infers "video edit" or "video extension" tasks from prompt
 * intent, and those fail unless the duration is left to the model.
 */
export function buildReplicatePrompt(
  input: Pick<ReplicateInput, "productName" | "targetAudience" | "sellingPoints">,
  options: { imageCount: number; duration: number; generateAudio: boolean }
): string {
  const { imageCount, duration, generateAudio } = options;
  const voiceover = [
    `The voiceover recommends "${input.productName}" by name`,
    input.targetAudience ? `, speaking to "${input.targetAudience}"` : "",
    input.sellingPoints ? `, and mentions: "${input.sellingPoints}"` : "",
    ".",
  ].join("");
  const lines = [
    `Recreate Video 1 shot for shot as a ${duration}-second TikTok e-commerce ad for the product below. Video 1 is a trending TikTok video; the new video must look like the same video, featuring this product.`,
    "Match Video 1 exactly in: camera angle, framing and shot size; camera movement, including any handheld motion; hand and body poses and how they move; the background and setting; lighting direction, brightness and color temperature; color grading; and the pacing, cut timing and transitions.",
    imageCount > 1
      ? `The product is "${input.productName}", shown in ${imageList(imageCount)}; these images are different views of the same product.`
      : `The product is "${input.productName}", shown in Image 1.`,
    "Show this product wherever Video 1 shows its product: in the same position, at the same size and angle in the frame, held and moved exactly the same way. The product is the only difference from Video 1.",
    "Keep the product's shape, proportions, colors, materials, logo and printed details exactly as pictured.",
    "Do not show any product, brand name or logo from Video 1.",
    "Do not include subtitles, captions, prices, watermarks or any on-screen text.",
    generateAudio
      ? "Keep the music style and voiceover tone of Video 1, in the same spoken language."
      : null,
    generateAudio ? voiceover : null,
    generateAudio
      ? `Speak at a calm, natural pace with short pauses between sentences, in at most ${voiceoverWordBudget(duration)} words in total. Never rush.`
      : null,
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}
