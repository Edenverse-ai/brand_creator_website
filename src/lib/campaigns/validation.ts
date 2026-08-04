/**
 * Mirrors backend/app/main/utils/validators.py `validate_uuid`, which wraps Python's
 * `uuid.UUID(str)` constructor. `campaigns.id` / `campaignclaims.id` are always Postgres
 * `gen_random_uuid()` output (canonical 8-4-4-4-12 lowercase hex), so a canonical-form check
 * covers every value this domain's own data can ever produce; its purpose is to reject
 * obviously-invalid client input (e.g. "abc") with a clean 400 before it ever reaches a
 * Prisma query, not to be a fully general UUID parser.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}
