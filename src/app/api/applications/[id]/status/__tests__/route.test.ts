import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/app/api/auth/[...nextauth]/auth.config", () => ({ authConfig: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    brandProfile: { findUnique: vi.fn() },
    campaignclaims: { findUnique: vi.fn(), update: vi.fn() },
    campaigns: { findUnique: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { PATCH } from "../route";

const VALID_CLAIM_ID = "550e8400-e29b-41d4-a716-446655440000";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/applications/[id]/status", () => {
  it("returns 401 when there is no session", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ status: "approved" }), ctx(VALID_CLAIM_ID));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when the user is not a BRAND", async () => {
    (getServerSession as any).mockResolvedValue({ user: { email: "b@x.com" } });
    (prisma.user.findUnique as any).mockResolvedValue({ id: "u1", role: "CREATOR" });

    const res = await PATCH(patchRequest({ status: "approved" }), ctx(VALID_CLAIM_ID));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Unauthorized - Brand access only" });
  });

  it("returns 403 when the BRAND user has no BrandProfile", async () => {
    (getServerSession as any).mockResolvedValue({ user: { email: "b@x.com" } });
    (prisma.user.findUnique as any).mockResolvedValue({ id: "u1", role: "BRAND" });
    (prisma.brandProfile.findUnique as any).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ status: "approved" }), ctx(VALID_CLAIM_ID));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Brand profile not found" });
  });

  it.each(["under_review", "completed", "bogus", ""])(
    "rejects status %s with 400 (only approved/rejected/pending are accepted, narrower than Python's 5-value set)",
    async (status) => {
      (getServerSession as any).mockResolvedValue({ user: { email: "b@x.com" } });
      (prisma.user.findUnique as any).mockResolvedValue({ id: "u1", role: "BRAND" });
      (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });

      const res = await PATCH(patchRequest({ status }), ctx(VALID_CLAIM_ID));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid status value" });
    }
  );

  it("returns the generic 500 when the claim id is not a valid UUID", async () => {
    (getServerSession as any).mockResolvedValue({ user: { email: "b@x.com" } });
    (prisma.user.findUnique as any).mockResolvedValue({ id: "u1", role: "BRAND" });
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });

    const res = await PATCH(patchRequest({ status: "approved" }), ctx("not-a-uuid"));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to update application status" });
  });

  it("returns the generic 500 when the claim does not exist", async () => {
    (getServerSession as any).mockResolvedValue({ user: { email: "b@x.com" } });
    (prisma.user.findUnique as any).mockResolvedValue({ id: "u1", role: "BRAND" });
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaignclaims.findUnique as any).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ status: "approved" }), ctx(VALID_CLAIM_ID));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to update application status" });
  });

  it("SECURITY: returns 403 when the claim's campaign belongs to a different brand (real ownership check added)", async () => {
    (getServerSession as any).mockResolvedValue({ user: { email: "b@x.com" } });
    (prisma.user.findUnique as any).mockResolvedValue({ id: "u1", role: "BRAND" });
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaignclaims.findUnique as any).mockResolvedValue({
      id: VALID_CLAIM_ID,
      campaign_id: "campaign-1",
    });
    (prisma.campaigns.findUnique as any).mockResolvedValue({ brand_id: "some-other-brand" });

    const res = await PATCH(patchRequest({ status: "approved" }), ctx(VALID_CLAIM_ID));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Unauthorized to update this claim" });
    expect(prisma.campaignclaims.update).not.toHaveBeenCalled();
  });

  it("proceeds when the claim's campaign belongs to the caller's own brand", async () => {
    (getServerSession as any).mockResolvedValue({ user: { email: "b@x.com" } });
    (prisma.user.findUnique as any).mockResolvedValue({ id: "u1", role: "BRAND" });
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaignclaims.findUnique as any).mockResolvedValue({
      id: VALID_CLAIM_ID,
      campaign_id: "campaign-1",
    });
    (prisma.campaigns.findUnique as any).mockResolvedValue({ brand_id: "brand-1" });
    (prisma.campaignclaims.update as any).mockResolvedValue({
      id: VALID_CLAIM_ID,
      status: "approved",
    });

    const res = await PATCH(patchRequest({ status: "approved" }), ctx(VALID_CLAIM_ID));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      status: "approved",
      claim_id: VALID_CLAIM_ID,
      message: "Claim status updated to approved",
    });
  });

  it("proceeds without an ownership check when the claim has no campaign_id (orphaned claim, matches Python's skip-when-not-found)", async () => {
    (getServerSession as any).mockResolvedValue({ user: { email: "b@x.com" } });
    (prisma.user.findUnique as any).mockResolvedValue({ id: "u1", role: "BRAND" });
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaignclaims.findUnique as any).mockResolvedValue({
      id: VALID_CLAIM_ID,
      campaign_id: null,
    });
    (prisma.campaignclaims.update as any).mockResolvedValue({
      id: VALID_CLAIM_ID,
      status: "rejected",
    });

    const res = await PATCH(patchRequest({ status: "rejected" }), ctx(VALID_CLAIM_ID));

    expect(res.status).toBe(200);
    expect(prisma.campaigns.findUnique).not.toHaveBeenCalled();
  });

  it("returns a fixed 500 message on an unexpected Prisma error, never the raw error text", async () => {
    (getServerSession as any).mockResolvedValue({ user: { email: "b@x.com" } });
    (prisma.user.findUnique as any).mockResolvedValue({ id: "u1", role: "BRAND" });
    (prisma.brandProfile.findUnique as any).mockResolvedValue({ id: "brand-1" });
    (prisma.campaignclaims.findUnique as any).mockRejectedValue(
      new Error("PrismaClientValidationError: full record dump")
    );

    const res = await PATCH(patchRequest({ status: "approved" }), ctx(VALID_CLAIM_ID));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to update application status");
    expect(JSON.stringify(body)).not.toContain("full record dump");
  });
});
