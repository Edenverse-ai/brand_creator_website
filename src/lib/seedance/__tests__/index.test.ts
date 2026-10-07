/**
 * @vitest-environment node
 *
 * The token-spend guard: live calls need all three env vars, and test/E2E
 * environments always get the mock, even when live is fully configured (a
 * developer's .env.local must not be able to turn an E2E run live).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { getVideoProvider, isMockMode } from "../index";

const LIVE_ENV = {
  SEEDANCE_LIVE: "1",
  VIDEO_API_KEY: "sk-test",
  VIDEO_API_BASE_URL: "https://video.example.test",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getVideoProvider", () => {
  it("defaults to the mock provider", () => {
    vi.stubEnv("SEEDANCE_LIVE", "");
    vi.stubEnv("VIDEO_API_KEY", "");
    vi.stubEnv("VIDEO_API_BASE_URL", "");
    expect(getVideoProvider().name).toBe("mock");
    expect(isMockMode()).toBe(true);
  });

  it.each(Object.keys(LIVE_ENV))("stays on mock when %s is missing", (missing) => {
    for (const [k, v] of Object.entries(LIVE_ENV)) vi.stubEnv(k, k === missing ? "" : v);
    expect(getVideoProvider().name).toBe("mock");
    expect(isMockMode()).toBe(true);
  });

  it("uses the mock under NODE_ENV=test even when live is fully configured", () => {
    for (const [k, v] of Object.entries(LIVE_ENV)) vi.stubEnv(k, v);
    vi.stubEnv("NODE_ENV", "test");
    expect(getVideoProvider().name).toBe("mock");
    expect(isMockMode()).toBe(true);
  });

  it.each(["E2E_EXPLORE", "E2E_AGENT"])(
    "uses the mock when %s=1 even when live is configured",
    (flag) => {
      for (const [k, v] of Object.entries(LIVE_ENV)) vi.stubEnv(k, v);
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv(flag, "1");
      expect(getVideoProvider().name).toBe("mock");
      expect(isMockMode()).toBe(true);
    }
  );

  it("returns the live provider only when configured outside test/E2E", () => {
    for (const [k, v] of Object.entries(LIVE_ENV)) vi.stubEnv(k, v);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_EXPLORE", "");
    vi.stubEnv("E2E_AGENT", "");
    expect(getVideoProvider().name).toBe("ai-open-platform");
    expect(isMockMode()).toBe(false);
  });
});
