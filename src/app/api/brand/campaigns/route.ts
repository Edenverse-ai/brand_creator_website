import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authConfig } from "@/app/api/auth/[...nextauth]/auth.config";
import { prisma } from "@/lib/prisma";
import {
  serializeBrandCampaign,
  fetchClaimsByCampaignIds,
  fetchCreatorsByIds,
  buildListApplication,
} from "@/lib/campaigns/serialize";
import {
  CAMPAIGN_ARRAY_FIELDS,
  combineTierRequirement,
  finalizeCampaignWriteData,
  campaignWriteErrorResponse,
} from "@/lib/campaigns/write";
import { isValidCalendarDateOnly } from "@/lib/campaigns/dates";

/**
 * Multipart branch of campaign creation (`src/app/brandportal/campaigns/new/page.tsx`
 * submits `FormData`, the only actively-used "create campaign" UI). Field-for-field mirror
 * of the pre-port TS proxy's own multipart handling (this normalization to Python's
 * `CampaignCreate` shape was already happening client-side in TS before this port; only the
 * final write target changes, from `fetch(pythonApiUrl)` to `prisma.campaigns.create`).
 *
 * `follower_requirement`/`order_requirement` have no Prisma column Python ever wrote to
 * (phase-4-port-reference.md §1.3.3) and are folded into `creator_tier_requirement`, exactly
 * as before: when neither an existing non-empty array nor a follower/order value survives,
 * the key is deleted outright (not left as whatever `campaignData.creator_tier_requirement`
 * happened to parse to) — this diverges from the JSON branch below on purpose; that is the
 * live, frozen behavior of each branch today, not a bug introduced by this port.
 */
function buildMultipartCreatePayload(formData: FormData): Record<string, unknown> {
  const getStr = (key: string) => formData.get(key) as string | null;

  const campaignData: Record<string, unknown> = {
    title: getStr("title"),
    brief: getStr("brief"),
    requirements: getStr("requirements"),
    budget_range: getStr("budget_range"),
    budget_unit: getStr("budgetUnit"),
    commission: getStr("commission"),
    platform: getStr("platform"),
    deadline: getStr("deadline"),
    max_creators: parseInt(getStr("max_creators") ?? "", 10) || 10,
    is_open: getStr("is_open") === "true",
    sample_video_url: getStr("sample_video_url"),
    industry_category: getStr("industry_category"),
    ad_placement: getStr("ad_placement"),
    campaign_execution_mode: getStr("campaign_execution_mode"),
    language_requirement_for_creators: getStr("language_requirement_for_creators"),
    send_to_creator: getStr("send_to_creator"),
    approved_by_brand: getStr("approved_by_brand"),
    kpi_reference_target: getStr("kpi_reference_target"),
    prohibited_content_warnings: getStr("prohibited_content_warnings"),
    posting_requirements: getStr("posting_requirements"),
    product_photo: getStr("product_photo"),
    script_required: getStr("script_required"),
    product_name: getStr("product_name"),
    product_highlight: getStr("product_highlight"),
    product_price: getStr("product_price"),
    product_sold_number: getStr("product_sold_number"),
    paid_promotion_type: getStr("paid_promotion_type"),
    video_buyout_budget_range: getStr("video_buyout_budget_range"),
    base_fee_budget_range: getStr("base_fee_budget_range"),
    follower_requirement: getStr("follower_requirement"),
    order_requirement: getStr("order_requirement"),
  };

  for (const field of CAMPAIGN_ARRAY_FIELDS) {
    const value = getStr(field);
    if (value) {
      try {
        campaignData[field] = JSON.parse(value);
      } catch {
        campaignData[field] = value;
      }
    }
  }

  const combinedTier = combineTierRequirement(
    campaignData.creator_tier_requirement,
    campaignData.follower_requirement,
    campaignData.order_requirement
  );

  const { follower_requirement: _fr, order_requirement: _or, ...payload } = campaignData;
  if (combinedTier !== undefined) {
    payload.creator_tier_requirement = combinedTier;
  } else {
    delete payload.creator_tier_requirement;
  }

  return payload;
}

/**
 * JSON branch of campaign creation. Same tier-folding idea as the multipart branch, but
 * when neither an array nor a follower/order value survives, it falls back to whatever
 * `creator_tier_requirement` the client originally sent (`combinedTier ?? original`),
 * NOT a delete — matching the pre-port proxy's JSON branch exactly, which differs from its
 * own multipart branch in this one respect.
 */
function buildJsonCreatePayload(data: Record<string, unknown>): Record<string, unknown> {
  const campaignData: Record<string, unknown> = {
    ...data,
    budget_unit: data.budget_unit || data.budgetUnit,
    script_required: data.script_required || "no",
    product_name: data.product_name || "",
    product_highlight: data.product_highlight || "",
    product_price: data.product_price || "",
    product_sold_number: data.product_sold_number || "",
    paid_promotion_type: data.paid_promotion_type || "commission_based",
    video_buyout_budget_range: data.video_buyout_budget_range || "",
    base_fee_budget_range: data.base_fee_budget_range || "",
    product_photo: data.product_photo || data.product_photo_url || data.productPhotoUrl || "",
  };

  const followerRequirement = data.follower_requirement || data.followerRequirement || "";
  const orderRequirement = data.order_requirement || data.orderRequirement || "";
  const combinedTier = combineTierRequirement(
    campaignData.creator_tier_requirement,
    followerRequirement,
    orderRequirement
  );

  const merged: Record<string, unknown> = {
    ...campaignData,
    creator_tier_requirement: combinedTier ?? campaignData.creator_tier_requirement,
  };
  const {
    follower_requirement: _fr1,
    followerRequirement: _fr2,
    order_requirement: _or1,
    orderRequirement: _or2,
    ...payload
  } = merged;

  return payload;
}

/**
 * Native port of `GET /campaigns/brand/{brand_id}`
 * (backend/app/main/routes/campaigns.py -> BrandService.get_brand_campaigns,
 * backend/app/main/services/brand_service.py).
 *
 * Auth: unchanged (already the strongest ownership pattern in this domain — session ->
 * User lookup -> role must be BRAND -> explicit BrandProfile.findUnique ownership
 * pre-check, 403 otherwise). Kept on `authConfig` per phase-4-port-reference.md §0.5.
 *
 * PHANTOM FILTER COLUMNS (confirmed against prisma/schema.prisma and
 * prisma/migrations/20260507000000_add_campaigns_legacy/migration.sql — neither
 * `start_date`/`end_date` nor `status` exist as columns on `campaigns`): today, supplying
 * `status` makes `get_brand_campaigns`'s `.eq("status", ...)` fail at `.execute()` time
 * with an "undefined column" error from Postgrest — there is no guard around it, so ANY
 * value crashes. That exception propagates as an uncaught-by-the-route HTTPException(500),
 * which this route's own `!response.ok` branch then masks to HTTP 200 with
 * `{ error: "API Error: 500", campaigns: [] }` (`response.status === 500 ? 200 :
 * response.status`). Reproduced exactly below rather than silently treating the filter as a
 * no-op (a real behavior change) or inventing the missing columns (out of scope).
 *
 * `start_date`/`end_date` are different: `brand_service.py:39-51` wraps its
 * `datetime.strptime(value, "%Y-%m-%d")` parse in its own `try/except ValueError`, and only
 * calls `.gte("start_date", …)` / `.lte("end_date", …)` (the calls that reference the
 * nonexistent columns) when the parse *succeeds*. A malformed value — `?start_date=notadate`
 * — never reaches those calls, so Python silently skips the filter and the query proceeds,
 * returning the brand's real campaigns. Only a validly-formatted date crashes. Matched via
 * `isValidCalendarDateOnly` (dates.ts), not mere presence of the param.
 *
 * `search` also nominally ORs against a `description` column that likewise does not exist
 * (`c.get("description", "")` always yields `""` in Python), so it is implemented here as a
 * title-only filter — functionally identical to the Python source's OR-against-empty-string.
 */
export async function GET(request: NextRequest) {
  try {
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

    const brandProfile = await prisma.brandProfile.findUnique({ where: { userId: user.id } });
    if (!brandProfile) {
      return NextResponse.json({ error: "Unauthorized - Brand access only" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const startDate = searchParams.get("start_date") || searchParams.get("startDate");
    const endDate = searchParams.get("end_date") || searchParams.get("endDate");
    const status = searchParams.get("status");

    const startDateCrashes = startDate !== null && isValidCalendarDateOnly(startDate);
    const endDateCrashes = endDate !== null && isValidCalendarDateOnly(endDate);

    if (status || startDateCrashes || endDateCrashes) {
      return NextResponse.json({ error: "API Error: 500", campaigns: [] }, { status: 200 });
    }

    const campaigns = await prisma.campaigns.findMany({ where: { brand_id: brandProfile.id } });

    let rows = campaigns;
    if (search && search.trim()) {
      const searchLower = search.toLowerCase();
      rows = rows.filter((c) => (c.title ?? "").toLowerCase().includes(searchLower));
    }

    const claimsByCampaign = await fetchClaimsByCampaignIds(rows.map((c) => c.id));
    const allClaims = Array.from(claimsByCampaign.values()).flat();
    const creators = await fetchCreatorsByIds(allClaims.map((c) => c.creator_id));

    const result = rows.map((campaign) => {
      const claims = claimsByCampaign.get(campaign.id) ?? [];
      const applications = claims.map((claim) => buildListApplication(claim, creators));
      return serializeBrandCampaign(campaign, applications, brandProfile);
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/brand/campaigns failed:", error instanceof Error ? error.name : error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns", campaigns: [] },
      { status: 200 }
    );
  }
}

/**
 * Native port of `POST /campaigns/brand/{brand_id}/add`
 * (backend/app/main/routes/campaigns.py -> CampaignService.create_campaign,
 * backend/app/main/services/campaign_service.py).
 *
 * Auth: unchanged — session -> User lookup -> role BRAND -> explicit BrandProfile
 * ownership pre-check (403 "Brand profile not found" — note this route uses a DIFFERENT
 * message than GET's "Unauthorized - Brand access only" for the identical missing-profile
 * condition; both are preserved exactly as they exist per-handler today, not unified).
 *
 * Python's `create_campaign` has an elaborate auto-vivify fallback that creates a
 * BrandProfile on the fly if none exists — NOT ported, because this TS route already
 * requires a pre-existing BrandProfile (403s otherwise) before ever reaching that logic, so
 * the fallback has been unreachable dead code even in the live proxy
 * (phase-4-port-reference.md §1.2, §6.1). Porting it would change today's actual behavior,
 * not preserve it.
 *
 * SECURITY FIX: the write payload is allowlisted to exactly `CampaignCreate`'s own field set
 * (`finalizeCampaignWriteData`, src/lib/campaigns/write.ts) before it ever reaches Prisma —
 * `CampaignCreate` is `extra="forbid"`, so Python 422s any unlisted key, but this route
 * previously had no equivalent guard and `campaignsCreateInput` has no field-level ACL of
 * its own. Any client-supplied `brand_id` is unconditionally ignored (never allowlisted,
 * always overridden below by the resolved `brandProfile.id`) regardless of the allowlist
 * outcome.
 */
export async function POST(request: NextRequest) {
  try {
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

    const contentType = request.headers.get("content-type") || "";
    let payload: Record<string, unknown>;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      payload = buildMultipartCreatePayload(formData);
    } else {
      const data = await request.json().catch(() => null);
      if (!data || typeof data !== "object") {
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
      }
      payload = buildJsonCreatePayload(data as Record<string, unknown>);
    }

    const outcome = finalizeCampaignWriteData(payload);
    if (!outcome.ok) {
      const { status, body } = campaignWriteErrorResponse(outcome, "create");
      return NextResponse.json(body, { status });
    }

    const created = await prisma.campaigns.create({
      data: {
        ...outcome.data,
        brand_id: brandProfile.id,
      } as unknown as Prisma.campaignsCreateInput,
      select: { id: true },
    });

    return NextResponse.json({
      success: true,
      message: "Campaign created successfully",
      campaign_id: created.id,
      campaign_title: null,
    });
  } catch (error) {
    console.error("Error creating campaign:", error instanceof Error ? error.name : error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
