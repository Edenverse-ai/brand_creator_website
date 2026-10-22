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
  it.each([
    ["a 2 s source runs the 4 s minimum", 2, 15, 4],
    ["a 14.2 s source rounds up", 14.2, 15, 15],
    ["a 15.07 s source stays at the 15 s ceiling", 15.07, 15, 15],
    ["a 30 s source on 2.5 for an unlimited account", 30, 30, 30],
  ])("sends a fixed length: %s", (_label, referenceDurationSec, maxSec, duration) => {
    const input = replicateInputSchema.parse({ ...BASE, referenceDurationSec });
    expect(buildReplicateParams(input, maxSec)).toEqual({
      mode: "seedance2.5",
      ratio: "adaptive",
      duration,
      resolution: "720p",
      generateAudio: true,
    });
  });

  it("produces params the lifecycle accepts", () => {
    const input = replicateInputSchema.parse({ ...BASE, mode: "pro", resolution: "1080p" });
    const params = buildReplicateParams(input, 15);
    expect(params).toMatchObject({ mode: "pro", resolution: "1080p", duration: 15 });
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
  it("matches the agreed template (2 images, 15 s)", () => {
    expect(
      buildReplicatePrompt(BASE, { imageCount: 2, outputSeconds: 15, generateAudio: true })
    ).toBe(
      'Recreate Video 1 shot for shot, featuring the product below instead of the original product. Match Video 1 exactly in: camera angle, framing and shot size; camera movement, including any handheld motion; hand and body poses and how they move; the background and setting; lighting direction, brightness and color temperature; color grading; and the pacing, cut timing and transitions. The product is "Ivory Mini Top-Handle Bag", shown in Image 1 and Image 2; these images are different views of the same product. Show this product wherever Video 1 shows its product: in the same position, at the same size and angle in the frame, held and moved exactly the same way. The product is the only difference from Video 1. Keep the product\'s shape, proportions, colors, materials, logo and printed details exactly as pictured. Do not show any product, brand name or logo from Video 1. Keep the music style and mood of Video 1. Keep the voiceover tone of Video 1, in the same spoken language. If Video 1 has no voiceover, add none. The voiceover recommends "Ivory Mini Top-Handle Bag" by name, speaking to "women 25-35", and mentions only the one or two selling points that matter most to buyers from: "soft vegan leather, gold clasp, fits a phone and wallet". Speak at a calm, natural pace with short pauses between sentences, in at most 30 words in total. Never rush.'
    );
  });

  it.each([
    [1, 'The product is "Bag", shown in Image 1. Show this product'],
    [
      2,
      'The product is "Bag", shown in Image 1 and Image 2; these images are different views of the same product.',
    ],
    [
      3,
      'The product is "Bag", shown in Image 1, Image 2 and Image 3; these images are different views of the same product.',
    ],
  ])("names %i product image(s)", (imageCount, expected) => {
    const prompt = buildReplicatePrompt(
      { ...BASE, productName: "Bag" },
      { imageCount, outputSeconds: 8, generateAudio: true }
    );
    expect(prompt).toContain(expected);
    expect(prompt).not.toContain(`Image ${imageCount + 1}`);
  });

  it("leaves out the audience and selling-point clauses when they are empty", () => {
    const prompt = buildReplicatePrompt(
      { productName: "Bag", targetAudience: "", sellingPoints: "" },
      { imageCount: 1, outputSeconds: 8, generateAudio: true }
    );
    expect(prompt).toContain('The voiceover recommends "Bag" by name. Speak at a calm');
    expect(prompt).not.toContain("speaking to");
    expect(prompt).not.toContain("selling points");
  });

  it("sends the same prompt with audio on or off", () => {
    const options = { imageCount: 2, outputSeconds: 15 };
    expect(buildReplicatePrompt(BASE, { ...options, generateAudio: false })).toBe(
      buildReplicatePrompt(BASE, { ...options, generateAudio: true })
    );
  });

  it("is a single paragraph", () => {
    expect(
      buildReplicatePrompt(BASE, { imageCount: 1, outputSeconds: 8, generateAudio: true })
    ).not.toContain("\n");
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
    ).toContain(`in at most ${words} words in total. Never rush.`);
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
