import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const entertainmentLiveFindMany = vi.fn();
const entertainmentLiveCreate = vi.fn();
const brandProfileFindMany = vi.fn();
const brandProfileFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    entertainment_live: {
      findMany: (...args: unknown[]) => entertainmentLiveFindMany(...args),
      create: (...args: unknown[]) => entertainmentLiveCreate(...args),
    },
    brandProfile: {
      findMany: (...args: unknown[]) => brandProfileFindMany(...args),
      findUnique: (...args: unknown[]) => brandProfileFindUnique(...args),
    },
  },
}));

const isListRateLimited = vi.fn();
vi.mock("@/lib/rate-limiter", () => ({
  entertainmentLiveListLimiter: {
    isRateLimited: (...args: unknown[]) => isListRateLimited(...args),
  },
}));

import { getServerSession } from "next-auth";
import { GET, POST } from "../route";

function getRequest(query: string = "") {
  return new Request(`http://localhost/api/entertainment-live${query}`, { method: "GET" });
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/entertainment-live", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const MISSION_ROW = {
  id: "11111111-1111-1111-1111-111111111111",
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

describe("GET /api/entertainment-live (list)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isListRateLimited.mockReturnValue(false);
    entertainmentLiveFindMany.mockResolvedValue([]);
    brandProfileFindMany.mockResolvedValue([]);
  });

  it("returns 429 when the IP is rate limited, without querying the database", async () => {
    isListRateLimited.mockReturnValue(true);

    const res = await GET(getRequest() as never);

    expect(res.status).toBe(429);
    expect(entertainmentLiveFindMany).not.toHaveBeenCalled();
  });

  it("returns 400 when limit is above the Python-mirrored max of 100", async () => {
    const res = await GET(getRequest("?limit=101") as never);

    expect(res.status).toBe(400);
    expect(entertainmentLiveFindMany).not.toHaveBeenCalled();
  });

  it("returns 400 when limit is below the Python-mirrored min of 1", async () => {
    const res = await GET(getRequest("?limit=0") as never);

    expect(res.status).toBe(400);
    expect(entertainmentLiveFindMany).not.toHaveBeenCalled();
  });

  it("returns 400 when limit is not numeric", async () => {
    const res = await GET(getRequest("?limit=abc") as never);

    expect(res.status).toBe(400);
    expect(entertainmentLiveFindMany).not.toHaveBeenCalled();
  });

  it("defaults to limit=50 and no filters when no query params are supplied", async () => {
    await GET(getRequest() as never);

    expect(entertainmentLiveFindMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { created_at: "desc" },
      take: 50,
    });
  });

  it("lowercases the platform filter to an exact match (mirrors Python's platform.lower())", async () => {
    await GET(getRequest("?platform=TikTok") as never);

    expect(entertainmentLiveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { platform: "tiktok" } })
    );
  });

  it('treats platform="all" as no filter', async () => {
    await GET(getRequest("?platform=all") as never);

    expect(entertainmentLiveFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("applies region_priority as a case-sensitive exact match (NOT lowercased, unlike platform)", async () => {
    await GET(getRequest("?region=US") as never);

    expect(entertainmentLiveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { region_priority: "US" } })
    );
  });

  it('treats region="all" as no filter', async () => {
    await GET(getRequest("?region=all") as never);

    expect(entertainmentLiveFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("applies reward_model as a case-sensitive exact match", async () => {
    await GET(getRequest("?reward_model=CPS") as never);

    expect(entertainmentLiveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { reward_model: "CPS" } })
    );
  });

  it("applies a case-insensitive OR filter on task_title/campaign_objective when search is supplied", async () => {
    await GET(getRequest("?search=beauty") as never);

    expect(entertainmentLiveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { task_title: { contains: "beauty", mode: "insensitive" } },
            { campaign_objective: { contains: "beauty", mode: "insensitive" } },
          ],
        },
      })
    );
  });

  it("treats a whitespace-only search the same as no search", async () => {
    await GET(getRequest("?search=%20%20") as never);

    expect(entertainmentLiveFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("honors a custom, in-range limit", async () => {
    await GET(getRequest("?limit=10") as never);

    expect(entertainmentLiveFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
  });

  it("combines platform, region, reward_model, and search filters together", async () => {
    await GET(getRequest("?platform=TikTok&region=US&reward_model=CPS&search=beauty") as never);

    expect(entertainmentLiveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          platform: "tiktok",
          region_priority: "US",
          reward_model: "CPS",
          OR: [
            { task_title: { contains: "beauty", mode: "insensitive" } },
            { campaign_objective: { contains: "beauty", mode: "insensitive" } },
          ],
        },
      })
    );
  });

  it("returns the frozen response shape: a bare array with numeric fields as numbers and niche_tags parsed", async () => {
    entertainmentLiveFindMany.mockResolvedValue([MISSION_ROW]);
    brandProfileFindMany.mockResolvedValue([{ id: "brand-1", companyName: "Acme Inc" }]);

    const res = await GET(getRequest() as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: MISSION_ROW.id,
      follower_min: 10000,
      follower_max: 500000,
      fixed_reward: 1500.5,
      niche_tags: ["beauty", "fashion"],
      brand_name: "Acme Inc",
    });
    expect(typeof body[0].follower_min).toBe("number");
    expect(typeof body[0].follower_max).toBe("number");
    expect(typeof body[0].fixed_reward).toBe("number");
  });

  it("looks up brand names with only the unique, non-null brand_ids", async () => {
    entertainmentLiveFindMany.mockResolvedValue([
      { ...MISSION_ROW, id: "m1", brand_id: "brand-1" },
      { ...MISSION_ROW, id: "m2", brand_id: "brand-1" },
      { ...MISSION_ROW, id: "m3", brand_id: "brand-2" },
      { ...MISSION_ROW, id: "m4", brand_id: null },
    ]);
    brandProfileFindMany.mockResolvedValue([
      { id: "brand-1", companyName: "Acme Inc" },
      { id: "brand-2", companyName: "Globex" },
    ]);

    const res = await GET(getRequest() as never);
    const body = await res.json();

    expect(brandProfileFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["brand-1", "brand-2"] } },
      select: { id: true, companyName: true },
    });
    expect(body.map((m: { brand_name: string }) => m.brand_name)).toEqual([
      "Acme Inc",
      "Acme Inc",
      "Globex",
      "Unknown Brand",
    ]);
  });

  it("skips the brand lookup query entirely when every mission has a null brand_id", async () => {
    entertainmentLiveFindMany.mockResolvedValue([{ ...MISSION_ROW, brand_id: null }]);

    const res = await GET(getRequest() as never);
    const body = await res.json();

    expect(brandProfileFindMany).not.toHaveBeenCalled();
    expect(body[0].brand_name).toBe("Unknown Brand");
  });

  it('falls back to "Unknown Brand" when a brand_id has no matching BrandProfile row', async () => {
    entertainmentLiveFindMany.mockResolvedValue([MISSION_ROW]);
    brandProfileFindMany.mockResolvedValue([]); // no matching row

    const res = await GET(getRequest() as never);
    const body = await res.json();

    expect(body[0].brand_name).toBe("Unknown Brand");
  });

  it('falls back to "Brand {id}" (list-only fallback) when the batched brand lookup itself throws', async () => {
    entertainmentLiveFindMany.mockResolvedValue([MISSION_ROW]);
    brandProfileFindMany.mockRejectedValue(new Error("connection reset"));

    const res = await GET(getRequest() as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body[0].brand_name).toBe(`Brand ${MISSION_ROW.brand_id}`);
  });

  it("falls back to a comma-split array when the stored niche_tags is not valid JSON", async () => {
    entertainmentLiveFindMany.mockResolvedValue([{ ...MISSION_ROW, niche_tags: "beauty,fashion" }]);

    const res = await GET(getRequest() as never);
    const body = await res.json();

    expect(body[0].niche_tags).toEqual(["beauty", "fashion"]);
  });

  it("degrades gracefully to the frozen error shape (200, not 5xx) when the list query fails, per porting reference §5.3", async () => {
    entertainmentLiveFindMany.mockRejectedValue(new Error("db down"));

    const res = await GET(getRequest() as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ error: "API Error: 500", missions: [] });
  });

  it("never leaks the underlying database error to logs beyond its name", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    entertainmentLiveFindMany.mockRejectedValue(new Error("secret=abc123 leaked in error"));

    await GET(getRequest() as never);

    const loggedText = consoleErrorSpy.mock.calls.map((call) => JSON.stringify(call)).join(" ");
    expect(loggedText).not.toMatch(/secret=abc123/);

    consoleErrorSpy.mockRestore();
  });
});

describe("POST /api/entertainment-live (create)", () => {
  const SESSION = { user: { id: "user-1", email: "brand@example.com", role: "BRAND" } };
  const VALID_BODY = {
    task_title: "Summer Livestream",
    campaign_objective: "Awareness",
    platform: "TikTok",
    follower_min: 10000,
    follower_max: 500000,
    niche_tags: ["beauty", "fashion"],
    reward_model: "fixed",
    fixed_reward: 1500.5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as any).mockResolvedValue(SESSION);
    brandProfileFindUnique.mockResolvedValue({ id: "brand-profile-1" });
    entertainmentLiveCreate.mockResolvedValue({ id: "mission-1" });
  });

  it("returns 401 when there is no session", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const res = await POST(postRequest(VALID_BODY) as never);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(entertainmentLiveCreate).not.toHaveBeenCalled();
  });

  it("returns 401 when the session has no email", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "user-1", role: "BRAND" } });

    const res = await POST(postRequest(VALID_BODY) as never);

    expect(res.status).toBe(401);
    expect(entertainmentLiveCreate).not.toHaveBeenCalled();
  });

  it("returns 403 when the session role is not BRAND", async () => {
    (getServerSession as any).mockResolvedValue({
      user: { id: "user-1", email: "creator@example.com", role: "CREATOR" },
    });

    const res = await POST(postRequest(VALID_BODY) as never);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Unauthorized - Brand access only" });
    expect(entertainmentLiveCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the body fails schema validation (missing task_title)", async () => {
    const { task_title: _drop, ...withoutTitle } = VALID_BODY;

    const res = await POST(postRequest(withoutTitle) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
    expect(entertainmentLiveCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const req = new Request("http://localhost/api/entertainment-live", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    const res = await POST(req as never);

    expect(res.status).toBe(400);
    expect(entertainmentLiveCreate).not.toHaveBeenCalled();
  });

  it("returns the frozen 404 shape, interpolating the session user id, when no BrandProfile exists", async () => {
    brandProfileFindUnique.mockResolvedValue(null);

    const res = await POST(postRequest(VALID_BODY) as never);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "Failed to create entertainment live mission",
      details: { detail: "Brand profile not found for ID: user-1" },
    });
    expect(entertainmentLiveCreate).not.toHaveBeenCalled();
  });

  it("resolves the BrandProfile by the session's user id, not any client-supplied brand_id", async () => {
    await POST(postRequest({ ...VALID_BODY, brand_id: "attacker-supplied-id" }) as never);

    expect(brandProfileFindUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { id: true },
    });
    expect(entertainmentLiveCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ brand_id: "brand-profile-1" }) })
    );
  });

  it("creates the mission with field-for-field mapped data and returns the frozen success shape", async () => {
    const res = await POST(postRequest(VALID_BODY) as never);

    expect(entertainmentLiveCreate).toHaveBeenCalledWith({
      data: {
        task_title: "Summer Livestream",
        brand_id: "brand-profile-1",
        campaign_objective: "Awareness",
        platform: "TikTok",
        task_start_at: undefined,
        task_end_at: undefined,
        follower_min: "10000",
        follower_max: "500000",
        niche_tags: '["beauty","fashion"]',
        region_priority: undefined,
        content_quality_floor: undefined,
        deliverables: undefined,
        mandatory_elements: undefined,
        creative_guidelines: undefined,
        prohibited_elements: undefined,
        reward_model: "fixed",
        fixed_reward: "1500.5",
        tiered_table: undefined,
        cps_rate: undefined,
        kpi_baseline: undefined,
        created_at: expect.any(Date),
        updated_at: expect.any(Date),
      },
      select: { id: true },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      message: "Entertainment live mission created successfully",
      data: { mission_id: "mission-1" },
    });
  });

  it("passes real Date objects (not strings) for task_start_at/task_end_at at the write boundary", async () => {
    await POST(
      postRequest({
        ...VALID_BODY,
        task_start_at: "2024-02-01T00:00:00.000Z",
        task_end_at: "2024-02-28T00:00:00.000Z",
      }) as never
    );

    expect(entertainmentLiveCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          task_start_at: expect.any(Date),
          task_end_at: expect.any(Date),
        }),
      })
    );
    const call = entertainmentLiveCreate.mock.calls[0][0];
    expect(call.data.task_start_at.toISOString()).toBe("2024-02-01T00:00:00.000Z");
  });

  it("drops empty-string optional fields instead of writing them (mirrors Python's None/''-strip filter)", async () => {
    await POST(
      postRequest({ ...VALID_BODY, campaign_objective: "", region_priority: "" }) as never
    );

    const call = entertainmentLiveCreate.mock.calls[0][0];
    expect(call.data.campaign_objective).toBeUndefined();
    expect(call.data.region_priority).toBeUndefined();
  });

  it("keeps follower_min: 0 as the string '0' rather than dropping it (Python's filter keeps 0 too)", async () => {
    await POST(postRequest({ ...VALID_BODY, follower_min: 0 }) as never);

    const call = entertainmentLiveCreate.mock.calls[0][0];
    expect(call.data.follower_min).toBe("0");
  });

  it("omits niche_tags entirely when the array is empty", async () => {
    await POST(postRequest({ ...VALID_BODY, niche_tags: [] }) as never);

    const call = entertainmentLiveCreate.mock.calls[0][0];
    expect(call.data.niche_tags).toBeUndefined();
  });

  it("passes an already-string niche_tags value through unchanged", async () => {
    await POST(postRequest({ ...VALID_BODY, niche_tags: '["beauty"]' }) as never);

    const call = entertainmentLiveCreate.mock.calls[0][0];
    expect(call.data.niche_tags).toBe('["beauty"]');
  });

  it("returns 500 with the fixed, non-leaking message when the BrandProfile lookup throws", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    brandProfileFindUnique.mockRejectedValue(
      new Error("connection string contains password=hunter2")
    );

    const res = await POST(postRequest(VALID_BODY) as never);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: "Failed to create entertainment live mission",
      details: { detail: "Database error" },
    });
    expect(JSON.stringify(body)).not.toMatch(/hunter2/);
    const loggedText = consoleErrorSpy.mock.calls.map((call) => JSON.stringify(call)).join(" ");
    expect(loggedText).not.toMatch(/hunter2/);

    consoleErrorSpy.mockRestore();
  });

  it("returns 500 with the fixed, non-leaking message when the insert fails, never echoing the Prisma error", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    entertainmentLiveCreate.mockRejectedValue(
      new Error(
        'Invalid `prisma.entertainment_live.create()` invocation: { data: { task_title: "Summer Livestream", brand_id: "brand-profile-1", ... } }'
      )
    );

    const res = await POST(postRequest(VALID_BODY) as never);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: "Failed to create entertainment live mission",
      details: { detail: "Database error" },
    });
    expect(JSON.stringify(body)).not.toMatch(/Summer Livestream|brand-profile-1/);
    const loggedText = consoleErrorSpy.mock.calls.map((call) => JSON.stringify(call)).join(" ");
    expect(loggedText).not.toMatch(/Summer Livestream|brand-profile-1/);

    consoleErrorSpy.mockRestore();
  });
});
