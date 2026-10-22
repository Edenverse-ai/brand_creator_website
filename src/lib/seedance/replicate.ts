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
 * `duration: -1` and a replicate model; a fixed length and `mini` are still
 * accepted for tasks queued before those changes.
 */
export const replicateParamsSchema = z.object({
  mode: z.enum([...REPLICATE_MODES, "mini"]),
  ratio: z.literal("adaptive"),
  duration: z.union([z.literal(-1), z.number().int().min(DURATION_MIN).max(DURATION_MAX)]),
  resolution: z.enum(RESOLUTIONS),
  generateAudio: z.boolean(),
});

/**
 * A replicate is a Seedance video edit: the prompt asks to put the creator's
 * product into Video 1 and keep everything else. Edit tasks take their ratio and
 * length from the source and only accept `ratio: "adaptive"` and `duration: -1`;
 * if the model reads the task as a reference generation instead, `-1` lets it
 * choose the length. Either way the request is valid. The source length is capped
 * by the route (replicateSourceCeiling), so the output is too.
 */
export function buildReplicateParams(input: ReplicateInput): ProviderParams {
  return {
    mode: input.mode,
    ratio: "adaptive",
    duration: -1,
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
 * An edit instruction: Video 1 stays as it is (framing, camera movement, poses,
 * background, lighting, timing) and only its product changes. Text and speech
 * mirror Video 1, since we can't inspect it ourselves:
 * - on-screen text, including animated text, keeps its position, style, animation,
 *   timing and length, but Video 1's words give way to the product name and
 *   selling points; no text is added where Video 1 has none;
 * - new speech goes only where Video 1 speaks, with the same timing, so a source
 *   without speech gets none. Creators tend to paste long selling-point lists, so
 *   the speech picks the one or two that matter most instead of reading them all;
 * - the audio follows Video 1's rhythm but never its music or voice: the provider
 *   rejects output audio that may be copyrighted, and trending clips use
 *   copyrighted songs.
 */
export function buildReplicatePrompt(
  input: Pick<ReplicateInput, "productName" | "targetAudience" | "sellingPoints">,
  options: { imageCount: number; outputSeconds: number; generateAudio: boolean }
): string {
  const { imageCount, outputSeconds, generateAudio } = options;
  const name = `"${input.productName}"`;
  const lines = [
    imageCount > 1
      ? `Video 1 is a trending TikTok video. Replace the product in Video 1 with ${name}, the product shown in ${imageList(imageCount)}; these images are different views of the same product.`
      : `Video 1 is a trending TikTok video. Replace the product in Video 1 with ${name}, the product shown in Image 1.`,
    "Keep everything else in Video 1 unchanged: camera angle, framing and shot size, camera movement including handheld motion, hands and poses and how they move, background and setting, lighting direction, brightness and color temperature, color grading, pacing and cut timing.",
    "The new product sits in the same position, at the same size and angle, and is held and moved exactly as the original product.",
    "Keep the new product's shape, proportions, colors, materials, logo and printed details exactly as pictured. Remove every brand name and logo of the original product.",
    [
      `None of Video 1's own on-screen text may appear. Wherever Video 1 shows on-screen text, including animated text, keep the same position, font style, size, animation and timing, and about the same number of words, but change the words to the product name ${name}`,
      input.sellingPoints
        ? ` and short phrases from these selling points: "${input.sellingPoints}"`
        : "",
      ". If Video 1 has no on-screen text, add none. Do not add prices or watermarks.",
    ].join(""),
    generateAudio
      ? "Do not reuse any music, song or audio from Video 1. Add new, original background music with a similar mood, tempo and energy, timed to the same cuts."
      : null,
    generateAudio
      ? [
          `If Video 1 has speech or a voiceover, add new speech in a new, natural voice that does not imitate the original speaker, in the same spoken language and a similar tone, only where Video 1 has speech and with the same timing: it recommends ${name} by name`,
          input.targetAudience ? `, speaking to "${input.targetAudience}"` : "",
          ".",
        ].join("")
      : null,
    generateAudio && input.sellingPoints
      ? `From these selling points, mention only the one or two that matter most to buyers: "${input.sellingPoints}".`
      : null,
    generateAudio
      ? `Use at most ${voiceoverWordBudget(outputSeconds)} words in total. Never rush.`
      : null,
    generateAudio ? "If Video 1 has no speech, add no speech." : null,
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}
