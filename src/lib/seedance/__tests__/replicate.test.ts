import { describe, it, expect } from "vitest";
import {
  buildReplicateParams,
  buildReplicatePrompt,
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

// The provider reads these as "video edit" / "video extension" intent, and those
// tasks fail unless the duration is left to the model.
const EDIT_INTENT_WORDS =
  /\b(replac\w*|swap\w*|edit\w*|add|adds|added|adding|remov\w*|delet\w*|modif\w*|chang\w*|extend\w*|extension|continu\w*)\b|编辑|增加|删除|修改|替换|延长|延续|续写/i;

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
    ["a model that isn't offered", { ...BASE, mode: "pro" }],
  ])("rejects %s", (_label, raw) => {
    expect(replicateInputSchema.safeParse(raw).success).toBe(false);
  });
});

describe("buildReplicateParams", () => {
  const parse = (overrides: Record<string, unknown>) =>
    replicateInputSchema.parse({ ...BASE, ...overrides });

  it.each([
    ["a 2 s source runs the 4 s minimum", { referenceDurationSec: 2 }, 15, 4],
    ["a 14.2 s source rounds up", { referenceDurationSec: 14.2 }, 15, 15],
    ["a 15.07 s source stays at the 15 s ceiling", { referenceDurationSec: 15.07 }, 15, 15],
    ["a 30 s source on 2.5 for an unlimited account", { referenceDurationSec: 30 }, 30, 30],
  ])("%s", (_label, overrides, maxSec, duration) => {
    expect(buildReplicateParams(parse(overrides), maxSec)).toEqual({
      mode: "seedance2.5",
      ratio: "adaptive",
      duration,
      resolution: "720p",
      generateAudio: true,
    });
  });

  it("produces params the lifecycle accepts", () => {
    const params = buildReplicateParams(parse({ mode: "mini", resolution: "1080p" }), 15);
    expect(replicateParamsSchema.parse(params)).toEqual(params);
  });
});

describe("buildReplicatePrompt", () => {
  it("matches the documented example (2 images, 14 s, audio on)", () => {
    expect(buildReplicatePrompt(BASE, { imageCount: 2, duration: 14, generateAudio: true }))
      .toBe(`Recreate Video 1 shot for shot as a 14-second TikTok e-commerce ad for the product below. Video 1 is a trending TikTok video; the new video must look like the same video, featuring this product.
Match Video 1 exactly in: camera angle, framing and shot size; camera movement, including any handheld motion; hand and body poses and how they move; the background and setting; lighting direction, brightness and color temperature; color grading; and the pacing, cut timing and transitions.
The product is "Ivory Mini Top-Handle Bag", shown in Image 1 and Image 2; these images are different views of the same product.
Show this product wherever Video 1 shows its product: in the same position, at the same size and angle in the frame, held and moved exactly the same way. The product is the only difference from Video 1.
Keep the product's shape, proportions, colors, materials, logo and printed details exactly as pictured.
Do not show any product, brand name or logo from Video 1.
Do not include subtitles, captions, prices, watermarks or any on-screen text.
Keep the music style and voiceover tone of Video 1, in the same spoken language.
The voiceover recommends "Ivory Mini Top-Handle Bag" by name, speaking to "women 25-35", and mentions: "soft vegan leather, gold clasp, fits a phone and wallet".
Speak at a calm, natural pace with short pauses between sentences, in at most 28 words in total. Never rush.`);
  });

  it.each([
    [1, '"Bag", shown in Image 1.'],
    [2, '"Bag", shown in Image 1 and Image 2; these images are different views'],
    [3, '"Bag", shown in Image 1, Image 2 and Image 3; these images are different views'],
  ])("names %i product image(s)", (imageCount, expected) => {
    const prompt = buildReplicatePrompt(
      { ...BASE, productName: "Bag" },
      { imageCount, duration: 8, generateAudio: true }
    );
    expect(prompt).toContain(expected);
    expect(prompt).not.toContain(`Image ${imageCount + 1}`);
  });

  it("puts creator text only in the voiceover, and drops it without audio", () => {
    const prompt = buildReplicatePrompt(BASE, {
      imageCount: 1,
      duration: 8,
      generateAudio: false,
    });
    expect(prompt).toContain('The product is "Ivory Mini Top-Handle Bag", shown in Image 1.');
    expect(prompt).not.toContain("women 25-35");
    expect(prompt).not.toContain("vegan leather");
    expect(prompt).not.toMatch(/voiceover/i);
    expect(prompt.split("\n")).toHaveLength(7);
  });

  it("leaves out empty audience and selling points from the voiceover", () => {
    const prompt = buildReplicatePrompt(
      { productName: "Bag", targetAudience: "", sellingPoints: "" },
      { imageCount: 1, duration: 8, generateAudio: true }
    );
    expect(prompt).toContain('The voiceover recommends "Bag" by name.');
    expect(prompt).not.toContain("speaking to");
    expect(prompt).not.toContain("mentions:");
  });

  it.each([
    [4, 8],
    [8, 16],
    [15, 30],
    [30, 60],
  ])("caps a %i s voiceover at %i words", (duration, words) => {
    expect(voiceoverWordBudget(duration)).toBe(words);
    expect(buildReplicatePrompt(BASE, { imageCount: 1, duration, generateAudio: true })).toContain(
      `in at most ${words} words in total`
    );
  });

  it("uses no edit or extension wording of its own", () => {
    const prompt = buildReplicatePrompt(
      { productName: "Bag", targetAudience: "adults", sellingPoints: "durable" },
      { imageCount: 3, duration: 30, generateAudio: true }
    );
    expect(prompt).not.toMatch(EDIT_INTENT_WORDS);
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
      duration: 30,
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
