import { describe, it, expect } from "vitest";
import {
  applyCampaignCreateDefaults,
  stringifyArrayFields,
  stripEmptyAndNull,
  combineTierRequirement,
  finalizeCampaignWriteData,
  campaignWriteErrorResponse,
  CAMPAIGN_WRITABLE_FIELDS,
} from "../write";
import type { CampaignWriteOutcome } from "../write";

function expectOk(outcome: CampaignWriteOutcome): Record<string, unknown> {
  if (!outcome.ok) throw new Error(`expected ok, got failure: ${JSON.stringify(outcome)}`);
  return outcome.data;
}

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

describe("CAMPAIGN_WRITABLE_FIELDS", () => {
  it("has exactly 35 fields — every CampaignCreate field except brand_id (models/campaign.py:51-90)", () => {
    expect(CAMPAIGN_WRITABLE_FIELDS).toHaveLength(35);
    expect(CAMPAIGN_WRITABLE_FIELDS).not.toContain("brand_id");
    expect(CAMPAIGN_WRITABLE_FIELDS).toContain("title");
    expect(CAMPAIGN_WRITABLE_FIELDS).toContain("base_fee_budget_range");
  });
});

describe("finalizeCampaignWriteData (full write pipeline)", () => {
  it("applies defaults, stringifies arrays, strips empties, and converts deadline to a UTC Date", () => {
    const result = expectOk(
      finalizeCampaignWriteData({
        title: "Campaign",
        deadline: "2026-12-31",
        brief: "",
        creator_tier_requirement: ["nano", "micro"],
      })
    );

    expect(result.title).toBe("Campaign");
    expect(result.deadline).toEqual(new Date("2026-12-31T00:00:00.000Z"));
    expect(result.brief).toBeUndefined(); // stripped: empty string
    expect(result.creator_tier_requirement).toBe('["nano","micro"]');
    expect(result.budget_unit).toBe("total"); // default applied
  });

  it("omits deadline entirely when not supplied (never invents a Date)", () => {
    const result = expectOk(finalizeCampaignWriteData({ title: "Campaign" }));
    expect("deadline" in result).toBe(false);
  });

  describe("brand_id handling (CRITICAL fix)", () => {
    it("always strips a client-supplied brand_id, even without being told to exclude it", () => {
      const result = expectOk(
        finalizeCampaignWriteData({ title: "Campaign", brand_id: "someone-elses-id" })
      );
      expect(result.brand_id).toBeUndefined();
    });

    it("does not treat brand_id's presence as an unknown field (Python accepts it as a known, if overridden, field)", () => {
      const outcome = finalizeCampaignWriteData({ title: "Campaign", brand_id: "x" });
      expect(outcome.ok).toBe(true);
    });
  });

  describe("unknown-field rejection (CRITICAL fix — was previously unbounded)", () => {
    it("rejects a request that tries to overwrite the primary key", () => {
      const outcome = finalizeCampaignWriteData({
        title: "Anything",
        id: "00000000-0000-4000-8000-000000000001",
      });
      expect(outcome).toEqual({ ok: false, kind: "unknown_fields", fields: ["id"] });
    });

    it("rejects a request that tries to forge created_at", () => {
      const outcome = finalizeCampaignWriteData({
        title: "x",
        created_at: "1970-01-01T00:00:00.000Z",
      });
      expect(outcome).toEqual({
        ok: false,
        kind: "unknown_fields",
        fields: ["created_at"],
      });
    });

    it("rejects non-column keys sent by the brandportal edit form (product_photo_url, budgetUnit)", () => {
      // src/app/brandportal/campaigns/[id]/edit/page.tsx spreads its whole form state into
      // the PUT body, including product_photo_url and budgetUnit — neither is a `campaigns`
      // column (the real column names are product_photo and budget_unit). This already 422'd
      // against the real Python backend (CampaignCreate is extra="forbid"); this allowlist
      // reproduces a clean 422 here too instead of letting it reach Prisma.
      const outcome = finalizeCampaignWriteData({
        title: "Campaign",
        product_photo_url: "https://example.com/photo.jpg",
        budgetUnit: "total",
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok && outcome.kind === "unknown_fields") {
        expect(outcome.fields.sort()).toEqual(["budgetUnit", "product_photo_url"]);
      }
    });

    it("lists every offending key when multiple are present", () => {
      const outcome = finalizeCampaignWriteData({ title: "x", foo: 1, bar: 2 });
      expect(outcome).toEqual({ ok: false, kind: "unknown_fields", fields: ["foo", "bar"] });
    });

    it("accepts a payload containing only allowlisted fields", () => {
      const outcome = finalizeCampaignWriteData({ title: "Campaign", brief: "A brief" });
      expect(outcome.ok).toBe(true);
    });
  });

  describe("missing-title rejection", () => {
    it("rejects a payload with no title", () => {
      const outcome = finalizeCampaignWriteData({ brief: "no title" });
      expect(outcome).toEqual({ ok: false, kind: "missing_title" });
    });

    it("rejects an empty-string title", () => {
      const outcome = finalizeCampaignWriteData({ title: "" });
      expect(outcome).toEqual({ ok: false, kind: "missing_title" });
    });
  });

  describe("invalid-deadline rejection (wires up isDateOnlyString as a real guard)", () => {
    it("rejects a non-date-shaped deadline instead of letting an Invalid Date reach Prisma", () => {
      const outcome = finalizeCampaignWriteData({ title: "Campaign", deadline: "garbage" });
      expect(outcome).toEqual({ ok: false, kind: "invalid_deadline", value: "garbage" });
    });

    it("rejects a full ISO datetime string (not the bare YYYY-MM-DD Python actually sends)", () => {
      const outcome = finalizeCampaignWriteData({
        title: "Campaign",
        deadline: "2026-12-31T00:00:00.000Z",
      });
      expect(outcome.ok).toBe(false);
    });

    it("accepts a well-formed YYYY-MM-DD deadline", () => {
      const outcome = finalizeCampaignWriteData({ title: "Campaign", deadline: "2026-12-31" });
      expect(outcome.ok).toBe(true);
    });
  });
});

describe("campaignWriteErrorResponse", () => {
  it("maps unknown_fields to 422 with an error+details envelope", () => {
    const { status, body } = campaignWriteErrorResponse(
      { ok: false, kind: "unknown_fields", fields: ["id"] },
      "create"
    );
    expect(status).toBe(422);
    expect(body.error).toBe("Failed to create campaign");
    expect(body.details).toBeDefined();
  });

  it("maps missing_title to 422 with an error+details envelope, using the action label", () => {
    const { status, body } = campaignWriteErrorResponse(
      { ok: false, kind: "missing_title" },
      "update"
    );
    expect(status).toBe(422);
    expect(body.error).toBe("Failed to update campaign");
    expect(body.details).toBeDefined();
  });

  it("maps invalid_deadline to a clean 400", () => {
    const { status, body } = campaignWriteErrorResponse(
      { ok: false, kind: "invalid_deadline", value: "garbage" },
      "create"
    );
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });
});
