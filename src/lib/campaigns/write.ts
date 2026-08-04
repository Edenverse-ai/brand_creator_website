/**
 * Write-side helpers shared by POST /api/brand/campaigns (create) and
 * PUT /api/brand/campaigns/[id] (update) — both map onto Python's single
 * `CampaignCreate` Pydantic model (`backend/app/main/models/campaign.py`), which both
 * `CampaignService.create_campaign` and `CampaignService.update_campaign`
 * (`backend/app/main/services/campaign_service.py`) apply identically before writing.
 */

import { dateOnlyStringToUtcDate } from "./dates";

/**
 * Fields with a non-null Pydantic default on `CampaignCreate`. Pydantic only substitutes a
 * declared default when the key is *absent* from the input entirely — an explicit `null`
 * for the same key is respected as-is, not replaced. Applied here the same way: only fills
 * in when the current value is `undefined` (never overrides an explicit `null`).
 *
 * `max_creators`/`is_open` are included because Prisma's own column defaults
 * (`@default(10)` / `@default(true)`) only apply on `create`, never on `update` — Python's
 * behavior here is actually stronger: an update that omits these fields re-applies the
 * Pydantic default and *writes* it (since a non-null/non-empty value survives the
 * strip-empty step below), which can clobber an existing value. That is preserved
 * deliberately, not "fixed" — see phase-4-port-reference.md §6.4.
 */
const CAMPAIGN_CREATE_DEFAULTS: Record<string, unknown> = {
  budget_unit: "total",
  max_creators: 10,
  is_open: true,
  ad_placement: "disable",
  campaign_execution_mode: "direct",
  language_requirement_for_creators: "english",
  send_to_creator: "yes",
  approved_by_brand: "yes",
  script_required: "no",
  paid_promotion_type: "commission_based",
};

export function applyCampaignCreateDefaults(
  data: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...data };
  for (const [key, defaultValue] of Object.entries(CAMPAIGN_CREATE_DEFAULTS)) {
    if (result[key] === undefined) {
      result[key] = defaultValue;
    }
  }
  return result;
}

/**
 * List-typed fields stored as `json.dumps(...)` text (campaign_service.py `array_fields`,
 * both create and update). Deliberately NOT parsed back out on read anywhere in this
 * domain — see phase-4-port-reference.md §0.4 and src/lib/campaigns/serialize.ts.
 */
export const CAMPAIGN_ARRAY_FIELDS = [
  "primary_promotion_objectives",
  "creator_profile_preferences_gender",
  "creator_profile_preference_ethnicity",
  "creator_profile_preference_content_niche",
  "preferred_creator_location",
  "creator_tier_requirement",
] as const;

/** Mirrors: `for field in array_fields: if isinstance(v, list): v = json.dumps(v)`. */
export function stringifyArrayFields(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };
  for (const field of CAMPAIGN_ARRAY_FIELDS) {
    if (Array.isArray(result[field])) {
      result[field] = JSON.stringify(result[field]);
    }
  }
  return result;
}

/**
 * Mirrors: `{k: v for k, v in campaign_data.items() if v is not None and v != ""}`
 * (plus `k != "brand_id"` on update only, passed via `excludeKeys`). Note Python's `v is
 * not None` keeps `False`/`0` — only `None` and the exact empty string `""` are dropped.
 */
export function stripEmptyAndNull(
  data: Record<string, unknown>,
  excludeKeys: readonly string[] = []
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(
      ([key, value]) =>
        value !== null && value !== undefined && value !== "" && !excludeKeys.includes(key)
    )
  );
}

/**
 * Folds `follower_requirement`/`order_requirement` into `creator_tier_requirement` the same
 * way both `brand/campaigns/route.ts` (create, both its multipart and JSON branches) and
 * `brand/campaigns/[id]/route.ts` (update) already do client-side today, since Python's
 * `CampaignCreate` has no columns for `follower_requirement`/`order_requirement` at all
 * (phase-4-port-reference.md §1.3.3) — this is lossy but is the live, frozen behavior; a
 * porter with direct Prisma access could write these to their own real (unused-by-Python)
 * `campaigns.follower_requirement`/`order_requirement` columns instead, but that would be a
 * deliberate contract change, not a port, so it is not done here.
 *
 * Returns the array to use for `creator_tier_requirement`, or `undefined` if neither an
 * existing non-empty array nor a follower/order value was supplied — callers each decide
 * what "undefined" means for their own route (see the create vs. update call sites, which
 * diverge: create deletes the key, update leaves whatever the client originally sent).
 */
export function combineTierRequirement(
  creatorTierRequirement: unknown,
  followerRequirement: unknown,
  orderRequirement: unknown
): string[] | undefined {
  if (Array.isArray(creatorTierRequirement) && creatorTierRequirement.length > 0) {
    return creatorTierRequirement as string[];
  }
  const follower = typeof followerRequirement === "string" ? followerRequirement : "";
  const order = typeof orderRequirement === "string" ? orderRequirement : "";
  if (follower || order) {
    return [[follower, order].filter(Boolean).join("; ")];
  }
  return undefined;
}

/**
 * Full write-boundary pipeline for a normalized campaign payload, in the same order Python
 * applies it: Pydantic defaults -> array-field JSON.stringify -> strip null/empty (and
 * `brand_id` on update) -> convert a surviving `deadline` string to a UTC Date for Prisma
 * (the deadline hazard, dates.ts). `excludeKeys` should be `["brand_id"]` for update calls
 * only (campaign_service.py's `update_campaign` explicitly strips `brand_id` before writing
 * — ownership is enforced by the WHERE clause, not by trusting a client-supplied brand_id).
 */
export function finalizeCampaignWriteData(
  data: Record<string, unknown>,
  excludeKeys: readonly string[] = []
): Record<string, unknown> {
  const defaulted = applyCampaignCreateDefaults(data);
  const stringified = stringifyArrayFields(defaulted);
  const stripped = stripEmptyAndNull(stringified, excludeKeys);
  if (typeof stripped.deadline === "string") {
    stripped.deadline = dateOnlyStringToUtcDate(stripped.deadline);
  }
  return stripped;
}
