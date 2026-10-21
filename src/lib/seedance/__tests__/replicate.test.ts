import { describe, it, expect } from "vitest";
import {
  buildReplicateParams,
  buildReplicatePrompt,
  replicateInputSchema,
  replicateParamsSchema,
  sanitizePromptText,
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
  it("matches the documented example (2 images, 15 s, audio on)", () => {
    expect(buildReplicatePrompt(BASE, { imageCount: 2, duration: 15, generateAudio: true }))
      .toBe(`Create a brand-new 15-second TikTok e-commerce ad for the product below. Its purpose is to promote this product and make viewers want to buy it.
It should feel like a native, authentic TikTok creator video (UGC style), not a polished TV commercial.
Video 1 is a trending TikTok video. Use it only as the style reference: follow its shot order, shot sizes, camera movement, pacing, transitions, lighting mood and overall energy as closely as possible.
Like Video 1, open with a strong hook in the first 2 seconds that puts the product, or the problem it solves, front and center.
The product being advertised is the one shown in Image 1 and Image 2; these images are different views of the same product.
Wherever a product appears in Video 1, show this product in its place, held, used and framed the same way.
Keep the product's shape, proportions, colors, materials, logo and printed details exactly as pictured, and keep it the clear visual focus of every shot.
Show the product in real use so its benefits are obvious at a glance.
Product name: "Ivory Mini Top-Handle Bag".
Target buyers: "women 25-35". Cast, styling and setting should feel natural and relatable for them.
Selling points to demonstrate on camera: "soft vegan leather, gold clasp, fits a phone and wallet".
Make the final shot a clear, well-lit hero shot of the product so viewers remember exactly what to buy.
If Video 1 features a person, cast a different creator with a similar role, pose and energy; do not reproduce the person from Video 1.
Do not show any product, brand name or logo from Video 1.
Do not include subtitles, captions, prices, watermarks or any on-screen text.
Match the music style and voiceover tone of Video 1, in the same spoken language; the voiceover should sound like an excited creator genuinely recommending "Ivory Mini Top-Handle Bag" and mention it by name.`);
  });

  it.each([
    [1, "The product being advertised is the one shown in Image 1."],
    [2, "shown in Image 1 and Image 2; these images are different views"],
    [3, "shown in Image 1, Image 2 and Image 3; these images are different views"],
  ])("names %i product image(s)", (imageCount, expected) => {
    const prompt = buildReplicatePrompt(BASE, { imageCount, duration: 8, generateAudio: true });
    expect(prompt).toContain(expected);
    expect(prompt).not.toContain(`Image ${imageCount + 1}`);
  });

  it("leaves out the optional lines when their input is empty", () => {
    const prompt = buildReplicatePrompt(
      { productName: "Bag", targetAudience: "", sellingPoints: "" },
      { imageCount: 1, duration: 8, generateAudio: false }
    );
    expect(prompt).toContain('Product name: "Bag".');
    expect(prompt).not.toContain("Target buyers");
    expect(prompt).not.toContain("Selling points");
    expect(prompt).not.toContain("voiceover");
    expect(prompt.split("\n")).toHaveLength(13);
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
