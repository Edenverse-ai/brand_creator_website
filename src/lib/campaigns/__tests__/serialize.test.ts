import { describe, it, expect } from "vitest";
import type { campaigns, campaignclaims, CreatorProfile } from "@prisma/client";
import {
  brandNameFor,
  baseCampaignJson,
  serializePublicCampaign,
  serializeBrandCampaign,
  buildListApplication,
  buildSingularApplication,
} from "../serialize";

function makeCampaign(overrides: Partial<campaigns> = {}): campaigns {
  return {
    id: "campaign-1",
    brand_id: "brand-1",
    title: "Test Campaign",
    brief: null,
    requirements: null,
    budget_range: null,
    commission: null,
    platform: null,
    deadline: new Date("2026-12-31T00:00:00.000Z"),
    max_creators: 10,
    is_open: true,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    budget_unit: "total",
    sample_video_url: null,
    industry_category: null,
    primary_promotion_objectives: '["awareness"]',
    ad_placement: "disable",
    campaign_execution_mode: "direct",
    creator_profile_preferences_gender: null,
    creator_profile_preference_ethnicity: null,
    creator_profile_preference_content_niche: null,
    preferred_creator_location: null,
    language_requirement_for_creators: "english",
    creator_tier_requirement: null,
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
    sample_text: null,
    sample_video_url: null,
    created_at: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

function makeCreator(overrides: Partial<CreatorProfile> = {}): CreatorProfile {
  return {
    id: "creator-1",
    userId: "user-1",
    bio: null,
    location: null,
    website: null,
    categories: "[]",
    followers: 0,
    engagementRate: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    phone: null,
    platforms: null,
    profile_image: null,
    ...overrides,
  };
}

describe("brandNameFor", () => {
  it("returns 'Unknown Brand' when brandId is null/undefined", () => {
    expect(brandNameFor(null, new Map())).toBe("Unknown Brand");
    expect(brandNameFor(undefined, new Map())).toBe("Unknown Brand");
  });

  it("returns the resolved company name when present in the map", () => {
    const names = new Map([["brand-1", "Acme Inc"]]);
    expect(brandNameFor("brand-1", names)).toBe("Acme Inc");
  });

  it("returns 'Unknown Brand' when brandId is set but not found in the map", () => {
    expect(brandNameFor("missing-brand", new Map())).toBe("Unknown Brand");
  });
});

describe("baseCampaignJson / serializePublicCampaign", () => {
  it("formats deadline to YYYY-MM-DD and passes every other column through, including unmodeled columns", () => {
    const campaign = makeCampaign({ follower_requirement: "1k-10k", order_requirement: "10-50" });
    const result = baseCampaignJson(campaign);

    expect(result.deadline).toBe("2026-12-31");
    expect(result.follower_requirement).toBe("1k-10k");
    expect(result.order_requirement).toBe("10-50");
    // array-typed field must stay a raw JSON-encoded string, never parsed (§0.4)
    expect(result.primary_promotion_objectives).toBe('["awareness"]');
  });

  it("serializePublicCampaign adds brand_name and nothing else", () => {
    const campaign = makeCampaign();
    const result = serializePublicCampaign(campaign, "Acme Inc");
    expect(result.brand_name).toBe("Acme Inc");
    expect(result).not.toHaveProperty("applications");
    expect(result).not.toHaveProperty("brand");
  });

  it("keeps deadline null when the campaign has no deadline", () => {
    const campaign = makeCampaign({ deadline: null });
    const result = serializePublicCampaign(campaign, "Acme Inc");
    expect(result.deadline).toBeNull();
  });
});

describe("serializeBrandCampaign", () => {
  it("always sets brand_name to null (brand_service.py never sets it) even though brand_name is provided elsewhere", () => {
    const campaign = makeCampaign();
    const result = serializeBrandCampaign(campaign, [], null);
    expect(result.brand_name).toBeNull();
  });

  it("includes applications (even empty) and brand (even null) as present keys, not omitted", () => {
    const campaign = makeCampaign();
    const result = serializeBrandCampaign(campaign, [], null);
    expect(result).toHaveProperty("applications", []);
    expect(result).toHaveProperty("brand", null);
  });

  it("carries through the applications array and brand object as given", () => {
    const campaign = makeCampaign();
    const apps = [{ id: "claim-1" }];
    const brand = { id: "brand-1", companyName: "Acme Inc" } as never;
    const result = serializeBrandCampaign(campaign, apps, brand);
    expect(result.applications).toBe(apps);
    expect(result.brand).toBe(brand);
  });
});

describe("buildListApplication", () => {
  it("attaches a raw creator row when creator_id resolves", () => {
    const claim = makeClaim();
    const creator = makeCreator();
    const result = buildListApplication(claim, new Map([["creator-1", creator]]));
    expect(result.creator).toBe(creator);
    expect(result.id).toBe("claim-1");
  });

  it("sets creator to null (a present key, not omitted) when creator_id does not resolve", () => {
    // CampaignApplication.creator: dict | None = None (models/campaign.py:104) is a declared
    // field — FastAPI's response_model serializes it as a literal null, the same
    // present-as-null rule already applied to brand_name.
    const claim = makeClaim({ creator_id: "missing-creator" });
    const result = buildListApplication(claim, new Map());
    expect("creator" in result).toBe(true);
    expect(result.creator).toBeNull();
  });

  it("sets creator to null when creator_id is null", () => {
    const claim = makeClaim({ creator_id: null });
    const result = buildListApplication(claim, new Map());
    expect(result.creator).toBeNull();
  });

  it("never enriches with username/email/image at list level", () => {
    const claim = makeClaim();
    const creator = makeCreator();
    const result = buildListApplication(claim, new Map([["creator-1", creator]]));
    expect(result.creator).not.toHaveProperty("username");
    expect(result.creator).not.toHaveProperty("email");
    expect(result.creator).not.toHaveProperty("user");
  });
});

describe("buildSingularApplication", () => {
  it("enriches creator with username/email/image/user when the User row resolves", () => {
    const claim = makeClaim();
    const creator = makeCreator();
    const users = new Map([
      ["user-1", { id: "user-1", name: "Jane", email: "jane@x.com", image: "pic.jpg" }],
    ]);
    const result = buildSingularApplication(claim, new Map([["creator-1", creator]]), users);

    expect(result.creator).toMatchObject({
      id: "creator-1",
      username: "Jane",
      email: "jane@x.com",
      image: "pic.jpg",
      user: { id: "user-1", name: "Jane", email: "jane@x.com", image: "pic.jpg" },
    });
  });

  it("returns the raw creator row without enrichment fields when the User lookup fails", () => {
    const claim = makeClaim();
    const creator = makeCreator();
    const result = buildSingularApplication(claim, new Map([["creator-1", creator]]), new Map());

    expect(result.creator).toEqual(creator);
    expect(result.creator).not.toHaveProperty("username");
    expect(result.creator).not.toHaveProperty("user");
  });

  it("sets creator to null (a present key, not omitted) when creator_id does not resolve to a CreatorProfile", () => {
    const claim = makeClaim({ creator_id: "missing" });
    const result = buildSingularApplication(claim, new Map(), new Map());
    expect("creator" in result).toBe(true);
    expect(result.creator).toBeNull();
  });
});
