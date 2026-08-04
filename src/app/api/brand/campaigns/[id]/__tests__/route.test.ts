import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    brandProfile: { findUnique: vi.fn() },
    campaigns: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    campaignclaims: { findMany: vi.fn(), deleteMany: vi.fn() },
    creatorProfile: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET, PUT, DELETE } from "../route";

const VALID_CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440000";
const BRAND_PROFILE = { id: "brand-1", companyName: "Acme Inc", userId: "session-user" };

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function authedBrand() {
  (getServerSession as any).mockResolvedValue({ user: { id: "session-user", role: "BRAND" } });
}

function getReq() {
  return new Request("http://localhost/x") as never;
}

function jsonReq(method: string, body: unknown) {
  return new Request("http://localhost/x", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/brand/campaigns/[id]", () => {
  it("returns 401 without a session or when role is not BRAND", async () => {
    (getServerSession as any).mockResolvedValue(null);
    const res = await GET(getReq(), ctx(VALID_CAMPAIGN_ID));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for a malformed campaign id", async () => {
    authedBrand();
    const res = await GET(getReq(), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid campaign ID format" });
  });

  it("returns 404 'Brand profile not found' when the session user has no BrandProfile", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue(null);

    const res = await GET(getReq(), ctx(VALID_CAMPAIGN_ID));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Brand profile not found" });
  });

  it("SECURITY: returns 404 'Campaign not found' when the campaign belongs to a different brand (explicit ownership check added)", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue(BRAND_PROFILE);
    (prisma.campaigns.findFirst as any).mockResolvedValue(null);

    const res = await GET(getReq(), ctx(VALID_CAMPAIGN_ID));

    expect(prisma.campaigns.findFirst).toHaveBeenCalledWith({
      where: { id: VALID_CAMPAIGN_ID, brand_id: "brand-1" },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Campaign not found" });
  });

  it("enriches applications with username/email/image/user when the creator's User row resolves", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue(BRAND_PROFILE);
    (prisma.campaigns.findFirst as any).mockResolvedValue({
      id: VALID_CAMPAIGN_ID,
      brand_id: "brand-1",
      title: "Campaign",
      deadline: null,
      created_at: new Date(),
    });
    (prisma.campaignclaims.findMany as any).mockResolvedValue([
      {
        id: "claim-1",
        campaign_id: VALID_CAMPAIGN_ID,
        creator_id: "creator-1",
        status: "pending",
        sample_text: null,
        sample_video_url: null,
        created_at: new Date(),
      },
    ]);
    (prisma.creatorProfile.findMany as any).mockResolvedValue([
      { id: "creator-1", userId: "user-1" },
    ]);
    (prisma.user.findMany as any).mockResolvedValue([
      { id: "user-1", name: "Jane Creator", email: "jane@x.com", image: "pic.jpg" },
    ]);

    const res = await GET(getReq(), ctx(VALID_CAMPAIGN_ID));
    const body = await res.json();

    expect(body.applications[0].creator.username).toBe("Jane Creator");
    expect(body.applications[0].creator.email).toBe("jane@x.com");
    expect(body.applications[0].creator.user).toEqual({
      id: "user-1",
      name: "Jane Creator",
      email: "jane@x.com",
      image: "pic.jpg",
    });
    expect(body.brand_name).toBeNull();
  });

  it("FIX: brand is always null, never the caller's BrandProfile (BrandService.get_brand_campaign never sets campaign['brand'] — only the list function does)", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue(BRAND_PROFILE);
    (prisma.campaigns.findFirst as any).mockResolvedValue({
      id: VALID_CAMPAIGN_ID,
      brand_id: "brand-1",
      title: "Campaign",
      deadline: null,
      created_at: new Date(),
    });
    (prisma.campaignclaims.findMany as any).mockResolvedValue([]);

    const res = await GET(getReq(), ctx(VALID_CAMPAIGN_ID));
    const body = await res.json();

    expect(body.brand).toBeNull();
  });

  it("returns 500 'Internal server error' on an unexpected Prisma error, never the raw error text", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockRejectedValue(
      new Error("PrismaClientValidationError: full record dump")
    );

    const res = await GET(getReq(), ctx(VALID_CAMPAIGN_ID));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
    expect(JSON.stringify(body)).not.toContain("full record dump");
  });
});

describe("PUT /api/brand/campaigns/[id]", () => {
  it("returns 401 without a session or when role is not BRAND", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "u1", role: "CREATOR" } });
    const res = await PUT(jsonReq("PUT", { title: "x" }), ctx(VALID_CAMPAIGN_ID));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 'Brand profile not found' when the session user has no BrandProfile", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue(null);

    const res = await PUT(jsonReq("PUT", { title: "x" }), ctx(VALID_CAMPAIGN_ID));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Brand profile not found" });
  });

  it("SECURITY: returns 404 'Campaign not found or access denied' when the campaign belongs to a different brand", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaigns.findFirst as any).mockResolvedValue(null);

    const res = await PUT(jsonReq("PUT", { title: "x" }), ctx(VALID_CAMPAIGN_ID));

    expect(prisma.campaigns.findFirst).toHaveBeenCalledWith({
      where: { id: VALID_CAMPAIGN_ID, brand_id: "brand-1" },
      select: { id: true },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Campaign not found or access denied" });
    expect(prisma.campaigns.update).not.toHaveBeenCalled();
  });

  it("strips any client-supplied brand_id from the write payload (ownership is enforced by the WHERE clause, not client input)", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaigns.findFirst as any).mockResolvedValue({ id: VALID_CAMPAIGN_ID });
    (prisma.campaigns.update as any).mockResolvedValue({});

    await PUT(
      jsonReq("PUT", { title: "Updated", brand_id: "attacker-controlled-brand" }),
      ctx(VALID_CAMPAIGN_ID)
    );

    const data = (prisma.campaigns.update as any).mock.calls[0][0].data;
    expect(data).not.toHaveProperty("brand_id");
    expect(prisma.campaigns.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: VALID_CAMPAIGN_ID } })
    );
  });

  it("converts a deadline string to a UTC Date at the write boundary", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaigns.findFirst as any).mockResolvedValue({ id: VALID_CAMPAIGN_ID });
    (prisma.campaigns.update as any).mockResolvedValue({});

    await PUT(jsonReq("PUT", { title: "Updated", deadline: "2026-09-01" }), ctx(VALID_CAMPAIGN_ID));

    const data = (prisma.campaigns.update as any).mock.calls[0][0].data;
    expect(data.deadline.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("keeps the client's original creator_tier_requirement when no follower/order/array combination applies", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaigns.findFirst as any).mockResolvedValue({ id: VALID_CAMPAIGN_ID });
    (prisma.campaigns.update as any).mockResolvedValue({});

    await PUT(
      jsonReq("PUT", { title: "Updated", creator_tier_requirement: "raw-string-value" }),
      ctx(VALID_CAMPAIGN_ID)
    );

    const data = (prisma.campaigns.update as any).mock.calls[0][0].data;
    expect(data.creator_tier_requirement).toBe("raw-string-value");
  });

  it("CRITICAL FIX: returns 422 and never writes when the body contains an unknown/unbounded field (e.g. id)", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaigns.findFirst as any).mockResolvedValue({ id: VALID_CAMPAIGN_ID });

    const res = await PUT(
      jsonReq("PUT", { title: "Anything", id: "00000000-0000-4000-8000-000000000001" }),
      ctx(VALID_CAMPAIGN_ID)
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Failed to update campaign");
    expect(prisma.campaigns.update).not.toHaveBeenCalled();
  });

  it("returns 422 with an error+details envelope when title is missing", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaigns.findFirst as any).mockResolvedValue({ id: VALID_CAMPAIGN_ID });

    const res = await PUT(jsonReq("PUT", { brief: "no title" }), ctx(VALID_CAMPAIGN_ID));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Failed to update campaign");
    expect(body.details).toBeDefined();
    expect(prisma.campaigns.update).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed deadline instead of a generic 500", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaigns.findFirst as any).mockResolvedValue({ id: VALID_CAMPAIGN_ID });

    const res = await PUT(
      jsonReq("PUT", { title: "Updated", deadline: "garbage" }),
      ctx(VALID_CAMPAIGN_ID)
    );

    expect(res.status).toBe(400);
    expect(prisma.campaigns.update).not.toHaveBeenCalled();
  });

  it("returns 400 for a calendar-invalid deadline (Feb 30) instead of silently writing March 2", async () => {
    // Regression: new Date("2026-02-30T00:00:00.000Z") does not throw, it rolls over to
    // March 2 — a shape-only guard would let this write the wrong date and return 200.
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaigns.findFirst as any).mockResolvedValue({ id: VALID_CAMPAIGN_ID });

    const res = await PUT(
      jsonReq("PUT", { title: "Updated", deadline: "2026-02-30" }),
      ctx(VALID_CAMPAIGN_ID)
    );

    expect(res.status).toBe(400);
    expect(prisma.campaigns.update).not.toHaveBeenCalled();
  });

  it("returns 400 for an out-of-range month (2026-13-01) instead of a generic 500", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaigns.findFirst as any).mockResolvedValue({ id: VALID_CAMPAIGN_ID });

    const res = await PUT(
      jsonReq("PUT", { title: "Updated", deadline: "2026-13-01" }),
      ctx(VALID_CAMPAIGN_ID)
    );

    expect(res.status).toBe(400);
    expect(prisma.campaigns.update).not.toHaveBeenCalled();
  });

  it("still writes a valid calendar deadline (regression guard: the calendar check does not reject good dates)", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaigns.findFirst as any).mockResolvedValue({ id: VALID_CAMPAIGN_ID });
    (prisma.campaigns.update as any).mockResolvedValue({});

    const res = await PUT(
      jsonReq("PUT", { title: "Updated", deadline: "2026-02-28" }),
      ctx(VALID_CAMPAIGN_ID)
    );

    expect(res.status).toBe(200);
    const data = (prisma.campaigns.update as any).mock.calls[0][0].data;
    expect(data.deadline.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("NOTE (live-caller consequence): rejects the exact non-column keys the brandportal edit form sends today (product_photo_url, budgetUnit) with a clean 422", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaigns.findFirst as any).mockResolvedValue({ id: VALID_CAMPAIGN_ID });

    const res = await PUT(
      jsonReq("PUT", {
        title: "Updated",
        product_photo_url: "https://example.com/photo.jpg",
        budgetUnit: "total",
      }),
      ctx(VALID_CAMPAIGN_ID)
    );

    expect(res.status).toBe(422);
    expect(prisma.campaigns.update).not.toHaveBeenCalled();
  });

  it("returns the frozen CampaignMutationResponse shape on success", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaigns.findFirst as any).mockResolvedValue({ id: VALID_CAMPAIGN_ID });
    (prisma.campaigns.update as any).mockResolvedValue({});

    const res = await PUT(jsonReq("PUT", { title: "Updated" }), ctx(VALID_CAMPAIGN_ID));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      message: "Campaign updated successfully",
      campaign_id: VALID_CAMPAIGN_ID,
      campaign_title: null,
    });
  });

  it("returns 500 'Internal server error' on an unexpected Prisma error, never the raw error text", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaigns.findFirst as any).mockResolvedValue({ id: VALID_CAMPAIGN_ID });
    (prisma.campaigns.update as any).mockRejectedValue(
      new Error("PrismaClientValidationError: full record dump")
    );

    const res = await PUT(jsonReq("PUT", { title: "Updated" }), ctx(VALID_CAMPAIGN_ID));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
    expect(JSON.stringify(body)).not.toContain("full record dump");
  });
});

describe("DELETE /api/brand/campaigns/[id]", () => {
  it("returns 401 without a session or when role is not BRAND", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "u1", role: "CREATOR" } });
    const res = await DELETE(getReq(), ctx(VALID_CAMPAIGN_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 'Brand profile not found' when the session user has no BrandProfile", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue(null);

    const res = await DELETE(getReq(), ctx(VALID_CAMPAIGN_ID));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Brand profile not found" });
  });

  it("SECURITY: returns 404 'Campaign not found or access denied' when the campaign belongs to a different brand", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaigns.findFirst as any).mockResolvedValue(null);

    const res = await DELETE(getReq(), ctx(VALID_CAMPAIGN_ID));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Campaign not found or access denied" });
    expect(prisma.campaigns.delete).not.toHaveBeenCalled();
  });

  it("deletes claims before the campaign, then returns the frozen response shape", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaigns.findFirst as any).mockResolvedValue({ id: VALID_CAMPAIGN_ID });
    (prisma.campaignclaims.deleteMany as any).mockResolvedValue({ count: 2 });
    (prisma.campaigns.delete as any).mockResolvedValue({});

    const res = await DELETE(getReq(), ctx(VALID_CAMPAIGN_ID));

    expect(prisma.campaignclaims.deleteMany).toHaveBeenCalledWith({
      where: { campaign_id: VALID_CAMPAIGN_ID },
    });
    expect(prisma.campaigns.delete).toHaveBeenCalledWith({ where: { id: VALID_CAMPAIGN_ID } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      message: "Campaign deleted successfully",
      campaign_id: VALID_CAMPAIGN_ID,
      campaign_title: null,
    });
  });

  it("still deletes the campaign even if deleting its claims fails first (best-effort, matches Python's swallow-and-continue)", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaigns.findFirst as any).mockResolvedValue({ id: VALID_CAMPAIGN_ID });
    (prisma.campaignclaims.deleteMany as any).mockRejectedValue(new Error("claims delete failed"));
    (prisma.campaigns.delete as any).mockResolvedValue({});

    const res = await DELETE(getReq(), ctx(VALID_CAMPAIGN_ID));

    expect(prisma.campaigns.delete).toHaveBeenCalledWith({ where: { id: VALID_CAMPAIGN_ID } });
    expect(res.status).toBe(200);
  });

  it("returns 500 'Internal server error' when the campaign delete itself fails, never the raw error text", async () => {
    authedBrand();
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaigns.findFirst as any).mockResolvedValue({ id: VALID_CAMPAIGN_ID });
    (prisma.campaignclaims.deleteMany as any).mockResolvedValue({ count: 0 });
    (prisma.campaigns.delete as any).mockRejectedValue(
      new Error("PrismaClientValidationError: full record dump")
    );

    const res = await DELETE(getReq(), ctx(VALID_CAMPAIGN_ID));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
    expect(JSON.stringify(body)).not.toContain("full record dump");
  });
});
