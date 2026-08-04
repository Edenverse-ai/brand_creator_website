import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  resolveBrandNames,
  brandNameFor,
  serializePublicCampaign,
} from "@/lib/campaigns/serialize";
import { isValidUuid } from "@/lib/campaigns/validation";

/**
 * Native port of `CampaignService.get_campaign_by_id`
 * (backend/app/main/services/campaign_service.py). Public, unauthenticated, only returns
 * open campaigns (`is_open = true`) — matches Python's `.eq("is_open", True)` filter.
 *
 * Unlike the list endpoint, this one does NOT swallow errors to an empty success shape —
 * Python raises real HTTPExceptions here (400 invalid id, 404 not found, 500 db error) with
 * no outer catch-all, so those three statuses are the frozen error contract. The previous
 * TS proxy's extra branches (403/non-JSON/parse-failure handling) were artifacts of the
 * now-removed HTTP hop to Python and have no native equivalent.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params;

  if (!isValidUuid(campaignId)) {
    return NextResponse.json({ error: "Invalid campaign ID format" }, { status: 400 });
  }

  try {
    const campaign = await prisma.campaigns.findFirst({
      where: { id: campaignId, is_open: true },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const brandNames = await resolveBrandNames([campaign.brand_id]);
    const result = serializePublicCampaign(campaign, brandNameFor(campaign.brand_id, brandNames));
    return NextResponse.json(result);
  } catch (error) {
    console.error(
      `GET /api/campaigns/${campaignId} failed:`,
      error instanceof Error ? error.name : error
    );
    return NextResponse.json({ error: "Database error fetching campaign" }, { status: 500 });
  }
}
