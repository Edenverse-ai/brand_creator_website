import "server-only";
import { AiOpenPlatformProvider } from "./client";
import { getLiveConfig, isLiveBlockedEnvironment } from "./config";
import { LiveProviderBlockedError } from "./errors";
import { mockProvider } from "./mock";
import type { VideoProvider } from "./types";

/**
 * The only way app code obtains a video provider. Enforces the token-spend rule
 * (spec §4): mock unless SEEDANCE_LIVE=1 + VIDEO_API_KEY + VIDEO_API_BASE_URL
 * are all set, and never live under test/E2E, even when fully configured.
 */
export function getVideoProvider(): VideoProvider {
  const live = getLiveConfig();
  if (!live) return mockProvider;
  if (isLiveBlockedEnvironment()) throw new LiveProviderBlockedError();
  return new AiOpenPlatformProvider(live);
}

export function isMockMode(): boolean {
  return getLiveConfig() === null;
}
