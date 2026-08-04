import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    campaigns: { findFirst: vi.fn() },
    brandProfile: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/campaigns/[id]", () => {
  it("returns 400 for a malformed campaign id, without ever touching the database", async () => {
    const res = await GET(new Request("http://localhost/x") as never, ctx("not-a-uuid"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid campaign ID format" });
    expect(prisma.campaigns.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when the campaign does not exist or is not open", async () => {
    (prisma.campaigns.findFirst as any).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/x") as never, ctx(VALID_UUID));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Campaign not found" });
    expect(prisma.campaigns.findFirst).toHaveBeenCalledWith({
      where: { id: VALID_UUID, is_open: true },
    });
  });

  it("returns the campaign with brand_name and a formatted deadline on success", async () => {
    (prisma.campaigns.findFirst as any).mockResolvedValue({
      id: VALID_UUID,
      brand_id: "brand-1",
      title: "Campaign",
      deadline: new Date("2026-06-15T00:00:00.000Z"),
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    });
    (prisma.brandProfile.findMany as any).mockResolvedValue([
      { id: "brand-1", companyName: "Acme Inc" },
    ]);

    const res = await GET(new Request("http://localhost/x") as never, ctx(VALID_UUID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brand_name).toBe("Acme Inc");
    expect(body.deadline).toBe("2026-06-15");
  });

  it("returns a fixed 500 message on an unexpected Prisma error, never the raw error text", async () => {
    (prisma.campaigns.findFirst as any).mockRejectedValue(
      new Error("PrismaClientValidationError: some raw record dump here")
    );

    const res = await GET(new Request("http://localhost/x") as never, ctx(VALID_UUID));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Database error fetching campaign");
    expect(JSON.stringify(body)).not.toContain("raw record dump");
  });
});
