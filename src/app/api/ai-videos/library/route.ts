import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAiVideoLibrary } from "@/lib/ai-video-library";

/**
 * Native port of `GET /ai-videos/library`
 * (backend/app/main/routes/ai_video.py -> AiVideoService.get_video_library).
 *
 * Route path: this domain's Python surface is mounted at `/ai-videos/*`, and the
 * sibling already-native routes in this directory (`generate`, `upload-url`) follow
 * `src/app/api/ai-videos/<action>/route.ts` 1:1 against the Python path segment. This
 * mirrors that convention for `/library`.
 *
 * Auth: Python has ZERO auth on this endpoint -- `creator_id` is an optional,
 * client-supplied query filter with no server-side identity check at all, so an
 * unauthenticated caller could list every creator's AI video library (including
 * signed video URLs) by omitting it. This is exactly the "Python was effectively
 * public but the data is user-scoped" gap called out for a mandatory guard: this
 * route requires a session and scopes results to `session.user.id` ONLY. There is no
 * `creator_id` query/body param on this route at all -- not merely unused, structurally
 * absent -- so there is no input that could ever widen the result set beyond the
 * caller's own session identity. See task-4f-report.md for the full writeup.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const items = await getAiVideoLibrary(session.user.id);
    return NextResponse.json(items);
  } catch (error) {
    // getAiVideoLibrary already catches everything it knows about and resolves to
    // `[]` -- this is a last-resort net for a truly unexpected throw, kept
    // consistent with Python's own contract for this endpoint (it never raises,
    // always returns a list). Never echoes the error's message, only its name.
    console.error(
      "GET /api/ai-videos/library failed:",
      error instanceof Error ? error.name : typeof error
    );
    return NextResponse.json([]);
  }
}
