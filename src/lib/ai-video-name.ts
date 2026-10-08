import { prisma } from "@/lib/prisma";
import { VIDEO_NAME_MAX_LENGTH } from "@/lib/ai-video-task";

/**
 * Names of videos in the My Videos library. Every video has one, and a creator
 * can't have two videos with the same name (unique index on creator_id + name).
 * New videos start as "ai-video-<number>"; creators can rename them.
 *
 * Kept free of "server-only": the finalize Netlify function names videos too.
 */

const AUTO_NAME_PREFIX = "ai-video-";
const AUTO_NAME_PATTERN = /^ai-video-(\d{1,15})$/;

/** Trimmed name, or null when it is empty or too long. */
export function normalizeVideoName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  return name.length >= 1 && name.length <= VIDEO_NAME_MAX_LENGTH ? name : null;
}

/** What to show for a row that predates names and somehow missed the backfill. */
export function fallbackVideoName(videoId: string): string {
  return `${AUTO_NAME_PREFIX}${videoId.slice(0, 8)}`;
}

/**
 * The creator's next automatic name: one past the highest "ai-video-<n>" they
 * have, so deleting a video never frees a number that is then reused. `skip`
 * moves further along after a lost race for the same number.
 */
export async function nextVideoName(creatorId: string, skip = 0): Promise<string> {
  const rows = await prisma.aiVideo.findMany({
    where: { creator_id: creatorId, name: { startsWith: AUTO_NAME_PREFIX } },
    select: { name: true },
  });
  let highest = 0;
  for (const { name } of rows) {
    const match = AUTO_NAME_PATTERN.exec(name ?? "");
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `${AUTO_NAME_PREFIX}${highest + 1 + skip}`;
}

/** Prisma's unique-constraint error: here, a name the creator already uses. */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002";
}

/** The name as a download filename: characters file systems reject become dashes. */
export function videoFileName(name: string, extension: string): string {
  const safe = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/, "")
    .trim();
  return `${safe || "ai-video"}.${extension}`;
}
