import "server-only";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Matches backend/app/main/services/ai_video_service.py AiVideoService.BUCKET_NAME.
const BUCKET_NAME = "aivideogenerated";

/**
 * Matches the ACTUAL runtime behavior of ai_video_service.py `_generate_signed_url`,
 * not the behavior its own comment claims.
 *
 * Its signature is `_generate_signed_url(client, path, expires_in: int = 300)`, and
 * BOTH call sites in `get_video_library` (`_resolve_video_url`, `_resolve_thumbnail_url`)
 * invoke it with no `expires_in` argument, so the parameter is always the default, 300.
 * Inside the function, the expiry passed to Supabase is `expires_in or long_lived_expiry`
 * (`long_lived_expiry = 60 * 60 * 24 * 30`, i.e. 30 days) — but since `expires_in` is
 * always `300` (truthy) at these call sites, the `or` short-circuits to `300` every time.
 * The 30-day constant and the code comment above it ("Extend signed URL lifetime to
 * roughly one month for easier downloads from the portal") describe *intent* that the
 * live code never actually reaches. This constant reproduces the REAL TTL (300s / 5
 * minutes), per the byte-for-byte parity goal of this port. Flagged in
 * .superpowers/sdd/task-4f-report.md as a discrepancy worth a deliberate product
 * decision, not silently "fixed" here.
 */
const SIGNED_URL_TTL_SECONDS = 300;

type AiVideoRow = {
  id: string;
  created_at: Date;
  creator_id: string | null;
  generated_time: Date | null;
  video: string | null;
  tag: string | null;
  thumbnail_url: string | null;
};

// Field-for-field mirror of backend/app/main/models/ai_video.py AiVideoLibraryItem.
export type AiVideoLibraryItemResponse = {
  id: string;
  creator_id: string;
  generated_time: string;
  video_url: string;
  tags: string[];
  created_at: string | null;
  thumbnail_url: string | null;
};

/**
 * Mirrors AiVideoService._deserialize_tags (ai_video_service.py:263-273) exactly,
 * including its fall-through quirk: if `JSON.parse` succeeds but yields something
 * other than an array (e.g. a bare JSON number/object), Python does NOT return early
 * -- it falls through to the comma-split of the ORIGINAL raw string, same as an
 * invalid-JSON parse failure would. This replicates that fall-through rather than
 * the more "obvious" early-return-on-any-successful-parse behavior.
 */
export function deserializeTags(rawValue: string | null): string[] {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) {
      return parsed.map((tag) => String(tag));
    }
  } catch {
    // fall through to comma-split, matching Python's except-pass
  }
  return rawValue
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/**
 * Mints a signed URL in the aivideogenerated bucket, matching AiVideoService.
 * _generate_signed_url: any failure (misconfigured client, Supabase API error, or an
 * unexpected throw) is swallowed and reported as `null`, never propagated -- callers
 * treat `null` as "could not resolve this URL" and degrade accordingly (drop the row
 * for video, leave the field null for thumbnail). Errors are logged by error name/class
 * only -- never the raw message (which could echo the path) and never the path or any
 * signed URL itself.
 */
async function mintSignedUrl(path: string): Promise<string | null> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      console.error("ai-video-library: signed URL mint failed", error?.name ?? "StorageError");
      return null;
    }
    return data.signedUrl;
  } catch (error) {
    console.error(
      "ai-video-library: signed URL mint threw",
      error instanceof Error ? error.name : typeof error
    );
    return null;
  }
}

/**
 * Mirrors AiVideoService._resolve_video_url (ai_video_service.py:294-304).
 *
 * Python also checks `row.get("video_url")`/`row.get("videoUrl")` for a pre-resolved
 * direct URL before falling back to signing `video`/`video_path`/`videoKey` as a
 * storage path. None of those extra field names exist as columns on the Prisma
 * `AiVideo` model (prisma/schema.prisma only has `video`) -- so that branch is
 * structurally unreachable here and is intentionally not reproduced. See
 * task-4f-report.md.
 */
async function resolveVideoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  return mintSignedUrl(path);
}

/**
 * Mirrors AiVideoService._resolve_thumbnail_url (ai_video_service.py:306-315): an
 * http(s) value passes through unchanged (Python performs no origin validation, just
 * a prefix check -- reproduced identically since the value is DB-sourced, not
 * attacker-controlled per request); anything else is treated as a storage path and
 * signed. Python also checks `thumbnailUrl`/`thumbnail` field-name fallbacks that
 * don't exist as Prisma columns (only `thumbnail_url` does) -- not reproduced, same
 * reasoning as resolveVideoUrl above.
 */
async function resolveThumbnailUrl(rawValue: string | null): Promise<string | null> {
  if (!rawValue) return null;
  if (rawValue.startsWith("http://") || rawValue.startsWith("https://")) {
    return rawValue;
  }
  return mintSignedUrl(rawValue);
}

/**
 * Native port of AiVideoService.get_video_library (ai_video_service.py:109-154) onto
 * Prisma. Always scoped to a single `creatorId` -- Python's "no creator_id means list
 * everything" mode is intentionally NOT reproduced; see task-4f-report.md for the auth
 * rationale (this endpoint is creator-scoped private data and Python's public/unscoped
 * mode is treated as a gap to close, not a frozen contract to preserve).
 *
 * Resilience: mirrors Python's blanket-catch shape exactly -- a failed query returns
 * `[]` rather than throwing, and each row is resolved independently so one row's
 * signing failure can't fail the rest (matching the per-row try/except in
 * ai_video_service.py:132-153). Rows with no resolvable video URL are silently
 * dropped, never included as null/error entries (ai_video_service.py:134-138).
 */
export async function getAiVideoLibrary(creatorId: string): Promise<AiVideoLibraryItemResponse[]> {
  let rows: AiVideoRow[];
  try {
    rows = await prisma.aiVideo.findMany({
      where: { creator_id: creatorId },
      orderBy: { generated_time: "desc" },
    });
  } catch (error) {
    console.error(
      "ai-video-library: query failed",
      error instanceof Error ? error.name : typeof error
    );
    return [];
  }

  if (rows.length === 0) return [];

  const results: AiVideoLibraryItemResponse[] = [];
  for (const row of rows) {
    try {
      const videoUrl = await resolveVideoUrl(row.video);
      if (!videoUrl) continue;

      const thumbnailUrl = await resolveThumbnailUrl(row.thumbnail_url);

      results.push({
        id: row.id,
        creator_id: creatorId,
        generated_time: (row.generated_time ?? row.created_at).toISOString(),
        video_url: videoUrl,
        tags: deserializeTags(row.tag),
        created_at: row.created_at.toISOString(),
        thumbnail_url: thumbnailUrl,
      });
    } catch (error) {
      console.error(
        "ai-video-library: row skipped due to resolution error",
        error instanceof Error ? error.name : typeof error
      );
    }
  }

  return results;
}
