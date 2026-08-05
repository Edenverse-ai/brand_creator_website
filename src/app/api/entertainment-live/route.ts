import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { entertainmentLiveListLimiter } from "@/lib/rate-limiter";
import { buildNicheTagsWriteField, numberToWriteField, presence, serializeMission } from "./shared";

// ---------------------------------------------------------------------------
// GET / — list, field-for-field port of backend/app/main/routes/entertainment.py
// get_entertainment_live_missions + services/entertainment_live.py
// EntertainmentLiveService.get_entertainment_live_missions onto Prisma
// `entertainment_live`. Public/unauthenticated (porting reference §5.6 — zero
// auth in the Python source for this verb); zod validation + a dedicated
// rate limiter (src/lib/rate-limiter.ts) stand in for a session guard.
// ---------------------------------------------------------------------------

// Field-for-field mirror of the query params GET / accepts
// (routes/entertainment.py get_entertainment_live_missions): search/platform/
// region/reward_model: str | None, limit: int = Query(50, ge=1, le=100).
const ListQuerySchema = z.object({
  search: z.string().optional(),
  platform: z.string().optional(),
  region: z.string().optional(),
  reward_model: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * One batched query in place of Python's N+1 per-row BrandProfile lookups
 * (entertainment_live.py:71-91). Returns `null` (rather than an empty Map) when
 * the batched query itself throws, so callers can distinguish "queried, brand row
 * just doesn't exist" (-> "Unknown Brand", matches Python's not-found `else`
 * branch) from "the lookup itself failed" (-> `Brand {id}`, matches Python's
 * `except Exception` branch, entertainment_live.py:87-90 — note this is a
 * LIST-only fallback string; get_entertainment_live_mission_by_id's own except
 * uses "Unknown Brand" for both cases, see [id]/route.ts).
 */
async function lookupBrandNames(brandIds: string[]): Promise<Map<string, string> | null> {
  if (brandIds.length === 0) return new Map();
  try {
    const profiles = await prisma.brandProfile.findMany({
      where: { id: { in: brandIds } },
      select: { id: true, companyName: true },
    });
    return new Map(profiles.map((profile) => [profile.id, profile.companyName]));
  } catch (error) {
    console.error("entertainment-live: brand lookup failed", {
      name: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (entertainmentLiveListLimiter.isRateLimited(`entertainment-live-list:${ip}`)) {
    return NextResponse.json(
      { error: "Too many requests", message: "Please try again later." },
      { status: 429 }
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const parsed = ListQuerySchema.safeParse({
    search: searchParams.get("search") ?? undefined,
    platform: searchParams.get("platform") ?? undefined,
    region: searchParams.get("region") ?? undefined,
    reward_model: searchParams.get("reward_model") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        message: "limit must be an integer between 1 and 100.",
      },
      { status: 400 }
    );
  }
  const { search, platform, region, reward_model: rewardModel, limit } = parsed.data;

  try {
    // Mirrors the Supabase filter chain exactly, including `platform.lower()`
    // (services/entertainment_live.py:46) — an EXACT match against the lowercased
    // input, not a case-insensitive contains; region_priority/reward_model stay
    // case-sensitive exact matches, only platform gets lowercased.
    const where: Prisma.entertainment_liveWhereInput = {};
    if (platform && platform !== "all") where.platform = platform.toLowerCase();
    if (region && region !== "all") where.region_priority = region;
    if (rewardModel && rewardModel !== "all") where.reward_model = rewardModel;
    if (search && search.trim()) {
      where.OR = [
        { task_title: { contains: search, mode: "insensitive" } },
        { campaign_objective: { contains: search, mode: "insensitive" } },
      ];
    }

    const missions = await prisma.entertainment_live.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
    });

    const brandIds = Array.from(
      new Set(missions.map((mission) => mission.brand_id).filter((id): id is string => Boolean(id)))
    );
    const brandNames = await lookupBrandNames(brandIds);

    const result = missions.map((mission) => {
      const brandName = !mission.brand_id
        ? "Unknown Brand"
        : brandNames === null
          ? `Brand ${mission.brand_id}`
          : (brandNames.get(mission.brand_id) ?? "Unknown Brand");
      return serializeMission(mission, brandName);
    });

    // response_model=list[EntertainmentLive] — a bare array, not wrapped.
    return NextResponse.json(result);
  } catch (error) {
    // Field-for-field preservation of a deliberate, currently-live behavior
    // (porting reference §5.3): "never hard-fail the missions list." Python's own
    // service already swallows several failure modes to a bare `[]` (no
    // supabase/table/permission-denied) but genuinely raises HTTPException(500) on
    // a real query error — which the CURRENT proxy then masks into exactly this
    // `{error: "API Error: 500", missions: []}` @ 200 shape. That masking must be
    // preserved exactly per the reference; the proxy's OTHER masked path (a
    // network exception reaching the Python process at all) has no equivalent
    // once this is native Prisma, so only this one shape survives.
    console.error("entertainment-live: failed to list missions", {
      name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json({ error: "API Error: 500", missions: [] }, { status: 200 });
  }
}

// ---------------------------------------------------------------------------
// POST / — create, field-for-field port of
// add_entertainment_live_mission + EntertainmentLiveService.create_entertainment_live_mission.
// The current TS proxy already requires a BRAND-role session even though Python's
// own endpoint has zero auth (porting reference §5.6 — "Python was effectively
// public but the data is user-scoped"); that stricter guard is preserved exactly,
// not relaxed to match Python. brand_id always resolves from the CALLING
// session's own user id (never a client-supplied value — entertainment-live/
// route.ts:85 previously, same here), so this route is safe as designed.
// ---------------------------------------------------------------------------

// Field-for-field mirror of EntertainmentLiveCreate (models/entertainment_live.py).
// brand_id is accepted (Python's Pydantic model requires the key) but never read —
// the service always overwrites it with the resolved BrandProfile id, so making it
// optional here changes no observable behavior. Numeric/date fields use z.coerce
// to match Pydantic's own permissive non-strict coercion (e.g. a numeric string
// for follower_min); `.nullish()` is checked BEFORE the inner coerce runs, so an
// explicit `null` is never accidentally coerced (`Number(null)`/`new Date(null)`
// would silently produce 0 / epoch).
const CreateMissionBody = z.object({
  task_title: z.string(),
  brand_id: z.string().optional(),
  campaign_objective: z.string().nullish(),
  platform: z.string().nullish(),
  task_start_at: z.coerce.date().nullish(),
  task_end_at: z.coerce.date().nullish(),
  follower_min: z.coerce.number().int().nullish(),
  follower_max: z.coerce.number().int().nullish(),
  niche_tags: z.union([z.array(z.string()), z.string()]).nullish(),
  region_priority: z.string().nullish(),
  content_quality_floor: z.string().nullish(),
  deliverables: z.string().nullish(),
  mandatory_elements: z.string().nullish(),
  creative_guidelines: z.string().nullish(),
  prohibited_elements: z.string().nullish(),
  reward_model: z.string().nullish(),
  fixed_reward: z.coerce.number().nullish(),
  tiered_table: z.string().nullish(),
  cps_rate: z.coerce.number().nullish(),
  kpi_baseline: z.string().nullish(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "BRAND") {
    return NextResponse.json({ error: "Unauthorized - Brand access only" }, { status: 403 });
  }

  const parsed = CreateMissionBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const body = parsed.data;

  try {
    // Resolves via userId only — Python's own two-step lookup (try BrandProfile.id
    // == brand_id first, then fall back to BrandProfile.userId == brand_id,
    // create_entertainment_live_mission, entertainment_live.py:192-217) only ever
    // reaches its SECOND branch here, because the value it's called with is always
    // session.user.id (a User id), which cannot coincidentally equal a BrandProfile
    // id (independently random cuids). Replicating the always-dead first branch
    // would add complexity with no observable behavior difference.
    const brandProfile = await prisma.brandProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!brandProfile) {
      return NextResponse.json(
        {
          error: "Failed to create entertainment live mission",
          details: { detail: `Brand profile not found for ID: ${session.user.id}` },
        },
        { status: 404 }
      );
    }

    const now = new Date();
    const mission = await prisma.entertainment_live.create({
      data: {
        task_title: presence(body.task_title),
        brand_id: brandProfile.id,
        campaign_objective: presence(body.campaign_objective),
        platform: presence(body.platform),
        task_start_at: body.task_start_at ?? undefined,
        task_end_at: body.task_end_at ?? undefined,
        follower_min: numberToWriteField(body.follower_min),
        follower_max: numberToWriteField(body.follower_max),
        niche_tags: buildNicheTagsWriteField(body.niche_tags),
        region_priority: presence(body.region_priority),
        content_quality_floor: presence(body.content_quality_floor),
        deliverables: presence(body.deliverables),
        mandatory_elements: presence(body.mandatory_elements),
        creative_guidelines: presence(body.creative_guidelines),
        prohibited_elements: presence(body.prohibited_elements),
        reward_model: presence(body.reward_model),
        fixed_reward: numberToWriteField(body.fixed_reward),
        tiered_table: presence(body.tiered_table),
        cps_rate: numberToWriteField(body.cps_rate),
        kpi_baseline: presence(body.kpi_baseline),
        // created_at/updated_at: DateTime @db.Timestamptz(6) columns (verified —
        // neither is the `@db.Date` crash class), explicitly set on create per
        // Python (entertainment_live.py:230-231). Always a real Date object at the
        // write boundary, per this task's hard requirement, rather than a
        // `.toISOString()` string — Prisma's generated input type (`Date | string`)
        // wouldn't catch the mistake either way.
        created_at: now,
        updated_at: now,
      },
      select: { id: true },
    });

    return NextResponse.json({
      success: true,
      message: "Entertainment live mission created successfully",
      data: { mission_id: mission.id },
    });
  } catch (error) {
    // Never echo the underlying error to the caller (this task's hard
    // requirement — Prisma error objects, incl. PrismaClientValidationError, can
    // embed the entire attempted record). Only the error's name/code is logged.
    // The `{error, details: {detail}}` envelope shape matches what the pre-existing
    // proxy already produced for ANY non-2xx Python response; the `detail` TEXT is
    // fixed/generic here even though Python's own service-layer catches
    // (entertainment_live.py:224-226, 254-256) leak `str(db_error)` — that leak is
    // exactly the class of bug this task calls out, not a contract worth preserving.
    const errorCode =
      error && typeof error === "object" && "code" in error
        ? (error as { code: unknown }).code
        : undefined;
    console.error("entertainment-live: failed to create mission", {
      name: error instanceof Error ? error.name : typeof error,
      ...(errorCode === undefined ? {} : { code: errorCode }),
    });
    return NextResponse.json(
      {
        error: "Failed to create entertainment live mission",
        details: { detail: "Database error" },
      },
      { status: 500 }
    );
  }
}
