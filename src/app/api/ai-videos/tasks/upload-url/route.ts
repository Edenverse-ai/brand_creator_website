import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { createSignedUpload } from "@/lib/storage/signed-upload";
import { AI_VIDEO_TASK_BUCKET } from "@/lib/supabase-admin";

// Extension vocabulary mirrors PORTRAIT_MIME_TO_EXT / VOICE_MIME_TO_EXT /
// REFERENCE_VIDEO_MIME_TO_EXT in src/lib/ai-video-task.ts.
const PORTRAIT_EXTS = ["jpg", "png", "webp"] as const;
const VOICE_EXTS = ["mp3", "wav", "m4a"] as const;
const VIDEO_EXTS = ["mp4", "mov"] as const;

// Trend replicate uploads: the trending video plus up to three product images,
// numbered in the order the replicate prompt refers to them ("Image 1"…).
const PRODUCT_KINDS = ["product_1", "product_2", "product_3"] as const;
const KINDS = ["portrait", "voice", "reference_video", ...PRODUCT_KINDS] as const;
type Kind = (typeof KINDS)[number];

const EXTS_BY_KIND: Record<Kind, readonly string[]> = {
  portrait: PORTRAIT_EXTS,
  voice: VOICE_EXTS,
  reference_video: VIDEO_EXTS,
  product_1: PORTRAIT_EXTS,
  product_2: PORTRAIT_EXTS,
  product_3: PORTRAIT_EXTS,
};

// Mirrors buildPortraitPath / buildVoicePath / buildReferenceVideoPath /
// buildProductImagePath in src/lib/ai-video-task.ts.
const FILE_NAME_BY_KIND: Record<Kind, string> = {
  portrait: "portrait",
  voice: "voice",
  reference_video: "reference-video",
  product_1: "product-1",
  product_2: "product-2",
  product_3: "product-3",
};

// Same charset + cap as the consuming route's taskId (src/app/api/ai-videos/tasks/
// route.ts's TASK_ID_MAX_LENGTH). Without this cap, this minting route could
// successfully mint an upload URL for a caller-supplied taskId longer than 32
// characters, only for POST /api/ai-videos/tasks to then reject that same taskId
// with a 400 — a mint that can never be consumed.
const TASK_ID_MAX_LENGTH = 32;

const Body = z
  .object({
    kind: z.enum(KINDS),
    ext: z.enum([...PORTRAIT_EXTS, ...VOICE_EXTS, ...VIDEO_EXTS]),
    // Reuse the taskId returned by a prior call (e.g. portrait) so both assets land in
    // the same task folder. Restricted to cuid2's charset since it becomes a storage
    // path segment.
    taskId: z
      .string()
      .regex(/^[a-z0-9]+$/, "Invalid taskId")
      .max(TASK_ID_MAX_LENGTH)
      .optional(),
  })
  .refine((body) => EXTS_BY_KIND[body.kind].includes(body.ext), {
    message: "ext does not match kind",
  });

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
  const path = `${session.user.id}/${taskId}/${FILE_NAME_BY_KIND[kind]}.${ext}`;

  try {
    const signed = await createSignedUpload(AI_VIDEO_TASK_BUCKET, path);
    return NextResponse.json({ ...signed, taskId });
  } catch (e) {
    console.error("ai-videos/tasks/upload-url mint failed:", e);
    return NextResponse.json({ error: "Failed to create upload URL" }, { status: 500 });
  }
}
