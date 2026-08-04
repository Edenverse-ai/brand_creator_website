import { z } from "zod";

/**
 * Shared `id_number` validation for both TikTok verification endpoints
 * (`upload-urls/route.ts` and `route.ts`).
 *
 * `id_number` is free-text user input — the Prisma column
 * (`influencer_verifications.id_number String @unique`, see prisma/schema.prisma)
 * has no `@db.VarChar` length or format constraint, so Postgres stores it as
 * unbounded text — but it is also used, verbatim, as the first path segment for
 * every file the applicant uploads (`{id_number}/{file}.{ext}`, see
 * upload-urls/logic.ts). Without an explicit constraint here, a value containing
 * "/", "\", "%", or ".." would previously either produce deeper-than-intended
 * storage nesting or, after the isOwnedStoragePath hardening, fail closed with a
 * confusing "foreign path" 400 that doesn't name the actual problem. This schema
 * makes the constraint explicit at the input boundary instead, with an error
 * message that says what's wrong.
 *
 * `isOwnedStoragePath` (src/lib/storage/path-ownership.ts) checks remain in place,
 * unchanged, at both endpoints as defense in depth — this schema narrows what
 * `id_number` can be in the first place; it does not replace that second-layer
 * structural check.
 */

// No DB-level length constraint exists to derive this from (id_number has no
// @db.VarChar annotation, so Postgres stores it as unbounded text) — 100 is a
// picked, generous ceiling comfortably above any real passport/national-ID format.
const ID_NUMBER_MAX_LENGTH = 100;

// Letters, digits, hyphen, underscore, space, period — covers real-world ID formats
// (e.g. "AB-123 456.7"). Path-hostile characters (/, \, %) are excluded by omission;
// the literal ".." sequence is checked separately below, since a lone "." is allowed
// and a character-class regex alone can't express "no two periods in a row".
const ID_NUMBER_ALLOWED_CHARS = /^[A-Za-z0-9\- _.]+$/;

const ID_NUMBER_INVALID_CHARS_MESSAGE =
  "id_number contains characters that are not allowed (/, \\, %, or ..)";

export const idNumberSchema = z
  .string()
  .trim()
  .min(1, "id_number is required")
  .max(ID_NUMBER_MAX_LENGTH, `id_number must be ${ID_NUMBER_MAX_LENGTH} characters or fewer`)
  .refine((value) => ID_NUMBER_ALLOWED_CHARS.test(value) && !value.includes(".."), {
    message: ID_NUMBER_INVALID_CHARS_MESSAGE,
  });

/**
 * Picks out idNumberSchema's own disallowed-characters message from a failed parse
 * of a body that embeds it — but only that specific failure (zod issue `code:
 * "custom"`, from the `.refine()` above), not zod's generic type-check message for
 * an absent/wrong-type `id_number` (e.g. "expected string, received undefined").
 * That distinction matters: callers use this to upgrade their generic "field
 * missing" message to something that names the problem when id_number was actually
 * present but invalid, while leaving the pre-existing generic message alone when
 * id_number was simply never provided (a different, already-covered failure mode).
 */
export function findIdNumberCharacterMessage(error: z.ZodError): string | undefined {
  return error.issues.find((issue) => issue.path[0] === "id_number" && issue.code === "custom")
    ?.message;
}
