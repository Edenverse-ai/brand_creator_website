import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { entertainmentLiveDetailLimiter } from "@/lib/rate-limiter";
import { serializeMission } from "../shared";

// Python's validate_uuid() (backend/app/main/utils/validators.py) delegates to
// stdlib `uuid.UUID(str)`, which accepts any RFC 4122 version (the version/variant
// nibbles are unconstrained) as well as hyphen-less, braced, and urn:uuid:-prefixed
// forms. zod v4's built-in `.uuid()` is the OPPOSITE mistake here: verified by
// direct testing, it enforces the version (`[1-8]`) AND variant (`[89ab]`) nibbles
// per RFC 4122 and rejects anything else — e.g. "11111111-1111-1111-1111-
// 111111111111" fails it, even though Python's uuid.UUID() accepts that string
// fine. That's STRICTER than Python, not just differently-shaped, and could 400 a
// legitimate id Python would have served (e.g. a pre-existing row not seeded via
// Postgres's `gen_random_uuid()`, which does always produce valid v4 nibbles, but
// nothing guarantees every row in the table was created that way). Every id is
// still always looked up in canonical 8-4-4-4-12 hex form (the only shape
// `.eq("id", ...)` could ever match), so this uses a plain canonical-form regex
// instead of zod's stricter helper — permissive on version/variant like Python,
// strict on the hyphenated-hex shape like the DB requires.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MissionIdSchema = z.string().regex(UUID_PATTERN);

/**
 * Native port of GET /{mission_id} (backend/app/main/routes/entertainment.py
 * get_entertainment_live_mission_by_id + services/entertainment_live.py
 * EntertainmentLiveService.get_entertainment_live_mission_by_id) onto Prisma
 * `entertainment_live`. Public/unauthenticated (porting reference §5.6 — zero
 * auth in the Python source for this verb); zod validation + a dedicated rate
 * limiter (src/lib/rate-limiter.ts) stand in for a session guard.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (entertainmentLiveDetailLimiter.isRateLimited(`entertainment-live-detail:${ip}`)) {
    return NextResponse.json(
      { error: "Too many requests", message: "Please try again later." },
      { status: 429 }
    );
  }

  const { id } = await params;

  const idResult = MissionIdSchema.safeParse(id);
  if (!idResult.success) {
    // Mirrors the current LIVE contract exactly, and unlike the request-body
    // validation cases elsewhere in this port, this one isn't a FastAPI
    // auto-generated 422 (porting reference §0.7 carve-out doesn't apply here):
    // Python's validate_uuid() deliberately raises HTTPException(400, "Invalid
    // mission ID format") before ever touching the database, and the pre-existing
    // TS proxy's own non-404 branch turns ANY non-2xx Python status into the
    // generic `{error: "API Error: <status>"}` (it never forwards Python's actual
    // `detail` text) — so a malformed id has always surfaced as exactly this body.
    return NextResponse.json({ error: "API Error: 400" }, { status: 400 });
  }

  try {
    const mission = await prisma.entertainment_live.findUnique({ where: { id: idResult.data } });
    if (!mission) {
      return NextResponse.json({ error: "Mission not found" }, { status: 404 });
    }

    // Single lookup, not batched (only one row here) — both the "no matching
    // BrandProfile row" and "the lookup itself threw" cases fall back to the SAME
    // "Unknown Brand" string for this endpoint specifically (unlike the list
    // endpoint's LIST-only `Brand {id}` exception fallback — see route.ts's
    // lookupBrandNames for that asymmetry, confirmed against
    // entertainment_live.py:146-161 vs. :71-91).
    let brandName = "Unknown Brand";
    if (mission.brand_id) {
      try {
        const brandProfile = await prisma.brandProfile.findUnique({
          where: { id: mission.brand_id },
          select: { companyName: true },
        });
        brandName = brandProfile?.companyName ?? "Unknown Brand";
      } catch (error) {
        console.error("entertainment-live: brand lookup failed", {
          name: error instanceof Error ? error.name : typeof error,
        });
        brandName = "Unknown Brand";
      }
    }

    return NextResponse.json(serializeMission(mission, brandName));
  } catch (error) {
    // Never echo the underlying error (same hard requirement as route.ts's POST).
    // Python's generic DB-error path here (entertainment_live.py:138, "Database
    // error fetching mission") never leaked `str(db_error)` in the first place —
    // this just adds the same name/code-only logging discipline used everywhere
    // else in this port for consistency.
    console.error("entertainment-live: failed to fetch mission", {
      name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json({ error: "API Error: 500" }, { status: 500 });
  }
}
