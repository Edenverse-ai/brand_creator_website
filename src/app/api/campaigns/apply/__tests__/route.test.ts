import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/app/api/auth/[...nextauth]/auth.config", () => ({ authConfig: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    creatorProfile: { findUnique: vi.fn() },
    campaignclaims: { findFirst: vi.fn(), create: vi.fn() },
    campaigns: { findUnique: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const VALID_CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440000";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/campaigns/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/campaigns/apply", () => {
  it("returns 401 when there is no session", async () => {
    (getServerSession as any).mockResolvedValue(null);

    const res = await POST(jsonRequest({ campaignId: VALID_CAMPAIGN_ID }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Authentication required" });
  });

  it("returns 403 when the session user is not a CREATOR", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "u1", role: "BRAND" } });

    const res = await POST(jsonRequest({ campaignId: VALID_CAMPAIGN_ID }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only creators can apply to campaigns" });
  });

  it("returns 400 when campaignId is missing", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "u1", role: "CREATOR" } });

    const res = await POST(jsonRequest({}));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Campaign ID is required" });
  });

  it("returns 500 'Invalid campaign ID format' for a malformed campaignId (status collapsed to 500, matching the live proxy)", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "u1", role: "CREATOR" } });

    const res = await POST(jsonRequest({ campaignId: "not-a-uuid" }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Invalid campaign ID format" });
  });

  it("returns 500 'Creator not found' when the session user has no CreatorProfile", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "u1", role: "CREATOR" } });
    (prisma.creatorProfile.findUnique as any).mockResolvedValue(null);

    const res = await POST(jsonRequest({ campaignId: VALID_CAMPAIGN_ID }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Creator not found" });
  });

  it("collapses an already-applied claim into the same success response as a fresh application", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "u1", role: "CREATOR" } });
    (prisma.creatorProfile.findUnique as any).mockResolvedValue({ id: "creator-1" });
    (prisma.campaignclaims.findFirst as any).mockResolvedValue({ id: "existing-claim-id" });

    const res = await POST(jsonRequest({ campaignId: VALID_CAMPAIGN_ID }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "success",
      message: "Application submitted successfully!",
      claimId: "existing-claim-id",
    });
    expect(prisma.campaignclaims.create).not.toHaveBeenCalled();
  });

  it("returns 500 'Campaign not found' when the campaign does not exist", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "u1", role: "CREATOR" } });
    (prisma.creatorProfile.findUnique as any).mockResolvedValue({ id: "creator-1" });
    (prisma.campaignclaims.findFirst as any).mockResolvedValue(null);
    (prisma.campaigns.findUnique as any).mockResolvedValue(null);

    const res = await POST(jsonRequest({ campaignId: VALID_CAMPAIGN_ID }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Campaign not found" });
  });

  it("creates a new claim with status pending and the resolved creator id", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "u1", role: "CREATOR" } });
    (prisma.creatorProfile.findUnique as any).mockResolvedValue({ id: "creator-1" });
    (prisma.campaignclaims.findFirst as any).mockResolvedValue(null);
    (prisma.campaigns.findUnique as any).mockResolvedValue({ id: VALID_CAMPAIGN_ID });
    (prisma.campaignclaims.create as any).mockResolvedValue({ id: "new-claim-id" });

    const res = await POST(
      jsonRequest({
        campaignId: VALID_CAMPAIGN_ID,
        sampleText: "my sample",
        sampleVideoUrl: "https://v.mp4",
      })
    );

    expect(prisma.campaignclaims.create).toHaveBeenCalledWith({
      data: {
        campaign_id: VALID_CAMPAIGN_ID,
        creator_id: "creator-1",
        status: "pending",
        sample_text: "my sample",
        sample_video_url: "https://v.mp4",
      },
      select: { id: true },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "success",
      message: "Application submitted successfully!",
      claimId: "new-claim-id",
    });
  });

  it("defaults sampleText/sampleVideoUrl to null when omitted", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "u1", role: "CREATOR" } });
    (prisma.creatorProfile.findUnique as any).mockResolvedValue({ id: "creator-1" });
    (prisma.campaignclaims.findFirst as any).mockResolvedValue(null);
    (prisma.campaigns.findUnique as any).mockResolvedValue({ id: VALID_CAMPAIGN_ID });
    (prisma.campaignclaims.create as any).mockResolvedValue({ id: "new-claim-id" });

    await POST(jsonRequest({ campaignId: VALID_CAMPAIGN_ID }));

    expect(prisma.campaignclaims.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sample_text: null, sample_video_url: null }),
      })
    );
  });

  it("returns a fixed 500 message on an unexpected Prisma error, never the raw error text", async () => {
    (getServerSession as any).mockResolvedValue({ user: { id: "u1", role: "CREATOR" } });
    (prisma.creatorProfile.findUnique as any).mockRejectedValue(
      new Error("PrismaClientValidationError: dumps the full attempted record here")
    );

    const res = await POST(jsonRequest({ campaignId: VALID_CAMPAIGN_ID }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to apply for campaign");
    expect(JSON.stringify(body)).not.toContain("dumps the full attempted record");
  });
});
