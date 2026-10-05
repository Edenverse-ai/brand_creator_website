import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildPortraitPath,
  buildVoicePath,
  promptSchema,
  validatePortraitFile,
  validateVoiceFile,
  type PortraitMime,
  type VoiceMime,
} from "@/lib/ai-video-task";
import {
  SupabaseConfigError,
  SupabaseUploadError,
  deleteFromBucket,
  uploadToBucket,
} from "@/lib/supabase-admin";
import { isOwnedStoragePath } from "@/lib/storage/path-ownership";
import { remainingToday, submitTask } from "@/lib/ai-video-generation";
import { generationParamsSchema } from "@/lib/seedance/schema";

// Same charset + cap as the minting route's taskId (src/app/api/ai-videos/tasks/
// upload-url/route.ts) — taskId becomes both this row's primary key and a storage
// path segment, so it must stay restricted to cuid2's charset. 32 is a generous
// ceiling above cuid2's actual 24-character output (matching the "picked, generous
// ceiling" convention used for id_number in tiktokverification/id-number.ts).
const TASK_ID_MAX_LENGTH = 32;

const JsonBody = z
  .object({
    prompt: z.string(),
    // Required when assets were uploaded (their paths embed it); minted here for
    // text-only generations.
    taskId: z
      .string()
      .regex(/^[a-z0-9]+$/, "Invalid taskId")
      .max(TASK_ID_MAX_LENGTH)
      .optional(),
    portrait_path: z.string().optional(),
    voice_path: z.string().optional(),
    params: z.unknown().optional(),
  })
  .refine((body) => body.taskId || !(body.portrait_path?.trim() || body.voice_path?.trim()), {
    message: "taskId required with uploaded assets",
  });

/**
 * `isOwnedStoragePath` only constrains the FIRST path segment (the owner id) — it
 * doesn't know about `taskId` at all, so a portrait/voice path under the same
 * owner's OTHER task folder would still pass it. Require the SECOND segment to
 * equal the submitted taskId too, so ownership is validated against the specific
 * task this request is creating, not just "some folder this user owns somewhere."
 * Same-user-only impact today (no cross-user path gets any closer to passing), but
 * it closes that gap.
 */
function isOwnedTaskPath(path: string, ownerId: string, taskId: string): boolean {
  return isOwnedStoragePath(path, ownerId) && path.split("/")[1] === taskId;
}

/**
 * Native JSON path: the optional reference image was already uploaded
 * direct-to-storage via POST /api/ai-videos/tasks/upload-url. Validates ownership
 * and the daily cap, writes the AiVideoTask row, then submits it to the video
 * provider (mock unless explicitly enabled — see src/lib/seedance/index.ts).
 * Responds with the post-submit status: GENERATING, or FAILED with a message.
 */
async function handleJsonTaskCreate(
  request: NextRequest,
  sessionUserId: string
): Promise<NextResponse> {
  const parsed = JsonBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const paramsResult = generationParamsSchema.safeParse(parsed.data.params ?? {});
  if (!paramsResult.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const promptResult = promptSchema.safeParse(parsed.data.prompt);
  if (!promptResult.success) {
    return NextResponse.json({ error: "Prompt required" }, { status: 400 });
  }
  const prompt = promptResult.data;

  const taskId = parsed.data.taskId ?? createId();
  const portraitPath = parsed.data.portrait_path?.trim() || "";
  const voicePath = parsed.data.voice_path?.trim() || "";
  const uploadedPaths = [portraitPath, voicePath].filter(Boolean);

  if (uploadedPaths.some((path) => !isOwnedTaskPath(path, sessionUserId, taskId))) {
    return NextResponse.json(
      { error: "Storage path does not belong to the current session" },
      { status: 403 }
    );
  }

  const { remaining, limit } = await remainingToday(sessionUserId);
  if (remaining <= 0) {
    return NextResponse.json(
      { error: "Daily generation limit reached. Try again tomorrow.", remaining: 0, limit },
      { status: 429 }
    );
  }

  let task: { id: string; status: string };
  try {
    task = await prisma.aiVideoTask.create({
      data: {
        id: taskId,
        creatorId: sessionUserId,
        prompt,
        portraitPath: portraitPath || null,
        voicePath: voicePath || null,
        params: paramsResult.data,
      },
      select: { id: true, status: true },
    });
  } catch (error) {
    await deleteFromBucket(uploadedPaths);
    console.error("[ai-videos/tasks] JSON path db insert error", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }

  try {
    await submitTask(task.id);
  } catch (error) {
    // Provider errors are recorded on the task by submitTask itself; reaching here
    // means the database failed mid-submit.
    console.error("[ai-videos/tasks] submit error", {
      taskId: task.id,
      name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json({ error: "Failed to submit task" }, { status: 500 });
  }

  const submitted = await prisma.aiVideoTask.findUnique({
    where: { id: task.id },
    select: { id: true, status: true, errorMessage: true },
  });
  return NextResponse.json(submitted ?? { id: task.id, status: task.status, errorMessage: null });
}

/**
 * Legacy multipart path: unchanged, kept byte-for-byte as a rollback lever until every
 * caller has moved to the JSON + presigned-upload path above.
 */
async function handleMultipartTaskCreate(
  request: NextRequest,
  creatorId: string
): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const promptRaw = formData.get("prompt");
  const promptResult = promptSchema.safeParse(promptRaw);
  if (!promptResult.success) {
    return NextResponse.json({ error: "Prompt required" }, { status: 400 });
  }
  const prompt = promptResult.data;

  const portrait = formData.get("portrait");
  if (!(portrait instanceof File) || portrait.size === 0) {
    return NextResponse.json({ error: "Portrait image required" }, { status: 400 });
  }
  const portraitCheck = validatePortraitFile(portrait);
  if (!portraitCheck.ok) {
    return NextResponse.json({ error: portraitCheck.error }, { status: portraitCheck.status });
  }

  const voiceRaw = formData.get("voice");
  const voice = voiceRaw instanceof File && voiceRaw.size > 0 ? voiceRaw : null;
  const voiceCheck = validateVoiceFile(voice);
  if (!voiceCheck.ok) {
    return NextResponse.json({ error: voiceCheck.error }, { status: voiceCheck.status });
  }

  const taskId = createId();
  const portraitPath = buildPortraitPath(creatorId, taskId, portrait.type as PortraitMime);
  const voicePath = voice ? buildVoicePath(creatorId, taskId, voice.type as VoiceMime) : null;

  const uploadedPaths: string[] = [];

  try {
    await uploadToBucket(portraitPath, portrait, portrait.type);
    uploadedPaths.push(portraitPath);

    if (voice && voicePath) {
      await uploadToBucket(voicePath, voice, voice.type);
      uploadedPaths.push(voicePath);
    }

    const task = await prisma.aiVideoTask.create({
      data: {
        id: taskId,
        creatorId,
        prompt,
        portraitPath,
        voicePath,
      },
      select: { id: true, status: true },
    });

    return NextResponse.json({ id: task.id, status: task.status });
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await deleteFromBucket(uploadedPaths);
    }
    if (error instanceof SupabaseConfigError) {
      console.error("[ai-videos/tasks] supabase not configured");
      return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
    }
    if (error instanceof SupabaseUploadError) {
      console.error("[ai-videos/tasks] upload error", { path: error.path, message: error.message });
      return NextResponse.json({ error: "Storage upload failed" }, { status: 502 });
    }
    console.error("[ai-videos/tasks] db insert error", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const creatorId = session.user.id;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return handleJsonTaskCreate(request, creatorId);
  }

  return handleMultipartTaskCreate(request, creatorId);
}
