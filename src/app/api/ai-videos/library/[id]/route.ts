import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isUniqueViolation, normalizeVideoName } from "@/lib/ai-video-name";
import { deleteFromAiVideoBucket } from "@/lib/supabase-admin";

/**
 * PATCH  /api/ai-videos/library/:id   rename a video in My Videos
 * DELETE /api/ai-videos/library/:id   delete it for good
 *
 * Both act only on the signed-in creator's own videos; anyone else's reads as 404.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

async function findOwnVideo(context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { id } = await context.params;
  const video = UUID_PATTERN.test(id)
    ? await prisma.aiVideo.findUnique({
        where: { id },
        select: { id: true, creator_id: true, video: true },
      })
    : null;
  if (!video || video.creator_id !== session.user.id) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { video };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const found = await findOwnVideo(context);
  if (found.error) return found.error;

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = normalizeVideoName(body?.name);
  if (!name) {
    return NextResponse.json({ error: "Enter a name of 1 to 80 characters." }, { status: 400 });
  }

  try {
    await prisma.aiVideo.update({ where: { id: found.video.id }, data: { name } });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "You already have a video with this name." },
        { status: 409 }
      );
    }
    console.error("[ai-videos/library] rename failed", {
      videoId: found.video.id,
      name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json({ error: "Couldn't rename the video." }, { status: 500 });
  }

  return NextResponse.json({ id: found.video.id, name });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const found = await findOwnVideo(context);
  if (found.error) return found.error;
  const { video } = found;

  try {
    // The generation task stays as a record (and keeps counting toward the day it
    // ran on); it just no longer points at a video.
    await prisma.$transaction([
      prisma.aiVideoTask.updateMany({ where: { aiVideoId: video.id }, data: { aiVideoId: null } }),
      prisma.aiVideo.delete({ where: { id: video.id } }),
    ]);
  } catch (error) {
    console.error("[ai-videos/library] delete failed", {
      videoId: video.id,
      name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json({ error: "Couldn't delete the video." }, { status: 500 });
  }

  // Best effort: the video is already gone for the creator. A file left behind is
  // logged by the helper and can be swept later.
  if (video.video) await deleteFromAiVideoBucket([video.video]);

  return NextResponse.json({ id: video.id });
}
