import type { campaigns, campaignclaims } from "@prisma/client";
import { formatDateOnly } from "./dates";

const UNKNOWN_BRAND = "Unknown Brand";
const UNKNOWN_CAMPAIGN = "Unknown Campaign";

/** response key === campaigns column name, raw passthrough (no array-field parsing, §0.4). */
const CAMPAIGN_PASSTHROUGH_FIELDS = [
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
] as const satisfies readonly (keyof campaigns)[];

/**
 * `campaign_brand_name` is NOT the same "Unknown Brand"-always fallback used by
 * `brandNameFor` (serialize.ts) — claim_service.py's `get_creator_campaign_claims` uses a
 * three-way rule: no brand_id -> "Unknown Brand"; brand_id set and BrandProfile found ->
 * real companyName; brand_id set but lookup comes back empty -> the literal
 * `f"Brand {brand_id}"` (NOT "Unknown Brand").
 */
function claimBrandName(brandId: string | null | undefined, names: Map<string, string>): string {
  if (!brandId) return UNKNOWN_BRAND;
  return names.get(brandId) ?? `Brand ${brandId}`;
}

/**
 * Field-for-field port of the `result_item` dict built by
 * `ClaimService.get_creator_campaign_claims` (backend/app/main/services/claim_service.py).
 *
 * `campaign` is `null` when the claim's `campaign_id` doesn't resolve to a row (an orphaned
 * claim) — Python's `campaign_data` is `{}` in that case, and `dict.get(key)` with no
 * default returns `None` for every key except `title` (defaults to "Unknown Campaign") and
 * `budget_unit` (defaults to "total"), which have explicit fallback args in the source.
 * Every other campaign_* field is `None`/null whether the campaign is missing entirely OR
 * present with that column genuinely null — Python's plain `.get(key)` can't tell those
 * apart either, so this mirrors it exactly rather than trying to distinguish them.
 */
export function serializeCreatorClaim(
  claim: campaignclaims,
  campaign: campaigns | null,
  brandNames: Map<string, string>
): Record<string, unknown> {
  const passthrough = Object.fromEntries(
    CAMPAIGN_PASSTHROUGH_FIELDS.map((field) => [field, campaign ? campaign[field] : null])
  );

  return {
    id: claim.id,
    // Python: `str(claim.get("campaign_id"))` — str(None) is the four-char string "None",
    // not JSON null. Unreachable through this domain's own write path (campaign_id is
    // required on create) but matched here for fidelity against pre-existing/orphaned rows.
    campaign_id: claim.campaign_id ?? "None",
    creator_id: claim.creator_id,
    status: claim.status,
    sample_text: claim.sample_text,
    sample_video_url: claim.sample_video_url,
    created_at: claim.created_at,
    campaign_title: campaign ? campaign.title : UNKNOWN_CAMPAIGN,
    campaign_brand_name: claimBrandName(campaign?.brand_id, brandNames),
    campaign_deadline: campaign ? formatDateOnly(campaign.deadline) : null,
    campaign_budget_range: campaign ? campaign.budget_range : null,
    campaign_budget_unit: campaign ? campaign.budget_unit : "total",
    campaign_brief: campaign ? campaign.brief : null,
    campaign_sample_video_url: campaign ? campaign.sample_video_url : null,
    ...passthrough,
  };
}
