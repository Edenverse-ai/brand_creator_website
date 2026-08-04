import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    campaigns: { findMany: vi.fn() },
    brandProfile: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { GET } from "../route";

function campaign(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    brand_id: "brand-1",
    title: "Summer Launch",
    platform: "tiktok",
    deadline: new Date("2026-12-31T00:00:00.000Z"),
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    is_open: true,
    ...overrides,
  };
}

function req(url: string) {
  return new Request(url) as never;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/campaigns", () => {
  it("returns campaigns with brand_name resolved and deadline formatted as YYYY-MM-DD", async () => {
    (prisma.campaigns.findMany as any).mockResolvedValue([campaign()]);
    (prisma.brandProfile.findMany as any).mockResolvedValue([
      { id: "brand-1", companyName: "Acme Inc" },
    ]);

    const res = await GET(req("http://localhost/api/campaigns"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].brand_name).toBe("Acme Inc");
    expect(body[0].deadline).toBe("2026-12-31");
  });

  it("defaults brand_name to 'Unknown Brand' when the BrandProfile lookup finds nothing", async () => {
    (prisma.campaigns.findMany as any).mockResolvedValue([campaign({ brand_id: "missing" })]);
    (prisma.brandProfile.findMany as any).mockResolvedValue([]);

    const res = await GET(req("http://localhost/api/campaigns"));
    const body = await res.json();
    expect(body[0].brand_name).toBe("Unknown Brand");
  });

  it("filters by platform (case-insensitive, lowercased before the query)", async () => {
    (prisma.campaigns.findMany as any).mockResolvedValue([]);
    (prisma.brandProfile.findMany as any).mockResolvedValue([]);

    await GET(req("http://localhost/api/campaigns?platform=TikTok"));

    expect(prisma.campaigns.findMany).toHaveBeenCalledWith({ where: { platform: "tiktok" } });
  });

  it("does not filter by platform when platform=all", async () => {
    (prisma.campaigns.findMany as any).mockResolvedValue([]);
    (prisma.brandProfile.findMany as any).mockResolvedValue([]);

    await GET(req("http://localhost/api/campaigns?platform=all"));

    expect(prisma.campaigns.findMany).toHaveBeenCalledWith({ where: undefined });
  });

  it("ignores the category param entirely (dead param in the Python source too)", async () => {
    (prisma.campaigns.findMany as any).mockResolvedValue([campaign({ title: "Only Campaign" })]);
    (prisma.brandProfile.findMany as any).mockResolvedValue([
      { id: "brand-1", companyName: "Acme" },
    ]);

    const res = await GET(req("http://localhost/api/campaigns?category=beauty"));
    const body = await res.json();
    expect(body).toHaveLength(1); // category is not applied as a filter
  });

  it("search matches title case-insensitively", async () => {
    (prisma.campaigns.findMany as any).mockResolvedValue([
      campaign({ id: "c1", title: "Summer Launch" }),
      campaign({ id: "c2", title: "Winter Sale" }),
    ]);
    (prisma.brandProfile.findMany as any).mockResolvedValue([]);

    const res = await GET(req("http://localhost/api/campaigns?search=summer"));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("c1");
  });

  it("search also matches the raw brand_id string (Python's actual, if odd, behavior)", async () => {
    (prisma.campaigns.findMany as any).mockResolvedValue([
      campaign({ id: "c1", title: "Unrelated", brand_id: "special-brand-xyz" }),
      campaign({ id: "c2", title: "Also Unrelated", brand_id: "other" }),
    ]);
    (prisma.brandProfile.findMany as any).mockResolvedValue([]);

    const res = await GET(req("http://localhost/api/campaigns?search=special-brand"));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("c1");
  });

  it("degrades to an empty array at HTTP 200 on a Prisma error (never hard-fails)", async () => {
    (prisma.campaigns.findMany as any).mockRejectedValue(new Error("connection refused"));

    const res = await GET(req("http://localhost/api/campaigns"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("passes through unmodeled columns (follower_requirement/order_requirement) unchanged", async () => {
    (prisma.campaigns.findMany as any).mockResolvedValue([
      campaign({ follower_requirement: "1k-10k", order_requirement: "10-50" }),
    ]);
    (prisma.brandProfile.findMany as any).mockResolvedValue([]);

    const res = await GET(req("http://localhost/api/campaigns"));
    const body = await res.json();
    expect(body[0].follower_requirement).toBe("1k-10k");
    expect(body[0].order_requirement).toBe("10-50");
  });

  it("does not parse array-typed fields — they stay raw JSON-encoded strings (§0.4)", async () => {
    (prisma.campaigns.findMany as any).mockResolvedValue([
      campaign({ primary_promotion_objectives: '["awareness","sales"]' }),
    ]);
    (prisma.brandProfile.findMany as any).mockResolvedValue([]);

    const res = await GET(req("http://localhost/api/campaigns"));
    const body = await res.json();
    expect(body[0].primary_promotion_objectives).toBe('["awareness","sales"]');
    expect(typeof body[0].primary_promotion_objectives).toBe("string");
  });
});
