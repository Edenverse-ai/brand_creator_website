import { describe, it, expect, vi, beforeEach } from "vitest";

const pearBrandFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { pear_brand: { findMany: (...args: unknown[]) => pearBrandFindMany(...args) } },
}));

const isRateLimited = vi.fn();
vi.mock("@/lib/rate-limiter", () => ({
  pearBrandsLimiter: { isRateLimited: (...args: unknown[]) => isRateLimited(...args) },
}));

import { GET } from "../route";

function getRequest(query: string = "") {
  return new Request(`http://localhost/api/pear${query}`, { method: "GET" });
}

const SAMPLE_STORES = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    created_at: new Date("2024-01-01T00:00:00.000Z"),
    store_name: "Pear Store A",
    store_link: "https://example.com/a",
    store_intro: "A great store",
    store_logo: null,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    created_at: new Date("2024-01-02T00:00:00.000Z"),
    store_name: "Pear Store B",
    store_link: "https://example.com/b",
    store_intro: "Another store",
    store_logo: "https://example.com/logo.png",
  },
];

describe("GET /api/pear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRateLimited.mockReturnValue(false);
    pearBrandFindMany.mockResolvedValue(SAMPLE_STORES);
  });

  it("returns 429 when the IP is rate limited, without querying the database", async () => {
    isRateLimited.mockReturnValue(true);

    const res = await GET(getRequest() as never);

    expect(res.status).toBe(429);
    expect(pearBrandFindMany).not.toHaveBeenCalled();
  });

  it("returns 400 when limit is above the Python-mirrored max of 100", async () => {
    const res = await GET(getRequest("?limit=101") as never);

    expect(res.status).toBe(400);
    expect(pearBrandFindMany).not.toHaveBeenCalled();
  });

  it("returns 400 when limit is below the Python-mirrored min of 1", async () => {
    const res = await GET(getRequest("?limit=0") as never);

    expect(res.status).toBe(400);
    expect(pearBrandFindMany).not.toHaveBeenCalled();
  });

  it("returns 400 when limit is not numeric", async () => {
    const res = await GET(getRequest("?limit=abc") as never);

    expect(res.status).toBe(400);
    expect(pearBrandFindMany).not.toHaveBeenCalled();
  });

  it("defaults to limit=50 and no search filter when no query params are supplied", async () => {
    await GET(getRequest() as never);

    expect(pearBrandFindMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { created_at: "desc" },
      take: 50,
    });
  });

  it("treats an empty-string search the same as an absent one (mirrors Python's `if search:`)", async () => {
    await GET(getRequest("?search=") as never);

    expect(pearBrandFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
  });

  it("applies a case-insensitive OR filter on store_name/store_intro when search is supplied", async () => {
    await GET(getRequest("?search=pear") as never);

    expect(pearBrandFindMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { store_name: { contains: "pear", mode: "insensitive" } },
          { store_intro: { contains: "pear", mode: "insensitive" } },
        ],
      },
      orderBy: { created_at: "desc" },
      take: 50,
    });
  });

  it("honors a custom, in-range limit", async () => {
    await GET(getRequest("?limit=10") as never);

    expect(pearBrandFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
  });

  it("returns the frozen response shape: a raw array of stores, not wrapped in an object", async () => {
    const res = await GET(getRequest() as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([
      {
        id: "11111111-1111-1111-1111-111111111111",
        created_at: "2024-01-01T00:00:00.000Z",
        store_name: "Pear Store A",
        store_link: "https://example.com/a",
        store_intro: "A great store",
        store_logo: null,
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        created_at: "2024-01-02T00:00:00.000Z",
        store_name: "Pear Store B",
        store_link: "https://example.com/b",
        store_intro: "Another store",
        store_logo: "https://example.com/logo.png",
      },
    ]);
  });

  it("degrades gracefully to an empty array (200, not 5xx) when the database query fails, mirroring PearService.get_all_stores", async () => {
    pearBrandFindMany.mockRejectedValue(new Error("db down"));

    const res = await GET(getRequest() as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("never leaks the underlying database error to logs beyond its name", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    pearBrandFindMany.mockRejectedValue(new Error("connection string contains secret=abc123"));

    await GET(getRequest() as never);

    const loggedText = consoleErrorSpy.mock.calls.map((call) => JSON.stringify(call)).join(" ");
    expect(loggedText).not.toMatch(/secret=abc123/);

    consoleErrorSpy.mockRestore();
  });

  it("logs the Prisma error code alongside the name when present (consistency with contact/route.ts's storeContactMessage)", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const prismaError = Object.assign(new Error("connection reset"), { code: "P1001" });
    pearBrandFindMany.mockRejectedValue(prismaError);

    await GET(getRequest() as never);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "pear: failed to list stores",
      expect.objectContaining({ name: "Error", code: "P1001" })
    );

    consoleErrorSpy.mockRestore();
  });
});
