import { describe, it, expect } from "vitest";
import type { campaigns, campaignclaims } from "@prisma/client";
import { serializeCreatorClaim } from "../claims";

function makeCampaign(overrides: Partial<campaigns> = {}): campaigns {
  return {
    id: "campaign-1",
    brand_id: "brand-1",
    title: "Test Campaign",
    brief: "A great campaign",
    requirements: null,
    budget_range: "$500-1000",
    commission: null,
    platform: null,
    deadline: new Date("2026-12-31T00:00:00.000Z"),
    max_creators: 10,
    is_open: true,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    budget_unit: "per_video",
    sample_video_url: "https://example.com/sample.mp4",
    industry_category: "beauty",
    primary_promotion_objectives: '["awareness"]',
    ad_placement: "disable",
    campaign_execution_mode: "direct",
    creator_profile_preferences_gender: null,
    creator_profile_preference_ethnicity: null,
    creator_profile_preference_content_niche: null,
    preferred_creator_location: null,
    language_requirement_for_creators: "english",
    creator_tier_requirement: '["nano"]',
    send_to_creator: "yes",
    approved_by_brand: "yes",
    kpi_reference_target: null,
    prohibited_content_warnings: null,
    product_photo: null,
    posting_requirements: null,
    script_required: "no",
    product_highlight: null,
    product_price: null,
    product_sold_number: null,
    paid_promotion_type: "commission_based",
    video_buyout_budget_range: null,
    base_fee_budget_range: null,
    follower_requirement: null,
    order_requirement: null,
    product_name: null,
    updated_at: null,
    ...overrides,
  };
}

function makeClaim(overrides: Partial<campaignclaims> = {}): campaignclaims {
  return {
    id: "claim-1",
    campaign_id: "campaign-1",
    creator_id: "creator-1",
    status: "pending",
    sample_text: "sample",
    sample_video_url: null,
    created_at: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

describe("serializeCreatorClaim", () => {
  it("formats campaign_deadline to YYYY-MM-DD (the same deadline hazard, nested under campaign_*)", () => {
    const result = serializeCreatorClaim(makeClaim(), makeCampaign(), new Map());
    expect(result.campaign_deadline).toBe("2026-12-31");
  });

  it("passes array-typed fields through as raw JSON-encoded strings, never parsed (§0.4)", () => {
    const result = serializeCreatorClaim(makeClaim(), makeCampaign(), new Map());
    expect(result.primary_promotion_objectives).toBe('["awareness"]');
    expect(result.creator_tier_requirement).toBe('["nano"]');
  });

  it("resolves campaign_brand_name from the brand names map when the campaign has a brand_id", () => {
    const names = new Map([["brand-1", "Acme Inc"]]);
    const result = serializeCreatorClaim(makeClaim(), makeCampaign(), names);
    expect(result.campaign_brand_name).toBe("Acme Inc");
  });

  it("falls back to 'Brand {id}' (not 'Unknown Brand') when brand_id is set but not found in the map", () => {
    const result = serializeCreatorClaim(
      makeClaim(),
      makeCampaign({ brand_id: "orphan-brand" }),
      new Map()
    );
    expect(result.campaign_brand_name).toBe("Brand orphan-brand");
  });

  it("falls back to 'Unknown Brand' when the campaign has no brand_id", () => {
    const result = serializeCreatorClaim(makeClaim(), makeCampaign({ brand_id: null }), new Map());
    expect(result.campaign_brand_name).toBe("Unknown Brand");
  });

  it("maps every claim-level field", () => {
    const claim = makeClaim();
    const result = serializeCreatorClaim(claim, makeCampaign(), new Map());
    expect(result).toMatchObject({
      id: "claim-1",
      campaign_id: "campaign-1",
      creator_id: "creator-1",
      status: "pending",
      sample_text: "sample",
      sample_video_url: null,
      created_at: claim.created_at,
    });
  });

  it('stringifies a null campaign_id to the literal "None" (mirrors Python str(None))', () => {
    const result = serializeCreatorClaim(
      makeClaim({ campaign_id: null }),
      makeCampaign(),
      new Map()
    );
    expect(result.campaign_id).toBe("None");
  });

  describe("when the claim's campaign_id does not resolve to a row (orphaned claim)", () => {
    it("defaults campaign_title to 'Unknown Campaign'", () => {
      const result = serializeCreatorClaim(makeClaim(), null, new Map());
      expect(result.campaign_title).toBe("Unknown Campaign");
    });

    it("defaults campaign_budget_unit to 'total' (the one field with its own dict.get default)", () => {
      const result = serializeCreatorClaim(makeClaim(), null, new Map());
      expect(result.campaign_budget_unit).toBe("total");
    });

    it("defaults campaign_brand_name to 'Unknown Brand' (no brand lookup attempted)", () => {
      const result = serializeCreatorClaim(makeClaim(), null, new Map());
      expect(result.campaign_brand_name).toBe("Unknown Brand");
    });

    it("nulls out every other campaign_* and passthrough field", () => {
      const result = serializeCreatorClaim(makeClaim(), null, new Map());
      expect(result.campaign_deadline).toBeNull();
      expect(result.campaign_budget_range).toBeNull();
      expect(result.campaign_brief).toBeNull();
      expect(result.campaign_sample_video_url).toBeNull();
      expect(result.industry_category).toBeNull();
      expect(result.primary_promotion_objectives).toBeNull();
      expect(result.script_required).toBeNull();
      expect(result.base_fee_budget_range).toBeNull();
    });
  });

  it("returns the full documented key set (38 keys)", () => {
    const result = serializeCreatorClaim(makeClaim(), makeCampaign(), new Map());
    expect(Object.keys(result).sort()).toEqual(
      [
        "id",
        "campaign_id",
        "creator_id",
        "status",
        "sample_text",
        "sample_video_url",
        "created_at",
        "campaign_title",
        "campaign_brand_name",
        "campaign_deadline",
        "campaign_budget_range",
        "campaign_budget_unit",
        "campaign_brief",
        "campaign_sample_video_url",
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
      ].sort()
    );
  });
});
