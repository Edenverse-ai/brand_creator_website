import { z } from "zod";
import { DEFAULT_REPLICATE_MODE, REPLICATE_MODES, replicateLimitsFor } from "./models";
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
    mode: z.enum(REPLICATE_MODES).default(DEFAULT_REPLICATE_MODE),
    resolution: z.enum(RESOLUTIONS).default("720p"),
    generateAudio: z.boolean().default(true),
  })
  .superRefine((input, ctx) => {
    if (!replicateLimitsFor(input.mode).resolutions.includes(input.resolution)) {
      ctx.addIssue({
        code: "custom",
        path: ["resolution"],
        message: `${input.resolution} is not available for this model`,
      });
    }
  });

export type ReplicateInput = z.infer<typeof replicateInputSchema>;

/**
 * Settings saved on a replicate task and sent to the provider as-is. New tasks use
 * a fixed length and a replicate model; `-1` and `mini` are still accepted for
 * tasks queued while those were in use.
 */
export const replicateParamsSchema = z.object({
  mode: z.enum([...REPLICATE_MODES, "mini"]),
  ratio: z.literal("adaptive"),
  duration: z.union([z.literal(-1), z.number().int().min(DURATION_MIN).max(DURATION_MAX)]),
  resolution: z.enum(RESOLUTIONS),
  generateAudio: z.boolean(),
});

/**
 * A fixed length (the source's, see expectedOutputSeconds) keeps the task a
 * reference generation, so its audio is generated fresh. With `duration: -1` and
 * a "same as Video 1" prompt, Seedance treated it as a video edit, kept the
 * source's soundtrack and rejected the output audio for copyright. The catch: if
 * the model still reads the prompt as an edit, it rejects the fixed length
 * (unbilled). `adaptive` keeps the source's aspect ratio.
 */
export function buildReplicateParams(input: ReplicateInput, maxSec: number): ProviderParams {
  return {
    mode: input.mode,
    ratio: "adaptive",
    duration: expectedOutputSeconds(input.referenceDurationSec, maxSec),
    resolution: input.resolution,
    generateAudio: input.generateAudio,
  };
}

/** How long the result should run: the source's length, within 4 s and `maxSec`. */
export function expectedOutputSeconds(sourceSec: number, maxSec: number): number {
  return Math.min(maxSec, Math.max(DURATION_MIN, Math.ceil(sourceSec)));
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
 * The replicate prompt, worded by the product owner: Video 1 recreated shot for
 * shot with the creator's product as the only difference, keeping Video 1's music
 * style and voiceover tone. Sent in full whether or not audio is generated.
 * Creators tend to paste long selling-point lists, so the voiceover picks the one
 * or two that matter most, within a word cap that follows the output length.
 */
export function buildReplicatePrompt(
  input: Pick<ReplicateInput, "productName" | "targetAudience" | "sellingPoints">,
  options: { imageCount: number; outputSeconds: number; generateAudio: boolean }
): string {
  const { imageCount, outputSeconds } = options;
  const name = `"${input.productName}"`;
  const images =
    imageCount > 1
      ? `${imageList(imageCount)}; these images are different views of the same product`
      : "Image 1";
  return [
    "Recreate Video 1 shot for shot, featuring the product below instead of the original product.",
    "Match Video 1 exactly in: camera angle, framing and shot size; camera movement, including any handheld motion; hand and body poses and how they move; the background and setting; lighting direction, brightness and color temperature; color grading; and the pacing, cut timing and transitions.",
    `The product is ${name}, shown in ${images}.`,
    "Show this product wherever Video 1 shows its product: in the same position, at the same size and angle in the frame, held and moved exactly the same way.",
    "The product is the only difference from Video 1.",
    "Keep the product's shape, proportions, colors, materials, logo and printed details exactly as pictured.",
    "Do not show any product, brand name or logo from Video 1.",
    "Keep the music style and mood of Video 1.",
    "Keep the voiceover tone of Video 1, in the same spoken language.",
    "If Video 1 has no voiceover, add none.",
    [
      `The voiceover recommends ${name} by name`,
      input.targetAudience ? `, speaking to "${input.targetAudience}"` : "",
      input.sellingPoints
        ? `, and mentions only the one or two selling points that matter most to buyers from: "${input.sellingPoints}"`
        : "",
      ".",
    ].join(""),
    `Speak at a calm, natural pace with short pauses between sentences, in at most ${voiceoverWordBudget(outputSeconds)} words in total.`,
    "Never rush.",
  ].join(" ");
}
