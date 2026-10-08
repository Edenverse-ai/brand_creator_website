import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fallbackVideoName, videoFileName } from "@/lib/ai-video-name";
import { createAiVideoDownloadUrl } from "@/lib/supabase-admin";

/**
 * GET /api/ai-videos/library/:id/download
 *
 * Redirects the signed-in creator to a short-lived storage URL that saves their
 * video as a file. A plain link to this route is enough on the client: the
 * library's own signed URLs expire after 5 minutes and play inline, so they
 * can't be reused for a download. Another creator's video reads as 404.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOWNLOAD_URL_TTL_SECONDS = 60;

/** The file is saved under the video's name, e.g. "ai-video-3.mp4". */
function downloadFilename(name: string, storagePath: string): string {
  const extension = /\.([a-z0-9]{2,5})$/i.exec(storagePath)?.[1]?.toLowerCase() ?? "mp4";
  return videoFileName(name, extension);
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const video = await prisma.aiVideo.findUnique({
    where: { id },
    select: { id: true, creator_id: true, video: true, name: true },
  });
  if (!video || video.creator_id !== session.user.id || !video.video) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = await createAiVideoDownloadUrl(
    video.video,
    downloadFilename(video.name?.trim() || fallbackVideoName(video.id), video.video),
    DOWNLOAD_URL_TTL_SECONDS
  );
  if (!url) {
    return NextResponse.json({ error: "Download is temporarily unavailable" }, { status: 502 });
  }

  const response = NextResponse.redirect(url, 307);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
