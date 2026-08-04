import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/app/api/auth/[...nextauth]/auth.config";
import { prisma } from "@/lib/prisma";
import { isValidUuid } from "@/lib/campaigns/validation";

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * Native port of `POST /campaign-claims`
 * (backend/app/main/routes/claims.py -> ClaimService.create_campaign_claim,
 * backend/app/main/services/claim_service.py).
 *
 * Auth: unchanged from the pre-existing route — session required, CREATOR role required.
 * Kept on `authConfig` (not `authOptions`) because this route already used it before the
 * port (phase-4-port-reference.md §0.5: don't unify the two NextAuth configs as part of
 * this task). No additional creator_id ownership check was added: the creator identity is
 * derived exclusively from `session.user.id`, never from client-supplied input, so there is
 * nothing a caller could spoof here — already safe by construction.
 *
 * Frozen quirks preserved on purpose (see phase-4-port-reference.md §6.3):
 *  - A duplicate application (`already_applied` in claim_service.py) is NOT surfaced as an
 *    error — it collapses into the exact same success response as a fresh application,
 *    echoing the pre-existing claim id. This reads like a bug; it is the live contract, and
 *    the task instructs preserving it exactly.
 *  - Every failure path below HTTP 400 (validation, not-found, unexpected Prisma error)
 *    responds with HTTP 500, never 404/403 — the previous proxy only ever branched on
 *    `!response.ok` and funneled every non-2xx Python response into one `throw`, always
 *    caught by a single 500 handler regardless of Python's real status code. Preserved
 *    exactly rather than "corrected" to more accurate statuses.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authConfig);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (session.user.role !== "CREATOR") {
    return NextResponse.json({ error: "Only creators can apply to campaigns" }, { status: 403 });
  }

  const userId = session.user.id;
  if (!userId) {
    return NextResponse.json({ error: "User ID not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const campaignId =
    body && typeof body === "object" ? (body as Record<string, unknown>).campaignId : undefined;

  if (!campaignId || typeof campaignId !== "string") {
    return NextResponse.json({ error: "Campaign ID is required" }, { status: 400 });
  }

  const sampleText = toNullableString((body as Record<string, unknown>).sampleText);
  const sampleVideoUrl = toNullableString((body as Record<string, unknown>).sampleVideoUrl);

  try {
    if (!isValidUuid(campaignId)) {
      return NextResponse.json({ error: "Invalid campaign ID format" }, { status: 500 });
    }

    const creator = await prisma.creatorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 500 });
    }

    const existingClaim = await prisma.campaignclaims.findFirst({
      where: { campaign_id: campaignId, creator_id: creator.id },
      select: { id: true },
    });
    if (existingClaim) {
      return NextResponse.json({
        status: "success",
        message: "Application submitted successfully!",
        claimId: existingClaim.id,
      });
    }

    const campaign = await prisma.campaigns.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 500 });
    }

    const created = await prisma.campaignclaims.create({
      data: {
        campaign_id: campaignId,
        creator_id: creator.id,
        status: "pending",
        sample_text: sampleText,
        sample_video_url: sampleVideoUrl,
      },
      select: { id: true },
    });

    return NextResponse.json({
      status: "success",
      message: "Application submitted successfully!",
      claimId: created.id,
    });
  } catch (error) {
    console.error("POST /api/campaigns/apply failed:", error instanceof Error ? error.name : error);
    return NextResponse.json({ error: "Failed to apply for campaign" }, { status: 500 });
  }
}
