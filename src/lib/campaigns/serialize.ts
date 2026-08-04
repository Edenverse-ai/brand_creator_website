import { prisma } from "@/lib/prisma";
import type { BrandProfile, CreatorProfile, User, campaigns, campaignclaims } from "@prisma/client";
import { formatDateOnly } from "./dates";

const UNKNOWN_BRAND = "Unknown Brand";

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

/** Batched companyName lookup for the public campaign list/detail `brand_name` join. */
export async function resolveBrandNames(
  brandIds: Array<string | null>
): Promise<Map<string, string>> {
  const ids = uniqueIds(brandIds);
  if (ids.length === 0) return new Map();
  const brands = await prisma.brandProfile.findMany({
    where: { id: { in: ids } },
    select: { id: true, companyName: true },
  });
  return new Map(brands.map((brand) => [brand.id, brand.companyName]));
}

export function brandNameFor(
  brandId: string | null | undefined,
  names: Map<string, string>
): string {
  if (!brandId) return UNKNOWN_BRAND;
  return names.get(brandId) ?? UNKNOWN_BRAND;
}

/**
 * Base field set shared by every campaign response shape: every raw `campaigns` column
 * (mirrors Python's `select("*")` + `Campaign`'s `extra="allow"`, which passes real-but-
 * unmodeled columns like `follower_requirement`/`order_requirement` straight through
 * instead of stripping them) with `deadline` reformatted from a Prisma `Date` back to
 * "YYYY-MM-DD" (see dates.ts — the deadline read/write hazard).
 */
export function baseCampaignJson(row: campaigns): Record<string, unknown> {
  return { ...row, deadline: formatDateOnly(row.deadline) };
}

/** GET /api/campaigns, GET /api/campaigns/[id] — public shape: base fields + brand_name. */
export function serializePublicCampaign(
  row: campaigns,
  brandName: string
): Record<string, unknown> {
  return { ...baseCampaignJson(row), brand_name: brandName };
}

/**
 * GET/POST /api/brand/campaigns, GET/PUT/DELETE /api/brand/campaigns/[id] — brand-scoped
 * shape. `brand_service.py`'s `get_brand_campaigns`/`get_brand_campaign` never set
 * `brand_name` (only the public `campaign_service.py` functions do), but
 * `CampaignWithApplications` extends `Campaign`, which declares
 * `brand_name: str | None = None` — FastAPI's response_model serializes every declared
 * field regardless, so the key is always present as a literal `null` here, never real data
 * and never omitted. `applications` defaults to `[]`, `brand` to `null`, same reasoning.
 */
export function serializeBrandCampaign(
  row: campaigns,
  applications: Record<string, unknown>[],
  brand: BrandProfile | null
): Record<string, unknown> {
  return {
    ...baseCampaignJson(row),
    brand_name: null,
    applications,
    brand: brand ?? null,
  };
}

export type CreatorLookup = Map<string, CreatorProfile>;
export type UserLookup = Map<string, Pick<User, "id" | "name" | "email" | "image">>;

export async function fetchCreatorsByIds(ids: Array<string | null>): Promise<CreatorLookup> {
  const idList = uniqueIds(ids);
  if (idList.length === 0) return new Map();
  const rows = await prisma.creatorProfile.findMany({ where: { id: { in: idList } } });
  return new Map(rows.map((row) => [row.id, row]));
}

export async function fetchUsersByIds(ids: Array<string | null>): Promise<UserLookup> {
  const idList = uniqueIds(ids);
  if (idList.length === 0) return new Map();
  const rows = await prisma.user.findMany({
    where: { id: { in: idList } },
    select: { id: true, name: true, email: true, image: true },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * List-mode application shape (`BrandService.get_brand_campaigns`): raw `campaignclaims`
 * row + a raw `CreatorProfile` row under `creator` IFF `creator_id` resolves. `creator` is
 * always a *present* key, `null` when unresolved — `CampaignApplication.creator: dict |
 * None = None` (models/campaign.py:104) is a declared field, so FastAPI's response_model
 * serializes it as a literal `null` when the source dict never set it, the same
 * present-as-null rule already applied to `brand_name` elsewhere in this file. No
 * username/email/image enrichment at this level (that only happens in the singular by-id
 * lookup below).
 */
export function buildListApplication(
  claim: campaignclaims,
  creators: CreatorLookup
): Record<string, unknown> {
  const creator = claim.creator_id ? creators.get(claim.creator_id) : undefined;
  return { ...claim, creator: creator ?? null };
}

/**
 * Singular-mode application shape (`BrandService.get_brand_campaign`): raw `campaignclaims`
 * row + `creator` (raw `CreatorProfile` row, or `null` when unresolved — see
 * `buildListApplication` above for why `null` and not an omitted key) IFF `creator_id`
 * resolves, further enriched with `username`/`email`/`image` (renamed from
 * `User.name`/`email`/`image`) and a nested `user` sub-object IFF that creator's `userId`
 * also resolves to a `User` row. Each enrichment layer is additive-only — a failed inner
 * lookup still yields the outer shape.
 */
export function buildSingularApplication(
  claim: campaignclaims,
  creators: CreatorLookup,
  users: UserLookup
): Record<string, unknown> {
  const creatorRow = claim.creator_id ? creators.get(claim.creator_id) : undefined;
  if (!creatorRow) return { ...claim, creator: null };

  const user = creatorRow.userId ? users.get(creatorRow.userId) : undefined;
  const creator = user
    ? { ...creatorRow, username: user.name, email: user.email, image: user.image, user }
    : { ...creatorRow };

  return { ...claim, creator };
}

/** Groups campaignclaims rows by campaign_id for the brand campaigns list endpoint. */
export async function fetchClaimsByCampaignIds(
  campaignIds: string[]
): Promise<Map<string, campaignclaims[]>> {
  const byCampaign = new Map<string, campaignclaims[]>();
  if (campaignIds.length === 0) return byCampaign;
  const claims = await prisma.campaignclaims.findMany({
    where: { campaign_id: { in: campaignIds } },
  });
  for (const claim of claims) {
    if (!claim.campaign_id) continue;
    const list = byCampaign.get(claim.campaign_id) ?? [];
    list.push(claim);
    byCampaign.set(claim.campaign_id, list);
  }
  return byCampaign;
}
