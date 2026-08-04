import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/app/api/auth/[...nextauth]/auth.config", () => ({ authConfig: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    creatorProfile: { findUnique: vi.fn() },
    campaignclaims: { findMany: vi.fn() },
    campaigns: { findMany: vi.fn() },
    brandProfile: { findMany: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/creator/campaign-claims", () => {
  it("returns 401 when there is no session", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Authentication required" });
  });

  it("returns 403 when the session user is not a CREATOR", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "u1", role: "BRAND" } });

    const res = await GET();

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only creators can view campaign claims" });
  });

  it("returns an empty array at 200 when the session user has no CreatorProfile", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "u1", role: "CREATOR" } });
    (prisma.creatorProfile.findUnique as any).mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("queries claims scoped to the resolved creator id, ordered newest-first, capped at 10", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "u1", role: "CREATOR" } });
    (prisma.creatorProfile.findUnique as any).mockResolvedValue({ id: "creator-1" });
    (prisma.campaignclaims.findMany as any).mockResolvedValue([]);

    await GET();

    expect(prisma.campaignclaims.findMany).toHaveBeenCalledWith({
      where: { creator_id: "creator-1" },
      orderBy: { created_at: "desc" },
      take: 10,
    });
  });

  it("joins campaign and brand data, formatting deadline and preserving raw array-field strings", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "u1", role: "CREATOR" } });
    (prisma.creatorProfile.findUnique as any).mockResolvedValue({ id: "creator-1" });
    (prisma.campaignclaims.findMany as any).mockResolvedValue([
      {
        id: "claim-1",
        campaign_id: "campaign-1",
        creator_id: "creator-1",
        status: "pending",
        sample_text: null,
        sample_video_url: null,
        created_at: new Date("2026-01-02T00:00:00.000Z"),
      },
    ]);
    (prisma.campaigns.findMany as any).mockResolvedValue([
      {
        id: "campaign-1",
        brand_id: "brand-1",
        title: "Campaign One",
        deadline: new Date("2026-06-01T00:00:00.000Z"),
        budget_range: "$1000",
        budget_unit: "total",
        brief: "brief text",
        sample_video_url: null,
        industry_category: null,
        primary_promotion_objectives: '["awareness"]',
        ad_placement: null,
        campaign_execution_mode: null,
        creator_profile_preferences_gender: null,
        creator_profile_preference_ethnicity: null,
        creator_profile_preference_content_niche: null,
        preferred_creator_location: null,
        language_requirement_for_creators: null,
        creator_tier_requirement: null,
        send_to_creator: null,
        approved_by_brand: null,
        kpi_reference_target: null,
        prohibited_content_warnings: null,
        posting_requirements: null,
        product_photo: null,
        script_required: null,
        product_name: null,
        product_highlight: null,
        product_price: null,
        product_sold_number: null,
        paid_promotion_type: null,
        video_buyout_budget_range: null,
        base_fee_budget_range: null,
      },
    ]);
    (prisma.brandProfile.findMany as any).mockResolvedValue([
      { id: "brand-1", companyName: "Acme Inc" },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(body).toHaveLength(1);
    expect(body[0].campaign_title).toBe("Campaign One");
    expect(body[0].campaign_brand_name).toBe("Acme Inc");
    expect(body[0].campaign_deadline).toBe("2026-06-01");
    expect(body[0].primary_promotion_objectives).toBe('["awareness"]');
  });

  it("degrades to an empty array at HTTP 200 on any unexpected Prisma error", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "u1", role: "CREATOR" } });
    (prisma.creatorProfile.findUnique as any).mockRejectedValue(new Error("db down"));

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
