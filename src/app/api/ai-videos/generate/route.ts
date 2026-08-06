import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOwnedStoragePath } from "@/lib/storage/path-ownership";

// Matches backend/app/main/services/ai_video_service.py AiVideoService.BUCKET_NAME.
const BUCKET_NAME = "aivideogenerated";

const JsonBody = z.object({
  prompt: z.string(),
  creator_id: z.string().optional(),
  voice_sample_path: z.string().optional(),
  reference_image_path: z.string().optional(),
});

/**
 * Mirrors backend/app/main/services/ai_video_service.py `_get_public_url`: prefer the
 * storage client's public-URL helper, fall back to manually constructing the same URL shape.
 */
function resolvePublicUrl(path: string): string {
  try {
    const admin = getSupabaseAdmin();
    const { data } = admin.storage.from(BUCKET_NAME).getPublicUrl(path);
    if (data?.publicUrl) return data.publicUrl;
  } catch (error) {
    console.error("ai-videos/generate: getPublicUrl failed, falling back", error);
  }
  const base = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(
    /\/$/,
    ""
  );
  return `${base}/storage/v1/object/public/${BUCKET_NAME}/${path}`;
}

/**
 * Native JSON path: assets were already uploaded direct-to-storage via
 * POST /api/ai-videos/upload-url, so this only writes the AiVideoRequest row.
 * Field-for-field port of ai_video_service.py `create_video_request` onto Prisma
 * `AiVideoRequest`. Response shape matches Python's AiVideoGenerateResponse exactly.
 */
async function handleJsonGenerate(
  request: NextRequest,
  sessionUserId: string
): Promise<NextResponse> {
  const parsed = JsonBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const prompt = parsed.data.prompt.trim();
  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  // Ownership must anchor to the AUTHENTICATED session identity, never to the
  // body-supplied creator_id override — otherwise a caller can set creator_id to a
  // victim's id and pair it with a path under that same prefix to trivially pass.
  // The override is still allowed to populate the DB row below (frozen contract),
  // just not to decide whose storage paths are acceptable.
  const pathsToCheck = [parsed.data.voice_sample_path, parsed.data.reference_image_path].filter(
    (path): path is string => Boolean(path)
  );
  if (pathsToCheck.some((path) => !isOwnedStoragePath(path, sessionUserId))) {
    return NextResponse.json(
      { error: "Storage path does not belong to the current session" },
      { status: 403 }
    );
  }

  const creatorId = parsed.data.creator_id?.trim() || sessionUserId;

  const voiceSampleUrl = parsed.data.voice_sample_path
    ? resolvePublicUrl(parsed.data.voice_sample_path)
    : null;
  const imageUrl = parsed.data.reference_image_path
    ? resolvePublicUrl(parsed.data.reference_image_path)
    : null;

  try {
    const created = await prisma.aiVideoRequest.create({
      data: { creator_id: creatorId, prompt, voice_sample: voiceSampleUrl, image: imageUrl },
      select: { id: true },
    });

    return NextResponse.json({
      request_id: created.id,
      creator_id: creatorId,
      prompt,
      voice_sample_url: voiceSampleUrl,
      image_url: imageUrl,
      storage_path: `${creatorId}/${created.id}`,
      status: "queued",
      message: "AI video request queued successfully",
    });
  } catch (error) {
    console.error("ai-videos/generate: failed to save AiVideoRequest", error);
    return NextResponse.json({ error: "Failed to save AI video request" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // The legacy multipart branch proxied to FastAPI and was removed with the backend
    // (Phase 5 decommission — see legacy/ARCHIVE.md). JSON + presigned upload-url is
    // the only supported shape; anything else is refused rather than silently accepted.
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
    }

    return await handleJsonGenerate(request, session.user.id);
  } catch (error) {
    console.error("AI video generate route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
