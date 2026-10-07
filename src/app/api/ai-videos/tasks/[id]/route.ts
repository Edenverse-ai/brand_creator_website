import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncTask } from "@/lib/ai-video-generation";
import { buildLibraryVideoPath } from "@/lib/ai-video-task";
import { createAiVideoSignedUrl } from "@/lib/supabase-admin";

/**
 * GET /api/ai-videos/tasks/:id — polled by the generate page (every 10 s).
 *
 * Advances the task (syncTask: provider status → FAILED / finalize → DELIVERED),
 * then returns its status. Another creator's task is reported as 404 so the
 * route never reveals which task ids exist.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const owned = await prisma.aiVideoTask.findUnique({
    where: { id },
    select: { id: true, creatorId: true },
  });
  if (!owned || owned.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    // The origin tells syncTask which deploy's background function to dispatch to —
    // on a deploy preview that must be the preview itself, not the production site.
    const host = request.headers.get("host");
    await syncTask(id, { origin: host ? `https://${host}` : undefined });
  } catch (error) {
    // Report the last known state; the next poll or the scheduled sweep retries.
    console.error("[ai-videos/tasks/:id] sync failed", {
      taskId: id,
      name: error instanceof Error ? error.name : typeof error,
    });
  }

  const task = await prisma.aiVideoTask.findUnique({
    where: { id },
    select: { id: true, creatorId: true, status: true, errorMessage: true, aiVideoId: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const videoUrl =
    task.status === "DELIVERED" && task.aiVideoId
      ? await createAiVideoSignedUrl(buildLibraryVideoPath(task.creatorId, task.id), 3600)
      : null;

  return NextResponse.json({
    id: task.id,
    status: task.status,
    errorMessage: task.errorMessage,
    videoUrl,
  });
}
