import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PublishStatusRequestSchema } from "@/lib/tiktok/schema";
import { fetchPublishStatus } from "@/lib/tiktok/status";
import { publicMessageFor, logDetailsFor } from "@/lib/tiktok/errors";

/**
 * POST /api/tiktok/publish-status
 *
 * Direct port of backend/app/main/routes/tiktok_upload.py `publish_status`
 * (read-only reference): fetch each publish_id's status from TikTok, in
 * parallel, with per-id error isolation. Response envelope matches the Python's
 * `{ results: [{ publish_id, status, payload? | error? }] }` exactly.
 */

interface StatusResult {
  publish_id: string;
  status: "ok" | "error";
  payload?: unknown;
  error?: string;
}

async function fetchOne(accessToken: string, publishId: string): Promise<StatusResult> {
  try {
    const payload = await fetchPublishStatus(accessToken, publishId);
    return { publish_id: publishId, status: "ok", payload };
  } catch (error) {
    console.error("[tiktok/publish-status] fetch failed", { publishId, ...logDetailsFor(error) });
    return { publish_id: publishId, status: "error", error: publicMessageFor(error) };
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = PublishStatusRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { access_token: accessToken, publish_ids: publishIds } = parsed.data;
  if (publishIds.length === 0) {
    return NextResponse.json({ error: "No publish_ids provided" }, { status: 400 });
  }

  const results = await Promise.all(
    publishIds.map((publishId) => fetchOne(accessToken, publishId))
  );
  return NextResponse.json({ results });
}
