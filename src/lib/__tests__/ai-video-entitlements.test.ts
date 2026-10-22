import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getEntitlements,
  isUnlimitedEmail,
  replicateSourceCeiling,
} from "../ai-video-entitlements";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isUnlimitedEmail", () => {
  it("matches listed emails case-insensitively, ignoring spaces", () => {
    vi.stubEnv("AI_VIDEO_UNLIMITED_EMAILS", " creator-free@test.local , qa@example.com");
    expect(isUnlimitedEmail("Creator-Free@Test.local")).toBe(true);
    expect(isUnlimitedEmail("qa@example.com")).toBe(true);
    expect(isUnlimitedEmail("someone@example.com")).toBe(false);
  });

  it("is false for a missing email or an unset list", () => {
    vi.stubEnv("AI_VIDEO_UNLIMITED_EMAILS", "");
    expect(isUnlimitedEmail("creator-free@test.local")).toBe(false);
    vi.stubEnv("AI_VIDEO_UNLIMITED_EMAILS", "a@b.c,");
    expect(isUnlimitedEmail(null)).toBe(false);
    expect(isUnlimitedEmail("")).toBe(false);
  });
});

describe("getEntitlements", () => {
  it("gives everyone else the free tier", () => {
    vi.stubEnv("AI_VIDEO_DAILY_LIMIT", "5");
    expect(getEntitlements("someone@example.com")).toEqual({
      generate: { dailyLimit: 5 },
      replicate: { monthlyLimit: 3, maxSourceSec: 15 },
    });
  });

  it("gives listed accounts unlimited generations and 30 s sources", () => {
    vi.stubEnv("AI_VIDEO_UNLIMITED_EMAILS", "creator-free@test.local");
    expect(getEntitlements("creator-free@test.local")).toEqual({
      generate: { dailyLimit: null },
      replicate: { monthlyLimit: null, maxSourceSec: 30 },
    });
  });
});

describe("replicateSourceCeiling", () => {
  it("never exceeds what the model can generate", () => {
    expect(replicateSourceCeiling(30, "seedance2.5")).toBe(30);
    expect(replicateSourceCeiling(30, "pro")).toBe(15);
    expect(replicateSourceCeiling(15, "seedance2.5")).toBe(15);
  });
});
