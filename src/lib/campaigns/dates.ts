/**
 * Prisma boundary helpers for `campaigns.deadline` (`DateTime? @db.Date` in prisma/schema.prisma).
 *
 * Python's `CampaignCreate.deadline` (backend/app/main/models/campaign.py) is a bare `str`
 * (e.g. "2026-12-31") written straight through to Supabase/Postgres, which accepts a
 * date-only string natively. Prisma 6 does not: a `DateTime` field types as `Date | string`
 * but actually requires a full ISO-8601 datetime string at runtime, so passing the bare
 * date-only string throws `PrismaClientValidationError: premature end of input. Expected
 * ISO-8601 DateTime.` on every write — the same bug class fixed in commit 887f49e for
 * tiktokverification's `date_of_birth`.
 *
 * Fix: convert to a UTC-midnight `Date` only at the Prisma call boundary; keep the plain
 * "YYYY-MM-DD" string everywhere else (write-response echo, and reads — Prisma returns a
 * real JS `Date` for `@db.Date` columns, which must be reformatted back to "YYYY-MM-DD" or a
 * fresh GET silently regresses to a full ISO datetime string).
 */

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a "YYYY-MM-DD" string — the only shape Python's CampaignCreate.deadline sends. */
export function isDateOnlyString(value: unknown): value is string {
  return typeof value === "string" && DATE_ONLY_RE.test(value);
}

/**
 * Write boundary: turn a "YYYY-MM-DD" string into a UTC-midnight Date for Prisma. Callers
 * must validate with `isDateOnlyString` first (or a zod regex) so a malformed value is a
 * clean 400 rather than an unhandled throw here.
 */
export function dateOnlyStringToUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Read boundary: reformat a Prisma `@db.Date` value back to "YYYY-MM-DD" using UTC getters
 * (`toISOString`) so the result can't shift by a day depending on server timezone — avoid
 * `toLocaleDateString()` / local getters for this reason.
 */
export function formatDateOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

/**
 * Mirrors Python's `datetime.strptime(value, "%Y-%m-%d")` — format AND calendar validity
 * (rejects e.g. "2026-02-30"), unlike `isDateOnlyString` above which only checks shape.
 *
 * Purpose-built for `GET /api/brand/campaigns`'s phantom `start_date`/`end_date` filter
 * (`brand_service.py:39-51`): Python wraps its `strptime` call in its own `try/except
 * ValueError`, and only calls `.gte("start_date", …)` / `.lte("end_date", …)` — the calls
 * that actually reference the nonexistent columns and crash — when `strptime` *succeeds*. A
 * malformed value never reaches those calls, so the filter is silently skipped and the query
 * proceeds (returning real campaigns), unlike a well-formed one, which does crash. This is
 * the one date helper in this domain that is NOT part of the deadline read/write hazard.
 */
export function isValidCalendarDateOnly(value: string): boolean {
  if (!isDateOnlyString(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
