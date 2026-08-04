/**
 * Write-side helpers shared by POST /api/brand/campaigns (create) and
 * PUT /api/brand/campaigns/[id] (update) — both map onto Python's single
 * `CampaignCreate` Pydantic model (`backend/app/main/models/campaign.py`), which both
 * `CampaignService.create_campaign` and `CampaignService.update_campaign`
 * (`backend/app/main/services/campaign_service.py`) apply identically before writing.
 */

import { dateOnlyStringToUtcDate, isValidCalendarDateOnly } from "./dates";

/**
 * Exact field set of Python's `CampaignCreate` (backend/app/main/models/campaign.py:51-90),
 * minus `brand_id`. `CampaignCreate.model_config = ConfigDict(extra="forbid")` — FastAPI
 * 422s any request body containing a key outside this set. `brand_id` is deliberately
 * excluded from the allowlist itself (not merely "allowed but ignored"): every caller of
 * `finalizeCampaignWriteData` resolves the real `brand_id` from the session-derived
 * `BrandProfile`, never from client input, and this function strips any client-supplied
 * `brand_id` unconditionally before the allowlist check even runs (see below) — so it can
 * never trip a false "unknown field" rejection, matching Python's actual behavior (Python
 * accepts `brand_id` as a known field and then ignores/overwrites its value; it does not
 * reject a request merely for including it).
 *
 * Field-by-field re-derivation from the Pydantic model (verified 2026-08-05, see
 * task-4e-report.md "Post-review fixes" for the full derivation table).
 */
export const CAMPAIGN_WRITABLE_FIELDS = [
  "title",
  "brief",
  "requirements",
  "budget_range",
  "budget_unit",
  "commission",
  "platform",
  "deadline",
  "max_creators",
  "is_open",
  "sample_video_url",
  "industry_category",
  "primary_promotion_objectives",
  "ad_placement",
  "campaign_execution_mode",
  "creator_profile_preferences_gender",
  "creator_profile_preference_ethnicity",
  "creator_profile_preference_content_niche",
  "preferred_creator_location",
  "language_requirement_for_creators",
  "creator_tier_requirement",
  "send_to_creator",
  "approved_by_brand",
  "kpi_reference_target",
  "prohibited_content_warnings",
  "posting_requirements",
  "product_photo",
  "script_required",
  "product_name",
  "product_highlight",
  "product_price",
  "product_sold_number",
  "paid_promotion_type",
  "video_buyout_budget_range",
  "base_fee_budget_range",
] as const;

const WRITABLE_FIELD_SET: ReadonlySet<string> = new Set(CAMPAIGN_WRITABLE_FIELDS);

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
 * Mirrors: `{k: v for k, v in campaign_data.items() if v is not None and v != ""}`.
 * Note Python's `v is not None` keeps `False`/`0` — only `None` and the exact empty string
 * `""` are dropped. `brand_id` used to be excluded here via a caller-supplied `excludeKeys`
 * list; it is now stripped unconditionally, earlier in `finalizeCampaignWriteData`'s
 * pipeline (see `CAMPAIGN_WRITABLE_FIELDS`), so that escape hatch had no remaining callers
 * and was removed rather than kept unused.
 */
export function stripEmptyAndNull(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(
      ([, value]) => value !== null && value !== undefined && value !== ""
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

export type CampaignWriteOutcome =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; kind: "unknown_fields"; fields: string[] }
  | { ok: false; kind: "missing_title" }
  | { ok: false; kind: "invalid_deadline"; value: string };

/**
 * Full write-boundary pipeline for a normalized campaign payload, in the same order Python
 * validates/applies it:
 *
 *  1. Strip a client-supplied `brand_id` unconditionally (never trusted — see the allowlist
 *     doc comment above).
 *  2. Reject any remaining key outside `CAMPAIGN_WRITABLE_FIELDS` — mirrors `CampaignCreate`'s
 *     `extra="forbid"` (Pydantic 422). Returned as a structured outcome rather than silently
 *     stripped, so a caller (any route) can produce a real 422 instead of letting an
 *     unbounded write reach Prisma — `campaignsUpdateInput` has no field-level ACL of its
 *     own, so this is the only enforcement point (CRITICAL fix, see task-4e-report.md
 *     "Post-review fixes").
 *  3. Reject a missing/empty `title` — `CampaignCreate.title: str` has no default, so Pydantic
 *     422s a request that omits it; this applies to both create AND update (Python reuses
 *     the same model for `PUT`, which is full-resource-replacement semantics, not partial
 *     PATCH).
 *  4. Pydantic defaults -> array-field `JSON.stringify` -> strip null/empty.
 *  5. If a `deadline` string survives, validate it is genuinely a real calendar date in
 *     "YYYY-MM-DD" shape (`isValidCalendarDateOnly` — format AND calendar validity, not the
 *     shape-only `isDateOnlyString`) before converting to a UTC `Date` for Prisma. A
 *     shape-only check is not enough: `new Date("2026-02-30T00:00:00.000Z")` does not throw,
 *     it silently rolls over to March 2 — so a shape-only guard would let
 *     `deadline: "2026-02-30"` write the wrong date and return 200 instead of erroring, and
 *     a value like `"2026-13-01"` (matching \d{4}-\d{2}-\d{2} but not a real month) would
 *     still produce an Invalid Date that reaches Prisma as a generic throw — exactly the
 *     failure mode this guard exists to close.
 */
export function finalizeCampaignWriteData(data: Record<string, unknown>): CampaignWriteOutcome {
  const { brand_id: _clientSuppliedBrandId, ...withoutBrandId } = data;

  const unknownFields = Object.keys(withoutBrandId).filter((key) => !WRITABLE_FIELD_SET.has(key));
  if (unknownFields.length > 0) {
    return { ok: false, kind: "unknown_fields", fields: unknownFields };
  }

  if (typeof withoutBrandId.title !== "string" || withoutBrandId.title === "") {
    return { ok: false, kind: "missing_title" };
  }

  const defaulted = applyCampaignCreateDefaults(withoutBrandId);
  const stringified = stringifyArrayFields(defaulted);
  const stripped = stripEmptyAndNull(stringified);

  if (typeof stripped.deadline === "string") {
    if (!isValidCalendarDateOnly(stripped.deadline)) {
      return { ok: false, kind: "invalid_deadline", value: stripped.deadline };
    }
    stripped.deadline = dateOnlyStringToUtcDate(stripped.deadline);
  }

  return { ok: true, data: stripped };
}

/**
 * Maps a `finalizeCampaignWriteData` failure onto an HTTP status + body. Shared by both
 * POST /api/brand/campaigns and PUT /api/brand/campaigns/[id] so the two routes stay
 * consistent. `action` only changes the human-readable message, matching each route's own
 * pre-existing "Failed to create/update campaign" wording.
 */
export function campaignWriteErrorResponse(
  outcome: Extract<CampaignWriteOutcome, { ok: false }>,
  action: "create" | "update"
): { status: number; body: Record<string, unknown> } {
  if (outcome.kind === "invalid_deadline") {
    return { status: 400, body: { error: "Invalid campaign deadline format" } };
  }
  if (outcome.kind === "missing_title") {
    return {
      status: 422,
      body: {
        error: `Failed to ${action} campaign`,
        details: { message: "title is required", field: "title" },
      },
    };
  }
  return {
    status: 422,
    body: {
      error: `Failed to ${action} campaign`,
      details: {
        message: `Unexpected field(s): ${outcome.fields.join(", ")}`,
        fields: outcome.fields,
      },
    },
  };
}
