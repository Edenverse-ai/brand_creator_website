import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/app/api/auth/[...nextauth]/auth.config", () => ({ authConfig: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    brandProfile: { findUnique: vi.fn() },
    campaigns: { findMany: vi.fn(), create: vi.fn() },
    campaignclaims: { findMany: vi.fn() },
    creatorProfile: { findMany: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "../route";

const BRAND_USER = { id: "u1", role: "BRAND" };
const BRAND_PROFILE = { id: "brand-1", companyName: "Acme Inc", userId: "u1" };

function authedBrand() {
  (getServerSession as any).mockResolvedValue({ user: { email: "b@x.com" } });
  (prisma.user.findUnique as any).mockResolvedValue(BRAND_USER);
  (prisma.brandProfile.findUnique as any).mockResolvedValue(BRAND_PROFILE);
}

function getReq(url: string) {
  return new Request(url) as never;
}

function jsonPost(body: unknown) {
  return new Request("http://localhost/api/brand/campaigns", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

function multipartPost(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  return new Request("http://localhost/api/brand/campaigns", {
    method: "POST",
    body: formData,
  }) as never;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/brand/campaigns", () => {
  it("returns 401 without a session", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const res = await GET(getReq("http://localhost/api/brand/campaigns"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 'Unauthorized - Brand access only' when the user role is not BRAND", async () => {
    (getServerSession as any).mockResolvedValue({ user: { email: "b@x.com" } });
    (prisma.user.findUnique as any).mockResolvedValue({ id: "u1", role: "CREATOR" });

    const res = await GET(getReq("http://localhost/api/brand/campaigns"));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Unauthorized - Brand access only" });
  });

  it("returns 403 'Unauthorized - Brand access only' (not 'Brand profile not found') when there is no BrandProfile", async () => {
    (getServerSession as any).mockResolvedValue({ user: { email: "b@x.com" } });
    (prisma.user.findUnique as any).mockResolvedValue(BRAND_USER);
    (prisma.brandProfile.findUnique as any).mockResolvedValue(null);

    const res = await GET(getReq("http://localhost/api/brand/campaigns"));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Unauthorized - Brand access only" });
  });

  it.each([
    ["status", "active"],
    ["start_date", "2026-01-01"],
    ["startDate", "2026-01-01"],
    ["end_date", "2026-12-31"],
    ["endDate", "2026-12-31"],
  ])(
    "PHANTOM FILTER: %s masks to HTTP 200 with an empty campaigns array and 'API Error: 500', without ever querying campaigns",
    async (param, value) => {
      authedBrand();

      const res = await GET(getReq(`http://localhost/api/brand/campaigns?${param}=${value}`));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ error: "API Error: 500", campaigns: [] });
      expect(prisma.campaigns.findMany).not.toHaveBeenCalled();
    }
  );

  it("returns campaigns scoped to the brand with brand_name forced to null and a full brand object", async () => {
    authedBrand();
    (prisma.campaigns.findMany as any).mockResolvedValue([
      {
        id: "c1",
        brand_id: "brand-1",
        title: "Campaign One",
        deadline: null,
        created_at: new Date(),
      },
    ]);
    (prisma.campaignclaims.findMany as any).mockResolvedValue([]);

    const res = await GET(getReq("http://localhost/api/brand/campaigns"));

    expect(prisma.campaigns.findMany).toHaveBeenCalledWith({ where: { brand_id: "brand-1" } });
    const body = await res.json();
    expect(body[0].brand_name).toBeNull();
    expect(body[0].brand).toEqual(BRAND_PROFILE);
    expect(body[0].applications).toEqual([]);
  });

  it("search filters by title only (description does not exist as a column, matches Python's dead OR)", async () => {
    authedBrand();
    (prisma.campaigns.findMany as any).mockResolvedValue([
      {
        id: "c1",
        brand_id: "brand-1",
        title: "Summer Launch",
        deadline: null,
        created_at: new Date(),
      },
      {
        id: "c2",
        brand_id: "brand-1",
        title: "Winter Sale",
        deadline: null,
        created_at: new Date(),
      },
    ]);
    (prisma.campaignclaims.findMany as any).mockResolvedValue([]);

    const res = await GET(getReq("http://localhost/api/brand/campaigns?search=summer"));
    const body = await res.json();

    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("c1");
  });

  it("list-mode applications attach only the raw creator row, no username/email enrichment", async () => {
    authedBrand();
    (prisma.campaigns.findMany as any).mockResolvedValue([
      {
        id: "c1",
        brand_id: "brand-1",
        title: "Campaign One",
        deadline: null,
        created_at: new Date(),
      },
    ]);
    (prisma.campaignclaims.findMany as any).mockResolvedValue([
      {
        id: "claim-1",
        campaign_id: "c1",
        creator_id: "creator-1",
        status: "pending",
        sample_text: null,
        sample_video_url: null,
        created_at: new Date(),
      },
    ]);
    (prisma.creatorProfile.findMany as any).mockResolvedValue([
      { id: "creator-1", userId: "user-1", bio: null },
    ]);

    const res = await GET(getReq("http://localhost/api/brand/campaigns"));
    const body = await res.json();

    expect(body[0].applications).toHaveLength(1);
    expect(body[0].applications[0].creator.id).toBe("creator-1");
    expect(body[0].applications[0].creator).not.toHaveProperty("username");
  });

  it("degrades to a masked HTTP 200 on an unexpected Prisma error", async () => {
    authedBrand();
    (prisma.campaigns.findMany as any).mockRejectedValue(new Error("db down"));

    const res = await GET(getReq("http://localhost/api/brand/campaigns"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ error: "Failed to fetch campaigns", campaigns: [] });
  });

  it.each(["start_date", "startDate", "end_date", "endDate"])(
    "MINOR FIX: a malformed %s does NOT trigger the phantom-filter mask — Python's own try/except ValueError around strptime skips the crashing .gte()/.lte() call, so the query proceeds and returns real campaigns",
    async (param) => {
      authedBrand();
      (prisma.campaigns.findMany as any).mockResolvedValue([
        {
          id: "c1",
          brand_id: "brand-1",
          title: "Real Campaign",
          deadline: null,
          created_at: new Date(),
        },
      ]);
      (prisma.campaignclaims.findMany as any).mockResolvedValue([]);

      const res = await GET(getReq(`http://localhost/api/brand/campaigns?${param}=notadate`));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body[0].title).toBe("Real Campaign");
      expect(prisma.campaigns.findMany).toHaveBeenCalledWith({ where: { brand_id: "brand-1" } });
    }
  );

  it("a calendar-invalid but shape-matching start_date (Feb 30) also does not trigger the mask", async () => {
    authedBrand();
    (prisma.campaigns.findMany as any).mockResolvedValue([]);
    (prisma.campaignclaims.findMany as any).mockResolvedValue([]);

    const res = await GET(getReq("http://localhost/api/brand/campaigns?start_date=2026-02-30"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(prisma.campaigns.findMany).toHaveBeenCalled();
  });
});

describe("POST /api/brand/campaigns", () => {
  it("returns 401 without a session", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const res = await POST(jsonPost({ title: "x" }));

    expect(res.status).toBe(401);
  });

  it("returns 403 'Brand profile not found' (different message than GET) when there is no BrandProfile", async () => {
    (getServerSession as any).mockResolvedValue({ user: { email: "b@x.com" } });
    (prisma.user.findUnique as any).mockResolvedValue(BRAND_USER);
    (prisma.brandProfile.findUnique as any).mockResolvedValue(null);

    const res = await POST(jsonPost({ title: "x" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Brand profile not found" });
  });

  it("returns 422 with an error+details envelope when title is missing (restores Python's status/shape)", async () => {
    authedBrand();

    const res = await POST(jsonPost({ brief: "no title here" }));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Failed to create campaign");
    expect(body.details).toBeDefined();
    expect(prisma.campaigns.create).not.toHaveBeenCalled();
  });

  it("CRITICAL FIX: returns 422 and never writes when the body contains an unknown/unbounded field (e.g. id)", async () => {
    authedBrand();

    const res = await POST(
      jsonPost({ title: "Anything", id: "00000000-0000-4000-8000-000000000001" })
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Failed to create campaign");
    expect(prisma.campaigns.create).not.toHaveBeenCalled();
  });

  it("CRITICAL FIX: returns 422 and never writes when the body tries to forge created_at", async () => {
    authedBrand();

    const res = await POST(jsonPost({ title: "x", created_at: "1970-01-01T00:00:00.000Z" }));

    expect(res.status).toBe(422);
    expect(prisma.campaigns.create).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed deadline instead of a generic 500", async () => {
    authedBrand();

    const res = await POST(jsonPost({ title: "Campaign", deadline: "garbage" }));

    expect(res.status).toBe(400);
    expect(prisma.campaigns.create).not.toHaveBeenCalled();
  });

  it("returns 400 for a calendar-invalid deadline (Feb 30) instead of silently writing March 2", async () => {
    // Regression: new Date("2026-02-30T00:00:00.000Z") does not throw, it rolls over to
    // March 2 — a shape-only guard would let this write the wrong date and return 200.
    authedBrand();

    const res = await POST(jsonPost({ title: "Campaign", deadline: "2026-02-30" }));

    expect(res.status).toBe(400);
    expect(prisma.campaigns.create).not.toHaveBeenCalled();
  });

  it("returns 400 for an out-of-range month (2026-13-01) instead of a generic 500", async () => {
    authedBrand();

    const res = await POST(jsonPost({ title: "Campaign", deadline: "2026-13-01" }));

    expect(res.status).toBe(400);
    expect(prisma.campaigns.create).not.toHaveBeenCalled();
  });

  it("still writes a valid calendar deadline (regression guard: the calendar check does not reject good dates)", async () => {
    authedBrand();
    (prisma.campaigns.create as any).mockResolvedValue({ id: "new-campaign-id" });

    const res = await POST(jsonPost({ title: "Campaign", deadline: "2026-02-28" }));

    expect(res.status).toBe(200);
    const data = (prisma.campaigns.create as any).mock.calls[0][0].data;
    expect(data.deadline.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("SECURITY: a client-supplied brand_id in the body is ignored — the resolved BrandProfile.id always wins (mirrors the existing PUT test)", async () => {
    authedBrand();
    (prisma.campaigns.create as any).mockResolvedValue({ id: "new-campaign-id" });

    const res = await POST(jsonPost({ title: "Campaign", brand_id: "attacker-controlled-brand" }));

    expect(res.status).toBe(200);
    expect(prisma.campaigns.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ brand_id: "brand-1" }) })
    );
  });

  describe("JSON branch", () => {
    it("creates a campaign, writes brand_id from the resolved BrandProfile, and converts deadline to a UTC Date", async () => {
      authedBrand();
      (prisma.campaigns.create as any).mockResolvedValue({ id: "new-campaign-id" });

      const res = await POST(jsonPost({ title: "Campaign", deadline: "2026-12-31" }));

      expect(prisma.campaigns.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: "Campaign",
            brand_id: "brand-1",
            deadline: expect.any(Date),
          }),
        })
      );
      const writtenDeadline = (prisma.campaigns.create as any).mock.calls[0][0].data.deadline;
      expect(writtenDeadline.toISOString()).toBe("2026-12-31T00:00:00.000Z");

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        success: true,
        message: "Campaign created successfully",
        campaign_id: "new-campaign-id",
        campaign_title: null,
      });
    });

    it("applies CampaignCreate defaults for fields the client omits", async () => {
      authedBrand();
      (prisma.campaigns.create as any).mockResolvedValue({ id: "new-campaign-id" });

      await POST(jsonPost({ title: "Campaign" }));

      expect(prisma.campaigns.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            budget_unit: "total",
            max_creators: 10,
            is_open: true,
            ad_placement: "disable",
            script_required: "no",
            paid_promotion_type: "commission_based",
          }),
        })
      );
    });

    it("JSON-stringifies array-typed fields before writing", async () => {
      authedBrand();
      (prisma.campaigns.create as any).mockResolvedValue({ id: "new-campaign-id" });

      await POST(
        jsonPost({ title: "Campaign", primary_promotion_objectives: ["awareness", "sales"] })
      );

      expect(prisma.campaigns.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ primary_promotion_objectives: '["awareness","sales"]' }),
        })
      );
    });

    it("combines follower_requirement/order_requirement into creator_tier_requirement and drops the source fields", async () => {
      authedBrand();
      (prisma.campaigns.create as any).mockResolvedValue({ id: "new-campaign-id" });

      await POST(
        jsonPost({ title: "Campaign", follower_requirement: "1k-10k", order_requirement: "10-50" })
      );

      const data = (prisma.campaigns.create as any).mock.calls[0][0].data;
      expect(data.creator_tier_requirement).toBe('["1k-10k; 10-50"]');
      expect(data).not.toHaveProperty("follower_requirement");
      expect(data).not.toHaveProperty("order_requirement");
    });

    it("keeps an explicit creator_tier_requirement array when follower/order are both absent", async () => {
      authedBrand();
      (prisma.campaigns.create as any).mockResolvedValue({ id: "new-campaign-id" });

      await POST(jsonPost({ title: "Campaign", creator_tier_requirement: ["nano", "micro"] }));

      const data = (prisma.campaigns.create as any).mock.calls[0][0].data;
      expect(data.creator_tier_requirement).toBe('["nano","micro"]');
    });
  });

  describe("multipart branch", () => {
    it("creates a campaign from FormData fields", async () => {
      authedBrand();
      (prisma.campaigns.create as any).mockResolvedValue({ id: "new-campaign-id" });

      const res = await POST(
        multipartPost({
          title: "Multipart Campaign",
          brief: "A brief",
          deadline: "2026-06-15",
          max_creators: "20",
          is_open: "true",
        })
      );

      const data = (prisma.campaigns.create as any).mock.calls[0][0].data;
      expect(data.title).toBe("Multipart Campaign");
      expect(data.brief).toBe("A brief");
      expect(data.max_creators).toBe(20);
      expect(data.is_open).toBe(true);
      expect(data.deadline.toISOString()).toBe("2026-06-15T00:00:00.000Z");
      expect(res.status).toBe(200);
    });

    it("defaults max_creators to 10 and is_open to false when omitted (JS-level fallback resolves before Python defaults ever apply)", async () => {
      authedBrand();
      (prisma.campaigns.create as any).mockResolvedValue({ id: "new-campaign-id" });

      await POST(multipartPost({ title: "Campaign" }));

      const data = (prisma.campaigns.create as any).mock.calls[0][0].data;
      expect(data.max_creators).toBe(10);
      expect(data.is_open).toBe(false);
    });

    it("combines follower_requirement/order_requirement into creator_tier_requirement", async () => {
      authedBrand();
      (prisma.campaigns.create as any).mockResolvedValue({ id: "new-campaign-id" });

      await POST(
        multipartPost({
          title: "Campaign",
          follower_requirement: "1k-10k",
          order_requirement: "10-50",
        })
      );

      const data = (prisma.campaigns.create as any).mock.calls[0][0].data;
      expect(data.creator_tier_requirement).toBe('["1k-10k; 10-50"]');
    });

    it("parses a JSON-array-shaped array field from its form string", async () => {
      authedBrand();
      (prisma.campaigns.create as any).mockResolvedValue({ id: "new-campaign-id" });

      await POST(
        multipartPost({ title: "Campaign", primary_promotion_objectives: '["awareness","sales"]' })
      );

      const data = (prisma.campaigns.create as any).mock.calls[0][0].data;
      expect(data.primary_promotion_objectives).toBe('["awareness","sales"]');
    });
  });

  it("returns 500 'Internal Server Error' on an unexpected Prisma error, never the raw error text", async () => {
    authedBrand();
    (prisma.campaigns.create as any).mockRejectedValue(
      new Error("PrismaClientValidationError: full attempted record dump")
    );

    const res = await POST(jsonPost({ title: "Campaign" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal Server Error");
    expect(JSON.stringify(body)).not.toContain("full attempted record dump");
  });
});
