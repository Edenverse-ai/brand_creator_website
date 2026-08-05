import type { entertainment_live } from "@prisma/client";

/**
 * Shared, side-effect-free helpers for the entertainment-live native port
 * (backend/app/main/routes/entertainment.py + services/entertainment_live.py ->
 * Prisma `entertainment_live`). Kept pure and free of Prisma calls so both routes
 * (list/create in route.ts, by-id in [id]/route.ts) can reuse them and they stay
 * trivially unit-testable without mocking `@/lib/prisma`.
 */

// ---------------------------------------------------------------------------
// Numeric-value-in-a-string-column (porting reference §0.3 / §5.4)
//
// follower_min, follower_max, fixed_reward, cps_rate are typed int|float in the
// Python Pydantic models (EntertainmentLive/EntertainmentLiveCreate) but are
// verified (prisma/schema.prisma:439-463) to be Prisma `String?` columns. Python's
// non-strict Pydantic v2 response model silently coerces the stored text back to a
// JSON number on the way out; a naive Prisma passthrough would instead ship a JSON
// *string*, silently breaking the frozen response contract even though
// `string | null` is "correct" for what Prisma sees in the DB.
// ---------------------------------------------------------------------------

/**
 * Read-side: parse a numeric-string column back to a JSON number. Never throws —
 * null/empty/unparseable input all resolve to `null` rather than propagating NaN
 * or crashing the whole list response over one malformed row (this task's hard
 * requirement; Python's own Pydantic model would actually raise on unparseable
 * stored text, which is worse, not something worth reproducing).
 */
export function parseNumericField(value: string | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Write-side: Prisma's generated `entertainment_liveCreateInput` types these four
 * columns as `string | null` (verified in node_modules/.prisma/client/index.d.ts),
 * so passing a raw JS number is a type error, not just a silent bug — but the fix
 * still has to be applied explicitly. Mirrors Python's `mission.dict()` +
 * None/""-strip filter (entertainment_live.py:238): returning `undefined` (rather
 * than `"null"` or `"undefined"` as a string) means Prisma omits the key entirely,
 * the same effect as Python dropping it from the insert payload.
 */
export function numberToWriteField(value: number | null | undefined): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

// ---------------------------------------------------------------------------
// niche_tags: JSON-array-serialized-into-a-text-column (porting reference §0.4/§5.4)
//
// Unlike the sibling `campaigns` domain (whose array-shaped text columns are NEVER
// json.loads'd back on read — the frozen contract there is the raw JSON-encoded
// string), entertainment_live's niche_tags genuinely IS parsed back into a real
// array by get_entertainment_live_missions/get_entertainment_live_mission_by_id.
// Do not "fix" this asymmetry to match campaigns; it's a real, deliberate
// difference in the two domains' frozen contracts, not oversight to unify.
// ---------------------------------------------------------------------------

/**
 * Field-for-field port of the try/except in both service methods
 * (entertainment_live.py:93-105 and :163-172): if the stored value is falsy
 * (null/""), leave it untouched. Otherwise try JSON.parse; on failure, fall back
 * to a comma-split, trimmed, empty-entry-filtered array. Returns `unknown` because
 * that's honestly what `json.loads` can hand back too (e.g. a stored literal "5"
 * parses to the JSON number 5, not a list) -- this port doesn't invent stronger
 * guarantees than the Python it's replacing.
 */
export function parseNicheTags(value: string | null): unknown {
  if (!value) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }
}

/**
 * Write-side. Python only calls `json.dumps` when niche_tags is a non-empty list
 * (`if mission_data.get("niche_tags") and isinstance(mission_data["niche_tags"],
 * list)`) -- an empty list is falsy in Python, so it skips json.dumps, yet (due to
 * `[] != ""` being true) it doesn't cleanly get dropped by the later None/""-strip
 * filter either, leaving a genuinely ambiguous "raw empty list survives into the
 * insert payload" edge case. There is no live caller for
 * `POST /api/entertainment-live` (porting reference §5.7) to observe that corner
 * against a real response, so rather than reproduce untested, ambiguous behavior,
 * this port takes the predictable reading: an empty array is treated the same as
 * "not provided" (field omitted). A non-empty array is JSON-stringified; a string
 * is passed through unchanged (mirrors the Python `isinstance(..., list)` guard,
 * which never touches an already-string value); null/undefined/"" are omitted.
 */
export function buildNicheTagsWriteField(
  value: string[] | string | null | undefined
): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value.length > 0 ? JSON.stringify(value) : undefined;
  }
  return value !== "" ? value : undefined;
}

// ---------------------------------------------------------------------------
// Generic text-field write helper: replicates Python's blanket
// `{k: v for k, v in mission_data.items() if v is not None and v != ""}` filter
// (entertainment_live.py:238) for every plain string column. An explicit
// empty-string field in the request body silently does not get written on create
// (the column stays at its default/null) -- this applies uniformly, including to
// task_title, even though task_title is a *required* body key.
// ---------------------------------------------------------------------------
export function presence(value: string | null | undefined): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : value;
}

// ---------------------------------------------------------------------------
// Full row -> frozen JSON response shape, matching the Python `EntertainmentLive`
// Pydantic model's fields exactly (models/entertainment_live.py). `brand_name` is
// joined at read time (not a stored column, entertainment_live.py:70-91/146-161)
// and is supplied by each caller since the two routes resolve it differently
// (batched lookup for the list, single lookup for by-id).
// ---------------------------------------------------------------------------
export function serializeMission(mission: entertainment_live, brandName: string) {
  return {
    id: mission.id,
    created_at: mission.created_at,
    task_title: mission.task_title,
    brand_id: mission.brand_id,
    campaign_objective: mission.campaign_objective,
    platform: mission.platform,
    task_start_at: mission.task_start_at,
    task_end_at: mission.task_end_at,
    follower_min: parseNumericField(mission.follower_min),
    follower_max: parseNumericField(mission.follower_max),
    niche_tags: parseNicheTags(mission.niche_tags),
    region_priority: mission.region_priority,
    content_quality_floor: mission.content_quality_floor,
    deliverables: mission.deliverables,
    mandatory_elements: mission.mandatory_elements,
    creative_guidelines: mission.creative_guidelines,
    prohibited_elements: mission.prohibited_elements,
    reward_model: mission.reward_model,
    fixed_reward: parseNumericField(mission.fixed_reward),
    tiered_table: mission.tiered_table,
    cps_rate: parseNumericField(mission.cps_rate),
    kpi_baseline: mission.kpi_baseline,
    updated_at: mission.updated_at,
    brand_name: brandName,
  };
}
