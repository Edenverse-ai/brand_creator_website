import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { createSignedUpload } from "@/lib/storage/signed-upload";
import { AI_VIDEO_TASK_BUCKET } from "@/lib/supabase-admin";

// Extension vocabulary mirrors PORTRAIT_MIME_TO_EXT / VOICE_MIME_TO_EXT in
// src/lib/ai-video-task.ts (the multipart route's source of truth for accepted types).
const PORTRAIT_EXTS = ["jpg", "png", "webp"] as const;
const VOICE_EXTS = ["mp3", "wav", "m4a"] as const;

const Body = z
  .object({
    kind: z.enum(["portrait", "voice"]),
    ext: z.enum([...PORTRAIT_EXTS, ...VOICE_EXTS]),
    // Reuse the taskId returned by a prior call (e.g. portrait) so both assets land in
    // the same task folder. Restricted to cuid2's charset since it becomes a storage
    // path segment.
    taskId: z
      .string()
      .regex(/^[a-z0-9]+$/, "Invalid taskId")
      .optional(),
  })
  .refine(
    (body) =>
      body.kind === "portrait"
        ? (PORTRAIT_EXTS as readonly string[]).includes(body.ext)
        : (VOICE_EXTS as readonly string[]).includes(body.ext),
    { message: "ext does not match kind" }
  );

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { kind, ext } = parsed.data;
  const taskId = parsed.data.taskId ?? createId();
  // Mirrors buildPortraitPath / buildVoicePath in src/lib/ai-video-task.ts.
  const path = `${session.user.id}/${taskId}/${kind}.${ext}`;

  try {
    const signed = await createSignedUpload(AI_VIDEO_TASK_BUCKET, path);
    return NextResponse.json({ ...signed, taskId });
  } catch (e) {
    console.error("ai-videos/tasks/upload-url mint failed:", e);
    return NextResponse.json({ error: "Failed to create upload URL" }, { status: 500 });
  }
}
