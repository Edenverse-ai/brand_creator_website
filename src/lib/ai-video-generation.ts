import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { buildLibraryVideoPath } from "@/lib/ai-video-task";
import { createSignedUrl, uploadToAiVideoBucket } from "@/lib/supabase-admin-core";
import { buildFinalizeAuthHeaders } from "@/lib/ai-video-finalize-auth";
import { fetchWithTimeout } from "@/lib/tiktok/fetch-with-timeout";
import { getVideoProvider } from "@/lib/seedance";
import { mockProvider } from "@/lib/seedance/mock";
import { getDailyLimit, getSeedanceMode } from "@/lib/seedance/config";
import {
  CREATOR_MESSAGES,
  describeProviderFailure,
  describeSubmitError,
} from "@/lib/seedance/errors";
import { generationParamsSchema } from "@/lib/seedance/schema";
import type { VideoProvider } from "@/lib/seedance/types";

/**
 * Lifecycle of an automated generation task
 * (docs/superpowers/specs/2026-10-05-seedance-video-generation-design.md §5–6):
 *
 *   QUEUED ─submitTask─▶ GENERATING ─syncTask/finalizeTask─▶ DELIVERED
 *                │                 │
 *                └──────▶ FAILED ◀─┘
 *
 * The provider has no idempotency key, so every create call is billable. Two
 * atomic claims (`updateMany … where <claim> is null`) make the expensive steps
 * happen once no matter how many requests race: submitStartedAt guards the
 * create call, finalizeStartedAt guards the copy into the library.
 */

const REFERENCE_URL_TTL_SEC = 6 * 3600;
const GENERATION_TIMEOUT_MS = 75 * 60_000;
const FINALIZE_CLAIM_TTL_MS = 20 * 60_000;
const DISPATCH_TIMEOUT_MS = 10_000;
const LIBRARY_TAGS = JSON.stringify(["ai-generated"]);

function traceIdOf(error: unknown): string | null {
  const traceId = (error as { traceId?: unknown } | null)?.traceId;
  return typeof traceId === "string" ? traceId : null;
}

/** Tasks are resolved by the provider that created them, whatever the current config. */
function providerForTask(name: string | null): VideoProvider | null {
  if (name === "mock") return mockProvider;
  try {
    const provider = getVideoProvider();
    return provider.name === name ? provider : null;
  } catch {
    return null;
  }
}

export async function submitTask(taskId: string): Promise<void> {
  const claimed = await prisma.aiVideoTask.updateMany({
    where: { id: taskId, status: "QUEUED", submitStartedAt: null },
    data: { submitStartedAt: new Date() },
  });
  if (claimed.count === 0) return;

  const task = await prisma.aiVideoTask.findUniqueOrThrow({
    where: { id: taskId },
    select: { id: true, prompt: true, portraitPath: true, params: true },
  });
  const params = generationParamsSchema.parse(task.params ?? {});
  const mode = getSeedanceMode();

  let provider: VideoProvider | null = null;
  try {
    provider = getVideoProvider();

    let referenceImageUrl: string | null = null;
    if (task.portraitPath) {
      referenceImageUrl = await createSignedUrl(task.portraitPath, REFERENCE_URL_TTL_SEC);
      if (!referenceImageUrl) throw new Error("reference image could not be signed");
    }

    const created = await provider.createTask({
      prompt: task.prompt,
      mode,
      params,
      referenceImageUrl,
    });

    await prisma.aiVideoTask.update({
      where: { id: taskId },
      data: {
        status: "GENERATING",
        provider: provider.name,
        providerTaskId: created.taskId,
        traceId: created.traceId,
        params: { ...params, mode },
        lastCheckedAt: new Date(),
      },
    });
  } catch (error) {
    const { failureCode, message } = describeSubmitError(error);
    console.error("[ai-video-generation] submit failed", {
      taskId,
      failureCode,
      name: error instanceof Error ? error.name : typeof error,
      traceId: traceIdOf(error),
    });
    await prisma.aiVideoTask.update({
      where: { id: taskId },
      data: {
        status: "FAILED",
        failureCode,
        errorMessage: message,
        traceId: traceIdOf(error),
        provider: provider?.name ?? null,
      },
    });
  }
}

export async function syncTask(taskId: string): Promise<void> {
  const task = await prisma.aiVideoTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      status: true,
      provider: true,
      providerTaskId: true,
      submitStartedAt: true,
    },
  });
  if (!task || task.status !== "GENERATING" || !task.providerTaskId) return;

  const provider = providerForTask(task.provider);
  if (!provider) return;

  let status;
  try {
    status = await provider.getTaskStatus(task.providerTaskId);
  } catch (error) {
    console.error("[ai-video-generation] status lookup failed", {
      taskId,
      name: error instanceof Error ? error.name : typeof error,
    });
    return;
  }

  const now = new Date();

  if (status.state === "failed") {
    await prisma.aiVideoTask.updateMany({
      where: { id: taskId, status: "GENERATING" },
      data: {
        status: "FAILED",
        failureCode: "provider_failed",
        errorMessage: describeProviderFailure(status.error),
        traceId: status.traceId,
        lastCheckedAt: now,
      },
    });
    return;
  }

  if (status.state === "in_progress") {
    const submittedAt = task.submitStartedAt?.getTime() ?? now.getTime();
    if (now.getTime() - submittedAt > GENERATION_TIMEOUT_MS) {
      await prisma.aiVideoTask.updateMany({
        where: { id: taskId, status: "GENERATING" },
        data: {
          status: "FAILED",
          failureCode: "timeout",
          errorMessage: CREATOR_MESSAGES.timedOut,
          lastCheckedAt: now,
        },
      });
      return;
    }
    await prisma.aiVideoTask.update({ where: { id: taskId }, data: { lastCheckedAt: now } });
    return;
  }

  await prisma.aiVideoTask.update({ where: { id: taskId }, data: { lastCheckedAt: now } });
  await requestFinalize(taskId);
}

/**
 * On Netlify, hands the copy to the background function (15-minute budget);
 * elsewhere (local `next dev`) runs it inline. Same base-URL detection as
 * src/lib/tiktok/background-dispatch.ts.
 */
async function requestFinalize(taskId: string): Promise<void> {
  const base = process.env.DEPLOY_PRIME_URL || process.env.URL;
  if (!base) {
    await finalizeTask(taskId);
    return;
  }

  try {
    const res = await fetchWithTimeout(
      `${base.replace(/\/$/, "")}/.netlify/functions/ai-video-finalize-background`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildFinalizeAuthHeaders(taskId) },
        body: JSON.stringify({ taskId }),
      },
      DISPATCH_TIMEOUT_MS
    );
    if (res.status !== 202) {
      console.error("[ai-video-generation] finalize dispatch rejected", {
        taskId,
        status: res.status,
      });
    }
  } catch (error) {
    // The next poll or the scheduled sweep dispatches again.
    console.error("[ai-video-generation] finalize dispatch failed", {
      taskId,
      name: error instanceof Error ? error.name : typeof error,
    });
  }
}

export async function finalizeTask(taskId: string): Promise<void> {
  const now = new Date();
  const claimed = await prisma.aiVideoTask.updateMany({
    where: {
      id: taskId,
      status: "GENERATING",
      OR: [
        { finalizeStartedAt: null },
        { finalizeStartedAt: { lt: new Date(now.getTime() - FINALIZE_CLAIM_TTL_MS) } },
      ],
    },
    data: { finalizeStartedAt: now },
  });
  if (claimed.count === 0) return;

  const releaseClaim = () =>
    prisma.aiVideoTask.updateMany({
      where: { id: taskId, status: "GENERATING" },
      data: { finalizeStartedAt: null },
    });

  try {
    const task = await prisma.aiVideoTask.findUniqueOrThrow({
      where: { id: taskId },
      select: { id: true, creatorId: true, provider: true, providerTaskId: true },
    });
    const provider = providerForTask(task.provider);
    if (!provider || !task.providerTaskId) {
      await releaseClaim();
      return;
    }

    // Re-read the status for a fresh video URL rather than trusting a caller's.
    const status = await provider.getTaskStatus(task.providerTaskId);
    if (status.state !== "succeeded") {
      await releaseClaim();
      return;
    }

    const video = await provider.downloadVideo(status.videoUrl);
    const path = buildLibraryVideoPath(task.creatorId, task.id);
    await uploadToAiVideoBucket(path, video.bytes, "video/mp4");

    const aiVideoId = randomUUID();
    await prisma.$transaction([
      prisma.aiVideo.create({
        data: {
          id: aiVideoId,
          creator_id: task.creatorId,
          generated_time: now,
          video: path,
          tag: LIBRARY_TAGS,
        },
      }),
      prisma.aiVideoTask.update({
        where: { id: taskId },
        data: {
          status: "DELIVERED",
          aiVideoId,
          completionTokens: status.completionTokens,
          traceId: status.traceId,
          lastCheckedAt: now,
        },
      }),
    ]);
  } catch (error) {
    console.error("[ai-video-generation] finalize failed", {
      taskId,
      name: error instanceof Error ? error.name : typeof error,
    });
    await releaseClaim();
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Tasks that may have used provider tokens today (spec §6 "Daily cap counting").
 * QUEUED rows with a submit claim are in flight and count; failures the provider
 * doesn't charge for don't.
 */
export async function countTodayGenerations(creatorId: string): Promise<number> {
  return prisma.aiVideoTask.count({
    where: {
      creatorId,
      submitStartedAt: { gte: startOfUtcDay(new Date()) },
      OR: [
        { status: { in: ["QUEUED", "GENERATING", "IN_REVIEW", "DELIVERED"] } },
        { status: "FAILED", failureCode: "unknown_outcome" },
      ],
    },
  });
}

export async function remainingToday(
  creatorId: string
): Promise<{ remaining: number; limit: number }> {
  const limit = getDailyLimit();
  const used = await countTodayGenerations(creatorId);
  return { remaining: Math.max(0, limit - used), limit };
}
