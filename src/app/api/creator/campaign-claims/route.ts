import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/app/api/auth/[...nextauth]/auth.config";
import { prisma } from "@/lib/prisma";
import { resolveBrandNames } from "@/lib/campaigns/serialize";
import { serializeCreatorClaim } from "@/lib/campaigns/claims";

// Python default (ClaimService.get_creator_campaign_claims(creator_id, limit=10)) — the
// previous proxy never forwarded a `limit` query param, so every caller always got exactly
// this default. Preserved as a fixed value rather than exposing a new param.
const DEFAULT_CLAIM_LIMIT = 10;

/**
 * Native port of `GET /creator/{creator_id}/campaign-claims`
 * (backend/app/main/routes/claims.py -> ClaimService.get_creator_campaign_claims,
 * backend/app/main/services/claim_service.py).
 *
 * Auth: unchanged — session required, CREATOR role required, scoped directly to
 * `session.user.id`. No additional creator_id ownership check was added: there is no
 * client-supplied creator_id anywhere in this route to spoof (it's always the session's own
 * id), so it was already safe by construction.
 *
 * Resilience: Python's implementation has a narrow inner/outer exception split where almost
 * every failure (the claims fetch itself, and each per-claim campaign/brand lookup) is
 * already caught internally and degrades to `return []`; only a failure in the initial
 * CreatorProfile lookup escapes to an outer `raise HTTPException(500)` — which the previous
 * TS proxy actually never surfaced faithfully anyway (it threw its own hardcoded
 * "Failed to fetch campaign claims" message regardless of Python's real error body). Since
 * going native collapses Python's two-tier try/except into one Prisma call graph, this
 * mirrors the DOMINANT behavior: any failure here returns `[]` at HTTP 200, matching what
 * Python does for the overwhelming majority of its own failure modes.
 */
export async function GET() {
  const session = await getServerSession(authConfig);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (session.user.role !== "CREATOR") {
    return NextResponse.json({ error: "Only creators can view campaign claims" }, { status: 403 });
  }

  try {
    const creator = await prisma.creatorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!creator) {
      return NextResponse.json([]);
    }

    const claims = await prisma.campaignclaims.findMany({
      where: { creator_id: creator.id },
      orderBy: { created_at: "desc" },
      take: DEFAULT_CLAIM_LIMIT,
    });
    if (claims.length === 0) {
      return NextResponse.json([]);
    }

    const campaignIds = Array.from(
      new Set(claims.map((claim) => claim.campaign_id).filter((id): id is string => Boolean(id)))
    );
    const campaigns =
      campaignIds.length > 0
        ? await prisma.campaigns.findMany({ where: { id: { in: campaignIds } } })
        : [];
    const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
    const brandNames = await resolveBrandNames(campaigns.map((campaign) => campaign.brand_id));

    const result = claims.map((claim) =>
      serializeCreatorClaim(
        claim,
        claim.campaign_id ? (campaignById.get(claim.campaign_id) ?? null) : null,
        brandNames
      )
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      "GET /api/creator/campaign-claims failed:",
      error instanceof Error ? error.name : error
    );
    return NextResponse.json([]);
  }
}
