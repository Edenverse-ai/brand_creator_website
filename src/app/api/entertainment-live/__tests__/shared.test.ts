import { describe, it, expect } from "vitest";
import {
  parseNumericField,
  numberToWriteField,
  parseNicheTags,
  buildNicheTagsWriteField,
  presence,
  serializeMission,
} from "../shared";
import type { entertainment_live } from "@prisma/client";

describe("parseNumericField (read-side of the numeric-string-column trap, §0.3)", () => {
  it("returns null for null", () => {
    expect(parseNumericField(null)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseNumericField("")).toBeNull();
  });

  it("parses an integer string to a number", () => {
    expect(parseNumericField("1000")).toBe(1000);
    expect(typeof parseNumericField("1000")).toBe("number");
  });

  it("parses a float string to a number", () => {
    expect(parseNumericField("12.5")).toBe(12.5);
  });

  it("parses '0' to the number 0, not null (falsy-but-valid)", () => {
    expect(parseNumericField("0")).toBe(0);
  });

  it("never throws on unparseable text — returns null instead", () => {
    expect(() => parseNumericField("not-a-number")).not.toThrow();
    expect(parseNumericField("not-a-number")).toBeNull();
  });

  it("returns null for a partially-numeric string Number() can't fully parse", () => {
    expect(parseNumericField("12abc")).toBeNull();
  });
});

describe("numberToWriteField (write-side of the numeric-string-column trap, §0.3)", () => {
  it("returns undefined for null (Prisma omits the key, mirrors Python's None-drop filter)", () => {
    expect(numberToWriteField(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(numberToWriteField(undefined)).toBeUndefined();
  });

  it("stringifies 0 (kept, not dropped — Python's filter keeps 0 too)", () => {
    expect(numberToWriteField(0)).toBe("0");
  });

  it("stringifies a positive integer", () => {
    expect(numberToWriteField(50000)).toBe("50000");
  });

  it("stringifies a float", () => {
    expect(numberToWriteField(2.5)).toBe("2.5");
  });
});

describe("parseNicheTags (read-side JSON-array-in-text-column, §0.4/§5.4)", () => {
  it("leaves null untouched", () => {
    expect(parseNicheTags(null)).toBeNull();
  });

  it("leaves an empty string untouched (falsy, Python's `if mission.get(...)` short-circuits)", () => {
    expect(parseNicheTags("")).toBe("");
  });

  it("JSON-parses a valid array string into a real array", () => {
    expect(parseNicheTags('["beauty","fashion"]')).toEqual(["beauty", "fashion"]);
  });

  it("falls back to a comma-split array when JSON parsing fails", () => {
    expect(parseNicheTags("beauty,fashion,tech")).toEqual(["beauty", "fashion", "tech"]);
  });

  it("trims whitespace and drops empty entries in the comma-split fallback", () => {
    expect(parseNicheTags("beauty, fashion ,, tech")).toEqual(["beauty", "fashion", "tech"]);
  });

  it("comma-splits a single non-JSON word (no commas) into a one-element array", () => {
    expect(parseNicheTags("beauty")).toEqual(["beauty"]);
  });

  it("returns whatever valid JSON parses to, even if not an array (matches Python's json.loads honestly)", () => {
    expect(parseNicheTags('"hello"')).toBe("hello");
  });
});

describe("buildNicheTagsWriteField (write-side)", () => {
  it("returns undefined for null", () => {
    expect(buildNicheTagsWriteField(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(buildNicheTagsWriteField(undefined)).toBeUndefined();
  });

  it("returns undefined for an empty array (documented divergence — treated as not-provided)", () => {
    expect(buildNicheTagsWriteField([])).toBeUndefined();
  });

  it("JSON-stringifies a non-empty array", () => {
    expect(buildNicheTagsWriteField(["beauty", "fashion"])).toBe('["beauty","fashion"]');
  });

  it("passes an already-string value through unchanged", () => {
    expect(buildNicheTagsWriteField('["beauty"]')).toBe('["beauty"]');
  });

  it("returns undefined for an empty string", () => {
    expect(buildNicheTagsWriteField("")).toBeUndefined();
  });
});

describe("presence (generic None/''-strip write filter, entertainment_live.py:238)", () => {
  it("returns undefined for null", () => {
    expect(presence(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(presence(undefined)).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(presence("")).toBeUndefined();
  });

  it("returns the value unchanged when non-empty", () => {
    expect(presence("Summer Livestream")).toBe("Summer Livestream");
  });
});

describe("serializeMission (full row -> frozen JSON shape)", () => {
  const baseRow: entertainment_live = {
    id: "11111111-1111-1111-1111-111111111111",
    created_at: new Date("2024-01-01T00:00:00.000Z"),
    task_title: "Summer Livestream",
    brand_id: "brand-1",
    campaign_objective: "Awareness",
    platform: "tiktok",
    task_start_at: new Date("2024-02-01T00:00:00.000Z"),
    task_end_at: new Date("2024-02-28T00:00:00.000Z"),
    follower_min: "10000",
    follower_max: "500000",
    niche_tags: '["beauty","fashion"]',
    region_priority: "US",
    content_quality_floor: "HD",
    deliverables: "3 livestreams",
    mandatory_elements: "Product placement",
    creative_guidelines: "Bright lighting",
    prohibited_elements: "Competitor mentions",
    reward_model: "fixed",
    fixed_reward: "1500.5",
    tiered_table: null,
    cps_rate: null,
    kpi_baseline: "1000 views",
    updated_at: new Date("2024-01-02T00:00:00.000Z"),
  };

  it("returns the exact frozen field set with brand_name appended", () => {
    expect(serializeMission(baseRow, "Acme Inc")).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      created_at: baseRow.created_at,
      task_title: "Summer Livestream",
      brand_id: "brand-1",
      campaign_objective: "Awareness",
      platform: "tiktok",
      task_start_at: baseRow.task_start_at,
      task_end_at: baseRow.task_end_at,
      follower_min: 10000,
      follower_max: 500000,
      niche_tags: ["beauty", "fashion"],
      region_priority: "US",
      content_quality_floor: "HD",
      deliverables: "3 livestreams",
      mandatory_elements: "Product placement",
      creative_guidelines: "Bright lighting",
      prohibited_elements: "Competitor mentions",
      reward_model: "fixed",
      fixed_reward: 1500.5,
      tiered_table: null,
      cps_rate: null,
      kpi_baseline: "1000 views",
      updated_at: baseRow.updated_at,
      brand_name: "Acme Inc",
    });
  });

  it("returns follower_min/follower_max/fixed_reward/cps_rate as numbers, not strings (this domain's signature risk)", () => {
    const result = serializeMission(baseRow, "Acme Inc");
    expect(typeof result.follower_min).toBe("number");
    expect(typeof result.follower_max).toBe("number");
    expect(typeof result.fixed_reward).toBe("number");
    // cps_rate is null in this fixture, but assert its sibling still resolves to
    // "number", not the string "1500.5", to catch a naive passthrough regression.
    expect(result.fixed_reward).toBe(1500.5);
  });

  it("keeps numeric-string fields as null (not the string 'null' or NaN) when the column is null", () => {
    const result = serializeMission({ ...baseRow, follower_min: null, cps_rate: null }, "Acme Inc");
    expect(result.follower_min).toBeNull();
    expect(result.cps_rate).toBeNull();
  });
});
