import { describe, it, expect, vi, beforeEach } from "vitest";

const entertainmentLiveFindUnique = vi.fn();
const brandProfileFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    entertainment_live: {
      findUnique: (...args: unknown[]) => entertainmentLiveFindUnique(...args),
    },
    brandProfile: {
      findUnique: (...args: unknown[]) => brandProfileFindUnique(...args),
    },
  },
}));

const isDetailRateLimited = vi.fn();
vi.mock("@/lib/rate-limiter", () => ({
  entertainmentLiveDetailLimiter: {
    isRateLimited: (...args: unknown[]) => isDetailRateLimited(...args),
  },
}));

import { GET } from "../route";

function getRequest(id: string) {
  return new Request(`http://localhost/api/entertainment-live/${id}`, { method: "GET" });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

const VALID_ID = "11111111-1111-1111-1111-111111111111";

const MISSION_ROW = {
  id: VALID_ID,
  created_at: new Date("2024-01-01T00:00:00.000Z"),
  task_title: "Summer Livestream",
  brand_id: "brand-1",
  campaign_objective: "Awareness",
  platform: "tiktok",
  task_start_at: null,
  task_end_at: null,
  follower_min: "10000",
  follower_max: "500000",
  niche_tags: '["beauty","fashion"]',
  region_priority: "US",
  content_quality_floor: null,
  deliverables: null,
  mandatory_elements: null,
  creative_guidelines: null,
  prohibited_elements: null,
  reward_model: "fixed",
  fixed_reward: "1500.5",
  tiered_table: null,
  cps_rate: null,
  kpi_baseline: null,
  updated_at: new Date("2024-01-02T00:00:00.000Z"),
};

describe("GET /api/entertainment-live/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isDetailRateLimited.mockReturnValue(false);
    entertainmentLiveFindUnique.mockResolvedValue(MISSION_ROW);
    brandProfileFindUnique.mockResolvedValue({ companyName: "Acme Inc" });
  });

  it("returns 429 when the IP is rate limited, without querying the database", async () => {
    isDetailRateLimited.mockReturnValue(true);

    const res = await GET(getRequest(VALID_ID) as never, params(VALID_ID) as never);

    expect(res.status).toBe(429);
    expect(entertainmentLiveFindUnique).not.toHaveBeenCalled();
  });

  it("returns the frozen 'API Error: 400' shape for a malformed id, without querying the database", async () => {
    const res = await GET(getRequest("not-a-uuid") as never, params("not-a-uuid") as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "API Error: 400" });
    expect(entertainmentLiveFindUnique).not.toHaveBeenCalled();
  });

  it("returns 404 'Mission not found' when no row matches", async () => {
    entertainmentLiveFindUnique.mockResolvedValue(null);

    const res = await GET(getRequest(VALID_ID) as never, params(VALID_ID) as never);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Mission not found" });
  });

  it("returns the frozen 'API Error: 500' shape when the query fails, without leaking the error", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    entertainmentLiveFindUnique.mockRejectedValue(new Error("connection string secret=abc123"));

    const res = await GET(getRequest(VALID_ID) as never, params(VALID_ID) as never);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "API Error: 500" });
    const loggedText = consoleErrorSpy.mock.calls.map((call) => JSON.stringify(call)).join(" ");
    expect(loggedText).not.toMatch(/secret=abc123/);

    consoleErrorSpy.mockRestore();
  });

  it("returns the mission as a bare (unwrapped) object with numeric fields as numbers and niche_tags parsed", async () => {
    const res = await GET(getRequest(VALID_ID) as never, params(VALID_ID) as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: VALID_ID,
      follower_min: 10000,
      follower_max: 500000,
      fixed_reward: 1500.5,
      niche_tags: ["beauty", "fashion"],
      brand_name: "Acme Inc",
    });
    expect(typeof body.follower_min).toBe("number");
    expect(typeof body.fixed_reward).toBe("number");
    // Not wrapped in { data: ... } or similar — the mission fields are top-level.
    expect(body.error).toBeUndefined();
  });

  it("looks up the brand by BrandProfile.id (not userId — a different lookup key than the create path)", async () => {
    await GET(getRequest(VALID_ID) as never, params(VALID_ID) as never);

    expect(brandProfileFindUnique).toHaveBeenCalledWith({
      where: { id: "brand-1" },
      select: { companyName: true },
    });
  });

  it('resolves brand_name to "Unknown Brand" without querying when brand_id is null', async () => {
    entertainmentLiveFindUnique.mockResolvedValue({ ...MISSION_ROW, brand_id: null });

    const res = await GET(getRequest(VALID_ID) as never, params(VALID_ID) as never);
    const body = await res.json();

    expect(brandProfileFindUnique).not.toHaveBeenCalled();
    expect(body.brand_name).toBe("Unknown Brand");
  });

  it('resolves brand_name to "Unknown Brand" when no BrandProfile row matches', async () => {
    brandProfileFindUnique.mockResolvedValue(null);

    const res = await GET(getRequest(VALID_ID) as never, params(VALID_ID) as never);
    const body = await res.json();

    expect(body.brand_name).toBe("Unknown Brand");
  });

  it('resolves brand_name to "Unknown Brand" (not a 500) when the brand lookup itself throws — by-id uses the same fallback for both cases, unlike the list route', async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    brandProfileFindUnique.mockRejectedValue(new Error("db down"));

    const res = await GET(getRequest(VALID_ID) as never, params(VALID_ID) as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brand_name).toBe("Unknown Brand");

    consoleErrorSpy.mockRestore();
  });

  it("falls back to a comma-split array when the stored niche_tags is not valid JSON", async () => {
    entertainmentLiveFindUnique.mockResolvedValue({ ...MISSION_ROW, niche_tags: "beauty,fashion" });

    const res = await GET(getRequest(VALID_ID) as never, params(VALID_ID) as never);
    const body = await res.json();

    expect(body.niche_tags).toEqual(["beauty", "fashion"]);
  });

  it("accepts an uppercase UUID (zod's .uuid() is case-insensitive)", async () => {
    const upper = VALID_ID.toUpperCase();

    const res = await GET(getRequest(upper) as never, params(upper) as never);

    expect(res.status).toBe(200);
    expect(entertainmentLiveFindUnique).toHaveBeenCalledWith({ where: { id: upper } });
  });
});
