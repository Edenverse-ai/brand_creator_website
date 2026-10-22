import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PRODUCT_IMAGES_MAX } from "@/lib/ai-video-task";
import { getEntitlements, replicateSourceCeiling } from "@/lib/ai-video-entitlements";
import { remainingThisMonth, submitTask } from "@/lib/ai-video-generation";
import {
  SOURCE_DURATION_TOLERANCE_SEC,
  buildReplicateParams,
  buildReplicatePrompt,
  expectedOutputSeconds,
  replicateInputSchema,
} from "@/lib/seedance/replicate";
import { isOwnedTaskPath } from "@/lib/storage/path-ownership";
import { deleteFromBucket } from "@/lib/supabase-admin";

// Same charset + cap as the minting route's taskId (tasks/upload-url/route.ts).
const TASK_ID_MAX_LENGTH = 32;
const REFERENCE_VIDEO_FILE = /^reference-video\.(mp4|mov)$/;
const PRODUCT_IMAGE_FILE = /^product-[1-3]\.(jpg|png|webp)$/;

const Body = z.object({
  taskId: z
    .string()
    .regex(/^[a-z0-9]+$/, "Invalid taskId")
    .max(TASK_ID_MAX_LENGTH),
  reference_video_path: z.string().min(1),
  product_image_paths: z.array(z.string().min(1)).min(1).max(PRODUCT_IMAGES_MAX),
  input: z.unknown(),
});

function fileNameOf(path: string): string {
  return path.split("/").at(-1) ?? "";
}

/**
 * Trend replicate: the trending video and product images were already uploaded
 * direct-to-storage via POST /api/ai-videos/tasks/upload-url under one taskId.
 * Validates ownership, the creator's source-length ceiling and the replicate daily
 * cap, composes the prompt, writes the AiVideoTask row and submits it. Responds
 * like POST /api/ai-videos/tasks, so the client polls GET /api/ai-videos/tasks/[id].
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const creatorId = session.user.id;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { taskId } = parsed.data;
  const videoPath = parsed.data.reference_video_path.trim();
  const imagePaths = parsed.data.product_image_paths.map((path) => path.trim());
  const uploadedPaths = [videoPath, ...imagePaths];

  if (uploadedPaths.some((path) => !isOwnedTaskPath(path, creatorId, taskId))) {
    return NextResponse.json(
      { error: "Storage path does not belong to the current session" },
      { status: 403 }
    );
  }
  if (
    !REFERENCE_VIDEO_FILE.test(fileNameOf(videoPath)) ||
    !imagePaths.every((path) => PRODUCT_IMAGE_FILE.test(fileNameOf(path))) ||
    new Set(imagePaths).size !== imagePaths.length
  ) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const inputResult = replicateInputSchema.safeParse(parsed.data.input);
  if (!inputResult.success) {
    const productNameMissing = inputResult.error.issues.some(
      (issue) => issue.path[0] === "productName"
    );
    return NextResponse.json(
      { error: productNameMissing ? "Product name required" : "Invalid input" },
      { status: 400 }
    );
  }
  const input = inputResult.data;

  const entitlements = getEntitlements(session.user.email);
  const maxSec = replicateSourceCeiling(entitlements.replicate.maxSourceSec, input.mode);
  if (input.referenceDurationSec > maxSec + SOURCE_DURATION_TOLERANCE_SEC) {
    return NextResponse.json(
      { error: `The original video can be up to ${maxSec} seconds. Trim it and try again.` },
      { status: 400 }
    );
  }

  const { remaining, limit } = await remainingThisMonth(
    creatorId,
    "replicate",
    entitlements.replicate.monthlyLimit
  );
  if (remaining !== null && remaining <= 0) {
    return NextResponse.json(
      {
        error: `You've used this month's ${limit} free trend replicate${limit === 1 ? "" : "s"}. Try again next month.`,
        remaining: 0,
        limit,
      },
      { status: 429 }
    );
  }

  const params = buildReplicateParams(input);
  const prompt = buildReplicatePrompt(input, {
    imageCount: imagePaths.length,
    outputSeconds: expectedOutputSeconds(input.referenceDurationSec, maxSec),
    generateAudio: params.generateAudio,
  });

  try {
    await prisma.aiVideoTask.create({
      data: {
        id: taskId,
        creatorId,
        kind: "replicate",
        prompt,
        referenceVideoPath: videoPath,
        productImagePaths: imagePaths,
        replicateInput: {
          productName: input.productName,
          targetAudience: input.targetAudience,
          sellingPoints: input.sellingPoints,
          referenceDurationSec: input.referenceDurationSec,
        },
        params,
      },
      select: { id: true },
    });
  } catch (error) {
    await deleteFromBucket(uploadedPaths);
    console.error("[ai-videos/replicate] db insert error", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }

  try {
    await submitTask(taskId);
  } catch (error) {
    // Provider errors are recorded on the task by submitTask itself; reaching here
    // means the database failed mid-submit.
    console.error("[ai-videos/replicate] submit error", {
      taskId,
      name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json({ error: "Failed to submit task" }, { status: 500 });
  }

  const submitted = await prisma.aiVideoTask.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, errorMessage: true },
  });
  return NextResponse.json(submitted ?? { id: taskId, status: "QUEUED", errorMessage: null });
}
