/**
 * Configuration for the AI Open Platform video API (Seedance).
 * See docs/superpowers/specs/2026-10-05-seedance-video-generation-design.md §3, §9.
 *
 * VIDEO_API_BASE_URL has no default on purpose: the real base URL comes from the
 * provider console, and nothing may reach the provider by accident.
 */

export const SEEDANCE_MODES = ["fast", "pro", "mini", "seedance2.5"] as const;
export type SeedanceMode = (typeof SEEDANCE_MODES)[number];

const DEFAULT_DAILY_LIMIT = 5;

export const CREATE_PATH = "/ai-open-platform-api/v1/lz/video/task/create";
export const STATUS_PATH = "/ai-open-platform-api/v1/lz/video/task/status";

/** Minimum the provider allows; a stuck task fails within an hour, uncharged. */
export const EXECUTION_EXPIRES_AFTER_SECONDS = 3600;

export function getDailyLimit(): number {
  const parsed = Number.parseInt(process.env.AI_VIDEO_DAILY_LIMIT ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DAILY_LIMIT;
}

export interface LiveConfig {
  baseUrl: string;
  apiKey: string;
}

/** Live calls need all three: the explicit switch, the key and the base URL. */
export function getLiveConfig(): LiveConfig | null {
  const baseUrl = process.env.VIDEO_API_BASE_URL?.trim();
  const apiKey = process.env.VIDEO_API_KEY?.trim();
  if (process.env.SEEDANCE_LIVE !== "1" || !baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

/** Environments where a billable call must never happen, whatever the config says. */
export function isLiveBlockedEnvironment(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.E2E_EXPLORE === "1" ||
    process.env.E2E_AGENT === "1"
  );
}
