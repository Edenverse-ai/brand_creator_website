import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  resolveBrandNames,
  brandNameFor,
  serializePublicCampaign,
} from "@/lib/campaigns/serialize";

/**
 * Native port of `CampaignService.get_campaigns`
 * (backend/app/main/services/campaign_service.py). Public, unauthenticated — matches
 * Python (campaigns/routes.py has no auth on this route either).
 *
 * Two intentionally-preserved quirks from the Python source, not bugs to fix here:
 *  - `category` is accepted as a query param (matching the Python route signature) but was
 *    never actually used to filter — `CampaignService.get_campaigns` takes `category` and
 *    ignores it. Kept as a dead param for request-shape parity.
 *  - `search` matches against `title` OR the raw `brand_id` string (not `brand_name`) —
 *    genuinely what the Python service does (`str(c.get("brand_id", "")).lower()`).
 *
 * Resilience: `get_campaigns` swallows every internal failure and returns `[]` rather than
 * raising (the only `raise HTTPException` inside it is itself caught by its own outer
 * `except Exception: return []`) — this list endpoint is designed to never hard-fail.
 * Replicated here: any Prisma error also degrades to `[]` at HTTP 200.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const platform = searchParams.get("platform");

  try {
    const campaigns = await prisma.campaigns.findMany({
      where: platform && platform !== "all" ? { platform: platform.toLowerCase() } : undefined,
    });

    const brandNames = await resolveBrandNames(campaigns.map((c) => c.brand_id));

    let rows = campaigns;
    if (search) {
      const searchLower = search.toLowerCase();
      rows = rows.filter(
        (c) =>
          (c.title ?? "").toLowerCase().includes(searchLower) ||
          String(c.brand_id ?? "")
            .toLowerCase()
            .includes(searchLower)
      );
    }

    const result = rows.map((row) =>
      serializePublicCampaign(row, brandNameFor(row.brand_id, brandNames))
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/campaigns failed:", error instanceof Error ? error.name : error);
    return NextResponse.json([]);
  }
}
