import { describe, it, expect } from "vitest";
import { generationParamsSchema } from "../schema";

describe("generationParamsSchema", () => {
  it("fills defaults: cheapest model, 9:16, 5 s, 720p, audio on", () => {
    expect(generationParamsSchema.parse({})).toEqual({
      mode: "mini",
      ratio: "9:16",
      duration: 5,
      resolution: "720p",
      generateAudio: true,
    });
  });

  it("accepts every value the UI offers", () => {
    for (const ratio of ["9:16", "16:9", "1:1", "3:4", "4:3"]) {
      expect(generationParamsSchema.parse({ ratio }).ratio).toBe(ratio);
    }
    for (const mode of ["mini", "fast", "pro", "seedance2.5"]) {
      expect(generationParamsSchema.parse({ mode }).mode).toBe(mode);
    }
    for (const duration of [4, 5, 9, 15]) {
      expect(generationParamsSchema.parse({ duration }).duration).toBe(duration);
    }
    for (const resolution of ["480p", "720p"]) {
      expect(generationParamsSchema.parse({ resolution }).resolution).toBe(resolution);
    }
  });

  it("rejects values outside the offered set", () => {
    expect(() => generationParamsSchema.parse({ ratio: "21:9" })).toThrow();
    expect(() => generationParamsSchema.parse({ ratio: "adaptive" })).toThrow();
    expect(() => generationParamsSchema.parse({ mode: "ultra" })).toThrow();
    expect(() => generationParamsSchema.parse({ duration: 3 })).toThrow();
    expect(() => generationParamsSchema.parse({ duration: 16 })).toThrow();
    expect(() => generationParamsSchema.parse({ duration: 7.5 })).toThrow();
    expect(() => generationParamsSchema.parse({ duration: -1 })).toThrow();
    expect(() => generationParamsSchema.parse({ resolution: "1080p" })).toThrow();
    expect(() => generationParamsSchema.parse({ generateAudio: "yes" })).toThrow();
  });
});
