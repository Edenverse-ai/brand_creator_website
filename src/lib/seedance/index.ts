import { AiOpenPlatformProvider } from "./client";
import { getLiveConfig, isLiveBlockedEnvironment } from "./config";
import { mockProvider } from "./mock";
import type { VideoProvider } from "./types";

/**
 * The only way app code obtains a video provider. Enforces the token-spend rule
 * (spec §4): mock unless SEEDANCE_LIVE=1 + VIDEO_API_KEY + VIDEO_API_BASE_URL
 * are all set, and always mock under test/E2E — even when live is fully
 * configured, so a developer's .env.local can't turn a test run into billable calls.
 */
function liveConfigIfAllowed() {
  return isLiveBlockedEnvironment() ? null : getLiveConfig();
}

export function getVideoProvider(): VideoProvider {
  const live = liveConfigIfAllowed();
  return live ? new AiOpenPlatformProvider(live) : mockProvider;
}

export function isMockMode(): boolean {
  return liveConfigIfAllowed() === null;
}
