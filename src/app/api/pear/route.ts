import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { pearBrandsLimiter } from "@/lib/rate-limiter";

// Field-for-field mirror of the query params GET /pear accepts
// (backend/app/main/routes/pear.py get_pear_stores): search: str | None,
// limit: int = Query(50, ge=1, le=100).
const PearListQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Native port of GET /pear (backend/app/main/routes/pear.py get_pear_stores +
 * services/pear.py PearService.get_all_stores) onto Prisma `pear_brand`. Response is
 * a raw array (`list[PearBrand]`), matching the frozen shape exactly (porting
 * reference §4.4) — each pear_brand row already has exactly the Python model's
 * fields (id, created_at, store_name, store_link, store_intro, store_logo), so no
 * field mapping is needed.
 *
 * Python's get_all_stores swallows every internal failure and returns `[]` instead
 * of raising ("return empty array instead of raising exception to prevent frontend
 * errors") — the true frozen contract for this endpoint is "always 200 with an
 * array," which is what's replicated in the catch below. NOT replicated: the old TS
 * proxy's network-failure catch (`{error, message} @ 500`) — that was an artifact of
 * the fetch hop to the Python process, which no longer exists once this is native
 * Prisma; see the phase report for this resolved ambiguity.
 *
 * Intentionally public/unauthenticated (porting reference §4.7 — zero auth anywhere
 * in pear.py/services/pear.py; §4.1 resolves the infra-simplification plan's "pear
 * auth" wording in its Global Constraints to mean this whole domain, not the
 * unrelated, already-native, already-session-gated /api/pear/auth route, which is
 * untouched by this port). Zod validation + IP rate limiting stand in for a session
 * guard, same "intentionally public" category as contact (porting reference §0.6).
 */
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (pearBrandsLimiter.isRateLimited(`pear-list:${ip}`)) {
    return NextResponse.json(
      { error: "Too many requests", message: "Please try again later." },
      { status: 429 }
    );
  }

  // new URL(request.url) rather than request.nextUrl: keeps this handler testable
  // with plain Request objects (matching this repo's established route-test
  // pattern) and matches what the pre-Phase-4c proxy implementation already used.
  const searchParams = new URL(request.url).searchParams;
  const parsed = PearListQuerySchema.safeParse({
    search: searchParams.get("search") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        message: "search must be a string; limit must be an integer between 1 and 100.",
      },
      { status: 400 }
    );
  }
  const { search, limit } = parsed.data;

  try {
    const stores = await prisma.pear_brand.findMany({
      // Mirrors Python's `if search:` — an empty string is falsy there too, so it
      // no-ops the filter rather than (incorrectly) matching nothing.
      where: search
        ? {
            OR: [
              { store_name: { contains: search, mode: "insensitive" } },
              { store_intro: { contains: search, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { created_at: "desc" },
      take: limit,
    });
    return NextResponse.json(stores);
  } catch (error) {
    // Field-for-field port of PearService.get_all_stores' own catch: log and return
    // an empty array rather than a 5xx, so a transient DB blip degrades the pear
    // directory to "no stores shown" instead of breaking the page. Same
    // name/code-only logging discipline as contact/route.ts's storeContactMessage —
    // never log error.message (Prisma validation/known-request errors embed the
    // full attempted query/data).
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code: unknown }).code
        : undefined;
    console.error("pear: failed to list stores", {
      name: error instanceof Error ? error.name : typeof error,
      ...(code === undefined ? {} : { code }),
    });
    return NextResponse.json([]);
  }
}

// --- Everything below is unchanged from the pre-Phase-4c proxy implementation. ---
// POST (create store) has zero live callers anywhere in src/app (porting reference
// §1.2/§4.8 — no admin UI exists to create a pear store). Per this phase's scope,
// only the live GET path above is ported to native Prisma logic; this proxy is left
// exactly as it was, flagged as a deletion candidate in the phase report rather than
// silently rewritten or removed.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const apiBaseUrl = process.env.CAMPAIGNS_API_URL || "http://localhost:5000";

    const response = await fetch(`${apiBaseUrl}/pear`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error("Pear POST API route error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}
