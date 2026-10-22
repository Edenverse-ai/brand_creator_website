import { getDailyLimit } from "@/lib/seedance/config";
import { replicateLimitsFor, type ReplicateMode } from "@/lib/seedance/models";

/**
 * What a creator may generate per UTC day, by tool. There is no paid tier yet:
 * everyone is on the free tier except emails listed in AI_VIDEO_UNLIMITED_EMAILS
 * (comma-separated, case-insensitive), which get unlimited generations and the
 * longest trend-replicate source videos the models accept. A paid tier would be
 * one more `AiVideoEntitlements` value.
 *
 * Pure (reads env only), so routes and server components can call it with the
 * session email without a database round trip.
 */

export const REPLICATE_FREE_DAILY_LIMIT = 1;
export const REPLICATE_FREE_MAX_SOURCE_SEC = 15;
export const REPLICATE_UNLIMITED_MAX_SOURCE_SEC = 30;

export type AiVideoEntitlements = {
  /** null = unlimited. */
  generate: { dailyLimit: number | null };
  replicate: { dailyLimit: number | null; maxSourceSec: number };
};

export function isUnlimitedEmail(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return (process.env.AI_VIDEO_UNLIMITED_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .some((entry) => entry === normalized);
}

export function getEntitlements(email: string | null | undefined): AiVideoEntitlements {
  if (isUnlimitedEmail(email)) {
    return {
      generate: { dailyLimit: null },
      replicate: { dailyLimit: null, maxSourceSec: REPLICATE_UNLIMITED_MAX_SOURCE_SEC },
    };
  }
  return {
    generate: { dailyLimit: getDailyLimit() },
    replicate: {
      dailyLimit: REPLICATE_FREE_DAILY_LIMIT,
      maxSourceSec: REPLICATE_FREE_MAX_SOURCE_SEC,
    },
  };
}

/**
 * Longest source video a replicate may use: the tier's ceiling, but never longer
 * than the model can generate (the output follows the source's length).
 */
export function replicateSourceCeiling(maxSourceSec: number, mode: ReplicateMode): number {
  return Math.min(maxSourceSec, replicateLimitsFor(mode).maxDuration);
}
