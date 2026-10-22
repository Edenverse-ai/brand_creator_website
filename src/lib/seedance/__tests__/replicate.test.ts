import { describe, it, expect } from "vitest";
import {
  buildReplicateParams,
  buildReplicatePrompt,
  expectedOutputSeconds,
  replicateInputSchema,
  replicateParamsSchema,
  sanitizePromptText,
  voiceoverWordBudget,
} from "../replicate";

const BASE = {
  productName: "Ivory Mini Top-Handle Bag",
  targetAudience: "women 25-35",
  sellingPoints: "soft vegan leather, gold clasp, fits a phone and wallet",
  referenceDurationSec: 14.2,
};

describe("replicateInputSchema", () => {
  it("applies defaults and sanitises creator text", () => {
    const input = replicateInputSchema.parse({
      productName: '  The "Best"\n  <Bag> {v2}  ',
      referenceDurationSec: 8,
    });
    expect(input).toEqual({
      productName: "The 'Best' Bag v2",
      targetAudience: "",
      sellingPoints: "",
      referenceDurationSec: 8,
      mode: "seedance2.5",
      resolution: "720p",
      generateAudio: true,
    });
  });

  it.each([
    ["a blank product name", { ...BASE, productName: "  \n " }],
    ["a product name over 100 characters", { ...BASE, productName: "x".repeat(101) }],
    ["selling points over 500 characters", { ...BASE, sellingPoints: "x".repeat(501) }],
    ["a source shorter than 2 s", { ...BASE, referenceDurationSec: 1.9 }],
    ["a missing source duration", { productName: "Bag" }],
    ["a resolution the model can't produce", { ...BASE, mode: "seedance2.5", resolution: "1080p" }],
    ["Mini, which the provider rejects at 1080p with a reference video", { ...BASE, mode: "mini" }],
    ["Fast, which isn't offered for replicates", { ...BASE, mode: "fast" }],
    ["Pro at 4k", { ...BASE, mode: "pro", resolution: "4k" }],
  ])("rejects %s", (_label, raw) => {
    expect(replicateInputSchema.safeParse(raw).success).toBe(false);
  });
});

describe("buildReplicateParams", () => {
  it("leaves the length to the source: adaptive ratio, duration -1", () => {
    const input = replicateInputSchema.parse({ ...BASE, mode: "pro", resolution: "1080p" });
    const params = buildReplicateParams(input);
    expect(params).toEqual({
      mode: "pro",
      ratio: "adaptive",
      duration: -1,
      resolution: "1080p",
      generateAudio: true,
    });
    expect(replicateParamsSchema.parse(params)).toEqual(params);
  });

  it("still accepts tasks queued with Mini or a fixed length", () => {
    const queued = {
      mode: "mini",
      ratio: "adaptive",
      duration: -1,
      resolution: "720p",
      generateAudio: true,
    };
    expect(replicateParamsSchema.parse(queued)).toEqual(queued);
  });

  it("still accepts a fixed length on tasks queued before -1", () => {
    const legacy = {
      mode: "seedance2.5",
      ratio: "adaptive",
      duration: 15,
      resolution: "720p",
      generateAudio: true,
    };
    expect(replicateParamsSchema.parse(legacy)).toEqual(legacy);
    expect(replicateParamsSchema.safeParse({ ...legacy, duration: 3 }).success).toBe(false);
  });
});

describe("expectedOutputSeconds", () => {
  it.each([
    [2, 15, 4],
    [14.2, 15, 15],
    [15.07, 15, 15],
    [30, 30, 30],
  ])("a %s s source with a %i s ceiling runs %i s", (source, ceiling, expected) => {
    expect(expectedOutputSeconds(source, ceiling)).toBe(expected);
  });
});

describe("buildReplicatePrompt", () => {
  it("matches the documented example (2 images, 14 s, audio on)", () => {
    expect(buildReplicatePrompt(BASE, { imageCount: 2, outputSeconds: 14, generateAudio: true }))
      .toBe(`Video 1 is a trending TikTok video. Replace the product in Video 1 with "Ivory Mini Top-Handle Bag", the product shown in Image 1 and Image 2; these images are different views of the same product.
Keep everything else in Video 1 unchanged: camera angle, framing and shot size, camera movement including handheld motion, hands and poses and how they move, background and setting, lighting direction, brightness and color temperature, color grading, pacing and cut timing.
The new product sits in the same position, at the same size and angle, and is held and moved exactly as the original product.
Keep the new product's shape, proportions, colors, materials, logo and printed details exactly as pictured. Remove every brand name and logo of the original product.
None of Video 1's own on-screen text may appear. Wherever Video 1 shows on-screen text, including animated text, keep the same position, font style, size, animation and timing, and about the same number of words, but change the words to the product name "Ivory Mini Top-Handle Bag" and short phrases from these selling points: "soft vegan leather, gold clasp, fits a phone and wallet". If Video 1 has no on-screen text, add none. Do not add prices or watermarks.
Do not reuse any music, song or audio from Video 1. Add new, original background music with a similar mood, tempo and energy, timed to the same cuts.
If Video 1 has speech or a voiceover, add new speech in a new, natural voice that does not imitate the original speaker, in the same spoken language and a similar tone, only where Video 1 has speech and with the same timing: it recommends "Ivory Mini Top-Handle Bag" by name, speaking to "women 25-35".
From these selling points, mention only the one or two that matter most to buyers: "soft vegan leather, gold clasp, fits a phone and wallet".
Use at most 28 words in total. Never rush.
If Video 1 has no speech, add no speech.`);
  });

  it.each([
    [1, 'with "Bag", the product shown in Image 1.'],
    [2, 'with "Bag", the product shown in Image 1 and Image 2; these images are different views'],
    [
      3,
      'with "Bag", the product shown in Image 1, Image 2 and Image 3; these images are different views',
    ],
  ])("names %i product image(s)", (imageCount, expected) => {
    const prompt = buildReplicatePrompt(
      { ...BASE, productName: "Bag" },
      { imageCount, outputSeconds: 8, generateAudio: true }
    );
    expect(prompt).toContain(expected);
    expect(prompt).not.toContain(`Image ${imageCount + 1}`);
  });

  it("mirrors Video 1's on-screen text, animation included, with the new words", () => {
    const prompt = buildReplicatePrompt(BASE, {
      imageCount: 1,
      outputSeconds: 8,
      generateAudio: true,
    });
    expect(prompt).toContain("None of Video 1's own on-screen text may appear.");
    expect(prompt).toContain(
      "including animated text, keep the same position, font style, size, animation and timing, and about the same number of words"
    );
    expect(prompt).toContain("If Video 1 has no on-screen text, add none.");
    expect(prompt).toContain("Remove every brand name and logo of the original product.");
  });

  it("mirrors Video 1's speech: only where it speaks, none if it doesn't", () => {
    const prompt = buildReplicatePrompt(BASE, {
      imageCount: 1,
      outputSeconds: 8,
      generateAudio: true,
    });
    expect(prompt).toContain("Do not reuse any music, song or audio from Video 1.");
    expect(prompt).toContain("does not imitate the original speaker");
    expect(prompt).toContain("only where Video 1 has speech and with the same timing");
    expect(prompt.split("\n").at(-1)).toBe("If Video 1 has no speech, add no speech.");
  });

  it("without audio drops the speech lines and audience, but keeps the on-screen text", () => {
    const prompt = buildReplicatePrompt(BASE, {
      imageCount: 1,
      outputSeconds: 8,
      generateAudio: false,
    });
    expect(prompt).not.toMatch(/speech|voiceover|music/i);
    expect(prompt).not.toContain("women 25-35");
    expect(prompt).toContain(
      'change the words to the product name "Ivory Mini Top-Handle Bag" and short phrases from these selling points: "soft vegan leather'
    );
    expect(prompt.split("\n")).toHaveLength(5);
  });

  it("leaves out the selling-point and audience parts when they are empty", () => {
    const prompt = buildReplicatePrompt(
      { productName: "Bag", targetAudience: "", sellingPoints: "" },
      { imageCount: 1, outputSeconds: 8, generateAudio: true }
    );
    expect(prompt).toContain(
      'change the words to the product name "Bag". If Video 1 has no on-screen text, add none.'
    );
    expect(prompt).toContain('it recommends "Bag" by name.');
    expect(prompt).not.toContain("selling points");
    expect(prompt).not.toContain("speaking to");
    expect(prompt.split("\n")).toHaveLength(9);
  });

  it.each([
    [4, 8],
    [8, 16],
    [15, 30],
    [30, 60],
  ])("caps a %i s voiceover at %i words", (outputSeconds, words) => {
    expect(voiceoverWordBudget(outputSeconds)).toBe(words);
    expect(
      buildReplicatePrompt(BASE, { imageCount: 1, outputSeconds, generateAudio: true })
    ).toContain(`Use at most ${words} words in total. Never rush.`);
  });

  it("stays well inside the provider's prompt limit at the longest inputs", () => {
    const input = replicateInputSchema.parse({
      productName: "n".repeat(100),
      targetAudience: "a".repeat(100),
      sellingPoints: "s".repeat(500),
      referenceDurationSec: 30,
    });
    const prompt = buildReplicatePrompt(input, {
      imageCount: 3,
      outputSeconds: 30,
      generateAudio: true,
    });
    expect(prompt.length).toBeLessThan(5000);
  });
});

describe("sanitizePromptText", () => {
  it("keeps the mock failure marker intact", () => {
    expect(sanitizePromptText("Bag [mock-fail]")).toBe("Bag [mock-fail]");
  });
});
