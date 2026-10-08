import { describe, it, expect } from "vitest";
import { generationParamsSchema } from "../schema";

describe("generationParamsSchema", () => {
  it("fills defaults: Seedance 2.5, 9:16, 5 s, 720p, audio on", () => {
    expect(generationParamsSchema.parse({})).toEqual({
      mode: "seedance2.5",
      ratio: "9:16",
      duration: 5,
      resolution: "720p",
      generateAudio: true,
    });
  });

  it("accepts every ratio", () => {
    for (const ratio of ["9:16", "16:9", "1:1", "3:4", "4:3"]) {
      expect(generationParamsSchema.parse({ ratio }).ratio).toBe(ratio);
    }
  });

  it("lets Seedance 2.5 run up to 30 s at 480p or 720p", () => {
    for (const duration of [4, 15, 16, 30]) {
      expect(generationParamsSchema.parse({ mode: "seedance2.5", duration }).duration).toBe(
        duration
      );
    }
    for (const resolution of ["480p", "720p"]) {
      expect(generationParamsSchema.parse({ mode: "seedance2.5", resolution }).resolution).toBe(
        resolution
      );
    }
    expect(() => generationParamsSchema.parse({ mode: "seedance2.5", duration: 31 })).toThrow();
    expect(() =>
      generationParamsSchema.parse({ mode: "seedance2.5", resolution: "1080p" })
    ).toThrow();
  });

  it("lets Mini go up to 1080p, but only 15 s", () => {
    for (const resolution of ["480p", "720p", "1080p"]) {
      expect(generationParamsSchema.parse({ mode: "mini", resolution }).resolution).toBe(
        resolution
      );
    }
    expect(generationParamsSchema.parse({ mode: "mini", duration: 15 }).duration).toBe(15);
    expect(() => generationParamsSchema.parse({ mode: "mini", duration: 16 })).toThrow();
  });

  it("still accepts the settings saved on earlier tasks", () => {
    const saved = {
      mode: "mini",
      ratio: "9:16",
      duration: 10,
      resolution: "480p",
      generateAudio: false,
    };
    expect(generationParamsSchema.parse(saved)).toEqual(saved);
  });

  it("rejects values outside the offered set", () => {
    for (const mode of ["fast", "pro", "ultra"]) {
      expect(() => generationParamsSchema.parse({ mode })).toThrow();
    }
    expect(() => generationParamsSchema.parse({ ratio: "21:9" })).toThrow();
    expect(() => generationParamsSchema.parse({ ratio: "adaptive" })).toThrow();
    expect(() => generationParamsSchema.parse({ duration: 3 })).toThrow();
    expect(() => generationParamsSchema.parse({ duration: 7.5 })).toThrow();
    expect(() => generationParamsSchema.parse({ duration: -1 })).toThrow();
    expect(() => generationParamsSchema.parse({ resolution: "4k" })).toThrow();
    expect(() => generationParamsSchema.parse({ generateAudio: "yes" })).toThrow();
  });
});
