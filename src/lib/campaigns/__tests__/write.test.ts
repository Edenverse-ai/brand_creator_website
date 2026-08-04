import { describe, it, expect } from "vitest";
import {
  applyCampaignCreateDefaults,
  stringifyArrayFields,
  stripEmptyAndNull,
  combineTierRequirement,
  finalizeCampaignWriteData,
} from "../write";

describe("applyCampaignCreateDefaults", () => {
  it("fills every CampaignCreate default when the field is absent (undefined)", () => {
    const result = applyCampaignCreateDefaults({ title: "Campaign" });
    expect(result).toMatchObject({
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
    });
  });

  it("does not override an explicit null (Pydantic only defaults an absent key, not an explicit null)", () => {
    const result = applyCampaignCreateDefaults({ script_required: null, is_open: null });
    expect(result.script_required).toBeNull();
    expect(result.is_open).toBeNull();
  });

  it("does not override a value the caller already supplied", () => {
    const result = applyCampaignCreateDefaults({
      budget_unit: "per_video",
      max_creators: 5,
      is_open: false,
    });
    expect(result.budget_unit).toBe("per_video");
    expect(result.max_creators).toBe(5);
    expect(result.is_open).toBe(false);
  });

  it("leaves fields with no Pydantic default (e.g. deadline, industry_category) untouched", () => {
    const result = applyCampaignCreateDefaults({});
    expect(result.deadline).toBeUndefined();
    expect(result.industry_category).toBeUndefined();
  });
});

describe("stringifyArrayFields", () => {
  it("JSON.stringifies every declared array field that is a real array", () => {
    const result = stringifyArrayFields({
      primary_promotion_objectives: ["brand_awareness", "sales"],
      creator_tier_requirement: ["nano", "micro"],
      platform: "tiktok",
    });
    expect(result.primary_promotion_objectives).toBe('["brand_awareness","sales"]');
    expect(result.creator_tier_requirement).toBe('["nano","micro"]');
    expect(result.platform).toBe("tiktok");
  });

  it("leaves a non-array value (already a string) untouched", () => {
    const result = stringifyArrayFields({ preferred_creator_location: "US only" });
    expect(result.preferred_creator_location).toBe("US only");
  });

  it("leaves null/undefined array fields untouched", () => {
    const result = stringifyArrayFields({ creator_tier_requirement: null });
    expect(result.creator_tier_requirement).toBeNull();
  });
});

describe("stripEmptyAndNull", () => {
  it("drops null, undefined, and empty-string values", () => {
    const result = stripEmptyAndNull({ a: null, b: undefined, c: "", d: "kept" });
    expect(result).toEqual({ d: "kept" });
  });

  it("keeps false and 0 (Python's `v is not None` survives falsy-but-defined values)", () => {
    const result = stripEmptyAndNull({ is_open: false, max_creators: 0 });
    expect(result).toEqual({ is_open: false, max_creators: 0 });
  });

  it("drops explicitly excluded keys regardless of value", () => {
    const result = stripEmptyAndNull({ brand_id: "some-brand-id", title: "Campaign" }, [
      "brand_id",
    ]);
    expect(result).toEqual({ title: "Campaign" });
  });
});

describe("combineTierRequirement", () => {
  it("keeps an existing non-empty array as-is", () => {
    expect(combineTierRequirement(["nano", "micro"], null, null)).toEqual(["nano", "micro"]);
  });

  it("ignores an existing empty array and falls through to follower/order", () => {
    expect(combineTierRequirement([], "1k-10k", "10-50")).toEqual(["1k-10k; 10-50"]);
  });

  it("joins follower and order requirement with '; ' when both are present", () => {
    expect(combineTierRequirement(undefined, "1k-10k", "10-50")).toEqual(["1k-10k; 10-50"]);
  });

  it("uses only follower requirement when order is absent", () => {
    expect(combineTierRequirement(undefined, "1k-10k", undefined)).toEqual(["1k-10k"]);
  });

  it("uses only order requirement when follower is absent", () => {
    expect(combineTierRequirement(undefined, undefined, "10-50")).toEqual(["10-50"]);
  });

  it("returns undefined when nothing is provided", () => {
    expect(combineTierRequirement(undefined, undefined, undefined)).toBeUndefined();
    expect(combineTierRequirement(null, "", "")).toBeUndefined();
  });

  it("ignores a non-array creator_tier_requirement (e.g. a raw string) for the array check", () => {
    expect(combineTierRequirement("nano", undefined, undefined)).toBeUndefined();
  });
});

describe("finalizeCampaignWriteData (full write pipeline)", () => {
  it("applies defaults, stringifies arrays, strips empties, and converts deadline to a UTC Date", () => {
    const result = finalizeCampaignWriteData({
      title: "Campaign",
      deadline: "2026-12-31",
      brief: "",
      creator_tier_requirement: ["nano", "micro"],
    });

    expect(result.title).toBe("Campaign");
    expect(result.deadline).toEqual(new Date("2026-12-31T00:00:00.000Z"));
    expect(result.brief).toBeUndefined(); // stripped: empty string
    expect(result.creator_tier_requirement).toBe('["nano","micro"]');
    expect(result.budget_unit).toBe("total"); // default applied
  });

  it("excludes brand_id when passed in excludeKeys (update path)", () => {
    const result = finalizeCampaignWriteData({ title: "Campaign", brand_id: "someone-elses-id" }, [
      "brand_id",
    ]);
    expect(result.brand_id).toBeUndefined();
  });

  it("omits deadline entirely when not supplied (never invents a Date)", () => {
    const result = finalizeCampaignWriteData({ title: "Campaign" });
    expect("deadline" in result).toBe(false);
  });
});
