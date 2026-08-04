import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/app/api/auth/[...nextauth]/auth.config";
import { prisma } from "@/lib/prisma";
import { isValidUuid } from "@/lib/campaigns/validation";

// The current live/frozen contract: Python's ClaimService.update_claim_status accepts five
// values, but this route has only ever accepted three (400s "under_review"/"completed"
// before they'd reach Python) — phase-4-port-reference.md §6.2 recommends keeping the
// narrower set since that's what browsers actually experience, not silently widening it.
const ALLOWED_STATUSES = ["approved", "rejected", "pending"] as const;

/**
 * Native port of `PATCH /campaign-claims/{claim_id}/status`
 * (backend/app/main/routes/claims.py -> ClaimService.update_claim_status,
 * backend/app/main/services/claim_service.py).
 *
 * SECURITY FIX (intentional contract change, not a byte-for-byte port): Python's own
 * brand-ownership check for this endpoint is dead code. It's written as
 *   if campaign_brand_id != brand_id: raise HTTPException(403, "Unauthorized to update this claim")
 * *inside* a `try` block whose own `except Exception: # Continue without strict
 * verification` sits directly below it with no earlier `except HTTPException: raise` — since
 * HTTPException is an Exception subclass, the 403 it raises is immediately swallowed by its
 * own enclosing handler, so the update always proceeds regardless of brand mismatch. Net
 * effect: identical to Python having no ownership check at all, which is exactly the case
 * the porting task requires a real guard for. This route resolves the caller's own
 * BrandProfile (as before) and now genuinely 403s when the claim's campaign belongs to a
 * different brand, instead of silently allowing it through.
 *
 * All other failure modes (bad claim id format, claim not found) keep the pre-existing
 * generic-500 collapse — the previous proxy never forwarded Python's real status/detail for
 * ANY upstream failure, always responding `{ error: "Failed to update application status" }`
 * @ 500 regardless of cause. Preserved for those cases; only the ownership path gets a real,
 * distinct 403.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: applicationId } = await params;
  if (!applicationId) {
    return NextResponse.json({ error: "Missing application ID" }, { status: 400 });
  }

  const session = await getServerSession(authConfig);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  });
  if (!user || user.role !== "BRAND") {
    return NextResponse.json({ error: "Unauthorized - Brand access only" }, { status: 403 });
  }

  const brandProfile = await prisma.brandProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!brandProfile) {
    return NextResponse.json({ error: "Brand profile not found" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const status =
    body && typeof body === "object" ? (body as Record<string, unknown>).status : undefined;
  if (
    typeof status !== "string" ||
    !ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])
  ) {
    return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
  }

  try {
    if (!isValidUuid(applicationId)) {
      return NextResponse.json({ error: "Failed to update application status" }, { status: 500 });
    }

    const claim = await prisma.campaignclaims.findUnique({
      where: { id: applicationId },
      select: { id: true, campaign_id: true },
    });
    if (!claim) {
      return NextResponse.json({ error: "Failed to update application status" }, { status: 500 });
    }

    if (claim.campaign_id) {
      const campaign = await prisma.campaigns.findUnique({
        where: { id: claim.campaign_id },
        select: { brand_id: true },
      });
      if (campaign && campaign.brand_id !== brandProfile.id) {
        return NextResponse.json({ error: "Unauthorized to update this claim" }, { status: 403 });
      }
    }

    const updated = await prisma.campaignclaims.update({
      where: { id: applicationId },
      data: { status },
      select: { id: true, status: true },
    });

    return NextResponse.json({
      success: true,
      status: updated.status,
      claim_id: updated.id,
      message: `Claim status updated to ${updated.status}`,
    });
  } catch (error) {
    console.error(
      "PATCH /api/applications/[id]/status failed:",
      error instanceof Error ? error.name : error
    );
    return NextResponse.json({ error: "Failed to update application status" }, { status: 500 });
  }
}
