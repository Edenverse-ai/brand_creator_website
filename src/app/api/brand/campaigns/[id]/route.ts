import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  serializeBrandCampaign,
  fetchCreatorsByIds,
  fetchUsersByIds,
  buildSingularApplication,
} from "@/lib/campaigns/serialize";
import {
  combineTierRequirement,
  finalizeCampaignWriteData,
  campaignWriteErrorResponse,
} from "@/lib/campaigns/write";
import { isValidUuid } from "@/lib/campaigns/validation";

/**
 * Native port of `GET /campaigns/brand/{brand_id}/campaign/{campaign_id}`
 * (backend/app/main/routes/campaigns.py -> BrandService.get_brand_campaign,
 * backend/app/main/services/brand_service.py).
 *
 * SECURITY FIX (intentional, stated per phase-4-port-reference.md §6.7 instructions): the
 * pre-port route checked only `session.user.role === "BRAND"` with no ownership pre-check —
 * it relied implicitly on Python's own `.eq("brand_id", actual_brand_id)` filter (resolved
 * from `session.user.id`) to keep a BRAND user from reading another brand's campaign, which
 * was safe in effect (a foreign campaignId 404s) but had no explicit guard in the TS layer.
 * This adds one: resolve the caller's own BrandProfile, then require
 * `campaigns.findFirst({ id: campaignId, brand_id: brandProfile.id })` to match before
 * returning anything — 404 if the campaign doesn't belong to the caller's brand.
 *
 * RESPONSE SHAPE: `brand` is always `null` here, never the caller's `BrandProfile` row —
 * `BrandService.get_brand_campaign` (brand_service.py:134-238) never sets
 * `campaign["brand"]`; only the *list* function (`get_brand_campaigns`, :110-119) does.
 * `CampaignWithApplications.brand: dict | None = None` is a declared field, so it still
 * serializes as a literal `null`, matching the same list-vs-singular asymmetry already
 * applied to `applications` enrichment (see serialize.ts).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "BRAND") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: campaignId } = await params;
  if (!isValidUuid(campaignId)) {
    return NextResponse.json({ error: "Invalid campaign ID format" }, { status: 400 });
  }

  try {
    const brandProfile = await prisma.brandProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!brandProfile) {
      return NextResponse.json({ error: "Brand profile not found" }, { status: 404 });
    }

    const campaign = await prisma.campaigns.findFirst({
      where: { id: campaignId, brand_id: brandProfile.id },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const claims = await prisma.campaignclaims.findMany({ where: { campaign_id: campaignId } });
    const creators = await fetchCreatorsByIds(claims.map((claim) => claim.creator_id));
    const users = await fetchUsersByIds(
      Array.from(creators.values()).map((creator) => creator.userId)
    );
    const applications = claims.map((claim) => buildSingularApplication(claim, creators, users));

    return NextResponse.json(serializeBrandCampaign(campaign, applications, null));
  } catch (error) {
    console.error(
      `GET /api/brand/campaigns/${campaignId} failed:`,
      error instanceof Error ? error.name : error
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Native port of `PUT /campaigns/brand/{brand_id}/campaign/{campaign_id}`
 * (backend/app/main/routes/campaigns.py -> CampaignService.update_campaign).
 *
 * SECURITY FIX, same shape as GET above: resolves the caller's own BrandProfile and
 * requires `campaigns.findFirst({ id: campaignId, brand_id: brandProfile.id })` before
 * allowing the update, replacing what used to be only a role check with no ownership
 * pre-check.
 *
 * SECURITY FIX: same allowlist as POST (`finalizeCampaignWriteData`) — `brand_id` is always
 * dropped internally (ownership is enforced by the WHERE clause above, never by a
 * client-supplied `brand_id`), and any other key outside `CampaignCreate`'s field set is
 * rejected with a 422 instead of silently reaching Prisma. `CampaignCreate.title` has no
 * default, so Python 422s an update that omits it too (`PUT` is full-resource-replacement
 * semantics here, not a partial `PATCH`) — enforced the same way create is.
 *
 * NOTE (live-caller consequence, not fixed here): `src/app/brandportal/campaigns/[id]/
 * edit/page.tsx` sends `product_photo_url`/`budgetUnit` as top-level body keys, neither of
 * which is a `campaigns` column — that request already 422'd against the real Python
 * backend and would otherwise 500 against this port; with the allowlist it now gets a clean
 * 422 instead. The edit form itself needs a separate fix to stop sending non-column keys —
 * out of scope for this port.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "BRAND") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: campaignId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  try {
    const brandProfile = await prisma.brandProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!brandProfile) {
      return NextResponse.json({ error: "Brand profile not found" }, { status: 404 });
    }

    const existing = await prisma.campaigns.findFirst({
      where: { id: campaignId, brand_id: brandProfile.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found or access denied" }, { status: 404 });
    }

    const raw = body as Record<string, unknown>;
    const followerRequirement = raw.follower_requirement || raw.followerRequirement;
    const orderRequirement = raw.order_requirement || raw.orderRequirement;
    const combinedTier = combineTierRequirement(
      raw.creator_tier_requirement,
      followerRequirement,
      orderRequirement
    );

    const {
      follower_requirement: _fr1,
      followerRequirement: _fr2,
      order_requirement: _or1,
      orderRequirement: _or2,
      ...rest
    } = raw;

    const payload = {
      ...rest,
      ...(combinedTier !== undefined ? { creator_tier_requirement: combinedTier } : {}),
    };

    const outcome = finalizeCampaignWriteData(payload);
    if (!outcome.ok) {
      const { status, body: errorBody } = campaignWriteErrorResponse(outcome, "update");
      return NextResponse.json(errorBody, { status });
    }

    await prisma.campaigns.update({
      where: { id: campaignId },
      data: outcome.data as Prisma.campaignsUpdateInput,
    });

    return NextResponse.json({
      success: true,
      message: "Campaign updated successfully",
      campaign_id: campaignId,
      campaign_title: null,
    });
  } catch (error) {
    console.error(
      `PUT /api/brand/campaigns/${campaignId} failed:`,
      error instanceof Error ? error.name : error
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Native port of `DELETE /campaigns/brand/{brand_id}/campaign/{campaign_id}`
 * (backend/app/main/routes/campaigns.py -> CampaignService.delete_campaign — NOT
 * `BrandService.delete_brand_campaign`, a similarly-named function in brand_service.py that
 * no route actually calls and is not ported; see phase-4-port-reference.md §6.3).
 *
 * SECURITY FIX, same shape as GET/PUT above: explicit ownership pre-check via the caller's
 * own BrandProfile before deleting anything.
 *
 * Claims are deleted first, best-effort (matches Python: a failure to delete
 * `campaignclaims` is logged and swallowed, not fatal — the campaign delete still
 * proceeds). The FK from `campaignclaims.campaign_id` to `campaigns.id` is
 * `onDelete: Cascade` in schema.prisma, so in practice the explicit claims delete below is
 * redundant with Postgres' own cascade — kept anyway to mirror Python's explicit two-step
 * delete precisely.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "BRAND") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: campaignId } = await params;

  try {
    const brandProfile = await prisma.brandProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!brandProfile) {
      return NextResponse.json({ error: "Brand profile not found" }, { status: 404 });
    }

    const existing = await prisma.campaigns.findFirst({
      where: { id: campaignId, brand_id: brandProfile.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found or access denied" }, { status: 404 });
    }

    try {
      await prisma.campaignclaims.deleteMany({ where: { campaign_id: campaignId } });
    } catch (claimsError) {
      console.error(
        `DELETE /api/brand/campaigns/${campaignId}: failed to delete claims`,
        claimsError instanceof Error ? claimsError.name : claimsError
      );
    }

    await prisma.campaigns.delete({ where: { id: campaignId } });

    return NextResponse.json({
      success: true,
      message: "Campaign deleted successfully",
      campaign_id: campaignId,
      campaign_title: null,
    });
  } catch (error) {
    console.error(
      `DELETE /api/brand/campaigns/${campaignId} failed:`,
      error instanceof Error ? error.name : error
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
