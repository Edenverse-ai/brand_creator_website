/**
 * @vitest-environment node
 *
 * The token-spend guard: live calls need all three env vars, and are refused
 * outright in test/E2E environments even when fully configured.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { getVideoProvider, isMockMode } from "../index";
import { LiveProviderBlockedError } from "../errors";

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

  it("refuses the live provider under NODE_ENV=test even when fully configured", () => {
    for (const [k, v] of Object.entries(LIVE_ENV)) vi.stubEnv(k, v);
    vi.stubEnv("NODE_ENV", "test");
    expect(() => getVideoProvider()).toThrow(LiveProviderBlockedError);
  });

  it.each(["E2E_EXPLORE", "E2E_AGENT"])("refuses the live provider when %s=1", (flag) => {
    for (const [k, v] of Object.entries(LIVE_ENV)) vi.stubEnv(k, v);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(flag, "1");
    expect(() => getVideoProvider()).toThrow(LiveProviderBlockedError);
  });

  it("returns the live provider only when configured outside test/E2E", () => {
    for (const [k, v] of Object.entries(LIVE_ENV)) vi.stubEnv(k, v);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_EXPLORE", "");
    vi.stubEnv("E2E_AGENT", "");
    expect(getVideoProvider().name).toBe("ai-open-platform");
    expect(isMockMode()).toBe(false);
  });
});
